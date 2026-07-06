-- ============================================================
-- DashMonster — itemização da venda em events_log (nome/valor/papel)
-- Execute no Supabase SQL Editor (após a 078). Idempotente.
--
-- Antes desta migration, uma Purchase com order bump só gravava o produto
-- ESCOLHIDO como principal (product_name/product_parent_id/product_item_id,
-- ver migration 078/pickMainItem) — o histórico do visitante não tinha como
-- mostrar o bump separadamente quando ele veio na MESMA fatura (sem virar
-- uma linha própria em events_log). `items` guarda o array completo
-- (main + bump) de `SaleEvent.items` só pra exibição — não afeta pixel,
-- catálogo nem CAPI (que continuam usando product_name/product_parent_id).
-- ============================================================

ALTER TABLE public.events_log
  ADD COLUMN IF NOT EXISTS items JSONB;
