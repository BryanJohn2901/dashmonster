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

CREATE POLICY "anon_read_categoria" ON public.categoria
  FOR SELECT TO anon, authenticated USING (true);

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
