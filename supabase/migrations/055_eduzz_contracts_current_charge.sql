-- ============================================================
-- DashMonster — guarda a cobrança ATUAL do contrato (data.contract.recurrence.
-- charges.current), não só o total.
--
-- Por que: até aqui só usávamos `current` de passagem dentro do backfill (pra
-- corrigir a linha mais recente já gravada). Mas se o invoice_paid da cobrança
-- N chega DEPOIS do contract_updated correspondente (ordem normal — Eduzz
-- manda os 2 quase juntos), recordSale/recordRenewal não tinham como saber
-- "essa cobrança é a 13ª" — só sabiam contar linhas já gravadas, o que
-- subestima quando alguma cobrança anterior nunca chegou como webhook
-- (confirmado em produção: contrato na cobrança 13/25, só 1 linha gravada no
-- banco, `installment_number` saía sempre 1). Persistindo `current_charge`
-- aqui, o valor fica disponível ANTES do invoice_paid, igual já fazemos com
-- `total_installments`.
--
-- Execute no Supabase SQL Editor. Idempotente.
-- ============================================================

ALTER TABLE public.eduzz_contracts
  ADD COLUMN IF NOT EXISTS current_charge INTEGER;
