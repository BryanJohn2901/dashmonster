-- ============================================================
-- DashMonster — venda (Eduzz) como evento Purchase em events_log
-- Execute no Supabase SQL Editor (após a 039). Idempotente.
--
-- - value/currency/external_transaction_id/source/payment_method: dados de
--   uma venda, pra registrar Purchase em events_log igual aos outros eventos
--   (mesmo capi_status/capi_error, mesma timeline). `source` distingue se o
--   evento veio do pixel próprio ("pixel", default) ou de uma venda externa
--   ("eduzz", e no futuro outras plataformas). `external_transaction_id`
--   guarda o id da transação na plataforma de origem — usado tanto como
--   chave de idempotência (Eduzz reenvia notificação em retry) quanto como
--   event_id na Meta CAPI (a própria Meta recomenda usar o id do pedido como
--   event_id em eventos de Purchase).
-- - fbp/fbc: a Meta CAPI já recebia esses 2 cookies em todo evento do pixel
--   (track-event/route.ts) mas eles nunca ficavam salvos — só repassados pra
--   Meta e descartados. Persistir agora é o que permite, quando uma venda da
--   Eduzz é correlacionada a uma visita anterior (por email/telefone — ver
--   eduzz/webhook/route.ts), reaproveitar o fbp/fbc daquela visita na hora de
--   mandar o Purchase pra Meta, em vez de mandar um evento sem nenhum sinal
--   de clique.
-- ============================================================

ALTER TABLE public.events_log
  ADD COLUMN IF NOT EXISTS value                   NUMERIC,
  ADD COLUMN IF NOT EXISTS currency                TEXT,
  ADD COLUMN IF NOT EXISTS external_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS source                  TEXT NOT NULL DEFAULT 'pixel',
  ADD COLUMN IF NOT EXISTS payment_method           TEXT,
  ADD COLUMN IF NOT EXISTS fbp                      TEXT,
  ADD COLUMN IF NOT EXISTS fbc                      TEXT;

-- Idempotência: a mesma transação não pode virar 2 Purchase diferentes
-- (Eduzz reenvia notificação em retry de rede). NULL é permitido livremente
-- (eventos do pixel não têm transaction id) — só bloqueia duplicidade quando
-- o campo está preenchido.
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_log_company_transaction
  ON public.events_log(company_id, external_transaction_id)
  WHERE external_transaction_id IS NOT NULL;
