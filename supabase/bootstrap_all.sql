-- ============================================================
-- GSAStúdio Hub — bootstrap completo (migrations 001 → 082)
-- Gerado por build_bootstrap.mjs. Idempotente num banco zerado.
-- Rode reset_public.sql ANTES se o banco não estiver vazio.
-- ============================================================


-- ▼▼▼ 001_historical_data.sql ▼▼▼
-- ============================================================
-- GSAStúdio Hub — Historical Data Tables
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- 1. historical_rows: monthly funnel data per product
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.historical_rows (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  product       TEXT        NOT NULL,
  month         TEXT        NOT NULL,
  year          INTEGER     NOT NULL,
  month_key     TEXT        NOT NULL,          -- "2025-03" for sorting
  month_label   TEXT        NOT NULL,          -- "Mar/25" for display
  investment    NUMERIC     NOT NULL DEFAULT 0,
  cpm           NUMERIC     NOT NULL DEFAULT 0,
  reach         NUMERIC     NOT NULL DEFAULT 0,
  ctr           NUMERIC     NOT NULL DEFAULT 0,
  clicks        NUMERIC     NOT NULL DEFAULT 0,
  page_view_rate    NUMERIC NOT NULL DEFAULT 0,
  page_views        NUMERIC NOT NULL DEFAULT 0,
  pre_checkout_rate NUMERIC NOT NULL DEFAULT 0,
  pre_checkouts     NUMERIC NOT NULL DEFAULT 0,
  sales_rate    NUMERIC     NOT NULL DEFAULT 0,
  sales         NUMERIC     NOT NULL DEFAULT 0,
  revenue       NUMERIC     NOT NULL DEFAULT 0,
  cac           NUMERIC     NOT NULL DEFAULT 0,
  roas          NUMERIC     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. historical_metas: monthly targets per product
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.historical_metas (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID    REFERENCES auth.users(id) ON DELETE CASCADE,
  product           TEXT    NOT NULL,
  investment        NUMERIC NOT NULL DEFAULT 0,
  cpm               NUMERIC NOT NULL DEFAULT 0,
  ctr               NUMERIC NOT NULL DEFAULT 0,
  page_view_rate    NUMERIC NOT NULL DEFAULT 0,
  pre_checkout_rate NUMERIC NOT NULL DEFAULT 0,
  sales_target      NUMERIC NOT NULL DEFAULT 0,
  cac               NUMERIC NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Row Level Security
-- -------------------------------------------------------
ALTER TABLE public.historical_rows  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historical_metas ENABLE ROW LEVEL SECURITY;

-- Allow full public access via anon key (tighten when auth is enabled)
DROP POLICY IF EXISTS "anon_full_historical_rows" ON public.historical_rows;
CREATE POLICY "anon_full_historical_rows"  ON public.historical_rows
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_full_historical_metas" ON public.historical_metas;
CREATE POLICY "anon_full_historical_metas" ON public.historical_metas
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 4. Indexes for common queries
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_hist_rows_month_key  ON public.historical_rows(month_key);
CREATE INDEX IF NOT EXISTS idx_hist_rows_product    ON public.historical_rows(product);
CREATE INDEX IF NOT EXISTS idx_hist_metas_product   ON public.historical_metas(product);

-- 5. updated_at auto-trigger
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_hist_rows_updated_at ON public.historical_rows;
DROP TRIGGER IF EXISTS trg_hist_rows_updated_at ON public.historical_rows;
CREATE TRIGGER trg_hist_rows_updated_at
  BEFORE UPDATE ON public.historical_rows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ▲▲▲ 001_historical_data.sql ▲▲▲

-- ▼▼▼ 002_auth_shared_dashboard.sql ▼▼▼
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


-- ▲▲▲ 002_auth_shared_dashboard.sql ▲▲▲

-- ▼▼▼ 003_fix_data_api_grants_and_realtime.sql ▼▼▼
-- ============================================================
-- Fix: acesso via Data API + Realtime para dashboard compartilhado
-- Execute no SQL Editor do Supabase (projeto de producao)
-- ============================================================

-- Garantir permissao de schema
grant usage on schema public to anon, authenticated;

-- Garantir permissoes de tabela (Data API)
grant select, insert, update, delete on table public.campaign_metrics to authenticated;
grant select, insert, update, delete on table public.dashboard_data_source to authenticated;

-- Reforco para uso futuro via anon (somente leitura, opcional)
grant select on table public.campaign_metrics to anon;
grant select on table public.dashboard_data_source to anon;

-- Publicar tabelas no Realtime
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'campaign_metrics'
  ) then
    alter publication supabase_realtime add table public.campaign_metrics;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'dashboard_data_source'
  ) then
    alter publication supabase_realtime add table public.dashboard_data_source;
  end if;
end $$;


-- ▲▲▲ 003_fix_data_api_grants_and_realtime.sql ▲▲▲

-- ▼▼▼ 003_historical_kind.sql ▼▼▼
-- Add kind discriminator + flexible extras column
alter table if exists public.historical_rows
  add column if not exists kind text not null default 'lancamento',
  add column if not exists extra jsonb not null default '{}'::jsonb;

create index if not exists historical_rows_kind_idx on public.historical_rows(kind);

-- Constraint: kind deve ser um dos valores conhecidos
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'historical_rows_kind_check'
  ) then
    alter table public.historical_rows
      add constraint historical_rows_kind_check
      check (kind in ('lancamento','evento','perpetuo','instagram'));
  end if;
end $$;


-- ▲▲▲ 003_historical_kind.sql ▲▲▲

-- ▼▼▼ 004_create_missing_tables.sql ▼▼▼
-- ============================================================
-- GSAStúdio Hub — Tabelas faltantes: categoria, historical_rows, historical_metas
-- Execute no Supabase SQL Editor (Dashboard > SQL Editor > New query)
-- ============================================================

-- ─── categoria ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.categoria (
  key         TEXT        PRIMARY KEY,   -- pos | livros | ebooks | perpetuo | eventos
  label       TEXT        NOT NULL,
  description TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.categoria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_categoria" ON public.categoria;
CREATE POLICY "anon_read_categoria" ON public.categoria
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_write_categoria" ON public.categoria;
CREATE POLICY "authenticated_write_categoria" ON public.categoria
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.categoria TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categoria TO authenticated;

-- Seed com os valores padrão do app
INSERT INTO public.categoria (key, label, description) VALUES
  ('pos',      'Lançamentos de Pós', 'Campanhas mensais de lançamento das turmas de pós-graduação'),
  ('livros',   'Livros',             'Campanhas de venda de livros físicos e digitais'),
  ('ebooks',   'Ebooks',             'Produtos digitais e materiais de educação online'),
  ('perpetuo', 'Perpétuo',           'Campanhas evergreen de oferta contínua sem data de encerramento'),
  ('eventos',  'Eventos',            'Eventos presenciais, mentorias e imersões')
ON CONFLICT (key) DO NOTHING;

-- ─── historical_rows ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.historical_rows (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  kind              TEXT        NOT NULL DEFAULT 'lancamento'
                                CHECK (kind IN ('lancamento','evento','perpetuo','instagram')),
  product           TEXT        NOT NULL,
  month             TEXT        NOT NULL,
  year              INTEGER     NOT NULL,
  month_key         TEXT        NOT NULL,
  month_label       TEXT        NOT NULL,
  investment        NUMERIC     NOT NULL DEFAULT 0,
  revenue           NUMERIC     NOT NULL DEFAULT 0,
  -- Colunas legadas (retrocompatibilidade com registros antigos)
  cpm               NUMERIC     NOT NULL DEFAULT 0,
  reach             NUMERIC     NOT NULL DEFAULT 0,
  ctr               NUMERIC     NOT NULL DEFAULT 0,
  clicks            NUMERIC     NOT NULL DEFAULT 0,
  page_views        NUMERIC     NOT NULL DEFAULT 0,
  page_view_rate    NUMERIC     NOT NULL DEFAULT 0,
  pre_checkouts     NUMERIC     NOT NULL DEFAULT 0,
  pre_checkout_rate NUMERIC     NOT NULL DEFAULT 0,
  sales             NUMERIC     NOT NULL DEFAULT 0,
  sales_rate        NUMERIC     NOT NULL DEFAULT 0,
  cac               NUMERIC     NOT NULL DEFAULT 0,
  roas              NUMERIC     NOT NULL DEFAULT 0,
  campaign_end_date TEXT,
  -- Campos extras flexíveis por kind (evento, perpetuo, instagram)
  extra             JSONB       NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.historical_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_full_historical_rows" ON public.historical_rows;
CREATE POLICY "anon_full_historical_rows" ON public.historical_rows
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.historical_rows TO anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_hist_rows_month_key ON public.historical_rows(month_key);
CREATE INDEX IF NOT EXISTS idx_hist_rows_product   ON public.historical_rows(product);
CREATE INDEX IF NOT EXISTS idx_hist_rows_kind      ON public.historical_rows(kind);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_hist_rows_updated_at ON public.historical_rows;
DROP TRIGGER IF EXISTS trg_hist_rows_updated_at ON public.historical_rows;
CREATE TRIGGER trg_hist_rows_updated_at
  BEFORE UPDATE ON public.historical_rows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── historical_metas ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.historical_metas (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product           TEXT        NOT NULL UNIQUE,
  investment        NUMERIC     NOT NULL DEFAULT 0,
  cpm               NUMERIC     NOT NULL DEFAULT 0,
  ctr               NUMERIC     NOT NULL DEFAULT 0,
  page_view_rate    NUMERIC     NOT NULL DEFAULT 0,
  pre_checkout_rate NUMERIC     NOT NULL DEFAULT 0,
  sales_target      NUMERIC     NOT NULL DEFAULT 0,
  cac               NUMERIC     NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.historical_metas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_full_historical_metas" ON public.historical_metas;
CREATE POLICY "anon_full_historical_metas" ON public.historical_metas
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.historical_metas TO anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_hist_metas_product ON public.historical_metas(product);

-- ─── Realtime ─────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public' AND tablename = 'historical_rows'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.historical_rows;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public' AND tablename = 'historical_metas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.historical_metas;
  END IF;
END $$;


-- ▲▲▲ 004_create_missing_tables.sql ▲▲▲

-- ▼▼▼ 005_campaign_metrics_upsert_constraint.sql ▼▼▼
-- ============================================================
-- GSAStúdio Hub — Unique constraint para upsert diário do Meta
-- Execute no Supabase SQL Editor antes de usar o auto-sync
-- ============================================================

-- Remove duplicatas mantendo a linha mais recente por (date, campaign_name, source)
DELETE FROM public.campaign_metrics
WHERE id NOT IN (
  SELECT DISTINCT ON (date, campaign_name, source) id
  FROM public.campaign_metrics
  ORDER BY date, campaign_name, source, created_at DESC
);

-- Adiciona constraint única para habilitar upsert eficiente.
-- Postgres não aceita ADD CONSTRAINT IF NOT EXISTS — bloco DO idempotente.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'campaign_metrics_date_campaign_source_key'
      AND conrelid = 'public.campaign_metrics'::regclass
  ) THEN
    ALTER TABLE public.campaign_metrics
      ADD CONSTRAINT campaign_metrics_date_campaign_source_key
      UNIQUE (date, campaign_name, source);
  END IF;
END $$;


-- ▲▲▲ 005_campaign_metrics_upsert_constraint.sql ▲▲▲

-- ▼▼▼ 006_campaign_creatives.sql ▼▼▼
-- ============================================================
-- GSAStúdio Hub — Criativos: tabela + bucket Supabase Storage
-- Execute no Supabase SQL Editor
-- ============================================================

-- ─── Tabela ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campaign_creatives (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_name   TEXT        NOT NULL UNIQUE,
  ad_account_id   TEXT        NOT NULL DEFAULT '',
  meta_url        TEXT        NOT NULL DEFAULT '',
  storage_path    TEXT        NOT NULL DEFAULT '',
  storage_url     TEXT        NOT NULL DEFAULT '',
  ad_link         TEXT        NOT NULL DEFAULT '',
  notes           TEXT        NOT NULL DEFAULT '',
  starred         BOOLEAN     NOT NULL DEFAULT false,
  starred_at      TIMESTAMPTZ,
  saved_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.campaign_creatives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_full_campaign_creatives" ON public.campaign_creatives;
CREATE POLICY "anon_full_campaign_creatives" ON public.campaign_creatives
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_creatives TO anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_creatives_campaign ON public.campaign_creatives(campaign_name);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_creatives_updated_at ON public.campaign_creatives;
DROP TRIGGER IF EXISTS trg_creatives_updated_at ON public.campaign_creatives;
CREATE TRIGGER trg_creatives_updated_at
  BEFORE UPDATE ON public.campaign_creatives
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Bucket Supabase Storage ──────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'creatives',
  'creatives',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Políticas de acesso ao bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'creatives_public_read'
  ) THEN
    DROP POLICY IF EXISTS "creatives_public_read" ON storage.objects;
    CREATE POLICY "creatives_public_read" ON storage.objects
      FOR SELECT TO anon, authenticated USING (bucket_id = 'creatives');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'creatives_upload'
  ) THEN
    DROP POLICY IF EXISTS "creatives_upload" ON storage.objects;
    CREATE POLICY "creatives_upload" ON storage.objects
      FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'creatives');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'creatives_update'
  ) THEN
    DROP POLICY IF EXISTS "creatives_update" ON storage.objects;
    CREATE POLICY "creatives_update" ON storage.objects
      FOR UPDATE TO anon, authenticated USING (bucket_id = 'creatives');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'creatives_delete'
  ) THEN
    DROP POLICY IF EXISTS "creatives_delete" ON storage.objects;
    CREATE POLICY "creatives_delete" ON storage.objects
      FOR DELETE TO anon, authenticated USING (bucket_id = 'creatives');
  END IF;
END $$;

-- Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public' AND tablename = 'campaign_creatives'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_creatives;
  END IF;
END $$;


-- ▲▲▲ 006_campaign_creatives.sql ▲▲▲

-- ▼▼▼ 007_user_categories.sql ▼▼▼
-- ============================================================
-- GSAStúdio Hub — User Categories & Account Entries
-- Painel de Controle: categorias (fixas + custom) e contas vinculadas
-- ============================================================

-- 1. user_categories: one row per category per user
-- Fixed categories (slug: pos, livros, ebooks, perpetuo, eventos)
-- Custom categories (slug: uuid generated on client)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_categories (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug          TEXT        NOT NULL,
  name          TEXT        NOT NULL,
  type          TEXT        NOT NULL DEFAULT 'fixed' CHECK (type IN ('fixed', 'custom')),
  emoji         TEXT,
  position      INTEGER     NOT NULL DEFAULT 0,
  is_enabled    BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, slug)
);

-- 2. user_account_entries: ad accounts linked to a category
-- unlimited per category; campaigns stored as JSONB snapshot
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_account_entries (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id           UUID        NOT NULL REFERENCES public.user_categories(id) ON DELETE CASCADE,
  label                 TEXT        NOT NULL,
  ad_account_id         TEXT        NOT NULL,
  campaigns             JSONB       NOT NULL DEFAULT '[]',
  selected_campaign_ids TEXT[]      NOT NULL DEFAULT '{}',
  is_enabled            BOOLEAN     NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Row Level Security
-- -------------------------------------------------------
ALTER TABLE public.user_categories      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_account_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_categories_owner" ON public.user_categories;
CREATE POLICY "user_categories_owner" ON public.user_categories
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_account_entries_owner" ON public.user_account_entries;
CREATE POLICY "user_account_entries_owner" ON public.user_account_entries
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. Indexes
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_user_categories_user_id
  ON public.user_categories(user_id);

CREATE INDEX IF NOT EXISTS idx_user_account_entries_user_id
  ON public.user_account_entries(user_id);

CREATE INDEX IF NOT EXISTS idx_user_account_entries_category_id
  ON public.user_account_entries(category_id);


-- ▲▲▲ 007_user_categories.sql ▲▲▲

-- ▼▼▼ 008_user_account_internal_filter.sql ▼▼▼
-- Subfiltro interno por categoria fixa (ex.: BM, TF) na vinculação de contas Meta
ALTER TABLE public.user_account_entries
  ADD COLUMN IF NOT EXISTS internal_filter TEXT;


-- ▲▲▲ 008_user_account_internal_filter.sql ▲▲▲

-- ▼▼▼ 009_security_linter_fixes.sql ▼▼▼
-- ============================================================
-- GSAStúdio Hub — Correções de segurança (Supabase Database Linter)
--
-- Resolve:
--   • function_search_path_mutable (set_updated_at, set_updated_at_dashboard_data_source)
--   • rls_policy_always_true em escritas (mantém SELECT público onde já existia)
--   • public_bucket_allows_listing (remove SELECT amplo em storage.objects)
--
-- Não altera: Auth "Leaked password protection" — ativar no Dashboard:
--   Authentication → Providers → Email → "Prevent use of leaked passwords"
-- ============================================================

-- ─── 1) Funções: search_path fixo (evita search_path mutável) ─────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at_dashboard_data_source()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ─── 2) campaign_metrics — escritas só com sessão autenticada ────────────────
DROP POLICY IF EXISTS "authenticated_write_campaign_metrics" ON public.campaign_metrics;
DROP POLICY IF EXISTS "authenticated_update_campaign_metrics" ON public.campaign_metrics;
DROP POLICY IF EXISTS "authenticated_delete_campaign_metrics" ON public.campaign_metrics;

DROP POLICY IF EXISTS "authenticated_insert_campaign_metrics" ON public.campaign_metrics;
DROP POLICY IF EXISTS "authenticated_insert_campaign_metrics" ON public.campaign_metrics;
CREATE POLICY "authenticated_insert_campaign_metrics"
  ON public.campaign_metrics FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "authenticated_update_campaign_metrics" ON public.campaign_metrics;
DROP POLICY IF EXISTS "authenticated_update_campaign_metrics" ON public.campaign_metrics;
CREATE POLICY "authenticated_update_campaign_metrics"
  ON public.campaign_metrics FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "authenticated_delete_campaign_metrics" ON public.campaign_metrics;
DROP POLICY IF EXISTS "authenticated_delete_campaign_metrics" ON public.campaign_metrics;
CREATE POLICY "authenticated_delete_campaign_metrics"
  ON public.campaign_metrics FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "anon_read_campaign_metrics" ON public.campaign_metrics;
DROP POLICY IF EXISTS "anon_read_campaign_metrics" ON public.campaign_metrics;
CREATE POLICY "anon_read_campaign_metrics"
  ON public.campaign_metrics FOR SELECT TO anon
  USING (true);

-- ─── 3) dashboard_data_source — separar leitura (anon ok) de escrita ─────────
DROP POLICY IF EXISTS "authenticated_write_dashboard_data_source" ON public.dashboard_data_source;

DROP POLICY IF EXISTS "anon_read_dashboard_data_source" ON public.dashboard_data_source;
DROP POLICY IF EXISTS "anon_read_dashboard_data_source" ON public.dashboard_data_source;
CREATE POLICY "anon_read_dashboard_data_source"
  ON public.dashboard_data_source FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS "authenticated_update_dashboard_data_source" ON public.dashboard_data_source;
DROP POLICY IF EXISTS "authenticated_update_dashboard_data_source" ON public.dashboard_data_source;
CREATE POLICY "authenticated_update_dashboard_data_source"
  ON public.dashboard_data_source FOR UPDATE TO authenticated
  USING (id IS TRUE AND auth.uid() IS NOT NULL)
  WITH CHECK (id IS TRUE AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "authenticated_insert_dashboard_data_source" ON public.dashboard_data_source;
DROP POLICY IF EXISTS "authenticated_insert_dashboard_data_source" ON public.dashboard_data_source;
CREATE POLICY "authenticated_insert_dashboard_data_source"
  ON public.dashboard_data_source FOR INSERT TO authenticated
  WITH CHECK (id IS TRUE AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "authenticated_delete_dashboard_data_source" ON public.dashboard_data_source;
DROP POLICY IF EXISTS "authenticated_delete_dashboard_data_source" ON public.dashboard_data_source;
CREATE POLICY "authenticated_delete_dashboard_data_source"
  ON public.dashboard_data_source FOR DELETE TO authenticated
  USING (id IS TRUE AND auth.uid() IS NOT NULL);

-- ─── 4) categoria — referência: leitura pública; escrita só autenticada ───────
DROP POLICY IF EXISTS "authenticated_write_categoria" ON public.categoria;

DROP POLICY IF EXISTS "authenticated_insert_categoria" ON public.categoria;
DROP POLICY IF EXISTS "authenticated_insert_categoria" ON public.categoria;
CREATE POLICY "authenticated_insert_categoria"
  ON public.categoria FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "authenticated_update_categoria" ON public.categoria;
DROP POLICY IF EXISTS "authenticated_update_categoria" ON public.categoria;
CREATE POLICY "authenticated_update_categoria"
  ON public.categoria FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "authenticated_delete_categoria" ON public.categoria;
DROP POLICY IF EXISTS "authenticated_delete_categoria" ON public.categoria;
CREATE POLICY "authenticated_delete_categoria"
  ON public.categoria FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- ─── 5) historical_rows — anon só leitura; mutações com JWT ───────────────────
DROP POLICY IF EXISTS "anon_full_historical_rows" ON public.historical_rows;

DROP POLICY IF EXISTS "historical_rows_select" ON public.historical_rows;
DROP POLICY IF EXISTS "historical_rows_select" ON public.historical_rows;
CREATE POLICY "historical_rows_select"
  ON public.historical_rows FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "historical_rows_insert" ON public.historical_rows;
DROP POLICY IF EXISTS "historical_rows_insert" ON public.historical_rows;
CREATE POLICY "historical_rows_insert"
  ON public.historical_rows FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "historical_rows_update" ON public.historical_rows;
DROP POLICY IF EXISTS "historical_rows_update" ON public.historical_rows;
CREATE POLICY "historical_rows_update"
  ON public.historical_rows FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "historical_rows_delete" ON public.historical_rows;
DROP POLICY IF EXISTS "historical_rows_delete" ON public.historical_rows;
CREATE POLICY "historical_rows_delete"
  ON public.historical_rows FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- ─── 6) historical_metas ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "anon_full_historical_metas" ON public.historical_metas;

DROP POLICY IF EXISTS "historical_metas_select" ON public.historical_metas;
DROP POLICY IF EXISTS "historical_metas_select" ON public.historical_metas;
CREATE POLICY "historical_metas_select"
  ON public.historical_metas FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "historical_metas_insert" ON public.historical_metas;
DROP POLICY IF EXISTS "historical_metas_insert" ON public.historical_metas;
CREATE POLICY "historical_metas_insert"
  ON public.historical_metas FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "historical_metas_update" ON public.historical_metas;
DROP POLICY IF EXISTS "historical_metas_update" ON public.historical_metas;
CREATE POLICY "historical_metas_update"
  ON public.historical_metas FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "historical_metas_delete" ON public.historical_metas;
DROP POLICY IF EXISTS "historical_metas_delete" ON public.historical_metas;
CREATE POLICY "historical_metas_delete"
  ON public.historical_metas FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- ─── 7) campaign_creatives ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "anon_full_campaign_creatives" ON public.campaign_creatives;

DROP POLICY IF EXISTS "campaign_creatives_select" ON public.campaign_creatives;
DROP POLICY IF EXISTS "campaign_creatives_select" ON public.campaign_creatives;
CREATE POLICY "campaign_creatives_select"
  ON public.campaign_creatives FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "campaign_creatives_insert" ON public.campaign_creatives;
DROP POLICY IF EXISTS "campaign_creatives_insert" ON public.campaign_creatives;
CREATE POLICY "campaign_creatives_insert"
  ON public.campaign_creatives FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "campaign_creatives_update" ON public.campaign_creatives;
DROP POLICY IF EXISTS "campaign_creatives_update" ON public.campaign_creatives;
CREATE POLICY "campaign_creatives_update"
  ON public.campaign_creatives FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "campaign_creatives_delete" ON public.campaign_creatives;
DROP POLICY IF EXISTS "campaign_creatives_delete" ON public.campaign_creatives;
CREATE POLICY "campaign_creatives_delete"
  ON public.campaign_creatives FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- ─── 8) Storage — bucket público: URLs de objeto não precisam desta política ──
--    Remove listagem ampla via Data API (lint 0025). Upload/update/delete mantêm-se.
DROP POLICY IF EXISTS "creatives_public_read" ON storage.objects;


-- ▲▲▲ 009_security_linter_fixes.sql ▲▲▲

-- ▼▼▼ 010_historical_turma.sql ▼▼▼
-- Add turma (edition/class) column to historical_rows
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)

ALTER TABLE public.historical_rows
  ADD COLUMN IF NOT EXISTS turma TEXT;


-- ▲▲▲ 010_historical_turma.sql ▲▲▲

-- ▼▼▼ 011_user_tags.sql ▼▼▼
-- ─── 011: Custom historical tags per user ──────────────────────────────────
-- Stores up to 5 custom filter tags per user per historical kind.

CREATE TABLE IF NOT EXISTS public.user_tags (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind       TEXT        NOT NULL CHECK (kind IN ('lancamento','evento','perpetuo','instagram')),
  name       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, kind, name)
);

ALTER TABLE public.user_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_tags_select" ON public.user_tags;
CREATE POLICY "user_tags_select" ON public.user_tags
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_tags_insert" ON public.user_tags;
CREATE POLICY "user_tags_insert" ON public.user_tags
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_tags_delete" ON public.user_tags;
CREATE POLICY "user_tags_delete" ON public.user_tags
  FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, DELETE ON public.user_tags TO authenticated;


