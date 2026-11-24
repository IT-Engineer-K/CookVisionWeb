export type SubscriptionRow = {
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: string;
  price_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  updated_at: string;
};

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

/**
 * CookVision Plus として有効な契約状態かを判定する。
 * status が active / trialing であり、期限が設定されている場合は現在時刻より後であることを確認する。
 */
export function isPlusSubscription(
  subscription: Pick<SubscriptionRow, "status" | "current_period_end"> | null | undefined,
  nowMs?: number,
): boolean {
  if (!subscription || !ACTIVE_STATUSES.has(subscription.status)) return false;
  if (!subscription.current_period_end) return true;
  const endMs = Date.parse(subscription.current_period_end);
  return Number.isFinite(endMs) && endMs > (nowMs ?? Date.now());
}
