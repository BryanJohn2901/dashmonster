-- ─── 075: super admin enxerga o PipeFlow de todas as empresas ──────────────────
-- As tabelas do CRM (072/073) só tinham policies de membro (is_company_member /
-- can_write_company). O Painel Admin unificado precisa que o super admin leia e
-- gerencie funis/leads/canais de QUALQUER empresa — mesmo padrão da 026.
-- Fica de fora o que é pessoal do usuário (profiles, notifications, prefs).

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    -- 072
    'crm_companies', 'crm_leads', 'pipelines', 'pipeline_stages', 'deals',
    'activities', 'tags', 'deal_tags', 'pipeline_stage_activities',
    'deal_activities', 'deal_history', 'custom_field_definitions', 'custom_field_values',
    -- 073
    'channel_connections', 'conversations', 'messages',
    'playbooks', 'playbook_activities', 'pipeline_members',
    'dashboards', 'dashboard_widgets', 'dashboard_goals',
    'api_tokens', 'webhook_subscriptions', 'webhook_delivery_logs', 'inbound_webhooks'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_superadmin_all', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
         USING (public.is_super_admin()) WITH CHECK (public.is_super_admin())',
        t || '_superadmin_all', t);
    END IF;
  END LOOP;
END $$;
