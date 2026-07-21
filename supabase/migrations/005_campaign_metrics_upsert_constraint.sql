-- ============================================================
-- GSAStúdio Hub — Unique constraint para upsert diário do Meta
-- Execute no Supabase SQL Editor antes de usar o auto-sync
-- ============================================================

-- Remove duplicatas mantendo a linha mais recente por (date, campaign_name, source)
DELETE FROM public.campaign_metrics
WHERE id NOT IN (
  SELECT DISTINCT ON (date, campaign_name, source) id
  FROM public.campaign_metrics
  ORDER BY date, campaign_name, source, created_at DESC
);

-- Adiciona constraint única para habilitar upsert eficiente.
-- Postgres não aceita ADD CONSTRAINT IF NOT EXISTS — bloco DO idempotente.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'campaign_metrics_date_campaign_source_key'
      AND conrelid = 'public.campaign_metrics'::regclass
  ) THEN
    ALTER TABLE public.campaign_metrics
      ADD CONSTRAINT campaign_metrics_date_campaign_source_key
      UNIQUE (date, campaign_name, source);
  END IF;
END $$;
