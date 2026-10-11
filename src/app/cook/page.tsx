import { Suspense } from "react";
import { CookClient } from "./CookClient";

export default function CookPage() {
  return (
    <Suspense fallback={<p className="py-16 text-center">読み込み中…</p>}>
      <CookClient />
    </Suspense>
  );
}
