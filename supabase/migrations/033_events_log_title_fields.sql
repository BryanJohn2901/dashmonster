-- ============================================================
-- DashMonster — título da página + todos os campos do formulário
-- Execute no Supabase SQL Editor (após a 032). Idempotente.
--
-- page_title: document.title capturado pelo pixel.js em cada evento,
-- pra exibir o nome real da página em vez de só a URL/slug.
-- extra_fields: todos os campos nomeados do <form> (além de email/
-- telefone, que continuam em lead_email/lead_phone) — texto puro,
-- mesmo padrão de PII em claro já usado nessas colunas, só pra
-- exibição no dashboard (nunca repassado à Meta CAPI).
-- ============================================================

ALTER TABLE public.events_log
  ADD COLUMN IF NOT EXISTS page_title   TEXT,
  ADD COLUMN IF NOT EXISTS extra_fields JSONB NOT NULL DEFAULT '{}';