-- ▲▲▲ 011_user_tags.sql ▲▲▲

-- ▼▼▼ 012_products.sql ▼▼▼
-- ─── 012: Products table ────────────────────────────────────────────────────
-- Stores the full ProductData as JSONB so it's shared across all devices
-- for the same authenticated user.

CREATE TABLE IF NOT EXISTS public.products (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL CHECK (type IN ('pos','imersao')),
  data       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_select" ON public.products;
CREATE POLICY "products_select" ON public.products
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "products_insert" ON public.products;
CREATE POLICY "products_insert" ON public.products
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "products_update" ON public.products;
CREATE POLICY "products_update" ON public.products
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "products_delete" ON public.products;
CREATE POLICY "products_delete" ON public.products
  FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;


-- ▲▲▲ 012_products.sql ▲▲▲

-- ▼▼▼ 013_campaign_metrics_leads.sql ▼▼▼
-- ============================================================
-- GSAStúdio Hub — Add leads column to campaign_metrics
-- Execute no Supabase SQL Editor (Dashboard > SQL Editor > New query)
-- Depois: no app, use "Atualizar Meta" ou Importar para re-sincronizar.
-- ============================================================

alter table public.campaign_metrics
  add column if not exists leads numeric not null default 0;


-- ▲▲▲ 013_campaign_metrics_leads.sql ▲▲▲

-- ▼▼▼ 014_products_shared_select.sql ▼▼▼
-- ─── 014: Products shared select ────────────────────────────────────────────
-- Allow all authenticated users to read all products (shared like historical).
-- Write operations (insert/update/delete) remain user-scoped.

DROP POLICY IF EXISTS "products_select" ON public.products;

DROP POLICY IF EXISTS "products_select" ON public.products;
CREATE POLICY "products_select" ON public.products
  FOR SELECT
  TO authenticated
  USING (true);


-- ▲▲▲ 014_products_shared_select.sql ▲▲▲

-- ▼▼▼ 015_instagram_data_tracking.sql ▼▼▼
-- ─── instagram_groups ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.instagram_groups (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  description TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── instagram_accounts ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.instagram_accounts (
  id                            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  instagram_business_account_id TEXT        NOT NULL UNIQUE,
  username                      TEXT        NOT NULL,
  name                          TEXT        NOT NULL DEFAULT '',
  biography                     TEXT        NOT NULL DEFAULT '',
  profile_picture_url           TEXT,
  followers_count               INTEGER     NOT NULL DEFAULT 0,
  follows_count                 INTEGER     NOT NULL DEFAULT 0,
  media_count                   INTEGER     NOT NULL DEFAULT 0,
  is_verified                   BOOLEAN     NOT NULL DEFAULT false,
  engagement_rate               NUMERIC     NOT NULL DEFAULT 0,
  access_token                  TEXT        NOT NULL,
  group_id                      UUID        REFERENCES public.instagram_groups(id) ON DELETE SET NULL,
  is_favorite                   BOOLEAN     NOT NULL DEFAULT false,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── instagram_account_history ────────────────────────────────────────────────
-- Daily snapshots: absolute counts + daily deltas where available
CREATE TABLE IF NOT EXISTS public.instagram_account_history (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id             UUID        NOT NULL REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  date                   DATE        NOT NULL,
  followers_count        INTEGER     NOT NULL DEFAULT 0,
  following_count        INTEGER     NOT NULL DEFAULT 0,
  media_count            INTEGER     NOT NULL DEFAULT 0,
  daily_followers_gained INTEGER     NOT NULL DEFAULT 0,
  profile_views          INTEGER     NOT NULL DEFAULT 0,
  reach                  INTEGER     NOT NULL DEFAULT 0,
  impressions            INTEGER     NOT NULL DEFAULT 0,
  engagement_rate        NUMERIC     NOT NULL DEFAULT 0,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(account_id, date)
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ig_accounts_iba_id   ON public.instagram_accounts(instagram_business_account_id);
CREATE INDEX IF NOT EXISTS idx_ig_accounts_username  ON public.instagram_accounts(username);
CREATE INDEX IF NOT EXISTS idx_ig_accounts_group_id  ON public.instagram_accounts(group_id);
CREATE INDEX IF NOT EXISTS idx_ig_hist_account_id    ON public.instagram_account_history(account_id);
CREATE INDEX IF NOT EXISTS idx_ig_hist_date          ON public.instagram_account_history(date);
CREATE INDEX IF NOT EXISTS idx_ig_hist_account_date  ON public.instagram_account_history(account_id, date);

-- ─── Realtime publication ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public' AND tablename = 'instagram_accounts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.instagram_accounts;
  END IF;
END $$;


-- ▲▲▲ 015_instagram_data_tracking.sql ▲▲▲

-- ▼▼▼ 016_advertiser_profiles_and_settings.sql ▼▼▼
-- ============================================================
-- DashMonster — Advertiser Profiles & User Settings
-- Persiste perfis de anunciante e token Meta na conta do usuário
-- (antes ficavam apenas em localStorage do browser)
-- ============================================================

-- 1. advertiser_profiles: one row per user, JSONB blob
--    A abordagem de blob (em vez de uma linha por perfil) simplifica o
--    merge client-side e evita race conditions em operações batch.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.advertiser_profiles (
  user_id    UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  profiles   JSONB       NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.advertiser_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "advertiser_profiles_owner" ON public.advertiser_profiles;
CREATE POLICY "advertiser_profiles_owner" ON public.advertiser_profiles
  FOR ALL TO authenticated
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. user_settings: meta token e outras configurações por usuário
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id           UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  meta_access_token TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_settings_owner" ON public.user_settings;
CREATE POLICY "user_settings_owner" ON public.user_settings
  FOR ALL TO authenticated
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. Helper function to auto-update updated_at on any write
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_advertiser_profiles_updated_at ON public.advertiser_profiles;
CREATE TRIGGER trg_advertiser_profiles_updated_at
  BEFORE UPDATE ON public.advertiser_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_user_settings_updated_at ON public.user_settings;
CREATE TRIGGER trg_user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ▲▲▲ 016_advertiser_profiles_and_settings.sql ▲▲▲

-- ▼▼▼ 017_instagram_webhook_events.sql ▼▼▼
-- ─── instagram_webhook_events ─────────────────────────────────────────────────
-- Armazena todos os eventos recebidos pelo webhook em tempo real.
-- Útil para auditoria, reprocessamento e futuros alertas.

CREATE TABLE IF NOT EXISTS public.instagram_webhook_events (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ig_account_id  TEXT        NOT NULL,   -- Instagram Business Account ID (da Meta)
  field          TEXT        NOT NULL,   -- ex: "comments", "follows", "story_insights"
  payload        JSONB       NOT NULL DEFAULT '{}',
  received_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at   TIMESTAMPTZ,            -- preenchido após reprocessamento manual
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ig_webhook_events_account
  ON public.instagram_webhook_events(ig_account_id);

CREATE INDEX IF NOT EXISTS idx_ig_webhook_events_field
  ON public.instagram_webhook_events(field);

CREATE INDEX IF NOT EXISTS idx_ig_webhook_events_received
  ON public.instagram_webhook_events(received_at DESC);

-- RLS: somente service_role pode ler/escrever (webhook roda server-side)
ALTER TABLE public.instagram_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_only" ON public.instagram_webhook_events;
CREATE POLICY "service_role_only" ON public.instagram_webhook_events
  USING (auth.role() = 'service_role');


-- ▲▲▲ 017_instagram_webhook_events.sql ▲▲▲

-- ▼▼▼ 018_instagram_security.sql ▼▼▼
-- ============================================================
-- Instagram — Segurança + colunas faltantes
--
-- Resolve:
--   • access_token legível por qualquer cliente anon (texto puro) → bloqueia
--     leitura da coluna no nível do Postgres (column-level REVOKE). O token
--     agora é gravado cifrado (AES-256-GCM) e só o service_role lê.
--   • daily_unfollows: rotas já gravam, mas a migração 015 não criou a coluna
--     (bug latente → upsert falhava silenciosamente nessa coluna).
--   • token_expires_at / connection_status: estado da conexão para a UI avisar
--     quando precisar reconectar.
--   • RLS habilitado nas tabelas IG (linter), preservando leitura/escrita atual
--     do dashboard (favoritar, mover de grupo) feita com a chave anon.
-- ============================================================

-- ─── 1) Colunas novas ─────────────────────────────────────────────────────────
ALTER TABLE public.instagram_accounts
  ADD COLUMN IF NOT EXISTS token_expires_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS connection_status TEXT NOT NULL DEFAULT 'active';
  -- connection_status: 'active' | 'expired' | 'error'

ALTER TABLE public.instagram_account_history
  ADD COLUMN IF NOT EXISTS daily_unfollows INTEGER NOT NULL DEFAULT 0;

-- ─── 2) Proteger access_token (column-level privilege) ────────────────────────
-- Mesmo sem RLS, isto impede `select access_token` por anon/authenticated.
-- O cliente (supabaseInstagram.ts) já seleciona apenas colunas explícitas sem o
-- token, então nada quebra. As rotas server-side usam service_role (bypassa).
REVOKE SELECT (access_token) ON public.instagram_accounts FROM anon;
REVOKE SELECT (access_token) ON public.instagram_accounts FROM authenticated;

-- ─── 3) RLS habilitado, preservando comportamento atual do dashboard ──────────
-- O app lê (e favorita/move de grupo) com a chave anon. Mantemos permissivo no
-- nível de linha; a proteção do token vem do REVOKE de coluna acima. As escritas
-- de sincronização passam a usar service_role (bypassa RLS de qualquer forma).

ALTER TABLE public.instagram_accounts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_account_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_groups          ENABLE ROW LEVEL SECURITY;

-- instagram_accounts
DROP POLICY IF EXISTS ig_accounts_select ON public.instagram_accounts;
DROP POLICY IF EXISTS ig_accounts_select ON public.instagram_accounts;
CREATE POLICY ig_accounts_select ON public.instagram_accounts
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS ig_accounts_update ON public.instagram_accounts;
DROP POLICY IF EXISTS ig_accounts_update ON public.instagram_accounts;
CREATE POLICY ig_accounts_update ON public.instagram_accounts
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS ig_accounts_delete ON public.instagram_accounts;
DROP POLICY IF EXISTS ig_accounts_delete ON public.instagram_accounts;
CREATE POLICY ig_accounts_delete ON public.instagram_accounts
  FOR DELETE TO anon, authenticated USING (true);

-- instagram_account_history (somente leitura pelo cliente; escrita via service_role)
DROP POLICY IF EXISTS ig_history_select ON public.instagram_account_history;
DROP POLICY IF EXISTS ig_history_select ON public.instagram_account_history;
CREATE POLICY ig_history_select ON public.instagram_account_history
  FOR SELECT TO anon, authenticated USING (true);

-- instagram_groups (criar/remover grupos pelo dashboard)
DROP POLICY IF EXISTS ig_groups_select ON public.instagram_groups;
DROP POLICY IF EXISTS ig_groups_select ON public.instagram_groups;
CREATE POLICY ig_groups_select ON public.instagram_groups
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS ig_groups_insert ON public.instagram_groups;
DROP POLICY IF EXISTS ig_groups_insert ON public.instagram_groups;
CREATE POLICY ig_groups_insert ON public.instagram_groups
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS ig_groups_delete ON public.instagram_groups;
DROP POLICY IF EXISTS ig_groups_delete ON public.instagram_groups;
CREATE POLICY ig_groups_delete ON public.instagram_groups
  FOR DELETE TO anon, authenticated USING (true);


-- ▲▲▲ 018_instagram_security.sql ▲▲▲

-- ▼▼▼ 019_user_manual_overrides.sql ▼▼▼
-- ============================================================
-- DashMonster — Manual Overrides por usuário, grupo e campanha
-- Valores editados na mão (vendas Eduzz, ingressos, faturamento)
-- saem do localStorage e passam a viver na conta do usuário,
-- presos ao contexto (grupo + campanha) onde foram digitados.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_manual_overrides (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id       TEXT        NOT NULL,   -- "all"/"global"/"profile" ou id do grupo
  campaign_id    TEXT        NOT NULL,   -- "all" quando nenhuma campanha específica
  sales_total    NUMERIC     NOT NULL DEFAULT 0,
  sales_ingresso NUMERIC     NOT NULL DEFAULT 0,
  sales_pos      NUMERIC     NOT NULL DEFAULT 0,
  tickets        NUMERIC     NOT NULL DEFAULT 0,   -- Ingressos vendidos (manual)
  revenue        NUMERIC     NOT NULL DEFAULT 0,   -- Faturamento (manual)
  note           TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, group_id, campaign_id)
);

ALTER TABLE public.user_manual_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_manual_overrides_owner" ON public.user_manual_overrides;
CREATE POLICY "user_manual_overrides_owner" ON public.user_manual_overrides
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_manual_overrides_user_id
  ON public.user_manual_overrides(user_id);


-- ▲▲▲ 019_user_manual_overrides.sql ▲▲▲

-- ▼▼▼ 020_campaign_metrics_page_views.sql ▼▼▼
-- ============================================================
-- campaign_metrics: coluna page_views (Visualizações de Página)
-- landing_page_view da Meta. Alimenta a etapa "Vis. de Página" e a
-- "Tx. Captura"/"Connect Rate" do funil do Dashboard.
-- ============================================================

ALTER TABLE public.campaign_metrics
  ADD COLUMN IF NOT EXISTS page_views NUMERIC NOT NULL DEFAULT 0;


-- ▲▲▲ 020_campaign_metrics_page_views.sql ▲▲▲

-- ▼▼▼ 021_companies_multi_tenant.sql ▼▼▼
-- ============================================================
-- GSAStúdio Hub — Multi-tenant: Empresas
-- Execute este SQL no Supabase SQL Editor
--
-- 1) companies + company_members (roles: owner/manager/viewer)
-- 2) helper functions para RLS sem recursão
-- 3) company_id em todas as tabelas de dados
-- 4) seed: empresa default + backfill de dados existentes
-- 5) campaign_center_entries (Central de Campanhas compartilhada)
-- ============================================================

-- ------------------------------------------------------------
-- 1) Empresas e membros
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.companies (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  slug       TEXT        NOT NULL UNIQUE,
  logo_url   TEXT,
  -- Pré-configuração do owner: filtros padrão, colunas do histórico, etc.
  settings   JSONB       NOT NULL DEFAULT '{}',
  created_by UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.company_members (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT        NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'manager', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_company_members_user_id    ON public.company_members(user_id);
CREATE INDEX IF NOT EXISTS idx_company_members_company_id ON public.company_members(company_id);

-- ------------------------------------------------------------
-- 2) Helpers RLS (SECURITY DEFINER evita recursão em company_members)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_company_member(cid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members
    WHERE company_id = cid AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.company_role(cid UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.company_members
  WHERE company_id = cid AND user_id = auth.uid()
  LIMIT 1;
$$;

-- Pode escrever dados da empresa? (owner ou manager)
CREATE OR REPLACE FUNCTION public.can_write_company(cid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(public.company_role(cid) IN ('owner', 'manager'), false);
$$;

-- ------------------------------------------------------------
-- 3) RLS de companies / company_members
-- ------------------------------------------------------------
ALTER TABLE public.companies       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "companies_member_select" ON public.companies;
DROP POLICY IF EXISTS "companies_member_select" ON public.companies;
CREATE POLICY "companies_member_select" ON public.companies
  FOR SELECT TO authenticated
  USING (public.is_company_member(id));

DROP POLICY IF EXISTS "companies_owner_update" ON public.companies;
DROP POLICY IF EXISTS "companies_owner_update" ON public.companies;
CREATE POLICY "companies_owner_update" ON public.companies
  FOR UPDATE TO authenticated
  USING (public.company_role(id) = 'owner')
  WITH CHECK (public.company_role(id) = 'owner');

DROP POLICY IF EXISTS "company_members_select" ON public.company_members;
DROP POLICY IF EXISTS "company_members_select" ON public.company_members;
CREATE POLICY "company_members_select" ON public.company_members
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

DROP POLICY IF EXISTS "company_members_owner_all" ON public.company_members;
DROP POLICY IF EXISTS "company_members_owner_all" ON public.company_members;
CREATE POLICY "company_members_owner_all" ON public.company_members
  FOR ALL TO authenticated
  USING (public.company_role(company_id) = 'owner')
  WITH CHECK (public.company_role(company_id) = 'owner');

-- ------------------------------------------------------------
-- 4) company_id nas tabelas de dados existentes
-- ------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'user_categories',
    'user_account_entries',
    'campaign_metrics',
    'historical_rows',
    'historical_metas',
    'products',
    'user_tags',
    'instagram_accounts',
    'instagram_groups',
    'campaign_creatives',
    'user_manual_overrides',
    'advertiser_profiles'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE', t);
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS idx_%s_company_id ON public.%I(company_id)', t, t);
    END IF;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 5) Seed: empresa default + membros + backfill
--    Empresa atual (educação) vira a primeira empresa.
--    Usuário admin = owner; demais usuários existentes = manager.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_company_id UUID;
  v_admin_id   UUID := '11111111-1111-1111-1111-111111111111';
  t TEXT;
  tables TEXT[] := ARRAY[
    'user_categories', 'user_account_entries', 'campaign_metrics',
    'historical_rows', 'historical_metas', 'products', 'user_tags',
    'instagram_accounts', 'instagram_groups', 'campaign_creatives',
    'user_manual_overrides', 'advertiser_profiles'
  ];
BEGIN
  INSERT INTO public.companies (name, slug, created_by)
  VALUES ('Empresa Padrão', 'principal', v_admin_id)
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO v_company_id FROM public.companies WHERE slug = 'principal';

  -- admin = owner
  INSERT INTO public.company_members (company_id, user_id, role)
  SELECT v_company_id, v_admin_id, 'owner'
  WHERE EXISTS (SELECT 1 FROM auth.users WHERE id = v_admin_id)
  ON CONFLICT (company_id, user_id) DO NOTHING;

  -- demais usuários existentes = manager (ajuste roles depois se necessário)
  INSERT INTO public.company_members (company_id, user_id, role)
  SELECT v_company_id, u.id, 'manager'
  FROM auth.users u
  WHERE u.id <> v_admin_id
  ON CONFLICT (company_id, user_id) DO NOTHING;

  -- backfill: tudo que existe pertence à empresa default
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format(
        'UPDATE public.%I SET company_id = $1 WHERE company_id IS NULL', t)
      USING v_company_id;
    END IF;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 6) Novas policies por empresa (substituem as antigas por usuário
--    ou as permissivas "todos autenticados")
--    SELECT: qualquer membro | INSERT/UPDATE/DELETE: owner ou manager
-- ------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
  p RECORD;
  tables TEXT[] := ARRAY[
    'user_categories', 'user_account_entries', 'campaign_metrics',
    'historical_rows', 'historical_metas', 'products', 'user_tags',
    'instagram_accounts', 'instagram_groups', 'campaign_creatives',
    'user_manual_overrides', 'advertiser_profiles'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = t) THEN
      -- remove todas as policies antigas da tabela
      FOR p IN SELECT policyname FROM pg_policies
               WHERE schemaname = 'public' AND tablename = t LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
      END LOOP;

      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
         USING (public.is_company_member(company_id))',
        t || '_company_select', t);

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
         WITH CHECK (public.can_write_company(company_id))',
        t || '_company_insert', t);

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
         USING (public.can_write_company(company_id))
         WITH CHECK (public.can_write_company(company_id))',
        t || '_company_update', t);

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
         USING (public.can_write_company(company_id))',
        t || '_company_delete', t);
    END IF;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 6b) Categorias agora são da empresa: slug único por empresa
--     (antes era por usuário — cada usuário tinha sua cópia)
--     Dedup: mantém a categoria mais antiga de cada (company_id, slug),
--     re-aponta as entries das duplicadas antes de removê-las.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_moved     INT;
  v_deleted   INT;
  v_remaining INT;
BEGIN
  -- re-aponta entries das categorias duplicadas para a sobrevivente (mais antiga)
  UPDATE public.user_account_entries e
  SET    category_id = k.keep_id
  FROM   public.user_categories dup,
  LATERAL (
    SELECT id AS keep_id
    FROM   public.user_categories s
    WHERE  s.company_id IS NOT DISTINCT FROM dup.company_id
      AND  s.slug = dup.slug
    ORDER BY s.created_at, s.id
    LIMIT 1
  ) k
  WHERE  e.category_id = dup.id
    AND  dup.id <> k.keep_id;
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  -- remove as duplicadas (mantém rn = 1)
  DELETE FROM public.user_categories c
  USING (
    SELECT id,
           row_number() OVER (
             PARTITION BY company_id, slug
             ORDER BY created_at, id
           ) AS rn
    FROM public.user_categories
  ) r
  WHERE c.id = r.id AND r.rn > 1;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  SELECT count(*) INTO v_remaining FROM (
    SELECT 1 FROM public.user_categories
    GROUP BY company_id, slug HAVING count(*) > 1
  ) d;

  RAISE NOTICE 'dedup categorias: % entries re-apontadas, % categorias removidas, % duplicatas restantes',
    v_moved, v_deleted, v_remaining;

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'dedup não eliminou todas as duplicatas (%) — me mostre este erro', v_remaining;
  END IF;
END $$;

ALTER TABLE public.user_categories
  DROP CONSTRAINT IF EXISTS user_categories_user_id_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_categories_company_slug
  ON public.user_categories(company_id, slug);

-- ------------------------------------------------------------
-- 7) Central de Campanhas compartilhada (substitui localStorage)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campaign_center_entries (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  campaign_id      TEXT        NOT NULL,
  campaign_name    TEXT        NOT NULL,
  ad_account_id    TEXT        NOT NULL,
  ad_account_label TEXT        NOT NULL DEFAULT '',
  intent           TEXT        NOT NULL DEFAULT 'lead_gen'
    CHECK (intent IN ('lead_gen','direct_sale','profile_growth','traffic','awareness','remarketing')),
  result_type      TEXT,
  group_id         TEXT,
  monthly_budget   NUMERIC,
  goals            JSONB       NOT NULL DEFAULT '{}',
  enabled          BOOLEAN     NOT NULL DEFAULT true,
  -- true = auto-configurada na importação, ainda não revisada por humano
  auto_configured  BOOLEAN     NOT NULL DEFAULT true,
  created_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_center_entries_company_id
  ON public.campaign_center_entries(company_id);

ALTER TABLE public.campaign_center_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campaign_center_select" ON public.campaign_center_entries;
DROP POLICY IF EXISTS "campaign_center_select" ON public.campaign_center_entries;
CREATE POLICY "campaign_center_select" ON public.campaign_center_entries
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

DROP POLICY IF EXISTS "campaign_center_write" ON public.campaign_center_entries;
DROP POLICY IF EXISTS "campaign_center_write" ON public.campaign_center_entries;
CREATE POLICY "campaign_center_write" ON public.campaign_center_entries
  FOR ALL TO authenticated
  USING (public.can_write_company(company_id))
  WITH CHECK (public.can_write_company(company_id));

CREATE OR REPLACE FUNCTION public.set_updated_at_campaign_center()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_campaign_center_updated_at ON public.campaign_center_entries;
DROP TRIGGER IF EXISTS trg_campaign_center_updated_at ON public.campaign_center_entries;
CREATE TRIGGER trg_campaign_center_updated_at
BEFORE UPDATE ON public.campaign_center_entries
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_campaign_center();


-- ▲▲▲ 021_companies_multi_tenant.sql ▲▲▲

-- ▼▼▼ 022_company_meta_token.sql ▼▼▼
-- ============================================================
-- GSAStúdio Hub — Token Meta da Empresa
-- Execute este SQL no Supabase SQL Editor (após a 021)
--
-- Regra de ouro: o DONO da empresa configura o Access Token da
-- API Meta uma única vez e ele propaga para todos os membros —
-- ninguém mais precisa reconfigurar ao acessar.
--
-- Leitura: qualquer membro (o browser chama a Meta API direto).
-- Escrita: somente owner (policy companies_owner_update da 021).
-- ============================================================

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS meta_access_token TEXT;

-- Backfill: aproveita o token que o owner já tinha salvo em user_settings.
-- Condicional — a tabela user_settings pode não existir (migration 016 opcional).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'user_settings') THEN
    UPDATE public.companies c
    SET    meta_access_token = us.meta_access_token
    FROM   public.company_members m
    JOIN   public.user_settings us ON us.user_id = m.user_id
    WHERE  m.company_id = c.id
      AND  m.role = 'owner'
      AND  c.meta_access_token IS NULL
      AND  us.meta_access_token IS NOT NULL
      AND  us.meta_access_token <> '';
  END IF;
END $$;


-- ▲▲▲ 022_company_meta_token.sql ▲▲▲

-- ▼▼▼ 023_realtime_user_config.sql ▼▼▼
-- ============================================================
-- GSAStúdio Hub — Realtime para configuração
-- Execute este SQL no Supabase SQL Editor (após a 022)
--
-- Habilita Realtime nas tabelas de configuração para o dashboard
-- atualizar ao vivo quando qualquer membro da empresa altera algo
-- (categorias, contas vinculadas, Central de Campanhas).
-- ============================================================

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'user_categories',
    'user_account_entries',
    'campaign_center_entries',
    'companies'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = t) THEN
      BEGIN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      EXCEPTION WHEN duplicate_object THEN
        NULL; -- já está na publication
      END;
    END IF;
  END LOOP;
