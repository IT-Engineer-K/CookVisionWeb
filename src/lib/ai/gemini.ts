import { RECIPE_PROMPT, parseAiRecipe, type AiPhoto, type AiRecipe } from "./recipe-schema";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  error?: { message?: string };
};

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

  const res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
    }),
  });

  const data = (await res.json()) as GeminiResponse;
  if (!res.ok) {
    throw new Error(`Gemini API エラー（${res.status}）: ${data.error?.message ?? "不明"}`);
  }
  const raw =
    data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("") ?? "";
  if (!raw) throw new Error("Gemini から空の返答が返りました");

  return { recipe: parseAiRecipe(raw), model, raw };
}
