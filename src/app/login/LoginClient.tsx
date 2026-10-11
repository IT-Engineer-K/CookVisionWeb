"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { getSupabase } from "@/lib/supabase";

/** F-01 アカウント：メールまたは Google で登録・ログイン */
export function LoginClient() {
  const { user } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "info"; text: string } | null>(null);

  useEffect(() => {
    if (user) router.replace("/");
  }, [user, router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const supabase = getSupabase();
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage({ kind: "error", text: "メールアドレスかパスワードが違います。" });
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) setMessage({ kind: "error", text: error.message });
      else if (!data.session)
        setMessage({ kind: "info", text: "確認メールを送りました。メール内のリンクを開いてからログインしてください。" });
    }
    setBusy(false);
  }

  async function google() {
    const { error } = await getSupabase().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) setMessage({ kind: "error", text: error.message });
  }

  return (
    <AppShell requireAuth={false}>
      <div className="card mx-auto mt-6 max-w-sm space-y-4">
        <div>
          <h1 className="text-xl font-bold">{mode === "signin" ? "ログイン" : "アカウント作成"}</h1>
          <p className="mt-1 text-sm text-ink-soft">撮った写真とレシピは、あなただけが見られます。</p>
        </div>

        <button onClick={google} className="btn w-full">
          Googleで続ける
        </button>

        <div className="flex items-center gap-3 text-xs text-ink-soft">
          <span className="h-px flex-1 bg-line" />
          または
          <span className="h-px flex-1 bg-line" />
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="label" htmlFor="email">メールアドレス</label>
            <input id="email" type="email" required autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="password">パスワード（6文字以上）</label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? "送信中…" : mode === "signin" ? "ログイン" : "登録する"}
          </button>
        </form>

        {message && (
          <p className={message.kind === "error" ? "text-sm text-tomato" : "text-sm text-basil"}>{message.text}</p>
        )}

        <button
          className="w-full text-center text-sm text-ink-soft underline"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setMessage(null);
          }}
        >
          {mode === "signin" ? "はじめての方はこちら（アカウント作成）" : "アカウントをお持ちの方はこちら"}
        </button>
      </div>
    </AppShell>
  );
}
