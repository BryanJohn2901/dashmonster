-- ─── instagram_groups ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.instagram_groups (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  description TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── instagram_accounts ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.instagram_accounts (
  id                            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  instagram_business_account_id TEXT        NOT NULL UNIQUE,
  username                      TEXT        NOT NULL,
  name                          TEXT        NOT NULL DEFAULT '',
  biography                     TEXT        NOT NULL DEFAULT '',
  profile_picture_url           TEXT,
  followers_count               INTEGER     NOT NULL DEFAULT 0,
  follows_count                 INTEGER     NOT NULL DEFAULT 0,
  media_count                   INTEGER     NOT NULL DEFAULT 0,
  is_verified                   BOOLEAN     NOT NULL DEFAULT false,
  engagement_rate               NUMERIC     NOT NULL DEFAULT 0,
  access_token                  TEXT        NOT NULL,
  group_id                      UUID        REFERENCES public.instagram_groups(id) ON DELETE SET NULL,
  is_favorite                   BOOLEAN     NOT NULL DEFAULT false,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── instagram_account_history ────────────────────────────────────────────────
-- Daily snapshots: absolute counts + daily deltas where available
CREATE TABLE IF NOT EXISTS public.instagram_account_history (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id             UUID        NOT NULL REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  date                   DATE        NOT NULL,
  followers_count        INTEGER     NOT NULL DEFAULT 0,
  following_count        INTEGER     NOT NULL DEFAULT 0,
  media_count            INTEGER     NOT NULL DEFAULT 0,
  daily_followers_gained INTEGER     NOT NULL DEFAULT 0,
  profile_views          INTEGER     NOT NULL DEFAULT 0,
  reach                  INTEGER     NOT NULL DEFAULT 0,
  impressions            INTEGER     NOT NULL DEFAULT 0,
  engagement_rate        NUMERIC     NOT NULL DEFAULT 0,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(account_id, date)
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ig_accounts_iba_id   ON public.instagram_accounts(instagram_business_account_id);
CREATE INDEX IF NOT EXISTS idx_ig_accounts_username  ON public.instagram_accounts(username);
CREATE INDEX IF NOT EXISTS idx_ig_accounts_group_id  ON public.instagram_accounts(group_id);
CREATE INDEX IF NOT EXISTS idx_ig_hist_account_id    ON public.instagram_account_history(account_id);
CREATE INDEX IF NOT EXISTS idx_ig_hist_date          ON public.instagram_account_history(date);
CREATE INDEX IF NOT EXISTS idx_ig_hist_account_date  ON public.instagram_account_history(account_id, date);

-- ─── Realtime publication ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public' AND tablename = 'instagram_accounts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.instagram_accounts;
  END IF;
END $$;
