-- ============================================================
-- GSAStúdio Hub — Correções multi-tenant
-- Execute este SQL no Supabase SQL Editor (após a 023)
--
-- 1) unique de campaign_metrics passa a incluir company_id:
--    sem isso, duas empresas com campanha de mesmo nome no mesmo
--    dia colidem no upsert (RLS bloquearia o update da outra)
-- 2) company_members.email: visível na tela de configuração da
--    empresa (auth.users não é acessível pelo client)
-- ============================================================

-- ------------------------------------------------------------
-- 1) Unique por empresa
-- ------------------------------------------------------------
ALTER TABLE public.campaign_metrics
  DROP CONSTRAINT IF EXISTS campaign_metrics_date_campaign_source_key;

-- remove duplicatas que violariam o novo unique (mantém a mais recente)
DELETE FROM public.campaign_metrics
WHERE id NOT IN (
  SELECT DISTINCT ON (company_id, date, campaign_name, source) id
  FROM public.campaign_metrics
  ORDER BY company_id, date, campaign_name, source, created_at DESC
);

ALTER TABLE public.campaign_metrics
  ADD CONSTRAINT campaign_metrics_company_date_campaign_source_key
  UNIQUE (company_id, date, campaign_name, source);

-- ------------------------------------------------------------
-- 2) E-mail dos membros (para a tela Empresa)
-- ------------------------------------------------------------
ALTER TABLE public.company_members
  ADD COLUMN IF NOT EXISTS email TEXT;

UPDATE public.company_members m
SET    email = u.email
FROM   auth.users u
WHERE  u.id = m.user_id
  AND  (m.email IS NULL OR m.email = '');

-- mantém o e-mail preenchido para novos membros
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
