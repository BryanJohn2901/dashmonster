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
