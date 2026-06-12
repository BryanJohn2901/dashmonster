-- ============================================================
-- Analytics PTA — Multi-tenant: Empresas
-- Execute este SQL no Supabase SQL Editor
--
-- 1) companies + company_members (roles: owner/manager/viewer)
-- 2) helper functions para RLS sem recursão
-- 3) company_id em todas as tabelas de dados
-- 4) seed: empresa default + backfill de dados existentes
-- 5) campaign_center_entries (Central de Campanhas compartilhada)
-- ============================================================

-- ------------------------------------------------------------
-- 1) Empresas e membros
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.companies (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  slug       TEXT        NOT NULL UNIQUE,
  logo_url   TEXT,
  -- Pré-configuração do owner: filtros padrão, colunas do histórico, etc.
  settings   JSONB       NOT NULL DEFAULT '{}',
  created_by UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.company_members (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT        NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'manager', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_company_members_user_id    ON public.company_members(user_id);
CREATE INDEX IF NOT EXISTS idx_company_members_company_id ON public.company_members(company_id);

-- ------------------------------------------------------------
-- 2) Helpers RLS (SECURITY DEFINER evita recursão em company_members)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_company_member(cid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members
    WHERE company_id = cid AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.company_role(cid UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.company_members
  WHERE company_id = cid AND user_id = auth.uid()
  LIMIT 1;
$$;

-- Pode escrever dados da empresa? (owner ou manager)
CREATE OR REPLACE FUNCTION public.can_write_company(cid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(public.company_role(cid) IN ('owner', 'manager'), false);
$$;

-- ------------------------------------------------------------
-- 3) RLS de companies / company_members
-- ------------------------------------------------------------
ALTER TABLE public.companies       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "companies_member_select" ON public.companies;
CREATE POLICY "companies_member_select" ON public.companies
  FOR SELECT TO authenticated
  USING (public.is_company_member(id));

DROP POLICY IF EXISTS "companies_owner_update" ON public.companies;
CREATE POLICY "companies_owner_update" ON public.companies
  FOR UPDATE TO authenticated
  USING (public.company_role(id) = 'owner')
  WITH CHECK (public.company_role(id) = 'owner');

DROP POLICY IF EXISTS "company_members_select" ON public.company_members;
CREATE POLICY "company_members_select" ON public.company_members
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

DROP POLICY IF EXISTS "company_members_owner_all" ON public.company_members;
CREATE POLICY "company_members_owner_all" ON public.company_members
  FOR ALL TO authenticated
  USING (public.company_role(company_id) = 'owner')
  WITH CHECK (public.company_role(company_id) = 'owner');

-- ------------------------------------------------------------
-- 4) company_id nas tabelas de dados existentes
-- ------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'user_categories',
    'user_account_entries',
    'campaign_metrics',
    'historical_rows',
    'historical_metas',
    'products',
    'user_tags',
    'instagram_accounts',
    'instagram_groups',
    'campaign_creatives',
    'user_manual_overrides',
    'advertiser_profiles'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE', t);
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS idx_%s_company_id ON public.%I(company_id)', t, t);
    END IF;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 5) Seed: empresa default + membros + backfill
--    Empresa atual (educação) vira a primeira empresa.
--    Usuário admin = owner; demais usuários existentes = manager.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_company_id UUID;
  v_admin_id   UUID := '11111111-1111-1111-1111-111111111111';
  t TEXT;
  tables TEXT[] := ARRAY[
    'user_categories', 'user_account_entries', 'campaign_metrics',
    'historical_rows', 'historical_metas', 'products', 'user_tags',
    'instagram_accounts', 'instagram_groups', 'campaign_creatives',
    'user_manual_overrides', 'advertiser_profiles'
  ];
BEGIN
  INSERT INTO public.companies (name, slug, created_by)
  VALUES ('Empresa Principal', 'principal', v_admin_id)
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO v_company_id FROM public.companies WHERE slug = 'principal';

  -- admin = owner
  INSERT INTO public.company_members (company_id, user_id, role)
  SELECT v_company_id, v_admin_id, 'owner'
  WHERE EXISTS (SELECT 1 FROM auth.users WHERE id = v_admin_id)
  ON CONFLICT (company_id, user_id) DO NOTHING;

  -- demais usuários existentes = manager (ajuste roles depois se necessário)
  INSERT INTO public.company_members (company_id, user_id, role)
  SELECT v_company_id, u.id, 'manager'
  FROM auth.users u
  WHERE u.id <> v_admin_id
  ON CONFLICT (company_id, user_id) DO NOTHING;

  -- backfill: tudo que existe pertence à empresa default
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format(
        'UPDATE public.%I SET company_id = $1 WHERE company_id IS NULL', t)
      USING v_company_id;
    END IF;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 6) Novas policies por empresa (substituem as antigas por usuário
--    ou as permissivas "todos autenticados")
--    SELECT: qualquer membro | INSERT/UPDATE/DELETE: owner ou manager
-- ------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
  p RECORD;
  tables TEXT[] := ARRAY[
    'user_categories', 'user_account_entries', 'campaign_metrics',
    'historical_rows', 'historical_metas', 'products', 'user_tags',
    'instagram_accounts', 'instagram_groups', 'campaign_creatives',
    'user_manual_overrides', 'advertiser_profiles'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = t) THEN
      -- remove todas as policies antigas da tabela
      FOR p IN SELECT policyname FROM pg_policies
               WHERE schemaname = 'public' AND tablename = t LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
      END LOOP;

      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
         USING (public.is_company_member(company_id))',
        t || '_company_select', t);

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
         WITH CHECK (public.can_write_company(company_id))',
        t || '_company_insert', t);

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
         USING (public.can_write_company(company_id))
         WITH CHECK (public.can_write_company(company_id))',
        t || '_company_update', t);

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
         USING (public.can_write_company(company_id))',
        t || '_company_delete', t);
    END IF;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 6b) Categorias agora são da empresa: slug único por empresa
