-- ============================================================
-- DashMonster — "ficha do contrato" (assinatura/PSL), pra saber o valor
-- CHEIO de uma venda recorrente sem precisar adivinhar.
--
-- Por que precisa de tabela própria (não dá pra tirar isso só do invoice_paid):
-- o nº de parcelas de um contrato (`payment.totalOfInstallments`) e se ele
-- tem fim definido (`recurrence.isFinite`) só vêm nos webhooks
-- myeduzz.contract_created / myeduzz.contract_updated — NÃO vêm no
-- myeduzz.invoice_paid de cada cobrança mensal (confirmado na doc oficial,
-- 2026-06-19, depois de ter testado errado uma vez achando que vinha junto).
-- Por isso: contract_created/updated grava aqui, e cada invoice_paid de uma
-- assinatura consulta essa tabela pelo contract_id (= recurrence_key) pra
-- saber se/quanto multiplicar.
--
-- Execute no Supabase SQL Editor. Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.eduzz_contracts (
  company_id              UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contract_id              TEXT NOT NULL,
  -- data.contract.payment.totalOfInstallments — nº de parcelas contratadas.
  total_installments       INTEGER,
  -- data.contract.recurrence.isFinite — true = tem fim definido (PSL ou
  -- contrato com prazo fixo, dá pra multiplicar); false = assinatura aberta
  -- (cancela quando quiser, sem total fixo pra calcular).
  is_finite                BOOLEAN,
  -- data.contract.isUnlimitedInstallments — flag de modo PSL (nome confuso:
  -- é sobre o LIMITE DO CARTÃO do comprador, não sobre a duração do contrato).
  is_unlimited_installments BOOLEAN,
  -- data.contract.recurrence.price.value/currency — valor de cada cobrança.
  charge_value              NUMERIC,
  currency                  TEXT,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, contract_id)
);

ALTER TABLE public.eduzz_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "eduzz_contracts_service_role" ON public.eduzz_contracts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "eduzz_contracts_member_select" ON public.eduzz_contracts
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));
