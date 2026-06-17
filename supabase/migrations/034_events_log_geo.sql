-- ============================================================
-- DashMonster — geolocalização por evento (substitui VisitorAPI)
-- Execute no Supabase SQL Editor (após a 033). Idempotente.
--
-- País/estado/cidade vêm de graça da rede da Vercel (headers
-- x-vercel-ip-*, lidos via @vercel/functions `geolocation()`) —
-- sem chamada a API externa, sem custo, sem latência extra, sem
-- mandar o IP do visitante pra um terceiro. Só funciona em produção
-- na Vercel; em dev local os 3 campos ficam NULL (esperado).
-- ============================================================

ALTER TABLE public.events_log
  ADD COLUMN IF NOT EXISTS country        TEXT,  -- código ISO 3166-1 alpha-2, ex.: "BR"
  ADD COLUMN IF NOT EXISTS country_region TEXT,  -- código do estado/região, ex.: "SP"
  ADD COLUMN IF NOT EXISTS city           TEXT;
