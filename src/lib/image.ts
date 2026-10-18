"use client";

import type { FaceDetector } from "@mediapipe/tasks-vision";
import { signatureOf } from "./frame";

/** 送信前に縮小する長辺のピクセル数（AI の費用と通信量を抑える） */
const MAX_SIDE = 1280;

const MEDIAPIPE_VERSION = "1.1.0";
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

/** 顔と判定する確信度の下限。低いと食材や鍋を顔と取り違える */
const MIN_FACE_CONFIDENCE = 0.7;
/** 写真の短辺に対してこれより小さい検出は誤検出とみなす */
const MIN_FACE_RATIO = 0.05;

const BLUR_SETTING_KEY = "cookvision.faceBlur";

/** 顔の自動モザイクを使うか（端末ごとの設定。初期値はオン） */
export function getFaceBlurSetting(): boolean {
  try {
    return localStorage.getItem(BLUR_SETTING_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setFaceBlurSetting(on: boolean) {
  try {
    localStorage.setItem(BLUR_SETTING_KEY, on ? "on" : "off");
  } catch {
    // 保存できない環境では、毎回初期値（オン）になる
  }
}

let detectorPromise: Promise<FaceDetector | null> | null = null;

/** 顔検出器を1回だけ読み込む。読み込めなければ null */
function getFaceDetector(): Promise<FaceDetector | null> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      try {
        const { FaceDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
        const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
        return await FaceDetector.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: FACE_MODEL },
          runningMode: "IMAGE",
          minDetectionConfidence: MIN_FACE_CONFIDENCE,
        });
      } catch (e) {
        console.warn("顔検出器を読み込めませんでした", e);
        return null;
      }
    })();
  }
  return detectorPromise;
}

/** 画面表示の前に検出器の読み込みを始めておく */
export function preloadFaceDetector() {
  void getFaceDetector();
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("画像を読み込めませんでした"));
    };
    img.src = url;
  });
}

/** 指定範囲をモザイクにする */
function pixelate(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const block = Math.max(8, Math.round(Math.min(w, h) / 8));
  const sx = Math.max(0, Math.floor(x));
  const sy = Math.max(0, Math.floor(y));
  const sw = Math.min(ctx.canvas.width - sx, Math.ceil(w));
  const sh = Math.min(ctx.canvas.height - sy, Math.ceil(h));
  if (sw <= 0 || sh <= 0) return;
  const data = ctx.getImageData(sx, sy, sw, sh).data;
  for (let by = 0; by < sh; by += block) {
    for (let bx = 0; bx < sw; bx += block) {
      const i = (by * sw + bx) * 4;
      ctx.fillStyle = `rgb(${data[i]},${data[i + 1]},${data[i + 2]})`;
      ctx.fillRect(sx + bx, sy + by, Math.min(block, sw - bx), Math.min(block, sh - by));
    }
  }
}

export type PreparedPhoto = {
  blob: Blob;
  /** 顔の検出を実行できたか（顔が無かった場合も true） */
  faceBlurred: boolean;
  facesFound: number;
  /** 似た写真を間引くための特徴（16×16の明るさ） */
  signature: number[];
};

/**
 * 撮影した写真を送信用に整える。
 * 1. 長辺 1280px に縮小
 * 2. 端末内で顔を検出してモザイク（非機能要件：プライバシー）。blur: false なら行わない
 * 3. JPEG に変換
 */
export async function preparePhoto(file: File, opts: { blur?: boolean } = {}): Promise<PreparedPhoto> {
  const blur = opts.blur ?? true;
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("画像を処理できませんでした");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  let faceBlurred = false;
  let facesFound = 0;
  const detector = blur ? await getFaceDetector() : null;
  if (detector) {
    const minSide = Math.min(canvas.width, canvas.height) * MIN_FACE_RATIO;
    const result = detector.detect(canvas);
    for (const d of result.detections) {
      const b = d.boundingBox;
      if (!b || Math.min(b.width, b.height) < minSide) continue;
      facesFound += 1;
      // 検出枠より少し広めに隠す
      const padX = b.width * 0.25;
      const padY = b.height * 0.35;
      pixelate(ctx, b.originX - padX, b.originY - padY, b.width + padX * 2, b.height + padY * 2);
    }
    faceBlurred = true;
  }

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("画像を変換できませんでした"))), "image/jpeg", 0.82),
  );
  const signature = signatureOf(canvas, canvas.width, canvas.height);
  return { blob, faceBlurred, facesFound, signature };
}
