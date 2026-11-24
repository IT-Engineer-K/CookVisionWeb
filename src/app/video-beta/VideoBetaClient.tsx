"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { getFaceBlurSetting, preparePhoto } from "@/lib/image";
import { mp4Duration } from "@/lib/mp4";
import { isPlusSubscription, type SubscriptionRow } from "@/lib/subscription";
import { CAPTURE_BUCKET, getSupabase } from "@/lib/supabase";
import { extractVideoFrames } from "@/lib/video";
import { VIDEO_BETA_DAILY_LIMIT, VIDEO_BETA_MAX_BYTES, VIDEO_BETA_MAX_SECONDS, videoBetaEmail } from "@/lib/video-beta";

type VideoDraft = {
  recipeId: string;
  sessionId: string;
  steps: { id: string; offsetSec: number | null }[];
};

async function attachVideoFrames(file: File, draft: VideoDraft, userId: string) {
  const targets = draft.steps.filter((step): step is { id: string; offsetSec: number } => step.offsetSec !== null);
  if (!targets.length) return true;

  const supabase = getSupabase();
  const signal = AbortSignal.timeout(45_000);
  const blur = getFaceBlurSetting();
  const startedAt = Date.now();
  let complete = true;

  try {
    for await (const frame of extractVideoFrames(file, targets.length, signal, targets.map((step) => step.offsetSec))) {
      const { blob, faceBlurred } = await preparePhoto(frame.file, { blur });
      if (blur && !faceBlurred) {
        complete = false;
        break;
      }

      const id = crypto.randomUUID();
      const path = `${userId}/${draft.sessionId}/${id}.jpg`;
      const bucket = supabase.storage.from(CAPTURE_BUCKET);
      const { error: uploadError } = await bucket.upload(path, blob, { contentType: "image/jpeg" });
      if (uploadError) {
        complete = false;
        continue;
      }
      const { error: captureError } = await supabase.from("captures").insert({
        id,
        session_id: draft.sessionId,
        storage_path: path,
        taken_at: new Date(startedAt + frame.offsetSec * 1000).toISOString(),
        face_blurred: faceBlurred,
      });
      if (captureError) {
        await bucket.remove([path]);
        complete = false;
        continue;
      }
      const { error: linkError } = await supabase.from("recipe_steps")
        .update({ capture_id: id }).eq("id", targets[frame.index].id).select("id").single();
      if (linkError) {
        await supabase.from("captures").delete().eq("id", id);
        await bucket.remove([path]);
        complete = false;
      }
    }
  } catch {
    return false;
  }
  return complete;
}

export function VideoBetaClient() {
  const { user } = useAuth();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [withFrames, setWithFrames] = useState(true);
  const [isPlus, setIsPlus] = useState(false);
  const [planLoaded, setPlanLoaded] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const submitting = useRef(false);

  useEffect(() => {
    if (!user) return;
    getSupabase()
      .from("subscriptions")
      .select("status, current_period_end")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setIsPlus(isPlusSubscription(data as Pick<SubscriptionRow, "status" | "current_period_end"> | null));
        setPlanLoaded(true);
      });
  }, [user]);

  const canUseVideo = Boolean(videoBetaEmail(user) || isPlus);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !consent || !user || submitting.current) return;
    if (!/\.mp4$/i.test(file.name) && file.type !== "video/mp4") {
      setError("MP4動画を選んでください。");
      return;
    }
    if (file.size > VIDEO_BETA_MAX_BYTES) {
      setError("4 MB以下のMP4を選んでください。");
      return;
    }

    submitting.current = true;
    setError("");
    setStatus("動画の形式と長さを確認しています…");
    try {
      const duration = mp4Duration(new Uint8Array(await file.arrayBuffer()));
      if (duration === null) throw new Error("再生できる通常のMP4を書き出して選んでください。");
      if (duration < 0.1 || duration > VIDEO_BETA_MAX_SECONDS) {
        throw new Error(`0.1秒以上${VIDEO_BETA_MAX_SECONDS}秒以内のMP4を選んでください。`);
      }
      const { data: { session } } = await getSupabase().auth.getSession();
      if (!session || session.user.id !== user.id) throw new Error("ログインし直してください。");
      setStatus("動画を送信して解析しています…");
      const response = await fetch("/api/analyze-video", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "video/mp4",
          "X-Video-Consent": "1",
        },
        body: file,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.recipeId) {
        throw new Error(data?.error ?? "動画解析を完了できませんでした。写真解析も利用できます。");
      }
      const draft = data as VideoDraft;
      let complete = true;
      if (withFrames) {
        setStatus("下書きを保存しました。工程の写真を追加しています…");
        complete = await attachVideoFrames(file, draft, user.id);
      }
      router.replace(`/recipe?id=${encodeURIComponent(draft.recipeId)}&new=1${complete ? "" : "&videoFrames=partial"}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "動画解析を完了できませんでした。");
      setStatus("");
      submitting.current = false;
    }
  }

  return (
    <AppShell>
      <div className="card space-y-4">
        <Link href="/" className="text-sm underline">ホームへ戻る</Link>
        <h1 className="text-xl font-bold">動画解析β</h1>
        {!planLoaded && !videoBetaEmail(user) ? (
          <p className="text-sm text-ink-soft">利用状況を確認しています…</p>
        ) : !canUseVideo ? (
          <div className="space-y-2 text-sm">
            <p>CookVision Plus への加入、または確認済みの東京電機大学メール（@ms.dendai.ac.jp）でログインすると利用できます。</p>
            <Link href="/settings" className="btn-primary inline-block">設定画面でプランを見る</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-ink-soft">
              録画済みのMP4（{VIDEO_BETA_MAX_SECONDS}秒・4 MB以下）から、調理工程と動画内の時刻を記録します。
              無料で1日{VIDEO_BETA_DAILY_LIMIT}回まで。Geminiへの送信を開始した試行は失敗時も回数に含まれます。利用枠は日本時間の午前0時に更新されます。
            </p>
            <fieldset disabled={Boolean(status)} className="space-y-4">
              <label className="block space-y-1 text-sm font-bold">
                <span>調理動画</span>
                <input type="file" accept=".mp4,video/mp4" required className="input"
                  onChange={(e) => { setFile(e.target.files?.[0] ?? null); setConsent(false); setError(""); }} />
              </label>
              <p className="rounded-xl bg-mustard/15 p-3 text-sm">
                選んだ動画は、音声も含めて外部サービスのGoogle Geminiに送信されます。
                元の動画に顔のモザイク処理はかかりません。顔・氏名・会話など個人情報が含まれない動画を選んでください。
                無料枠では、Googleが送信内容をサービス改善に利用する場合があります。
                {" "}<a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noreferrer" className="underline">
                  Gemini APIの利用規約
                </a>
              </p>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={consent} required onChange={(e) => setConsent(e.target.checked)} />
                動画と音声をGoogle Geminiに送信することに同意します
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={withFrames} onChange={(e) => setWithFrames(e.target.checked)} />
                工程の時刻から切り出した写真を下書きに保存する
              </label>
              <button type="submit" className="btn-primary w-full" disabled={!file || !consent}>動画を送信して解析</button>
            </fieldset>
            {status && <p role="status" className="text-sm">{status}</p>}
            {error && <p role="alert" className="text-sm text-tomato">{error}</p>}
            <p className="text-sm text-ink-soft">動画が長い場合や上限に達した場合は、ホームから写真解析を利用できます。</p>
          </form>
        )}
      </div>
    </AppShell>
  );
}
