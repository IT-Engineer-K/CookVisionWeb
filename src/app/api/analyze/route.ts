import { createClient } from "@supabase/supabase-js";
import { analyzeCookingPhotos } from "@/lib/ai";
import type { AiPhoto } from "@/lib/ai/recipe-schema";

/** 1回の解析に使う写真の上限（費用と処理時間を抑える） */
const MAX_PHOTOS = 20;

// AI の解析は数十秒かかることがあるため、上限を長めにとる（Vercel の上限はプランで異なる）
export const maxDuration = 60;

type Body = { sessionId?: string };

function json(status: number, body: unknown) {
  return Response.json(body, { status });
}

/**
 * F-05 AI解析：セッションの写真からレシピ下書きを作って保存する。
 * ブラウザから受け取ったログイン中ユーザーのトークンで Supabase に接続するため、
 * 行単位のアクセス制御により本人のデータしか読めない。
 */
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return json(500, { error: "Supabase の環境変数が設定されていません" });

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "ログインが必要です" });

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return json(401, { error: "ログインが必要です" });

  const { sessionId } = (await request.json().catch(() => ({}))) as Body;
  if (!sessionId) return json(400, { error: "sessionId がありません" });

  const { data: session, error: sessionError } = await supabase
    .from("cooking_sessions")
    .select("id, title, started_at")
    .eq("id", sessionId)
    .single();
  if (sessionError || !session) return json(404, { error: "調理セッションが見つかりません" });

  const fail = async (message: string, status = 500) => {
    await supabase
      .from("cooking_sessions")
      .update({ status: "failed", error: message })
      .eq("id", sessionId);
    return json(status, { error: message });
  };

  try {
    await supabase
      .from("cooking_sessions")
      .update({ status: "analyzing", error: null, ended_at: new Date().toISOString() })
      .eq("id", sessionId);

    const { data: captures, error: capError } = await supabase
      .from("captures")
      .select("id, storage_path, taken_at, note")
      .eq("session_id", sessionId)
      .order("taken_at", { ascending: true })
      .limit(MAX_PHOTOS);
    if (capError) throw new Error(capError.message);
    if (!captures || captures.length === 0) return await fail("写真がありません。1枚以上撮影してください。", 400);

    // アルバムから選んだ写真はセッション開始より前の時刻を持つことがあるため、早い方を起点にする
    const startedAt = Math.min(
      new Date(session.started_at).getTime(),
      new Date(captures[0].taken_at).getTime(),
    );
    const photos: AiPhoto[] = [];
    for (const c of captures) {
      const { data: file, error } = await supabase.storage.from("captures").download(c.storage_path);
      if (error || !file) throw new Error(`写真を読み込めませんでした: ${error?.message ?? ""}`);
      const buf = Buffer.from(await file.arrayBuffer());
      photos.push({
        base64: buf.toString("base64"),
        mimeType: file.type || "image/jpeg",
        elapsedMin: Math.max(0, Math.round((new Date(c.taken_at).getTime() - startedAt) / 60000)),
        note: c.note,
      });
    }

    const result = await analyzeCookingPhotos(photos);
    const r = result.recipe;

    const { data: recipe, error: recipeError } = await supabase
      .from("recipes")
      .insert({
        session_id: sessionId,
        title: session.title?.trim() || r.title,
        servings: r.servings,
        description: r.description,
        ai_provider: result.provider,
        ai_model: result.model,
        ai_raw: r,
      })
      .select("id")
      .single();
    if (recipeError || !recipe) throw new Error(recipeError?.message ?? "レシピを保存できませんでした");

    if (r.ingredients.length > 0) {
      const { error } = await supabase.from("recipe_ingredients").insert(
        r.ingredients.map((ing, i) => ({
          recipe_id: recipe.id,
          position: i,
          name: ing.name,
          amount: ing.amount,
          unit: ing.unit,
          confidence: ing.confidence,
          ai_name: ing.name,
          ai_amount: ing.amount,
          ai_unit: ing.unit,
        })),
      );
      if (error) throw new Error(error.message);
    }

    if (r.steps.length > 0) {
      const { error } = await supabase.from("recipe_steps").insert(
        r.steps.map((s, i) => ({
          recipe_id: recipe.id,
          position: i,
          text: s.text,
          heat: s.heat,
          duration_min: s.duration_min,
          capture_id: s.photo_index != null ? (captures[s.photo_index]?.id ?? null) : null,
          confidence: s.confidence,
          ai_text: s.text,
        })),
      );
      if (error) throw new Error(error.message);
    }

    await supabase.from("cooking_sessions").update({ status: "done" }).eq("id", sessionId);
    return json(200, { recipeId: recipe.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "解析に失敗しました";
    console.error("[analyze]", message);
    return await fail(message);
  }
}
