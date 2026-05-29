-- ============================================================
-- Analytics PTA — Schema completo
-- Gerado de supabase/migrations/ (001 → 013)
-- Execute no Supabase SQL Editor: cole tudo e rode uma vez.
-- ============================================================


-- ============================================================
-- 001 — Tabelas históricas (historical_rows, historical_metas)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.historical_rows (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  product       TEXT        NOT NULL,
  month         TEXT        NOT NULL,
  year          INTEGER     NOT NULL,
  month_key     TEXT        NOT NULL,
  month_label   TEXT        NOT NULL,
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

ALTER TABLE public.historical_rows  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historical_metas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_full_historical_rows"  ON public.historical_rows
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "anon_full_historical_metas" ON public.historical_metas
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_hist_rows_month_key  ON public.historical_rows(month_key);
CREATE INDEX IF NOT EXISTS idx_hist_rows_product    ON public.historical_rows(product);
CREATE INDEX IF NOT EXISTS idx_hist_metas_product   ON public.historical_metas(product);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_hist_rows_updated_at ON public.historical_rows;
CREATE TRIGGER trg_hist_rows_updated_at
  BEFORE UPDATE ON public.historical_rows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- 002 — Auth + Dashboard compartilhado (campaign_metrics, dashboard_data_source)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.campaign_metrics (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  date          TEXT        NOT NULL,
  campaign_name TEXT        NOT NULL,
  investment    NUMERIC     NOT NULL DEFAULT 0,
  clicks        NUMERIC     NOT NULL DEFAULT 0,
  impressions   NUMERIC     NOT NULL DEFAULT 0,
  conversions   NUMERIC     NOT NULL DEFAULT 0,
  revenue       NUMERIC     NOT NULL DEFAULT 0,
  source        TEXT        NOT NULL CHECK (source IN ('csv', 'google_sheets', 'meta')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_metrics_date   ON public.campaign_metrics(date);
CREATE INDEX IF NOT EXISTS idx_campaign_metrics_source ON public.campaign_metrics(source);

ALTER TABLE public.campaign_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_campaign_metrics" ON public.campaign_metrics;
CREATE POLICY "authenticated_read_campaign_metrics"
  ON public.campaign_metrics FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_write_campaign_metrics" ON public.campaign_metrics;
CREATE POLICY "authenticated_write_campaign_metrics"
  ON public.campaign_metrics FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_campaign_metrics" ON public.campaign_metrics;
CREATE POLICY "authenticated_update_campaign_metrics"
  ON public.campaign_metrics FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_campaign_metrics" ON public.campaign_metrics;
CREATE POLICY "authenticated_delete_campaign_metrics"
  ON public.campaign_metrics FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.dashboard_data_source (
  id          BOOLEAN     PRIMARY KEY DEFAULT true CHECK (id = true),
  source_type TEXT        NOT NULL CHECK (source_type IN ('csv', 'google_sheets', 'meta')),
  source_label TEXT       NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.dashboard_data_source ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_dashboard_data_source" ON public.dashboard_data_source;
CREATE POLICY "authenticated_read_dashboard_data_source"
  ON public.dashboard_data_source FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_write_dashboard_data_source" ON public.dashboard_data_source;
CREATE POLICY "authenticated_write_dashboard_data_source"
  ON public.dashboard_data_source FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_updated_at_dashboard_data_source()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_dashboard_data_source_updated_at ON public.dashboard_data_source;
CREATE TRIGGER trg_dashboard_data_source_updated_at
  BEFORE UPDATE ON public.dashboard_data_source
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_dashboard_data_source();

DO $$
DECLARE
  v_user_id UUID := '11111111-1111-1111-1111-111111111111';
BEGIN
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    v_user_id, 'authenticated', 'authenticated', 'admin@dashboard.local',
    crypt('admin123', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Admin"}'::jsonb,
    now(), now()
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', 'admin@dashboard.local'),
    'email', 'admin@dashboard.local', now(), now()
  ) ON CONFLICT (provider, provider_id) DO NOTHING;
END $$;


-- ============================================================
-- 003a — Grants Data API + Realtime
-- ============================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.campaign_metrics TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.dashboard_data_source TO authenticated;
GRANT SELECT ON TABLE public.campaign_metrics TO anon;
GRANT SELECT ON TABLE public.dashboard_data_source TO anon;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'campaign_metrics'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_metrics;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'dashboard_data_source'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dashboard_data_source;
  END IF;
END $$;


-- ============================================================
-- 003b — historical_rows: coluna kind + extra
-- ============================================================

ALTER TABLE IF EXISTS public.historical_rows
  ADD COLUMN IF NOT EXISTS kind  TEXT  NOT NULL DEFAULT 'lancamento',
  ADD COLUMN IF NOT EXISTS extra JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS historical_rows_kind_idx ON public.historical_rows(kind);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'historical_rows_kind_check'
  ) THEN
    ALTER TABLE public.historical_rows
      ADD CONSTRAINT historical_rows_kind_check
      CHECK (kind IN ('lancamento','evento','perpetuo','instagram'));
  END IF;
END $$;


-- ============================================================
-- 004 — Tabelas faltantes: categoria, historical_rows (full), historical_metas (full)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.categoria (
  key         TEXT        PRIMARY KEY,
  label       TEXT        NOT NULL,
  description TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.categoria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_categoria" ON public.categoria
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "authenticated_write_categoria" ON public.categoria
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.categoria TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categoria TO authenticated;

INSERT INTO public.categoria (key, label, description) VALUES
  ('pos',      'Lançamentos de Pós', 'Campanhas mensais de lançamento das turmas de pós-graduação'),
  ('livros',   'Livros',             'Campanhas de venda de livros físicos e digitais'),
  ('ebooks',   'Ebooks',             'Produtos digitais e materiais de educação online'),
  ('perpetuo', 'Perpétuo',           'Campanhas evergreen de oferta contínua sem data de encerramento'),
  ('eventos',  'Eventos',            'Eventos presenciais, mentorias e imersões')
ON CONFLICT (key) DO NOTHING;

-- Recriar historical_rows com schema completo (IF NOT EXISTS é idempotente)
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
  extra             JSONB       NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.historical_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_full_historical_rows" ON public.historical_rows
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.historical_rows TO anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_hist_rows_month_key ON public.historical_rows(month_key);
CREATE INDEX IF NOT EXISTS idx_hist_rows_product   ON public.historical_rows(product);
CREATE INDEX IF NOT EXISTS idx_hist_rows_kind      ON public.historical_rows(kind);

DROP TRIGGER IF EXISTS trg_hist_rows_updated_at ON public.historical_rows;
CREATE TRIGGER trg_hist_rows_updated_at
  BEFORE UPDATE ON public.historical_rows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.historical_metas (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  product           TEXT    NOT NULL UNIQUE,
  investment        NUMERIC NOT NULL DEFAULT 0,
  cpm               NUMERIC NOT NULL DEFAULT 0,
  ctr               NUMERIC NOT NULL DEFAULT 0,
  page_view_rate    NUMERIC NOT NULL DEFAULT 0,
  pre_checkout_rate NUMERIC NOT NULL DEFAULT 0,
  sales_target      NUMERIC NOT NULL DEFAULT 0,
  cac               NUMERIC NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.historical_metas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_full_historical_metas" ON public.historical_metas
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.historical_metas TO anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_hist_metas_product ON public.historical_metas(product);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'historical_rows'
  ) THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.historical_rows; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'historical_metas'
  ) THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.historical_metas; END IF;
END $$;


-- ============================================================
-- 005 — Unique constraint para upsert diário do Meta
-- ============================================================

DELETE FROM public.campaign_metrics
WHERE id NOT IN (
  SELECT DISTINCT ON (date, campaign_name, source) id
  FROM public.campaign_metrics
  ORDER BY date, campaign_name, source, created_at DESC
);

ALTER TABLE public.campaign_metrics
  ADD CONSTRAINT IF NOT EXISTS campaign_metrics_date_campaign_source_key
  UNIQUE (date, campaign_name, source);


-- ============================================================
-- 006 — Criativos: campaign_creatives + bucket Storage
-- ============================================================

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

CREATE POLICY "anon_full_campaign_creatives" ON public.campaign_creatives
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_creatives TO anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_creatives_campaign ON public.campaign_creatives(campaign_name);

DROP TRIGGER IF EXISTS trg_creatives_updated_at ON public.campaign_creatives;
CREATE TRIGGER trg_creatives_updated_at
  BEFORE UPDATE ON public.campaign_creatives
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'creatives', 'creatives', true, 5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
) ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'creatives_public_read'
  ) THEN
    CREATE POLICY "creatives_public_read" ON storage.objects
      FOR SELECT TO anon, authenticated USING (bucket_id = 'creatives');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'creatives_upload'
  ) THEN
    CREATE POLICY "creatives_upload" ON storage.objects
      FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'creatives');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'creatives_update'
  ) THEN
    CREATE POLICY "creatives_update" ON storage.objects
      FOR UPDATE TO anon, authenticated USING (bucket_id = 'creatives');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'creatives_delete'
  ) THEN
    CREATE POLICY "creatives_delete" ON storage.objects
      FOR DELETE TO anon, authenticated USING (bucket_id = 'creatives');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'campaign_creatives'
  ) THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_creatives; END IF;
