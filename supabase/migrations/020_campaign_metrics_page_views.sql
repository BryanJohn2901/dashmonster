-- ============================================================
-- campaign_metrics: coluna page_views (Visualizações de Página)
-- landing_page_view da Meta. Alimenta a etapa "Vis. de Página" e a
-- "Tx. Captura"/"Connect Rate" do funil do Dashboard.
-- ============================================================

ALTER TABLE public.campaign_metrics
  ADD COLUMN IF NOT EXISTS page_views NUMERIC NOT NULL DEFAULT 0;
