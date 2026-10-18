"use client";

import { useEffect, useRef, useState } from "react";
import { frameDiff, signatureOf } from "@/lib/frame";

/** 映像を調べる間隔 */
const SAMPLE_MS = 1000;
/** 自動撮影どうしの最短間隔 */
const MIN_INTERVAL_MS = 30_000;
/** 前に撮った写真からこれ以上変わったら「工程が進んだ」とみなす（0〜255） */
const CHANGE_THRESHOLD = 12;
/** 1秒前とこれ未満の差なら「動きが落ち着いた」とみなす */
const STABLE_THRESHOLD = 4;
/** 落ち着いた状態が何回続いたら撮るか */
const STABLE_SAMPLES = 2;

function grab(video: HTMLVideoElement): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("映像を取り込めませんでした"));
  ctx.drawImage(video, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(new File([b], `auto-${Date.now()}.jpg`, { type: "image/jpeg" })) : reject(new Error("映像を取り込めませんでした"))),
      "image/jpeg",
      0.9,
    ),
  );
}

/**
 * 自動撮影：スタンドに置いたスマホのカメラ映像を見て、
 * 映像が大きく変わり、動きが落ち着いたところで1枚撮る（最短30秒おき）。
 */
export function AutoCamera({
  onCapture,
  onClose,
  photoCount,
}: {
  onCapture: (file: File) => Promise<void>;
  onClose: () => void;
  photoCount: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onCaptureRef = useRef(onCapture);
  const [status, setStatus] = useState("カメラを準備中…");
  const [shots, setShots] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onCaptureRef.current = onCapture;
  }, [onCapture]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let wakeLock: WakeLockSentinel | null = null;
    let cancelled = false;
    let busy = false;
    let lastSaved: number[] | null = null;
    let lastSavedAt = 0;
    let prev: number[] | null = null;
    let stable = 0;

    async function tick() {
      const v = videoRef.current;
      if (!v || v.readyState < 2 || busy || !v.videoWidth) return;
      const sig = signatureOf(v, v.videoWidth, v.videoHeight);
      stable = prev && frameDiff(prev, sig) < STABLE_THRESHOLD ? stable + 1 : 0;
      prev = sig;
      const changed = !lastSaved || frameDiff(lastSaved, sig) > CHANGE_THRESHOLD;
      const waited = Date.now() - lastSavedAt >= MIN_INTERVAL_MS;
      if (!changed) return;
      if (!waited) {
        setStatus("変化あり。前の撮影から30秒たったら撮ります");
        return;
      }
      if (stable < STABLE_SAMPLES) {
        setStatus("動きが落ち着くのを待っています");
        return;
      }
      busy = true;
      try {
        const file = await grab(v);
        lastSaved = sig;
        lastSavedAt = Date.now();
        stable = 0;
        await onCaptureRef.current(file);
        setShots((n) => n + 1);
        setStatus(`${new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} に撮影しました`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "撮影できませんでした");
      } finally {
        busy = false;
      }
    }

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        await v.play();
        try {
          // 画面が消えるとカメラが止まるため、点けたままにする（対応ブラウザのみ）
          wakeLock = await navigator.wakeLock.request("screen");
        } catch {
          // 未対応でも撮影は続ける
        }
        setStatus("最初の1枚を撮るため、動きが落ち着くのを待っています");
        timer = window.setInterval(() => void tick(), SAMPLE_MS);
      } catch {
        setError("カメラを使えませんでした。ブラウザのカメラの許可を確認してください。");
      }
    })();

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
      wakeLock?.release().catch(() => {});
    };
  }, []);

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-ink text-white">
      <video ref={videoRef} className="min-h-0 flex-1 object-contain" playsInline muted autoPlay />
      <div className="space-y-2 p-4">
        {error ? (
          <p className="rounded-xl bg-tomato/20 p-3 text-sm">{error}</p>
        ) : (
          <p className="text-sm text-white/85">{status}</p>
        )}
        <p className="text-xs text-white/60">
          自動で{shots}枚撮影（この料理の写真は全部で{photoCount}枚）。画面を点けたまま、アプリを開いたままにしてください。
        </p>
        <button className="btn h-14 w-full border-white bg-white text-base text-ink" onClick={onClose}>
          自動撮影を止める
        </button>
      </div>
    </div>
  );
}
