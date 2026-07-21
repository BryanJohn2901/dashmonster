-- ============================================================
-- RESET TOTAL do schema da aplicação (schema public).
-- Apaga TODAS as tabelas/funções/triggers/policies do app.
-- NÃO toca em auth/storage/realtime (outros schemas).
-- IRREVERSÍVEL. Rodar SÓ num banco que pode ir a zero.
-- Rode ISTO primeiro; depois rode o bootstrap_all.sql.
-- ============================================================

DROP SCHEMA public CASCADE;
CREATE SCHEMA public;

-- Grants padrão do Supabase pro schema recém-criado.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL   ON SCHEMA public TO postgres, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
