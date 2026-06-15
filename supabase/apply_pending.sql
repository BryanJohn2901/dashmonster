-- ============================================================
-- DashMonster — aplicar pendências de uma vez (SQL Editor)
-- ============================================================
-- Cole TUDO isto no Supabase → SQL Editor → Run.
-- Reúne migrations 024 + 025 + 026 e registra o super admin.
-- 100% idempotente: pode rodar de novo sem quebrar.
--
-- Ajuste o e-mail no FINAL se o super admin não for este.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- 024 — Correções multi-tenant
-- ════════════════════════════════════════════════════════════

-- 1) Unique de campaign_metrics por empresa
ALTER TABLE public.campaign_metrics
  DROP CONSTRAINT IF EXISTS campaign_metrics_date_campaign_source_key;

DELETE FROM public.campaign_metrics
WHERE id NOT IN (
  SELECT DISTINCT ON (company_id, date, campaign_name, source) id
  FROM public.campaign_metrics
  ORDER BY company_id, date, campaign_name, source, created_at DESC
);

-- DROP antes do ADD torna re-rodável (o ADD original não tinha IF NOT EXISTS)
ALTER TABLE public.campaign_metrics
  DROP CONSTRAINT IF EXISTS campaign_metrics_company_date_campaign_source_key;
ALTER TABLE public.campaign_metrics
  ADD CONSTRAINT campaign_metrics_company_date_campaign_source_key
  UNIQUE (company_id, date, campaign_name, source);

-- 2) E-mail dos membros
ALTER TABLE public.company_members
  ADD COLUMN IF NOT EXISTS email TEXT;

UPDATE public.company_members m
SET    email = u.email
FROM   auth.users u
WHERE  u.id = m.user_id
  AND  (m.email IS NULL OR m.email = '');

CREATE OR REPLACE FUNCTION public.fill_company_member_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.email IS NULL OR NEW.email = '' THEN
    SELECT email INTO NEW.email FROM auth.users WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_company_member_email ON public.company_members;
CREATE TRIGGER trg_company_member_email
BEFORE INSERT OR UPDATE ON public.company_members
FOR EACH ROW EXECUTE FUNCTION public.fill_company_member_email();


-- ════════════════════════════════════════════════════════════
-- 025 — Convite de membros por e-mail
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.company_invites (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email      TEXT        NOT NULL,
  role       TEXT        NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner','manager','viewer')),
  created_by UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, email)
);

CREATE INDEX IF NOT EXISTS idx_company_invites_email ON public.company_invites(lower(email));

ALTER TABLE public.company_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_invites_owner_all" ON public.company_invites;
CREATE POLICY "company_invites_owner_all" ON public.company_invites
  FOR ALL TO authenticated
  USING (public.company_role(company_id) = 'owner')
  WITH CHECK (public.company_role(company_id) = 'owner');

CREATE OR REPLACE FUNCTION public.materialize_company_invites()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.company_members (company_id, user_id, role, email)
  SELECT i.company_id, NEW.id, i.role, lower(NEW.email)
  FROM   public.company_invites i
  WHERE  lower(i.email) = lower(NEW.email)
  ON CONFLICT (company_id, user_id) DO NOTHING;

  DELETE FROM public.company_invites WHERE lower(email) = lower(NEW.email);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_materialize_invites ON auth.users;
CREATE TRIGGER trg_materialize_invites
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.materialize_company_invites();


-- ════════════════════════════════════════════════════════════
-- 026 — Super admin (acesso a todas as empresas)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.app_admins (
  user_id    UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_admins_self_select" ON public.app_admins;
CREATE POLICY "app_admins_self_select" ON public.app_admins
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.app_admins WHERE user_id = auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

DROP POLICY IF EXISTS "companies_superadmin_all" ON public.companies;
CREATE POLICY "companies_superadmin_all" ON public.companies
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "company_members_superadmin_all" ON public.company_members;
CREATE POLICY "company_members_superadmin_all" ON public.company_members
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "company_invites_superadmin_all" ON public.company_invites;
CREATE POLICY "company_invites_superadmin_all" ON public.company_invites
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

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

-- RPC de convite: owner OU super admin
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

GRANT EXECUTE ON FUNCTION public.invite_company_member(UUID, TEXT, TEXT) TO authenticated;


-- ════════════════════════════════════════════════════════════
-- Super admin: registra SEU usuário (ajuste o e-mail se preciso)
-- ════════════════════════════════════════════════════════════
INSERT INTO public.app_admins (user_id)
SELECT id FROM auth.users
WHERE lower(email) = 'gabrielcarvalho@ptadigital.com.br'
ON CONFLICT DO NOTHING;


-- ════════════════════════════════════════════════════════════
-- Conferência (opcional — deve listar seu e-mail)
-- ════════════════════════════════════════════════════════════
SELECT u.email AS super_admin
FROM public.app_admins a
JOIN auth.users u ON u.id = a.user_id;
