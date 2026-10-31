import Link from "next/link";
import type { ReactNode } from "react";
import { AppShell } from "./AppShell";

/** 利用規約・プライバシーポリシーの共通の枠（ログインなしで見られる） */
export function LegalPage({ title, enacted, children }: { title: string; enacted: string; children: ReactNode }) {
  return (
    <AppShell requireAuth={false}>
      <article className="legal card space-y-4 text-sm leading-relaxed">
        <header>
          <h1 className="text-xl font-bold">{title}</h1>
          <p className="mt-1 text-xs text-ink-soft">制定日：{enacted}</p>
        </header>
        {children}
      </article>
      <p className="mt-4 flex justify-center gap-4 text-xs text-ink-soft">
        <Link href="/terms" className="underline">利用規約</Link>
        <Link href="/privacy" className="underline">プライバシーポリシー</Link>
        <Link href="/" className="underline">トップへ</Link>
      </p>
    </AppShell>
  );
}

/** 条文の見出しと本文 */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-bold">{title}</h2>
      {children}
    </section>
  );
}

/** 番号付きの項 */
export function Items({ children }: { children: ReactNode }) {
  return <ol className="list-decimal space-y-1 pl-5">{children}</ol>;
}

/** 運営者と問い合わせ先（規約とポリシーで共通） */
export const OPERATOR = "船原滉樹";
export const CONTACT_EMAIL = "funahkonju@gmail.com";
