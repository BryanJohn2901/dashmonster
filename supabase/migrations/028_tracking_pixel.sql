-- ============================================================
-- Tracking Pixel Server-Side (MVP)
-- Execute este SQL no Supabase SQL Editor (após a 027)
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
CREATE POLICY "events_log_service_role_write" ON public.events_log
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "events_log_member_select" ON public.events_log;
CREATE POLICY "events_log_member_select" ON public.events_log
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));
