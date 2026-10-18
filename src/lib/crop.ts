import type { Crop } from "./types";

/** 枠の周りに足す余白（割合） */
const PAD = 0.05;
/** これより小さい枠は誤検出とみなして使わない */
const MIN_SIDE = 0.15;

/**
 * AI が返した box_2d（[ymin, xmin, ymax, xmax]、0〜1000）を切り抜き範囲に変換する。
 * おかしな値なら null（切り抜かずに元の写真を表示する）。
 */
export function boxToCrop(box: number[]): Crop | null {
  if (box.length !== 4 || box.some((v) => !Number.isFinite(v))) return null;
  const [ymin, xmin, ymax, xmax] = box.map((v) => Math.min(1000, Math.max(0, v)) / 1000);
  if (xmax - xmin < MIN_SIDE || ymax - ymin < MIN_SIDE) return null;
  const x = Math.max(0, xmin - PAD);
  const y = Math.max(0, ymin - PAD);
  const w = Math.min(1, xmax + PAD) - x;
  const h = Math.min(1, ymax + PAD) - y;
  // ほぼ全体なら切り抜く意味がない
  if (w > 0.95 && h > 0.95) return null;
  return { x, y, w, h };
}