END $$;


-- ▲▲▲ 023_realtime_user_config.sql ▲▲▲

-- ▼▼▼ 024_company_fixes.sql ▼▼▼
-- ============================================================
-- GSAStúdio Hub — Correções multi-tenant
-- Execute este SQL no Supabase SQL Editor (após a 023)
--
-- 1) unique de campaign_metrics passa a incluir company_id:
--    sem isso, duas empresas com campanha de mesmo nome no mesmo
--    dia colidem no upsert (RLS bloquearia o update da outra)
-- 2) company_members.email: visível na tela de configuração da
--    empresa (auth.users não é acessível pelo client)
-- ============================================================

-- ------------------------------------------------------------
-- 1) Unique por empresa
-- ------------------------------------------------------------
ALTER TABLE public.campaign_metrics
  DROP CONSTRAINT IF EXISTS campaign_metrics_date_campaign_source_key;

-- remove duplicatas que violariam o novo unique (mantém a mais recente)
DELETE FROM public.campaign_metrics
WHERE id NOT IN (
  SELECT DISTINCT ON (company_id, date, campaign_name, source) id
  FROM public.campaign_metrics
  ORDER BY company_id, date, campaign_name, source, created_at DESC
);

ALTER TABLE public.campaign_metrics
  ADD CONSTRAINT campaign_metrics_company_date_campaign_source_key
  UNIQUE (company_id, date, campaign_name, source);

-- ------------------------------------------------------------
-- 2) E-mail dos membros (para a tela Empresa)
-- ------------------------------------------------------------
ALTER TABLE public.company_members
  ADD COLUMN IF NOT EXISTS email TEXT;

UPDATE public.company_members m
SET    email = u.email
FROM   auth.users u
WHERE  u.id = m.user_id
  AND  (m.email IS NULL OR m.email = '');

-- mantém o e-mail preenchido para novos membros
CREATE OR REPLACE FUNCTION public.fill_company_member_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.email IS NULL OR NEW.email = '' THEN
    SELECT email INTO NEW.email FROM auth.users WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_company_member_email ON public.company_members;
DROP TRIGGER IF EXISTS trg_company_member_email ON public.company_members;
CREATE TRIGGER trg_company_member_email
BEFORE INSERT OR UPDATE ON public.company_members
FOR EACH ROW EXECUTE FUNCTION public.fill_company_member_email();


-- ▲▲▲ 024_company_fixes.sql ▲▲▲

-- ▼▼▼ 025_company_invites.sql ▼▼▼
-- ============================================================
-- GSAStúdio Hub — Convite de membros por e-mail
-- Execute este SQL no Supabase SQL Editor (após a 024)
--
-- 1) company_invites: convites pendentes (pessoa ainda sem conta)
-- 2) RPC invite_company_member: owner convida por e-mail
--    - se a pessoa já tem conta → vira membro na hora
--    - se não → fica como convite pendente
-- 3) trigger no signup: ao criar conta, materializa convites pendentes
-- ============================================================

-- ------------------------------------------------------------
-- 1) Convites pendentes
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_invites (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email      TEXT        NOT NULL,
  role       TEXT        NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner','manager','viewer')),
  created_by UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, email)
);

CREATE INDEX IF NOT EXISTS idx_company_invites_email ON public.company_invites(lower(email));

ALTER TABLE public.company_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_invites_owner_all" ON public.company_invites;
DROP POLICY IF EXISTS "company_invites_owner_all" ON public.company_invites;
CREATE POLICY "company_invites_owner_all" ON public.company_invites
  FOR ALL TO authenticated
  USING (public.company_role(company_id) = 'owner')
  WITH CHECK (public.company_role(company_id) = 'owner');

-- ------------------------------------------------------------
-- 2) RPC: convidar membro por e-mail (owner-only)
--    retorna 'added' (virou membro) ou 'invited' (pendente)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.invite_company_member(
  p_company_id UUID,
  p_email      TEXT,
  p_role       TEXT
)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_email   TEXT := lower(trim(p_email));
  v_user_id UUID;
BEGIN
  -- só o dono da empresa pode convidar
  IF public.company_role(p_company_id) <> 'owner' THEN
    RAISE EXCEPTION 'Apenas o dono da empresa pode convidar membros.';
  END IF;

  IF p_role NOT IN ('owner','manager','viewer') THEN
    RAISE EXCEPTION 'Papel inválido: %', p_role;
  END IF;

  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = v_email LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    INSERT INTO public.company_members (company_id, user_id, role, email)
    VALUES (p_company_id, v_user_id, p_role, v_email)
    ON CONFLICT (company_id, user_id) DO UPDATE SET role = EXCLUDED.role;
    -- limpa convite pendente, se houver
    DELETE FROM public.company_invites WHERE company_id = p_company_id AND lower(email) = v_email;
    RETURN 'added';
  ELSE
    INSERT INTO public.company_invites (company_id, email, role, created_by)
    VALUES (p_company_id, v_email, p_role, auth.uid())
    ON CONFLICT (company_id, email) DO UPDATE SET role = EXCLUDED.role;
    RETURN 'invited';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.invite_company_member(UUID, TEXT, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 3) Ao criar conta, materializa os convites pendentes daquele e-mail
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.materialize_company_invites()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.company_members (company_id, user_id, role, email)
  SELECT i.company_id, NEW.id, i.role, lower(NEW.email)
  FROM   public.company_invites i
  WHERE  lower(i.email) = lower(NEW.email)
  ON CONFLICT (company_id, user_id) DO NOTHING;

  DELETE FROM public.company_invites WHERE lower(email) = lower(NEW.email);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_materialize_invites ON auth.users;
DROP TRIGGER IF EXISTS trg_materialize_invites ON auth.users;
CREATE TRIGGER trg_materialize_invites
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.materialize_company_invites();


-- ▲▲▲ 025_company_invites.sql ▲▲▲

-- ▼▼▼ 026_super_admin.sql ▼▼▼
-- ============================================================
-- GSAStúdio Hub — Super Admin (acesso DEV a todas as empresas)
-- Execute este SQL no Supabase SQL Editor (após a 025)
--
-- O modo DEV do app é só client-side (a senha vive no bundle). Para
-- realmente enxergar empresas/tokens/usuários de TODAS as empresas, o
-- usuário precisa ser super admin AQUI no banco — o RLS é quem decide.
--
-- 1) app_admins: lista de super admins
-- 2) is_super_admin(): helper para as policies
-- 3) policies de super admin: ver/editar todas as empresas, membros,
--    convites e dados
-- 4) seed: o usuário admin inicial vira super admin
-- ============================================================

-- ------------------------------------------------------------
-- 1) Tabela de super admins
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_admins (
  user_id    UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_admins ENABLE ROW LEVEL SECURITY;

-- cada usuário só consegue checar a própria linha (saber se é admin)
DROP POLICY IF EXISTS "app_admins_self_select" ON public.app_admins;
DROP POLICY IF EXISTS "app_admins_self_select" ON public.app_admins;
CREATE POLICY "app_admins_self_select" ON public.app_admins
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ------------------------------------------------------------
-- 2) Helper (SECURITY DEFINER evita recursão de RLS)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.app_admins WHERE user_id = auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

-- ------------------------------------------------------------
-- 3) Policies de super admin (somam-se às existentes via OR)
-- ------------------------------------------------------------
-- companies: ver e editar todas
DROP POLICY IF EXISTS "companies_superadmin_all" ON public.companies;
DROP POLICY IF EXISTS "companies_superadmin_all" ON public.companies;
CREATE POLICY "companies_superadmin_all" ON public.companies
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- company_members: ver e gerenciar membros de todas as empresas
DROP POLICY IF EXISTS "company_members_superadmin_all" ON public.company_members;
DROP POLICY IF EXISTS "company_members_superadmin_all" ON public.company_members;
CREATE POLICY "company_members_superadmin_all" ON public.company_members
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- company_invites: idem
DROP POLICY IF EXISTS "company_invites_superadmin_all" ON public.company_invites;
DROP POLICY IF EXISTS "company_invites_superadmin_all" ON public.company_invites;
CREATE POLICY "company_invites_superadmin_all" ON public.company_invites
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- dados das empresas: super admin lê/edita tudo (Setup, campanhas, etc.)
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'user_categories', 'user_account_entries', 'campaign_metrics',
    'historical_rows', 'historical_metas', 'products', 'user_tags',
    'instagram_accounts', 'instagram_groups', 'campaign_creatives',
    'user_manual_overrides', 'advertiser_profiles', 'campaign_center_entries'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_superadmin_all', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
         USING (public.is_super_admin()) WITH CHECK (public.is_super_admin())',
        t || '_superadmin_all', t);
    END IF;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 4) invite_company_member: super admin também pode convidar
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.invite_company_member(
  p_company_id UUID,
  p_email      TEXT,
  p_role       TEXT
)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_email   TEXT := lower(trim(p_email));
  v_user_id UUID;
BEGIN
  IF NOT (public.company_role(p_company_id) = 'owner' OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'Apenas o dono da empresa (ou super admin) pode convidar membros.';
  END IF;

  IF p_role NOT IN ('owner','manager','viewer') THEN
    RAISE EXCEPTION 'Papel inválido: %', p_role;
  END IF;

  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = v_email LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    INSERT INTO public.company_members (company_id, user_id, role, email)
    VALUES (p_company_id, v_user_id, p_role, v_email)
    ON CONFLICT (company_id, user_id) DO UPDATE SET role = EXCLUDED.role;
    DELETE FROM public.company_invites WHERE company_id = p_company_id AND lower(email) = v_email;
    RETURN 'added';
  ELSE
    INSERT INTO public.company_invites (company_id, email, role, created_by)
    VALUES (p_company_id, v_email, p_role, auth.uid())
    ON CONFLICT (company_id, email) DO UPDATE SET role = EXCLUDED.role;
    RETURN 'invited';
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- 5) Seed: usuário admin inicial vira super admin
-- ------------------------------------------------------------
INSERT INTO public.app_admins (user_id)
SELECT '11111111-1111-1111-1111-111111111111'
WHERE EXISTS (SELECT 1 FROM auth.users WHERE id = '11111111-1111-1111-1111-111111111111')
ON CONFLICT DO NOTHING;


-- ▲▲▲ 026_super_admin.sql ▲▲▲

-- ▼▼▼ 027_history_custom_kinds.sql ▼▼▼
-- ============================================================
-- DashMonster — sub-abas do Histórico personalizadas por empresa
-- Execute no Supabase SQL Editor (após a 026).
--
-- As sub-abas do Histórico deixam de ser fixas (lancamento/evento/
-- perpetuo/instagram). Cada empresa pode criar sub-abas próprias, cujo
-- id vira o `kind` da linha. O CHECK antigo travava esses valores novos.
-- Relaxa para qualquer texto curto não-vazio.
-- Idempotente.
-- ============================================================

ALTER TABLE public.historical_rows
  DROP CONSTRAINT IF EXISTS historical_rows_kind_check;

-- Mantém uma sanidade mínima (não-vazio, tamanho razoável) sem fixar valores.
ALTER TABLE public.historical_rows
  DROP CONSTRAINT IF EXISTS historical_rows_kind_nonempty;
ALTER TABLE public.historical_rows
  ADD CONSTRAINT historical_rows_kind_nonempty
  CHECK (char_length(kind) BETWEEN 1 AND 64);


-- ▲▲▲ 027_history_custom_kinds.sql ▲▲▲

-- ▼▼▼ 028_multi_source.sql ▼▼▼
-- ============================================================
-- DashMonster — Dashboard multi-fonte (Meta + Eduzz + leads via planilha)
-- Execute no Supabase SQL Editor (após a 027). Idempotente.
--
-- 1) campaign_metrics.source passa a aceitar 'eduzz' (vendas via webhook)
-- 2) dashboard_data_source.source_type idem (badge de fonte conectada)
-- 3) tabela `leads`: leads individuais (Meta lead forms + planilha) com
--    origem/produto, RLS por empresa (padrão da 021) e dedupe p/ re-sync
--
-- A URL da planilha de leads e o segredo do webhook Eduzz ficam em
-- companies.settings (JSONB, já existe) — sem mudança de schema p/ isso.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Amplia o CHECK de source em campaign_metrics
-- ------------------------------------------------------------
ALTER TABLE public.campaign_metrics
  DROP CONSTRAINT IF EXISTS campaign_metrics_source_check;
ALTER TABLE public.campaign_metrics
  ADD CONSTRAINT campaign_metrics_source_check
  CHECK (source IN ('csv', 'google_sheets', 'meta', 'eduzz'));

-- ------------------------------------------------------------
-- 2) Amplia o CHECK de source_type em dashboard_data_source
-- ------------------------------------------------------------
ALTER TABLE public.dashboard_data_source
  DROP CONSTRAINT IF EXISTS dashboard_data_source_source_type_check;
ALTER TABLE public.dashboard_data_source
  ADD CONSTRAINT dashboard_data_source_source_type_check
  CHECK (source_type IN ('csv', 'google_sheets', 'meta', 'eduzz'));

