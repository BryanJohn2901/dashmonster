-- ============================================================
-- GSAStúdio Hub — Correções de segurança (Supabase Database Linter)
--
-- Resolve:
--   • function_search_path_mutable (set_updated_at, set_updated_at_dashboard_data_source)
--   • rls_policy_always_true em escritas (mantém SELECT público onde já existia)
--   • public_bucket_allows_listing (remove SELECT amplo em storage.objects)
--
-- Não altera: Auth "Leaked password protection" — ativar no Dashboard:
--   Authentication → Providers → Email → "Prevent use of leaked passwords"
-- ============================================================

-- ─── 1) Funções: search_path fixo (evita search_path mutável) ─────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at_dashboard_data_source()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ─── 2) campaign_metrics — escritas só com sessão autenticada ────────────────
DROP POLICY IF EXISTS "authenticated_write_campaign_metrics" ON public.campaign_metrics;
DROP POLICY IF EXISTS "authenticated_update_campaign_metrics" ON public.campaign_metrics;
DROP POLICY IF EXISTS "authenticated_delete_campaign_metrics" ON public.campaign_metrics;

DROP POLICY IF EXISTS "authenticated_insert_campaign_metrics" ON public.campaign_metrics;
CREATE POLICY "authenticated_insert_campaign_metrics"
  ON public.campaign_metrics FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "authenticated_update_campaign_metrics" ON public.campaign_metrics;
CREATE POLICY "authenticated_update_campaign_metrics"
  ON public.campaign_metrics FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "authenticated_delete_campaign_metrics" ON public.campaign_metrics;
CREATE POLICY "authenticated_delete_campaign_metrics"
  ON public.campaign_metrics FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "anon_read_campaign_metrics" ON public.campaign_metrics;
CREATE POLICY "anon_read_campaign_metrics"
  ON public.campaign_metrics FOR SELECT TO anon
  USING (true);

-- ─── 3) dashboard_data_source — separar leitura (anon ok) de escrita ─────────
DROP POLICY IF EXISTS "authenticated_write_dashboard_data_source" ON public.dashboard_data_source;

DROP POLICY IF EXISTS "anon_read_dashboard_data_source" ON public.dashboard_data_source;
CREATE POLICY "anon_read_dashboard_data_source"
  ON public.dashboard_data_source FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS "authenticated_update_dashboard_data_source" ON public.dashboard_data_source;
CREATE POLICY "authenticated_update_dashboard_data_source"
  ON public.dashboard_data_source FOR UPDATE TO authenticated
  USING (id IS TRUE AND auth.uid() IS NOT NULL)
  WITH CHECK (id IS TRUE AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "authenticated_insert_dashboard_data_source" ON public.dashboard_data_source;
CREATE POLICY "authenticated_insert_dashboard_data_source"
  ON public.dashboard_data_source FOR INSERT TO authenticated
  WITH CHECK (id IS TRUE AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "authenticated_delete_dashboard_data_source" ON public.dashboard_data_source;
CREATE POLICY "authenticated_delete_dashboard_data_source"
  ON public.dashboard_data_source FOR DELETE TO authenticated
  USING (id IS TRUE AND auth.uid() IS NOT NULL);

-- ─── 4) categoria — referência: leitura pública; escrita só autenticada ───────
DROP POLICY IF EXISTS "authenticated_write_categoria" ON public.categoria;

DROP POLICY IF EXISTS "authenticated_insert_categoria" ON public.categoria;
CREATE POLICY "authenticated_insert_categoria"
  ON public.categoria FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "authenticated_update_categoria" ON public.categoria;
CREATE POLICY "authenticated_update_categoria"
  ON public.categoria FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "authenticated_delete_categoria" ON public.categoria;
CREATE POLICY "authenticated_delete_categoria"
  ON public.categoria FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- ─── 5) historical_rows — anon só leitura; mutações com JWT ───────────────────
DROP POLICY IF EXISTS "anon_full_historical_rows" ON public.historical_rows;

DROP POLICY IF EXISTS "historical_rows_select" ON public.historical_rows;
CREATE POLICY "historical_rows_select"
  ON public.historical_rows FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "historical_rows_insert" ON public.historical_rows;
CREATE POLICY "historical_rows_insert"
  ON public.historical_rows FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "historical_rows_update" ON public.historical_rows;
CREATE POLICY "historical_rows_update"
  ON public.historical_rows FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "historical_rows_delete" ON public.historical_rows;
CREATE POLICY "historical_rows_delete"
  ON public.historical_rows FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- ─── 6) historical_metas ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "anon_full_historical_metas" ON public.historical_metas;

DROP POLICY IF EXISTS "historical_metas_select" ON public.historical_metas;
CREATE POLICY "historical_metas_select"
  ON public.historical_metas FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "historical_metas_insert" ON public.historical_metas;
CREATE POLICY "historical_metas_insert"
  ON public.historical_metas FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "historical_metas_update" ON public.historical_metas;
CREATE POLICY "historical_metas_update"
  ON public.historical_metas FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "historical_metas_delete" ON public.historical_metas;
CREATE POLICY "historical_metas_delete"
  ON public.historical_metas FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- ─── 7) campaign_creatives ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "anon_full_campaign_creatives" ON public.campaign_creatives;

DROP POLICY IF EXISTS "campaign_creatives_select" ON public.campaign_creatives;
CREATE POLICY "campaign_creatives_select"
  ON public.campaign_creatives FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "campaign_creatives_insert" ON public.campaign_creatives;
CREATE POLICY "campaign_creatives_insert"
  ON public.campaign_creatives FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "campaign_creatives_update" ON public.campaign_creatives;
CREATE POLICY "campaign_creatives_update"
  ON public.campaign_creatives FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "campaign_creatives_delete" ON public.campaign_creatives;
CREATE POLICY "campaign_creatives_delete"
  ON public.campaign_creatives FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- ─── 8) Storage — bucket público: URLs de objeto não precisam desta política ──
--    Remove listagem ampla via Data API (lint 0025). Upload/update/delete mantêm-se.
DROP POLICY IF EXISTS "creatives_public_read" ON storage.objects;
