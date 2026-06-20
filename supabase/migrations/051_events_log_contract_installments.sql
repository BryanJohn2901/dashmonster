-- ============================================================
-- DashMonster — guarda 2 campos do payload de invoice_paid que hoje o
-- webhook descartava sem salvar, só para investigação/relatório futuro.
-- NÃO muda nenhum comportamento de envio à Meta nem de cálculo de valor.
--
-- total_installments_raw = data.installments (campo RAIZ do payload,
-- "Número de parcelas" — a doc da Eduzz não detalha a relação dele com
-- bankSlipInstallment/PSL/cartão, captura pra comparar com dado real).
-- contract_unlimited_installments = data.contract.isUnlimitedInstallments
-- (flag de modo PSL — nome confuso: "sem limite" é do limite do CARTÃO
-- do comprador, não da duração do contrato).
--
-- Execute no Supabase SQL Editor. Idempotente.
-- ============================================================

ALTER TABLE public.events_log
  ADD COLUMN IF NOT EXISTS total_installments_raw INTEGER,
  ADD COLUMN IF NOT EXISTS contract_unlimited_installments BOOLEAN;
