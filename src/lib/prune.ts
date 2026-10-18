import { frameDiff } from "./frame";

export type PruneItem = {
  id: string;
  source: "manual" | "auto";
  note: string | null;
  signature: number[] | null;
};

/**
 * 写真が max 枚を超えたとき、削る写真の id を返す（items は撮影順）。
 * 削れるのは「自動撮影・メモなし・最初と最後以外」だけ。
 * 前後どちらかの写真とほぼ同じもの（差が最小のもの）から1枚ずつ削る。
 */
export function pickToPrune(items: PruneItem[], max: number): string[] {
  const list = [...items];
  const removed: string[] = [];
  while (list.length > max) {
    let best = -1;
    let bestScore = Infinity;
    for (let i = 1; i < list.length - 1; i++) {
      const it = list[i];
      if (it.source !== "auto" || it.note || !it.signature) continue;
      const prev = list[i - 1].signature;
      const next = list[i + 1].signature;
      const score = Math.min(
        prev ? frameDiff(prev, it.signature) : 255,
        next ? frameDiff(it.signature, next) : 255,
      );
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best < 0) break;
    removed.push(list[best].id);
    list.splice(best, 1);
  }
  return removed;
}
