-- ============================================================
-- DashMonster — quantidade de parcelas da venda (exibição)
-- Execute no Supabase SQL Editor (após a 042). Idempotente.
--
-- `installments` guarda o total de parcelas (ex.: boleto em 3x) — só pra
-- exibição no dashboard junto do método de pagamento. A Eduzz só manda
-- isso pra boleto parcelado (data.bankSlipInstallment.totalInstallments);
-- parcelamento de cartão é decidido pela operadora do cartão, invisível
-- pra plataforma — fica NULL nesse caso (mostra só o método, sem "Nx").
-- ============================================================

ALTER TABLE public.events_log
  ADD COLUMN IF NOT EXISTS installments INTEGER;
