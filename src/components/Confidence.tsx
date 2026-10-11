import type { Confidence } from "@/lib/types";

const LABEL: Record<Confidence, string> = {
  high: "",
  medium: "推定",
  low: "要確認",
};

/** F-06 AI の自信が低い項目に印を付ける */
export function ConfidenceBadge({ value }: { value: Confidence }) {
  if (value === "high") return null;
  return (
    <span
      className={
        value === "low"
          ? "shrink-0 rounded-full bg-tomato/15 px-2 py-0.5 text-[11px] font-bold text-tomato"
          : "shrink-0 rounded-full bg-mustard/25 px-2 py-0.5 text-[11px] font-bold text-ink-soft"
      }
      title={value === "low" ? "AIの自信が低い項目です。確認してください" : "AIが推定した項目です"}
    >
      {LABEL[value]}
    </span>
  );
}
