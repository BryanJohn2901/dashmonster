-- ============================================================
-- GSAStúdio Hub — companies: soft delete + trava de DELETE físico
-- Execute no Supabase SQL Editor (após a 081). Idempotente.
--
-- POR QUE ISTO EXISTE (incidente real, 14/07/2026):
-- uma empresa foi excluída e levou junto, em cascata e sem aviso, TODO
-- o dado dela. A migration 021 pôs `ON DELETE CASCADE` em 13 tabelas
-- (user_categories, user_account_entries, campaign_metrics,
-- historical_rows, historical_metas, products, user_tags,
-- instagram_accounts, instagram_groups, campaign_creatives,
-- user_manual_overrides, advertiser_profiles) e outras vieram depois
-- (events_log, crm_leads, eduzz_*, tracking_pixels). No plano Free do
-- Supabase não há backup nem PITR: o dado não volta. Um clique = perda
-- definitiva de anos de histórico.
--
-- DUAS CAMADAS:
--   1) `deleted_at` — excluir passa a ser UPDATE, não DELETE. A cascata
--      nunca dispara e dá pra restaurar.
--   2) Trigger BEFORE DELETE — bloqueia DELETE físico direto. A trava
--      fica no BANCO de propósito: o app antigo (dashmonster) e o painel
--      do Supabase apontam pro mesmo banco e continuariam apagando em
--      cascata. Proteção no app só cobriria um dos caminhos.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Coluna de exclusão lógica
-- ------------------------------------------------------------
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.companies.deleted_at IS
  'Exclusão lógica. NULL = ativa. Preenchido = na lixeira (some das listas, restaurável). Nunca use DELETE nesta tabela: a cascata apaga 13+ tabelas e não há backup no plano Free.';

-- Lista de ativas é o caminho quente de quase toda query.
CREATE INDEX IF NOT EXISTS idx_companies_active
  ON public.companies(id) WHERE deleted_at IS NULL;

-- ------------------------------------------------------------
-- 2) Trava de DELETE físico
--    Escape hatch consciente, por sessão:
--      SET LOCAL app.allow_company_purge = 'on';
--    Assim um purge de verdade continua possível, mas nunca por acidente
--    e nunca vindo do app.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.block_company_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF coalesce(current_setting('app.allow_company_purge', true), '') = 'on' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION
    'DELETE bloqueado em companies (empresa "%"). Isto apagaria em cascata campanhas, histórico, produtos, leads, tracking e Eduzz — sem backup no plano Free. Use exclusão lógica: UPDATE companies SET deleted_at = now() WHERE id = %. Purge real (irreversível): SET LOCAL app.allow_company_purge = ''on''; antes do DELETE.',
    OLD.name, OLD.id
    USING ERRCODE = 'raise_exception';
END;
$$;

DROP TRIGGER IF EXISTS trg_block_company_hard_delete ON public.companies;
CREATE TRIGGER trg_block_company_hard_delete
  BEFORE DELETE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.block_company_hard_delete();

-- ------------------------------------------------------------
-- 3) Quem pode mandar pra lixeira / restaurar
--    O trigger de escopo (080) já libera geral pra super admin e owner,
--    e barra o resto. `deleted_at` NÃO entra na whitelist do gestor de
--    tráfego — ele segue só com os campos de Tracking.
-- ------------------------------------------------------------
