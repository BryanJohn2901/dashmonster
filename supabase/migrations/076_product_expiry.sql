-- ============================================================
-- 076_product_expiry.sql
-- Temporizador de produto por empresa: acesso ilimitado, teste de
-- 7/30 dias etc. product_expiry = { "pipe": "2026-08-01T00:00:00Z" }.
-- Produto sem chave = ilimitado. Vencido = tratado como não contratado
-- no app. Mesma trava da 071: SÓ super admin altera.
-- ============================================================

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS product_expiry jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Trigger da 071 estendido: products E product_expiry são só-super-admin.
CREATE OR REPLACE FUNCTION public.enforce_company_products_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF (NEW.products IS DISTINCT FROM OLD.products
      OR NEW.product_expiry IS DISTINCT FROM OLD.product_expiry)
     AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Apenas super admin pode alterar os produtos da empresa.';
  END IF;
  RETURN NEW;
END;
$$;

-- (o trigger trg_company_products_admin da 071 já aponta pra esta função)
