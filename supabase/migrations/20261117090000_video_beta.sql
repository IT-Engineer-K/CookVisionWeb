create table public.video_beta_daily (
  usage_day date not null,
  account_hash text not null,
  attempts integer not null check (attempts >= 0),
  primary key (usage_day, account_hash)
);

alter table public.video_beta_daily enable row level security;
revoke all on public.video_beta_daily from public, anon, authenticated;

create function public.reserve_video_beta_attempt(email_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Tokyo')::date;
  total integer;
  personal integer;
begin
  if email_hash is null or email_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid account hash';
  end if;

  insert into public.video_beta_daily values (today, '', 0) on conflict do nothing;
  -- Serialize reservations for the day, including concurrent first requests.
  select attempts into total from public.video_beta_daily
    where usage_day = today and account_hash = '' for update;
  select attempts into personal from public.video_beta_daily
    where usage_day = today and account_hash = email_hash;
  if total >= 20 or coalesce(personal, 0) >= 2 then
    return false;
  end if;

  update public.video_beta_daily set attempts = total + 1
    where usage_day = today and account_hash = '';
  insert into public.video_beta_daily values (today, email_hash, 1)
    on conflict (usage_day, account_hash) do update
    set attempts = public.video_beta_daily.attempts + 1;
  return true;
end;
$$;

revoke all on function public.reserve_video_beta_attempt(text) from public, anon, authenticated;
grant execute on function public.reserve_video_beta_attempt(text) to service_role;

alter table public.recipe_steps
  add column video_offset_sec double precision check (video_offset_sec >= 0 and video_offset_sec <= 30);

-- Uses the caller's existing row-level policies. A failed insert rolls back the whole draft.
create function public.save_video_beta_recipe(draft jsonb, model text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_session_id uuid;
  new_recipe_id uuid;
  step_refs jsonb;
begin
  insert into public.cooking_sessions (title, status, ended_at)
    values (draft->>'title', 'done', now()) returning id into new_session_id;

  insert into public.recipes (session_id, title, servings, description, ai_provider, ai_model, ai_raw)
    values (new_session_id, draft->>'title', (draft->>'servings')::integer, draft->>'description',
      'gemini', model, draft)
    returning id into new_recipe_id;

  insert into public.recipe_ingredients
    (recipe_id, position, name, amount, unit, confidence, ai_name, ai_amount, ai_unit)
    select new_recipe_id, ordinal - 1, item->>'name', item->>'amount', item->>'unit',
      item->>'confidence', item->>'name', item->>'amount', item->>'unit'
    from jsonb_array_elements(draft->'ingredients') with ordinality as i(item, ordinal);

  with inserted as (
    insert into public.recipe_steps
      (recipe_id, position, text, heat, duration_min, confidence, ai_text, video_offset_sec)
      select new_recipe_id, ordinal - 1, item->>'text', item->>'heat', (item->>'duration_min')::numeric,
        item->>'confidence', item->>'text', (item->>'video_offset_sec')::double precision
      from jsonb_array_elements(draft->'steps') with ordinality as s(item, ordinal)
      returning id, position, video_offset_sec
  )
  select jsonb_agg(jsonb_build_object('id', id, 'offsetSec', video_offset_sec) order by position)
    into step_refs from inserted;

  return jsonb_build_object('recipeId', new_recipe_id, 'sessionId', new_session_id, 'steps', step_refs);
end;
$$;

revoke all on function public.save_video_beta_recipe(jsonb, text) from public, anon;
grant execute on function public.save_video_beta_recipe(jsonb, text) to authenticated;
