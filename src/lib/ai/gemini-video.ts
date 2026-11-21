import { aiRecipeSchema, parseAiRecipeJson } from "./recipe-schema";
import * as z from "zod";
import { VIDEO_BETA_MAX_STEPS } from "../video-beta";

const MODEL = "gemini-3.1-flash-lite";
const schema = aiRecipeSchema.omit({ crops: true, steps: true }).extend({
  steps: z.array(aiRecipeSchema.shape.steps.unwrap().element.omit({ photo_index: true }).extend({
    video_offset_sec: z.number().nonnegative().nullable().catch(null),
  })).min(1).max(VIDEO_BETA_MAX_STEPS),
});

const prompt = `調理動画から、見えている作業だけを時系列で日本語のレシピ下書きにしてください。
短い作業（材料を入れる、混ぜ始める、火を止める等）も見えたら別工程にし、最大${VIDEO_BETA_MAX_STEPS}工程にまとめてください。
video_offset_sec はその工程が画面で一番よく見える、動画の先頭からの秒数（小数可）。不明なら null。
食材や火加減を想像で補わない。推定の分量は low。加熱時間は実際に分かるときだけ分で記載。
工程が確認できないときは steps を空にしてください。出力は次の構造のJSONのみ。
{"title":"料理名","servings":null,"description":null,"ingredients":[{"name":"食材名","amount":null,"unit":null,"confidence":"low"}],"steps":[{"text":"手順","heat":null,"duration_min":null,"confidence":"medium","video_offset_sec":0.5}]}`;

export class VideoAnalysisError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function analyzeWithGeminiVideo(bytes: Buffer, duration: number, apiKey: string) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    signal: AbortSignal.timeout(80_000),
    body: JSON.stringify({
      contents: [{ role: "user", parts: [
        {
          inlineData: { mimeType: "video/mp4", data: bytes.toString("base64") },
          videoMetadata: { fps: 2, endOffset: `${Math.floor(duration * 1000) / 1000}s` },
        },
        { text: prompt },
      ] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2, maxOutputTokens: 4096 },
    }),
  });
  if (response.status === 429 || response.status >= 500) {
    throw new VideoAnalysisError("Geminiの無料枠の上限または一時的な混雑です。時間をおいてお試しください。", 503);
  }
  if (!response.ok) throw new VideoAnalysisError("Geminiが動画を受け付けませんでした。別のMP4か写真解析をお試しください。", 502);

  const data = await response.json() as {
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  };
  const raw = data.candidates?.[0]?.content?.parts?.filter((part) => !part.thought)
    .map((part) => part.text ?? "").join("") ?? "";
  try {
    const recipe = schema.parse(parseAiRecipeJson(raw));
    return {
      model: MODEL,
      recipe: {
        ...recipe,
        steps: recipe.steps.map((step) => ({
          ...step,
          video_offset_sec: step.video_offset_sec !== null && step.video_offset_sec < duration
            ? step.video_offset_sec : null,
        })),
      },
    };
  } catch {
    throw new VideoAnalysisError("動画から調理工程を読み取れませんでした。手元が映った短い動画か写真解析をお試しください。", 422);
  }
}
