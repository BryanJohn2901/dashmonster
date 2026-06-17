-- ============================================================
-- DashMonster — adiciona company_id em user_tags (gap retroativo da 021)
-- Execute no Supabase SQL Editor (após a 031). Idempotente.
--
-- A 021 adiciona company_id + RLS por empresa numa lista de tabelas,
-- mas só se a tabela já existir naquele momento (checa
-- information_schema.tables). Como user_tags (migration 011) nunca
-- tinha rodado neste projeto até agora, a 021 pulou ela silenciosamente
-- — sem company_id, sem RLS por empresa, só as policies antigas
-- por usuário da 011. addUserTag() tenta inserir company_id e falha
-- com "column does not exist". Esta migration replica manualmente o
-- que a 021 teria feito.
-- ============================================================

ALTER TABLE public.user_tags
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_user_tags_company_id ON public.user_tags(company_id);

-- Troca as policies antigas (só por usuário, da 011) pelas por empresa
-- (mesmo padrão das outras tabelas migradas na 021).
DROP POLICY IF EXISTS "user_tags_select" ON public.user_tags;
DROP POLICY IF EXISTS "user_tags_insert" ON public.user_tags;
DROP POLICY IF EXISTS "user_tags_delete" ON public.user_tags;
DROP POLICY IF EXISTS "user_tags_company_select" ON public.user_tags;
DROP POLICY IF EXISTS "user_tags_company_insert" ON public.user_tags;
DROP POLICY IF EXISTS "user_tags_company_update" ON public.user_tags;
DROP POLICY IF EXISTS "user_tags_company_delete" ON public.user_tags;

ALTER TABLE public.user_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_tags_company_select" ON public.user_tags
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

CREATE POLICY "user_tags_company_insert" ON public.user_tags
  FOR INSERT TO authenticated
  WITH CHECK (public.can_write_company(company_id));

CREATE POLICY "user_tags_company_update" ON public.user_tags
  FOR UPDATE TO authenticated
  USING (public.can_write_company(company_id))
  WITH CHECK (public.can_write_company(company_id));

CREATE POLICY "user_tags_company_delete" ON public.user_tags
  FOR DELETE TO authenticated
  USING (public.can_write_company(company_id));
