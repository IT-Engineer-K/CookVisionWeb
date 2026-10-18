-- 自動撮影：撮り方（手動／自動）と、似た写真を間引くための特徴（16×16の明るさ）
alter table public.captures
  add column if not exists source text not null default 'manual' check (source in ('manual', 'auto')),
  add column if not exists signature smallint[];
