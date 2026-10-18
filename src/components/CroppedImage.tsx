"use client";

import { useState } from "react";
import type { Crop } from "@/lib/types";

/**
 * 正方形の枠に、写真の crop 範囲を中心として表示する。
 * crop が無ければ通常の object-cover 表示。元の写真は加工しない。
 */
export function CroppedImage({ src, crop, className }: { src: string; crop: Crop | null; className?: string }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  let style: React.CSSProperties | undefined;
  if (crop && size) {
    // 範囲を含む正方形（ピクセル単位）を作り、写真からはみ出さないよう寄せる
    const side = Math.min(Math.max(crop.w * size.w, crop.h * size.h), size.w, size.h);
    const cx = (crop.x + crop.w / 2) * size.w;
    const cy = (crop.y + crop.h / 2) * size.h;
    const left = Math.min(Math.max(0, cx - side / 2), size.w - side);
    const top = Math.min(Math.max(0, cy - side / 2), size.h - side);
    style = {
      position: "absolute",
      maxWidth: "none",
      width: `${(size.w / side) * 100}%`,
      height: `${(size.h / side) * 100}%`,
      left: `${(-left / side) * 100}%`,
      top: `${(-top / side) * 100}%`,
    };
  }

  return (
    <div className={`relative overflow-hidden ${className ?? ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
        className={style ? "" : "h-full w-full object-cover"}
        style={style}
      />
    </div>
  );
}
