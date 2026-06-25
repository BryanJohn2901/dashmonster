// ─── Auto-detecção do "Resultado" de uma campanha/linha de insight ────────────
// Lógica pura (sem React/Supabase) — usada pelo Perfil de Anunciantes e testável
// de forma isolada. O objetivo: descobrir SOZINHO qual é o resultado real de uma
// campanha (compra, lead, EndForm, seguidor…), sem o usuário precisar configurar.

import { parseMetaNum, type MetaInsight } from "@/lib/metaTransform";
import type { ResultType } from "@/hooks/useAdvertiserStore"; // type-only: não puxa runtime

export function getActionValue(actions: MetaInsight["actions"], type: string): number {
  return Number(actions?.find((a) => a.action_type === type)?.value ?? 0);
}

// Ordem de prioridade para detectar o tipo de resultado dominante a partir das actions.
export const AUTO_DETECT_PRIORITY: ResultType[] = [
  "offsite_conversion.fb_pixel_purchase",
  "purchase",
  "offsite_conversion.fb_pixel_lead",
  "onsite_conversion.lead_grouped",
  "leadgen_grouped",
  "lead",
  "omni_complete_registration",
  "submit_application",
  "schedule",
  "contact",
  "follow",
  "view_content",
  "profile_visit",
];

// Detecta o tipo de resultado dominante no conjunto de insights (para labels/config).
export function autoDetectResultType(data: MetaInsight[]): ResultType | undefined {
  const totals: Partial<Record<ResultType, number>> = {};
  for (const insight of data) {
    for (const type of AUTO_DETECT_PRIORITY) {
      const val = getActionValue(insight.actions, type);
      if (val > 0) totals[type] = (totals[type] ?? 0) + val;
    }
  }
  for (const type of AUTO_DETECT_PRIORITY) {
    if ((totals[type] ?? 0) > 0) return type;
  }
  return undefined;
}

/**
 * Resultado REAL de UMA linha (campanha/conjunto), auto-detectado.
 * Prioridade:
 *   1º) Compras reais (receita) — sempre o resultado mais importante.
 *   2º) Eventos custom de pixel (fbq trackCustom / conversões personalizadas) —
 *       ex: EndForm, ScheduleCall. O anunciante os configura DE PROPÓSITO como meta
 *       da campanha; representam o resultado real e ganham dos eventos genéricos que
 *       a Meta dispara sozinha (fb_pixel_lead). Pega o de MAIOR valor (o principal).
 *   3º) Leads e demais tipos padrão (forms, follows, visitas ao perfil…).
 * `follow` soma follow + page_fan_adds.
 */
export function detectRowResultValue(d: MetaInsight): number {
  // 1º) Compras reais.
  for (const type of ["offsite_conversion.fb_pixel_purchase", "purchase"] as ResultType[]) {
    const v = getActionValue(d.actions, type);
    if (v > 0) return v;
  }
  // 2º) Eventos custom de pixel — pega o de maior valor.
  // A Meta reporta tanto o AGREGADO ("offsite_conversion.fb_pixel_custom", sem
  // sufixo) quanto, às vezes, por evento ("...fb_pixel_custom.EndForm"). Sem exigir
  // ponto final, pegamos o agregado (total real) ou o evento, o que tiver maior valor.
  if (d.actions) {
    let best = 0;
    for (const a of d.actions) {
      if (
        a.action_type.startsWith("offsite_conversion.custom") ||
        a.action_type.startsWith("offsite_conversion.fb_pixel_custom")
      ) {
        const v = Number(a.value) || 0;
        if (v > best) best = v;
      }
    }
    if (best > 0) return best;
  }
  // 3º) Leads e demais tipos padrão.
  const LOW_PRIORITY: ResultType[] = [
    "offsite_conversion.fb_pixel_lead",
    "onsite_conversion.lead_grouped",
    "leadgen_grouped",
    "lead",
    "omni_complete_registration",
    "submit_application",
    "schedule",
    "contact",
    "follow",
    "view_content",
    "profile_visit",
  ];
  for (const type of LOW_PRIORITY) {
    const v = type === "follow"
      ? getActionValue(d.actions, "follow") + getActionValue(d.actions, "page_fan_adds")
      : getActionValue(d.actions, type);
    if (v > 0) return v;
  }
  return 0;
}

