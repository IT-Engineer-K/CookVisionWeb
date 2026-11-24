import { authenticateBearer, getAppOrigin, getStripe } from "@/lib/stripe";
import { getSupabaseAdmin, getUserSubscription } from "@/lib/supabase-admin";

function json(status: number, body: unknown) {
  return Response.json(body, { status });
}

/** Stripe Customer Portal（解約・支払い方法変更）のセッションを作成する */
export async function POST(request: Request) {
  const stripe = getStripe();
  const admin = getSupabaseAdmin();
  if (!stripe || !admin) {
    return json(503, { error: "決済機能はまだ設定されていません。" });
  }

  const user = await authenticateBearer(request);
  if (!user) return json(401, { error: "ログインが必要です。" });

  const existing = await getUserSubscription(admin, user.userId);
  if (!existing?.stripe_customer_id) {
    return json(400, { error: "お支払い情報が見つかりません。" });
  }

  const origin = getAppOrigin(request);
  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: existing.stripe_customer_id,
      return_url: `${origin}/settings`,
    });
    return json(200, { url: portal.url });
  } catch (e) {
    console.error("[stripe/portal]", e instanceof Error ? e.message : e);
    return json(500, { error: "プラン管理画面を開けませんでした。" });
  }
}
