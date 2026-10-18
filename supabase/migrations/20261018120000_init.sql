-- CookVision MVP のデータベース定義（初期マイグレーション）
-- 適用は `npx supabase db push`。以後の変更は新しいマイグレーションファイルで行う。

-- ============================================================
-- テーブル
-- ============================================================

-- ユーザーごとの設定（学習利用の同意など）
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  allow_training boolean not null default false,
  created_at timestamptz not null default now()
);

-- 1品の調理 = 1セッション（F-02）
create table if not exists public.cooking_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text,
  status text not null default 'capturing'
    check (status in ('capturing', 'analyzing', 'done', 'failed')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  error text
);

-- セッション中に撮った写真（F-03, F-04）
create table if not exists public.captures (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.cooking_sessions (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  storage_path text not null,
  taken_at timestamptz not null default now(),
  note text,
  face_blurred boolean not null default false,
  -- 自動トリミング：AIが返した「料理に関係する範囲」（0〜1の割合。元の写真は加工しない）
  crop jsonb,
  created_at timestamptz not null default now()
);

-- レシピ（F-05〜F-08）
create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id uuid references public.cooking_sessions (id) on delete set null,
  title text not null default '無題のレシピ',
  servings integer,
  description text,
  visibility text not null default 'private' check (visibility in ('private')),
  ai_provider text,
  ai_model text,
  ai_raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 食材。AIの出力（ai_*）とユーザー修正後の値を両方持つ
create table if not exists public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  position integer not null default 0,
  name text not null,
  amount text,
  unit text,
  confidence text not null default 'high' check (confidence in ('high', 'medium', 'low')),
  ai_name text,
  ai_amount text,
  ai_unit text
);

-- 手順。AIの出力（ai_text）とユーザー修正後の値を両方持つ
create table if not exists public.recipe_steps (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  position integer not null default 0,
  text text not null,
  heat text,
  duration_min numeric,
  capture_id uuid references public.captures (id) on delete set null,
  confidence text not null default 'high' check (confidence in ('high', 'medium', 'low')),
  ai_text text
);

create index if not exists captures_session_idx on public.captures (session_id, taken_at);
create index if not exists recipes_user_idx on public.recipes (user_id, created_at desc);
create index if not exists ingredients_recipe_idx on public.recipe_ingredients (recipe_id, position);
create index if not exists steps_recipe_idx on public.recipe_steps (recipe_id, position);

-- ============================================================
-- 行単位のアクセス制御（本人の行だけ読み書きできる）
-- ============================================================

alter table public.profiles enable row level security;
alter table public.cooking_sessions enable row level security;
alter table public.captures enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipe_steps enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "own sessions" on public.cooking_sessions;
create policy "own sessions" on public.cooking_sessions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own captures" on public.captures;
create policy "own captures" on public.captures
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own recipes" on public.recipes;
create policy "own recipes" on public.recipes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own ingredients" on public.recipe_ingredients;
create policy "own ingredients" on public.recipe_ingredients
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own steps" on public.recipe_steps;
create policy "own steps" on public.recipe_steps
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================
-- Data API（supabase-js）からの利用を許可する
-- 「Automatically expose new tables」をオフにしたプロジェクトでは、これが必要
-- 未ログイン（anon）には何も許可せず、ログイン中のユーザーだけに許可する
-- ============================================================

grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.profiles,
  public.cooking_sessions,
  public.captures,
  public.recipes,
  public.recipe_ingredients,
  public.recipe_steps
to authenticated;

-- ============================================================
-- 写真の保存先（非公開バケット。本人のフォルダだけ読み書きできる）
-- パスの形式: <user_id>/<session_id>/<ファイル名>.jpg
-- ============================================================

insert into storage.buckets (id, name, public)
values ('captures', 'captures', false)
on conflict (id) do nothing;

drop policy if exists "own capture files read" on storage.objects;
create policy "own capture files read" on storage.objects
  for select using (
    bucket_id = 'captures' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "own capture files insert" on storage.objects;
create policy "own capture files insert" on storage.objects
  for insert with check (
    bucket_id = 'captures' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "own capture files delete" on storage.objects;
create policy "own capture files delete" on storage.objects
  for delete using (
    bucket_id = 'captures' and (storage.foldername(name))[1] = auth.uid()::text
  );
