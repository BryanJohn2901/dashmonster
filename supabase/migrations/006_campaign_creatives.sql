-- ============================================================
-- GSAStúdio Hub — Criativos: tabela + bucket Supabase Storage
-- Execute no Supabase SQL Editor
-- ============================================================

-- ─── Tabela ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campaign_creatives (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_name   TEXT        NOT NULL UNIQUE,
  ad_account_id   TEXT        NOT NULL DEFAULT '',
  meta_url        TEXT        NOT NULL DEFAULT '',
  storage_path    TEXT        NOT NULL DEFAULT '',
  storage_url     TEXT        NOT NULL DEFAULT '',
  ad_link         TEXT        NOT NULL DEFAULT '',
  notes           TEXT        NOT NULL DEFAULT '',
  starred         BOOLEAN     NOT NULL DEFAULT false,
  starred_at      TIMESTAMPTZ,
  saved_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.campaign_creatives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_full_campaign_creatives" ON public.campaign_creatives
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_creatives TO anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_creatives_campaign ON public.campaign_creatives(campaign_name);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_creatives_updated_at ON public.campaign_creatives;
CREATE TRIGGER trg_creatives_updated_at
  BEFORE UPDATE ON public.campaign_creatives
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Bucket Supabase Storage ──────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'creatives',
  'creatives',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Políticas de acesso ao bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'creatives_public_read'
  ) THEN
    CREATE POLICY "creatives_public_read" ON storage.objects
      FOR SELECT TO anon, authenticated USING (bucket_id = 'creatives');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'creatives_upload'
  ) THEN
    CREATE POLICY "creatives_upload" ON storage.objects
      FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'creatives');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'creatives_update'
  ) THEN
    CREATE POLICY "creatives_update" ON storage.objects
      FOR UPDATE TO anon, authenticated USING (bucket_id = 'creatives');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'creatives_delete'
  ) THEN
    CREATE POLICY "creatives_delete" ON storage.objects
      FOR DELETE TO anon, authenticated USING (bucket_id = 'creatives');
  END IF;
END $$;

-- Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public' AND tablename = 'campaign_creatives'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_creatives;
  END IF;
END $$;