-- ------------------------------------------------------------
-- 3) Tabela de leads individuais (lista da aba Leads)
--    dedupe_key garante idempotência no re-sync da planilha ao vivo.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leads (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  date         DATE        NOT NULL,
  origem       TEXT        NOT NULL DEFAULT 'Orgânico',
  produto      TEXT,
  full_name    TEXT,
  email        TEXT,
  phone        TEXT,
  source       TEXT        NOT NULL DEFAULT 'sheet'
                 CHECK (source IN ('meta', 'sheet', 'csv', 'google_sheets', 'eduzz')),
  -- chave estável p/ upsert idempotente (planilha não tem id próprio)
  dedupe_key   TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_leads_company_id ON public.leads(company_id);
CREATE INDEX IF NOT EXISTS idx_leads_date       ON public.leads(date);
CREATE INDEX IF NOT EXISTS idx_leads_origem      ON public.leads(origem);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leads_company_select" ON public.leads;
DROP POLICY IF EXISTS "leads_company_select" ON public.leads;
CREATE POLICY "leads_company_select" ON public.leads
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

DROP POLICY IF EXISTS "leads_company_write" ON public.leads;
DROP POLICY IF EXISTS "leads_company_write" ON public.leads;
CREATE POLICY "leads_company_write" ON public.leads
  FOR ALL TO authenticated
  USING (public.can_write_company(company_id))
  WITH CHECK (public.can_write_company(company_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.leads TO authenticated;

-- realtime: a aba Leads reflete inserts ao vivo sem reload
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'leads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
  END IF;
END $$;


-- ▲▲▲ 028_multi_source.sql ▲▲▲

-- ▼▼▼ 029_tracking_pixel.sql ▼▼▼
-- ============================================================
-- Tracking Pixel Server-Side (MVP)
-- Execute este SQL no Supabase SQL Editor (após a 028_multi_source)
--
-- Reaproveita `companies` como conceito de "workspace" do pixel —
-- cada empresa configura seu pixel/CAPI uma vez e o script
-- `/api/tracking/pixel.js` identifica o cliente pelo slug.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Configuração de tracking na empresa
--    NULL = tracking ainda não configurado pra essa empresa.
--    meta_capi_token é distinto de meta_access_token (token de
--    gestão de anúncios já existente) — CAPI exige token próprio.
--    dominio_autorizado guarda 1 hostname por empresa (MVP).
-- ------------------------------------------------------------
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS meta_pixel_id      TEXT,
  ADD COLUMN IF NOT EXISTS meta_capi_token    TEXT,
  ADD COLUMN IF NOT EXISTS dominio_autorizado TEXT;

-- ------------------------------------------------------------
-- 2) events_log — eventos brutos capturados pelo pixel
--    Escrita: somente service_role (rota Next.js usa supabaseAdmin(),
--    o browser nunca insere direto).
--    Leitura: membros da empresa (visibilidade futura em dashboard).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.events_log (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  event_name     TEXT        NOT NULL,             -- Lead | Contact | PageView | Purchase | AddToCart
  fingerprint_id TEXT        NOT NULL,
  event_url      TEXT,
  user_data      JSONB       NOT NULL DEFAULT '{}',
  capi_status    TEXT        NOT NULL DEFAULT 'pending',  -- pending | sent | failed
  capi_error     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_log_company_id  ON public.events_log(company_id);
CREATE INDEX IF NOT EXISTS idx_events_log_created_at  ON public.events_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_log_fingerprint ON public.events_log(fingerprint_id);

ALTER TABLE public.events_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "events_log_service_role_write" ON public.events_log;
DROP POLICY IF EXISTS "events_log_service_role_write" ON public.events_log;
CREATE POLICY "events_log_service_role_write" ON public.events_log
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "events_log_member_select" ON public.events_log;
DROP POLICY IF EXISTS "events_log_member_select" ON public.events_log;
CREATE POLICY "events_log_member_select" ON public.events_log
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));


-- ▲▲▲ 029_tracking_pixel.sql ▲▲▲

-- ▼▼▼ 030_user_tags_custom_kinds.sql ▼▼▼
-- ============================================================
-- DashMonster — relaxa CHECK de kind em user_tags
-- Execute no Supabase SQL Editor (após a 029). Idempotente.
--
-- A 027 relaxou historical_rows.kind pra suportar sub-abas custom do
-- Histórico, mas esqueceu user_tags.kind (mesmo CHECK antigo, só os 4
-- kinds fixos). Resultado: criar tag numa sub-aba personalizada falha
-- com violação de CHECK constraint, hoje engolida silenciosamente no
-- frontend (corrigido em HistoricalView.tsx na mesma leva).
-- ============================================================

ALTER TABLE public.user_tags
  DROP CONSTRAINT IF EXISTS user_tags_kind_check;

ALTER TABLE public.user_tags
  DROP CONSTRAINT IF EXISTS user_tags_kind_nonempty;
ALTER TABLE public.user_tags
  ADD CONSTRAINT user_tags_kind_nonempty
  CHECK (char_length(kind) BETWEEN 1 AND 64);


-- ▲▲▲ 030_user_tags_custom_kinds.sql ▲▲▲

-- ▼▼▼ 031_events_log_lead_pii.sql ▼▼▼
-- ============================================================
-- DashMonster — captura email/telefone em claro do Lead (além do hash)
-- Execute no Supabase SQL Editor (após a 030). Idempotente.
--
-- events_log.user_data.em/ph continuam só o hash SHA-256 (é o que vai
-- pra Meta CAPI, nunca muda). lead_email/lead_phone são a versão em
-- texto puro, capturada à parte, só pra exibição no dashboard (pra
-- permitir contato real com o lead) — nunca repassada à Meta.
-- Mesmo padrão de public.leads (028_multi_source.sql): TEXT plano,
-- protegido só por RLS (sem encriptação adicional).
-- ============================================================

ALTER TABLE public.events_log
  ADD COLUMN IF NOT EXISTS lead_email TEXT,
  ADD COLUMN IF NOT EXISTS lead_phone TEXT;


-- ▲▲▲ 031_events_log_lead_pii.sql ▲▲▲

-- ▼▼▼ 032_user_tags_company_id.sql ▼▼▼
-- ============================================================
-- DashMonster — adiciona company_id em user_tags (gap retroativo da 021)
-- Execute no Supabase SQL Editor (após a 031). Idempotente.
--
-- A 021 adiciona company_id + RLS por empresa numa lista de tabelas,
-- mas só se a tabela já existir naquele momento (checa
-- information_schema.tables). Como user_tags (migration 011) nunca
-- tinha rodado neste projeto até agora, a 021 pulou ela silenciosamente
-- — sem company_id, sem RLS por empresa, só as policies antigas
-- por usuário da 011. addUserTag() tenta inserir company_id e falha
-- com "column does not exist". Esta migration replica manualmente o
-- que a 021 teria feito.
-- ============================================================

ALTER TABLE public.user_tags
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_user_tags_company_id ON public.user_tags(company_id);

-- Troca as policies antigas (só por usuário, da 011) pelas por empresa
-- (mesmo padrão das outras tabelas migradas na 021).
DROP POLICY IF EXISTS "user_tags_select" ON public.user_tags;
DROP POLICY IF EXISTS "user_tags_insert" ON public.user_tags;
DROP POLICY IF EXISTS "user_tags_delete" ON public.user_tags;
DROP POLICY IF EXISTS "user_tags_company_select" ON public.user_tags;
DROP POLICY IF EXISTS "user_tags_company_insert" ON public.user_tags;
DROP POLICY IF EXISTS "user_tags_company_update" ON public.user_tags;
DROP POLICY IF EXISTS "user_tags_company_delete" ON public.user_tags;

ALTER TABLE public.user_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_tags_company_select" ON public.user_tags;
CREATE POLICY "user_tags_company_select" ON public.user_tags
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

DROP POLICY IF EXISTS "user_tags_company_insert" ON public.user_tags;
CREATE POLICY "user_tags_company_insert" ON public.user_tags
  FOR INSERT TO authenticated
  WITH CHECK (public.can_write_company(company_id));

DROP POLICY IF EXISTS "user_tags_company_update" ON public.user_tags;
CREATE POLICY "user_tags_company_update" ON public.user_tags
  FOR UPDATE TO authenticated
  USING (public.can_write_company(company_id))
  WITH CHECK (public.can_write_company(company_id));

DROP POLICY IF EXISTS "user_tags_company_delete" ON public.user_tags;
CREATE POLICY "user_tags_company_delete" ON public.user_tags
  FOR DELETE TO authenticated
  USING (public.can_write_company(company_id));


-- ▲▲▲ 032_user_tags_company_id.sql ▲▲▲

-- ▼▼▼ 033_events_log_title_fields.sql ▼▼▼
-- ============================================================
-- DashMonster — título da página + todos os campos do formulário
-- Execute no Supabase SQL Editor (após a 032). Idempotente.
--
-- page_title: document.title capturado pelo pixel.js em cada evento,
-- pra exibir o nome real da página em vez de só a URL/slug.
-- extra_fields: todos os campos nomeados do <form> (além de email/
-- telefone, que continuam em lead_email/lead_phone) — texto puro,
-- mesmo padrão de PII em claro já usado nessas colunas, só pra
-- exibição no dashboard (nunca repassado à Meta CAPI).
-- ============================================================

ALTER TABLE public.events_log
  ADD COLUMN IF NOT EXISTS page_title   TEXT,
  ADD COLUMN IF NOT EXISTS extra_fields JSONB NOT NULL DEFAULT '{}';


-- ▲▲▲ 033_events_log_title_fields.sql ▲▲▲

-- ▼▼▼ 034_events_log_geo.sql ▼▼▼
-- ============================================================
-- DashMonster — geolocalização por evento (substitui VisitorAPI)
-- Execute no Supabase SQL Editor (após a 033). Idempotente.
--
-- País/estado/cidade vêm de graça da rede da Vercel (headers
-- x-vercel-ip-*, lidos via @vercel/functions `geolocation()`) —
-- sem chamada a API externa, sem custo, sem latência extra, sem
-- mandar o IP do visitante pra um terceiro. Só funciona em produção
-- na Vercel; em dev local os 3 campos ficam NULL (esperado).
-- ============================================================

ALTER TABLE public.events_log
  ADD COLUMN IF NOT EXISTS country        TEXT,  -- código ISO 3166-1 alpha-2, ex.: "BR"
  ADD COLUMN IF NOT EXISTS country_region TEXT,  -- código do estado/região, ex.: "SP"
  ADD COLUMN IF NOT EXISTS city           TEXT;


-- ▲▲▲ 034_events_log_geo.sql ▲▲▲

-- ▼▼▼ 035_tracking_manager_write.sql ▼▼▼
-- ============================================================
-- DashMonster — Gestor de tráfego pode editar config de Tracking
-- Execute no Supabase SQL Editor (após a 034). Idempotente.
--
-- Antes, UPDATE em companies era owner-only (companies_owner_update).
-- Pedido: manager ("Gestor de tráfego") também editar Pixel ID/Token
-- CAPI/domínio autorizado, sem abrir o resto da empresa (nome, logo,
-- settings, meta_access_token da Conexão Meta) pra manager.
--
-- Solução: RLS passa a aceitar owner OU manager (can_write_company),
-- e um trigger BEFORE UPDATE faz a restrição fina — se quem está
-- editando é manager (não owner), só pode mudar as 3 colunas de
-- tracking; qualquer outra coluna alterada aborta a transação.
-- Whitelist (não blacklist) é proposital: colunas novas que vierem
-- de migrations futuras ficam owner-only por padrão, sem precisar
-- lembrar de atualizar este trigger toda vez.
-- ============================================================

CREATE OR REPLACE FUNCTION public.check_companies_update_scope()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  allowed_keys TEXT[] := ARRAY['meta_pixel_id', 'meta_capi_token', 'dominio_autorizado'];
  old_j JSONB;
  new_j JSONB;
  key TEXT;
BEGIN
  IF public.company_role(NEW.id) = 'owner' THEN
    RETURN NEW;
  END IF;

  IF public.company_role(NEW.id) <> 'manager' THEN
    RAISE EXCEPTION 'Sem permissão pra editar esta empresa.';
  END IF;

  old_j := to_jsonb(OLD);
  new_j := to_jsonb(NEW);
  FOR key IN SELECT jsonb_object_keys(new_j) LOOP
    CONTINUE WHEN key = ANY(allowed_keys);
    IF old_j -> key IS DISTINCT FROM new_j -> key THEN
      RAISE EXCEPTION 'Gestor de tráfego só pode editar as configurações de Tracking (Pixel ID, Token CAPI, domínio autorizado).';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_companies_update_scope ON public.companies;
DROP TRIGGER IF EXISTS trg_companies_update_scope ON public.companies;
CREATE TRIGGER trg_companies_update_scope
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.check_companies_update_scope();

DROP POLICY IF EXISTS "companies_owner_update" ON public.companies;
DROP POLICY IF EXISTS "companies_writer_update" ON public.companies;
DROP POLICY IF EXISTS "companies_writer_update" ON public.companies;
CREATE POLICY "companies_writer_update" ON public.companies
  FOR UPDATE TO authenticated
  USING (public.can_write_company(id))
  WITH CHECK (public.can_write_company(id));


-- ▲▲▲ 035_tracking_manager_write.sql ▲▲▲

-- ▼▼▼ 036_tracking_capi_quality.sql ▼▼▼
-- ============================================================
-- DashMonster — qualidade de evento Meta: dedup, fbp/fbc, test mode
-- Execute no Supabase SQL Editor (após a 035). Idempotente.
--
-- meta_test_event_code: código opcional do Events Manager → aba "Eventos
-- de teste". Quando preenchido, todo evento enviado à CAPI dessa empresa
-- inclui `test_event_code` no payload, aparecendo em tempo real na aba de
-- teste (sem isso, não dá pra validar dedup Pixel+CAPI pelo Events Manager).
-- Deve ser removido depois do teste (best practice da própria Meta).
-- ============================================================

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS meta_test_event_code TEXT;

-- event_id: o mesmo ID que o pixel.js manda pro fbq('track', ..., {eventID})
-- no navegador E pro nosso /track-event — é a chave que a Meta usa pra
-- deduplicar Pixel (browser) + Conversions API (server) como 1 evento só.
-- Guardamos aqui também só pra dar visibilidade no nosso próprio dashboard
-- (cross-check manual com a aba "Diagnóstico"/"Eventos de teste" da Meta).
ALTER TABLE public.events_log
  ADD COLUMN IF NOT EXISTS event_id TEXT;

-- Manager também pode setar/limpar o código de teste (mesma régua de
-- permissão das outras 3 colunas de tracking — migration 035).
CREATE OR REPLACE FUNCTION public.check_companies_update_scope()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  allowed_keys TEXT[] := ARRAY['meta_pixel_id', 'meta_capi_token', 'dominio_autorizado', 'meta_test_event_code'];
  old_j JSONB;
  new_j JSONB;
  key TEXT;
BEGIN
  IF public.company_role(NEW.id) = 'owner' THEN
    RETURN NEW;
  END IF;

  IF public.company_role(NEW.id) <> 'manager' THEN
    RAISE EXCEPTION 'Sem permissão pra editar esta empresa.';
  END IF;

  old_j := to_jsonb(OLD);
  new_j := to_jsonb(NEW);
  FOR key IN SELECT jsonb_object_keys(new_j) LOOP
    CONTINUE WHEN key = ANY(allowed_keys);
    IF old_j -> key IS DISTINCT FROM new_j -> key THEN
      RAISE EXCEPTION 'Gestor de tráfego só pode editar as configurações de Tracking (Pixel ID, Token CAPI, domínio autorizado, código de teste).';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;


-- ▲▲▲ 036_tracking_capi_quality.sql ▲▲▲

-- ▼▼▼ 037_tracking_pixels_table.sql ▼▼▼
-- ============================================================
-- DashMonster — múltiplos pixels nomeados por empresa
-- Execute no Supabase SQL Editor (após a 036). Idempotente.
--
-- Até aqui cada empresa só tinha 1 config de tracking (meta_pixel_id/
-- meta_capi_token/dominio_autorizado/meta_test_event_code direto em
-- `companies`). Pedido: várias landing pages/produtos da mesma empresa,
-- cada um com seu próprio Pixel ID/token/domínio — vira uma tabela
-- 1-pra-N em vez de 4 colunas em `companies`.
--
-- `slug` é um ID opaco e ESTÁVEL (não muda se o usuário renomear o
-- pixel) — é o que entra no snippet (`Tracker.init(empresa, slug)`),
-- pra renomear o pixel na UI nunca quebrar uma instalação já feita.
-- `name` é só o rótulo visível, pode mudar livremente.
-- `is_default` marca qual pixel um snippet ANTIGO (`Tracker.init(empresa)`,
-- sem o 2º argumento) deve usar — só 1 por empresa.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tracking_pixels (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  slug                  TEXT NOT NULL,
  name                  TEXT NOT NULL,
  meta_pixel_id         TEXT,
  meta_capi_token       TEXT,
  dominio_autorizado    TEXT,
  meta_test_event_code  TEXT,
  is_default            BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_tracking_pixels_company_id ON public.tracking_pixels(company_id);

ALTER TABLE public.tracking_pixels ENABLE ROW LEVEL SECURITY;

-- Tabela só tem campos de tracking (nada sensível tipo nome da empresa,
-- token de gestão de anúncios) — diferente de `companies`, manager não
-- precisa de um trigger restringindo coluna por coluna, CRUD completo
-- pra owner OU manager já é seguro aqui.
DROP POLICY IF EXISTS "tracking_pixels_select" ON public.tracking_pixels;
DROP POLICY IF EXISTS "tracking_pixels_select" ON public.tracking_pixels;
CREATE POLICY "tracking_pixels_select" ON public.tracking_pixels
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

DROP POLICY IF EXISTS "tracking_pixels_write" ON public.tracking_pixels;
DROP POLICY IF EXISTS "tracking_pixels_write" ON public.tracking_pixels;
CREATE POLICY "tracking_pixels_write" ON public.tracking_pixels
  FOR ALL TO authenticated
  USING (public.can_write_company(company_id))
  WITH CHECK (public.can_write_company(company_id));

-- Migra a config existente de cada empresa pra um pixel "Pixel principal"
-- (default) — garante que snippets já instalados (`Tracker.init(empresa)`,
-- sem 2º argumento) continuam funcionando exatamente igual, sem precisar
-- trocar nada no site do cliente.
INSERT INTO public.tracking_pixels (company_id, slug, name, meta_pixel_id, meta_capi_token, dominio_autorizado, meta_test_event_code, is_default)
SELECT
  c.id,
  lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  'Pixel principal',
  c.meta_pixel_id,
  c.meta_capi_token,
  c.dominio_autorizado,
  c.meta_test_event_code,
  true
FROM public.companies c
WHERE NOT EXISTS (
  SELECT 1 FROM public.tracking_pixels tp WHERE tp.company_id = c.id
);

-- `companies.meta_pixel_id`/`meta_capi_token`/`dominio_autorizado`/
-- `meta_test_event_code` ficam DEPRECADAS a partir desta migration — o
-- código novo lê só de `tracking_pixels`. Não dropar essas colunas ainda
-- (sem necessidade, e evita qualquer risco de perda de dado por engano).

-- event_id por evento já existia; agora também guardamos qual pixel
-- (linha de tracking_pixels) recebeu o evento, pra eventualmente reportar
-- por landing page/produto em vez de só por empresa.
ALTER TABLE public.events_log
  ADD COLUMN IF NOT EXISTS pixel_id UUID REFERENCES public.tracking_pixels(id) ON DELETE SET NULL;


-- ▲▲▲ 037_tracking_pixels_table.sql ▲▲▲

-- ▼▼▼ 038_events_log_utm.sql ▼▼▼
-- ============================================================
-- DashMonster — UTMs como colunas próprias em events_log
-- Execute no Supabase SQL Editor (após a 037). Idempotente.
--
-- Antes, a UTM só existia escondida dentro de events_log.event_url —
-- o dashboard reprocessava a URL no browser a cada render (parseUtm()
-- em TrackingEventsView.tsx). Funciona pra exibir, mas não dá pra
-- agregar/filtrar em SQL. Agora o servidor extrai a UTM da URL uma
-- vez, na captura (track-event/route.ts), e grava em coluna — fica
-- pronto pra qualquer relatório futuro (GROUP BY utm_campaign etc.)
-- sem reprocessar nada.
--
-- utm_campaign_id/utm_adset_id/utm_ad_id são as MESMAS IDs que a Meta
-- Marketing API usa pra campaign/adset/ad — guardar elas como coluna
-- é o que permite, no futuro, um JOIN com dados de custo/ROAS da API
-- da Meta por campanha/conjunto/anúncio, não só por nome de campanha
-- (nome pode repetir entre campanhas, ID nunca repete).
-- ============================================================

ALTER TABLE public.events_log
  ADD COLUMN IF NOT EXISTS utm_source      TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium      TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign    TEXT,
  ADD COLUMN IF NOT EXISTS utm_content     TEXT,
  ADD COLUMN IF NOT EXISTS utm_term        TEXT,
  ADD COLUMN IF NOT EXISTS utm_placement   TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign_id TEXT,
  ADD COLUMN IF NOT EXISTS utm_adset_id    TEXT,
  ADD COLUMN IF NOT EXISTS utm_ad_id       TEXT;

-- Índices pro padrão de relatório mais comum: comparar campanhas (ou
-- anúncios) de 1 empresa num intervalo de tempo.
CREATE INDEX IF NOT EXISTS idx_events_log_company_utm_campaign
  ON public.events_log(company_id, utm_campaign, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_log_utm_ad_id
  ON public.events_log(utm_ad_id) WHERE utm_ad_id IS NOT NULL;


-- ▲▲▲ 038_events_log_utm.sql ▲▲▲

-- ▼▼▼ 039_events_log_report_fields.sql ▼▼▼
-- ============================================================
-- DashMonster — campos extras pra relatórios futuros em events_log
-- Execute no Supabase SQL Editor (após a 038). Idempotente.
--
-- Mesmo raciocínio da 038 (UTM como coluna): em vez de deixar o
-- dado escondido dentro de event_url/extra_fields (JSONB) ou nem
-- gravar (geo/dispositivo), grava como coluna própria — pronto pra
-- GROUP BY/filtro em SQL num relatório futuro, sem reprocessar nada.
--
-- - lead_name: nome em texto puro do Lead, mesmo padrão de
--   lead_email/lead_phone (031) — hoje só existia escondido dentro
--   de extra_fields (JSONB), sob a chave que o form usar (ex: "nome").
-- - postal_code/latitude/longitude: a Vercel já calcula isso de
--   graça nos headers x-vercel-ip-* (mesma fonte de country/city da
--   034) — só não estava sendo lido.
-- - device_type: "mobile"/"tablet"/"desktop", classificado 1x no
--   servidor a partir do User-Agent (já chega em toda request) —
--   guarda só a categoria, não o User-Agent crú inteiro.
-- ============================================================

ALTER TABLE public.events_log
  ADD COLUMN IF NOT EXISTS lead_name   TEXT,
  ADD COLUMN IF NOT EXISTS postal_code TEXT,
  ADD COLUMN IF NOT EXISTS latitude    TEXT,
  ADD COLUMN IF NOT EXISTS longitude   TEXT,
  ADD COLUMN IF NOT EXISTS device_type TEXT; -- "mobile" | "tablet" | "desktop"


-- ▲▲▲ 039_events_log_report_fields.sql ▲▲▲

-- ▼▼▼ 040_events_log_commerce.sql ▼▼▼
-- ============================================================
-- DashMonster — venda (Eduzz) como evento Purchase em events_log
-- Execute no Supabase SQL Editor (após a 039). Idempotente.
--
-- - value/currency/external_transaction_id/source/payment_method: dados de
--   uma venda, pra registrar Purchase em events_log igual aos outros eventos
--   (mesmo capi_status/capi_error, mesma timeline). `source` distingue se o
--   evento veio do pixel próprio ("pixel", default) ou de uma venda externa
--   ("eduzz", e no futuro outras plataformas). `external_transaction_id`
--   guarda o id da transação na plataforma de origem — usado tanto como
--   chave de idempotência (Eduzz reenvia notificação em retry) quanto como
--   event_id na Meta CAPI (a própria Meta recomenda usar o id do pedido como
--   event_id em eventos de Purchase).
-- - fbp/fbc: a Meta CAPI já recebia esses 2 cookies em todo evento do pixel
--   (track-event/route.ts) mas eles nunca ficavam salvos — só repassados pra
--   Meta e descartados. Persistir agora é o que permite, quando uma venda da
--   Eduzz é correlacionada a uma visita anterior (por email/telefone — ver
--   eduzz/webhook/route.ts), reaproveitar o fbp/fbc daquela visita na hora de
--   mandar o Purchase pra Meta, em vez de mandar um evento sem nenhum sinal
--   de clique.
-- ============================================================

ALTER TABLE public.events_log
  ADD COLUMN IF NOT EXISTS value                   NUMERIC,
  ADD COLUMN IF NOT EXISTS currency                TEXT,
  ADD COLUMN IF NOT EXISTS external_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS source                  TEXT NOT NULL DEFAULT 'pixel',
  ADD COLUMN IF NOT EXISTS payment_method           TEXT,
  ADD COLUMN IF NOT EXISTS fbp                      TEXT,
  ADD COLUMN IF NOT EXISTS fbc                      TEXT;

-- Idempotência: a mesma transação não pode virar 2 Purchase diferentes
-- (Eduzz reenvia notificação em retry de rede). NULL é permitido livremente
-- (eventos do pixel não têm transaction id) — só bloqueia duplicidade quando
-- o campo está preenchido.
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_log_company_transaction
  ON public.events_log(company_id, external_transaction_id)
  WHERE external_transaction_id IS NOT NULL;


-- ▲▲▲ 040_events_log_commerce.sql ▲▲▲

-- ▼▼▼ 041_eduzz_webhook_configs.sql ▼▼▼
-- ============================================================
-- DashMonster — múltiplas configs nomeadas de webhook Eduzz
-- Execute no Supabase SQL Editor (após a 040). Idempotente.
--
-- Antes, o segredo do webhook Eduzz vivia em companies.settings (JSONB)
-- e era escrito direto via UPDATE em `companies` — só que o trigger da
-- migration 035 (check_companies_update_scope) só deixa MANAGER editar
-- meta_pixel_id/meta_capi_token/dominio_autorizado; qualquer outra coluna
-- (incluindo `settings`) é owner-only. Resultado: gestor de tráfego clicava
-- em "Salvar segredo" e a escrita era silenciosamente rejeitada pelo Postgres
-- (e a UI engolia o erro sem avisar — bug duplo, corrigido agora nos 2 lados).
--
-- Solução: mesma ideia da 037 (tracking_pixels) — tabela própria, 1-pra-N,
-- com RLS owner+manager direta (sem trigger de whitelist, porque essa
-- tabela só tem campo de webhook, nada sensível). Resolve o bug de
-- permissão E atende o pedido de dar nome a cada config (várias contas/
-- produtos Eduzz da mesma empresa, cada um com seu próprio segredo/URL).
--
-- `secret` é único GLOBALMENTE (não só por empresa) — o endpoint do
-- webhook (`/api/eduzz/webhook?secret=...`) identifica a empresa só pelo
-- valor do secret, sem nenhum outro escopo na URL.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.eduzz_webhook_configs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  secret      TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eduzz_webhook_configs_company_id ON public.eduzz_webhook_configs(company_id);

ALTER TABLE public.eduzz_webhook_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "eduzz_webhook_configs_select" ON public.eduzz_webhook_configs;
DROP POLICY IF EXISTS "eduzz_webhook_configs_select" ON public.eduzz_webhook_configs;
CREATE POLICY "eduzz_webhook_configs_select" ON public.eduzz_webhook_configs
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

DROP POLICY IF EXISTS "eduzz_webhook_configs_write" ON public.eduzz_webhook_configs;
DROP POLICY IF EXISTS "eduzz_webhook_configs_write" ON public.eduzz_webhook_configs;
CREATE POLICY "eduzz_webhook_configs_write" ON public.eduzz_webhook_configs
  FOR ALL TO authenticated
  USING (public.can_write_company(company_id))
  WITH CHECK (public.can_write_company(company_id));

-- Migra o segredo legado de companies.settings->>'eduzz_webhook_secret'
-- (se existir) pra uma config "Padrão" — zero risco de quebrar um webhook
-- já cadastrado na Eduzz, a URL com aquele secret continua funcionando.
INSERT INTO public.eduzz_webhook_configs (company_id, name, secret)
SELECT c.id, 'Padrão', c.settings->>'eduzz_webhook_secret'
FROM public.companies c
WHERE c.settings->>'eduzz_webhook_secret' IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.eduzz_webhook_configs e WHERE e.secret = c.settings->>'eduzz_webhook_secret'
  );

-- companies.settings->>'eduzz_webhook_secret' fica DEPRECADO a partir desta
-- migration (código novo lê só de eduzz_webhook_configs) — não removido do
-- JSONB, sem necessidade, zero risco de perda de dado.


-- ▲▲▲ 041_eduzz_webhook_configs.sql ▲▲▲

-- ▼▼▼ 042_events_log_recurrence.sql ▼▼▼
-- ============================================================
-- DashMonster — detecta renovação de assinatura (não reprocessa)
-- Execute no Supabase SQL Editor (após a 041). Idempotente.
--
-- Pedido: só contar a venda 1x (valor cheio do produto), sem receber um
-- evento novo a cada renovação mensal de assinatura nem a cada parcela
-- de boleto parcelado. `recurrence_key` guarda o id da assinatura/contrato
-- (ex.: data.contract.id da Eduzz) — repete em toda renovação da mesma
-- assinatura. shouldSkipRecurring() em eduzz/webhook/route.ts ignora a
-- notificação se já existir uma linha com esse mesmo recurrence_key.
--
-- Campo genérico (não fala de Eduzz especificamente) — outras plataformas
-- de pagamento (Hotmart, Kiwify...) reaproveitam a mesma coluna mapeando
-- seu próprio id de assinatura pra SaleEvent.recurrenceKey no parser delas.
-- ============================================================

ALTER TABLE public.events_log
  ADD COLUMN IF NOT EXISTS recurrence_key TEXT;

CREATE INDEX IF NOT EXISTS idx_events_log_company_recurrence
  ON public.events_log(company_id, recurrence_key)
  WHERE recurrence_key IS NOT NULL;


-- ▲▲▲ 042_events_log_recurrence.sql ▲▲▲

-- ▼▼▼ 043_events_log_installments.sql ▼▼▼
-- ============================================================
-- DashMonster — quantidade de parcelas da venda (exibição)
-- Execute no Supabase SQL Editor (após a 042). Idempotente.
--
-- `installments` guarda o total de parcelas (ex.: boleto em 3x) — só pra
-- exibição no dashboard junto do método de pagamento. A Eduzz só manda
-- isso pra boleto parcelado (data.bankSlipInstallment.totalInstallments);
-- parcelamento de cartão é decidido pela operadora do cartão, invisível
-- pra plataforma — fica NULL nesse caso (mostra só o método, sem "Nx").
-- ============================================================

ALTER TABLE public.events_log
  ADD COLUMN IF NOT EXISTS installments INTEGER;


-- ▲▲▲ 043_events_log_installments.sql ▲▲▲

-- ▼▼▼ 044_events_log_product_name.sql ▼▼▼
-- ============================================================
-- DashMonster — nome do produto como coluna própria em events_log
-- Execute no Supabase SQL Editor (após a 043). Idempotente.
--
-- Antes, o nome do produto de uma Purchase só existia dentro do JSONB
-- extra_fields ({ produto: "..." }) — funciona pra exibir, mas é
-- inconsistente com campaign_metrics.campaign_name (mesma informação,
-- nome de coluna diferente, formato diferente) e dificulta um relatório
-- futuro que cruze as duas tabelas (revenue por produto comparando
-- events_log vs campaign_metrics). product_name é a mesma string que já
-- vai em campaign_metrics.campaign_name pra cada venda.
--
-- extra_fields.produto continua sendo gravado também (não removido) —
-- só repassar pro dashboard usar a coluna quando existir, com fallback
-- pro JSONB em linhas antigas/migration pendente, mesmo padrão de sempre.
-- ============================================================

ALTER TABLE public.events_log
  ADD COLUMN IF NOT EXISTS product_name TEXT;

CREATE INDEX IF NOT EXISTS idx_events_log_company_product
  ON public.events_log(company_id, product_name)
  WHERE product_name IS NOT NULL;


-- ▲▲▲ 044_events_log_product_name.sql ▲▲▲

-- ▼▼▼ 045_events_log_status.sql ▼▼▼
-- ============================================================
-- DashMonster — status da venda (reembolso/chargeback)
-- Execute no Supabase SQL Editor (após a 044). Idempotente.
--
-- Até aqui, uma venda reembolsada/contestada continuava contando como
-- receita pra sempre (events_log e campaign_metrics nunca eram corrigidos).
-- `status` guarda "paid" (default, toda venda nasce assim) | "refunded" |
-- "chargeback" — atualizado por handleReversal() em webhook/route.ts quando
-- chega myeduzz.invoice_refunded/invoice_chargeback (só formato moderno).
--
-- Escopo deliberadamente pequeno: só GUARDA o dado, não reverte nada na
-- Meta nem corrige campaign_metrics retroativamente — um relatório futuro
-- de receita líquida usa isso pra fazer `WHERE status = 'paid'` em vez de
-- somar tudo. Reversão de evento na Meta (Meta também tem uma forma de
-- marcar Purchase como reembolsado) fica pra quando/se for pedido.
-- ============================================================

ALTER TABLE public.events_log
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'paid';

CREATE INDEX IF NOT EXISTS idx_events_log_company_status
  ON public.events_log(company_id, status)
  WHERE status <> 'paid';


-- ▲▲▲ 045_events_log_status.sql ▲▲▲

-- ▼▼▼ 046_events_log_order_bump.sql ▼▼▼
-- ============================================================
-- DashMonster — order bump da Eduzz como dados próprios em events_log
-- Execute no Supabase SQL Editor (após a 045). Idempotente.
--
-- Order bump (produto extra do checkout) chega como uma notificação
-- myeduzz.invoice_paid SEPARADA da venda principal — seu próprio
-- transaction.id, seu próprio price.value, mas marcada com
-- data.orderBump.has=true + data.orderBump.isMainSale=false, e
-- data.orderBump.mainSaleId referenciando o transaction.id da venda
-- principal (fonte: https://developers.eduzz.com/reference/webhook/myeduzz-invoice-paid).
-- Sem essas colunas, ela já era capturada como uma Purchase nova e
-- independente (receita certa), mas sem nenhum jeito de ligar de volta
-- com a venda principal pra um relatório futuro (ex.: taxa de aceitação
-- de order bump, receita incremental por produto de bump).
--
-- is_order_bump: true só nessa fatura do bump, false (default) em toda
-- venda normal/principal e em todo evento do pixel.
-- main_sale_transaction_id: events_log.external_transaction_id da venda
-- principal — null quando não é bump (ou no formato antigo, sem suporte).
-- ============================================================

ALTER TABLE public.events_log
  ADD COLUMN IF NOT EXISTS is_order_bump BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS main_sale_transaction_id TEXT;

CREATE INDEX IF NOT EXISTS idx_events_log_company_order_bump
  ON public.events_log(company_id, main_sale_transaction_id)
  WHERE is_order_bump = true;


-- ▲▲▲ 046_events_log_order_bump.sql ▲▲▲

-- ▼▼▼ 047_events_log_client_context.sql ▼▼▼
-- ============================================================
-- DashMonster — IP + User-Agent da visita em events_log
-- Execute no Supabase SQL Editor (após a 046). Idempotente.
--
-- O pixel já mandava client_ip_address/client_user_agent pra Meta CAPI em
-- todo evento do navegador, mas NÃO guardava — então uma venda da Eduzz,
-- quando correlacionada por email/telefone a uma visita, ia pra Meta sem
-- esses dois sinais (são identificadores fortes de match). Persistir é o
-- que permite a Purchase reaproveitar o IP/UA da visita original.
--
-- Mesma postura de PII em texto puro que lead_email/lead_phone (031) já
-- usam — sem encriptação extra, só protegido por RLS. IP/UA só saem pra
-- Meta CAPI (user_data), nunca expostos no endpoint público de config.
-- ============================================================

ALTER TABLE public.events_log
  ADD COLUMN IF NOT EXISTS client_ip_address  TEXT,
  ADD COLUMN IF NOT EXISTS client_user_agent  TEXT;


-- ▲▲▲ 047_events_log_client_context.sql ▲▲▲

-- ▼▼▼ 048_eduzz_product_pixel_map.sql ▼▼▼
-- ============================================================
-- DashMonster — mapeamento opcional "produto Eduzz → pixel"
-- Execute no Supabase SQL Editor (após a 047). Idempotente.
--
-- Problema: o webhook da Eduzz recebe TODA venda da conta, sem filtro por
-- produto. Quando a venda não tem visita correlacionada (comum — comprador
-- foi direto pro checkout), o pixel escolhido hoje é sempre o "padrão" da
-- empresa, mesmo que o produto vendido pertença a outro funil/campanha —
-- contamina a otimização daquele pixel com conversão de tráfego que nunca
-- viu o anúncio.
--
-- Solução, em 3 camadas (ver eduzz/webhook/route.ts), TODAS opt-in — sem
-- nenhuma linha cadastrada aqui, o comportamento de hoje continua 100%
-- igual:
--   1. Mapeamento explícito (esta tabela) — só existe se o usuário cadastrar.
--   2. Visita correlacionada (já existia).
--   3. Política da empresa pra venda "sem produto mapeado e sem visita"
--      (coluna nova em `companies`, default = comportamento de hoje).
--
-- `eduzz_parent_id` é `data.items[].parentId` do webhook moderno — o "curso
-- pai", estável entre variantes de oferta/parcelamento do mesmo produto
-- (`productId` muda por checkout, `parentId` não — confirmado na doc oficial
-- da Eduzz e nos exemplos reais de payload analisados).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.eduzz_product_pixel_map (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  eduzz_parent_id TEXT NOT NULL,
  pixel_id        UUID NOT NULL REFERENCES public.tracking_pixels(id) ON DELETE CASCADE,
  -- Cache só pra exibir na UI sem precisar reprocessar events_log a cada
  -- render — sempre sobrescrito pelo nome mais recente visto naquele produto.
  product_label   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, eduzz_parent_id)
);

CREATE INDEX IF NOT EXISTS idx_eduzz_product_pixel_map_company ON public.eduzz_product_pixel_map(company_id);

ALTER TABLE public.eduzz_product_pixel_map ENABLE ROW LEVEL SECURITY;

-- Mesmo padrão de tracking_pixels (037): sem dado sensível, CRUD completo
-- pra owner OU manager, sem trigger de whitelist por coluna.
DROP POLICY IF EXISTS "eduzz_product_pixel_map_select" ON public.eduzz_product_pixel_map;
DROP POLICY IF EXISTS "eduzz_product_pixel_map_select" ON public.eduzz_product_pixel_map;
CREATE POLICY "eduzz_product_pixel_map_select" ON public.eduzz_product_pixel_map
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

DROP POLICY IF EXISTS "eduzz_product_pixel_map_write" ON public.eduzz_product_pixel_map;
DROP POLICY IF EXISTS "eduzz_product_pixel_map_write" ON public.eduzz_product_pixel_map;
CREATE POLICY "eduzz_product_pixel_map_write" ON public.eduzz_product_pixel_map
  FOR ALL TO authenticated
  USING (public.can_write_company(company_id))
  WITH CHECK (public.can_write_company(company_id));

-- Política da empresa pra venda sem produto mapeado E sem visita
-- correlacionada — 'default_pixel' (comportamento de sempre, mantém quem
-- nunca configurou nada 100% inalterado) ou 'skip' (não manda pra Meta,
-- só guarda no nosso events_log pra relatório).
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS eduzz_unmapped_purchase_action TEXT NOT NULL DEFAULT 'default_pixel';

-- `check_companies_update_scope` (migrations 035/036) é whitelist, não
-- blacklist — sem adicionar a coluna nova aqui, um gestor de tráfego (não
-- owner) que mudar essa política tem o UPDATE silenciosamente rejeitado
-- pelo trigger (mesmo bug real já documentado nas migrations anteriores).
CREATE OR REPLACE FUNCTION public.check_companies_update_scope()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  allowed_keys TEXT[] := ARRAY['meta_pixel_id', 'meta_capi_token', 'dominio_autorizado', 'meta_test_event_code', 'eduzz_unmapped_purchase_action'];
  old_j JSONB;
  new_j JSONB;
  key TEXT;
BEGIN
  IF public.company_role(NEW.id) = 'owner' THEN
    RETURN NEW;
  END IF;

  IF public.company_role(NEW.id) <> 'manager' THEN
    RAISE EXCEPTION 'Sem permissão pra editar esta empresa.';
  END IF;

  old_j := to_jsonb(OLD);
  new_j := to_jsonb(NEW);
  FOR key IN SELECT jsonb_object_keys(new_j) LOOP
    CONTINUE WHEN key = ANY(allowed_keys);
    IF old_j -> key IS DISTINCT FROM new_j -> key THEN
      RAISE EXCEPTION 'Gestor de tráfego só pode editar as configurações de Tracking (Pixel ID, Token CAPI, domínio autorizado, código de teste, política de venda sem produto mapeado).';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- parentId do item principal da venda — só formato moderno manda; guardado
-- pra alimentar a lista de "produtos detectados" na tela de configuração
-- (sem isso a UI não tem como saber quais parentId já apareceram).
ALTER TABLE public.events_log
  ADD COLUMN IF NOT EXISTS product_parent_id TEXT;

CREATE INDEX IF NOT EXISTS idx_events_log_product_parent_id ON public.events_log(company_id, product_parent_id) WHERE product_parent_id IS NOT NULL;


-- ▲▲▲ 048_eduzz_product_pixel_map.sql ▲▲▲

-- ▼▼▼ 049_eduzz_product_key_allowlist.sql ▼▼▼
-- ============================================================
-- DashMonster — simplifica o mapeamento produto→pixel pra allowlist automática
-- Execute no Supabase SQL Editor (após a 048). Idempotente.
--
-- Mudança de design, ainda na mesma feature da 048 (nunca foi pra produção
-- com usuário real configurando, sem risco de migração de dado):
--
-- 1. `eduzz_parent_id` → `eduzz_product_key`: a coluna agora aceita TANTO
--    productId quanto parentId do item — o usuário cola o que tiver à mão
--    (o productId aparece no relatório/payload, o parentId não aparece em
--    lugar nenhum da própria Eduzz). O webhook testa contra os 2 candidatos
--    de cada venda (ver candidateProductKeys() em eduzz/webhook/route.ts).
--
-- 2. Política manual (`companies.eduzz_unmapped_purchase_action`) removida —
--    substituída por regra automática, sem precisar de uma 2ª escolha do
--    usuário: nenhum produto mapeado = manda tudo (comportamento de sempre);
--    1+ produto mapeado = SÓ esses produtos mandam pra Meta, o resto é
--    ignorado de propósito ("se eu configurar, envia só o que eu configurar",
--    pedido explícito do usuário).
--
-- 3. `events_log.product_item_id` — guarda items[0].productId (paralelo ao
--    product_parent_id da 048), pra alimentar a lista de "produtos detectados"
--    também por productId, já que é o ID que o usuário tem em mãos.
-- ============================================================

ALTER TABLE public.eduzz_product_pixel_map RENAME COLUMN eduzz_parent_id TO eduzz_product_key;

ALTER TABLE public.companies DROP COLUMN IF EXISTS eduzz_unmapped_purchase_action;

ALTER TABLE public.events_log
  ADD COLUMN IF NOT EXISTS product_item_id TEXT;


-- ▲▲▲ 049_eduzz_product_key_allowlist.sql ▲▲▲

-- ▼▼▼ 050_eduzz_product_catalog.sql ▼▼▼
-- ============================================================
-- DashMonster — catálogo Eduzz (produto + ofertas), pixel por produto
-- Execute no Supabase SQL Editor (após a 049). Idempotente.
--
-- Substitui `eduzz_product_pixel_map` (048/049, nunca chegou a ir pra
-- produção) por um desenho mais correto pro modelo real da Eduzz: você cria
-- 1 PRODUTO (curso) e dentro dele N OFERTAS (preço/parcelamento diferentes,
-- cada uma com seu próprio `productId`). `parentId` é o produto, estável
-- entre todas as ofertas — confirmado com dado real: 2 vendas da mesma
-- empresa, mesmo `parentId` (ex.: 2915528, um produto/curso), `productId`
-- diferente em cada (3030076 e 2944992, ofertas/parcelamentos distintos).
--
-- `eduzz_products` — 1 linha por produto (parentId). `pixel_id` aqui é a
-- ÚNICA forma de vincular venda a pixel agora (decisão confirmada com o
-- usuário: vínculo é por PRODUTO, nunca por oferta — todas as ofertas do
-- mesmo curso herdam o mesmo pixel automaticamente). NULL = produto já visto
-- em venda, mas sem pixel escolhido ainda.
--
-- `eduzz_product_offers` — 1 linha por oferta (productId), só leitura pro
-- usuário (nunca editável na UI) — existe só pra reports futuros saberem
-- quais ofertas pertencem a qual produto. 100% auto-preenchido pelo webhook
-- a cada venda (`recordSale()`), nunca via cadastro manual.
--
-- As 2 tabelas são preenchidas automaticamente: a 1ª venda de um produto
-- novo já cria a linha em `eduzz_products` (nome provisório = título da
-- oferta, editável depois) — não precisa de nenhum cadastro manual prévio
-- pra o produto aparecer na tela de configuração.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.eduzz_products (
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  parent_id   TEXT NOT NULL,
  name        TEXT NOT NULL,
  pixel_id    UUID REFERENCES public.tracking_pixels(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, parent_id)
);

CREATE TABLE IF NOT EXISTS public.eduzz_product_offers (
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  parent_id   TEXT NOT NULL,
  product_id  TEXT NOT NULL,
  name        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, product_id),
  FOREIGN KEY (company_id, parent_id) REFERENCES public.eduzz_products(company_id, parent_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_eduzz_product_offers_parent ON public.eduzz_product_offers(company_id, parent_id);

ALTER TABLE public.eduzz_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eduzz_product_offers ENABLE ROW LEVEL SECURITY;

-- Mesmo padrão de tracking_pixels (037)/eduzz_webhook_configs (041): sem
-- dado sensível, CRUD completo pra owner OU manager. service_role (webhook,
-- sem sessão de usuário) precisa de policy própria pra poder fazer o upsert
-- automático a cada venda — sem isso, o INSERT do webhook seria bloqueado
-- pela RLS (a service_role normalmente ignora RLS, mas é mais seguro deixar
-- explícito já que outras tabelas desta feature usam esse mesmo padrão).
DROP POLICY IF EXISTS "eduzz_products_select" ON public.eduzz_products;
DROP POLICY IF EXISTS "eduzz_products_select" ON public.eduzz_products;
CREATE POLICY "eduzz_products_select" ON public.eduzz_products
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

DROP POLICY IF EXISTS "eduzz_products_write" ON public.eduzz_products;
DROP POLICY IF EXISTS "eduzz_products_write" ON public.eduzz_products;
CREATE POLICY "eduzz_products_write" ON public.eduzz_products
  FOR ALL TO authenticated
  USING (public.can_write_company(company_id))
  WITH CHECK (public.can_write_company(company_id));

DROP POLICY IF EXISTS "eduzz_product_offers_select" ON public.eduzz_product_offers;
DROP POLICY IF EXISTS "eduzz_product_offers_select" ON public.eduzz_product_offers;
CREATE POLICY "eduzz_product_offers_select" ON public.eduzz_product_offers
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

-- Sem policy de escrita pra authenticated: ofertas só são gravadas pelo
-- webhook (service_role, ignora RLS) — nunca editadas manualmente na UI.

-- Backfill defensivo: como as migrations rodam em ordem, eduzz_product_pixel_map
-- (criada na 048, coluna renomeada na 049) ainda existe neste ponto — se
-- alguém cadastrou algo nela antes desta migration substituir o desenho,
-- migra pra eduzz_products em vez de simplesmente descartar.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'eduzz_product_pixel_map') THEN
    INSERT INTO public.eduzz_products (company_id, parent_id, name, pixel_id)
    SELECT company_id, eduzz_product_key, COALESCE(product_label, eduzz_product_key), pixel_id
    FROM public.eduzz_product_pixel_map
    ON CONFLICT (company_id, parent_id) DO NOTHING;
  END IF;
END $$;

DROP TABLE IF EXISTS public.eduzz_product_pixel_map;


-- ▲▲▲ 050_eduzz_product_catalog.sql ▲▲▲

-- ▼▼▼ 051_events_log_contract_installments.sql ▼▼▼
-- ============================================================
-- DashMonster — guarda 2 campos do payload de invoice_paid que hoje o
-- webhook descartava sem salvar, só para investigação/relatório futuro.
-- NÃO muda nenhum comportamento de envio à Meta nem de cálculo de valor.
--
-- total_installments_raw = data.installments (campo RAIZ do payload,
-- "Número de parcelas" — a doc da Eduzz não detalha a relação dele com
-- bankSlipInstallment/PSL/cartão, captura pra comparar com dado real).
-- contract_unlimited_installments = data.contract.isUnlimitedInstallments
-- (flag de modo PSL — nome confuso: "sem limite" é do limite do CARTÃO
-- do comprador, não da duração do contrato).
--
-- Execute no Supabase SQL Editor. Idempotente.
-- ============================================================

ALTER TABLE public.events_log
  ADD COLUMN IF NOT EXISTS total_installments_raw INTEGER,
  ADD COLUMN IF NOT EXISTS contract_unlimited_installments BOOLEAN;


-- ▲▲▲ 051_events_log_contract_installments.sql ▲▲▲

-- ▼▼▼ 052_eduzz_contracts.sql ▼▼▼
-- ============================================================
-- DashMonster — "ficha do contrato" (assinatura/PSL), pra saber o valor
-- CHEIO de uma venda recorrente sem precisar adivinhar.
--
-- Por que precisa de tabela própria (não dá pra tirar isso só do invoice_paid):
-- o nº de parcelas de um contrato (`payment.totalOfInstallments`) e se ele
-- tem fim definido (`recurrence.isFinite`) só vêm nos webhooks
-- myeduzz.contract_created / myeduzz.contract_updated — NÃO vêm no
-- myeduzz.invoice_paid de cada cobrança mensal (confirmado na doc oficial,
-- 2026-06-19, depois de ter testado errado uma vez achando que vinha junto).
-- Por isso: contract_created/updated grava aqui, e cada invoice_paid de uma
-- assinatura consulta essa tabela pelo contract_id (= recurrence_key) pra
-- saber se/quanto multiplicar.
--
-- Execute no Supabase SQL Editor. Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.eduzz_contracts (
  company_id              UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contract_id              TEXT NOT NULL,
  -- data.contract.payment.totalOfInstallments — nº de parcelas contratadas.
  total_installments       INTEGER,
  -- data.contract.recurrence.isFinite — true = tem fim definido (PSL ou
  -- contrato com prazo fixo, dá pra multiplicar); false = assinatura aberta
  -- (cancela quando quiser, sem total fixo pra calcular).
  is_finite                BOOLEAN,
  -- data.contract.isUnlimitedInstallments — flag de modo PSL (nome confuso:
  -- é sobre o LIMITE DO CARTÃO do comprador, não sobre a duração do contrato).
  is_unlimited_installments BOOLEAN,
  -- data.contract.recurrence.price.value/currency — valor de cada cobrança.
  charge_value              NUMERIC,
  currency                  TEXT,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, contract_id)
);

ALTER TABLE public.eduzz_contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "eduzz_contracts_service_role" ON public.eduzz_contracts;
CREATE POLICY "eduzz_contracts_service_role" ON public.eduzz_contracts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "eduzz_contracts_member_select" ON public.eduzz_contracts;
CREATE POLICY "eduzz_contracts_member_select" ON public.eduzz_contracts
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));