/**
 * Resultado PADRÃO de uma linha (só tipos nativos da Meta — purchase, lead, follow…),
 * SEM considerar eventos custom. Usado pelo KPI "Conversões (pixel)" / funil, que
 * representam a conversão nativa do pixel, distinta do resultado real (EndForm etc.).
 */
export function detectStandardResultValue(d: MetaInsight): number {
  for (const type of AUTO_DETECT_PRIORITY) {
    const v = type === "follow"
      ? getActionValue(d.actions, "follow") + getActionValue(d.actions, "page_fan_adds")
      : getActionValue(d.actions, type);
    if (v > 0) return v;
  }
  return 0;
}

/**
 * Valor do resultType CONFIGURADO de uma linha (lead, purchase, link_click…).
 * Quando nenhum tipo é configurado, ou o tipo configurado não tem valor nas actions,
 * cai pro auto-detect PADRÃO (sem eventos custom) — preserva o comportamento de
 * "Conversões (pixel)". O resultado real com custom fica no detectRowResultValue.
 */
export function computeCustomResult(d: MetaInsight, resultType: string | undefined): number {
  if (!resultType) return detectStandardResultValue(d);
  if (resultType === "link_click") {
    return d.inline_link_clicks != null ? parseMetaNum(d.inline_link_clicks) : parseMetaNum(d.clicks);
  }
  if (resultType === "follow") {
    return getActionValue(d.actions, "follow") + getActionValue(d.actions, "page_fan_adds");
  }
  const direct = getActionValue(d.actions, resultType);
  if (direct > 0) return direct;
  return detectStandardResultValue(d);
}

// ─── Resultado pelo OBJETIVO REAL da campanha (Meta optimization_goal) ─────────
// Fonte da verdade: o que a campanha foi configurada pra otimizar. É exatamente o
// que a Meta usa na coluna "Resultados" dela. Vem de optimization_goal (conjunto)
// + promoted_object (custom_event_type / custom_event_str).

export interface CampaignGoal {
  optimizationGoal?: string;  // OFFSITE_CONVERSIONS | LEAD_GENERATION | LINK_CLICKS | ...
  customEventType?: string;   // PURCHASE | LEAD | COMPLETE_REGISTRATION | OTHER | ...
  customEventStr?: string;    // nome do evento custom quando customEventType = OTHER
}

// custom_event_type (promoted_object) → action_types candidatos, em ordem.
function actionTypesForCustomEvent(t: string | undefined, str: string | undefined): string[] {
  switch (t) {
    case "PURCHASE":              return ["offsite_conversion.fb_pixel_purchase", "purchase", "omni_purchase"];
    case "LEAD":                  return ["offsite_conversion.fb_pixel_lead", "onsite_conversion.lead_grouped", "leadgen_grouped", "lead"];
    case "COMPLETE_REGISTRATION": return ["offsite_conversion.fb_pixel_complete_registration", "complete_registration", "omni_complete_registration"];
    case "CONTENT_VIEW":          return ["offsite_conversion.fb_pixel_view_content", "view_content", "omni_view_content"];
    case "ADD_TO_CART":           return ["offsite_conversion.fb_pixel_add_to_cart", "add_to_cart", "omni_add_to_cart"];
    case "INITIATED_CHECKOUT":    return ["offsite_conversion.fb_pixel_initiate_checkout", "initiate_checkout", "omni_initiated_checkout"];
    case "ADD_PAYMENT_INFO":      return ["offsite_conversion.fb_pixel_add_payment_info", "add_payment_info"];
    case "SEARCH":                return ["offsite_conversion.fb_pixel_search", "search"];
    case "SUBSCRIBE":             return ["offsite_conversion.fb_pixel_subscribe", "subscribe"];
    case "START_TRIAL":           return ["offsite_conversion.fb_pixel_start_trial", "start_trial"];
    case "CONTACT":               return ["offsite_conversion.fb_pixel_contact", "contact"];
    case "SCHEDULE":              return ["offsite_conversion.fb_pixel_schedule", "schedule"];
    case "SUBMIT_APPLICATION":    return ["offsite_conversion.fb_pixel_submit_application", "submit_application"];
    case "DONATE":                return ["offsite_conversion.fb_pixel_donate", "donate"];
    case "OTHER":
    default: {
      // Evento custom (fbq trackCustom). Tenta a chave exata pelo nome, depois o agregado.
      const exact = str ? [`offsite_conversion.fb_pixel_custom.${str}`, `offsite_conversion.custom.${str}`] : [];
      return [...exact, "offsite_conversion.fb_pixel_custom", "offsite_conversion.custom"];
    }
  }
}

