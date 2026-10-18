import * as z from "zod";

/**
 * AI に返させるレシピの形式。
 * どの AI サービスを使っても、最終的にこの形に揃える（運用AIの切り替えに備えるため）。
 */
const confidence = z.enum(["high", "medium", "low"]).catch("medium");

export const aiRecipeSchema = z.object({
  title: z.string().min(1).catch("無題のレシピ"),
  servings: z.coerce.number().int().positive().nullable().catch(null),
  description: z.string().nullable().catch(null),
  ingredients: z
    .array(
      z.object({
        name: z.string().min(1),
        amount: z
          .union([z.string(), z.number()])
          .transform((v) => String(v))
          .nullable()
          .catch(null),
        unit: z.string().nullable().catch(null),
        confidence,
      }),
    )
    .catch([]),
  steps: z
    .array(
      z.object({
        text: z.string().min(1),
        heat: z.string().nullable().catch(null),
        duration_min: z.coerce.number().nonnegative().nullable().catch(null),
        photo_index: z.coerce.number().int().nonnegative().nullable().catch(null),
        confidence,
      }),
    )
    .catch([]),
  crops: z
    .array(
      z.object({
        photo_index: z.coerce.number().int().nonnegative(),
        box_2d: z.array(z.coerce.number()).length(4),
      }),
    )
    .catch([]),
});

export type AiRecipe = z.infer<typeof aiRecipeSchema>;

/** AI に渡す1枚分の入力 */
export type AiPhoto = {
  /** base64（data: の接頭辞なし） */
  base64: string;
  mimeType: string;
  /** 調理開始からの経過秒 */
  elapsedSec: number;
  note: string | null;
};

export const RECIPE_PROMPT = `あなたは料理の記録係です。
これから渡すのは、1品の料理を作っている様子を工程ごとに撮った写真です。
写真は撮影順に並んでおり、それぞれに「調理開始からの経過時間」と、本人のメモ（ある場合）が付いています。
写真とメモから、この料理のレシピを日本語で推定してください。

ルール:
- 写真に写っていない食材を想像で足さない。調味料はメモや写真から読み取れる範囲で書く。
- 分量は写真から推定し、自信の程度を confidence（high / medium / low）で示す。見た目だけで決めた分量は low にする。
- 加熱時間は、加熱の開始と終了が写っている写真の経過時間の差から推定し、分で書く。わからなければ null。
- 各手順が主にどの写真に対応するかを photo_index（0始まり）で示す。
- 火加減は「弱火」「中火」「強火」などで書く。加熱しない手順は null。
- 各写真について、料理に関係する範囲（食材・調理器具・手元）を囲む枠を crops に入れる。枠は [ymin, xmin, ymax, xmax] で、写真の左上を0、右下を1000とした整数にする。

次のJSON形式だけを返してください。説明文やコードブロックは付けないでください。
{
  "title": "料理名",
  "servings": 人数（整数）または null,
  "description": "一言説明" または null,
  "ingredients": [
    { "name": "食材名", "amount": "分量の数値や表現" または null, "unit": "単位" または null, "confidence": "high|medium|low" }
  ],
  "steps": [
    { "text": "手順", "heat": "火加減" または null, "duration_min": 分 または null, "photo_index": 番号 または null, "confidence": "high|medium|low" }
  ],
  "crops": [
    { "photo_index": 番号, "box_2d": [ymin, xmin, ymax, xmax] }
  ]
}`;

/** AI の返答テキストから JSON を取り出して検証する */
export function parseAiRecipe(text: string): AiRecipe {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("AI の返答からレシピを読み取れませんでした");
  }
  const json: unknown = JSON.parse(trimmed.slice(start, end + 1));
  return aiRecipeSchema.parse(json);
}
