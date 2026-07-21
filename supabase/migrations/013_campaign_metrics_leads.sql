-- ============================================================
-- GSAStúdio Hub — Add leads column to campaign_metrics
-- Execute no Supabase SQL Editor (Dashboard > SQL Editor > New query)
-- Depois: no app, use "Atualizar Meta" ou Importar para re-sincronizar.
-- ============================================================

alter table public.campaign_metrics
  add column if not exists leads numeric not null default 0;