--     (antes era por usuário — cada usuário tinha sua cópia)
--     Dedup: mantém a categoria mais antiga de cada (company_id, slug),
--     re-aponta as entries das duplicadas antes de removê-las.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_moved     INT;
  v_deleted   INT;
  v_remaining INT;
BEGIN
  -- re-aponta entries das categorias duplicadas para a sobrevivente (mais antiga)
  UPDATE public.user_account_entries e
  SET    category_id = k.keep_id
  FROM   public.user_categories dup,
  LATERAL (
    SELECT id AS keep_id
    FROM   public.user_categories s
    WHERE  s.company_id IS NOT DISTINCT FROM dup.company_id
      AND  s.slug = dup.slug
    ORDER BY s.created_at, s.id
    LIMIT 1
  ) k
  WHERE  e.category_id = dup.id
    AND  dup.id <> k.keep_id;
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  -- remove as duplicadas (mantém rn = 1)
  DELETE FROM public.user_categories c
  USING (
    SELECT id,
           row_number() OVER (
             PARTITION BY company_id, slug
             ORDER BY created_at, id
           ) AS rn
    FROM public.user_categories
  ) r
  WHERE c.id = r.id AND r.rn > 1;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  SELECT count(*) INTO v_remaining FROM (
    SELECT 1 FROM public.user_categories
    GROUP BY company_id, slug HAVING count(*) > 1
  ) d;

  RAISE NOTICE 'dedup categorias: % entries re-apontadas, % categorias removidas, % duplicatas restantes',
    v_moved, v_deleted, v_remaining;

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'dedup não eliminou todas as duplicatas (%) — me mostre este erro', v_remaining;
  END IF;
END $$;

ALTER TABLE public.user_categories
  DROP CONSTRAINT IF EXISTS user_categories_user_id_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_categories_company_slug
  ON public.user_categories(company_id, slug);

-- ------------------------------------------------------------
-- 7) Central de Campanhas compartilhada (substitui localStorage)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campaign_center_entries (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  campaign_id      TEXT        NOT NULL,
  campaign_name    TEXT        NOT NULL,
  ad_account_id    TEXT        NOT NULL,
  ad_account_label TEXT        NOT NULL DEFAULT '',
  intent           TEXT        NOT NULL DEFAULT 'lead_gen'
    CHECK (intent IN ('lead_gen','direct_sale','profile_growth','traffic','awareness','remarketing')),
  result_type      TEXT,
  group_id         TEXT,
  monthly_budget   NUMERIC,
  goals            JSONB       NOT NULL DEFAULT '{}',
  enabled          BOOLEAN     NOT NULL DEFAULT true,
  -- true = auto-configurada na importação, ainda não revisada por humano
  auto_configured  BOOLEAN     NOT NULL DEFAULT true,
  created_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_center_entries_company_id
  ON public.campaign_center_entries(company_id);

ALTER TABLE public.campaign_center_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campaign_center_select" ON public.campaign_center_entries;
CREATE POLICY "campaign_center_select" ON public.campaign_center_entries
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

DROP POLICY IF EXISTS "campaign_center_write" ON public.campaign_center_entries;
CREATE POLICY "campaign_center_write" ON public.campaign_center_entries
  FOR ALL TO authenticated
  USING (public.can_write_company(company_id))
  WITH CHECK (public.can_write_company(company_id));

CREATE OR REPLACE FUNCTION public.set_updated_at_campaign_center()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_campaign_center_updated_at ON public.campaign_center_entries;
CREATE TRIGGER trg_campaign_center_updated_at
BEFORE UPDATE ON public.campaign_center_entries
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_campaign_center();
