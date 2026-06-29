import {
  detectRowResultValue, computeCustomResult, autoDetectResultType,
  resolveGoalResultValue, resolveRowResult,
} from "@/lib/resultDetection";
import type { MetaInsight } from "@/lib/metaTransform";

function insight(
  actions: { action_type: string; value: string }[],
  extra: Partial<MetaInsight> = {},
): MetaInsight {
  return {
    campaign_name: "c", campaign_id: "1",
    impressions: "0", reach: "0", clicks: "0", inline_link_clicks: "0",
    spend: "0", cpm: "0", ctr: "0", date_start: "2026-06-01", date_stop: "2026-06-25",
    actions,
    ...extra,
  };
}

describe("detectRowResultValue — auto-detecção do resultado real", () => {
  it("evento custom (EndForm) ganha do lead genérico que a Meta dispara sozinha", () => {
    const d = insight([
      { action_type: "offsite_conversion.fb_pixel_lead", value: "3" },
      { action_type: "lead", value: "3" },
      { action_type: "offsite_conversion.fb_pixel_custom.EndForm", value: "28" },
    ]);
    expect(detectRowResultValue(d)).toBe(28);
  });

  it("AGREGADO de custom sem sufixo (offsite_conversion.fb_pixel_custom) — caso real Meta", () => {
    // Foi exatamente o que a Meta devolveu na conta do usuário: a chave vem SEM
    // ".EndForm" no final. O dash precisa detectar mesmo assim.
    const d = insight([
      { action_type: "lead", value: "3" },
      { action_type: "offsite_conversion.fb_pixel_lead", value: "3" },
      { action_type: "onsite_web_lead", value: "3" },
      { action_type: "link_click", value: "303" },
      { action_type: "post_engagement", value: "846" },
      { action_type: "offsite_conversion.fb_pixel_custom", value: "28" },
    ]);
    expect(detectRowResultValue(d)).toBe(28);
  });

  it("conversão personalizada (offsite_conversion.custom.<id>) também é detectada", () => {
    const d = insight([
      { action_type: "lead", value: "5" },
      { action_type: "offsite_conversion.custom.123456789", value: "40" },
    ]);
    expect(detectRowResultValue(d)).toBe(40);
  });

  it("compra real SEMPRE ganha de evento custom (receita é prioridade)", () => {
    const d = insight([
      { action_type: "offsite_conversion.fb_pixel_custom.ViewForm", value: "500" },
      { action_type: "offsite_conversion.fb_pixel_purchase", value: "10" },
    ]);
    expect(detectRowResultValue(d)).toBe(10);
  });

  it("entre vários eventos custom, pega o de maior valor (o principal da campanha)", () => {
    const d = insight([
      { action_type: "offsite_conversion.fb_pixel_custom.PageView", value: "1000" },
      { action_type: "offsite_conversion.fb_pixel_custom.EndForm", value: "28" },
    ]);
    expect(detectRowResultValue(d)).toBe(1000);
  });

  it("sem evento custom, cai pro lead padrão", () => {
    const d = insight([
      { action_type: "offsite_conversion.fb_pixel_lead", value: "50" },
    ]);
    expect(detectRowResultValue(d)).toBe(50);
  });

  it("campanha de seguidores: soma follow + page_fan_adds", () => {
    const d = insight([
      { action_type: "follow", value: "12" },
      { action_type: "page_fan_adds", value: "8" },
    ]);
    expect(detectRowResultValue(d)).toBe(20);
  });

  it("sem nenhuma ação relevante → 0", () => {
    const d = insight([{ action_type: "post_engagement", value: "999" }]);
    expect(detectRowResultValue(d)).toBe(0);
  });
});

