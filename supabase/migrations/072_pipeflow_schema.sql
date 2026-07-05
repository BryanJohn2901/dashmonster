-- ============================================================
-- 072_pipeflow_schema.sql — PipeFlow CRM: núcleo (Fase 1)
-- Execute no Supabase SQL Editor (após a 071). Idempotente.
--
-- Consolida as 37 migrations do repo wesley-wmb/pipeflow-crm numa só,
-- já adaptada ao Monster Hub (ver docs/pipeflow-integration.md):
--   • workspaces/workspace_members/workspace_invites NÃO existem aqui —
--     tenancy é a nossa: companies + company_members. Todo workspace_id
--     do original virou company_id → public.companies.
--   • Colisões renomeadas: leads→crm_leads, companies→crm_companies.
--     O FK "conta B2B do lead/deal" virou crm_company_id (company_id é
--     SEMPRE o tenant).
--   • Enums prefixados com crm_ para não poluir o namespace.
--   • RLS no padrão da casa (067/037): SELECT p/ qualquer membro,
--     escrita p/ owner|manager via can_write_company.
--   • Sem Stripe/plan/limites — acesso é o entitlement 'pipe' em
--     companies.products (071).
--   • Fora desta fase (072): inbox/mensagens, playbooks avançados,
--     dashboards CRM, notificações, API pública/webhooks,
--     pipeline_members (acesso por membro).
-- ============================================================

-- ------------------------------------------------------------
-- 0) Enums
-- ------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_lead_status') THEN
    CREATE TYPE public.crm_lead_status AS ENUM
      ('new', 'contacted', 'proposal', 'negotiation', 'won', 'lost');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_activity_type') THEN
    CREATE TYPE public.crm_activity_type AS ENUM ('call', 'email', 'meeting', 'note');
  END IF;

  -- Tipos de atividade de playbook/cadência (valores finais, já com os
  -- adicionados em 20260516120000: social/proposal/closure)
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_playbook_activity_type') THEN
    CREATE TYPE public.crm_playbook_activity_type AS ENUM
      ('call', 'email', 'whatsapp', 'instagram', 'meeting', 'task',
       'social', 'proposal', 'closure');
  END IF;

  -- Eventos de timeline do deal (valores finais, já com os da clint_crm_structure)
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_deal_history_event') THEN
    CREATE TYPE public.crm_deal_history_event AS ENUM
      ('stage_change', 'activity_completed', 'status_change', 'owner_change',
       'note_added', 'contact_updated', 'company_updated', 'field_updated',
       'deal_created', 'playbook_applied', 'activity_created', 'activity_updated');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_custom_field_type') THEN
    CREATE TYPE public.crm_custom_field_type AS ENUM
      ('text', 'number', 'monetary', 'date', 'datetime', 'phone', 'email',
       'url', 'select', 'multi_select', 'textarea', 'checkbox');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_custom_field_entity') THEN
    CREATE TYPE public.crm_custom_field_entity AS ENUM ('contact', 'company', 'deal');
  END IF;
END $$;

-- ------------------------------------------------------------
-- 1) Trigger genérico de updated_at do CRM
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- 2) profiles — nome/avatar do usuário (o CRM exibe donos/autores)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-cria profile no signup (convive com trg_materialize_invites da 025)
CREATE OR REPLACE FUNCTION public.crm_handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_profile ON auth.users;
CREATE TRIGGER trg_create_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.crm_handle_new_user_profile();

