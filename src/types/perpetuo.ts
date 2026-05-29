// Types matching real Apps Script response schema

export interface ProdutoMetas {
  orcamento: number | null;
  meta_leads: number | null;
  meta_vendas: number | null;
}

export interface ProdutoResumoCampanha {
  investimento: {
    total: number | null;
    google_ads: number | null;
    meta_ads: number | null;
  };
  custo_por_lead: {
    geral: number | null;
    meta_ads: number | null;
    google_ads: number | null;
  };
  leads: {
    total: number | null;
    pagos: number | null;
    meta_ads: number | null;
    google_ads: number | null;
    organico: number | null;
  };
  funil: {
    impressoes: number | null;
    click_no_link: number | null;
    visualizacao_pagina: number | null;
    leads_pagos: number | null;
    vendas: number | null;
  };
  taxas: {
    ctr: number | null;
    connect_rate: number | null;
    taxa_captura: number | null;
    taxa_conversao: number | null;
  };
}

// Cenário values are emoji-prefixed formatted strings from the sheet
export type CenarioRow = string | null;

export interface ProdutoCenarios {
  metas: {
    investimento: CenarioRow;
    custo_por_lead: CenarioRow;
    leads: CenarioRow;
    taxa_captura: CenarioRow;
    vendas: CenarioRow;
    taxa_conversao: CenarioRow;
  };
  atual: {
    investimento: CenarioRow;
    custo_por_lead: CenarioRow;
    leads: CenarioRow;
    taxa_captura: CenarioRow;
    vendas: CenarioRow;
    taxa_conversao: CenarioRow;
  };
  futuro: {
    investimento: CenarioRow;
    custo_por_lead: CenarioRow;
    leads: CenarioRow;
    taxa_captura: CenarioRow;
    vendas: CenarioRow;
    taxa_conversao: CenarioRow;
  };
  ideal: {
    investimento: CenarioRow;
    custo_por_lead: CenarioRow;
    leads: CenarioRow;
    taxa_captura: CenarioRow;
    vendas: CenarioRow;
    taxa_conversao: CenarioRow;
  };
  resultado_futuro: {
    investimento: CenarioRow;
    custo_por_lead: CenarioRow;
    leads: CenarioRow;
    taxa_captura: CenarioRow;
    vendas: CenarioRow;
    taxa_conversao: CenarioRow;
  };
}

export interface ProdutoData {
  metas: ProdutoMetas;
  resumo_campanha: ProdutoResumoCampanha;
  cenarios: ProdutoCenarios;
  dados_diarios: unknown[];
}

// Keys returned by Apps Script
export type ProdutoKey = "bm" | "bb" | "sm" | "mpa" | "fe" | "tf";

export type PerpetualDashboardData = Record<ProdutoKey, ProdutoData>;

// Shape of the full Apps Script response (with status wrapper)
export interface AppsScriptResponse {
  status: string;
  timestamp: string;
  data: PerpetualDashboardData;
}
