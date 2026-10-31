import type { Metadata } from "next";
import { CONTACT_EMAIL, Items, LegalPage, OPERATOR, Section } from "@/components/LegalPage";

export const metadata: Metadata = { title: "プライバシーポリシー | CookVision" };

const COLLECTED: [string, string][] = [
  ["アカウント情報", "メールアドレス。Googleログインの場合は、Googleから受け取る名前・メールアドレス・プロフィール画像のURL"],
  ["調理の写真", "撮影またはアルバムから選んだ写真。端末内で縮小し、顔にモザイクをかけてから送信します（モザイクは設定でオフにできます）"],
  ["撮影に関する情報", "撮影日時、写真へのメモ、自動撮影かどうか、似た写真を間引くための明るさの特徴（16×16）"],
  ["レシピ", "AIが作った下書きと、利用者が直した内容の両方"],
  ["設定", "AIの改善への利用に同意するかどうか"],
  ["利用の記録", "アクセス日時、IPアドレス、エラーの記録（サーバーのログとして自動で記録されます）"],
];

const SERVICES: [string, string, string, string][] = [
  ["Gemini API", "米国（Google LLC）", "調理の写真、写真へのメモ、撮影の経過時間", "写真の解析"],
  ["Supabase", "米国（Supabase, Inc.）。データの保存先は日本（東京）", "アカウント情報、写真、レシピ、設定", "データの保存とログイン"],
  ["Vercel", "米国（Vercel Inc.）。処理は日本（東京）", "通信の内容、アクセスの記録", "本サービスの配信"],
  ["Google（ログイン）", "米国（Google LLC）", "Googleログインを選んだ場合の認証情報", "ログイン"],
];

export default function PrivacyPage() {
  return (
    <LegalPage title="CookVision プライバシーポリシー" enacted="2026年11月1日">
      <p>
        {OPERATOR}（以下「運営者」）は、「CookVision」（以下「本サービス」）で扱う利用者の情報を、次のとおり取り扱います。
      </p>

      <Section title="1. 集める情報">
        <dl className="space-y-2">
          {COLLECTED.map(([k, v]) => (
            <div key={k}>
              <dt className="font-bold">{k}</dt>
              <dd className="text-ink-soft">{v}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="2. 使う目的">
        <Items>
          <li>写真からレシピの下書きを作り、保存・表示するため</li>
          <li>ログインと本人確認のため</li>
          <li>不正利用の防止と、障害の調査のため</li>
          <li>問い合わせへの回答のため</li>
          <li>利用者が同意した場合に限り、AIの精度を上げるため</li>
        </Items>
      </Section>

      <Section title="3. 外部サービスへの送信">
        <p>本サービスは、次の外部サービスを使います。いずれも日本国外の事業者です。</p>
        <div className="space-y-2">
          {SERVICES.map(([name, country, info, purpose]) => (
            <div key={name} className="rounded-xl border border-line p-3">
              <p className="font-bold">{name}</p>
              <p className="text-ink-soft">事業者の国：{country}</p>
              <p className="text-ink-soft">送る情報：{info}</p>
              <p className="text-ink-soft">目的：{purpose}</p>
            </div>
          ))}
        </div>
        <p>
          写真の解析には Gemini API の無料枠を使っています。送信した写真とメモは、Googleのサービス改善に使われ、Googleの担当者が見ることがあります。本サービスの「AIの改善に使ってよい」設定に関わらず、この利用は止められません。個人を特定できるものを写さないようにしてください。
        </p>
        <p>各国の個人情報保護制度は、個人情報保護委員会のウェブサイトで確認できます。</p>
        <p>上記のほか、法令に基づく場合を除き、本人の同意なく第三者に情報を提供しません。</p>
      </Section>

      <Section title="4. 端末内での処理と外部からの読み込み">
        <Items>
          <li>
            顔の検出とモザイクは、利用者の端末内で行います。そのためのプログラムを jsDelivr と Google
            のサーバーから読み込みます。写真はこれらのサーバーには送りません。
          </li>
          <li>「顔にモザイクをかける」の設定とログイン状態は、端末のブラウザに保存します。</li>
          <li>広告やアクセス解析のツールは使っていません。</li>
        </Items>
      </Section>

      <Section title="5. 保存期間と削除">
        <Items>
          <li>写真とレシピは、利用者が削除するか退会するまで保存します。</li>
          <li>
            レシピを削除しても、そのレシピの写真（間引いた写真や解析に失敗した写真を含む）は、退会するまで残ります。
          </li>
          <li>退会すると、アカウント情報、写真、レシピを削除します。</li>
          <li>外部サービスに送った情報の保存期間は、各サービスの規約に従います。</li>
        </Items>
      </Section>

      <Section title="6. 安全管理">
        <Items>
          <li>写真は非公開の保存先に置き、本人だけが読み書きできるようにしています。</li>
          <li>データベースは行単位のアクセス制御で、本人のデータだけを読めるようにしています。</li>
          <li>通信は暗号化（HTTPS）しています。</li>
          <li>管理用の鍵を扱えるのは運営者だけです。</li>
        </Items>
      </Section>

      <Section title="7. 開示・訂正・削除の依頼">
        <p>
          本人の情報の開示、訂正、利用停止、削除を希望する場合は、問い合わせ先に連絡してください。本人確認のうえで対応します。
        </p>
      </Section>

      <Section title="8. 変更">
        <p>
          このポリシーを変更するときは、本サービス上で知らせます。集める情報や使う目的を広げるときは、改めて同意を取ります。
        </p>
      </Section>

      <Section title="9. 問い合わせ先">
        <p>
          {OPERATOR}　<a href={`mailto:${CONTACT_EMAIL}`} className="underline">{CONTACT_EMAIL}</a>
        </p>
      </Section>
    </LegalPage>
  );
}