// Pega o 1º action_type da lista que tiver valor > 0 (some leads quando aplicável).
function firstActionValue(d: MetaInsight, types: string[]): number {
  for (const t of types) {
    const v = getActionValue(d.actions, t);
    if (v > 0) return v;
  }
  // Para o agregado de custom sem sufixo, varre prefixo (caso o nome exato não exista).
  if (types.some((t) => t.includes("fb_pixel_custom") || t.includes(".custom"))) {
    let best = 0;
    for (const a of (d.actions ?? [])) {
      if (a.action_type.startsWith("offsite_conversion.custom") || a.action_type.startsWith("offsite_conversion.fb_pixel_custom")) {
        const v = Number(a.value) || 0;
        if (v > best) best = v;
      }
    }
    if (best > 0) return best;
  }
  return 0;
}

/**
 * Valor do resultado de UMA linha conforme o OBJETIVO da campanha.
 * Retorna `null` quando o objetivo é desconhecido/não-mapeável (o chamador então
 * cai pro auto-detect). Cobre os objetivos comuns; o resto degrada com segurança.
 */
export function resolveGoalResultValue(d: MetaInsight, goal: CampaignGoal | undefined): number | null {
  const g = goal?.optimizationGoal;
  if (!g) return null;
  switch (g) {
    case "OFFSITE_CONVERSIONS":
    case "CONVERSIONS":
    case "OFFLINE_CONVERSIONS":
      return firstActionValue(d, actionTypesForCustomEvent(goal!.customEventType, goal!.customEventStr));
    case "LEAD_GENERATION":
    case "QUALITY_LEAD":
      return firstActionValue(d, ["leadgen_grouped", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead", "lead"]);
    case "QUALITY_CALL":
      return firstActionValue(d, ["lead", "onsite_conversion.lead_grouped"]);
    case "LINK_CLICKS":
      return d.inline_link_clicks != null ? parseMetaNum(d.inline_link_clicks) : parseMetaNum(d.clicks);
    case "LANDING_PAGE_VIEWS":
      return firstActionValue(d, ["landing_page_view", "omni_landing_page_view"]);
    case "POST_ENGAGEMENT":
      return firstActionValue(d, ["post_engagement", "page_engagement"]);
    case "PAGE_LIKES":
      return firstActionValue(d, ["like", "page_fan_adds", "follow"]);
    case "THRUPLAY":
      return firstActionValue(d, ["video_thruplay_watched", "video_view"]);
    case "VIDEO_VIEWS":
      return firstActionValue(d, ["video_view"]);
    case "REACH":
      return parseMetaNum(d.reach);
    case "IMPRESSIONS":
      return parseMetaNum(d.impressions);
    case "PROFILE_VISIT":
    case "VISIT_INSTAGRAM_PROFILE":
      return firstActionValue(d, ["profile_visit", "onsite_conversion.profile_visit"]);
    case "CONVERSATIONS":
    case "REPLIES":
      return firstActionValue(d, ["onsite_conversion.messaging_conversation_started_7d", "onsite_conversion.total_messaging_connection"]);
    case "APP_INSTALLS":
      return firstActionValue(d, ["mobile_app_install", "omni_app_install"]);
    case "VALUE":
    case "MAXIMIZE_VALUE":
      return firstActionValue(d, ["offsite_conversion.fb_pixel_purchase", "purchase", "omni_purchase"]);
    default:
      return null; // objetivo desconhecido → deixa o chamador auto-detectar
  }
}

/**
 * Label curto do evento que representa o "Resultado" de uma campanha,
 * derivado do objetivo real (optimization_goal + promoted_object).
 * Usado para exibir "Resultados (EndForm)" nos KPIs e no funil.
 * Retorna undefined quando o objetivo é desconhecido ou não-mapeável.
 */
export function goalToEventLabel(goal: CampaignGoal | undefined): string | undefined {
  const g = goal?.optimizationGoal;
  if (!g) return undefined;
  const CUSTOM_EVENT_MAP: Record<string, string> = {
    PURCHASE: "Compra", LEAD: "Lead (pixel)", COMPLETE_REGISTRATION: "Cadastro",
    CONTENT_VIEW: "Vis. Conteúdo", ADD_TO_CART: "Carrinho", INITIATED_CHECKOUT: "Checkout",
    ADD_PAYMENT_INFO: "Info. pagamento", SEARCH: "Busca", SUBSCRIBE: "Assinatura",
    START_TRIAL: "Trial", CONTACT: "Contato", SCHEDULE: "Agendamento",
    SUBMIT_APPLICATION: "Formulário", DONATE: "Doação",
  };
  switch (g) {
    case "OFFSITE_CONVERSIONS":
    case "CONVERSIONS":
    case "OFFLINE_CONVERSIONS": {
      const ct = goal!.customEventType;
      if (!ct || ct === "OTHER") return goal!.customEventStr ?? undefined;
      return CUSTOM_EVENT_MAP[ct] ?? ct.toLowerCase();
    }
    case "LEAD_GENERATION":
    case "QUALITY_LEAD":       return "Lead (formulário)";
    case "QUALITY_CALL":       return "Lead (ligação)";
    case "LINK_CLICKS":        return "Clique no link";
    case "LANDING_PAGE_VIEWS": return "Vis. de página";
    case "POST_ENGAGEMENT":    return "Engajamento";
    case "PAGE_LIKES":         return "Curtida";
    case "THRUPLAY":
    case "VIDEO_VIEWS":        return "Visualização de vídeo";
    case "APP_INSTALLS":       return "Instalação de app";
    case "CONVERSATIONS":
    case "REPLIES":            return "Conversa";
    case "PROFILE_VISIT":
    case "VISIT_INSTAGRAM_PROFILE": return "Visita ao perfil";
    case "REACH":              return "Pessoas alcançadas";
    case "VALUE":
    case "MAXIMIZE_VALUE":     return "Compra";
    default:                   return undefined;
  }
}

/**
 * Resultado REAL de uma linha, com a melhor fonte disponível:
 *   1º) resultType configurado manualmente (override do usuário, quando houver);
 *   2º) objetivo da campanha vindo da Meta (optimization_goal/promoted_object);
 *   3º) auto-detect por prioridade (compra > custom > lead…) como último recurso.
 */
export function resolveRowResult(
  d: MetaInsight,
  opts: { resultType?: string; goal?: CampaignGoal },
): number {
  if (opts.resultType) return computeCustomResult(d, opts.resultType);
  const byGoal = resolveGoalResultValue(d, opts.goal);
  if (byGoal !== null) return byGoal;
  return detectRowResultValue(d);
}
