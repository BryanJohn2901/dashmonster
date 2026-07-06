-- ─── 074: eventos de login (auditoria do Painel Admin) ─────────────────────────
-- Cada login grava 1 linha via rota /api/auth/login-event (service role).
-- Super admin lê tudo no /admin: último acesso, dispositivo, IP e localização.

create table if not exists public.login_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  email       text not null,
  ip          text,
  user_agent  text,
  city        text,
  region      text,
  country     text,
  timezone    text,
  created_at  timestamptz not null default now()
);

create index if not exists login_events_user_idx on public.login_events (user_id, created_at desc);
create index if not exists login_events_created_idx on public.login_events (created_at desc);

alter table public.login_events enable row level security;

-- Inserção acontece pela rota com service role (bypassa RLS). Nenhuma policy de
-- insert para authenticated: cliente não grava direto.
drop policy if exists login_events_superadmin_select on public.login_events;
create policy login_events_superadmin_select on public.login_events
  for select using (public.is_super_admin());

-- O próprio usuário pode ver o histórico dele (futuro: "meus acessos").
drop policy if exists login_events_self_select on public.login_events;
create policy login_events_self_select on public.login_events
  for select using (auth.uid() = user_id);
