-- ============================================================
-- DashMonster — sub-abas do Histórico personalizadas por empresa
-- Execute no Supabase SQL Editor (após a 026).
--
-- As sub-abas do Histórico deixam de ser fixas (lancamento/evento/
-- perpetuo/instagram). Cada empresa pode criar sub-abas próprias, cujo
-- id vira o `kind` da linha. O CHECK antigo travava esses valores novos.
-- Relaxa para qualquer texto curto não-vazio.
-- Idempotente.
-- ============================================================

ALTER TABLE public.historical_rows
  DROP CONSTRAINT IF EXISTS historical_rows_kind_check;

-- Mantém uma sanidade mínima (não-vazio, tamanho razoável) sem fixar valores.
ALTER TABLE public.historical_rows
  DROP CONSTRAINT IF EXISTS historical_rows_kind_nonempty;
ALTER TABLE public.historical_rows
  ADD CONSTRAINT historical_rows_kind_nonempty
  CHECK (char_length(kind) BETWEEN 1 AND 64);
