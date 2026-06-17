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
CREATE POLICY "leads_company_select" ON public.leads
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

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
