import { analyzeWithGemini } from "./gemini";
import type { AiPhoto, AiRecipe } from "./recipe-schema";

export type AnalyzeResult = {
  recipe: AiRecipe;
  provider: string;
  model: string;
  raw: string;
};

/**
 * AI 呼び出しの入口。ここ以外から AI サービスを直接呼ばない。
 * 運用で OpenAI などに切り替えるときは、ここに分岐を足す。
 */
export async function analyzeCookingPhotos(photos: AiPhoto[]): Promise<AnalyzeResult> {
  const provider = process.env.AI_PROVIDER || "gemini";
  switch (provider) {
    case "gemini": {
      const r = await analyzeWithGemini(photos);
      return { ...r, provider };
    }
    default:
      throw new Error(`未対応の AI_PROVIDER です: ${provider}`);
  }
}
