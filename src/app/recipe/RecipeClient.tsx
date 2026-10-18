"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { ConfidenceBadge } from "@/components/Confidence";
import { CAPTURE_BUCKET, getSupabase } from "@/lib/supabase";
import type { Recipe, RecipeIngredient, RecipeStep } from "@/lib/types";

type IngDraft = Omit<RecipeIngredient, "id" | "recipe_id" | "position"> & { key: string };
type StepDraft = Omit<RecipeStep, "id" | "recipe_id" | "position"> & { key: string };

const newKey = () => crypto.randomUUID();

/** レシピ画面：F-06 確信度の表示、F-07 編集、F-08 保存 */
export function RecipeClient() {
  const params = useSearchParams();
  const id = params.get("id");
  const isNew = params.get("new") === "1";
  const router = useRouter();
  const { user } = useAuth();

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [title, setTitle] = useState("");
  const [servings, setServings] = useState("");
  const [description, setDescription] = useState("");
  const [ingredients, setIngredients] = useState<IngDraft[]>([]);
  const [steps, setSteps] = useState<StepDraft[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: "error" | "info"; text: string } | null>(null);

  useEffect(() => {
    if (!user || !id) return;
    const supabase = getSupabase();
    (async () => {
      const { data: r, error } = await supabase.from("recipes").select("*").eq("id", id).single();
      if (error || !r) {
        setNotice({ kind: "error", text: "レシピが見つかりません" });
        return;
      }
      const [ing, st] = await Promise.all([
        supabase.from("recipe_ingredients").select("*").eq("recipe_id", id).order("position"),
        supabase.from("recipe_steps").select("*").eq("recipe_id", id).order("position"),
      ]);
      setRecipe(r as Recipe);
      setTitle(r.title);
      setServings(r.servings ? String(r.servings) : "");
      setDescription(r.description ?? "");
      setIngredients(((ing.data as RecipeIngredient[]) ?? []).map((x) => ({ ...x, key: x.id })));
      const stepRows = (st.data as RecipeStep[]) ?? [];
      setSteps(stepRows.map((x) => ({ ...x, key: x.id })));

      const captureIds = stepRows.map((s) => s.capture_id).filter((v): v is string => Boolean(v));
      if (captureIds.length > 0) {
        const { data: caps } = await supabase.from("captures").select("id, storage_path").in("id", captureIds);
        if (caps && caps.length > 0) {
          const { data: signed } = await supabase.storage
            .from(CAPTURE_BUCKET)
            .createSignedUrls(
              caps.map((c) => c.storage_path),
              60 * 60,
            );
          const map: Record<string, string> = {};
          caps.forEach((c, i) => {
            const u = signed?.[i]?.signedUrl;
            if (u) map[c.id] = u;
          });
          setPhotoUrls(map);
        }
      }
    })();
  }, [user, id]);

  function updIng(key: string, patch: Partial<IngDraft>) {
    setDirty(true);
    // ユーザーが直した項目は「確認済み」とみなす
    setIngredients((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch, confidence: "high" } : x)));
  }
  function updStep(key: string, patch: Partial<StepDraft>) {
    setDirty(true);
    setSteps((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch, confidence: "high" } : x)));
  }
  function move<T>(xs: T[], i: number, d: -1 | 1): T[] {
    const j = i + d;
    if (j < 0 || j >= xs.length) return xs;
    const copy = [...xs];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    return copy;
  }

  async function save() {
    if (!id) return;
    setSaving(true);
    setNotice(null);
    const supabase = getSupabase();
    try {
      const n = Number(servings);
      const { error: e1 } = await supabase
        .from("recipes")
        .update({
          title: title.trim() || "無題のレシピ",
          servings: Number.isInteger(n) && n > 0 ? n : null,
          description: description.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (e1) throw new Error(e1.message);

      // 食材と手順は入れ直す（AIの元の値 ai_* は引き継ぐ）
      const { error: e2 } = await supabase.from("recipe_ingredients").delete().eq("recipe_id", id);
      if (e2) throw new Error(e2.message);
      const ingRows = ingredients
        .filter((x) => x.name.trim())
        .map((x, i) => ({
          recipe_id: id,
          position: i,
          name: x.name.trim(),
          amount: x.amount?.trim() || null,
          unit: x.unit?.trim() || null,
          confidence: x.confidence,
          ai_name: x.ai_name,
          ai_amount: x.ai_amount,
          ai_unit: x.ai_unit,
        }));
      if (ingRows.length) {
        const { error } = await supabase.from("recipe_ingredients").insert(ingRows);
        if (error) throw new Error(error.message);
      }

      const { error: e3 } = await supabase.from("recipe_steps").delete().eq("recipe_id", id);
      if (e3) throw new Error(e3.message);
      const stepRows = steps
        .filter((x) => x.text.trim())
        .map((x, i) => ({
          recipe_id: id,
          position: i,
          text: x.text.trim(),
          heat: x.heat?.trim() || null,
          duration_min: x.duration_min,
          capture_id: x.capture_id,
          confidence: x.confidence,
          ai_text: x.ai_text,
        }));
      if (stepRows.length) {
        const { error } = await supabase.from("recipe_steps").insert(stepRows);
        if (error) throw new Error(error.message);
      }
      setDirty(false);
      setNotice({ kind: "info", text: "保存しました" });
    } catch (e) {
      setNotice({ kind: "error", text: e instanceof Error ? e.message : "保存できませんでした" });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!id || !window.confirm("このレシピを削除しますか？")) return;
    const { error } = await getSupabase().from("recipes").delete().eq("id", id);
    if (error) setNotice({ kind: "error", text: error.message });
    else router.replace("/");
  }

  const lowCount =
    ingredients.filter((x) => x.confidence === "low").length + steps.filter((x) => x.confidence === "low").length;

  if (!id) {
    return (
      <AppShell>
        <p className="card text-sm">
          レシピが指定されていません。<Link className="underline" href="/">ホームに戻る</Link>
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {!recipe ? (
        <p className="py-16 text-center text-ink-soft">{notice?.text ?? "読み込み中…"}</p>
      ) : (
        <div className="space-y-6">
          {isNew && (
            <div className="rounded-xl bg-basil/10 p-3 text-sm text-basil">
              AIがレシピの下書きを作りました。
              {lowCount > 0 ? `「要確認」の${lowCount}項目を確かめて、必要なら直して保存してください。` : "内容を確かめて、必要なら直して保存してください。"}
            </div>
          )}

          <section className="space-y-3">
            <input
              className="input text-xl font-bold"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setDirty(true);
              }}
              aria-label="料理名"
            />
            <div className="flex gap-3">
              <div className="w-28">
                <label className="label" htmlFor="servings">何人分</label>
                <input
                  id="servings"
                  inputMode="numeric"
                  className="input"
                  value={servings}
                  onChange={(e) => {
                    setServings(e.target.value);
                    setDirty(true);
                  }}
                />
              </div>
              <div className="flex-1">
                <label className="label" htmlFor="desc">ひとこと</label>
                <input
                  id="desc"
                  className="input"
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    setDirty(true);
                  }}
                />
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-bold">材料</h2>
            <ul className="space-y-2">
              {ingredients.map((x) => (
                <li
                  key={x.key}
                  className={`card flex items-center gap-2 p-2 ${x.confidence === "low" ? "border-tomato/50" : ""}`}
                >
                  <div className="grid min-w-0 flex-1 grid-cols-[1fr_5.5rem_3.5rem] gap-1.5">
                    <input
                      className="input min-w-0 py-1.5"
                      value={x.name}
                      placeholder="食材"
                      onChange={(e) => updIng(x.key, { name: e.target.value })}
                    />
                    <input
                      className="input min-w-0 px-2 py-1.5"
                      value={x.amount ?? ""}
                      placeholder="量"
                      onChange={(e) => updIng(x.key, { amount: e.target.value })}
                    />
                    <input
                      className="input min-w-0 px-2 py-1.5"
                      value={x.unit ?? ""}
                      placeholder="単位"
                      onChange={(e) => updIng(x.key, { unit: e.target.value })}
                    />
                  </div>
                  <ConfidenceBadge value={x.confidence} />
                  <button
                    aria-label="材料を削除"
                    className="px-1 text-ink-soft hover:text-tomato"
                    onClick={() => {
                      setIngredients((xs) => xs.filter((y) => y.key !== x.key));
                      setDirty(true);
                    }}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <button
              className="btn mt-2 w-full border-dashed"
              onClick={() => {
                setIngredients((xs) => [
                  ...xs,
                  { key: newKey(), name: "", amount: null, unit: null, confidence: "high", ai_name: null, ai_amount: null, ai_unit: null },
                ]);
                setDirty(true);
              }}
            >
              ＋ 材料を追加
            </button>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-bold">作り方</h2>
            <ol className="space-y-3">
              {steps.map((s, i) => (
                <li key={s.key} className={`card p-3 ${s.confidence === "low" ? "border-tomato/50" : ""}`}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink text-xs font-bold text-white">
                      {i + 1}
                    </span>
                    <ConfidenceBadge value={s.confidence} />
                    <div className="ml-auto flex gap-1 text-sm text-ink-soft">
                      <button aria-label="上へ" className="px-1.5" onClick={() => { setSteps((xs) => move(xs, i, -1)); setDirty(true); }}>↑</button>
                      <button aria-label="下へ" className="px-1.5" onClick={() => { setSteps((xs) => move(xs, i, 1)); setDirty(true); }}>↓</button>
                      <button
                        aria-label="手順を削除"
                        className="px-1.5 hover:text-tomato"
                        onClick={() => {
                          setSteps((xs) => xs.filter((y) => y.key !== s.key));
                          setDirty(true);
                        }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    {s.capture_id && photoUrls[s.capture_id] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photoUrls[s.capture_id]} alt="" className="h-20 w-20 shrink-0 rounded-lg object-cover" />
                    )}
                    <textarea
                      className="input min-h-20 flex-1 text-sm"
                      value={s.text}
                      onChange={(e) => updStep(s.key, { text: e.target.value })}
                    />
                  </div>
                  <div className="mt-2 flex gap-2">
                    <input
                      className="input flex-1 py-1.5 text-sm"
                      placeholder="火加減"
                      value={s.heat ?? ""}
                      onChange={(e) => updStep(s.key, { heat: e.target.value })}
                    />
                    <div className="flex items-center gap-1">
                      <input
                        className="input w-20 py-1.5 text-sm"
                        inputMode="decimal"
                        placeholder="時間"
                        value={s.duration_min ?? ""}
                        onChange={(e) => {
                          const v = e.target.value.trim();
                          const n = Number(v);
                          updStep(s.key, { duration_min: v === "" || Number.isNaN(n) ? null : n });
                        }}
                      />
                      <span className="text-xs text-ink-soft">分</span>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            <button
              className="btn mt-2 w-full border-dashed"
              onClick={() => {
                setSteps((xs) => [
                  ...xs,
                  { key: newKey(), text: "", heat: null, duration_min: null, capture_id: null, confidence: "high", ai_text: null },
                ]);
                setDirty(true);
              }}
            >
              ＋ 手順を追加
            </button>
          </section>

          <section className="flex items-center justify-between border-t border-line pt-4 text-xs text-ink-soft">
            <span>{recipe.ai_model ? `解析：${recipe.ai_model}` : ""}</span>
            <button onClick={remove} className="text-tomato underline">
              このレシピを削除
            </button>
          </section>
        </div>
      )}

      {recipe && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-paper/95 backdrop-blur">
          <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-3">
            <p className={`flex-1 text-sm ${notice?.kind === "error" ? "text-tomato" : "text-ink-soft"}`}>
              {notice?.text ?? (dirty ? "未保存の変更があります" : isNew ? "自動保存しました" : "")}
            </p>
            <Link href="/" className="btn">
              一覧へ
            </Link>
            <button className="btn-primary px-6" disabled={saving || !dirty} onClick={save}>
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
