import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, Items, LegalPage, OPERATOR, Section } from "@/components/LegalPage";

export const metadata: Metadata = { title: "利用規約 | CookVision" };

export default function TermsPage() {
  return (
    <LegalPage title="CookVision 利用規約" enacted="2026年11月1日">
      <p>
        この規約は、{OPERATOR}（以下「運営者」）が提供する「CookVision」（以下「本サービス」）の利用条件を定めるものです。
      </p>

      <Section title="第1条（同意）">
        <Items>
          <li>
            利用者は、この規約と「<Link href="/privacy" className="underline">プライバシーポリシー</Link>
            」に同意したうえで本サービスを利用します。
          </li>
          <li>本サービスは18歳以上の方を対象とします。18歳未満の方は利用できません。</li>
        </Items>
      </Section>

      <Section title="第2条（本サービスの内容）">
        <Items>
          <li>本サービスは、利用者が撮影した調理の写真をAIで解析し、レシピの下書きを作るものです。</li>
          <li>本サービスは試作版です。機能の変更、停止、データの消失が起きることがあります。</li>
          <li>
            運営者は、将来、有料の機能を追加することがあります。有料の機能を始めるときは、料金や支払い方法などの条件をこの規約に追加し、事前に本サービス上で知らせます。
          </li>
        </Items>
      </Section>

      <Section title="第3条（アカウント）">
        <Items>
          <li>利用者は、自分のメールアドレスまたはGoogleアカウントで登録します。</li>
          <li>利用者は、パスワードを自分で管理します。第三者に使わせてはいけません。</li>
          <li>利用者は、設定画面からいつでも退会できます。退会すると、写真とレシピは削除されます。</li>
        </Items>
      </Section>

      <Section title="第4条（写真とレシピの扱い）">
        <Items>
          <li>利用者が撮影した写真と作成したレシピの権利は、利用者にあります。</li>
          <li>運営者は、本サービスの提供に必要な範囲で、写真とレシピを保存・処理します。</li>
          <li>運営者は、利用者が設定画面で同意した場合に限り、写真とレシピをAIの改善に使います。</li>
          <li>写真の解析には外部のAIサービスを使います。詳しくはプライバシーポリシーに定めます。</li>
        </Items>
      </Section>

      <Section title="第5条（写真に写る人）">
        <Items>
          <li>他人が写る写真を撮るときは、その人の同意を得てください。</li>
          <li>顔の自動モザイクは、すべての顔を確実に処理するものではありません。</li>
          <li>自動モザイクをオフにした場合、写真の扱いは利用者の責任となります。</li>
        </Items>
      </Section>

      <Section title="第6条（禁止事項）">
        <p>利用者は、次の行為をしてはいけません。</p>
        <Items>
          <li>法令または公序良俗に反する行為</li>
          <li>他人の肖像権、プライバシー、著作権などを侵害する行為</li>
          <li>調理と関係のない写真、わいせつな写真、暴力的な写真を送る行為</li>
          <li>不正アクセス、大量の自動送信など、本サービスの運営を妨げる行為</li>
          <li>他人のアカウントを使う行為</li>
          <li>その他、運営者が不適切と判断する行為</li>
        </Items>
      </Section>

      <Section title="第7条（利用の制限）">
        <Items>
          <li>運営者は、費用と負荷を抑えるため、AI解析の回数や写真の枚数に上限を設けることがあります。</li>
          <li>運営者は、利用者が第6条に反した場合、事前の通知なく利用を停止またはアカウントを削除できます。</li>
        </Items>
      </Section>

      <Section title="第8条（AIの出力について）">
        <Items>
          <li>AIが作るレシピは推定です。食材、分量、加熱の時間や温度が正しいとは限りません。</li>
          <li>アレルギー物質、加熱の十分さ、食材の鮮度は、利用者ご自身で確認してください。</li>
          <li>本サービスのレシピは、食品の安全性や衛生状態を保証するものではありません。</li>
        </Items>
      </Section>

      <Section title="第9条（免責）">
        <Items>
          <li>運営者は、本サービスに誤りや不具合がないことを保証しません。</li>
          <li>
            運営者は、本サービスの利用で利用者に生じた損害について、運営者の故意または重大な過失による場合を除き、責任を負いません。
          </li>
          <li>本サービスの停止やデータの消失に備え、必要なレシピは利用者自身で控えてください。</li>
        </Items>
      </Section>

      <Section title="第10条（サービスの変更・終了）">
        <p>
          運営者は、本サービスの内容を変更または終了できます。終了する場合は、原則として終了の30日前までに本サービス上で知らせます。ただし、緊急の場合は予告なく終了することがあります。
        </p>
      </Section>

      <Section title="第11条（規約の変更）">
        <p>
          運営者は、この規約を変更できます。変更するときは、変更後の内容と効力が生じる日を、その日より前に本サービス上で知らせます。
        </p>
      </Section>

      <Section title="第12条（準拠法・管轄）">
        <p>この規約は日本法に従います。紛争が生じた場合は、東京地方裁判所を第一審の専属的合意管轄裁判所とします。</p>
      </Section>

      <Section title="問い合わせ先">
        <p>
          {OPERATOR}　<a href={`mailto:${CONTACT_EMAIL}`} className="underline">{CONTACT_EMAIL}</a>
        </p>
      </Section>
    </LegalPage>
  );
}
