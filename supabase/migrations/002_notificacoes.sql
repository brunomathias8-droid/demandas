-- Demandas — etapa 3 (notificações)
-- Cole este arquivo inteiro no SQL Editor do Supabase e clique em "Run".

-- Controle de lembrete já enviado
alter table public.tasks add column if not exists reminded_at timestamptz;

-- Aparelhos que recebem notificações
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "push_own" on public.push_subscriptions;
create policy "push_own" on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Preferências: fuso e resumo da manhã
create table if not exists public.profiles (
  user_id         uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  tz              text not null default 'America/Fortaleza',
  morning_enabled boolean not null default true,
  morning_time    text not null default '07:30',
  last_morning_on date,
  updated_at      timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "profiles_own" on public.profiles;
create policy "profiles_own" on public.profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Segredos do servidor (sem acesso pelo app)
create table if not exists public.app_secrets (
  key   text primary key,
  value text not null
);
alter table public.app_secrets enable row level security;
insert into public.app_secrets (key, value)
values ('cron_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

-- Agendamento: chama o servidor a cada minuto para enviar lembretes e o resumo da manhã
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'demandas-notify';
select cron.schedule(
  'demandas-notify',
  '* * * * *',
  $job$
    select net.http_post(
      url := 'https://demandas-dun.vercel.app/api/notify',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select value from public.app_secrets where key = 'cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 25000
    );
  $job$
);
