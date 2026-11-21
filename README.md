# CookVision（Web試作版）

調理の工程を写真で撮るだけで、AIがレシピの下書きを作るWebアプリです。
要件定義書のMVP（機能 F-01〜F-08）を実装しています。

## 実装済みの機能

| ID | 機能 | 画面 |
| --- | --- | --- |
| F-01 | メール／Googleでの登録・ログイン | `/login` |
| F-02 | 調理セッションの開始・終了 | `/`（開始）、`/cook`（終了） |
| F-03 | 工程ごとの写真撮影（アルバムの写真・動画からの追加も可） | `/cook` |
| F-04 | 写真へのメモ | `/cook` |
| F-05 | AI解析（写真→レシピ下書き） | `/api/analyze` |
| F-06 | AIの自信が低い項目に「要確認」「推定」を表示 | `/recipe` |
| F-07 | レシピの編集（材料・手順の追加、削除、並べ替え） | `/recipe` |
| F-08 | レシピの保存・一覧・検索（料理名・食材） | `/`、`/recipe` |
| — | 顔の自動モザイク（端末内で処理してから送信） | `/cook` |
| — | 学習利用の同意（オプトイン）、ログアウト、退会（写真・レシピ・アカウントの削除） | `/settings`、`/api/account/delete` |

## セットアップ

### 1. 依存関係を入れる

```bash
npm install
```

### 2. Supabase を用意する

1. https://supabase.com でプロジェクトを作る（無料プランで可）
2. テーブルを作る（データベースの変更は `supabase/migrations/` で管理する）
   ```bash
   npx supabase login
   npx supabase link --project-ref <Project ID>
   npx supabase db push
   ```
   以後、テーブルを変えるときは `npx supabase migration new <名前>` でファイルを作り、`db push` で反映する。SQL Editor で直接変えない。
3. **Project Settings → API** から、Project URL と anon（publishable）key を控える
4. **Authentication → URL Configuration** の Site URL に `http://localhost:3000` を入れる（公開後は Vercel のURLも追加）
5. Googleログインを使う場合は **Authentication → Providers → Google** を有効にする（Google Cloud で OAuth クライアントの作成が必要）

メールでの登録は、初期設定では確認メールのリンクを開くまでログインできません。
写真機能だけの試作で確認を省く場合は **Authentication → Providers → Email** の「Confirm email」をオフにできます。動画解析βにはメール確認が必要です。

### 3. Gemini の APIキーを用意する

https://aistudio.google.com で APIキーを発行します（無料枠あり）。

### 4. 環境変数を設定する

`.env.example` をコピーして `.env.local` を作り、値を入れます。

```bash
cp .env.example .env.local
```

### 5. 起動する

```bash
npm run dev
```

http://localhost:3000 を開きます。

### スマホで試す

カメラはスマホのブラウザで使う想定です。PCと同じWi-Fiにつないだスマホから `http://<PCのIPアドレス>:3000` を開くか、Vercel に公開して試してください。
（`localhost` 以外の http では一部ブラウザのカメラ機能が制限されることがあります。その場合は Vercel の https URL を使ってください。）

## Vercel への公開

1. GitHub にリポジトリを作って push する
2. Vercel で **Add New → Project** からリポジトリを選ぶ
3. **Environment Variables** に `.env.local` と同じ6項目（`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`、`AI_PROVIDER`、`GEMINI_API_KEY`、`GEMINI_MODEL`）を入れて Deploy
4. 発行されたURLを Supabase の Site URL / Redirect URLs に追加する

Vercel の無料プラン（Hobby）は商用利用ができません。課金を始める前にプランを見直してください。

## 動画解析βをローカルで試す

1. 開発用Supabaseに `supabase/migrations/20261117090000_video_beta.sql` まで適用します。Supabase CLIのローカル環境では `npx supabase migration up --local` を使います。
2. Supabaseのメール確認を有効にします。確認を省略して作成した既存アカウントにも確認済み時刻が入るため、その履歴がある環境では、対象メールの所有を再確認するまでβを有効にしないでください。ローカルの検証では受信箱を使って登録確認を行います。
3. `.env.local` の `SUPABASE_SERVICE_ROLE_KEY` に開発用Supabaseの管理用キー、`VIDEO_BETA_GEMINI_API_KEY` に課金を有効にしていないGemini APIプロジェクトのキーを設定し、開発サーバーを再起動します。βのキーを空欄にすると無効になります。
4. 確認済みの `@ms.dendai.ac.jp` アカウントでログインし、ホームから「動画解析β」を開きます。卒業生も大学メールを利用できれば対象です。録画済みのMP4を選択し、送信への同意をチェックして解析します。

入力は通常のMP4（0.1～30秒、4,000,000バイトまで）です。動画と音声はGoogle Geminiに送られ、CookVisionでは動画本体を保存しません。Gemini 3.1 Flash-Liteでは動画を毎秒2フレームの設定で解析します。同じ動画を調理画面で写真として取り込んだ場合と、拾えた工程や時刻を比べられます。

試行は大学メールごとに1日2回、全体で1日20回までです。枠は日本時間の午前0時に更新され、Geminiに送信を試みた回は解析が失敗しても消費します。混雑や枠切れの際は写真解析も使えます。静止画の切り出しや保存に失敗した場合も、先に保存した下書きと工程時刻は編集できます。

## 構成

```
src/
  app/
    page.tsx, HomeClient.tsx      ホーム（レシピ一覧・検索・調理開始）
    login/                        ログイン・登録
    cook/                         撮影画面（写真・メモ・調理終了）
    recipe/                       レシピの確認・編集
    settings/                     学習利用の同意・ログアウト
    api/analyze/route.ts          AI解析API（サーバー側。APIキーはここだけで使う）
    api/account/delete/route.ts   退会API（サーバー側）
  lib/
    ai/index.ts                   AI呼び出しの入口（運用AIの切り替えはここで行う）
    ai/gemini.ts                  Gemini の呼び出し
    ai/recipe-schema.ts           AIに返させるレシピ形式とプロンプト
    image.ts                      写真の縮小と顔モザイク（MediaPipe）
    supabase.ts                   Supabase クライアント
supabase/migrations/              テーブル・行単位アクセス制御・写真の保存先（変更履歴）
supabase/config.toml              Supabase CLI の設定
```

## データの流れ

アルバムでは写真と動画をまとめて選択できます。動画はブラウザ内で約10秒ごとの工程写真に変換し、既存の写真と合わせて40枚以内になるよう動画全体から均等に取り出します。複数の動画を選んだ場合は残りの枠を分け合います。各写真には動画内の時刻をメモとして付け、顔のモザイク設定を適用して保存します。動画本体・音声の保存、再生、音声解析は行いません。取り込み中の枚数を画面に表示し、途中で失敗した場合は保存済みの枚数を案内します。対応する動画形式・コーデックは端末のブラウザに依存します（MP4、MOV、WebMなど）。

1. スマホで撮った写真を、端末内で長辺1280pxに縮小し、顔をモザイクにする
2. Supabase Storage の非公開フォルダ（本人のみ閲覧可）に保存する
3. 「調理終了」で `/api/analyze` を呼ぶ。サーバーが写真を読み、Gemini に送ってレシピのJSONを受け取る
4. レシピ・材料・手順をDBに保存する。AIの出力（`ai_*` 列）とユーザーが直した値の両方を残す

## 運用AIを OpenAI などに切り替えるとき

`src/lib/ai/` に `openai.ts` を足し、`index.ts` の `switch` に分岐を追加します。
返す形式は `recipe-schema.ts` の `AiRecipe` に揃えれば、画面とDBは変更不要です。
