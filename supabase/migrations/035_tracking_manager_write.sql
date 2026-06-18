-- ============================================================
-- DashMonster — Gestor de tráfego pode editar config de Tracking
-- Execute no Supabase SQL Editor (após a 034). Idempotente.
--
-- Antes, UPDATE em companies era owner-only (companies_owner_update).
-- Pedido: manager ("Gestor de tráfego") também editar Pixel ID/Token
-- CAPI/domínio autorizado, sem abrir o resto da empresa (nome, logo,
-- settings, meta_access_token da Conexão Meta) pra manager.
--
-- Solução: RLS passa a aceitar owner OU manager (can_write_company),
-- e um trigger BEFORE UPDATE faz a restrição fina — se quem está
-- editando é manager (não owner), só pode mudar as 3 colunas de
-- tracking; qualquer outra coluna alterada aborta a transação.
-- Whitelist (não blacklist) é proposital: colunas novas que vierem
-- de migrations futuras ficam owner-only por padrão, sem precisar
-- lembrar de atualizar este trigger toda vez.
-- ============================================================

CREATE OR REPLACE FUNCTION public.check_companies_update_scope()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  allowed_keys TEXT[] := ARRAY['meta_pixel_id', 'meta_capi_token', 'dominio_autorizado'];
  old_j JSONB;
  new_j JSONB;
  key TEXT;
BEGIN
  IF public.company_role(NEW.id) = 'owner' THEN
    RETURN NEW;
  END IF;

  IF public.company_role(NEW.id) <> 'manager' THEN
    RAISE EXCEPTION 'Sem permissão pra editar esta empresa.';
  END IF;

  old_j := to_jsonb(OLD);
  new_j := to_jsonb(NEW);
  FOR key IN SELECT jsonb_object_keys(new_j) LOOP
    CONTINUE WHEN key = ANY(allowed_keys);
    IF old_j -> key IS DISTINCT FROM new_j -> key THEN
      RAISE EXCEPTION 'Gestor de tráfego só pode editar as configurações de Tracking (Pixel ID, Token CAPI, domínio autorizado).';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_companies_update_scope ON public.companies;
CREATE TRIGGER trg_companies_update_scope
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.check_companies_update_scope();

DROP POLICY IF EXISTS "companies_owner_update" ON public.companies;
DROP POLICY IF EXISTS "companies_writer_update" ON public.companies;
CREATE POLICY "companies_writer_update" ON public.companies
  FOR UPDATE TO authenticated
  USING (public.can_write_company(id))
  WITH CHECK (public.can_write_company(id));