-- ▲▲▲ 052_eduzz_contracts.sql ▲▲▲

-- ▼▼▼ 053_events_log_installment_number.sql ▼▼▼
-- ============================================================
-- DashMonster — guarda TODAS as parcelas de boleto parcelado (não só a 1ª),
-- pra dashboard futuro de progresso de pagamento/inadimplência.
--
-- `installment_number` = qual parcela esse registro representa (1, 2, 3...).
-- A parcela 1 continua sendo a linha "Purchase" de sempre (com o valor CHEIO
-- da venda); parcelas seguintes ganham uma linha própria, event_name=
-- "Installment", com o valor só DAQUELA parcela (não o total) — ligadas à
-- venda principal via `main_sale_transaction_id` (mesma coluna já usada pra
-- ligar order bump à venda principal, migration 046).
--
-- Execute no Supabase SQL Editor. Idempotente.
-- ============================================================

ALTER TABLE public.events_log
  ADD COLUMN IF NOT EXISTS installment_number INTEGER;


-- ▲▲▲ 053_events_log_installment_number.sql ▲▲▲

-- ▼▼▼ 054_events_log_installment_value.sql ▼▼▼
-- ============================================================
-- DashMonster — guarda o valor DESSA parcela/cobrança especificamente,
-- separado do valor cheio da venda/contrato.
--
-- `value` (já existente) virou "valor TOTAL" pra Purchase de venda parcelada
-- (boleto multiplicado, ou assinatura/PSL com a ficha do contrato) — então
-- ficou sem nenhuma coluna mostrando quanto foi pago NESSA cobrança
-- especificamente. `installment_value` resolve isso, preenchido nos 3 tipos
-- de linha (Purchase, Renewal, Installment) com o valor real daquela
-- notificação — pra Renewal/Installment já é igual a `value` (nunca
-- multiplicam nada); pra Purchase de venda parcelada, é DIFERENTE de `value`
-- (ex.: value=900 valor cheio, installment_value=300 só dessa 1ª parcela).
--
-- Execute no Supabase SQL Editor. Idempotente.
-- ============================================================

ALTER TABLE public.events_log
  ADD COLUMN IF NOT EXISTS installment_value NUMERIC;


-- ▲▲▲ 054_events_log_installment_value.sql ▲▲▲

-- ▼▼▼ 055_eduzz_contracts_current_charge.sql ▼▼▼
-- ============================================================
-- DashMonster — guarda a cobrança ATUAL do contrato (data.contract.recurrence.
-- charges.current), não só o total.
--
-- Por que: até aqui só usávamos `current` de passagem dentro do backfill (pra
-- corrigir a linha mais recente já gravada). Mas se o invoice_paid da cobrança
-- N chega DEPOIS do contract_updated correspondente (ordem normal — Eduzz
-- manda os 2 quase juntos), recordSale/recordRenewal não tinham como saber
-- "essa cobrança é a 13ª" — só sabiam contar linhas já gravadas, o que
-- subestima quando alguma cobrança anterior nunca chegou como webhook
-- (confirmado em produção: contrato na cobrança 13/25, só 1 linha gravada no
-- banco, `installment_number` saía sempre 1). Persistindo `current_charge`
-- aqui, o valor fica disponível ANTES do invoice_paid, igual já fazemos com
-- `total_installments`.
--
-- Execute no Supabase SQL Editor. Idempotente.
-- ============================================================

ALTER TABLE public.eduzz_contracts
  ADD COLUMN IF NOT EXISTS current_charge INTEGER;


-- ▲▲▲ 055_eduzz_contracts_current_charge.sql ▲▲▲

-- ▼▼▼ 056_eduzz_contracts_customer_product.sql ▼▼▼
-- ============================================================
-- DashMonster — guarda email do comprador + produto + janela de vigência na
-- ficha do contrato (eduzz_contracts), pra poder correlacionar de volta uma
-- venda recorrente "órfã".
--
-- Por que: confirmado com payload real que a Eduzz às vezes manda
-- myeduzz.invoice_paid com "contract": null mesmo pra produto recorrente cujo
-- contrato já existe há horas (bug de dados do lado da Eduzz, não falha de
-- ordem de entrega nem bug de parsing nosso). Sem recurrence_key, a venda é
-- sempre tratada como "venda nova" mesmo quando é renovação — dobra
-- conversão em campaign_metrics e manda renovação pra Meta como 1ª compra.
--
-- A correção (route.ts, findContractByCustomerAndProduct) tenta achar o
-- contrato certo por email+produto+janela de vigência, mas só aplica quando
-- isso resulta em EXATAMENTE 1 candidato — sem essas colunas não tem como
-- nem tentar.
--
-- Execute no Supabase SQL Editor. Idempotente.
-- ============================================================

ALTER TABLE public.eduzz_contracts
  ADD COLUMN IF NOT EXISTS customer_email TEXT,
  ADD COLUMN IF NOT EXISTS product_id TEXT,
  ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finishes_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_eduzz_contracts_customer_product
  ON public.eduzz_contracts(company_id, customer_email, product_id);


-- ▲▲▲ 056_eduzz_contracts_customer_product.sql ▲▲▲

-- ▼▼▼ 057_events_log_via.sql ▼▼▼
-- ============================================================
-- DashMonster — guarda se o evento do pixel chegou via instalação DIRETA ou
-- via o proxy reverso (dm-proxy.php) que o cliente hospeda no próprio domínio
-- pra contornar o cap de 7 dias do Safari/iOS em cookie gravado via JS.
--
-- Por quê: pedido do usuário pra mostrar isso na tabela "Eventos de
-- Tracking" — sem essa coluna não tinha como saber, depois do fato, se um
-- visitante específico foi capturado em modo proxy (cookie 1ª parte, sem o
-- cap de 7 dias) ou direto (sujeito ao cap no Safari).
--
-- `via` é mandado pelo PRÓPRIO pixel.js em todo evento (`PROXY_MODE` já é
-- decidido no servidor, ver pixel.js/route.ts) — nunca null pra evento de
-- pixel novo; fica null pra eventos antigos (antes desta coluna existir) e
-- pra vendas da Eduzz (não passam por aqui, inserção direta em events_log).
--
-- Execute no Supabase SQL Editor. Idempotente.
-- ============================================================

ALTER TABLE public.events_log
  ADD COLUMN IF NOT EXISTS via TEXT;


-- ▲▲▲ 057_events_log_via.sql ▲▲▲

-- ▼▼▼ 058_eduzz_oauth_connections.sql ▼▼▼
-- ============================================================
-- DashMonster — conexão OAuth2 com a API da Eduzz (pull de dados)
-- Execute no Supabase SQL Editor (após a 057). Idempotente.
--
-- O webhook (eduzz_webhook_configs, migration 041) continua sendo o
-- caminho rápido de toda venda nova. Esta tabela existe pra cobrir as
-- lacunas estruturais documentadas em src/app/api/eduzz/CLAUDE.md:
-- contract_created que nunca chega, invoice_paid com contract:null,
-- histórico anterior à instalação do webhook, chargeback fora da janela
-- de retry da Eduzz.
--
-- 1 conexão por empresa (company_id é a PRIMARY KEY, não um id próprio) —
-- reconectar é um upsert, nunca cria 2ª linha. `access_token` é cifrado
-- (AES-256-GCM, src/lib/crypto.ts, reusa IG_TOKEN_ENCRYPTION_KEY — chave
-- simétrica genérica, sem motivo pra ter 1 chave por integração).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.eduzz_oauth_connections (
  company_id        UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  access_token       TEXT NOT NULL,
  eduzz_user_id      TEXT,
  eduzz_user_email   TEXT,
  eduzz_user_name    TEXT,
  status             TEXT NOT NULL DEFAULT 'connected', -- 'connected' | 'error'
  last_synced_at     TIMESTAMPTZ,
  last_sync_error    TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.eduzz_oauth_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "eduzz_oauth_connections_select" ON public.eduzz_oauth_connections;
DROP POLICY IF EXISTS "eduzz_oauth_connections_select" ON public.eduzz_oauth_connections;
CREATE POLICY "eduzz_oauth_connections_select" ON public.eduzz_oauth_connections
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

DROP POLICY IF EXISTS "eduzz_oauth_connections_write" ON public.eduzz_oauth_connections;
DROP POLICY IF EXISTS "eduzz_oauth_connections_write" ON public.eduzz_oauth_connections;
CREATE POLICY "eduzz_oauth_connections_write" ON public.eduzz_oauth_connections
  FOR ALL TO authenticated
  USING (public.can_write_company(company_id))
  WITH CHECK (public.can_write_company(company_id));


-- ▲▲▲ 058_eduzz_oauth_connections.sql ▲▲▲

-- ▼▼▼ 059_advertiser_profiles_company_scope.sql ▼▼▼
-- ============================================================
-- DashMonster — advertiser_profiles passa a ser POR EMPRESA, não por usuário
-- ============================================================
-- Bug real em produção: a tabela (migration 016) é "1 linha por user_id",
-- e o app sempre LIA/ESCREVIA filtrando só pelo próprio user_id — mesmo a
-- migration 021 já tendo adicionado `company_id` + RLS por empresa
-- (is_company_member/can_write_company, igual toda outra tabela
-- multi-tenant). Resultado: um gestor de tráfego que entra com um browser
-- novo (ou um membro novo da empresa) nunca via os perfis que um colega já
-- tinha criado — cada usuário só via a própria linha, mesmo todos sendo da
-- mesma empresa e a RLS já permitindo SELECT cruzado.
--
-- Esta migration consolida: de "1 linha por usuário" pra "1 linha por
-- empresa" (mesmo padrão de `companies.settings` — blob compartilhado,
-- last-write-wins, sem lock). RLS já está correta desde a 021, não muda
-- nada aqui — só o schema (PK) e quem upsert/select usa como chave.

-- 1) Mescla os perfis de todas as linhas (1 por usuário) da mesma empresa
--    numa lista só, sem duplicar por id de perfil — quando o mesmo perfil
--    existir em mais de uma linha (não devia, mas por segurança), vence o
--    da linha com `updated_at` mais recente.
CREATE TEMP TABLE _ap_merged AS
SELECT
  company_id,
  COALESCE(
    (SELECT jsonb_agg(dedup.elem ORDER BY dedup.elem->>'id')
     FROM (
       SELECT DISTINCT ON (elem->>'id') elem
       FROM public.advertiser_profiles ap2
       CROSS JOIN LATERAL jsonb_array_elements(ap2.profiles) elem
       WHERE ap2.company_id = ap.company_id
       ORDER BY elem->>'id', ap2.updated_at DESC
     ) dedup
    ), '[]'::jsonb
  ) AS profiles
FROM public.advertiser_profiles ap
WHERE company_id IS NOT NULL
GROUP BY company_id;

-- 2) Remove as linhas antigas (1 por usuário) das empresas que foram
--    mescladas — linhas com company_id NULL (não deviam existir desde a
--    021, mas por segurança) ficam intactas, fora deste passo.
DELETE FROM public.advertiser_profiles WHERE company_id IS NOT NULL;

