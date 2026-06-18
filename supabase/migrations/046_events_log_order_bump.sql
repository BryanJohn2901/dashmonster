-- ============================================================
-- DashMonster — order bump da Eduzz como dados próprios em events_log
-- Execute no Supabase SQL Editor (após a 045). Idempotente.
--
-- Order bump (produto extra do checkout) chega como uma notificação
-- myeduzz.invoice_paid SEPARADA da venda principal — seu próprio
-- transaction.id, seu próprio price.value, mas marcada com
-- data.orderBump.has=true + data.orderBump.isMainSale=false, e
-- data.orderBump.mainSaleId referenciando o transaction.id da venda
-- principal (fonte: https://developers.eduzz.com/reference/webhook/myeduzz-invoice-paid).
-- Sem essas colunas, ela já era capturada como uma Purchase nova e
-- independente (receita certa), mas sem nenhum jeito de ligar de volta
-- com a venda principal pra um relatório futuro (ex.: taxa de aceitação
-- de order bump, receita incremental por produto de bump).
--
-- is_order_bump: true só nessa fatura do bump, false (default) em toda
-- venda normal/principal e em todo evento do pixel.
-- main_sale_transaction_id: events_log.external_transaction_id da venda
-- principal — null quando não é bump (ou no formato antigo, sem suporte).
-- ============================================================

ALTER TABLE public.events_log
  ADD COLUMN IF NOT EXISTS is_order_bump BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS main_sale_transaction_id TEXT;

CREATE INDEX IF NOT EXISTS idx_events_log_company_order_bump
  ON public.events_log(company_id, main_sale_transaction_id)
  WHERE is_order_bump = true;
