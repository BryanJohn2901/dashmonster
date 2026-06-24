-- Remove Purchase de assinatura (recurrence_key IS NOT NULL) onde o
-- contract_created nunca foi confirmado (eduzz_contracts.created_received != true).
-- Inclui dados antigos (antes da migration 064, onde o flag não era rastreado)
-- e novos que por algum motivo não têm ficha com created_received = true.
-- Linhas sale_confirmed = false (pendentes aguardando contract_created) são
-- preservadas — o fluxo normal (confirmPendingSubscription / pg_cron) cuida delas.
DELETE FROM public.events_log el
WHERE el.event_name = 'Purchase'
  AND el.recurrence_key IS NOT NULL
  AND el.sale_confirmed IS DISTINCT FROM false
  AND NOT EXISTS (
    SELECT 1 FROM public.eduzz_contracts ec
    WHERE ec.company_id = el.company_id
      AND ec.contract_id = el.recurrence_key
      AND ec.created_received = true
  );