END $$;


-- ============================================================
-- 007 — Painel de Controle: user_categories + user_account_entries
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_categories (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug       TEXT        NOT NULL,
  name       TEXT        NOT NULL,
  type       TEXT        NOT NULL DEFAULT 'fixed' CHECK (type IN ('fixed', 'custom')),
  emoji      TEXT,
  position   INTEGER     NOT NULL DEFAULT 0,
  is_enabled BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, slug)
);

CREATE TABLE IF NOT EXISTS public.user_account_entries (
  id                    UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id           UUID    NOT NULL REFERENCES public.user_categories(id) ON DELETE CASCADE,
  label                 TEXT    NOT NULL,
  ad_account_id         TEXT    NOT NULL,
  campaigns             JSONB   NOT NULL DEFAULT '[]',
  selected_campaign_ids TEXT[]  NOT NULL DEFAULT '{}',
  is_enabled            BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_categories      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_account_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_categories_owner" ON public.user_categories
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_account_entries_owner" ON public.user_account_entries
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_categories_user_id
  ON public.user_categories(user_id);

CREATE INDEX IF NOT EXISTS idx_user_account_entries_user_id
  ON public.user_account_entries(user_id);

CREATE INDEX IF NOT EXISTS idx_user_account_entries_category_id
  ON public.user_account_entries(category_id);


-- ============================================================
-- 008 — user_account_entries: coluna internal_filter
-- ============================================================

ALTER TABLE public.user_account_entries
  ADD COLUMN IF NOT EXISTS internal_filter TEXT;


-- ============================================================
-- 009 — Correções de segurança (Supabase Database Linter)
-- ============================================================

-- Funções com search_path fixo
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at_dashboard_data_source()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- campaign_metrics — políticas de escrita com auth.uid()
DROP POLICY IF EXISTS "authenticated_write_campaign_metrics"  ON public.campaign_metrics;
DROP POLICY IF EXISTS "authenticated_update_campaign_metrics" ON public.campaign_metrics;
DROP POLICY IF EXISTS "authenticated_delete_campaign_metrics" ON public.campaign_metrics;
DROP POLICY IF EXISTS "authenticated_insert_campaign_metrics" ON public.campaign_metrics;

CREATE POLICY "authenticated_insert_campaign_metrics"
  ON public.campaign_metrics FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_update_campaign_metrics"
  ON public.campaign_metrics FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_delete_campaign_metrics"
  ON public.campaign_metrics FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "anon_read_campaign_metrics" ON public.campaign_metrics;
CREATE POLICY "anon_read_campaign_metrics"
  ON public.campaign_metrics FOR SELECT TO anon USING (true);

-- dashboard_data_source
DROP POLICY IF EXISTS "authenticated_write_dashboard_data_source"  ON public.dashboard_data_source;
DROP POLICY IF EXISTS "anon_read_dashboard_data_source"            ON public.dashboard_data_source;
DROP POLICY IF EXISTS "authenticated_update_dashboard_data_source" ON public.dashboard_data_source;
DROP POLICY IF EXISTS "authenticated_insert_dashboard_data_source" ON public.dashboard_data_source;
DROP POLICY IF EXISTS "authenticated_delete_dashboard_data_source" ON public.dashboard_data_source;

CREATE POLICY "anon_read_dashboard_data_source"
  ON public.dashboard_data_source FOR SELECT TO anon USING (true);

CREATE POLICY "authenticated_update_dashboard_data_source"
  ON public.dashboard_data_source FOR UPDATE TO authenticated
  USING (id IS TRUE AND auth.uid() IS NOT NULL)
  WITH CHECK (id IS TRUE AND auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_insert_dashboard_data_source"
  ON public.dashboard_data_source FOR INSERT TO authenticated
  WITH CHECK (id IS TRUE AND auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_delete_dashboard_data_source"
  ON public.dashboard_data_source FOR DELETE TO authenticated
  USING (id IS TRUE AND auth.uid() IS NOT NULL);

-- categoria — escrita com auth.uid()
DROP POLICY IF EXISTS "authenticated_write_categoria"  ON public.categoria;
DROP POLICY IF EXISTS "authenticated_insert_categoria" ON public.categoria;
DROP POLICY IF EXISTS "authenticated_update_categoria" ON public.categoria;
DROP POLICY IF EXISTS "authenticated_delete_categoria" ON public.categoria;

CREATE POLICY "authenticated_insert_categoria"
  ON public.categoria FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_update_categoria"
  ON public.categoria FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_delete_categoria"
  ON public.categoria FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- historical_rows — anon leitura; mutações com JWT
DROP POLICY IF EXISTS "anon_full_historical_rows"  ON public.historical_rows;
DROP POLICY IF EXISTS "historical_rows_select"     ON public.historical_rows;
DROP POLICY IF EXISTS "historical_rows_insert"     ON public.historical_rows;
DROP POLICY IF EXISTS "historical_rows_update"     ON public.historical_rows;
DROP POLICY IF EXISTS "historical_rows_delete"     ON public.historical_rows;

CREATE POLICY "historical_rows_select"
  ON public.historical_rows FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "historical_rows_insert"
  ON public.historical_rows FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "historical_rows_update"
  ON public.historical_rows FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "historical_rows_delete"
  ON public.historical_rows FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- historical_metas
DROP POLICY IF EXISTS "anon_full_historical_metas"  ON public.historical_metas;
DROP POLICY IF EXISTS "historical_metas_select"     ON public.historical_metas;
DROP POLICY IF EXISTS "historical_metas_insert"     ON public.historical_metas;
DROP POLICY IF EXISTS "historical_metas_update"     ON public.historical_metas;
DROP POLICY IF EXISTS "historical_metas_delete"     ON public.historical_metas;

CREATE POLICY "historical_metas_select"
  ON public.historical_metas FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "historical_metas_insert"
  ON public.historical_metas FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "historical_metas_update"
  ON public.historical_metas FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "historical_metas_delete"
  ON public.historical_metas FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- campaign_creatives
DROP POLICY IF EXISTS "anon_full_campaign_creatives"  ON public.campaign_creatives;
DROP POLICY IF EXISTS "campaign_creatives_select"     ON public.campaign_creatives;
DROP POLICY IF EXISTS "campaign_creatives_insert"     ON public.campaign_creatives;
DROP POLICY IF EXISTS "campaign_creatives_update"     ON public.campaign_creatives;
DROP POLICY IF EXISTS "campaign_creatives_delete"     ON public.campaign_creatives;

CREATE POLICY "campaign_creatives_select"
  ON public.campaign_creatives FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "campaign_creatives_insert"
  ON public.campaign_creatives FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "campaign_creatives_update"
  ON public.campaign_creatives FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "campaign_creatives_delete"
  ON public.campaign_creatives FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- Storage: remover listagem pública ampla (lint 0025)
DROP POLICY IF EXISTS "creatives_public_read" ON storage.objects;


-- ============================================================
-- 010 — historical_rows: coluna turma
-- ============================================================

ALTER TABLE public.historical_rows
  ADD COLUMN IF NOT EXISTS turma TEXT;


-- ============================================================
-- 011 — user_tags: tags customizadas por usuário/kind
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_tags (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind       TEXT        NOT NULL CHECK (kind IN ('lancamento','evento','perpetuo','instagram')),
  name       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, kind, name)
);

ALTER TABLE public.user_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_tags_select" ON public.user_tags
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_tags_insert" ON public.user_tags
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_tags_delete" ON public.user_tags
  FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, DELETE ON public.user_tags TO authenticated;


-- ============================================================
-- 012 — products: dados de produto por usuário (JSONB)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.products (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL CHECK (type IN ('pos','imersao')),
  data       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "products_select" ON public.products
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "products_insert" ON public.products
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "products_update" ON public.products
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "products_delete" ON public.products
  FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;


-- ============================================================
-- 013 — campaign_metrics: coluna leads
-- ============================================================

ALTER TABLE public.campaign_metrics
  ADD COLUMN IF NOT EXISTS leads NUMERIC NOT NULL DEFAULT 0;
