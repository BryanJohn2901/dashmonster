-- ============================================================
-- DashMonster — remove a integração via API da Eduzz (OAuth/pull)
-- ============================================================
-- Decisão do usuário (2026-06-23): abandonar a sincronização via API da Eduzz
-- (OAuth2 + pull de vendas/assinaturas/chargebacks, migration 058) e ficar SÓ
-- com o webhook. O webhook continua intacto — esta migration NÃO toca em
-- nenhuma tabela dele (`eduzz_webhook_configs` 041, `eduzz_products`/
-- `eduzz_product_offers` 050, `eduzz_contracts` 052/055/056 seguem todas).
--
-- Dropa só a tabela exclusiva do fluxo OAuth/API. CASCADE remove junto as
-- policies de RLS e constraints dela. IF EXISTS pra ser idempotente (seguro
-- rodar mesmo que a 058 nunca tenha sido aplicada nesta instância).
--
-- ATENÇÃO: isto APAGA o access_token cifrado da Eduzz que estava guardado aqui.
-- Sem volta — pra religar a API no futuro seria refazer o OAuth do zero. Como
-- a feature foi removida do código, o token não tem mais uso.

DROP TABLE IF EXISTS public.eduzz_oauth_connections CASCADE;
