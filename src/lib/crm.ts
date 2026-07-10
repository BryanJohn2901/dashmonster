// ─── PipeFlow CRM — fachada da camada de dados ───────────────────────────────
// Com Supabase configurado → crmSupabase.ts (real, RLS por empresa).
// Sem Supabase (preview/DEV) → crmDemo.ts (em memória, mesmo padrão das
// empresas demo do useCompany). A UI importa sempre daqui.

import { supabaseClient } from "@/lib/supabase";
import * as real from "@/lib/crmSupabase";
import * as demo from "@/lib/crmDemo";

// `typeof real` força o demo a manter exatamente as mesmas assinaturas
// (sem cast: se o demo divergir, o tsc acusa aqui).
const impl: typeof real = supabaseClient ? real : demo;

export type {
  CrmStageStatusKind, CrmDealStatus, CrmStage, CrmPipeline, CrmDeal, CrmTag,
  SavePipelineStageInput, SavePipelineInput, CrmStats, CrmDealDetail,
  CrmLeadStatus, CrmLead, CrmActivityKind, CrmActivity, CrmHistoryEvent,
  CrmCompany, CrmStageTemplate, CrmCalendarItem,
  CrmChannel, CrmChannelProvider, CrmConversation, CrmConversationStatus, CrmMessage, CrmNotification,
  CrmFieldEntity, CrmFieldType, CrmFieldDef, CrmGoal, CrmGoalEntry, CrmApiToken, CrmWebhook,
  GlobalSearchResult, CrmPlaybook, CrmPlaybookActivity, CrmCompanyHistoryEvent,
  CrmLegacyActivity, CrmLegacyActivityType, CrmInboundWebhook,
} from "@/lib/crmSupabase";

export { CRM_WEBHOOK_EVENTS } from "@/lib/crmSupabase";

export const {
  // pipelines
  fetchPipelines, ensureDefaultPipeline, createPipeline, updatePipeline, deletePipeline,
  // deals
  fetchDeals, createDeal, moveDeal, deleteDeal, fetchDealDetail, updateDeal,
  // contatos
  fetchLead, searchLeads, createLead, updateLead, fetchLeads, deleteLead, createDealFromLead,
  fetchLeadActivities, createLeadActivity,
  // atividades
  fetchDealActivities, createDealActivity, setActivityDone, deleteDealActivity,
  updateDealActivity, clearDealActivities, fetchPlaybooks, applyPlaybookToDeal,
  createPlaybook, deletePlaybook, addPlaybookActivity, updatePlaybookActivity, deletePlaybookActivity,
  fetchCompanyDealActivities,
  // histórico, tags e métricas
  fetchDealHistory, fetchCompanyDealHistory, fetchTags, createTag, fetchDealTags, addDealTag, removeDealTag, fetchCrmStats,
  // empresas B2B, notas, playbooks e calendário
  fetchCrmCompany, searchCrmCompanies, createCrmCompany, updateCrmCompany, linkDealCrmCompany,
  addDealNote, fetchStageTemplates, saveStageTemplates, instantiateStagePlaybook, fetchCalendar,
  // inbox e notificações
  fetchChannels, fetchConversations, fetchMessages, sendMessage, markConversationRead, setConversationStatus, linkConversationLead,
  fetchNotifications, markNotificationRead, markAllNotificationsRead,
  // campos personalizados, gestão de tags e metas
  fetchFieldDefs, saveFieldDef, deleteFieldDef, fetchFieldValues, setFieldValue,
  updateTag, deleteTag, fetchGoal, saveGoal, fetchGoals,
  // busca global, duplicados, API pública e webhooks
  globalSearch, findDuplicateDeals, findDuplicateLeads,
  fetchApiTokens, createApiToken, revokeApiToken,
  fetchWebhooks, createWebhook, setWebhookActive, deleteWebhook,
  fetchInboundWebhooks, createInboundWebhook, updateInboundWebhook, deleteInboundWebhook, regenerateInboundWebhookKey,
} = impl;
