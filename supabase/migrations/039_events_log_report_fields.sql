-- ============================================================
-- DashMonster — campos extras pra relatórios futuros em events_log
-- Execute no Supabase SQL Editor (após a 038). Idempotente.
--
-- Mesmo raciocínio da 038 (UTM como coluna): em vez de deixar o
-- dado escondido dentro de event_url/extra_fields (JSONB) ou nem
-- gravar (geo/dispositivo), grava como coluna própria — pronto pra
-- GROUP BY/filtro em SQL num relatório futuro, sem reprocessar nada.
--
-- - lead_name: nome em texto puro do Lead, mesmo padrão de
--   lead_email/lead_phone (031) — hoje só existia escondido dentro
--   de extra_fields (JSONB), sob a chave que o form usar (ex: "nome").
-- - postal_code/latitude/longitude: a Vercel já calcula isso de
--   graça nos headers x-vercel-ip-* (mesma fonte de country/city da
--   034) — só não estava sendo lido.
-- - device_type: "mobile"/"tablet"/"desktop", classificado 1x no
--   servidor a partir do User-Agent (já chega em toda request) —
--   guarda só a categoria, não o User-Agent crú inteiro.
-- ============================================================

ALTER TABLE public.events_log
  ADD COLUMN IF NOT EXISTS lead_name   TEXT,
  ADD COLUMN IF NOT EXISTS postal_code TEXT,
  ADD COLUMN IF NOT EXISTS latitude    TEXT,
  ADD COLUMN IF NOT EXISTS longitude   TEXT,
  ADD COLUMN IF NOT EXISTS device_type TEXT; -- "mobile" | "tablet" | "desktop"
