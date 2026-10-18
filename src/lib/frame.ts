/** 写真や映像の「特徴」：16×16 に縮めた明るさ。似ているかどうかの比較だけに使う */
export const SIGNATURE_SIZE = 16;

let canvas: HTMLCanvasElement | null = null;

/** 画像（canvas、video、img）から特徴を計算する */
export function signatureOf(src: CanvasImageSource, width: number, height: number): number[] {
  const S = SIGNATURE_SIZE;
  canvas ??= document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(src, 0, 0, width, height, 0, 0, S, S);
  const d = ctx.getImageData(0, 0, S, S).data;
  const out: number[] = new Array(S * S);
  for (let i = 0; i < S * S; i++) {
    out[i] = Math.round(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]);
  }
  return out;
}

/** 差を測るときに使う「変化の大きい部分」の割合 */
const TOP_FRACTION = 0.1;

/**
 * 2つの特徴の差（0〜255）。
 * - カメラの明るさの自動調整に引きずられないよう、それぞれの平均の明るさを引いてから比べる。
 * - 水を注ぐなど画面の一部だけの変化を拾うため、全体の平均ではなく、差が大きい上位10%の部分の平均をとる。
 */
export function frameDiff(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 255;
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const ma = mean(a);
  const mb = mean(b);
  const diffs = a.map((x, i) => Math.abs(x - ma - (b[i] - mb))).sort((p, q) => q - p);
  const k = Math.max(1, Math.round(diffs.length * TOP_FRACTION));
  let sum = 0;
  for (let i = 0; i < k; i++) sum += diffs[i];
  return sum / k;
}

/** 特徴の明暗のばらつき（標準偏差）。真っ黒や真っ白など、ほぼ一色の画面で小さくなる */
export function contrastOf(sig: number[]): number {
  if (sig.length === 0) return 0;
  const m = sig.reduce((s, x) => s + x, 0) / sig.length;
  return Math.sqrt(sig.reduce((s, x) => s + (x - m) ** 2, 0) / sig.length);
}
