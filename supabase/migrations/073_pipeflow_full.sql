-- ============================================================
-- 073_pipeflow_full.sql — PipeFlow CRM: schema restante (Fase 4)
-- Execute no Supabase SQL Editor (após a 072). Idempotente.
--
-- Completa o schema do CRM: inbox omnicanal (WhatsApp Z-API/Cloud +
-- Instagram), notificações, playbooks nomeados, dashboards custom +
-- metas, API pública (tokens) e webhooks (in/out), acesso por pipeline.
-- Mesmas adaptações da 072: workspace_id→company_id, leads→crm_leads,
-- enums crm_*, RLS padrão da casa. `dashboard_stage_mappings` ficou de fora.
-- ============================================================

-- ------------------------------------------------------------
-- 0) Enums do inbox
-- ------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_channel_provider') THEN
    CREATE TYPE public.crm_channel_provider AS ENUM ('instagram', 'whatsapp_zapi', 'whatsapp_cloud');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_channel_status') THEN
    CREATE TYPE public.crm_channel_status AS ENUM ('connected', 'disconnected', 'error');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_conversation_status') THEN
    CREATE TYPE public.crm_conversation_status AS ENUM ('open', 'resolved', 'pending');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_message_direction') THEN
    CREATE TYPE public.crm_message_direction AS ENUM ('inbound', 'outbound');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_message_sender_type') THEN
    CREATE TYPE public.crm_message_sender_type AS ENUM ('contact', 'agent');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_message_content_type') THEN
    CREATE TYPE public.crm_message_content_type AS ENUM ('text', 'image', 'audio', 'video', 'document');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_message_status') THEN
    CREATE TYPE public.crm_message_status AS ENUM ('sent', 'delivered', 'read', 'failed');
  END IF;
END $$;

-- ------------------------------------------------------------
-- 1) Inbox omnicanal: conexões, conversas, mensagens
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.channel_connections (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider         public.crm_channel_provider NOT NULL,
  status           public.crm_channel_status NOT NULL DEFAULT 'disconnected',
  account_handle   TEXT,
  account_name     TEXT,
  account_avatar   TEXT,
  access_token     TEXT,
  token_expires_at TIMESTAMPTZ,
  external_config  JSONB       NOT NULL DEFAULT '{}'::jsonb,
  connected_by     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  connected_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  error_message    TEXT
);

CREATE INDEX IF NOT EXISTS idx_channel_connections_company ON public.channel_connections(company_id);

DROP TRIGGER IF EXISTS trg_channel_connections_updated_at ON public.channel_connections;
CREATE TRIGGER trg_channel_connections_updated_at
  BEFORE UPDATE ON public.channel_connections
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

CREATE TABLE IF NOT EXISTS public.conversations (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  channel_connection_id UUID        NOT NULL REFERENCES public.channel_connections(id) ON DELETE CASCADE,
  lead_id               UUID        REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  deal_id               UUID        REFERENCES public.deals(id) ON DELETE SET NULL,
  assigned_to           UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  provider              public.crm_channel_provider NOT NULL,
  provider_thread_id    TEXT        NOT NULL,
  contact_handle        TEXT,
  contact_name          TEXT,
  contact_avatar_url    TEXT,
  status                public.crm_conversation_status NOT NULL DEFAULT 'open',
  last_message_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_preview  TEXT,
  unread_count          INTEGER     NOT NULL DEFAULT 0 CHECK (unread_count >= 0),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_channel_thread UNIQUE (channel_connection_id, provider_thread_id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_company    ON public.conversations(company_id);
CREATE INDEX IF NOT EXISTS idx_conversations_connection ON public.conversations(channel_connection_id);
CREATE INDEX IF NOT EXISTS idx_conversations_lead       ON public.conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_conversations_deal       ON public.conversations(deal_id);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned   ON public.conversations(assigned_to);

DROP TRIGGER IF EXISTS trg_conversations_updated_at ON public.conversations;
CREATE TRIGGER trg_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

CREATE TABLE IF NOT EXISTS public.messages (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id      UUID        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  company_id           UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  direction            public.crm_message_direction NOT NULL,
  sender_type          public.crm_message_sender_type NOT NULL,
  sender_id            UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  provider_message_id  TEXT,
  content_type         public.crm_message_content_type NOT NULL DEFAULT 'text',
  content              TEXT,
  media_url            TEXT,
  status               public.crm_message_status NOT NULL DEFAULT 'sent',
  status_error_code    TEXT,
  status_error_message TEXT,
  provider_timestamp   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_conv_msg_id UNIQUE (conversation_id, provider_message_id)
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_company      ON public.messages(company_id);

-- Realtime (inbox ao vivo) — idempotente
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------------
-- 2) Notificações (escopo por USUÁRIO, não por papel)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type          TEXT        NOT NULL,
  title               TEXT        NOT NULL,
  body                TEXT,
  related_deal_id     UUID        REFERENCES public.deals(id) ON DELETE SET NULL,
  related_lead_id     UUID        REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  related_activity_id UUID        REFERENCES public.deal_activities(id) ON DELETE SET NULL,
  read_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id, company_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user_all
  ON public.notifications(user_id, company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id    UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  event_type    TEXT        NOT NULL,
  email_enabled BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, company_id, event_type),
  CONSTRAINT chk_event_type CHECK (
    event_type IN (
      'lead_assigned', 'deal_stage_changed', 'deal_due_soon',
      'activity_reminder', 'member_invited', 'member_joined'
    )
  )
);

DROP TRIGGER IF EXISTS trg_notification_preferences_updated_at ON public.notification_preferences;
CREATE TRIGGER trg_notification_preferences_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

-- ------------------------------------------------------------
-- 3) Playbooks nomeados (biblioteca de cadências)
--    (os templates por etapa já existem: pipeline_stage_activities, 072)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.playbooks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  description TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_playbooks_company ON public.playbooks(company_id);

