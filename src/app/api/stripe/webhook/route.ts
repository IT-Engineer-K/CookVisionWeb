import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

function extractPeriodEndIso(sub: Stripe.Subscription): string | null {
  const raw =
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    sub.items.data[0]?.current_period_end ??
    null;
  return typeof raw === "number" ? new Date(raw * 1000).toISOString() : null;
}

async function syncSubscription(sub: Stripe.Subscription, fallbackUserId?: string | null) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Supabase admin client is not configured");

  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  let userId = sub.metadata?.user_id || fallbackUserId || null;

  if (!userId) {
    const { data } = await admin
      .from("subscriptions")
      .select("user_id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    userId = data?.user_id ?? null;
  }

  if (!userId) {
    console.warn("[stripe/webhook] user_id not found for subscription", sub.id);
    return;
  }

  const { error } = await admin.from("subscriptions").upsert({
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    status: sub.status,
    price_id: sub.items.data[0]?.price?.id ?? null,
    current_period_end: extractPeriodEndIso(sub),
    cancel_at_period_end: Boolean(sub.cancel_at_period_end),
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

/** Stripe Webhook を検証し、Supabase の subscriptions テーブルを同期する */
export async function POST(request: Request) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!stripe || !webhookSecret) {
    return Response.json({ error: "Webhook is not configured" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return Response.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (e) {
    console.warn("[stripe/webhook] signature verification failed:", e instanceof Error ? e.message : e);
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.subscription) {
          const subId = typeof session.subscription === "string"
            ? session.subscription
            : session.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subId);
          const userId = session.client_reference_id ?? session.metadata?.user_id ?? null;
          await syncSubscription(sub, userId);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await syncSubscription(sub);
        break;
      }
      default:
        break;
    }
    return Response.json({ received: true });
  } catch (e) {
    console.error("[stripe/webhook] handler error:", e instanceof Error ? e.message : e);
    return Response.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
