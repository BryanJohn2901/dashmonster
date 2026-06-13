-- ============================================================
-- Analytics PTA — Convite de membros por e-mail
-- Execute este SQL no Supabase SQL Editor (após a 024)
--
-- 1) company_invites: convites pendentes (pessoa ainda sem conta)
-- 2) RPC invite_company_member: owner convida por e-mail
--    - se a pessoa já tem conta → vira membro na hora
--    - se não → fica como convite pendente
-- 3) trigger no signup: ao criar conta, materializa convites pendentes
-- ============================================================

-- ------------------------------------------------------------
-- 1) Convites pendentes
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 2) RPC: convidar membro por e-mail (owner-only)
--    retorna 'added' (virou membro) ou 'invited' (pendente)
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
  -- só o dono da empresa pode convidar
  IF public.company_role(p_company_id) <> 'owner' THEN
    RAISE EXCEPTION 'Apenas o dono da empresa pode convidar membros.';
  END IF;

  IF p_role NOT IN ('owner','manager','viewer') THEN
    RAISE EXCEPTION 'Papel inválido: %', p_role;
  END IF;

  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = v_email LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    INSERT INTO public.company_members (company_id, user_id, role, email)
    VALUES (p_company_id, v_user_id, p_role, v_email)
    ON CONFLICT (company_id, user_id) DO UPDATE SET role = EXCLUDED.role;
    -- limpa convite pendente, se houver
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

-- ------------------------------------------------------------
-- 3) Ao criar conta, materializa os convites pendentes daquele e-mail
-- ------------------------------------------------------------
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
