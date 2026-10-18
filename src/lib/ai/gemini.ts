import { RECIPE_PROMPT, parseAiRecipe, type AiPhoto, type AiRecipe } from "./recipe-schema";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  error?: { message?: string };
};

/** やり直す対象のステータス（混雑・一時的な障害） */
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
/** やり直す前に待つ時間。Vercel の上限（60秒）に収まるよう短めにする */
const RETRY_WAIT_MS = [2000, 5000];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Gemini の REST API で写真からレシピを推定する */
export async function analyzeWithGemini(
  photos: AiPhoto[],
): Promise<{ recipe: AiRecipe; model: string; raw: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
  if (!apiKey) throw new Error("GEMINI_API_KEY が設定されていません");

  const parts: GeminiPart[] = [{ text: RECIPE_PROMPT }];
  photos.forEach((p, i) => {
    const memo = p.note ? `、メモ「${p.note}」` : "";
    parts.push({ text: `写真${i}（開始から${p.elapsedMin}分${memo}）` });
    parts.push({ inline_data: { mime_type: p.mimeType, data: p.base64 } });
  });

  const body = JSON.stringify({
    contents: [{ role: "user", parts }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
  });

  // 混雑（429・503など）は一時的なことが多いので、少し待って最大2回やり直す
  let res: Response | null = null;
  let data: GeminiResponse = {};
  for (let attempt = 0; attempt <= RETRY_WAIT_MS.length; attempt++) {
    if (attempt > 0) await sleep(RETRY_WAIT_MS[attempt - 1]);
    try {
      res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body,
      });
    } catch {
      res = null;
      continue;
    }
    data = (await res.json().catch(() => ({}))) as GeminiResponse;
    if (res.ok || !RETRYABLE.has(res.status)) break;
  }

  if (!res) throw new Error("AIに接続できませんでした。通信を確認して、もう一度「調理終了」を押してください。");
  if (!res.ok) {
    if (RETRYABLE.has(res.status)) {
      throw new Error("AIが混み合っています。写真は保存されているので、少し待ってからもう一度「調理終了」を押してください。");
    }
    throw new Error(`Gemini API エラー（${res.status}）: ${data.error?.message ?? "不明"}`);
  }
  const raw =
    data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("") ?? "";
  if (!raw) throw new Error("Gemini から空の返答が返りました");

  return { recipe: parseAiRecipe(raw), model, raw };
}