describe("computeCustomResult — valor do tipo configurado, com fallback auto", () => {
  const leadCampaign = insight([
    { action_type: "lead", value: "3" },
    { action_type: "offsite_conversion.fb_pixel_lead", value: "3" },
    { action_type: "offsite_conversion.fb_pixel_custom.EndForm", value: "28" },
  ]);

  it("tipo configurado existente nas actions → usa o valor direto (Conversões pixel = 3)", () => {
    expect(computeCustomResult(leadCampaign, "lead")).toBe(3);
  });

  it("tipo configurado ausente → fallback PADRÃO (sem custom) = lead 3, não o EndForm", () => {
    // leadgen_grouped não está nas actions → cai pro detect padrão (pixel lead = 3).
    // O EndForm (28) é o "Resultado real", NÃO a "Conversão pixel".
    expect(computeCustomResult(leadCampaign, "leadgen_grouped")).toBe(3);
  });

  it("sem tipo configurado → detect padrão (Conversões pixel = 3, sem custom)", () => {
    expect(computeCustomResult(leadCampaign, undefined)).toBe(3);
  });

  it("cenário do usuário: Resultados(auto+custom)=28 ≠ Conversões pixel(padrão)=3", () => {
    // É exatamente o que separa o KPI 'Resultados' (28) do 'Conversões (pixel)' (3).
    expect(detectRowResultValue(leadCampaign)).toBe(28);       // KPI Resultados
    expect(computeCustomResult(leadCampaign, undefined)).toBe(3); // KPI Conversões (pixel)
  });
});

describe("autoDetectResultType — tipo dominante para labels", () => {
  it("detecta lead quando é o tipo padrão presente", () => {
    const data = [insight([{ action_type: "lead", value: "10" }])];
    expect(autoDetectResultType(data)).toBe("lead");
  });
});

describe("resolveGoalResultValue — objetivo REAL da campanha (Meta)", () => {
  it("OFFSITE_CONVERSIONS + custom OTHER (EndForm) → conta o evento custom", () => {
    const d = insight([
      { action_type: "lead", value: "3" },
      { action_type: "offsite_conversion.fb_pixel_custom", value: "28" },
    ]);
    const goal = { optimizationGoal: "OFFSITE_CONVERSIONS", customEventType: "OTHER", customEventStr: "EndForm" };
    expect(resolveGoalResultValue(d, goal)).toBe(28);
  });

  it("OFFSITE_CONVERSIONS + PURCHASE → conta compra mesmo com leads presentes", () => {
    const d = insight([
      { action_type: "lead", value: "40" },
      { action_type: "offsite_conversion.fb_pixel_purchase", value: "5" },
    ]);
    const goal = { optimizationGoal: "OFFSITE_CONVERSIONS", customEventType: "PURCHASE" };
    expect(resolveGoalResultValue(d, goal)).toBe(5);
  });

  it("LEAD_GENERATION → conta leadgen (instant forms)", () => {
    const d = insight([{ action_type: "leadgen_grouped", value: "17" }]);
    expect(resolveGoalResultValue(d, { optimizationGoal: "LEAD_GENERATION" })).toBe(17);
  });

  it("LINK_CLICKS → usa inline_link_clicks", () => {
    const d = insight([], { inline_link_clicks: "303" });
    expect(resolveGoalResultValue(d, { optimizationGoal: "LINK_CLICKS" })).toBe(303);
  });

  it("REACH → usa reach", () => {
    const d = insight([], { reach: "9000" });
    expect(resolveGoalResultValue(d, { optimizationGoal: "REACH" })).toBe(9000);
  });

  it("objetivo desconhecido → null (chamador auto-detecta)", () => {
    const d = insight([{ action_type: "lead", value: "3" }]);
    expect(resolveGoalResultValue(d, { optimizationGoal: "WEIRD_GOAL_X" })).toBeNull();
    expect(resolveGoalResultValue(d, undefined)).toBeNull();
  });
});

describe("resolveRowResult — orquestra config > objetivo Meta > auto-detect", () => {
  const leadCampaignEndForm = insight([
    { action_type: "lead", value: "3" },
    { action_type: "offsite_conversion.fb_pixel_lead", value: "3" },
    { action_type: "offsite_conversion.fb_pixel_custom", value: "28" },
  ]);
  const endFormGoal = { optimizationGoal: "OFFSITE_CONVERSIONS", customEventType: "OTHER", customEventStr: "EndForm" };

  it("cenário do usuário: objetivo Meta (EndForm) manda → 28", () => {
    expect(resolveRowResult(leadCampaignEndForm, { goal: endFormGoal })).toBe(28);
  });

  it("resultType configurado pelo usuário tem prioridade sobre o objetivo Meta", () => {
    // Usuário forçou 'lead' → respeita a config dele (3), ignora o objetivo (28).
    expect(resolveRowResult(leadCampaignEndForm, { resultType: "lead", goal: endFormGoal })).toBe(3);
  });

  it("sem objetivo e sem config → cai no auto-detect (28)", () => {
    expect(resolveRowResult(leadCampaignEndForm, {})).toBe(28);
  });
});
