-- ============================================================
-- DashMonster — detecta renovação de assinatura (não reprocessa)
-- Execute no Supabase SQL Editor (após a 041). Idempotente.
--
-- Pedido: só contar a venda 1x (valor cheio do produto), sem receber um
-- evento novo a cada renovação mensal de assinatura nem a cada parcela
-- de boleto parcelado. `recurrence_key` guarda o id da assinatura/contrato
-- (ex.: data.contract.id da Eduzz) — repete em toda renovação da mesma
-- assinatura. shouldSkipRecurring() em eduzz/webhook/route.ts ignora a
-- notificação se já existir uma linha com esse mesmo recurrence_key.
--
-- Campo genérico (não fala de Eduzz especificamente) — outras plataformas
-- de pagamento (Hotmart, Kiwify...) reaproveitam a mesma coluna mapeando
-- seu próprio id de assinatura pra SaleEvent.recurrenceKey no parser delas.
-- ============================================================

ALTER TABLE public.events_log
  ADD COLUMN IF NOT EXISTS recurrence_key TEXT;

CREATE INDEX IF NOT EXISTS idx_events_log_company_recurrence
  ON public.events_log(company_id, recurrence_key)
  WHERE recurrence_key IS NOT NULL;
