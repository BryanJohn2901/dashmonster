-- ============================================================
-- Analytics PTA — Add leads column to campaign_metrics
-- ============================================================

alter table public.campaign_metrics
  add column if not exists leads numeric not null default 0;
