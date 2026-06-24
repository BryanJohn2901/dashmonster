-- Remove todas as linhas "Renewal" (cobranças recorrentes de assinatura após a
-- 1ª cobrança) que foram gravadas antes da decisão de 2026-06-23 de descartá-las
-- no webhook. Só linhas com recurrence_key não-nulo são assinatura confirmada;
-- sem recurrence_key (não tem info) são mantidas.
DELETE FROM public.events_log
WHERE event_name = 'Renewal'
  AND recurrence_key IS NOT NULL;
