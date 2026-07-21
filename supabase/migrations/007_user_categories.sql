-- ============================================================
-- GSAStúdio Hub — User Categories & Account Entries
-- Painel de Controle: categorias (fixas + custom) e contas vinculadas
-- ============================================================

-- 1. user_categories: one row per category per user
-- Fixed categories (slug: pos, livros, ebooks, perpetuo, eventos)
-- Custom categories (slug: uuid generated on client)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_categories (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug          TEXT        NOT NULL,
  name          TEXT        NOT NULL,
  type          TEXT        NOT NULL DEFAULT 'fixed' CHECK (type IN ('fixed', 'custom')),
  emoji         TEXT,
  position      INTEGER     NOT NULL DEFAULT 0,
  is_enabled    BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, slug)
);

-- 2. user_account_entries: ad accounts linked to a category
-- unlimited per category; campaigns stored as JSONB snapshot
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_account_entries (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id           UUID        NOT NULL REFERENCES public.user_categories(id) ON DELETE CASCADE,
  label                 TEXT        NOT NULL,
  ad_account_id         TEXT        NOT NULL,
  campaigns             JSONB       NOT NULL DEFAULT '[]',
  selected_campaign_ids TEXT[]      NOT NULL DEFAULT '{}',
  is_enabled            BOOLEAN     NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Row Level Security
-- -------------------------------------------------------
ALTER TABLE public.user_categories      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_account_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_categories_owner" ON public.user_categories
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_account_entries_owner" ON public.user_account_entries
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. Indexes
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_user_categories_user_id
  ON public.user_categories(user_id);

CREATE INDEX IF NOT EXISTS idx_user_account_entries_user_id
  ON public.user_account_entries(user_id);

CREATE INDEX IF NOT EXISTS idx_user_account_entries_category_id
  ON public.user_account_entries(category_id);
