"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { getFaceBlurSetting, setFaceBlurSetting } from "@/lib/image";
import { isPlusSubscription, type SubscriptionRow } from "@/lib/subscription";
import { getSupabase } from "@/lib/supabase";

/** 設定：学習利用の同意（オプトイン）とログアウト */
export function SettingsClient() {
  const { user } = useAuth();
  const router = useRouter();
  const [allow, setAllow] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const checkout = new URLSearchParams(window.location.search).get("checkout");
    if (checkout === "success") return "お支払いが完了しました。反映まで数秒かかる場合があります。";
    if (checkout === "cancel") return "お支払いをキャンセルしました。";
    return null;
  });
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [billingBusy, setBillingBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // 端末の設定を読む（サーバー側では読めないため初期値のオンになる）
  const [faceBlur, setFaceBlur] = useState(getFaceBlurSetting);

  useEffect(() => {
    if (!user) return;
    const supabase = getSupabase();
    Promise.all([
      supabase.from("profiles").select("allow_training").eq("id", user.id).maybeSingle(),
      supabase.from("subscriptions").select("*").eq("user_id", user.id).maybeSingle(),
    ]).then(([profileRes, subRes]) => {
      setAllow(Boolean(profileRes.data?.allow_training));
      setSubscription((subRes.data as SubscriptionRow | null) ?? null);
      setLoaded(true);
    });
  }, [user]);

  const isPlus = isPlusSubscription(subscription);

  async function openBillingEndpoint(endpoint: "/api/stripe/checkout" | "/api/stripe/portal") {
    setBillingBusy(true);
    setMessage(null);
    const { data } = await getSupabase().auth.getSession();
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    }).catch(() => null);
    const body = await res?.json().catch(() => null);
    if (!res || !res.ok || !body?.url) {
      setBillingBusy(false);
      setMessage(body?.error ?? "決済ページを開けませんでした。時間をおいてお試しください。");
      return;
    }
    window.location.href = body.url;
  }

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

  /** 退会：サーバー側で写真・レシピ・アカウントを消してからログアウトする */
  async function deleteAccount() {
    if (!window.confirm("退会すると、写真とレシピがすべて削除され、元に戻せません。退会しますか？")) return;
    setDeleting(true);
    setMessage(null);
    const { data } = await getSupabase().auth.getSession();
    const res = await fetch("/api/account/delete", {
      method: "POST",
      headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    }).catch(() => null);
    if (!res || !res.ok) {
      setDeleting(false);
      setMessage("退会できませんでした。時間をおいてもう一度お試しください。");
      return;
    }
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

        <div className="card space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-ink-soft">プラン</p>
              <p className="font-bold">{isPlus ? "CookVision Plus" : "Free プラン"}</p>
            </div>
            {isPlus && (
              <span className="rounded-full bg-mustard/20 px-2.5 py-0.5 text-xs font-bold text-ink">
                {subscription?.cancel_at_period_end ? "解約予定" : "有効"}
              </span>
            )}
          </div>
          <p className="text-xs leading-relaxed text-ink-soft">
            {isPlus
              ? "動画解析機能を利用できます。"
              : "CookVision Plus にアップグレードすると、動画解析機能を利用できます。"}
          </p>
          {!isPlus ? (
            <button
              type="button"
              disabled={!loaded || billingBusy}
              onClick={() => openBillingEndpoint("/api/stripe/checkout")}
              className="btn-primary w-full"
            >
              {billingBusy ? "移動中…" : "CookVision Plus にアップグレード"}
            </button>
          ) : (
            <button
              type="button"
              disabled={!loaded || billingBusy}
              onClick={() => openBillingEndpoint("/api/stripe/portal")}
              className="btn w-full"
            >
              {billingBusy ? "移動中…" : "プラン・お支払い管理"}
            </button>
          )}
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
          試作版では、調理写真等の解析とレシピの下書きの生成に、Google の Gemini API を使っています。Googleによるデータの取扱いは、
          <Link href="/privacy" className="underline">プライバシーポリシー</Link>
          をご確認ください。顔の自動モザイクは設定で変更できますが、すべての顔を確実に処理するものではありません。
        </div>

        <button onClick={logout} className="btn w-full">
          ログアウト
        </button>

        <button
          onClick={deleteAccount}
          disabled={deleting}
          className="w-full py-2 text-center text-sm text-tomato underline disabled:opacity-50"
        >
          {deleting ? "退会処理中…" : "退会する（アカウントとデータを削除）"}
        </button>

        <p className="flex justify-center gap-4 pt-2 text-xs text-ink-soft">
          <Link href="/terms" className="underline">利用規約</Link>
          <Link href="/privacy" className="underline">プライバシーポリシー</Link>
        </p>
      </div>
    </AppShell>
  );
}
