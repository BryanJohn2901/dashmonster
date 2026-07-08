-- ============================================================
-- DashMonster — trigger de escopo de companies ignora super admin
-- Execute no Supabase SQL Editor (após a 079). Idempotente.
--
-- Bug real: super admin criando empresa pelo Painel Admin. A RLS
-- (026) deixa o UPDATE passar, mas o trigger check_companies_update_scope
-- (035/036/048) nunca aprendeu sobre is_super_admin(). Pior: pra quem
-- NÃO é membro da empresa, company_role() devolve NULL e o guard
-- `role <> 'manager'` não dispara (NULL não é TRUE) — o super admin
-- caía na whitelist de gestor de tráfego e levava
-- "Gestor de tráfego só pode editar as configurações de Tracking..."
-- ao salvar settings/filtros da empresa recém-criada.
-- ============================================================

CREATE OR REPLACE FUNCTION public.check_companies_update_scope()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  allowed_keys TEXT[] := ARRAY['meta_pixel_id', 'meta_capi_token', 'dominio_autorizado', 'meta_test_event_code', 'eduzz_unmapped_purchase_action'];
  role TEXT;
  old_j JSONB;
  new_j JSONB;
  key TEXT;
BEGIN
  IF public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  role := public.company_role(NEW.id);

  IF role = 'owner' THEN
    RETURN NEW;
  END IF;

  -- IS DISTINCT FROM: NULL (não-membro) também é rejeitado aqui,
  -- em vez de vazar pra whitelist abaixo.
  IF role IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Sem permissão pra editar esta empresa.';
  END IF;

  old_j := to_jsonb(OLD);
  new_j := to_jsonb(NEW);
  FOR key IN SELECT jsonb_object_keys(new_j) LOOP
    CONTINUE WHEN key = ANY(allowed_keys);
    IF old_j -> key IS DISTINCT FROM new_j -> key THEN
      RAISE EXCEPTION 'Gestor de tráfego só pode editar as configurações de Tracking (Pixel ID, Token CAPI, domínio autorizado, código de teste, política de venda sem produto mapeado).';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;
