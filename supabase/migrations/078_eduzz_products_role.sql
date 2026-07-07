-- ============================================================
-- DashMonster — papel do produto (main/bump) no catálogo Eduzz
-- Execute no Supabase SQL Editor (após a 077). Idempotente.
--
-- Quando uma venda tem order bump, `data.items[]` do invoice_paid vem com
-- TODOS os produtos do checkout juntos, sem nenhuma flag por item dizendo
-- qual é o principal e qual é o bump (`orderBump.isMainSale` é da FATURA
-- inteira, não do item). `role` aqui deixa o usuário marcar isso 1x por
-- produto (mesmo padrão de `pixel_id`, migration 050) — o webhook usa essa
-- config pra escolher qual item vira o "produto principal" da venda
-- (pixel/content_name/campaign_name), com valor total pago da fatura,
-- independente de quantos itens vieram.
--
-- default 'main': produto nunca configurado (ou empresa sem order bump)
-- continua se comportando como sempre — só entra em jogo quando 2+ itens
-- da MESMA venda têm parentId's diferentes.
-- ============================================================

ALTER TABLE public.eduzz_products
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'main';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'eduzz_products_role_check'
  ) THEN
    ALTER TABLE public.eduzz_products
      ADD CONSTRAINT eduzz_products_role_check CHECK (role IN ('main', 'bump'));
  END IF;
END $$;
