-- ============================================================
-- Analytics PTA — Super Admin (acesso DEV a todas as empresas)
-- Execute este SQL no Supabase SQL Editor (após a 025)
--
-- O modo DEV do app é só client-side (a senha vive no bundle). Para
-- realmente enxergar empresas/tokens/usuários de TODAS as empresas, o
-- usuário precisa ser super admin AQUI no banco — o RLS é quem decide.
--
-- 1) app_admins: lista de super admins
-- 2) is_super_admin(): helper para as policies
-- 3) policies de super admin: ver/editar todas as empresas, membros,
--    convites e dados
-- 4) seed: o usuário admin inicial vira super admin
-- ============================================================

-- ------------------------------------------------------------
-- 1) Tabela de super admins
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_admins (
  user_id    UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_admins ENABLE ROW LEVEL SECURITY;

-- cada usuário só consegue checar a própria linha (saber se é admin)
DROP POLICY IF EXISTS "app_admins_self_select" ON public.app_admins;
CREATE POLICY "app_admins_self_select" ON public.app_admins
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ------------------------------------------------------------
-- 2) Helper (SECURITY DEFINER evita recursão de RLS)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.app_admins WHERE user_id = auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

-- ------------------------------------------------------------
-- 3) Policies de super admin (somam-se às existentes via OR)
-- ------------------------------------------------------------
-- companies: ver e editar todas
DROP POLICY IF EXISTS "companies_superadmin_all" ON public.companies;
CREATE POLICY "companies_superadmin_all" ON public.companies
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- company_members: ver e gerenciar membros de todas as empresas
DROP POLICY IF EXISTS "company_members_superadmin_all" ON public.company_members;
CREATE POLICY "company_members_superadmin_all" ON public.company_members
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- company_invites: idem
DROP POLICY IF EXISTS "company_invites_superadmin_all" ON public.company_invites;
CREATE POLICY "company_invites_superadmin_all" ON public.company_invites
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- dados das empresas: super admin lê/edita tudo (Setup, campanhas, etc.)
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'user_categories', 'user_account_entries', 'campaign_metrics',
    'historical_rows', 'historical_metas', 'products', 'user_tags',
    'instagram_accounts', 'instagram_groups', 'campaign_creatives',
    'user_manual_overrides', 'advertiser_profiles', 'campaign_center_entries'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_superadmin_all', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
         USING (public.is_super_admin()) WITH CHECK (public.is_super_admin())',
        t || '_superadmin_all', t);
    END IF;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 4) invite_company_member: super admin também pode convidar
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.invite_company_member(
  p_company_id UUID,
  p_email      TEXT,
  p_role       TEXT
)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_email   TEXT := lower(trim(p_email));
  v_user_id UUID;
BEGIN
  IF NOT (public.company_role(p_company_id) = 'owner' OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'Apenas o dono da empresa (ou super admin) pode convidar membros.';
  END IF;

  IF p_role NOT IN ('owner','manager','viewer') THEN
    RAISE EXCEPTION 'Papel inválido: %', p_role;
  END IF;

  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = v_email LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    INSERT INTO public.company_members (company_id, user_id, role, email)
    VALUES (p_company_id, v_user_id, p_role, v_email)
    ON CONFLICT (company_id, user_id) DO UPDATE SET role = EXCLUDED.role;
    DELETE FROM public.company_invites WHERE company_id = p_company_id AND lower(email) = v_email;
    RETURN 'added';
  ELSE
    INSERT INTO public.company_invites (company_id, email, role, created_by)
    VALUES (p_company_id, v_email, p_role, auth.uid())
    ON CONFLICT (company_id, email) DO UPDATE SET role = EXCLUDED.role;
    RETURN 'invited';
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- 5) Seed: usuário admin inicial vira super admin
-- ------------------------------------------------------------
INSERT INTO public.app_admins (user_id)
SELECT '11111111-1111-1111-1111-111111111111'
WHERE EXISTS (SELECT 1 FROM auth.users WHERE id = '11111111-1111-1111-1111-111111111111')
ON CONFLICT DO NOTHING;
