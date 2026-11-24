import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { analyzeWithGeminiVideo, VideoAnalysisError } from "@/lib/ai/gemini-video";
import { mp4Duration } from "@/lib/mp4";
import { hasPlusAccess } from "@/lib/supabase-admin";
import { VIDEO_BETA_MAX_BYTES, VIDEO_BETA_MAX_SECONDS, videoBetaEmail } from "@/lib/video-beta";

export const maxDuration = 120;

const fail = (status: number, error: string) => Response.json({ error }, { status });
const tooLarge = () => fail(413, "4 MB以下のMP4を選んでください。");
const unavailable = () => fail(503, "動画解析βは現在利用できません。写真解析は利用できます。");
const auth = { persistSession: false, autoRefreshToken: false };

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) return fail(401, "ログインが必要です。");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey = process.env.VIDEO_BETA_GEMINI_API_KEY;
  if (!url || !anonKey || !serviceKey || !apiKey) return unavailable();

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth,
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return fail(401, "ログインし直してください。");

  const admin = createClient(url, serviceKey, { auth });
  const isPlus = await hasPlusAccess(admin, data.user.id);
  const email = videoBetaEmail(data.user);
  if (!isPlus && !email) {
    return fail(403, "CookVision Plus への加入、または確認済みの東京電機大学メール（@ms.dendai.ac.jp）が必要です。");
  }

  if (request.headers.get("x-video-consent") !== "1") return fail(400, "動画の送信に同意してください。");
  if (request.headers.get("content-type") !== "video/mp4" || !request.body) {
    return fail(415, "MP4動画を選んでください。");
  }
  if (Number(request.headers.get("content-length")) > VIDEO_BETA_MAX_BYTES) return tooLarge();

  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > VIDEO_BETA_MAX_BYTES) {
        await reader.cancel().catch(() => {});
        return tooLarge();
      }
      chunks.push(value);
    }
  } catch {
    return fail(400, "動画のアップロードを完了できませんでした。");
  } finally {
    reader.releaseLock();
  }

  const bytes = Buffer.concat(chunks, size);
  const duration = mp4Duration(bytes);
  if (duration === null) return fail(415, "再生できる通常のMP4を書き出して選んでください。");
  if (duration > VIDEO_BETA_MAX_SECONDS || duration < 0.1) {
    return fail(422, "0.1秒以上30秒以内のMP4を選んでください。");
  }

  // GoTrue also sets email_confirmed_at on signup when auto-confirm is enabled.
  if (!isPlus) {
    const settings = await fetch(`${url.replace(/\/$/, "")}/auth/v1/settings`, {
      headers: { apikey: anonKey },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    }).then((response) => response.ok ? response.json() : null).catch(() => null);
    if (settings?.mailer_autoconfirm !== false) return unavailable();
  }

  const quotaKey = isPlus ? `plus:${data.user.id}` : email!;
  const { data: reserved, error: quotaError } = await admin.rpc("reserve_video_beta_attempt", {
    email_hash: createHash("sha256").update(quotaKey).digest("hex"),
  });
  if (quotaError || typeof reserved !== "boolean") return unavailable();
  if (!reserved) return fail(429, "今日の動画βの利用上限に達しました。翌日（日本時間）か写真解析をお試しください。");

  try {
    const { recipe, model } = await analyzeWithGeminiVideo(bytes, duration, apiKey);
    const { data: saved, error: saveError } = await supabase.rpc("save_video_beta_recipe", { draft: recipe, model });
    if (saveError || !saved?.recipeId) {
      return fail(500, "動画は解析できましたが、下書きを保存できませんでした。");
    }
    return Response.json(saved);
  } catch (cause) {
    if (cause instanceof VideoAnalysisError) return fail(cause.status, cause.message);
    return fail(502, "動画解析を完了できませんでした。時間をおくか写真解析をお試しください。");
  }
}