DROP TRIGGER IF EXISTS trg_playbooks_updated_at ON public.playbooks;
CREATE TRIGGER trg_playbooks_updated_at
  BEFORE UPDATE ON public.playbooks
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

CREATE TABLE IF NOT EXISTS public.playbook_activities (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_id   UUID        NOT NULL REFERENCES public.playbooks(id) ON DELETE CASCADE,
  company_id    UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title         TEXT        NOT NULL,
  activity_type public.crm_playbook_activity_type NOT NULL,
  icon_key      TEXT,
  day_offset    INTEGER     NOT NULL DEFAULT 1,
  order_index   INTEGER     NOT NULL DEFAULT 0,
  script        TEXT,
  action_label  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_playbook_activities_company  ON public.playbook_activities(company_id);
CREATE INDEX IF NOT EXISTS idx_playbook_activities_playbook ON public.playbook_activities(playbook_id);

DROP TRIGGER IF EXISTS trg_playbook_activities_updated_at ON public.playbook_activities;
CREATE TRIGGER trg_playbook_activities_updated_at
  BEFORE UPDATE ON public.playbook_activities
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

-- ------------------------------------------------------------
-- 4) Acesso por pipeline (membro só vê pipelines onde está)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pipeline_members (
  pipeline_id UUID        NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id  UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (pipeline_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_pipeline_members_user    ON public.pipeline_members(user_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_members_company ON public.pipeline_members(company_id);

-- ------------------------------------------------------------
-- 5) Dashboards custom + metas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dashboards (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  description     TEXT,
  template_key    TEXT,
  pipeline_ids    UUID[]      NOT NULL DEFAULT '{}',
  default_filters JSONB       NOT NULL DEFAULT '{}',
  is_default      BOOLEAN     NOT NULL DEFAULT false,
  sort_order      INTEGER     NOT NULL DEFAULT 0,
  created_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, template_key)
);

CREATE INDEX IF NOT EXISTS idx_dashboards_company ON public.dashboards(company_id);
CREATE INDEX IF NOT EXISTS idx_dashboards_default ON public.dashboards(company_id, is_default);

DROP TRIGGER IF EXISTS trg_dashboards_updated_at ON public.dashboards;
CREATE TRIGGER trg_dashboards_updated_at
  BEFORE UPDATE ON public.dashboards
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

CREATE TABLE IF NOT EXISTS public.dashboard_widgets (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  dashboard_id   UUID        NOT NULL REFERENCES public.dashboards(id) ON DELETE CASCADE,
  title          TEXT        NOT NULL,
  description    TEXT,
  metric         TEXT        NOT NULL,
  dimension      TEXT,
  time_basis     TEXT        NOT NULL DEFAULT 'deal_created_at',
  aggregation    TEXT        NOT NULL DEFAULT 'count',
  visualization  TEXT        NOT NULL DEFAULT 'kpi',
  filters        JSONB       NOT NULL DEFAULT '{}',
  visual_options JSONB       NOT NULL DEFAULT '{}',
  goal           NUMERIC,
  layout         JSONB       NOT NULL DEFAULT '{}',
  sort_order     INTEGER     NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_widgets_dashboard ON public.dashboard_widgets(dashboard_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_dashboard_widgets_company   ON public.dashboard_widgets(company_id);

DROP TRIGGER IF EXISTS trg_dashboard_widgets_updated_at ON public.dashboard_widgets;
CREATE TRIGGER trg_dashboard_widgets_updated_at
  BEFORE UPDATE ON public.dashboard_widgets
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

CREATE TABLE IF NOT EXISTS public.dashboard_goals (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  pipeline_id    UUID        REFERENCES public.pipelines(id) ON DELETE CASCADE,
  month          SMALLINT    NOT NULL CHECK (month BETWEEN 1 AND 12),
  year           SMALLINT    NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  leads          INTEGER     NOT NULL DEFAULT 0 CHECK (leads >= 0),
  sales          INTEGER     NOT NULL DEFAULT 0 CHECK (sales >= 0),
  revenue        NUMERIC     NOT NULL DEFAULT 0 CHECK (revenue >= 0),
  annual_revenue NUMERIC     NOT NULL DEFAULT 0 CHECK (annual_revenue >= 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, pipeline_id, month, year)
);

-- Unicidade p/ metas globais (pipeline_id NULL não entra na UNIQUE acima)
CREATE UNIQUE INDEX IF NOT EXISTS idx_dashboard_goals_global
  ON public.dashboard_goals(company_id, month, year)
  WHERE pipeline_id IS NULL;

DROP TRIGGER IF EXISTS trg_dashboard_goals_updated_at ON public.dashboard_goals;
CREATE TRIGGER trg_dashboard_goals_updated_at
  BEFORE UPDATE ON public.dashboard_goals
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

-- ------------------------------------------------------------
-- 6) API pública + webhooks
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.api_tokens (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  token_hash   TEXT        NOT NULL UNIQUE,
  scopes       TEXT[]      NOT NULL DEFAULT '{}',
  last_used_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_company ON public.api_tokens(company_id);
CREATE INDEX IF NOT EXISTS idx_api_tokens_hash    ON public.api_tokens(token_hash);

CREATE TABLE IF NOT EXISTS public.webhook_subscriptions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name              TEXT        NOT NULL,
  url               TEXT        NOT NULL,
  events            TEXT[]      NOT NULL DEFAULT '{}',
  secret            TEXT        NOT NULL,
  is_active         BOOLEAN     NOT NULL DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  last_status_code  INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_company ON public.webhook_subscriptions(company_id);

CREATE TABLE IF NOT EXISTS public.webhook_delivery_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id      UUID        NOT NULL REFERENCES public.webhook_subscriptions(id) ON DELETE CASCADE,
  event_type      TEXT        NOT NULL,
  payload         JSONB       NOT NULL DEFAULT '{}',
  response_status INTEGER,
  error_message   TEXT,
  attempt_count   INTEGER     NOT NULL DEFAULT 1,
  delivered_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_delivery_logs_webhook   ON public.webhook_delivery_logs(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_delivery_logs_delivered ON public.webhook_delivery_logs(delivered_at DESC);

CREATE TABLE IF NOT EXISTS public.inbound_webhooks (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name             TEXT        NOT NULL,
  webhook_key      TEXT        NOT NULL UNIQUE,
  pipeline_id      UUID        REFERENCES public.pipelines(id) ON DELETE SET NULL,
  default_stage_id UUID        REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  default_owner_id UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  default_tags     TEXT[]      NOT NULL DEFAULT '{}',
  default_product  TEXT,
  field_map        JSONB       NOT NULL DEFAULT '{}',
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inbound_webhooks_key ON public.inbound_webhooks(webhook_key);
CREATE INDEX IF NOT EXISTS idx_inbound_webhooks_company    ON public.inbound_webhooks(company_id);

-- ------------------------------------------------------------
-- 7) RLS
-- ------------------------------------------------------------
ALTER TABLE public.channel_connections      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playbooks                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playbook_activities      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_members         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboards               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_widgets        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_goals          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_tokens               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_subscriptions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_delivery_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbound_webhooks         ENABLE ROW LEVEL SECURITY;

-- Padrão da casa: leitura p/ membro, escrita p/ owner|manager
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'channel_connections', 'conversations', 'messages',
    'playbooks', 'playbook_activities', 'pipeline_members',
    'dashboards', 'dashboard_widgets', 'dashboard_goals',
    'api_tokens', 'webhook_subscriptions', 'inbound_webhooks'
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

-- Notificações: cada usuário só vê/gerencia as PRÓPRIAS
DROP POLICY IF EXISTS "notifications_self_select" ON public.notifications;
CREATE POLICY "notifications_self_select" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_self_update" ON public.notifications;
CREATE POLICY "notifications_self_update" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_member_insert" ON public.notifications;
CREATE POLICY "notifications_member_insert" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(company_id));

DROP POLICY IF EXISTS "notification_preferences_self" ON public.notification_preferences;
CREATE POLICY "notification_preferences_self" ON public.notification_preferences
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Logs de entrega: leitura via assinatura da empresa (sem company_id direto)
DROP POLICY IF EXISTS "webhook_delivery_logs_select" ON public.webhook_delivery_logs;
CREATE POLICY "webhook_delivery_logs_select" ON public.webhook_delivery_logs
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.webhook_subscriptions ws
    WHERE ws.id = webhook_id AND public.is_company_member(ws.company_id)
  ));
