/** MIME が空の動画も、スマートフォンで一般的な拡張子で判定する。 */
export function isVideoFile(file: Pick<File, "type" | "name">): boolean {
  return file.type.startsWith("video/") ||
    ((!file.type || file.type === "application/octet-stream") && /\.(mp4|mov|m4v|webm|ogv|3gp|3g2|mkv|avi)$/i.test(file.name));
}

/** 約10秒ごと。上限が少ない場合も動画の最初から最後までを均等に使う。 */
export function videoFrameOffsets(duration: number, maxFrames: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("動画の長さを取得できませんでした。");
  if (!Number.isInteger(maxFrames) || maxFrames < 1) throw new Error("写真が上限に達しています。不要な写真を削除してから動画を追加してください。");
  const count = Math.min(maxFrames, Math.max(1, Math.ceil(duration / 10) + 1));
  // 動画の終端ちょうどではフレームを取得できないブラウザがある。
  const last = Math.max(0, duration - Math.min(0.1, duration / 2));
  return Array.from({ length: count }, (_, i) => count === 1 ? last / 2 : last * i / (count - 1));
}

function waitForVideo(
  video: HTMLVideoElement,
  event: "loadeddata" | "seeked",
  signal: AbortSignal,
  start: () => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener(event, ready);
      video.removeEventListener("error", failed);
      signal.removeEventListener("abort", aborted);
    };
    const ready = () => { cleanup(); resolve(); };
    const failed = () => {
      cleanup();
      reject(new Error("この動画を読み込めませんでした。この端末で再生できるMP4などの動画を選んでください。"));
    };
    const aborted = () => { cleanup(); reject(new DOMException("取り込みを中止しました", "AbortError")); };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("動画の読み込みに時間がかかっています。端末に保存した動画で、もう一度お試しください。"));
    }, 30_000);
    video.addEventListener(event, ready);
    video.addEventListener("error", failed);
    signal.addEventListener("abort", aborted, { once: true });
    if (signal.aborted) { aborted(); return; }
    try { start(); } catch (error) { cleanup(); reject(error); }
  });
}

/** 動画は端末内だけで開き、1枚ずつ渡してメモリ使用量を抑える。 */
export async function* extractVideoFrames(file: File, maxFrames: number, signal: AbortSignal) {
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  const url = URL.createObjectURL(file);
  const canvas = document.createElement("canvas");
  try {
    await waitForVideo(video, "loadeddata", signal, () => { video.src = url; video.load(); });
    const offsets = videoFrameOffsets(video.duration, maxFrames);
    if (!video.videoWidth || !video.videoHeight) throw new Error("動画の映像を取得できませんでした。");
    const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("動画を写真に変換できませんでした。");
    for (const [index, offsetSec] of offsets.entries()) {
      signal.throwIfAborted();
      if (video.currentTime !== offsetSec) {
        await waitForVideo(video, "seeked", signal, () => { video.currentTime = offsetSec; });
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => b ? resolve(b) : reject(new Error("動画を写真に変換できませんでした。")), "image/jpeg", 0.9);
      });
      signal.throwIfAborted();
      yield {
        file: new File([blob], `${file.name}-${index + 1}.jpg`, { type: "image/jpeg" }),
        offsetSec,
        index,
        total: offsets.length,
      };
    }
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
    canvas.width = canvas.height = 0;
  }
}
