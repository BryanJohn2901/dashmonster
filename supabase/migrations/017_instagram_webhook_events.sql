-- ─── instagram_webhook_events ─────────────────────────────────────────────────
-- Armazena todos os eventos recebidos pelo webhook em tempo real.
-- Útil para auditoria, reprocessamento e futuros alertas.

CREATE TABLE IF NOT EXISTS public.instagram_webhook_events (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ig_account_id  TEXT        NOT NULL,   -- Instagram Business Account ID (da Meta)
  field          TEXT        NOT NULL,   -- ex: "comments", "follows", "story_insights"
  payload        JSONB       NOT NULL DEFAULT '{}',
  received_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at   TIMESTAMPTZ,            -- preenchido após reprocessamento manual
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ig_webhook_events_account
  ON public.instagram_webhook_events(ig_account_id);

CREATE INDEX IF NOT EXISTS idx_ig_webhook_events_field
  ON public.instagram_webhook_events(field);

CREATE INDEX IF NOT EXISTS idx_ig_webhook_events_received
  ON public.instagram_webhook_events(received_at DESC);

-- RLS: somente service_role pode ler/escrever (webhook roda server-side)
ALTER TABLE public.instagram_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only" ON public.instagram_webhook_events
  USING (auth.role() = 'service_role');
