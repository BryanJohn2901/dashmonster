-- ============================================================
-- DashMonster — Advertiser Profiles & User Settings
-- Persiste perfis de anunciante e token Meta na conta do usuário
-- (antes ficavam apenas em localStorage do browser)
-- ============================================================

-- 1. advertiser_profiles: one row per user, JSONB blob
--    A abordagem de blob (em vez de uma linha por perfil) simplifica o
--    merge client-side e evita race conditions em operações batch.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.advertiser_profiles (
  user_id    UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  profiles   JSONB       NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.advertiser_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "advertiser_profiles_owner" ON public.advertiser_profiles
  FOR ALL TO authenticated
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. user_settings: meta token e outras configurações por usuário
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id           UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  meta_access_token TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_settings_owner" ON public.user_settings
  FOR ALL TO authenticated
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. Helper function to auto-update updated_at on any write
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_advertiser_profiles_updated_at
  BEFORE UPDATE ON public.advertiser_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
