-- ============================================================
-- Analytics PTA — Token Meta da Empresa
-- Execute este SQL no Supabase SQL Editor (após a 021)
--
-- Regra de ouro: o DONO da empresa configura o Access Token da
-- API Meta uma única vez e ele propaga para todos os membros —
-- ninguém mais precisa reconfigurar ao acessar.
--
-- Leitura: qualquer membro (o browser chama a Meta API direto).
-- Escrita: somente owner (policy companies_owner_update da 021).
-- ============================================================

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS meta_access_token TEXT;

-- Backfill: aproveita o token que o owner já tinha salvo em user_settings.
-- Condicional — a tabela user_settings pode não existir (migration 016 opcional).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'user_settings') THEN
    UPDATE public.companies c
    SET    meta_access_token = us.meta_access_token
    FROM   public.company_members m
    JOIN   public.user_settings us ON us.user_id = m.user_id
    WHERE  m.company_id = c.id
      AND  m.role = 'owner'
      AND  c.meta_access_token IS NULL
      AND  us.meta_access_token IS NOT NULL
      AND  us.meta_access_token <> '';
  END IF;
END $$;
