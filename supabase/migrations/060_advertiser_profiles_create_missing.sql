-- ============================================================
-- DashMonster — cria advertiser_profiles que nunca existiu neste banco
-- ============================================================
-- Causa raiz confirmada (2026-06-23): a migration 016 (cria a tabela) nunca
-- rodou de fato nesta instância Supabase — só estava no histórico de
-- arquivos. A 021 (multi-tenant) checa `IF EXISTS (SELECT 1 FROM
-- information_schema.tables ...)` antes de alterar cada tabela da lista, e
-- como `advertiser_profiles` não existia, pulou ela em silêncio, sem erro
-- — por isso passou despercebido até agora. A 059 (1ª migration que faz
-- `FROM public.advertiser_profiles` sem essa guarda) foi quem finalmente
-- estourou com "relation does not exist" ao ser rodada manualmente.
--
-- Efeito colateral real: `fetchProfilesFromDB`/`saveProfilesToDB`
-- (src/utils/supabaseProfiles.ts) engolem erro de tabela ausente e
-- retornam silenciosamente — o backup de Perfis de Anunciante pro Supabase
-- nunca funcionou nesta empresa, pra nenhum usuário. "Perfis de
-- Anunciantes" aparecendo vazio é o localStorage real daquele browser, sem
-- fallback (nunca houve nada salvo no banco pra puxar).
--
-- Como a tabela nunca existiu, não há nenhuma linha pra migrar — esta
-- migration cria ela direto já no formato FINAL que a 059 desenhou
-- (1 linha por empresa, `company_id` único), pulando o estágio intermediário
-- "1 linha por usuário" que a 016/021 criariam numa instalação do zero. Tudo
-- com guards (`IF NOT EXISTS`/`DROP POLICY IF EXISTS`) — seguro rodar mesmo
-- que algum pedaço já tenha sido criado manualmente numa tentativa anterior.

CREATE TABLE IF NOT EXISTS public.advertiser_profiles (
  company_id UUID        NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  profiles   JSONB       NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.advertiser_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "advertiser_profiles_owner" ON public.advertiser_profiles;
DROP POLICY IF EXISTS "advertiser_profiles_select" ON public.advertiser_profiles;
DROP POLICY IF EXISTS "advertiser_profiles_write" ON public.advertiser_profiles;

-- Mesmo padrão de RLS por empresa de toda outra tabela multi-tenant
-- (is_company_member/can_write_company, definidas na migration 021).
CREATE POLICY "advertiser_profiles_select" ON public.advertiser_profiles
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));

CREATE POLICY "advertiser_profiles_write" ON public.advertiser_profiles
  FOR ALL TO authenticated
  USING (public.can_write_company(company_id))
  WITH CHECK (public.can_write_company(company_id));

-- set_updated_at() já existe desde a migration 001/004 — não precisa recriar.
DROP TRIGGER IF EXISTS trg_advertiser_profiles_updated_at ON public.advertiser_profiles;
CREATE TRIGGER trg_advertiser_profiles_updated_at
  BEFORE UPDATE ON public.advertiser_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
