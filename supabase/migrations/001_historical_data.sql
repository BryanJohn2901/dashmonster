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
CREATE POLICY "anon_full_historical_rows"  ON public.historical_rows
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

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
CREATE TRIGGER trg_hist_rows_updated_at
  BEFORE UPDATE ON public.historical_rows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
