-- ============================================================
-- DashMonster — status da venda (reembolso/chargeback)
-- Execute no Supabase SQL Editor (após a 044). Idempotente.
--
-- Até aqui, uma venda reembolsada/contestada continuava contando como
-- receita pra sempre (events_log e campaign_metrics nunca eram corrigidos).
-- `status` guarda "paid" (default, toda venda nasce assim) | "refunded" |
-- "chargeback" — atualizado por handleReversal() em webhook/route.ts quando
-- chega myeduzz.invoice_refunded/invoice_chargeback (só formato moderno).
--
-- Escopo deliberadamente pequeno: só GUARDA o dado, não reverte nada na
-- Meta nem corrige campaign_metrics retroativamente — um relatório futuro
-- de receita líquida usa isso pra fazer `WHERE status = 'paid'` em vez de
-- somar tudo. Reversão de evento na Meta (Meta também tem uma forma de
-- marcar Purchase como reembolsado) fica pra quando/se for pedido.
-- ============================================================

ALTER TABLE public.events_log
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'paid';

CREATE INDEX IF NOT EXISTS idx_events_log_company_status
  ON public.events_log(company_id, status)
  WHERE status <> 'paid';
