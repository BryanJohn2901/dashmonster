-- ============================================================
-- DashMonster — Manual Overrides por usuário, grupo e campanha
-- Valores editados na mão (vendas Eduzz, ingressos, faturamento)
-- saem do localStorage e passam a viver na conta do usuário,
-- presos ao contexto (grupo + campanha) onde foram digitados.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_manual_overrides (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id       TEXT        NOT NULL,   -- "all"/"global"/"profile" ou id do grupo
  campaign_id    TEXT        NOT NULL,   -- "all" quando nenhuma campanha específica
  sales_total    NUMERIC     NOT NULL DEFAULT 0,
  sales_ingresso NUMERIC     NOT NULL DEFAULT 0,
  sales_pos      NUMERIC     NOT NULL DEFAULT 0,
  tickets        NUMERIC     NOT NULL DEFAULT 0,   -- Ingressos vendidos (manual)
  revenue        NUMERIC     NOT NULL DEFAULT 0,   -- Faturamento (manual)
  note           TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, group_id, campaign_id)
);

ALTER TABLE public.user_manual_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_manual_overrides_owner" ON public.user_manual_overrides
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_manual_overrides_user_id
  ON public.user_manual_overrides(user_id);