-- 3) Esquema: PK deixa de ser `user_id` (não dá mais pra ter várias linhas
--    por empresa) — vira UNIQUE em `company_id`. `user_id` continua
--    existindo (nullable agora), só não é mais a chave: linhas
--    compartilhadas por empresa não pertencem a nenhum usuário específico.
ALTER TABLE public.advertiser_profiles DROP CONSTRAINT advertiser_profiles_pkey;
ALTER TABLE public.advertiser_profiles ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.advertiser_profiles
  ADD CONSTRAINT advertiser_profiles_company_id_key UNIQUE (company_id);

-- 4) Reinsere mesclado, 1 linha por empresa.
INSERT INTO public.advertiser_profiles (user_id, company_id, profiles)
SELECT NULL, company_id, profiles FROM _ap_merged;


-- ▲▲▲ 059_advertiser_profiles_company_scope.sql ▲▲▲

-- ▼▼▼ 060_advertiser_profiles_create_missing.sql ▼▼▼
-- ============================================================
-- DashMonster — cria advertiser_profiles que nunca existiu neste banco
-- ============================================================
-- Causa raiz confirmada (2026-06-23): a migration 016 (cria a tabela) nunca
-- rodou de fato nesta instância Supabase — só estava no histórico de
-- arquivos. A 021 (multi-tenant) checa `IF EXISTS (SELECT 1 FROM
-- information_schema.tables ...)` antes de alterar cada tabela da lista, e
-- como `advertiser_profiles` não existia, pulou ela em silêncio, sem erro
-- — por isso passou despercebido até agora. A 059 (1ª migration que faz
-- `FROM public.advertiser_profiles` sem essa guarda) foi quem finalmente
-- estourou com "relation does not exist" ao ser rodada manualmente.
--
-- Efeito colateral real: `fetchProfilesFromDB`/`saveProfilesToDB`
-- (src/utils/supabaseProfiles.ts) engolem erro de tabela ausente e
-- retornam silenciosamente — o backup de Perfis de Anunciante pro Supabase
-- nunca funcionou nesta empresa, pra nenhum usuário. "Perfis de
-- Anunciantes" aparecendo vazio é o localStorage real daquele browser, sem
-- fallback (nunca houve nada salvo no banco pra puxar).
--
-- Como a tabela nunca existiu, não há nenhuma linha pra migrar — esta
-- migration cria ela direto já no formato FINAL que a 059 desenhou
-- (1 linha por empresa, `company_id` único), pulando o estágio intermediário
-- "1 linha por usuário" que a 016/021 criariam numa instalação do zero. Tudo
-- com guards (`IF NOT EXISTS`/`DROP POLICY IF EXISTS`) — seguro rodar mesmo
-- que algum pedaço já tenha sido criado manualmente numa tentativa anterior.

CREATE TABLE IF NOT EXISTS public.advertiser_profiles (
  company_id UUID        NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  profiles   JSONB       NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.advertiser_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "advertiser_profiles_owner" ON public.advertiser_profiles;
DROP POLICY IF EXISTS "advertiser_profiles_select" ON public.advertiser_profiles;
DROP POLICY IF EXISTS "advertiser_profiles_write" ON public.advertiser_profiles;

-- Mesmo padrão de RLS por empresa de toda outra tabela multi-tenant
-- (is_company_member/can_write_company, definidas na migration 021).
DROP POLICY IF EXISTS "advertiser_profiles_select" ON public.advertiser_profiles;
CREATE POLICY "advertiser_profiles_select" ON public.advertiser_profiles
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

DROP POLICY IF EXISTS "advertiser_profiles_write" ON public.advertiser_profiles;
CREATE POLICY "advertiser_profiles_write" ON public.advertiser_profiles
  FOR ALL TO authenticated
  USING (public.can_write_company(company_id))
  WITH CHECK (public.can_write_company(company_id));

-- set_updated_at() já existe desde a migration 001/004 — não precisa recriar.
DROP TRIGGER IF EXISTS trg_advertiser_profiles_updated_at ON public.advertiser_profiles;
DROP TRIGGER IF EXISTS trg_advertiser_profiles_updated_at ON public.advertiser_profiles;
CREATE TRIGGER trg_advertiser_profiles_updated_at
  BEFORE UPDATE ON public.advertiser_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ▲▲▲ 060_advertiser_profiles_create_missing.sql ▲▲▲

-- ▼▼▼ 061_drop_eduzz_oauth_connections.sql ▼▼▼
-- ============================================================
-- DashMonster — remove a integração via API da Eduzz (OAuth/pull)
-- ============================================================
-- Decisão do usuário (2026-06-23): abandonar a sincronização via API da Eduzz
-- (OAuth2 + pull de vendas/assinaturas/chargebacks, migration 058) e ficar SÓ
-- com o webhook. O webhook continua intacto — esta migration NÃO toca em
-- nenhuma tabela dele (`eduzz_webhook_configs` 041, `eduzz_products`/
-- `eduzz_product_offers` 050, `eduzz_contracts` 052/055/056 seguem todas).
--
-- Dropa só a tabela exclusiva do fluxo OAuth/API. CASCADE remove junto as
-- policies de RLS e constraints dela. IF EXISTS pra ser idempotente (seguro
-- rodar mesmo que a 058 nunca tenha sido aplicada nesta instância).
--
-- ATENÇÃO: isto APAGA o access_token cifrado da Eduzz que estava guardado aqui.
-- Sem volta — pra religar a API no futuro seria refazer o OAuth do zero. Como
-- a feature foi removida do código, o token não tem mais uso.

DROP TABLE IF EXISTS public.eduzz_oauth_connections CASCADE;


-- ▲▲▲ 061_drop_eduzz_oauth_connections.sql ▲▲▲

-- ▼▼▼ 062_purge_non_purchase_sale_events.sql ▼▼▼
-- ============================================================
-- DashMonster — limpeza: manter só "compras reais" em events_log
-- ============================================================
-- Decisão do usuário (2026-06-23): de todos os eventos de COMPRA, manter
-- apenas venda única (cartão/pix/boleto à vista, ou parcela 1 de boleto) E a
-- 1ª cobrança REAL de uma assinatura/contrato. Renovação, parcela 2+ e
-- assinatura capturada tarde (1ª cobrança recebida já é "13 de 18") são
-- descartadas. O webhook já passou a NÃO gravar mais essas (ver
-- src/app/api/eduzz/webhook/route.ts) — esta migration limpa o HISTÓRICO que
-- já estava no banco antes da mudança.
--
-- O QUE APAGA (events_log):
--   1. event_name = 'Renewal'      -> renovação de assinatura
--   2. event_name = 'Installment'  -> parcela 2+ de boleto
--   3. event_name = 'Purchase' com installment_number > 1 -> assinatura cuja
--      1ª cobrança capturada já não era a nº 1 (contrato capturado tarde)
--
-- NÃO TOCA: Lead/PageView (eventos do pixel) nem Purchase com
-- installment_number 1/NULL (as compras que ficam). Filtra por event_name, então
-- é seguro mesmo que algum dia exista Purchase de outra origem que não Eduzz.
--
-- ATENÇÃO: IRREVERSÍVEL. Faça backup/snapshot antes se quiser poder voltar.
--
-- LIMITAÇÃO CONHECIDA (campaign_metrics): a receita recorrente que essas
-- renovações somaram no passado em `campaign_metrics` (agregado, não é
-- events_log) NÃO é desfeita por esta migration — recompor esse agregado é
-- outra operação, à parte. Daqui pra frente, renovação não soma mais receita
-- (webhook já não chama recordRenewal). Se quiser zerar o histórico de
-- `campaign_metrics` também, peça um script separado.

DELETE FROM public.events_log
WHERE event_name IN ('Renewal', 'Installment')
   OR (event_name = 'Purchase' AND COALESCE(installment_number, 1) > 1);


-- ▲▲▲ 062_purge_non_purchase_sale_events.sql ▲▲▲

-- ▼▼▼ 063_dedup_subscription_first_charge.sql ▼▼▼
-- ============================================================
-- DashMonster — assinatura: manter só a 1ª cobrança por contrato
-- ============================================================
-- Complemento da 062. A 062 apagou Renewal/Installment/Purchase(installment>1),
-- mas sobraram cobranças de assinatura que tinham sido gravadas como "Purchase"
-- com installment_number = 1 (ou nulo) PORQUE, no momento da captura, o webhook
-- não tinha como saber que não eram a 1ª cobrança: não existia linha anterior
-- daquele contrato E não havia ficha (contract_created) pra dizer "essa é a 9
-- de 18". Resultado: várias cobranças do MESMO contrato (mesmo recurrence_key)
-- entraram como Purchase separadas, cada uma com o valor de uma cobrança só
-- (ex.: 18x R$279 aparecendo como vários "Compra R$279 · Assinatura").
--
-- Regra do usuário: assinatura/contrato mantém SÓ a 1ª cobrança. Aqui isso
-- vira: por (company_id, recurrence_key), manter a linha Purchase MAIS ANTIGA
-- (created_at; desempate por id) e apagar as demais.
--
-- NÃO TOCA: Purchase de compra ÚNICA (recurrence_key IS NULL — cartão/pix/
-- boleto à vista), Lead/PageView, nem contratos que já têm só 1 linha.
--
-- ATENÇÃO: IRREVERSÍVEL. Rode antes o SELECT de pré-visualização (ver
-- 062/conversa) pra conferir os contratos com COUNT(*) > 1. Faça snapshot se
-- quiser poder voltar.
--
-- Caveat: campaign_metrics (agregado) NÃO é recomputado — mesma limitação da 062.

DELETE FROM public.events_log e
WHERE e.recurrence_key IS NOT NULL
  AND e.event_name = 'Purchase'
  AND EXISTS (
    SELECT 1
    FROM public.events_log earlier
    WHERE earlier.company_id = e.company_id
      AND earlier.recurrence_key = e.recurrence_key
      AND earlier.event_name = 'Purchase'
      AND (
        earlier.created_at < e.created_at
        OR (earlier.created_at = e.created_at AND earlier.id < e.id)
      )
  );


-- ▲▲▲ 063_dedup_subscription_first_charge.sql ▲▲▲

-- ▼▼▼ 064_pending_subscription_confirmation.sql ▼▼▼
-- ============================================================
-- DashMonster — confirmação de assinatura por contract_created
-- ============================================================
-- Lógica: quando uma assinatura chega via invoice_paid, só a
-- confirmamos como venda real quando o event contract_created
-- também for recebido (sinal de que é um contrato novo, não uma
-- renovação ou captura tardia).  Se o contract_created não chegar
-- em 24h, a linha é descartada automaticamente.
--
-- Fluxo:
--   invoice_paid chega antes de contract_created
--     → events_log gravada com sale_confirmed = false
--     → NÃO soma campaign_metrics, NÃO vai pra Meta
--   contract_created chega (até 24h depois)
--     → events_log.sale_confirmed = true
--     → soma campaign_metrics + dispara Meta CAPI
--   contract_created não chega em 24h
--     → linha deletada pelo pg_cron (ou no próximo contract_created da empresa)
--
--   invoice_paid chega DEPOIS de contract_created
--     → eduzz_contracts.created_received = true (já setado)
--     → recordSale() confirma direto, comportamento normal
--
-- Sem tocar em: venda única (recurrence_key IS NULL), boleto
-- parcelado, ou qualquer evento de assinatura já confirmado.

-- 1. Flag na ficha do contrato: contract_created foi recebido?
ALTER TABLE public.eduzz_contracts
  ADD COLUMN IF NOT EXISTS created_received BOOLEAN NOT NULL DEFAULT false;

-- 2. Flag na linha da venda: confirmada (true/null) ou aguardando
--    contract_created (false)?  Default true = não quebra linhas antigas.
ALTER TABLE public.events_log
  ADD COLUMN IF NOT EXISTS sale_confirmed BOOLEAN NOT NULL DEFAULT true;

-- Índice pra cleanup/confirmação: busca rápida por contrato + pendente
CREATE INDEX IF NOT EXISTS idx_events_log_pending_subscription
  ON public.events_log (company_id, recurrence_key)
  WHERE sale_confirmed = false;

-- 3. pg_cron — cleanup das linhas pendentes expiradas (>24h).
--    Só roda se o pg_cron estiver disponível (Supabase Pro+).
--    Em Supabase Free, o cleanup é feito de forma lazy em
--    confirmPendingSubscription() no webhook.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    PERFORM cron.schedule(
      'cleanup-expired-pending-subscriptions',
      '0 * * * *',
      $cron$
        DELETE FROM public.events_log
        WHERE sale_confirmed = false
          AND recurrence_key IS NOT NULL
          AND created_at < NOW() - INTERVAL '24 hours';
      $cron$
    );
  END IF;
END;
$$;


-- ▲▲▲ 064_pending_subscription_confirmation.sql ▲▲▲

-- ▼▼▼ 065_delete_renewal_rows.sql ▼▼▼
-- Remove todas as linhas "Renewal" (cobranças recorrentes de assinatura após a
-- 1ª cobrança) que foram gravadas antes da decisão de 2026-06-23 de descartá-las
-- no webhook. Só linhas com recurrence_key não-nulo são assinatura confirmada;
-- sem recurrence_key (não tem info) são mantidas.
DELETE FROM public.events_log
WHERE event_name = 'Renewal'
  AND recurrence_key IS NOT NULL;


-- ▲▲▲ 065_delete_renewal_rows.sql ▲▲▲

-- ▼▼▼ 066_delete_unconfirmed_subscription_purchases.sql ▼▼▼
-- Remove Purchase de assinatura (recurrence_key IS NOT NULL) onde o
-- contract_created nunca foi confirmado (eduzz_contracts.created_received != true).
-- Inclui dados antigos (antes da migration 064, onde o flag não era rastreado)
-- e novos que por algum motivo não têm ficha com created_received = true.
-- Linhas sale_confirmed = false (pendentes aguardando contract_created) são
-- preservadas — o fluxo normal (confirmPendingSubscription / pg_cron) cuida delas.
DELETE FROM public.events_log el
WHERE el.event_name = 'Purchase'
  AND el.recurrence_key IS NOT NULL
  AND el.sale_confirmed IS DISTINCT FROM false
  AND NOT EXISTS (
    SELECT 1 FROM public.eduzz_contracts ec
    WHERE ec.company_id = el.company_id
      AND ec.contract_id = el.recurrence_key
      AND ec.created_received = true
  );


-- ▲▲▲ 066_delete_unconfirmed_subscription_purchases.sql ▲▲▲

-- ▼▼▼ 067_tracking_funnels.sql ▼▼▼
-- ============================================================
-- DashMonster — funis de campanha (tracking_funnels)
-- Execute no Supabase SQL Editor (após a 066). Idempotente.
--
-- Permite agrupar eventos de tracking por "funil" — ex: "Perpetuo SM"
-- vs "Lançamento Julho". Cada funil define 3 tipos de matcher (qualquer
-- combinação funciona):
--   • product_names  → events_log.product_name (substring case-insensitive)
--   • utm_campaigns  → events_log.utm_campaign (exato, case-insensitive)
--   • url_patterns   → events_log.event_url (substring case-insensitive)
--
-- Priority de match: product_name > utm_campaign > url_pattern.
-- Um visitante pertence ao 1º funil cujo matcher casar com qualquer
-- evento dele — funnels são testados na ordem de criação (created_at).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tracking_funnels (
  id             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id     UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  label          TEXT        NOT NULL,
  color          TEXT        NOT NULL DEFAULT '#6366f1',
  product_names  TEXT[]      NOT NULL DEFAULT '{}',
  utm_campaigns  TEXT[]      NOT NULL DEFAULT '{}',
  url_patterns   TEXT[]      NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tracking_funnels
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tracking_funnels_non_empty_matcher'
      AND conrelid = 'public.tracking_funnels'::regclass
  ) THEN
    ALTER TABLE public.tracking_funnels
      ADD CONSTRAINT tracking_funnels_non_empty_matcher
      CHECK (
        cardinality(product_names) > 0
        OR cardinality(utm_campaigns) > 0
        OR cardinality(url_patterns) > 0
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tracking_funnels_color_hex'
      AND conrelid = 'public.tracking_funnels'::regclass
  ) THEN
    ALTER TABLE public.tracking_funnels
      ADD CONSTRAINT tracking_funnels_color_hex
      CHECK (color ~ '^#[0-9A-Fa-f]{6}$') NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tracking_funnels_label_len'
      AND conrelid = 'public.tracking_funnels'::regclass
  ) THEN
    ALTER TABLE public.tracking_funnels
      ADD CONSTRAINT tracking_funnels_label_len
      CHECK (char_length(trim(label)) BETWEEN 1 AND 80) NOT VALID;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.touch_tracking_funnels_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tracking_funnels_updated_at ON public.tracking_funnels;
DROP TRIGGER IF EXISTS trg_tracking_funnels_updated_at ON public.tracking_funnels;
CREATE TRIGGER trg_tracking_funnels_updated_at
BEFORE UPDATE ON public.tracking_funnels
FOR EACH ROW EXECUTE FUNCTION public.touch_tracking_funnels_updated_at();

CREATE INDEX IF NOT EXISTS idx_tracking_funnels_company
  ON public.tracking_funnels(company_id, created_at);

ALTER TABLE public.tracking_funnels ENABLE ROW LEVEL SECURITY;

-- Mesmo padrão de tracking_pixels (037) e eduzz_webhook_configs (041):
-- CRUD pra owner OU manager, leitura pra qualquer membro.
DROP POLICY IF EXISTS "tracking_funnels_select" ON public.tracking_funnels;
DROP POLICY IF EXISTS "tracking_funnels_select" ON public.tracking_funnels;
CREATE POLICY "tracking_funnels_select" ON public.tracking_funnels
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

DROP POLICY IF EXISTS "tracking_funnels_write" ON public.tracking_funnels;
DROP POLICY IF EXISTS "tracking_funnels_write" ON public.tracking_funnels;
CREATE POLICY "tracking_funnels_write" ON public.tracking_funnels
  FOR ALL TO authenticated
  USING (public.can_write_company(company_id))
  WITH CHECK (public.can_write_company(company_id));


-- ▲▲▲ 067_tracking_funnels.sql ▲▲▲

-- ▼▼▼ 068_tracking_funnels_pixel.sql ▼▼▼
-- ============================================================
-- DashMonster — adiciona pixel_id aos funis de campanha
-- Execute no Supabase SQL Editor (após a 067). Idempotente.
--
-- Permite associar um funil a um pixel específico. Na atribuição,
-- eventos de outros pixels são ignorados quando o funil tem pixel_id.
-- NULL = funil se aplica a qualquer pixel da empresa.
-- ============================================================

ALTER TABLE public.tracking_funnels
  ADD COLUMN IF NOT EXISTS pixel_id UUID REFERENCES public.tracking_pixels(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tracking_funnels_pixel
  ON public.tracking_funnels(pixel_id)
  WHERE pixel_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.ensure_tracking_funnel_pixel_company()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.pixel_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.tracking_pixels tp
    WHERE tp.id = NEW.pixel_id
      AND tp.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'tracking_funnels.pixel_id precisa pertencer a mesma empresa do funil';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tracking_funnels_pixel_company ON public.tracking_funnels;
DROP TRIGGER IF EXISTS trg_tracking_funnels_pixel_company ON public.tracking_funnels;
CREATE TRIGGER trg_tracking_funnels_pixel_company
BEFORE INSERT OR UPDATE OF company_id, pixel_id ON public.tracking_funnels
FOR EACH ROW EXECUTE FUNCTION public.ensure_tracking_funnel_pixel_company();


-- ▲▲▲ 068_tracking_funnels_pixel.sql ▲▲▲

-- ▼▼▼ 069_tracking_security_hardening.sql ▼▼▼
-- ============================================================
-- DashMonster -- hardening de Tracking
-- Execute apos a 068. Idempotente.
--
-- Objetivos:
--   1) meta_capi_token nao pode ser lido direto pelo client Supabase.
--   2) no maximo 1 pixel default por empresa.
--   3) marcar default em uma unica transacao via RPC.
-- ============================================================

-- Se historicamente mais de um pixel ficou default, preserva o mais antigo.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (PARTITION BY company_id ORDER BY created_at ASC, id ASC) AS rn
  FROM public.tracking_pixels
  WHERE is_default
)
UPDATE public.tracking_pixels tp
SET is_default = false
FROM ranked r
WHERE tp.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tracking_pixels_one_default
  ON public.tracking_pixels(company_id)
  WHERE is_default;

-- O app novo usa Route Handlers com service_role para listar/mutar pixels.
-- Authenticated ainda pode ler somente colunas nao secretas quando acessa a
-- tabela diretamente; meta_capi_token deixa de ter privilegio de SELECT.
REVOKE ALL ON public.tracking_pixels FROM anon, authenticated;
GRANT SELECT (
  id,
  company_id,
  slug,
  name,
  meta_pixel_id,
  dominio_autorizado,
  meta_test_event_code,
  is_default,
  created_at
) ON public.tracking_pixels TO authenticated;

CREATE OR REPLACE FUNCTION public.set_default_tracking_pixel(
  p_company_id UUID,
  p_pixel_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_write_company(p_company_id) AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'sem permissao para editar esta empresa';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tracking_pixels
    WHERE id = p_pixel_id
      AND company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'pixel nao encontrado nesta empresa';
  END IF;

  UPDATE public.tracking_pixels
  SET is_default = false
  WHERE company_id = p_company_id
    AND is_default = true;

  UPDATE public.tracking_pixels
  SET is_default = true
  WHERE id = p_pixel_id
    AND company_id = p_company_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_default_tracking_pixel(UUID, UUID) TO authenticated, service_role;



-- ▲▲▲ 069_tracking_security_hardening.sql ▲▲▲

-- ▼▼▼ 070_tracking_funnels_product_parent_ids.sql ▼▼▼
-- ============================================================
-- DashMonster -- tracking_funnels: product_parent_ids
-- Execute após a 069. Idempotente.
--
-- Adiciona product_parent_ids TEXT[] para vincular funis pelo
-- parentId do produto Eduzz (eduzz_products.parent_id), em vez
-- de depender de match parcial por nome.
-- product_names continua para compatibilidade com funis antigos.
-- ============================================================

ALTER TABLE public.tracking_funnels
  ADD COLUMN IF NOT EXISTS product_parent_ids TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_tracking_funnels_product_parent_ids
  ON public.tracking_funnels USING GIN (product_parent_ids)
  WHERE cardinality(product_parent_ids) > 0;

-- Atualiza constraint: aceita product_parent_ids como matcher válido.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tracking_funnels_non_empty_matcher'
      AND conrelid = 'public.tracking_funnels'::regclass
  ) THEN
    ALTER TABLE public.tracking_funnels
      DROP CONSTRAINT tracking_funnels_non_empty_matcher;
  END IF;

  ALTER TABLE public.tracking_funnels
    ADD CONSTRAINT tracking_funnels_non_empty_matcher
    CHECK (
      cardinality(product_parent_ids) > 0
      OR cardinality(product_names) > 0
      OR cardinality(utm_campaigns) > 0
      OR cardinality(url_patterns) > 0
    ) NOT VALID;
END $$;


-- ▲▲▲ 070_tracking_funnels_product_parent_ids.sql ▲▲▲

-- ▼▼▼ 071_company_products.sql ▼▼▼
-- ============================================================
-- 071_company_products.sql
-- Entitlement de produto por empresa (Monster Hub: DashMonster, PipeFlow…).
-- Quem tem qual produto é decidido pelo SUPER ADMIN, não pelo dono.
-- ============================================================

-- 1) Coluna de produtos contratados (default: só o DashMonster)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS products text[] NOT NULL DEFAULT '{dash}';

-- 2) Backfill defensivo (o default já cobre linhas novas)
UPDATE public.companies SET products = '{dash}'
  WHERE products IS NULL OR array_length(products, 1) IS NULL;

-- 3) Trava de escrita: RLS não restringe por coluna, então um trigger garante
--    que SÓ super admin altera `products`. O dono edita o resto da empresa
--    normalmente (nome, settings, token), mas não consegue se auto-liberar.
CREATE OR REPLACE FUNCTION public.enforce_company_products_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.products IS DISTINCT FROM OLD.products AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Apenas super admin pode alterar os produtos da empresa.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_company_products_admin ON public.companies;
DROP TRIGGER IF EXISTS trg_company_products_admin ON public.companies;
CREATE TRIGGER trg_company_products_admin
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_company_products_admin();


-- ▲▲▲ 071_company_products.sql ▲▲▲

-- ▼▼▼ 071_tracking_pixels_webhook_secret.sql ▼▼▼
-- Adiciona coluna webhook_secret à tabela tracking_pixels.
-- Armazena um segredo gerado pelo servidor que autentica requisições de
-- webhook externos (Typeform, JotForm, ActiveCampaign, etc.) para o endpoint
-- POST /api/tracking/webhook/{pixelSlug}. Nunca exposto ao browser — só
-- retornado uma única vez na resposta de "generate-webhook-secret".
ALTER TABLE tracking_pixels
  ADD COLUMN IF NOT EXISTS webhook_secret TEXT;


-- ▲▲▲ 071_tracking_pixels_webhook_secret.sql ▲▲▲

