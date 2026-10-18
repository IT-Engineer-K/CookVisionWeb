"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { getFaceBlurSetting, setFaceBlurSetting } from "@/lib/image";
import { getSupabase } from "@/lib/supabase";

/** 設定：学習利用の同意（オプトイン）とログアウト */
export function SettingsClient() {
  const { user } = useAuth();
  const router = useRouter();
  const [allow, setAllow] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // 端末の設定を読む（サーバー側では読めないため初期値のオンになる）
  const [faceBlur, setFaceBlur] = useState(getFaceBlurSetting);

  useEffect(() => {
    if (!user) return;
    getSupabase()
      .from("profiles")
      .select("allow_training")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setAllow(Boolean(data?.allow_training));
        setLoaded(true);
      });
  }, [user]);

  async function toggle(next: boolean) {
    if (!user) return;
    setAllow(next);
    const { error } = await getSupabase().from("profiles").upsert({ id: user.id, allow_training: next });
    setMessage(error ? error.message : "保存しました");
  }

  async function logout() {
    await getSupabase().auth.signOut();
    router.replace("/login");
  }

  return (
    <AppShell>
      <h1 className="mb-4 text-xl font-bold">設定</h1>
      <div className="space-y-3">
        <div className="card">
          <p className="text-xs text-ink-soft">ログイン中</p>
          <p className="font-bold">{user?.email}</p>
        </div>

        <label className="card flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5 accent-tomato"
            checked={allow}
            disabled={!loaded}
            onChange={(e) => toggle(e.target.checked)}
          />
          <span>
            <span className="block font-bold">写真とレシピをAIの改善に使ってよい</span>
            <span className="mt-1 block text-xs leading-relaxed text-ink-soft">
              オンにすると、あなたが撮った写真と修正したレシピを、CookVision のAIの精度向上に使うことがあります。オフのままなら使いません。
            </span>
          </span>
        </label>
        <label className="card flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5 accent-tomato"
            checked={faceBlur}
            onChange={(e) => {
              setFaceBlur(e.target.checked);
              setFaceBlurSetting(e.target.checked);
            }}
          />
          <span>
            <span className="block font-bold">人の顔に自動でモザイクをかける</span>
            <span className="mt-1 block text-xs leading-relaxed text-ink-soft">
              この端末だけの設定です。オフにすると、顔が写った写真もそのまま保存・解析に送られます。
            </span>
          </span>
        </label>
        {message && <p className="text-sm text-ink-soft">{message}</p>}

        <div className="card text-xs leading-relaxed text-ink-soft">
          試作版では、写真の解析に Google の Gemini API（無料枠）を使っています。無料枠では、送信した画像が Google
          のサービス改善に使われることがあります。人の顔は送信前に端末でモザイク処理しています。
        </div>

        <button onClick={logout} className="btn w-full">
          ログアウト
        </button>
      </div>
    </AppShell>
  );
}
