"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { getFaceBlurSetting, preloadFaceDetector, preparePhoto } from "@/lib/image";
import { CAPTURE_BUCKET, getSupabase } from "@/lib/supabase";
import type { Capture, CookingSession } from "@/lib/types";

type CaptureView = Capture & { url: string | null };

function elapsedLabel(fromIso: string, toIso: string) {
  const min = Math.max(0, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60000));
  return `${min}分`;
}

/** 撮影画面：F-02 セッション、F-03 写真撮影、F-04 メモ、F-05 解析の開始 */
export function CookClient() {
  const params = useSearchParams();
  const sessionId = params.get("session");
  const router = useRouter();
  const { user, session: auth } = useAuth();

  const [session, setSession] = useState<CookingSession | null>(null);
  const [captures, setCaptures] = useState<CaptureView[]>([]);
  const [title, setTitle] = useState("");
  const [uploading, setUploading] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [faceWarning, setFaceWarning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);
  // モザイクを外せるように、この画面を開いている間だけ元の写真を持っておく
  const originals = useRef(new Map<string, File>());
  const [faces, setFaces] = useState<Record<string, number>>({});
  const [unblurring, setUnblurring] = useState<string | null>(null);

  useEffect(() => {
    preloadFaceDetector();
  }, []);

  useEffect(() => {
    if (!user || !sessionId) return;
    const supabase = getSupabase();
    (async () => {
    const { data: s, error: e1 } = await supabase.from("cooking_sessions").select("*").eq("id", sessionId).single();
    if (e1 || !s) {
      setError("調理セッションが見つかりません");
      return;
    }
    setSession(s as CookingSession);
    setTitle(s.title ?? "");
    const { data: c } = await supabase
      .from("captures")
      .select("*")
      .eq("session_id", sessionId)
      .order("taken_at", { ascending: true });
    const rows = (c as Capture[]) ?? [];
    let urls: (string | null)[] = rows.map(() => null);
    if (rows.length > 0) {
      const { data: signed } = await supabase.storage
        .from(CAPTURE_BUCKET)
        .createSignedUrls(
          rows.map((r) => r.storage_path),
          60 * 60,
        );
      urls = rows.map((_, i) => signed?.[i]?.signedUrl ?? null);
    }
    setCaptures(rows.map((r, i) => ({ ...r, url: urls[i] })));
    })();
  }, [user, sessionId]);

  async function saveTitle() {
    if (!sessionId) return;
    await getSupabase().from("cooking_sessions").update({ title: title.trim() || null }).eq("id", sessionId);
  }

  async function addFiles(e: ChangeEvent<HTMLInputElement>, fromAlbum: boolean) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length || !user || !sessionId) return;
    setError(null);
    const supabase = getSupabase();
    for (const file of files) {
      setUploading((n) => n + 1);
      try {
        const blurOn = getFaceBlurSetting();
        const prepared = await preparePhoto(file, { blur: blurOn });
        if (blurOn && !prepared.faceBlurred) setFaceWarning(true);
        const path = `${user.id}/${sessionId}/${crypto.randomUUID()}.jpg`;
        const up = await supabase.storage
          .from(CAPTURE_BUCKET)
          .upload(path, prepared.blob, { contentType: "image/jpeg" });
        if (up.error) throw new Error(up.error.message);
        const takenAt = new Date(fromAlbum && file.lastModified ? file.lastModified : Date.now()).toISOString();
        const { data, error } = await supabase
          .from("captures")
          .insert({ session_id: sessionId, storage_path: path, taken_at: takenAt, face_blurred: prepared.faceBlurred })
          .select("*")
          .single();
        if (error || !data) throw new Error(error?.message ?? "写真を保存できませんでした");
        if (prepared.facesFound > 0) {
          originals.current.set(data.id, file);
          setFaces((f) => ({ ...f, [data.id]: prepared.facesFound }));
        }
        const url = URL.createObjectURL(prepared.blob);
        setCaptures((prev) =>
          [...prev, { ...(data as Capture), url }].sort(
            (a, b) => new Date(a.taken_at).getTime() - new Date(b.taken_at).getTime(),
          ),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "写真を保存できませんでした");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  async function saveNote(id: string, note: string) {
    await getSupabase().from("captures").update({ note: note.trim() || null }).eq("id", id);
  }

  /** モザイクを誤ってかけた写真を、元の写真で差し替える */
  async function unblur(c: CaptureView) {
    const file = originals.current.get(c.id);
    if (!file || !user || !sessionId) return;
    setUnblurring(c.id);
    setError(null);
    const supabase = getSupabase();
    try {
      const prepared = await preparePhoto(file, { blur: false });
      const path = `${user.id}/${sessionId}/${crypto.randomUUID()}.jpg`;
      const up = await supabase.storage.from(CAPTURE_BUCKET).upload(path, prepared.blob, { contentType: "image/jpeg" });
      if (up.error) throw new Error(up.error.message);
      const { error } = await supabase
        .from("captures")
        .update({ storage_path: path, face_blurred: false })
        .eq("id", c.id);
      if (error) throw new Error(error.message);
      await supabase.storage.from(CAPTURE_BUCKET).remove([c.storage_path]);
      originals.current.delete(c.id);
      setFaces((f) => {
        const next = { ...f };
        delete next[c.id];
        return next;
      });
      const url = URL.createObjectURL(prepared.blob);
      setCaptures((prev) => prev.map((x) => (x.id === c.id ? { ...x, storage_path: path, face_blurred: false, url } : x)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "モザイクを外せませんでした");
    } finally {
      setUnblurring(null);
    }
  }

  async function removeCapture(c: CaptureView) {
    const supabase = getSupabase();
    await supabase.storage.from(CAPTURE_BUCKET).remove([c.storage_path]);
    await supabase.from("captures").delete().eq("id", c.id);
    setCaptures((prev) => prev.filter((x) => x.id !== c.id));
  }

  async function finish() {
    if (!sessionId || !auth) return;
    setAnalyzing(true);
    setError(null);
    await saveTitle();
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.access_token}` },
        body: JSON.stringify({ sessionId }),
      });
      const body = (await res.json()) as { recipeId?: string; error?: string };
      if (!res.ok || !body.recipeId) throw new Error(body.error ?? "解析に失敗しました");
      router.push(`/recipe?id=${body.recipeId}&new=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "解析に失敗しました");
      setAnalyzing(false);
    }
  }

  // 経過時間の起点。アルバムの写真が開始より前なら、その時刻を起点にする（解析APIと同じ考え方）
  const origin = session
    ? new Date(
        Math.min(
          new Date(session.started_at).getTime(),
          captures[0] ? new Date(captures[0].taken_at).getTime() : Infinity,
        ),
      ).toISOString()
    : null;

  if (!sessionId) {
    return (
      <AppShell>
        <p className="card text-sm">
          調理セッションが指定されていません。<Link className="underline" href="/">ホームに戻る</Link>
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {analyzing && (
        <div className="fixed inset-0 z-20 grid place-items-center bg-ink/70 p-6 text-center text-white">
          <div>
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-white/30 border-t-white" />
            <p className="text-lg font-bold">AIがレシピを書いています</p>
            <p className="mt-1 text-sm text-white/80">写真{captures.length}枚を解析中。数十秒かかることがあります。</p>
          </div>
        </div>
      )}

      <div className="mb-4">
        <label className="label" htmlFor="title">料理名（空欄ならAIが付けます）</label>
        <input
          id="title"
          className="input text-lg font-bold"
          placeholder="例：豚の生姜焼き"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
        />
        {session && (
          <p className="mt-1 text-xs text-ink-soft">
            {new Date(session.started_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })} に開始
          </p>
        )}
      </div>

      <div className="mb-4 rounded-xl bg-mustard/15 p-3 text-xs leading-relaxed text-ink-soft">
        材料を並べたところ、切ったあと、火にかけたとき、火を止めたときに撮ると、分量と加熱時間が正確になります。
      </div>

      {faceWarning && (
        <p className="mb-3 rounded-xl bg-tomato/10 p-3 text-xs text-tomato">
          顔のモザイク処理を読み込めなかったため、モザイクなしで保存しました。人が写らないように撮ってください。
        </p>
      )}
      {error && <p className="mb-3 rounded-xl bg-tomato/10 p-3 text-sm text-tomato">{error}</p>}

      <ol className="space-y-3">
        {captures.map((c, i) => (
          <li key={c.id} className="card flex gap-3 p-3">
            <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-line">
              {c.url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.url} alt={`工程${i + 1}の写真`} className="h-full w-full object-cover" />
              )}
              <span className="absolute left-1 top-1 rounded-md bg-ink/75 px-1.5 text-[11px] font-bold text-white">
                {i + 1}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center justify-between text-xs text-ink-soft">
                <span>{origin ? `開始から${elapsedLabel(origin, c.taken_at)}` : ""}</span>
                <button onClick={() => removeCapture(c)} className="text-ink-soft hover:text-tomato">
                  削除
                </button>
              </div>
              {faces[c.id] > 0 && (
                <div className="mb-1 flex items-center justify-between rounded-lg bg-mustard/15 px-2 py-1 text-xs text-ink-soft">
                  <span>顔と判定した{faces[c.id]}箇所にモザイク</span>
                  <button
                    className="font-bold underline disabled:opacity-50"
                    disabled={unblurring === c.id}
                    onClick={() => unblur(c)}
                  >
                    {unblurring === c.id ? "処理中…" : "外す"}
                  </button>
                </div>
              )}
              <textarea
                className="input h-16 resize-none text-sm"
                placeholder="メモ（例：塩少々、中火）"
                defaultValue={c.note ?? ""}
                onBlur={(e) => saveNote(c.id, e.target.value)}
              />
            </div>
          </li>
        ))}
        {uploading > 0 && (
          <li className="card p-3 text-center text-sm text-ink-soft">写真を処理中…（{uploading}枚）</li>
        )}
        {captures.length === 0 && uploading === 0 && (
          <li className="card py-10 text-center text-sm text-ink-soft">下のボタンで、最初の工程を撮影してください。</li>
        )}
      </ol>

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => addFiles(e, false)} />
      <input ref={albumRef} type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e, true)} />

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-xl gap-2 px-4 py-3">
          <button className="btn-primary h-14 flex-[2] text-base" onClick={() => cameraRef.current?.click()}>
            撮影する
          </button>
          <button className="btn h-14 flex-1 whitespace-nowrap px-2" onClick={() => albumRef.current?.click()}>
            アルバム
          </button>
          <button
            className="btn h-14 flex-[1.4] border-ink bg-ink text-white hover:bg-ink/90"
            disabled={captures.length === 0 || uploading > 0 || analyzing}
            onClick={finish}
          >
            調理終了
          </button>
        </div>
      </div>
    </AppShell>
  );
}
