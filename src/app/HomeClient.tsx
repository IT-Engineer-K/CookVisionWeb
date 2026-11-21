"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { getSupabase } from "@/lib/supabase";
import type { CookingSession } from "@/lib/types";
import { videoBetaEmail } from "@/lib/video-beta";

type RecipeRow = {
  id: string;
  title: string;
  created_at: string;
  recipe_ingredients: { name: string }[];
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** ホーム：レシピ一覧と検索（F-08）、調理の開始（F-02） */
export function HomeClient({ videoBetaEnabled }: { videoBetaEnabled: boolean }) {
  const { user } = useAuth();
  const router = useRouter();
  const [recipes, setRecipes] = useState<RecipeRow[] | null>(null);
  const [openSessions, setOpenSessions] = useState<CookingSession[]>([]);
  const [query, setQuery] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const supabase = getSupabase();
    (async () => {
      const [r, s] = await Promise.all([
        supabase
          .from("recipes")
          .select("id, title, created_at, recipe_ingredients(name)")
          .order("created_at", { ascending: false }),
        supabase
          .from("cooking_sessions")
          .select("*")
          .in("status", ["capturing", "failed"])
          .order("started_at", { ascending: false })
          .limit(5),
      ]);
      if (r.error) setError(r.error.message);
      setRecipes((r.data as RecipeRow[]) ?? []);
      setOpenSessions((s.data as CookingSession[]) ?? []);
    })();
  }, [user]);

  const filtered = useMemo(() => {
    if (!recipes) return [];
    const q = query.trim().toLowerCase();
    if (!q) return recipes;
    return recipes.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.recipe_ingredients.some((i) => i.name.toLowerCase().includes(q)),
    );
  }, [recipes, query]);

  async function startCooking() {
    setStarting(true);
    setError(null);
    const { data, error } = await getSupabase()
      .from("cooking_sessions")
      .insert({})
      .select("id")
      .single();
    if (error || !data) {
      setError(error?.message ?? "調理を開始できませんでした");
      setStarting(false);
      return;
    }
    router.push(`/cook?session=${data.id}`);
  }

  return (
    <AppShell>
      <section className="mb-6 overflow-hidden rounded-2xl bg-ink p-5 text-white">
        <p className="text-xs font-bold tracking-widest text-mustard">撮るだけで、レシピになる</p>
        <h1 className="mt-1 text-xl font-bold leading-snug">今日の料理を、工程ごとに撮ってみましょう。</h1>
        <button onClick={startCooking} disabled={starting} className="btn-primary mt-4 w-full py-3 text-base">
          {starting ? "準備中…" : "調理をはじめる"}
        </button>
      </section>

      {videoBetaEnabled && videoBetaEmail(user) && (
        <Link href="/video-beta" className="card mb-6 block py-3 font-bold hover:border-tomato/40">
          動画解析β
        </Link>
      )}

      {error && <p className="mb-4 rounded-xl bg-tomato/10 p-3 text-sm text-tomato">{error}</p>}

      {openSessions.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-bold text-ink-soft">途中の調理</h2>
          <ul className="space-y-2">
            {openSessions.map((s) => (
              <li key={s.id}>
                <Link href={`/cook?session=${s.id}`} className="card flex items-center justify-between py-3">
                  <span className="font-bold">{s.title || "無題の調理"}</span>
                  <span className="text-xs text-ink-soft">
                    {s.status === "failed" ? "解析に失敗 · 再試行" : `${formatDate(s.started_at)} 開始 · 続ける`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-lg font-bold">わたしのレシピ</h2>
          {recipes && <span className="text-xs text-ink-soft">{recipes.length}件</span>}
        </div>
        <input
          className="input mb-3"
          placeholder="料理名・食材で検索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {recipes === null ? (
          <p className="py-8 text-center text-ink-soft">読み込み中…</p>
        ) : filtered.length === 0 ? (
          <p className="card py-8 text-center text-sm text-ink-soft">
            {recipes.length === 0 ? "まだレシピがありません。調理を撮影してみましょう。" : "見つかりませんでした。"}
          </p>
        ) : (
          <ul className="space-y-2">
            {filtered.map((r) => (
              <li key={r.id}>
                <Link href={`/recipe?id=${r.id}`} className="card block py-3 hover:border-tomato/40">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-bold">{r.title}</span>
                    <span className="shrink-0 text-xs text-ink-soft">{formatDate(r.created_at)}</span>
                  </div>
                  {r.recipe_ingredients.length > 0 && (
                    <p className="mt-1 truncate text-xs text-ink-soft">
                      {r.recipe_ingredients.map((i) => i.name).join("・")}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
