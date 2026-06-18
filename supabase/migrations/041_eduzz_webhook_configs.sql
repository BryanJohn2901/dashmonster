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
CREATE POLICY "eduzz_webhook_configs_select" ON public.eduzz_webhook_configs
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

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