-- Backfill: usuários que já existiam antes desta migration
INSERT INTO public.profiles (id, full_name, avatar_url)
SELECT u.id,
       COALESCE(u.raw_user_meta_data->>'full_name', ''),
       u.raw_user_meta_data->>'avatar_url'
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Qualquer autenticado lê (exibir nomes de membros); só o dono edita a própria linha
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "profiles_self_update" ON public.profiles;
CREATE POLICY "profiles_self_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "profiles_self_insert" ON public.profiles;
CREATE POLICY "profiles_self_insert" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- ------------------------------------------------------------
-- 3) crm_companies — contas B2B dos leads (era "companies" no PipeFlow)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_companies (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name                 TEXT        NOT NULL,
  website              TEXT,
  cnpj                 TEXT,
  city                 TEXT,
  state                TEXT,
  category             TEXT,
  segment              TEXT,
  employee_count       TEXT,
  current_crm          TEXT,
  faturamento_estimado TEXT,
  linkedin_url         TEXT,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_companies_company ON public.crm_companies(company_id);

DROP TRIGGER IF EXISTS trg_crm_companies_updated_at ON public.crm_companies;
CREATE TRIGGER trg_crm_companies_updated_at
  BEFORE UPDATE ON public.crm_companies
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

-- ------------------------------------------------------------
-- 4) crm_leads — contatos (era "leads" no PipeFlow; estado final das colunas)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_leads (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  owner_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  crm_company_id  UUID        REFERENCES public.crm_companies(id) ON DELETE SET NULL,
  name            TEXT        NOT NULL,
  email           TEXT,
  phone           TEXT,
  whatsapp        TEXT,
  instagram       TEXT,
  google_business TEXT,
  website         TEXT CHECK (website IS NULL OR length(website) <= 500),
  company         TEXT,       -- nome da empresa em texto livre (legado do form)
  position        TEXT,       -- legado; consolidado em job_title
  job_title       TEXT,
  birthdate       DATE,
  status          public.crm_lead_status NOT NULL DEFAULT 'new',
  estimated_value NUMERIC(12, 2),
  notes           TEXT,
  origin          TEXT,
  utm_source      TEXT,
  utm_medium      TEXT,
  utm_campaign    TEXT,
  utm_term        TEXT CHECK (utm_term    IS NULL OR length(utm_term)    <= 500),
  utm_content     TEXT CHECK (utm_content IS NULL OR length(utm_content) <= 500),
  utm_track       TEXT CHECK (utm_track   IS NULL OR length(utm_track)   <= 500),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_leads_company         ON public.crm_leads(company_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_owner           ON public.crm_leads(owner_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_status          ON public.crm_leads(company_id, status);
CREATE INDEX IF NOT EXISTS idx_crm_leads_crm_company     ON public.crm_leads(crm_company_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_company_created ON public.crm_leads(company_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_crm_leads_updated_at ON public.crm_leads;
CREATE TRIGGER trg_crm_leads_updated_at
  BEFORE UPDATE ON public.crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

-- ------------------------------------------------------------
-- 5) pipelines + pipeline_stages — funis dinâmicos por empresa
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pipelines (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipelines_company ON public.pipelines(company_id);

DROP TRIGGER IF EXISTS trg_pipelines_updated_at ON public.pipelines;
CREATE TRIGGER trg_pipelines_updated_at
  BEFORE UPDATE ON public.pipelines
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

CREATE TABLE IF NOT EXISTS public.pipeline_stages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID        NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  color       TEXT        NOT NULL DEFAULT 'slate',
  order_index INTEGER     NOT NULL DEFAULT 0,
  -- Papel semântico fixo p/ relatórios: cada funil tem UMA etapa won e UMA lost
  status_kind TEXT        NOT NULL DEFAULT 'open' CHECK (status_kind IN ('open', 'won', 'lost')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_stages_pipeline ON public.pipeline_stages(pipeline_id);

CREATE UNIQUE INDEX IF NOT EXISTS pipeline_stages_one_won_per_pipeline
  ON public.pipeline_stages(pipeline_id) WHERE status_kind = 'won';

CREATE UNIQUE INDEX IF NOT EXISTS pipeline_stages_one_lost_per_pipeline
  ON public.pipeline_stages(pipeline_id) WHERE status_kind = 'lost';

DROP TRIGGER IF EXISTS trg_pipeline_stages_updated_at ON public.pipeline_stages;
CREATE TRIGGER trg_pipeline_stages_updated_at
  BEFORE UPDATE ON public.pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

-- ------------------------------------------------------------
-- 6) deals — negócios (estado final das colunas)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.deals (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lead_id             UUID        REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  crm_company_id      UUID        REFERENCES public.crm_companies(id) ON DELETE SET NULL,
  owner_id            UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  pipeline_id         UUID        NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  stage_id            UUID        NOT NULL REFERENCES public.pipeline_stages(id) ON DELETE RESTRICT,
  title               TEXT        NOT NULL,
  value               NUMERIC(12, 2),
  status              TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost')),
  product_name        TEXT,
  temperature         TEXT,       -- cold | warm | hot
  due_date            DATE,
  expected_close_date DATE,
  lost_reason         TEXT,
  utm_source          TEXT,
  utm_medium          TEXT,
  utm_campaign        TEXT,
  utm_content         TEXT,
  utm_term            TEXT,
  origin_page         TEXT,
  acquisition_channel TEXT,
  landing_page_url    TEXT,
  proposal_url        TEXT,
  payment_url         TEXT,
  scheduling_url      TEXT,
  contract_url        TEXT,
  -- "Tempo na etapa" real: só muda ao trocar de etapa (moveDeal) ou criar
  stage_entered_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deals_company         ON public.deals(company_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage           ON public.deals(company_id, stage_id);
CREATE INDEX IF NOT EXISTS idx_deals_owner           ON public.deals(owner_id);
CREATE INDEX IF NOT EXISTS idx_deals_lead            ON public.deals(lead_id);
CREATE INDEX IF NOT EXISTS idx_deals_crm_company     ON public.deals(crm_company_id);
CREATE INDEX IF NOT EXISTS idx_deals_company_created ON public.deals(company_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_deals_updated_at ON public.deals;
CREATE TRIGGER trg_deals_updated_at
  BEFORE UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

-- ------------------------------------------------------------
-- 7) activities — timeline do lead (ligação/e-mail/reunião/nota)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activities (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lead_id     UUID        NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  author_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  type        public.crm_activity_type NOT NULL,
  title       TEXT        NOT NULL,
  description TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activities_company       ON public.activities(company_id);
CREATE INDEX IF NOT EXISTS idx_activities_lead          ON public.activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_activities_author        ON public.activities(author_id);
CREATE INDEX IF NOT EXISTS idx_activities_lead_occurred ON public.activities(lead_id, occurred_at DESC);

-- ------------------------------------------------------------
-- 8) tags + deal_tags
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tags (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  color      TEXT        NOT NULL DEFAULT 'slate',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tags_company ON public.tags(company_id);

DROP TRIGGER IF EXISTS trg_tags_updated_at ON public.tags;
CREATE TRIGGER trg_tags_updated_at
  BEFORE UPDATE ON public.tags
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

CREATE TABLE IF NOT EXISTS public.deal_tags (
  deal_id    UUID        NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  tag_id     UUID        NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  company_id UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (deal_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_deal_tags_company ON public.deal_tags(company_id);

-- ------------------------------------------------------------
-- 9) pipeline_stage_activities — templates de cadência por etapa
--    (mínimo p/ deal_activities funcionar; playbooks avançados = Fase 4)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pipeline_stage_activities (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id      UUID        NOT NULL REFERENCES public.pipeline_stages(id) ON DELETE CASCADE,
  company_id    UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title         TEXT        NOT NULL,
  activity_type public.crm_playbook_activity_type NOT NULL DEFAULT 'task',
  day_offset    INTEGER     NOT NULL DEFAULT 0,
  script        TEXT,
  order_index   INTEGER     NOT NULL DEFAULT 0,
  icon_key      TEXT,
  action_label  TEXT,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_psa_company ON public.pipeline_stage_activities(company_id);
CREATE INDEX IF NOT EXISTS idx_psa_stage   ON public.pipeline_stage_activities(stage_id);

DROP TRIGGER IF EXISTS trg_psa_updated_at ON public.pipeline_stage_activities;
CREATE TRIGGER trg_psa_updated_at
  BEFORE UPDATE ON public.pipeline_stage_activities
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

-- ------------------------------------------------------------
-- 10) deal_activities — atividades do negócio (também é o calendário)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.deal_activities (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id            UUID        NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  company_id         UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title              TEXT        NOT NULL,
  activity_type      public.crm_playbook_activity_type NOT NULL DEFAULT 'task',
  script             TEXT,
  icon_key           TEXT,
  action_label       TEXT,
  day_offset         INTEGER     NOT NULL DEFAULT 0,
  order_index        INTEGER     NOT NULL DEFAULT 0,
  due_date           TIMESTAMPTZ,
  completed_at       TIMESTAMPTZ,
  completed_by       UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_custom          BOOLEAN     NOT NULL DEFAULT false,
  source_template_id UUID        REFERENCES public.pipeline_stage_activities(id) ON DELETE SET NULL,
  -- Campos de calendário (20260520000004)
  assigned_to        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  scheduled_start_at TIMESTAMPTZ,
  scheduled_end_at   TIMESTAMPTZ,
  reminder_at        TIMESTAMPTZ,
  reminder_sent_at   TIMESTAMPTZ,
  priority           TEXT        NOT NULL DEFAULT 'normal',
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_da_company ON public.deal_activities(company_id);
CREATE INDEX IF NOT EXISTS idx_da_deal    ON public.deal_activities(deal_id);

CREATE INDEX IF NOT EXISTS idx_da_company_assignee_schedule
  ON public.deal_activities(company_id, assigned_to, scheduled_start_at);

CREATE INDEX IF NOT EXISTS idx_da_company_reminders
  ON public.deal_activities(company_id, reminder_at, reminder_sent_at)
  WHERE reminder_at IS NOT NULL AND reminder_sent_at IS NULL AND completed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_da_company_deal_schedule
  ON public.deal_activities(company_id, deal_id, scheduled_start_at);

CREATE INDEX IF NOT EXISTS idx_da_deal_completed
  ON public.deal_activities(deal_id, completed_at);

DROP TRIGGER IF EXISTS trg_da_updated_at ON public.deal_activities;
CREATE TRIGGER trg_da_updated_at
  BEFORE UPDATE ON public.deal_activities
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

-- ------------------------------------------------------------
-- 11) deal_history — timeline de eventos do negócio
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.deal_history (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id    UUID        NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  company_id UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id    UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type public.crm_deal_history_event NOT NULL,
  old_value  TEXT,
  new_value  TEXT,
  details    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dh_company ON public.deal_history(company_id);
CREATE INDEX IF NOT EXISTS idx_dh_deal    ON public.deal_history(deal_id);

-- ------------------------------------------------------------
-- 12) custom_field_definitions + custom_field_values
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.custom_field_definitions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  entity_type public.crm_custom_field_entity NOT NULL,
  group_name  TEXT        NOT NULL DEFAULT 'Geral',
  label       TEXT        NOT NULL,
  field_type  public.crm_custom_field_type NOT NULL DEFAULT 'text',
  placeholder TEXT,
  options     JSONB,      -- opções de select/multi_select
  is_required BOOLEAN     NOT NULL DEFAULT false,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cfd_company ON public.custom_field_definitions(company_id);

DROP TRIGGER IF EXISTS trg_cfd_updated_at ON public.custom_field_definitions;
CREATE TRIGGER trg_cfd_updated_at
  BEFORE UPDATE ON public.custom_field_definitions
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

CREATE TABLE IF NOT EXISTS public.custom_field_values (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  field_id   UUID        NOT NULL REFERENCES public.custom_field_definitions(id) ON DELETE CASCADE,
  entity_id  UUID        NOT NULL, -- id de crm_lead, crm_company ou deal
  value      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (field_id, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_cfv_company ON public.custom_field_values(company_id);
CREATE INDEX IF NOT EXISTS idx_cfv_entity  ON public.custom_field_values(entity_id);

DROP TRIGGER IF EXISTS trg_cfv_updated_at ON public.custom_field_values;
CREATE TRIGGER trg_cfv_updated_at
  BEFORE UPDATE ON public.custom_field_values
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

-- ------------------------------------------------------------
-- 13) RLS — padrão da casa (067/037): leitura p/ membro, escrita p/
--     owner|manager (can_write_company). pipeline_stages e deal_tags não
--     têm company_id direto? Têm sim (deal_tags) / herdam via pipeline
--     (pipeline_stages) — resolvido com subquery igual ao original.
-- ------------------------------------------------------------
ALTER TABLE public.crm_companies             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_leads                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipelines                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_stages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_tags                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_stage_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_activities           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_history              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_field_definitions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_field_values       ENABLE ROW LEVEL SECURITY;

-- Tabelas com company_id direto: mesmo par de policies em todas
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'crm_companies', 'crm_leads', 'pipelines', 'deals', 'activities',
    'tags', 'deal_tags', 'pipeline_stage_activities', 'deal_activities',
    'deal_history', 'custom_field_definitions', 'custom_field_values'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
       USING (public.is_company_member(company_id))',
      t || '_select', t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_write', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
       USING (public.can_write_company(company_id))
       WITH CHECK (public.can_write_company(company_id))',
      t || '_write', t
    );
  END LOOP;
END $$;

-- pipeline_stages: herda a empresa via pipelines
DROP POLICY IF EXISTS "pipeline_stages_select" ON public.pipeline_stages;
CREATE POLICY "pipeline_stages_select" ON public.pipeline_stages
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.pipelines p
    WHERE p.id = pipeline_id AND public.is_company_member(p.company_id)
  ));

DROP POLICY IF EXISTS "pipeline_stages_write" ON public.pipeline_stages;
CREATE POLICY "pipeline_stages_write" ON public.pipeline_stages
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.pipelines p
    WHERE p.id = pipeline_id AND public.can_write_company(p.company_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.pipelines p
    WHERE p.id = pipeline_id AND public.can_write_company(p.company_id)
  ));