-- ▼▼▼ 072_pipeflow_schema.sql ▼▼▼
-- ============================================================
-- 072_pipeflow_schema.sql — PipeFlow CRM: núcleo (Fase 1)
-- Execute no Supabase SQL Editor (após a 071). Idempotente.
--
-- Schema do CRM consolidado numa migration só (ver docs/pipeflow-integration.md):
--   • workspaces/workspace_members/workspace_invites NÃO existem aqui —
--     tenancy é a nossa: companies + company_members. Todo workspace_id
--     virou company_id → public.companies.
--   • Colisões renomeadas: leads→crm_leads, companies→crm_companies.
--     O FK "conta B2B do lead/deal" virou crm_company_id (company_id é
--     SEMPRE o tenant).
--   • Enums prefixados com crm_ para não poluir o namespace.
--   • RLS no padrão da casa (067/037): SELECT p/ qualquer membro,
--     escrita p/ owner|manager via can_write_company.
--   • Sem Stripe/plan/limites — acesso é o entitlement 'pipe' em
--     companies.products (071).
--   • Fora desta fase (072): inbox/mensagens, playbooks avançados,
--     dashboards CRM, notificações, API pública/webhooks,
--     pipeline_members (acesso por membro).
-- ============================================================

-- ------------------------------------------------------------
-- 0) Enums
-- ------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_lead_status') THEN
    CREATE TYPE public.crm_lead_status AS ENUM
      ('new', 'contacted', 'proposal', 'negotiation', 'won', 'lost');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_activity_type') THEN
    CREATE TYPE public.crm_activity_type AS ENUM ('call', 'email', 'meeting', 'note');
  END IF;

  -- Tipos de atividade de playbook/cadência (valores finais, já com os
  -- adicionados em 20260516120000: social/proposal/closure)
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_playbook_activity_type') THEN
    CREATE TYPE public.crm_playbook_activity_type AS ENUM
      ('call', 'email', 'whatsapp', 'instagram', 'meeting', 'task',
       'social', 'proposal', 'closure');
  END IF;

  -- Eventos de timeline do deal (valores finais, já com os da clint_crm_structure)
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_deal_history_event') THEN
    CREATE TYPE public.crm_deal_history_event AS ENUM
      ('stage_change', 'activity_completed', 'status_change', 'owner_change',
       'note_added', 'contact_updated', 'company_updated', 'field_updated',
       'deal_created', 'playbook_applied', 'activity_created', 'activity_updated');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_custom_field_type') THEN
    CREATE TYPE public.crm_custom_field_type AS ENUM
      ('text', 'number', 'monetary', 'date', 'datetime', 'phone', 'email',
       'url', 'select', 'multi_select', 'textarea', 'checkbox');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_custom_field_entity') THEN
    CREATE TYPE public.crm_custom_field_entity AS ENUM ('contact', 'company', 'deal');
  END IF;
END $$;

-- ------------------------------------------------------------
-- 1) Trigger genérico de updated_at do CRM
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- 2) profiles — nome/avatar do usuário (o CRM exibe donos/autores)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-cria profile no signup (convive com trg_materialize_invites da 025)
CREATE OR REPLACE FUNCTION public.crm_handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_profile ON auth.users;
DROP TRIGGER IF EXISTS trg_create_profile ON auth.users;
CREATE TRIGGER trg_create_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.crm_handle_new_user_profile();

-- Backfill: usuários que já existiam antes desta migration
INSERT INTO public.profiles (id, full_name, avatar_url)
SELECT u.id,
       COALESCE(u.raw_user_meta_data->>'full_name', ''),
       u.raw_user_meta_data->>'avatar_url'
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Qualquer autenticado lê (exibir nomes de membros); só o dono edita a própria linha
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "profiles_self_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_self_update" ON public.profiles;
CREATE POLICY "profiles_self_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "profiles_self_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_self_insert" ON public.profiles;
CREATE POLICY "profiles_self_insert" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- ------------------------------------------------------------
-- 3) crm_companies — contas B2B dos leads (era "companies" no PipeFlow)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_companies (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name                 TEXT        NOT NULL,
  website              TEXT,
  cnpj                 TEXT,
  city                 TEXT,
  state                TEXT,
  category             TEXT,
  segment              TEXT,
  employee_count       TEXT,
  current_crm          TEXT,
  faturamento_estimado TEXT,
  linkedin_url         TEXT,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_companies_company ON public.crm_companies(company_id);

DROP TRIGGER IF EXISTS trg_crm_companies_updated_at ON public.crm_companies;
DROP TRIGGER IF EXISTS trg_crm_companies_updated_at ON public.crm_companies;
CREATE TRIGGER trg_crm_companies_updated_at
  BEFORE UPDATE ON public.crm_companies
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

-- ------------------------------------------------------------
-- 4) crm_leads — contatos (era "leads" no PipeFlow; estado final das colunas)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_leads (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  owner_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  crm_company_id  UUID        REFERENCES public.crm_companies(id) ON DELETE SET NULL,
  name            TEXT        NOT NULL,
  email           TEXT,
  phone           TEXT,
  whatsapp        TEXT,
  instagram       TEXT,
  google_business TEXT,
  website         TEXT CHECK (website IS NULL OR length(website) <= 500),
  company         TEXT,       -- nome da empresa em texto livre (legado do form)
  position        TEXT,       -- legado; consolidado em job_title
  job_title       TEXT,
  birthdate       DATE,
  status          public.crm_lead_status NOT NULL DEFAULT 'new',
  estimated_value NUMERIC(12, 2),
  notes           TEXT,
  origin          TEXT,
  utm_source      TEXT,
  utm_medium      TEXT,
  utm_campaign    TEXT,
  utm_term        TEXT CHECK (utm_term    IS NULL OR length(utm_term)    <= 500),
  utm_content     TEXT CHECK (utm_content IS NULL OR length(utm_content) <= 500),
  utm_track       TEXT CHECK (utm_track   IS NULL OR length(utm_track)   <= 500),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_leads_company         ON public.crm_leads(company_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_owner           ON public.crm_leads(owner_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_status          ON public.crm_leads(company_id, status);
CREATE INDEX IF NOT EXISTS idx_crm_leads_crm_company     ON public.crm_leads(crm_company_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_company_created ON public.crm_leads(company_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_crm_leads_updated_at ON public.crm_leads;
DROP TRIGGER IF EXISTS trg_crm_leads_updated_at ON public.crm_leads;
CREATE TRIGGER trg_crm_leads_updated_at
  BEFORE UPDATE ON public.crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

-- ------------------------------------------------------------
-- 5) pipelines + pipeline_stages — funis dinâmicos por empresa
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pipelines (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipelines_company ON public.pipelines(company_id);

DROP TRIGGER IF EXISTS trg_pipelines_updated_at ON public.pipelines;
DROP TRIGGER IF EXISTS trg_pipelines_updated_at ON public.pipelines;
CREATE TRIGGER trg_pipelines_updated_at
  BEFORE UPDATE ON public.pipelines
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

CREATE TABLE IF NOT EXISTS public.pipeline_stages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID        NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  color       TEXT        NOT NULL DEFAULT 'slate',
  order_index INTEGER     NOT NULL DEFAULT 0,
  -- Papel semântico fixo p/ relatórios: cada funil tem UMA etapa won e UMA lost
  status_kind TEXT        NOT NULL DEFAULT 'open' CHECK (status_kind IN ('open', 'won', 'lost')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_stages_pipeline ON public.pipeline_stages(pipeline_id);

CREATE UNIQUE INDEX IF NOT EXISTS pipeline_stages_one_won_per_pipeline
  ON public.pipeline_stages(pipeline_id) WHERE status_kind = 'won';

CREATE UNIQUE INDEX IF NOT EXISTS pipeline_stages_one_lost_per_pipeline
  ON public.pipeline_stages(pipeline_id) WHERE status_kind = 'lost';

DROP TRIGGER IF EXISTS trg_pipeline_stages_updated_at ON public.pipeline_stages;
DROP TRIGGER IF EXISTS trg_pipeline_stages_updated_at ON public.pipeline_stages;
CREATE TRIGGER trg_pipeline_stages_updated_at
  BEFORE UPDATE ON public.pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

-- ------------------------------------------------------------
-- 6) deals — negócios (estado final das colunas)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.deals (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lead_id             UUID        REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  crm_company_id      UUID        REFERENCES public.crm_companies(id) ON DELETE SET NULL,
  owner_id            UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  pipeline_id         UUID        NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  stage_id            UUID        NOT NULL REFERENCES public.pipeline_stages(id) ON DELETE RESTRICT,
  title               TEXT        NOT NULL,
  value               NUMERIC(12, 2),
  status              TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost')),
  product_name        TEXT,
  temperature         TEXT,       -- cold | warm | hot
  due_date            DATE,
  expected_close_date DATE,
  lost_reason         TEXT,
  utm_source          TEXT,
  utm_medium          TEXT,
  utm_campaign        TEXT,
  utm_content         TEXT,
  utm_term            TEXT,
  origin_page         TEXT,
  acquisition_channel TEXT,
  landing_page_url    TEXT,
  proposal_url        TEXT,
  payment_url         TEXT,
  scheduling_url      TEXT,
  contract_url        TEXT,
  -- "Tempo na etapa" real: só muda ao trocar de etapa (moveDeal) ou criar
  stage_entered_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deals_company         ON public.deals(company_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage           ON public.deals(company_id, stage_id);
CREATE INDEX IF NOT EXISTS idx_deals_owner           ON public.deals(owner_id);
CREATE INDEX IF NOT EXISTS idx_deals_lead            ON public.deals(lead_id);
CREATE INDEX IF NOT EXISTS idx_deals_crm_company     ON public.deals(crm_company_id);
CREATE INDEX IF NOT EXISTS idx_deals_company_created ON public.deals(company_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_deals_updated_at ON public.deals;
DROP TRIGGER IF EXISTS trg_deals_updated_at ON public.deals;
CREATE TRIGGER trg_deals_updated_at
  BEFORE UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

-- ------------------------------------------------------------
-- 7) activities — timeline do lead (ligação/e-mail/reunião/nota)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activities (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lead_id     UUID        NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  author_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  type        public.crm_activity_type NOT NULL,
  title       TEXT        NOT NULL,
  description TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activities_company       ON public.activities(company_id);
CREATE INDEX IF NOT EXISTS idx_activities_lead          ON public.activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_activities_author        ON public.activities(author_id);
CREATE INDEX IF NOT EXISTS idx_activities_lead_occurred ON public.activities(lead_id, occurred_at DESC);

-- ------------------------------------------------------------
-- 8) tags + deal_tags
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tags (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  color      TEXT        NOT NULL DEFAULT 'slate',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tags_company ON public.tags(company_id);

DROP TRIGGER IF EXISTS trg_tags_updated_at ON public.tags;
DROP TRIGGER IF EXISTS trg_tags_updated_at ON public.tags;
CREATE TRIGGER trg_tags_updated_at
  BEFORE UPDATE ON public.tags
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

CREATE TABLE IF NOT EXISTS public.deal_tags (
  deal_id    UUID        NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  tag_id     UUID        NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  company_id UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (deal_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_deal_tags_company ON public.deal_tags(company_id);

-- ------------------------------------------------------------
-- 9) pipeline_stage_activities — templates de cadência por etapa
--    (mínimo p/ deal_activities funcionar; playbooks avançados = Fase 4)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pipeline_stage_activities (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id      UUID        NOT NULL REFERENCES public.pipeline_stages(id) ON DELETE CASCADE,
  company_id    UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title         TEXT        NOT NULL,
  activity_type public.crm_playbook_activity_type NOT NULL DEFAULT 'task',
  day_offset    INTEGER     NOT NULL DEFAULT 0,
  script        TEXT,
  order_index   INTEGER     NOT NULL DEFAULT 0,
  icon_key      TEXT,
  action_label  TEXT,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_psa_company ON public.pipeline_stage_activities(company_id);
CREATE INDEX IF NOT EXISTS idx_psa_stage   ON public.pipeline_stage_activities(stage_id);

DROP TRIGGER IF EXISTS trg_psa_updated_at ON public.pipeline_stage_activities;
DROP TRIGGER IF EXISTS trg_psa_updated_at ON public.pipeline_stage_activities;
CREATE TRIGGER trg_psa_updated_at
  BEFORE UPDATE ON public.pipeline_stage_activities
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

-- ------------------------------------------------------------
-- 10) deal_activities — atividades do negócio (também é o calendário)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.deal_activities (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id            UUID        NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  company_id         UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title              TEXT        NOT NULL,
  activity_type      public.crm_playbook_activity_type NOT NULL DEFAULT 'task',
  script             TEXT,
  icon_key           TEXT,
  action_label       TEXT,
  day_offset         INTEGER     NOT NULL DEFAULT 0,
  order_index        INTEGER     NOT NULL DEFAULT 0,
  due_date           TIMESTAMPTZ,
  completed_at       TIMESTAMPTZ,
  completed_by       UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_custom          BOOLEAN     NOT NULL DEFAULT false,
  source_template_id UUID        REFERENCES public.pipeline_stage_activities(id) ON DELETE SET NULL,
  -- Campos de calendário (20260520000004)
  assigned_to        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  scheduled_start_at TIMESTAMPTZ,
  scheduled_end_at   TIMESTAMPTZ,
  reminder_at        TIMESTAMPTZ,
  reminder_sent_at   TIMESTAMPTZ,
  priority           TEXT        NOT NULL DEFAULT 'normal',
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_da_company ON public.deal_activities(company_id);
CREATE INDEX IF NOT EXISTS idx_da_deal    ON public.deal_activities(deal_id);

CREATE INDEX IF NOT EXISTS idx_da_company_assignee_schedule
  ON public.deal_activities(company_id, assigned_to, scheduled_start_at);

CREATE INDEX IF NOT EXISTS idx_da_company_reminders
  ON public.deal_activities(company_id, reminder_at, reminder_sent_at)
  WHERE reminder_at IS NOT NULL AND reminder_sent_at IS NULL AND completed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_da_company_deal_schedule
  ON public.deal_activities(company_id, deal_id, scheduled_start_at);

CREATE INDEX IF NOT EXISTS idx_da_deal_completed
  ON public.deal_activities(deal_id, completed_at);

DROP TRIGGER IF EXISTS trg_da_updated_at ON public.deal_activities;
DROP TRIGGER IF EXISTS trg_da_updated_at ON public.deal_activities;
CREATE TRIGGER trg_da_updated_at
  BEFORE UPDATE ON public.deal_activities
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

-- ------------------------------------------------------------
-- 11) deal_history — timeline de eventos do negócio
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.deal_history (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id    UUID        NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  company_id UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id    UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type public.crm_deal_history_event NOT NULL,
  old_value  TEXT,
  new_value  TEXT,
  details    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dh_company ON public.deal_history(company_id);
CREATE INDEX IF NOT EXISTS idx_dh_deal    ON public.deal_history(deal_id);

-- ------------------------------------------------------------
-- 12) custom_field_definitions + custom_field_values
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.custom_field_definitions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  entity_type public.crm_custom_field_entity NOT NULL,
  group_name  TEXT        NOT NULL DEFAULT 'Geral',
  label       TEXT        NOT NULL,
  field_type  public.crm_custom_field_type NOT NULL DEFAULT 'text',
  placeholder TEXT,
  options     JSONB,      -- opções de select/multi_select
  is_required BOOLEAN     NOT NULL DEFAULT false,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cfd_company ON public.custom_field_definitions(company_id);

DROP TRIGGER IF EXISTS trg_cfd_updated_at ON public.custom_field_definitions;
DROP TRIGGER IF EXISTS trg_cfd_updated_at ON public.custom_field_definitions;
CREATE TRIGGER trg_cfd_updated_at
  BEFORE UPDATE ON public.custom_field_definitions
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

CREATE TABLE IF NOT EXISTS public.custom_field_values (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  field_id   UUID        NOT NULL REFERENCES public.custom_field_definitions(id) ON DELETE CASCADE,
  entity_id  UUID        NOT NULL, -- id de crm_lead, crm_company ou deal
  value      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (field_id, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_cfv_company ON public.custom_field_values(company_id);
CREATE INDEX IF NOT EXISTS idx_cfv_entity  ON public.custom_field_values(entity_id);

DROP TRIGGER IF EXISTS trg_cfv_updated_at ON public.custom_field_values;
DROP TRIGGER IF EXISTS trg_cfv_updated_at ON public.custom_field_values;
CREATE TRIGGER trg_cfv_updated_at
  BEFORE UPDATE ON public.custom_field_values
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

-- ------------------------------------------------------------
-- 13) RLS — padrão da casa (067/037): leitura p/ membro, escrita p/
--     owner|manager (can_write_company). pipeline_stages e deal_tags não
--     têm company_id direto? Têm sim (deal_tags) / herdam via pipeline
--     (pipeline_stages) — resolvido com subquery igual ao original.
-- ------------------------------------------------------------
ALTER TABLE public.crm_companies             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_leads                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipelines                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_stages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_tags                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_stage_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_activities           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_history              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_field_definitions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_field_values       ENABLE ROW LEVEL SECURITY;

-- Tabelas com company_id direto: mesmo par de policies em todas
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'crm_companies', 'crm_leads', 'pipelines', 'deals', 'activities',
    'tags', 'deal_tags', 'pipeline_stage_activities', 'deal_activities',
    'deal_history', 'custom_field_definitions', 'custom_field_values'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
       USING (public.is_company_member(company_id))',
      t || '_select', t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_write', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
       USING (public.can_write_company(company_id))
       WITH CHECK (public.can_write_company(company_id))',
      t || '_write', t
    );
  END LOOP;
END $$;

-- pipeline_stages: herda a empresa via pipelines
DROP POLICY IF EXISTS "pipeline_stages_select" ON public.pipeline_stages;
DROP POLICY IF EXISTS "pipeline_stages_select" ON public.pipeline_stages;
CREATE POLICY "pipeline_stages_select" ON public.pipeline_stages
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.pipelines p
    WHERE p.id = pipeline_id AND public.is_company_member(p.company_id)
  ));

DROP POLICY IF EXISTS "pipeline_stages_write" ON public.pipeline_stages;
DROP POLICY IF EXISTS "pipeline_stages_write" ON public.pipeline_stages;
CREATE POLICY "pipeline_stages_write" ON public.pipeline_stages
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.pipelines p
    WHERE p.id = pipeline_id AND public.can_write_company(p.company_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.pipelines p
    WHERE p.id = pipeline_id AND public.can_write_company(p.company_id)
  ));


-- ▲▲▲ 072_pipeflow_schema.sql ▲▲▲

-- ▼▼▼ 073_pipeflow_full.sql ▼▼▼
-- ============================================================
-- 073_pipeflow_full.sql — PipeFlow CRM: schema restante (Fase 4)
-- Execute no Supabase SQL Editor (após a 072). Idempotente.
--
-- Completa o schema do CRM: inbox omnicanal (WhatsApp Z-API/Cloud +
-- Instagram), notificações, playbooks nomeados, dashboards custom +
-- metas, API pública (tokens) e webhooks (in/out), acesso por pipeline.
-- Mesmas adaptações da 072: workspace_id→company_id, leads→crm_leads,
-- enums crm_*, RLS padrão da casa. `dashboard_stage_mappings` ficou de fora.
-- ============================================================

-- ------------------------------------------------------------
-- 0) Enums do inbox
-- ------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_channel_provider') THEN
    CREATE TYPE public.crm_channel_provider AS ENUM ('instagram', 'whatsapp_zapi', 'whatsapp_cloud');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_channel_status') THEN
    CREATE TYPE public.crm_channel_status AS ENUM ('connected', 'disconnected', 'error');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_conversation_status') THEN
    CREATE TYPE public.crm_conversation_status AS ENUM ('open', 'resolved', 'pending');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_message_direction') THEN
    CREATE TYPE public.crm_message_direction AS ENUM ('inbound', 'outbound');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_message_sender_type') THEN
    CREATE TYPE public.crm_message_sender_type AS ENUM ('contact', 'agent');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_message_content_type') THEN
    CREATE TYPE public.crm_message_content_type AS ENUM ('text', 'image', 'audio', 'video', 'document');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_message_status') THEN
    CREATE TYPE public.crm_message_status AS ENUM ('sent', 'delivered', 'read', 'failed');
  END IF;
END $$;

-- ------------------------------------------------------------
-- 1) Inbox omnicanal: conexões, conversas, mensagens
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.channel_connections (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider         public.crm_channel_provider NOT NULL,
  status           public.crm_channel_status NOT NULL DEFAULT 'disconnected',
  account_handle   TEXT,
  account_name     TEXT,
  account_avatar   TEXT,
  access_token     TEXT,
  token_expires_at TIMESTAMPTZ,
  external_config  JSONB       NOT NULL DEFAULT '{}'::jsonb,
  connected_by     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  connected_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  error_message    TEXT
);

CREATE INDEX IF NOT EXISTS idx_channel_connections_company ON public.channel_connections(company_id);

DROP TRIGGER IF EXISTS trg_channel_connections_updated_at ON public.channel_connections;
DROP TRIGGER IF EXISTS trg_channel_connections_updated_at ON public.channel_connections;
CREATE TRIGGER trg_channel_connections_updated_at
  BEFORE UPDATE ON public.channel_connections
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

CREATE TABLE IF NOT EXISTS public.conversations (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  channel_connection_id UUID        NOT NULL REFERENCES public.channel_connections(id) ON DELETE CASCADE,
  lead_id               UUID        REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  deal_id               UUID        REFERENCES public.deals(id) ON DELETE SET NULL,
  assigned_to           UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  provider              public.crm_channel_provider NOT NULL,
  provider_thread_id    TEXT        NOT NULL,
  contact_handle        TEXT,
  contact_name          TEXT,
  contact_avatar_url    TEXT,
  status                public.crm_conversation_status NOT NULL DEFAULT 'open',
  last_message_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_preview  TEXT,
  unread_count          INTEGER     NOT NULL DEFAULT 0 CHECK (unread_count >= 0),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_channel_thread UNIQUE (channel_connection_id, provider_thread_id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_company    ON public.conversations(company_id);
CREATE INDEX IF NOT EXISTS idx_conversations_connection ON public.conversations(channel_connection_id);
CREATE INDEX IF NOT EXISTS idx_conversations_lead       ON public.conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_conversations_deal       ON public.conversations(deal_id);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned   ON public.conversations(assigned_to);

DROP TRIGGER IF EXISTS trg_conversations_updated_at ON public.conversations;
DROP TRIGGER IF EXISTS trg_conversations_updated_at ON public.conversations;
CREATE TRIGGER trg_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

CREATE TABLE IF NOT EXISTS public.messages (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id      UUID        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  company_id           UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  direction            public.crm_message_direction NOT NULL,
  sender_type          public.crm_message_sender_type NOT NULL,
  sender_id            UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  provider_message_id  TEXT,
  content_type         public.crm_message_content_type NOT NULL DEFAULT 'text',
  content              TEXT,
  media_url            TEXT,
  status               public.crm_message_status NOT NULL DEFAULT 'sent',
  status_error_code    TEXT,
  status_error_message TEXT,
  provider_timestamp   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_conv_msg_id UNIQUE (conversation_id, provider_message_id)
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_company      ON public.messages(company_id);

-- Realtime (inbox ao vivo) — idempotente
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------------
-- 2) Notificações (escopo por USUÁRIO, não por papel)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type          TEXT        NOT NULL,
  title               TEXT        NOT NULL,
  body                TEXT,
  related_deal_id     UUID        REFERENCES public.deals(id) ON DELETE SET NULL,
  related_lead_id     UUID        REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  related_activity_id UUID        REFERENCES public.deal_activities(id) ON DELETE SET NULL,
  read_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id, company_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user_all
  ON public.notifications(user_id, company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id    UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  event_type    TEXT        NOT NULL,
  email_enabled BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, company_id, event_type),
  CONSTRAINT chk_event_type CHECK (
    event_type IN (
      'lead_assigned', 'deal_stage_changed', 'deal_due_soon',
      'activity_reminder', 'member_invited', 'member_joined'
    )
  )
);

DROP TRIGGER IF EXISTS trg_notification_preferences_updated_at ON public.notification_preferences;
DROP TRIGGER IF EXISTS trg_notification_preferences_updated_at ON public.notification_preferences;
CREATE TRIGGER trg_notification_preferences_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

-- ------------------------------------------------------------
-- 3) Playbooks nomeados (biblioteca de cadências)
--    (os templates por etapa já existem: pipeline_stage_activities, 072)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.playbooks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  description TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_playbooks_company ON public.playbooks(company_id);

DROP TRIGGER IF EXISTS trg_playbooks_updated_at ON public.playbooks;
DROP TRIGGER IF EXISTS trg_playbooks_updated_at ON public.playbooks;
CREATE TRIGGER trg_playbooks_updated_at
  BEFORE UPDATE ON public.playbooks
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

CREATE TABLE IF NOT EXISTS public.playbook_activities (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_id   UUID        NOT NULL REFERENCES public.playbooks(id) ON DELETE CASCADE,
  company_id    UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title         TEXT        NOT NULL,
  activity_type public.crm_playbook_activity_type NOT NULL,
  icon_key      TEXT,
  day_offset    INTEGER     NOT NULL DEFAULT 1,
  order_index   INTEGER     NOT NULL DEFAULT 0,
  script        TEXT,
  action_label  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_playbook_activities_company  ON public.playbook_activities(company_id);
CREATE INDEX IF NOT EXISTS idx_playbook_activities_playbook ON public.playbook_activities(playbook_id);

DROP TRIGGER IF EXISTS trg_playbook_activities_updated_at ON public.playbook_activities;
DROP TRIGGER IF EXISTS trg_playbook_activities_updated_at ON public.playbook_activities;
CREATE TRIGGER trg_playbook_activities_updated_at
  BEFORE UPDATE ON public.playbook_activities
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

-- ------------------------------------------------------------
-- 4) Acesso por pipeline (membro só vê pipelines onde está)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pipeline_members (
  pipeline_id UUID        NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id  UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (pipeline_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_pipeline_members_user    ON public.pipeline_members(user_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_members_company ON public.pipeline_members(company_id);

-- ------------------------------------------------------------
-- 5) Dashboards custom + metas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dashboards (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  description     TEXT,
  template_key    TEXT,
  pipeline_ids    UUID[]      NOT NULL DEFAULT '{}',
  default_filters JSONB       NOT NULL DEFAULT '{}',
  is_default      BOOLEAN     NOT NULL DEFAULT false,
  sort_order      INTEGER     NOT NULL DEFAULT 0,
  created_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, template_key)
);

CREATE INDEX IF NOT EXISTS idx_dashboards_company ON public.dashboards(company_id);
CREATE INDEX IF NOT EXISTS idx_dashboards_default ON public.dashboards(company_id, is_default);

DROP TRIGGER IF EXISTS trg_dashboards_updated_at ON public.dashboards;
DROP TRIGGER IF EXISTS trg_dashboards_updated_at ON public.dashboards;
CREATE TRIGGER trg_dashboards_updated_at
  BEFORE UPDATE ON public.dashboards
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

CREATE TABLE IF NOT EXISTS public.dashboard_widgets (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  dashboard_id   UUID        NOT NULL REFERENCES public.dashboards(id) ON DELETE CASCADE,
  title          TEXT        NOT NULL,
  description    TEXT,
  metric         TEXT        NOT NULL,
  dimension      TEXT,
  time_basis     TEXT        NOT NULL DEFAULT 'deal_created_at',
  aggregation    TEXT        NOT NULL DEFAULT 'count',
  visualization  TEXT        NOT NULL DEFAULT 'kpi',
  filters        JSONB       NOT NULL DEFAULT '{}',
  visual_options JSONB       NOT NULL DEFAULT '{}',
  goal           NUMERIC,
  layout         JSONB       NOT NULL DEFAULT '{}',
  sort_order     INTEGER     NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_widgets_dashboard ON public.dashboard_widgets(dashboard_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_dashboard_widgets_company   ON public.dashboard_widgets(company_id);

DROP TRIGGER IF EXISTS trg_dashboard_widgets_updated_at ON public.dashboard_widgets;
DROP TRIGGER IF EXISTS trg_dashboard_widgets_updated_at ON public.dashboard_widgets;
CREATE TRIGGER trg_dashboard_widgets_updated_at
  BEFORE UPDATE ON public.dashboard_widgets
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

CREATE TABLE IF NOT EXISTS public.dashboard_goals (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  pipeline_id    UUID        REFERENCES public.pipelines(id) ON DELETE CASCADE,
  month          SMALLINT    NOT NULL CHECK (month BETWEEN 1 AND 12),
  year           SMALLINT    NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  leads          INTEGER     NOT NULL DEFAULT 0 CHECK (leads >= 0),
  sales          INTEGER     NOT NULL DEFAULT 0 CHECK (sales >= 0),
  revenue        NUMERIC     NOT NULL DEFAULT 0 CHECK (revenue >= 0),
  annual_revenue NUMERIC     NOT NULL DEFAULT 0 CHECK (annual_revenue >= 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, pipeline_id, month, year)
);

-- Unicidade p/ metas globais (pipeline_id NULL não entra na UNIQUE acima)
CREATE UNIQUE INDEX IF NOT EXISTS idx_dashboard_goals_global
  ON public.dashboard_goals(company_id, month, year)
  WHERE pipeline_id IS NULL;

DROP TRIGGER IF EXISTS trg_dashboard_goals_updated_at ON public.dashboard_goals;
DROP TRIGGER IF EXISTS trg_dashboard_goals_updated_at ON public.dashboard_goals;
CREATE TRIGGER trg_dashboard_goals_updated_at
  BEFORE UPDATE ON public.dashboard_goals
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

-- ------------------------------------------------------------
-- 6) API pública + webhooks
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.api_tokens (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  token_hash   TEXT        NOT NULL UNIQUE,
  scopes       TEXT[]      NOT NULL DEFAULT '{}',
  last_used_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_company ON public.api_tokens(company_id);
CREATE INDEX IF NOT EXISTS idx_api_tokens_hash    ON public.api_tokens(token_hash);

CREATE TABLE IF NOT EXISTS public.webhook_subscriptions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name              TEXT        NOT NULL,
  url               TEXT        NOT NULL,
  events            TEXT[]      NOT NULL DEFAULT '{}',
  secret            TEXT        NOT NULL,
  is_active         BOOLEAN     NOT NULL DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  last_status_code  INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_company ON public.webhook_subscriptions(company_id);

CREATE TABLE IF NOT EXISTS public.webhook_delivery_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id      UUID        NOT NULL REFERENCES public.webhook_subscriptions(id) ON DELETE CASCADE,
  event_type      TEXT        NOT NULL,
  payload         JSONB       NOT NULL DEFAULT '{}',
  response_status INTEGER,
  error_message   TEXT,
  attempt_count   INTEGER     NOT NULL DEFAULT 1,
  delivered_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_delivery_logs_webhook   ON public.webhook_delivery_logs(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_delivery_logs_delivered ON public.webhook_delivery_logs(delivered_at DESC);

CREATE TABLE IF NOT EXISTS public.inbound_webhooks (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name             TEXT        NOT NULL,
  webhook_key      TEXT        NOT NULL UNIQUE,
  pipeline_id      UUID        REFERENCES public.pipelines(id) ON DELETE SET NULL,
  default_stage_id UUID        REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  default_owner_id UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  default_tags     TEXT[]      NOT NULL DEFAULT '{}',
  default_product  TEXT,
  field_map        JSONB       NOT NULL DEFAULT '{}',
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inbound_webhooks_key ON public.inbound_webhooks(webhook_key);
CREATE INDEX IF NOT EXISTS idx_inbound_webhooks_company    ON public.inbound_webhooks(company_id);

-- ------------------------------------------------------------
-- 7) RLS
-- ------------------------------------------------------------
ALTER TABLE public.channel_connections      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playbooks                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playbook_activities      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_members         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboards               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_widgets        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_goals          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_tokens               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_subscriptions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_delivery_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbound_webhooks         ENABLE ROW LEVEL SECURITY;

-- Padrão da casa: leitura p/ membro, escrita p/ owner|manager
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'channel_connections', 'conversations', 'messages',
    'playbooks', 'playbook_activities', 'pipeline_members',
    'dashboards', 'dashboard_widgets', 'dashboard_goals',
    'api_tokens', 'webhook_subscriptions', 'inbound_webhooks'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
       USING (public.is_company_member(company_id))',
      t || '_select', t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_write', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
       USING (public.can_write_company(company_id))
       WITH CHECK (public.can_write_company(company_id))',
      t || '_write', t
    );
  END LOOP;
END $$;

-- Notificações: cada usuário só vê/gerencia as PRÓPRIAS
DROP POLICY IF EXISTS "notifications_self_select" ON public.notifications;
DROP POLICY IF EXISTS "notifications_self_select" ON public.notifications;
CREATE POLICY "notifications_self_select" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_self_update" ON public.notifications;
DROP POLICY IF EXISTS "notifications_self_update" ON public.notifications;
CREATE POLICY "notifications_self_update" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_member_insert" ON public.notifications;
DROP POLICY IF EXISTS "notifications_member_insert" ON public.notifications;
CREATE POLICY "notifications_member_insert" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(company_id));

DROP POLICY IF EXISTS "notification_preferences_self" ON public.notification_preferences;
DROP POLICY IF EXISTS "notification_preferences_self" ON public.notification_preferences;
CREATE POLICY "notification_preferences_self" ON public.notification_preferences
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Logs de entrega: leitura via assinatura da empresa (sem company_id direto)
DROP POLICY IF EXISTS "webhook_delivery_logs_select" ON public.webhook_delivery_logs;
DROP POLICY IF EXISTS "webhook_delivery_logs_select" ON public.webhook_delivery_logs;
CREATE POLICY "webhook_delivery_logs_select" ON public.webhook_delivery_logs
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.webhook_subscriptions ws
    WHERE ws.id = webhook_id AND public.is_company_member(ws.company_id)
  ));


-- ▲▲▲ 073_pipeflow_full.sql ▲▲▲

-- ▼▼▼ 074_login_events.sql ▼▼▼
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


-- ▲▲▲ 074_login_events.sql ▲▲▲

-- ▼▼▼ 075_superadmin_crm.sql ▼▼▼
-- ─── 075: super admin enxerga o PipeFlow de todas as empresas ──────────────────
-- As tabelas do CRM (072/073) só tinham policies de membro (is_company_member /
-- can_write_company). O Painel Admin unificado precisa que o super admin leia e
-- gerencie funis/leads/canais de QUALQUER empresa — mesmo padrão da 026.
-- Fica de fora o que é pessoal do usuário (profiles, notifications, prefs).

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    -- 072
    'crm_companies', 'crm_leads', 'pipelines', 'pipeline_stages', 'deals',
    'activities', 'tags', 'deal_tags', 'pipeline_stage_activities',
    'deal_activities', 'deal_history', 'custom_field_definitions', 'custom_field_values',
    -- 073
    'channel_connections', 'conversations', 'messages',
    'playbooks', 'playbook_activities', 'pipeline_members',
    'dashboards', 'dashboard_widgets', 'dashboard_goals',
    'api_tokens', 'webhook_subscriptions', 'webhook_delivery_logs', 'inbound_webhooks'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_superadmin_all', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
         USING (public.is_super_admin()) WITH CHECK (public.is_super_admin())',
        t || '_superadmin_all', t);
    END IF;
  END LOOP;
END $$;


-- ▲▲▲ 075_superadmin_crm.sql ▲▲▲

-- ▼▼▼ 076_product_expiry.sql ▼▼▼
-- ============================================================
-- 076_product_expiry.sql
-- Temporizador de produto por empresa: acesso ilimitado, teste de
-- 7/30 dias etc. product_expiry = { "pipe": "2026-08-01T00:00:00Z" }.
-- Produto sem chave = ilimitado. Vencido = tratado como não contratado
-- no app. Mesma trava da 071: SÓ super admin altera.
-- ============================================================

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS product_expiry jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Trigger da 071 estendido: products E product_expiry são só-super-admin.
CREATE OR REPLACE FUNCTION public.enforce_company_products_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF (NEW.products IS DISTINCT FROM OLD.products
      OR NEW.product_expiry IS DISTINCT FROM OLD.product_expiry)
     AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Apenas super admin pode alterar os produtos da empresa.';
  END IF;
  RETURN NEW;
END;
$$;

-- (o trigger trg_company_products_admin da 071 já aponta pra esta função)


-- ▲▲▲ 076_product_expiry.sql ▲▲▲

-- ▼▼▼ 077_invite_accept_flow.sql ▼▼▼
-- ============================================================
-- 077_invite_accept_flow.sql
-- Convite deixa de ser silencioso: agora SEMPRE fica pendente em
-- company_invites até a pessoa aceitar explicitamente (tela /aceitar-convite).
-- Antes: quem já tinha conta entrava na hora; quem não tinha, entrava sozinho
-- ao se cadastrar (trigger materialize). Os dois casos removem a escolha da
-- pessoa — o pedido agora é que ela veja o convite e decida.
-- ============================================================

-- 1) Não materializa mais sozinho no signup — a aceitação é explícita.
DROP TRIGGER IF EXISTS trg_materialize_invites ON auth.users;

-- 2) invite_company_member: sempre cria/atualiza o convite pendente, nunca
--    insere direto em company_members (nem para quem já tem conta).
CREATE OR REPLACE FUNCTION public.invite_company_member(
  p_company_id UUID,
  p_email      TEXT,
  p_role       TEXT
)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_email TEXT := lower(trim(p_email));
BEGIN
  IF NOT (public.company_role(p_company_id) = 'owner' OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'Apenas o dono da empresa (ou super admin) pode convidar membros.';
  END IF;

  IF p_role NOT IN ('owner','manager','viewer') THEN
    RAISE EXCEPTION 'Papel inválido: %', p_role;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.company_members m
    JOIN auth.users u ON u.id = m.user_id
    WHERE m.company_id = p_company_id AND lower(u.email) = v_email
  ) THEN
    RAISE EXCEPTION 'Esta pessoa já é membro da empresa.';
  END IF;

  INSERT INTO public.company_invites (company_id, email, role, created_by)
  VALUES (p_company_id, v_email, p_role, auth.uid())
  ON CONFLICT (company_id, email) DO UPDATE SET role = EXCLUDED.role, created_at = now();

  RETURN 'invited';
END;
$$;

-- 3) Quem pode ver convites endereçados ao PRÓPRIO e-mail (pra tela de aceitar).
DROP POLICY IF EXISTS "company_invites_self_select" ON public.company_invites;
DROP POLICY IF EXISTS "company_invites_self_select" ON public.company_invites;
CREATE POLICY "company_invites_self_select" ON public.company_invites
  FOR SELECT TO authenticated
  USING (lower(email) = lower(coalesce(auth.jwt()->>'email', '')));

