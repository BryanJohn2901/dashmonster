-- ============================================================
-- Instagram — Segurança + colunas faltantes
--
-- Resolve:
--   • access_token legível por qualquer cliente anon (texto puro) → bloqueia
--     leitura da coluna no nível do Postgres (column-level REVOKE). O token
--     agora é gravado cifrado (AES-256-GCM) e só o service_role lê.
--   • daily_unfollows: rotas já gravam, mas a migração 015 não criou a coluna
--     (bug latente → upsert falhava silenciosamente nessa coluna).
--   • token_expires_at / connection_status: estado da conexão para a UI avisar
--     quando precisar reconectar.
--   • RLS habilitado nas tabelas IG (linter), preservando leitura/escrita atual
--     do dashboard (favoritar, mover de grupo) feita com a chave anon.
-- ============================================================

-- ─── 1) Colunas novas ─────────────────────────────────────────────────────────
ALTER TABLE public.instagram_accounts
  ADD COLUMN IF NOT EXISTS token_expires_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS connection_status TEXT NOT NULL DEFAULT 'active';
  -- connection_status: 'active' | 'expired' | 'error'

ALTER TABLE public.instagram_account_history
  ADD COLUMN IF NOT EXISTS daily_unfollows INTEGER NOT NULL DEFAULT 0;

-- ─── 2) Proteger access_token (column-level privilege) ────────────────────────
-- Mesmo sem RLS, isto impede `select access_token` por anon/authenticated.
-- O cliente (supabaseInstagram.ts) já seleciona apenas colunas explícitas sem o
-- token, então nada quebra. As rotas server-side usam service_role (bypassa).
REVOKE SELECT (access_token) ON public.instagram_accounts FROM anon;
REVOKE SELECT (access_token) ON public.instagram_accounts FROM authenticated;

-- ─── 3) RLS habilitado, preservando comportamento atual do dashboard ──────────
-- O app lê (e favorita/move de grupo) com a chave anon. Mantemos permissivo no
-- nível de linha; a proteção do token vem do REVOKE de coluna acima. As escritas
-- de sincronização passam a usar service_role (bypassa RLS de qualquer forma).

ALTER TABLE public.instagram_accounts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_account_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_groups          ENABLE ROW LEVEL SECURITY;

-- instagram_accounts
DROP POLICY IF EXISTS ig_accounts_select ON public.instagram_accounts;
CREATE POLICY ig_accounts_select ON public.instagram_accounts
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS ig_accounts_update ON public.instagram_accounts;
CREATE POLICY ig_accounts_update ON public.instagram_accounts
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS ig_accounts_delete ON public.instagram_accounts;
CREATE POLICY ig_accounts_delete ON public.instagram_accounts
  FOR DELETE TO anon, authenticated USING (true);

-- instagram_account_history (somente leitura pelo cliente; escrita via service_role)
DROP POLICY IF EXISTS ig_history_select ON public.instagram_account_history;
CREATE POLICY ig_history_select ON public.instagram_account_history
  FOR SELECT TO anon, authenticated USING (true);

-- instagram_groups (criar/remover grupos pelo dashboard)
DROP POLICY IF EXISTS ig_groups_select ON public.instagram_groups;
CREATE POLICY ig_groups_select ON public.instagram_groups
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS ig_groups_insert ON public.instagram_groups;
CREATE POLICY ig_groups_insert ON public.instagram_groups
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS ig_groups_delete ON public.instagram_groups;
CREATE POLICY ig_groups_delete ON public.instagram_groups
  FOR DELETE TO anon, authenticated USING (true);
