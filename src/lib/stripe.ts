import Stripe from "stripe";

let cachedStripe: Stripe | null = null;
let cachedKey: string | undefined;

/** サーバー専用の Stripe クライアント。STRIPE_SECRET_KEY が未設定なら null */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  if (!cachedStripe || cachedKey !== key) {
    cachedStripe = new Stripe(key);
    cachedKey = key;
  }
  return cachedStripe;
}

export function getAppOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return new URL(request.url).origin;
}

/** Bearer トークンから認証済みユーザーを取得する共通ヘルパー */
export async function authenticateBearer(
  request: Request,
): Promise<{ userId: string; email?: string } | null> {
  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return { userId: data.user.id, email: data.user.email };
}
