-- ============================================================
-- DashMonster — captura email/telefone em claro do Lead (além do hash)
-- Execute no Supabase SQL Editor (após a 030). Idempotente.
--
-- events_log.user_data.em/ph continuam só o hash SHA-256 (é o que vai
-- pra Meta CAPI, nunca muda). lead_email/lead_phone são a versão em
-- texto puro, capturada à parte, só pra exibição no dashboard (pra
-- permitir contato real com o lead) — nunca repassada à Meta.
-- Mesmo padrão de public.leads (028_multi_source.sql): TEXT plano,
-- protegido só por RLS (sem encriptação adicional).
-- ============================================================

ALTER TABLE public.events_log
  ADD COLUMN IF NOT EXISTS lead_email TEXT,
  ADD COLUMN IF NOT EXISTS lead_phone TEXT;
