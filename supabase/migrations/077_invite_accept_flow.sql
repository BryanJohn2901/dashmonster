-- ============================================================
-- 077_invite_accept_flow.sql
-- Convite deixa de ser silencioso: agora SEMPRE fica pendente em
-- company_invites até a pessoa aceitar explicitamente (tela /aceitar-convite).
-- Antes: quem já tinha conta entrava na hora; quem não tinha, entrava sozinho
-- ao se cadastrar (trigger materialize). Os dois casos removem a escolha da
-- pessoa — o pedido agora é que ela veja o convite e decida.
-- ============================================================

-- 1) Não materializa mais sozinho no signup — a aceitação é explícita.
DROP TRIGGER IF EXISTS trg_materialize_invites ON auth.users;

-- 2) invite_company_member: sempre cria/atualiza o convite pendente, nunca
--    insere direto em company_members (nem para quem já tem conta).
CREATE OR REPLACE FUNCTION public.invite_company_member(
  p_company_id UUID,
  p_email      TEXT,
  p_role       TEXT
)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_email TEXT := lower(trim(p_email));
BEGIN
  IF NOT (public.company_role(p_company_id) = 'owner' OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'Apenas o dono da empresa (ou super admin) pode convidar membros.';
  END IF;

  IF p_role NOT IN ('owner','manager','viewer') THEN
    RAISE EXCEPTION 'Papel inválido: %', p_role;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.company_members m
    JOIN auth.users u ON u.id = m.user_id
    WHERE m.company_id = p_company_id AND lower(u.email) = v_email
  ) THEN
    RAISE EXCEPTION 'Esta pessoa já é membro da empresa.';
  END IF;

  INSERT INTO public.company_invites (company_id, email, role, created_by)
  VALUES (p_company_id, v_email, p_role, auth.uid())
  ON CONFLICT (company_id, email) DO UPDATE SET role = EXCLUDED.role, created_at = now();

  RETURN 'invited';
END;
$$;

-- 3) Quem pode ver convites endereçados ao PRÓPRIO e-mail (pra tela de aceitar).
DROP POLICY IF EXISTS "company_invites_self_select" ON public.company_invites;
CREATE POLICY "company_invites_self_select" ON public.company_invites
  FOR SELECT TO authenticated
  USING (lower(email) = lower(coalesce(auth.jwt()->>'email', '')));

-- 4) Lista os convites pendentes do usuário logado, com o nome da empresa
--    (SECURITY DEFINER: a pessoa ainda não é membro, então não passaria pela
--    RLS normal de companies pra ler o nome).
CREATE OR REPLACE FUNCTION public.fetch_my_pending_invites()
RETURNS TABLE(id UUID, company_id UUID, company_name TEXT, role TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT i.id, i.company_id, c.name, i.role, i.created_at
  FROM public.company_invites i
  JOIN public.companies c ON c.id = i.company_id
  WHERE lower(i.email) = lower(coalesce(auth.jwt()->>'email', ''))
  ORDER BY i.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.fetch_my_pending_invites() TO authenticated;

-- 5) Aceitar: só o dono do e-mail do convite pode aceitar o PRÓPRIO convite.
CREATE OR REPLACE FUNCTION public.accept_company_invite(p_invite_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_invite public.company_invites%ROWTYPE;
  v_my_email TEXT := lower(coalesce(auth.jwt()->>'email', ''));
BEGIN
  SELECT * INTO v_invite FROM public.company_invites WHERE id = p_invite_id;
  IF v_invite IS NULL THEN
    RAISE EXCEPTION 'Convite não encontrado (talvez já tenha sido aceito ou revogado).';
  END IF;
  IF lower(v_invite.email) <> v_my_email THEN
    RAISE EXCEPTION 'Este convite não é para o seu e-mail.';
  END IF;

  INSERT INTO public.company_members (company_id, user_id, role, email)
  VALUES (v_invite.company_id, auth.uid(), v_invite.role, v_my_email)
  ON CONFLICT (company_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  DELETE FROM public.company_invites WHERE id = p_invite_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.accept_company_invite(UUID) TO authenticated;

-- 6) Recusar: só descarta o convite, checando a mesma dona do e-mail.
CREATE OR REPLACE FUNCTION public.decline_company_invite(p_invite_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_email TEXT;
  v_my_email TEXT := lower(coalesce(auth.jwt()->>'email', ''));
BEGIN
  SELECT lower(email) INTO v_email FROM public.company_invites WHERE id = p_invite_id;
  IF v_email IS NULL THEN RETURN; END IF;
  IF v_email <> v_my_email THEN
    RAISE EXCEPTION 'Este convite não é para o seu e-mail.';
  END IF;
  DELETE FROM public.company_invites WHERE id = p_invite_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.decline_company_invite(UUID) TO authenticated;
