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
CREATE TRIGGER trg_tracking_funnels_updated_at
BEFORE UPDATE ON public.tracking_funnels
FOR EACH ROW EXECUTE FUNCTION public.touch_tracking_funnels_updated_at();

CREATE INDEX IF NOT EXISTS idx_tracking_funnels_company
  ON public.tracking_funnels(company_id, created_at);

ALTER TABLE public.tracking_funnels ENABLE ROW LEVEL SECURITY;

-- Mesmo padrão de tracking_pixels (037) e eduzz_webhook_configs (041):
-- CRUD pra owner OU manager, leitura pra qualquer membro.
DROP POLICY IF EXISTS "tracking_funnels_select" ON public.tracking_funnels;
CREATE POLICY "tracking_funnels_select" ON public.tracking_funnels
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

DROP POLICY IF EXISTS "tracking_funnels_write" ON public.tracking_funnels;
CREATE POLICY "tracking_funnels_write" ON public.tracking_funnels
  FOR ALL TO authenticated
  USING (public.can_write_company(company_id))
  WITH CHECK (public.can_write_company(company_id));
