-- ============================================================
-- DashMonster — advertiser_profiles passa a ser POR EMPRESA, não por usuário
-- ============================================================
-- Bug real em produção: a tabela (migration 016) é "1 linha por user_id",
-- e o app sempre LIA/ESCREVIA filtrando só pelo próprio user_id — mesmo a
-- migration 021 já tendo adicionado `company_id` + RLS por empresa
-- (is_company_member/can_write_company, igual toda outra tabela
-- multi-tenant). Resultado: um gestor de tráfego que entra com um browser
-- novo (ou um membro novo da empresa) nunca via os perfis que um colega já
-- tinha criado — cada usuário só via a própria linha, mesmo todos sendo da
-- mesma empresa e a RLS já permitindo SELECT cruzado.
--
-- Esta migration consolida: de "1 linha por usuário" pra "1 linha por
-- empresa" (mesmo padrão de `companies.settings` — blob compartilhado,
-- last-write-wins, sem lock). RLS já está correta desde a 021, não muda
-- nada aqui — só o schema (PK) e quem upsert/select usa como chave.

-- 1) Mescla os perfis de todas as linhas (1 por usuário) da mesma empresa
--    numa lista só, sem duplicar por id de perfil — quando o mesmo perfil
--    existir em mais de uma linha (não devia, mas por segurança), vence o
--    da linha com `updated_at` mais recente.
CREATE TEMP TABLE _ap_merged AS
SELECT
  company_id,
  COALESCE(
    (SELECT jsonb_agg(dedup.elem ORDER BY dedup.elem->>'id')
     FROM (
       SELECT DISTINCT ON (elem->>'id') elem
       FROM public.advertiser_profiles ap2
       CROSS JOIN LATERAL jsonb_array_elements(ap2.profiles) elem
       WHERE ap2.company_id = ap.company_id
       ORDER BY elem->>'id', ap2.updated_at DESC
     ) dedup
    ), '[]'::jsonb
  ) AS profiles
FROM public.advertiser_profiles ap
WHERE company_id IS NOT NULL
GROUP BY company_id;

-- 2) Remove as linhas antigas (1 por usuário) das empresas que foram
--    mescladas — linhas com company_id NULL (não deviam existir desde a
--    021, mas por segurança) ficam intactas, fora deste passo.
DELETE FROM public.advertiser_profiles WHERE company_id IS NOT NULL;

-- 3) Esquema: PK deixa de ser `user_id` (não dá mais pra ter várias linhas
--    por empresa) — vira UNIQUE em `company_id`. `user_id` continua
--    existindo (nullable agora), só não é mais a chave: linhas
--    compartilhadas por empresa não pertencem a nenhum usuário específico.
ALTER TABLE public.advertiser_profiles DROP CONSTRAINT advertiser_profiles_pkey;
ALTER TABLE public.advertiser_profiles ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.advertiser_profiles
  ADD CONSTRAINT advertiser_profiles_company_id_key UNIQUE (company_id);

-- 4) Reinsere mesclado, 1 linha por empresa.
INSERT INTO public.advertiser_profiles (user_id, company_id, profiles)
SELECT NULL, company_id, profiles FROM _ap_merged;
