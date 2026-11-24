import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe";
import { getUserSubscription } from "@/lib/supabase-admin";

function json(status: number, body: unknown) {
  return Response.json(body, { status });
}

/** 写真の保存先（lib/supabase.ts の CAPTURE_BUCKET と同じ。あちらはブラウザ専用のため import しない） */
const CAPTURE_BUCKET = "captures";

/** Storage の一覧取得の1回あたりの上限 */
const PAGE = 1000;

/** prefix 以下のファイルのパスをすべて集める（フォルダは中まで辿る） */
async function listAllFiles(admin: SupabaseClient, prefix: string): Promise<string[]> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.storage.from(CAPTURE_BUCKET).list(prefix, { limit: PAGE, offset });
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    for (const item of data) {
      const path = `${prefix}/${item.name}`;
      // id が null のものはフォルダ（<user_id>/<session_id>/）
      if (item.id === null) paths.push(...(await listAllFiles(admin, path)));
      else paths.push(path);
    }
    if (data.length < PAGE) break;
  }
  return paths;
}

/**
 * 退会：ログイン中の本人の写真（Storage）を消してから、アカウントを消す。
 * テーブルの行（セッション・写真・レシピ・設定）は auth.users の削除で on delete cascade により消える。
 * アカウントの削除には管理用キーが要るため、ブラウザではなくここで行う。
 */
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return json(500, { error: "サーバーの設定が足りません" });

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "ログインが必要です" });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // トークンから本人を確かめる（他人の id を指定して消すことはできない）
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return json(401, { error: "ログインが必要です" });
  const userId = userData.user.id;

  try {
    const stripe = getStripe();
    if (stripe) {
      const sub = await getUserSubscription(admin, userId);
      if (sub?.stripe_subscription_id && sub.status !== "canceled") {
        await stripe.subscriptions.cancel(sub.stripe_subscription_id).catch((err) => {
          console.warn("[account/delete] stripe cancel failed:", err instanceof Error ? err.message : err);
        });
      }
    }

    const files = await listAllFiles(admin, userId);
    for (let i = 0; i < files.length; i += PAGE) {
      const { error } = await admin.storage.from(CAPTURE_BUCKET).remove(files.slice(i, i + PAGE));
      if (error) throw new Error(error.message);
    }

    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);

    return json(200, { ok: true });
  } catch (e) {
    console.error("[account/delete]", e instanceof Error ? e.message : e);
    return json(500, { error: "退会できませんでした" });
  }
}
