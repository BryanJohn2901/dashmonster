-- ============================================================
-- DashMonster — catálogo Eduzz (produto + ofertas), pixel por produto
-- Execute no Supabase SQL Editor (após a 049). Idempotente.
--
-- Substitui `eduzz_product_pixel_map` (048/049, nunca chegou a ir pra
-- produção) por um desenho mais correto pro modelo real da Eduzz: você cria
-- 1 PRODUTO (curso) e dentro dele N OFERTAS (preço/parcelamento diferentes,
-- cada uma com seu próprio `productId`). `parentId` é o produto, estável
-- entre todas as ofertas — confirmado com dado real: 2 vendas da mesma
-- empresa, mesmo `parentId` (ex.: 2915528, um produto/curso), `productId`
-- diferente em cada (3030076 e 2944992, ofertas/parcelamentos distintos).
--
-- `eduzz_products` — 1 linha por produto (parentId). `pixel_id` aqui é a
-- ÚNICA forma de vincular venda a pixel agora (decisão confirmada com o
-- usuário: vínculo é por PRODUTO, nunca por oferta — todas as ofertas do
-- mesmo curso herdam o mesmo pixel automaticamente). NULL = produto já visto
-- em venda, mas sem pixel escolhido ainda.
--
-- `eduzz_product_offers` — 1 linha por oferta (productId), só leitura pro
-- usuário (nunca editável na UI) — existe só pra reports futuros saberem
-- quais ofertas pertencem a qual produto. 100% auto-preenchido pelo webhook
-- a cada venda (`recordSale()`), nunca via cadastro manual.
--
-- As 2 tabelas são preenchidas automaticamente: a 1ª venda de um produto
-- novo já cria a linha em `eduzz_products` (nome provisório = título da
-- oferta, editável depois) — não precisa de nenhum cadastro manual prévio
-- pra o produto aparecer na tela de configuração.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.eduzz_products (
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  parent_id   TEXT NOT NULL,
  name        TEXT NOT NULL,
  pixel_id    UUID REFERENCES public.tracking_pixels(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, parent_id)
);

CREATE TABLE IF NOT EXISTS public.eduzz_product_offers (
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  parent_id   TEXT NOT NULL,
  product_id  TEXT NOT NULL,
  name        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, product_id),
  FOREIGN KEY (company_id, parent_id) REFERENCES public.eduzz_products(company_id, parent_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_eduzz_product_offers_parent ON public.eduzz_product_offers(company_id, parent_id);

ALTER TABLE public.eduzz_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eduzz_product_offers ENABLE ROW LEVEL SECURITY;

-- Mesmo padrão de tracking_pixels (037)/eduzz_webhook_configs (041): sem
-- dado sensível, CRUD completo pra owner OU manager. service_role (webhook,
-- sem sessão de usuário) precisa de policy própria pra poder fazer o upsert
-- automático a cada venda — sem isso, o INSERT do webhook seria bloqueado
-- pela RLS (a service_role normalmente ignora RLS, mas é mais seguro deixar
-- explícito já que outras tabelas desta feature usam esse mesmo padrão).
DROP POLICY IF EXISTS "eduzz_products_select" ON public.eduzz_products;
CREATE POLICY "eduzz_products_select" ON public.eduzz_products
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

DROP POLICY IF EXISTS "eduzz_products_write" ON public.eduzz_products;
CREATE POLICY "eduzz_products_write" ON public.eduzz_products
  FOR ALL TO authenticated
  USING (public.can_write_company(company_id))
  WITH CHECK (public.can_write_company(company_id));

DROP POLICY IF EXISTS "eduzz_product_offers_select" ON public.eduzz_product_offers;
CREATE POLICY "eduzz_product_offers_select" ON public.eduzz_product_offers
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

-- Sem policy de escrita pra authenticated: ofertas só são gravadas pelo
-- webhook (service_role, ignora RLS) — nunca editadas manualmente na UI.

-- Backfill defensivo: como as migrations rodam em ordem, eduzz_product_pixel_map
-- (criada na 048, coluna renomeada na 049) ainda existe neste ponto — se
-- alguém cadastrou algo nela antes desta migration substituir o desenho,
-- migra pra eduzz_products em vez de simplesmente descartar.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'eduzz_product_pixel_map') THEN
    INSERT INTO public.eduzz_products (company_id, parent_id, name, pixel_id)
    SELECT company_id, eduzz_product_key, COALESCE(product_label, eduzz_product_key), pixel_id
    FROM public.eduzz_product_pixel_map
    ON CONFLICT (company_id, parent_id) DO NOTHING;
  END IF;
END $$;

DROP TABLE IF EXISTS public.eduzz_product_pixel_map;
