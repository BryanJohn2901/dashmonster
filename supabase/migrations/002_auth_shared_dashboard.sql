-- ============================================================
-- GSAStúdio Hub — Auth + Dashboard compartilhado
-- Execute este SQL no Supabase SQL Editor
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1) Tabela principal de métricas (compartilhada por todos)
-- ------------------------------------------------------------
create table if not exists public.campaign_metrics (
  id uuid primary key default gen_random_uuid(),
  date text not null,
  campaign_name text not null,
  investment numeric not null default 0,
  clicks numeric not null default 0,
  impressions numeric not null default 0,
  conversions numeric not null default 0,
  revenue numeric not null default 0,
  source text not null check (source in ('csv', 'google_sheets', 'meta')),
  created_at timestamptz not null default now()
);

create index if not exists idx_campaign_metrics_date on public.campaign_metrics(date);
create index if not exists idx_campaign_metrics_source on public.campaign_metrics(source);

alter table public.campaign_metrics enable row level security;

drop policy if exists "authenticated_read_campaign_metrics" on public.campaign_metrics;
create policy "authenticated_read_campaign_metrics"
  on public.campaign_metrics
  for select
  to authenticated
  using (true);

drop policy if exists "authenticated_write_campaign_metrics" on public.campaign_metrics;
create policy "authenticated_write_campaign_metrics"
  on public.campaign_metrics
  for insert
  to authenticated
  with check (true);

drop policy if exists "authenticated_update_campaign_metrics" on public.campaign_metrics;
create policy "authenticated_update_campaign_metrics"
  on public.campaign_metrics
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "authenticated_delete_campaign_metrics" on public.campaign_metrics;
create policy "authenticated_delete_campaign_metrics"
  on public.campaign_metrics
  for delete
  to authenticated
  using (true);

-- ------------------------------------------------------------
-- 2) Fonte de dados ativa do dashboard (singleton)
-- ------------------------------------------------------------
create table if not exists public.dashboard_data_source (
  id boolean primary key default true check (id = true),
  source_type text not null check (source_type in ('csv', 'google_sheets', 'meta')),
  source_label text not null,
  updated_at timestamptz not null default now()
);

alter table public.dashboard_data_source enable row level security;

drop policy if exists "authenticated_read_dashboard_data_source" on public.dashboard_data_source;
create policy "authenticated_read_dashboard_data_source"
  on public.dashboard_data_source
  for select
  to authenticated
  using (true);

drop policy if exists "authenticated_write_dashboard_data_source" on public.dashboard_data_source;
create policy "authenticated_write_dashboard_data_source"
  on public.dashboard_data_source
  for all
  to authenticated
  using (true)
  with check (true);

-- Trigger para manter updated_at consistente
create or replace function public.set_updated_at_dashboard_data_source()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_dashboard_data_source_updated_at on public.dashboard_data_source;
create trigger trg_dashboard_data_source_updated_at
before update on public.dashboard_data_source
for each row execute function public.set_updated_at_dashboard_data_source();

-- ------------------------------------------------------------
-- 3) Usuário administrador inicial
-- ------------------------------------------------------------
-- Login no app: admin / admin
-- Credenciais reais no Supabase Auth: admin@dashboard.local / admin123
do $$
declare
  v_user_id uuid := '11111111-1111-1111-1111-111111111111';
begin
  insert into auth.users (
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  values (
    v_user_id,
    'authenticated',
    'authenticated',
    'admin@dashboard.local',
    crypt('admin123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Admin"}'::jsonb,
    now(),
    now()
  )
  on conflict (id) do nothing;

  insert into auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    created_at,
    updated_at
  )
  values (
    gen_random_uuid(),
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', 'admin@dashboard.local'),
    'email',
    'admin@dashboard.local',
    now(),
    now()
  )
  on conflict (provider, provider_id) do nothing;
end $$;
