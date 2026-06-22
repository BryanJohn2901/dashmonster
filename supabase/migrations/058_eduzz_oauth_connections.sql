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
CREATE POLICY "eduzz_oauth_connections_select" ON public.eduzz_oauth_connections
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

DROP POLICY IF EXISTS "eduzz_oauth_connections_write" ON public.eduzz_oauth_connections;
CREATE POLICY "eduzz_oauth_connections_write" ON public.eduzz_oauth_connections
  FOR ALL TO authenticated
  USING (public.can_write_company(company_id))
  WITH CHECK (public.can_write_company(company_id));
