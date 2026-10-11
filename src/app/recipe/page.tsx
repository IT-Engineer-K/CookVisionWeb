import { Suspense } from "react";
import { RecipeClient } from "./RecipeClient";

export default function RecipePage() {
  return (
    <Suspense fallback={<p className="py-16 text-center">読み込み中…</p>}>
      <RecipeClient />
    </Suspense>
  );
}
