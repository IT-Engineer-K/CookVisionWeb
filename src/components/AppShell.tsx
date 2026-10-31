"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useAuth } from "./AuthProvider";

function Header() {
  const { user } = useAuth();
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
          {/* eslint-disable-next-line @next/next/no-img-element -- 小さな静的SVGなので最適化は不要 */}
          <img src="/icon.svg" alt="" width={28} height={28} className="h-7 w-7 rounded-lg" />
          CookVision
        </Link>
        {user && (
          <Link href="/settings" className="text-sm text-ink-soft hover:text-ink">
            設定
          </Link>
        )}
      </div>
    </header>
  );
}

function SetupNotice() {
  return (
    <div className="card space-y-3">
      <h1 className="text-lg font-bold">セットアップが必要です</h1>
      <p className="text-sm text-ink-soft">
        Supabase の接続先が設定されていません。プロジェクト直下に <code>.env.local</code> を作り、
        <code>.env.example</code> を参考に値を入れてから、開発サーバーを再起動してください。
      </p>
      <p className="text-sm text-ink-soft">手順は README.md の「セットアップ」にあります。</p>
    </div>
  );
}

/**
 * 全画面共通の枠。
 * requireAuth のページは、未ログインならログイン画面へ移動する。
 */
export function AppShell({
  children,
  requireAuth = true,
}: {
  children: ReactNode;
  requireAuth?: boolean;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (requireAuth && isSupabaseConfigured && !loading && !user) {
      router.replace("/login");
    }
  }, [requireAuth, loading, user, router]);

  let body: ReactNode = children;
  if (!isSupabaseConfigured) body = <SetupNotice />;
  else if (requireAuth && (loading || !user)) body = <p className="py-16 text-center text-ink-soft">読み込み中…</p>;

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 pb-28 pt-5">{body}</main>
    </>
  );
}
