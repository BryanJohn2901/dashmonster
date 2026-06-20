-- ============================================================
-- DashMonster — guarda TODAS as parcelas de boleto parcelado (não só a 1ª),
-- pra dashboard futuro de progresso de pagamento/inadimplência.
--
-- `installment_number` = qual parcela esse registro representa (1, 2, 3...).
-- A parcela 1 continua sendo a linha "Purchase" de sempre (com o valor CHEIO
-- da venda); parcelas seguintes ganham uma linha própria, event_name=
-- "Installment", com o valor só DAQUELA parcela (não o total) — ligadas à
-- venda principal via `main_sale_transaction_id` (mesma coluna já usada pra
-- ligar order bump à venda principal, migration 046).
--
-- Execute no Supabase SQL Editor. Idempotente.
-- ============================================================

ALTER TABLE public.events_log
  ADD COLUMN IF NOT EXISTS installment_number INTEGER;
