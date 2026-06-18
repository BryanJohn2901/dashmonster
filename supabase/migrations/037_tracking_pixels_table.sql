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
CREATE POLICY "tracking_pixels_select" ON public.tracking_pixels
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

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