-- 4) Lista os convites pendentes do usuário logado, com o nome da empresa
--    (SECURITY DEFINER: a pessoa ainda não é membro, então não passaria pela
--    RLS normal de companies pra ler o nome).
CREATE OR REPLACE FUNCTION public.fetch_my_pending_invites()
RETURNS TABLE(id UUID, company_id UUID, company_name TEXT, role TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT i.id, i.company_id, c.name, i.role, i.created_at
  FROM public.company_invites i
  JOIN public.companies c ON c.id = i.company_id
  WHERE lower(i.email) = lower(coalesce(auth.jwt()->>'email', ''))
  ORDER BY i.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.fetch_my_pending_invites() TO authenticated;

-- 5) Aceitar: só o dono do e-mail do convite pode aceitar o PRÓPRIO convite.
CREATE OR REPLACE FUNCTION public.accept_company_invite(p_invite_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_invite public.company_invites%ROWTYPE;
  v_my_email TEXT := lower(coalesce(auth.jwt()->>'email', ''));
BEGIN
  SELECT * INTO v_invite FROM public.company_invites WHERE id = p_invite_id;
  IF v_invite IS NULL THEN
    RAISE EXCEPTION 'Convite não encontrado (talvez já tenha sido aceito ou revogado).';
  END IF;
  IF lower(v_invite.email) <> v_my_email THEN
    RAISE EXCEPTION 'Este convite não é para o seu e-mail.';
  END IF;

  INSERT INTO public.company_members (company_id, user_id, role, email)
  VALUES (v_invite.company_id, auth.uid(), v_invite.role, v_my_email)
  ON CONFLICT (company_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  DELETE FROM public.company_invites WHERE id = p_invite_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.accept_company_invite(UUID) TO authenticated;

-- 6) Recusar: só descarta o convite, checando a mesma dona do e-mail.
CREATE OR REPLACE FUNCTION public.decline_company_invite(p_invite_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_email TEXT;
  v_my_email TEXT := lower(coalesce(auth.jwt()->>'email', ''));
BEGIN
  SELECT lower(email) INTO v_email FROM public.company_invites WHERE id = p_invite_id;
  IF v_email IS NULL THEN RETURN; END IF;
  IF v_email <> v_my_email THEN
    RAISE EXCEPTION 'Este convite não é para o seu e-mail.';
  END IF;
  DELETE FROM public.company_invites WHERE id = p_invite_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.decline_company_invite(UUID) TO authenticated;


-- ▲▲▲ 077_invite_accept_flow.sql ▲▲▲

-- ▼▼▼ 078_eduzz_products_role.sql ▼▼▼
-- ============================================================
-- DashMonster — papel do produto (main/bump) no catálogo Eduzz
-- Execute no Supabase SQL Editor (após a 077). Idempotente.
--
-- Quando uma venda tem order bump, `data.items[]` do invoice_paid vem com
-- TODOS os produtos do checkout juntos, sem nenhuma flag por item dizendo
-- qual é o principal e qual é o bump (`orderBump.isMainSale` é da FATURA
-- inteira, não do item). `role` aqui deixa o usuário marcar isso 1x por
-- produto (mesmo padrão de `pixel_id`, migration 050) — o webhook usa essa
-- config pra escolher qual item vira o "produto principal" da venda
-- (pixel/content_name/campaign_name), com valor total pago da fatura,
-- independente de quantos itens vieram.
--
-- default 'main': produto nunca configurado (ou empresa sem order bump)
-- continua se comportando como sempre — só entra em jogo quando 2+ itens
-- da MESMA venda têm parentId's diferentes.
-- ============================================================

ALTER TABLE public.eduzz_products
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'main';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'eduzz_products_role_check'
  ) THEN
    ALTER TABLE public.eduzz_products
      ADD CONSTRAINT eduzz_products_role_check CHECK (role IN ('main', 'bump'));
  END IF;
END $$;


-- ▲▲▲ 078_eduzz_products_role.sql ▲▲▲

-- ▼▼▼ 079_events_log_items.sql ▼▼▼
-- ============================================================
-- DashMonster — itemização da venda em events_log (nome/valor/papel)
-- Execute no Supabase SQL Editor (após a 078). Idempotente.
--
-- Antes desta migration, uma Purchase com order bump só gravava o produto
-- ESCOLHIDO como principal (product_name/product_parent_id/product_item_id,
-- ver migration 078/pickMainItem) — o histórico do visitante não tinha como
-- mostrar o bump separadamente quando ele veio na MESMA fatura (sem virar
-- uma linha própria em events_log). `items` guarda o array completo
-- (main + bump) de `SaleEvent.items` só pra exibição — não afeta pixel,
-- catálogo nem CAPI (que continuam usando product_name/product_parent_id).
-- ============================================================

ALTER TABLE public.events_log
  ADD COLUMN IF NOT EXISTS items JSONB;


-- ▲▲▲ 079_events_log_items.sql ▲▲▲

-- ▼▼▼ 080_companies_scope_superadmin.sql ▼▼▼
-- ============================================================
-- DashMonster — trigger de escopo de companies ignora super admin
-- Execute no Supabase SQL Editor (após a 079). Idempotente.
--
-- Bug real: super admin criando empresa pelo Painel Admin. A RLS
-- (026) deixa o UPDATE passar, mas o trigger check_companies_update_scope
-- (035/036/048) nunca aprendeu sobre is_super_admin(). Pior: pra quem
-- NÃO é membro da empresa, company_role() devolve NULL e o guard
-- `role <> 'manager'` não dispara (NULL não é TRUE) — o super admin
-- caía na whitelist de gestor de tráfego e levava
-- "Gestor de tráfego só pode editar as configurações de Tracking..."
-- ao salvar settings/filtros da empresa recém-criada.
-- ============================================================

CREATE OR REPLACE FUNCTION public.check_companies_update_scope()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  allowed_keys TEXT[] := ARRAY['meta_pixel_id', 'meta_capi_token', 'dominio_autorizado', 'meta_test_event_code', 'eduzz_unmapped_purchase_action'];
  role TEXT;
  old_j JSONB;
  new_j JSONB;
  key TEXT;
BEGIN
  IF public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  role := public.company_role(NEW.id);

  IF role = 'owner' THEN
    RETURN NEW;
  END IF;

  -- IS DISTINCT FROM: NULL (não-membro) também é rejeitado aqui,
  -- em vez de vazar pra whitelist abaixo.
  IF role IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Sem permissão pra editar esta empresa.';
  END IF;

  old_j := to_jsonb(OLD);
  new_j := to_jsonb(NEW);
  FOR key IN SELECT jsonb_object_keys(new_j) LOOP
    CONTINUE WHEN key = ANY(allowed_keys);
    IF old_j -> key IS DISTINCT FROM new_j -> key THEN
      RAISE EXCEPTION 'Gestor de tráfego só pode editar as configurações de Tracking (Pixel ID, Token CAPI, domínio autorizado, código de teste, política de venda sem produto mapeado).';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;


-- ▲▲▲ 080_companies_scope_superadmin.sql ▲▲▲

-- ▼▼▼ 081_audit_log.sql ▼▼▼
-- ─── 081: registro de auditoria (ações relevantes de usuários) ────────────────
-- Não é log de CADA clique — é log de AÇÕES com significado: navegação entre
-- páginas/pastas, exportação de dados, mudança de produtos contratados,
-- criar/editar/excluir. Volume moderado, pensado pra auditoria de verdade.
--
-- `action` é TEXT (não enum) de propósito: novos tipos de ação não devem
-- exigir migration. Valores usados hoje pelo código: 'page_view', 'export',
-- 'product_change', 'create', 'update', 'delete'.

CREATE TABLE IF NOT EXISTS public.audit_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID        REFERENCES public.companies(id) ON DELETE CASCADE, -- null = ação de plataforma (super admin fora do contexto de 1 empresa)
  user_id      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email   TEXT,       -- snapshot: sobrevive à exclusão do usuário
  action       TEXT        NOT NULL,
  entity_type  TEXT,       -- 'page' | 'folder' | 'product' | 'campaign' | 'lead' | 'deal' | ...
  entity_label TEXT,       -- texto legível: nome da página/pasta/produto/campanha
  details      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_company_created ON public.audit_log(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_created    ON public.audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action          ON public.audit_log(action);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Leitura: super admin vê tudo; owner/manager vê só a própria empresa (viewer não vê).
DROP POLICY IF EXISTS audit_log_select ON public.audit_log;
DROP POLICY IF EXISTS audit_log_select ON public.audit_log;
CREATE POLICY audit_log_select ON public.audit_log
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (company_id IS NOT NULL AND public.can_write_company(company_id))
  );

-- Escrita: qualquer usuário autenticado grava eventos SOBRE SI MESMO, de uma
-- empresa da qual é membro — ou super admin agindo sobre QUALQUER empresa
-- (ex.: mudar produtos contratados de uma empresa que não é a dele).
-- Sem policy de update/delete — registro é imutável (só insert/select).
DROP POLICY IF EXISTS audit_log_insert ON public.audit_log;
DROP POLICY IF EXISTS audit_log_insert ON public.audit_log;
CREATE POLICY audit_log_insert ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (company_id IS NULL OR public.is_company_member(company_id) OR public.is_super_admin())
  );


-- ▲▲▲ 081_audit_log.sql ▲▲▲

-- ▼▼▼ 082_companies_soft_delete.sql ▼▼▼
-- ============================================================
-- GSAStúdio Hub — companies: soft delete + trava de DELETE físico
-- Execute no Supabase SQL Editor (após a 081). Idempotente.
--
-- POR QUE ISTO EXISTE (incidente real, 14/07/2026):
-- uma empresa foi excluída e levou junto, em cascata e sem aviso, TODO
-- o dado dela. A migration 021 pôs `ON DELETE CASCADE` em 13 tabelas
-- (user_categories, user_account_entries, campaign_metrics,
-- historical_rows, historical_metas, products, user_tags,
-- instagram_accounts, instagram_groups, campaign_creatives,
-- user_manual_overrides, advertiser_profiles) e outras vieram depois
-- (events_log, crm_leads, eduzz_*, tracking_pixels). No plano Free do
-- Supabase não há backup nem PITR: o dado não volta. Um clique = perda
-- definitiva de anos de histórico.
--
-- DUAS CAMADAS:
--   1) `deleted_at` — excluir passa a ser UPDATE, não DELETE. A cascata
--      nunca dispara e dá pra restaurar.
--   2) Trigger BEFORE DELETE — bloqueia DELETE físico direto. A trava
--      fica no BANCO de propósito: o app antigo (dashmonster) e o painel
--      do Supabase apontam pro mesmo banco e continuariam apagando em
--      cascata. Proteção no app só cobriria um dos caminhos.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Coluna de exclusão lógica
-- ------------------------------------------------------------
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.companies.deleted_at IS
  'Exclusão lógica. NULL = ativa. Preenchido = na lixeira (some das listas, restaurável). Nunca use DELETE nesta tabela: a cascata apaga 13+ tabelas e não há backup no plano Free.';

-- Lista de ativas é o caminho quente de quase toda query.
CREATE INDEX IF NOT EXISTS idx_companies_active
  ON public.companies(id) WHERE deleted_at IS NULL;

-- ------------------------------------------------------------
-- 2) Trava de DELETE físico
--    Escape hatch consciente, por sessão:
--      SET LOCAL app.allow_company_purge = 'on';
--    Assim um purge de verdade continua possível, mas nunca por acidente
--    e nunca vindo do app.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.block_company_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF coalesce(current_setting('app.allow_company_purge', true), '') = 'on' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION
    'DELETE bloqueado em companies (empresa "%"). Isto apagaria em cascata campanhas, histórico, produtos, leads, tracking e Eduzz — sem backup no plano Free. Use exclusão lógica: UPDATE companies SET deleted_at = now() WHERE id = %. Purge real (irreversível): SET LOCAL app.allow_company_purge = ''on''; antes do DELETE.',
    OLD.name, OLD.id
    USING ERRCODE = 'raise_exception';
END;
$$;

DROP TRIGGER IF EXISTS trg_block_company_hard_delete ON public.companies;
DROP TRIGGER IF EXISTS trg_block_company_hard_delete ON public.companies;
CREATE TRIGGER trg_block_company_hard_delete
  BEFORE DELETE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.block_company_hard_delete();

-- ------------------------------------------------------------
-- 3) Quem pode mandar pra lixeira / restaurar
--    O trigger de escopo (080) já libera geral pra super admin e owner,
--    e barra o resto. `deleted_at` NÃO entra na whitelist do gestor de
--    tráfego — ele segue só com os campos de Tracking.
-- ------------------------------------------------------------


-- ▲▲▲ 082_companies_soft_delete.sql ▲▲▲