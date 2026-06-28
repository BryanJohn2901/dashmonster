-- ============================================================
-- DashMonster -- tracking_funnels: product_parent_ids
-- Execute após a 069. Idempotente.
--
-- Adiciona product_parent_ids TEXT[] para vincular funis pelo
-- parentId do produto Eduzz (eduzz_products.parent_id), em vez
-- de depender de match parcial por nome.
-- product_names continua para compatibilidade com funis antigos.
-- ============================================================

ALTER TABLE public.tracking_funnels
  ADD COLUMN IF NOT EXISTS product_parent_ids TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_tracking_funnels_product_parent_ids
  ON public.tracking_funnels USING GIN (product_parent_ids)
  WHERE cardinality(product_parent_ids) > 0;

-- Atualiza constraint: aceita product_parent_ids como matcher válido.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tracking_funnels_non_empty_matcher'
      AND conrelid = 'public.tracking_funnels'::regclass
  ) THEN
    ALTER TABLE public.tracking_funnels
      DROP CONSTRAINT tracking_funnels_non_empty_matcher;
  END IF;

  ALTER TABLE public.tracking_funnels
    ADD CONSTRAINT tracking_funnels_non_empty_matcher
    CHECK (
      cardinality(product_parent_ids) > 0
      OR cardinality(product_names) > 0
      OR cardinality(utm_campaigns) > 0
      OR cardinality(url_patterns) > 0
    ) NOT VALID;
END $$;
