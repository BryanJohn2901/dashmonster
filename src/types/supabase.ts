// ─── Shim dos aliases de tipos do PipeFlow original ───────────────────────────
// No original estes aliases derivavam do types gerado pelo Supabase CLI.
// Aqui são escritos à mão espelhando o schema das migrations 072/073
// (workspace_id → company_id; leads → crm_leads; companies → crm_companies).
// Adicione campos conforme o port fiel precisar.

export type StageStatusKind = 'open' | 'won' | 'lost'
export type LeadStatus = 'new' | 'contacted' | 'proposal' | 'negotiation' | 'won' | 'lost'
export type LegacyActivityType = 'call' | 'email' | 'meeting' | 'note'

export type PipelineStage = {
  id: string
  pipeline_id: string
  name: string
  color: string
  order_index: number
  status_kind: StageStatusKind
  created_at?: string
  updated_at?: string
}

export type Pipeline = {
  id: string
  company_id?: string
  name: string
  created_at?: string
  updated_at?: string
}

export type Deal = {
  id: string
  /** Conta B2B (crm_companies) — no original era `company_id` do deal. */
  company_id?: string | null
  /** Tenant — no original `workspace_id`; aqui = companies.id do hub. */
  workspace_id?: string
  pipeline_id: string
  stage_id: string
  owner_id: string
  lead_id: string | null
  crm_company_id?: string | null
  title: string
  value: number | null
  status: string
  temperature: string | null
  product_name?: string | null
  lost_reason?: string | null
  expected_close_date: string | null
  due_date: string | null
  proposal_url?: string | null
  payment_url?: string | null
  scheduling_url?: string | null
  contract_url?: string | null
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  utm_content?: string | null
  acquisition_channel?: string | null
  landing_page_url?: string | null
  origin_page?: string | null
  stage_entered_at: string
  created_at: string
  updated_at: string
}

export type Lead = {
  id: string
  company_id?: string
  crm_company_id?: string | null
  owner_id: string
  name: string
  email: string | null
  phone: string | null
  whatsapp?: string | null
  instagram?: string | null
  google_business?: string | null
  website?: string | null
  company: string | null
  position?: string | null
  job_title?: string | null
  birthdate?: string | null
  status: string
  estimated_value?: number | null
  notes: string | null
  origin?: string | null
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  utm_term?: string | null
  utm_content?: string | null
  utm_track?: string | null
  created_at: string
  updated_at?: string
}

export type Contact = Lead

export type Company = {
  id: string
  company_id?: string
  name: string
  website: string | null
  cnpj: string | null
  city: string | null
  state: string | null
  category?: string | null
  segment: string | null
  employee_count?: string | null
  current_crm?: string | null
  faturamento_estimado?: string | null
  linkedin_url?: string | null
  notes: string | null
  created_at?: string
  updated_at?: string
}

export type PlaybookActivityType =
  | 'call' | 'email' | 'whatsapp' | 'instagram' | 'social'
  | 'meeting' | 'task' | 'proposal' | 'closure'

export type DealActivity = {
  id: string
  company_id?: string
  deal_id: string
  title: string
  activity_type: PlaybookActivityType
  action_label?: string | null
  icon_key?: string | null
  script?: string | null
  day_offset: number | null
  order_index: number
  scheduled_start_at: string | null
  scheduled_end_at?: string | null
  due_date: string | null
  completed_at: string | null
  completed_by?: string | null
  assigned_to?: string | null
  reminder_at?: string | null
  reminder_sent_at?: string | null
  priority: string
  is_custom?: boolean
  notes: string | null
  source_template_id?: string | null
  created_at: string
  updated_at?: string
}

export type DealHistory = {
  id: string
  deal_id: string
  event_type: string
  details: string | null
  old_value: string | null
  new_value: string | null
  user_name?: string | null
  created_at: string
}

export type CustomFieldEntity = 'deal' | 'contact' | 'company'

export type CustomFieldType =
  | 'text' | 'number' | 'monetary' | 'date' | 'datetime' | 'phone'
  | 'email' | 'url' | 'select' | 'multi_select' | 'textarea' | 'checkbox'

export type CustomFieldDefinition = {
  id: string
  company_id?: string
  entity_type: CustomFieldEntity
  label: string
  field_type: CustomFieldType
  options: string[] | null
  group_name: string
  placeholder?: string | null
  /** ponytail: sempre false — coluna não existe na migration 072; criar quando validação obrigatória importar. */
  is_required?: boolean
  sort_order: number
  is_active: boolean
  created_at?: string
}

export type CustomFieldValue = {
  field_id: string
  entity_id: string
  value: string | null
}

export type Playbook = {
  id: string
  company_id?: string
  name: string
  description: string | null
  created_at?: string
}

export type PlaybookActivity = {
  id: string
  playbook_id: string
  title: string
  activity_type: PlaybookActivityType
  day_offset: number
  order_index: number
  icon_key: string | null
  action_label: string | null
  script: string | null
  created_at: string
}

/** Timeline legada do lead (tabela `activities`, distinta de deal_activities). */
export type ActivityRow = {
  id: string
  company_id?: string
  lead_id: string
  author_id: string
  type: LegacyActivityType
  title: string
  description: string | null
  occurred_at: string
  created_at: string
}

/**
 * Shim do lookup `Database['public']['Tables'][...]['Row']` usado por alguns
 * componentes portados. Só as tabelas que o port fiel referencia.
 */
export type Database = {
  public: {
    Tables: {
      deals: { Row: Deal }
      crm_leads: { Row: Lead }
      pipelines: { Row: Pipeline }
      pipeline_stages: { Row: PipelineStage }
      deal_activities: { Row: DealActivity }
      deal_history: { Row: DealHistory }
      activities: { Row: ActivityRow }
    }
    Enums: {
      playbook_activity_type: PlaybookActivityType
      custom_field_entity: CustomFieldEntity
      custom_field_type: CustomFieldType
      lead_status: LeadStatus
      activity_type: LegacyActivityType
    }
  }
}
