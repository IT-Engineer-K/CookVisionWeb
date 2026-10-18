"use client";

import { useEffect, useRef, useState } from "react";
import { contrastOf, signatureOf } from "@/lib/frame";

/** 撮影の間隔。工程の区切りは撮ったあとで似た写真を間引いて残す（src/lib/prune.ts） */
const INTERVAL_MS = 5000;
/** 明暗のばらつきがこれ未満の画面（スマホが倒れて真っ黒など）は撮らない */
const MIN_CONTRAST = 8;

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
 * 自動撮影：スタンドに置いたスマホのカメラで、5秒おきに1枚撮る。
 * 上限を超えた分は、呼び出し側で前後と似た写真から間引く。
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

    async function tick() {
      const v = videoRef.current;
      if (!v || v.readyState < 2 || busy || !v.videoWidth) return;
      const sig = signatureOf(v, v.videoWidth, v.videoHeight);
      if (contrastOf(sig) < MIN_CONTRAST) {
        setStatus("映像が暗いか、ほぼ一色です。スマホが倒れていないか確認してください");
        return;
      }
      busy = true;
      try {
        const file = await grab(v);
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
        setStatus("5秒おきに撮影します");
        timer = window.setInterval(() => void tick(), INTERVAL_MS);
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
