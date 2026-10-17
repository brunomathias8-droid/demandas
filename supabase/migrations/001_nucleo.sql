-- Demandas — etapa 1 (núcleo)
-- Cole este arquivo inteiro no SQL Editor do Supabase e clique em "Run".

create extension if not exists "pgcrypto";

-- Assuntos / demandas (ex.: Nexo, Café Verde, RM, Saúde)
create table if not exists public.demands (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  color       text not null default '#C8F25A',
  description text,                       -- ajuda a IA a classificar (etapa 2)
  keywords    text[] not null default '{}',-- palavras que indicam este assunto (etapa 2)
  position    int  not null default 0,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Tarefas / itens de cada demanda
create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  demand_id    uuid references public.demands(id) on delete set null,
  title        text not null check (char_length(title) between 1 and 300),
  notes        text,
  kind         text not null default 'fazer' check (kind in ('fazer','falar','lembrar')),
  status       text not null default 'open'  check (status in ('inbox','open','done')),
  due_at       timestamptz,               -- prazo
  due_all_day  boolean not null default true, -- prazo sem horário definido
  remind_at    timestamptz,               -- quando avisar
  source       text not null default 'texto' check (source in ('texto','voz','whatsapp')),
  raw_input    text,                      -- texto/transcrição original (rastreabilidade)
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists tasks_user_status_idx on public.tasks (user_id, status);
create index if not exists tasks_user_due_idx    on public.tasks (user_id, due_at);
create index if not exists tasks_remind_idx      on public.tasks (remind_at) where status <> 'done';
create index if not exists demands_user_idx      on public.demands (user_id, archived, position);

-- updated_at automático
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists demands_touch on public.demands;
create trigger demands_touch before update on public.demands
  for each row execute function public.touch_updated_at();

drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

-- Segurança: cada usuário só enxerga e altera os próprios dados
alter table public.demands enable row level security;
alter table public.tasks   enable row level security;

drop policy if exists "demands_own" on public.demands;
create policy "demands_own" on public.demands
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "tasks_own" on public.tasks;
create policy "tasks_own" on public.tasks
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
