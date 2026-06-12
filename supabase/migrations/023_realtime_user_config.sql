-- ============================================================
-- Analytics PTA — Realtime para configuração
-- Execute este SQL no Supabase SQL Editor (após a 022)
--
-- Habilita Realtime nas tabelas de configuração para o dashboard
-- atualizar ao vivo quando qualquer membro da empresa altera algo
-- (categorias, contas vinculadas, Central de Campanhas).
-- ============================================================

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'user_categories',
    'user_account_entries',
    'campaign_center_entries',
    'companies'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = t) THEN
      BEGIN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      EXCEPTION WHEN duplicate_object THEN
        NULL; -- já está na publication
      END;
    END IF;
  END LOOP;
END $$;
