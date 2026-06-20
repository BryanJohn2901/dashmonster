-- ============================================================
-- DashMonster — guarda o valor DESSA parcela/cobrança especificamente,
-- separado do valor cheio da venda/contrato.
--
-- `value` (já existente) virou "valor TOTAL" pra Purchase de venda parcelada
-- (boleto multiplicado, ou assinatura/PSL com a ficha do contrato) — então
-- ficou sem nenhuma coluna mostrando quanto foi pago NESSA cobrança
-- especificamente. `installment_value` resolve isso, preenchido nos 3 tipos
-- de linha (Purchase, Renewal, Installment) com o valor real daquela
-- notificação — pra Renewal/Installment já é igual a `value` (nunca
-- multiplicam nada); pra Purchase de venda parcelada, é DIFERENTE de `value`
-- (ex.: value=900 valor cheio, installment_value=300 só dessa 1ª parcela).
--
-- Execute no Supabase SQL Editor. Idempotente.
-- ============================================================

ALTER TABLE public.events_log
  ADD COLUMN IF NOT EXISTS installment_value NUMERIC;
