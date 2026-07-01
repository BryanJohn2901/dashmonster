-- ============================================================
-- 071_company_products.sql
-- Entitlement de produto por empresa (Monster Hub: DashMonster, PipeFlow…).
-- Quem tem qual produto é decidido pelo SUPER ADMIN, não pelo dono.
-- ============================================================

-- 1) Coluna de produtos contratados (default: só o DashMonster)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS products text[] NOT NULL DEFAULT '{dash}';

-- 2) Backfill defensivo (o default já cobre linhas novas)
UPDATE public.companies SET products = '{dash}'
  WHERE products IS NULL OR array_length(products, 1) IS NULL;

-- 3) Trava de escrita: RLS não restringe por coluna, então um trigger garante
--    que SÓ super admin altera `products`. O dono edita o resto da empresa
--    normalmente (nome, settings, token), mas não consegue se auto-liberar.
CREATE OR REPLACE FUNCTION public.enforce_company_products_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.products IS DISTINCT FROM OLD.products AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Apenas super admin pode alterar os produtos da empresa.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_company_products_admin ON public.companies;
CREATE TRIGGER trg_company_products_admin
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_company_products_admin();
