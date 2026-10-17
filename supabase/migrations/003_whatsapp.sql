-- Demandas — etapa 4 (WhatsApp)
-- Código pessoal usado pelo Atalho do iPhone. Guardamos só o hash do código.
create table if not exists public.inbox_tokens (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now()
);
alter table public.inbox_tokens enable row level security;
drop policy if exists "inbox_tokens_own" on public.inbox_tokens;
create policy "inbox_tokens_own" on public.inbox_tokens
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
