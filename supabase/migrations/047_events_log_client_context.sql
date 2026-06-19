-- ============================================================
-- DashMonster — IP + User-Agent da visita em events_log
-- Execute no Supabase SQL Editor (após a 046). Idempotente.
--
-- O pixel já mandava client_ip_address/client_user_agent pra Meta CAPI em
-- todo evento do navegador, mas NÃO guardava — então uma venda da Eduzz,
-- quando correlacionada por email/telefone a uma visita, ia pra Meta sem
-- esses dois sinais (são identificadores fortes de match). Persistir é o
-- que permite a Purchase reaproveitar o IP/UA da visita original.
--
-- Mesma postura de PII em texto puro que lead_email/lead_phone (031) já
-- usam — sem encriptação extra, só protegido por RLS. IP/UA só saem pra
-- Meta CAPI (user_data), nunca expostos no endpoint público de config.
-- ============================================================

ALTER TABLE public.events_log
  ADD COLUMN IF NOT EXISTS client_ip_address  TEXT,
  ADD COLUMN IF NOT EXISTS client_user_agent  TEXT;
