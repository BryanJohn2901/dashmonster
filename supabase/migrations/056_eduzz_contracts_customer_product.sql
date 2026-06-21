-- ============================================================
-- DashMonster — guarda email do comprador + produto + janela de vigência na
-- ficha do contrato (eduzz_contracts), pra poder correlacionar de volta uma
-- venda recorrente "órfã".
--
-- Por que: confirmado com payload real que a Eduzz às vezes manda
-- myeduzz.invoice_paid com "contract": null mesmo pra produto recorrente cujo
-- contrato já existe há horas (bug de dados do lado da Eduzz, não falha de
-- ordem de entrega nem bug de parsing nosso). Sem recurrence_key, a venda é
-- sempre tratada como "venda nova" mesmo quando é renovação — dobra
-- conversão em campaign_metrics e manda renovação pra Meta como 1ª compra.
--
-- A correção (route.ts, findContractByCustomerAndProduct) tenta achar o
-- contrato certo por email+produto+janela de vigência, mas só aplica quando
-- isso resulta em EXATAMENTE 1 candidato — sem essas colunas não tem como
-- nem tentar.
--
-- Execute no Supabase SQL Editor. Idempotente.
-- ============================================================

ALTER TABLE public.eduzz_contracts
  ADD COLUMN IF NOT EXISTS customer_email TEXT,
  ADD COLUMN IF NOT EXISTS product_id TEXT,
  ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finishes_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_eduzz_contracts_customer_product
  ON public.eduzz_contracts(company_id, customer_email, product_id);
