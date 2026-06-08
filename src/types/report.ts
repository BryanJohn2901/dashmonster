// Modelo de dados único do relatório exportável.
// O ReportTemplate é renderizado a partir disto — a prévia e o arquivo são o
// MESMO elemento React, então o que se vê é exatamente o que se baixa.

export type ReportAccent = "brand" | "green" | "rose" | "amber" | "sky" | "slate";

export interface ReportItem {
  id: string;
  label: string;
  value: string;
  sub?: string;
  accent?: ReportAccent;
}

export interface ReportGroup {
  id: string;
  label: string;
  items: ReportItem[];
}

export interface ReportFunnelStep {
  id: string;
  label: string;
  value: string;
  color: string;      // hex da barra
  rateLabel?: string; // taxa entre a etapa anterior e esta
  rateValue?: string;
}

export interface ReportFunnel {
  steps: ReportFunnelStep[];
  footer: { label: string; value: string }[];
}

export interface ReportData {
  title: string;
  period: string;
  groups: ReportGroup[];
  funnel?: ReportFunnel;
}
