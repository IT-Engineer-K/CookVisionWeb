import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isPlusSubscription, type SubscriptionRow } from "./subscription";

const auth = { persistSession: false, autoRefreshToken: false };

/** サーバー専用の管理クライアント（service_role）。未設定なら null */
export function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth });
}

export async function getUserSubscription(admin: SupabaseClient, userId: string): Promise<SubscriptionRow | null> {
  const { data, error } = await admin
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as SubscriptionRow;
}

export async function hasPlusAccess(admin: SupabaseClient, userId: string): Promise<boolean> {
  const sub = await getUserSubscription(admin, userId);
  return isPlusSubscription(sub);
}
