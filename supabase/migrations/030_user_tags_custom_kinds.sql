-- ============================================================
-- DashMonster — relaxa CHECK de kind em user_tags
-- Execute no Supabase SQL Editor (após a 029). Idempotente.
--
-- A 027 relaxou historical_rows.kind pra suportar sub-abas custom do
-- Histórico, mas esqueceu user_tags.kind (mesmo CHECK antigo, só os 4
-- kinds fixos). Resultado: criar tag numa sub-aba personalizada falha
-- com violação de CHECK constraint, hoje engolida silenciosamente no
-- frontend (corrigido em HistoricalView.tsx na mesma leva).
-- ============================================================

ALTER TABLE public.user_tags
  DROP CONSTRAINT IF EXISTS user_tags_kind_check;

ALTER TABLE public.user_tags
  DROP CONSTRAINT IF EXISTS user_tags_kind_nonempty;
ALTER TABLE public.user_tags
  ADD CONSTRAINT user_tags_kind_nonempty
  CHECK (char_length(kind) BETWEEN 1 AND 64);
