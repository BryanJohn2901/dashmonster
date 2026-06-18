-- ============================================================
-- DashMonster — UTMs como colunas próprias em events_log
-- Execute no Supabase SQL Editor (após a 037). Idempotente.
--
-- Antes, a UTM só existia escondida dentro de events_log.event_url —
-- o dashboard reprocessava a URL no browser a cada render (parseUtm()
-- em TrackingEventsView.tsx). Funciona pra exibir, mas não dá pra
-- agregar/filtrar em SQL. Agora o servidor extrai a UTM da URL uma
-- vez, na captura (track-event/route.ts), e grava em coluna — fica
-- pronto pra qualquer relatório futuro (GROUP BY utm_campaign etc.)
-- sem reprocessar nada.
--
-- utm_campaign_id/utm_adset_id/utm_ad_id são as MESMAS IDs que a Meta
-- Marketing API usa pra campaign/adset/ad — guardar elas como coluna
-- é o que permite, no futuro, um JOIN com dados de custo/ROAS da API
-- da Meta por campanha/conjunto/anúncio, não só por nome de campanha
-- (nome pode repetir entre campanhas, ID nunca repete).
-- ============================================================

ALTER TABLE public.events_log
  ADD COLUMN IF NOT EXISTS utm_source      TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium      TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign    TEXT,
  ADD COLUMN IF NOT EXISTS utm_content     TEXT,
  ADD COLUMN IF NOT EXISTS utm_term        TEXT,
  ADD COLUMN IF NOT EXISTS utm_placement   TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign_id TEXT,
  ADD COLUMN IF NOT EXISTS utm_adset_id    TEXT,
  ADD COLUMN IF NOT EXISTS utm_ad_id       TEXT;

-- Índices pro padrão de relatório mais comum: comparar campanhas (ou
-- anúncios) de 1 empresa num intervalo de tempo.
CREATE INDEX IF NOT EXISTS idx_events_log_company_utm_campaign
  ON public.events_log(company_id, utm_campaign, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_log_utm_ad_id
  ON public.events_log(utm_ad_id) WHERE utm_ad_id IS NOT NULL;
