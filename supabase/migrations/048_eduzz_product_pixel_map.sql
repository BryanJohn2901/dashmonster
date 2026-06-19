-- ============================================================
-- DashMonster — mapeamento opcional "produto Eduzz → pixel"
-- Execute no Supabase SQL Editor (após a 047). Idempotente.
--
-- Problema: o webhook da Eduzz recebe TODA venda da conta, sem filtro por
-- produto. Quando a venda não tem visita correlacionada (comum — comprador
-- foi direto pro checkout), o pixel escolhido hoje é sempre o "padrão" da
-- empresa, mesmo que o produto vendido pertença a outro funil/campanha —
-- contamina a otimização daquele pixel com conversão de tráfego que nunca
-- viu o anúncio.
--
-- Solução, em 3 camadas (ver eduzz/webhook/route.ts), TODAS opt-in — sem
-- nenhuma linha cadastrada aqui, o comportamento de hoje continua 100%
-- igual:
--   1. Mapeamento explícito (esta tabela) — só existe se o usuário cadastrar.
--   2. Visita correlacionada (já existia).
--   3. Política da empresa pra venda "sem produto mapeado e sem visita"
--      (coluna nova em `companies`, default = comportamento de hoje).
--
-- `eduzz_parent_id` é `data.items[].parentId` do webhook moderno — o "curso
-- pai", estável entre variantes de oferta/parcelamento do mesmo produto
-- (`productId` muda por checkout, `parentId` não — confirmado na doc oficial
-- da Eduzz e nos exemplos reais de payload analisados).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.eduzz_product_pixel_map (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  eduzz_parent_id TEXT NOT NULL,
  pixel_id        UUID NOT NULL REFERENCES public.tracking_pixels(id) ON DELETE CASCADE,
  -- Cache só pra exibir na UI sem precisar reprocessar events_log a cada
  -- render — sempre sobrescrito pelo nome mais recente visto naquele produto.
  product_label   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, eduzz_parent_id)
);

CREATE INDEX IF NOT EXISTS idx_eduzz_product_pixel_map_company ON public.eduzz_product_pixel_map(company_id);

ALTER TABLE public.eduzz_product_pixel_map ENABLE ROW LEVEL SECURITY;

-- Mesmo padrão de tracking_pixels (037): sem dado sensível, CRUD completo
-- pra owner OU manager, sem trigger de whitelist por coluna.
DROP POLICY IF EXISTS "eduzz_product_pixel_map_select" ON public.eduzz_product_pixel_map;
CREATE POLICY "eduzz_product_pixel_map_select" ON public.eduzz_product_pixel_map
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

DROP POLICY IF EXISTS "eduzz_product_pixel_map_write" ON public.eduzz_product_pixel_map;
CREATE POLICY "eduzz_product_pixel_map_write" ON public.eduzz_product_pixel_map
  FOR ALL TO authenticated
  USING (public.can_write_company(company_id))
  WITH CHECK (public.can_write_company(company_id));

-- Política da empresa pra venda sem produto mapeado E sem visita
-- correlacionada — 'default_pixel' (comportamento de sempre, mantém quem
-- nunca configurou nada 100% inalterado) ou 'skip' (não manda pra Meta,
-- só guarda no nosso events_log pra relatório).
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS eduzz_unmapped_purchase_action TEXT NOT NULL DEFAULT 'default_pixel';

-- `check_companies_update_scope` (migrations 035/036) é whitelist, não
-- blacklist — sem adicionar a coluna nova aqui, um gestor de tráfego (não
-- owner) que mudar essa política tem o UPDATE silenciosamente rejeitado
-- pelo trigger (mesmo bug real já documentado nas migrations anteriores).
CREATE OR REPLACE FUNCTION public.check_companies_update_scope()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  allowed_keys TEXT[] := ARRAY['meta_pixel_id', 'meta_capi_token', 'dominio_autorizado', 'meta_test_event_code', 'eduzz_unmapped_purchase_action'];
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
      RAISE EXCEPTION 'Gestor de tráfego só pode editar as configurações de Tracking (Pixel ID, Token CAPI, domínio autorizado, código de teste, política de venda sem produto mapeado).';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- parentId do item principal da venda — só formato moderno manda; guardado
-- pra alimentar a lista de "produtos detectados" na tela de configuração
-- (sem isso a UI não tem como saber quais parentId já apareceram).
ALTER TABLE public.events_log
  ADD COLUMN IF NOT EXISTS product_parent_id TEXT;

CREATE INDEX IF NOT EXISTS idx_events_log_product_parent_id ON public.events_log(company_id, product_parent_id) WHERE product_parent_id IS NOT NULL;
