import { authenticateBearer, getAppOrigin, getStripe } from "@/lib/stripe";
import { getSupabaseAdmin, getUserSubscription } from "@/lib/supabase-admin";

function json(status: number, body: unknown) {
  return Response.json(body, { status });
}

/** CookVision Plus の Stripe Checkout セッションを作成する */
export async function POST(request: Request) {
  const stripe = getStripe();
  const priceId = process.env.STRIPE_PLUS_PRICE_ID?.trim();
  const admin = getSupabaseAdmin();
  if (!stripe || !priceId || !admin) {
    return json(503, { error: "決済機能はまだ設定されていません。" });
  }

  const user = await authenticateBearer(request);
  if (!user) return json(401, { error: "ログインが必要です。" });

  const existing = await getUserSubscription(admin, user.userId);
  if (existing && (existing.status === "active" || existing.status === "trialing")) {
    return json(400, { error: "すでに CookVision Plus に加入しています。" });
  }

  const origin = getAppOrigin(request);
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/settings?checkout=success`,
      cancel_url: `${origin}/settings?checkout=cancel`,
      client_reference_id: user.userId,
      ...(existing?.stripe_customer_id
        ? { customer: existing.stripe_customer_id }
        : user.email
          ? { customer_email: user.email }
          : {}),
      metadata: { user_id: user.userId },
      subscription_data: {
        metadata: { user_id: user.userId },
      },
    });

    if (!session.url) return json(500, { error: "決済ページのURLを作成できませんでした。" });
    return json(200, { url: session.url });
  } catch (e) {
    console.error("[stripe/checkout]", e instanceof Error ? e.message : e);
    return json(500, { error: "決済の開始に失敗しました。時間をおいてお試しください。" });
  }
}
