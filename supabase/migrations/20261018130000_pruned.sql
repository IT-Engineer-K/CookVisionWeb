-- 間引いた写真は消さずに印を付ける（解析には送らない。試作中に何を間引いたか確認するため）
alter table public.captures
  add column if not exists pruned boolean not null default false;
