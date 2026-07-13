-- ─── 081: registro de auditoria (ações relevantes de usuários) ────────────────
-- Não é log de CADA clique — é log de AÇÕES com significado: navegação entre
-- páginas/pastas, exportação de dados, mudança de produtos contratados,
-- criar/editar/excluir. Volume moderado, pensado pra auditoria de verdade.
--
-- `action` é TEXT (não enum) de propósito: novos tipos de ação não devem
-- exigir migration. Valores usados hoje pelo código: 'page_view', 'export',
-- 'product_change', 'create', 'update', 'delete'.

CREATE TABLE IF NOT EXISTS public.audit_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID        REFERENCES public.companies(id) ON DELETE CASCADE, -- null = ação de plataforma (super admin fora do contexto de 1 empresa)
  user_id      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email   TEXT,       -- snapshot: sobrevive à exclusão do usuário
  action       TEXT        NOT NULL,
  entity_type  TEXT,       -- 'page' | 'folder' | 'product' | 'campaign' | 'lead' | 'deal' | ...
  entity_label TEXT,       -- texto legível: nome da página/pasta/produto/campanha
  details      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_company_created ON public.audit_log(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_created    ON public.audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action          ON public.audit_log(action);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Leitura: super admin vê tudo; owner/manager vê só a própria empresa (viewer não vê).
DROP POLICY IF EXISTS audit_log_select ON public.audit_log;
CREATE POLICY audit_log_select ON public.audit_log
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (company_id IS NOT NULL AND public.can_write_company(company_id))
  );

-- Escrita: qualquer usuário autenticado grava eventos SOBRE SI MESMO, de uma
-- empresa da qual é membro — ou super admin agindo sobre QUALQUER empresa
-- (ex.: mudar produtos contratados de uma empresa que não é a dele).
-- Sem policy de update/delete — registro é imutável (só insert/select).
DROP POLICY IF EXISTS audit_log_insert ON public.audit_log;
CREATE POLICY audit_log_insert ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (company_id IS NULL OR public.is_company_member(company_id) OR public.is_super_admin())
  );
