import Papa from "papaparse";
import { CampaignData, CampaignRawRow, LeadRow } from "@/types/campaign";
import { calculateDerivedMetrics } from "@/utils/metrics";

type GenericCsvRow = Record<string, unknown>;
type GenericCsvMatrixRow = unknown[];

const REQUIRED_COLUMNS = {
  date: "Data",
  campaignName: "Nome da Campanha",
  investment: "Investimento (R$)",
  clicks: "Cliques",
  impressions: "Impressões",
  conversions: "Conversões",
  revenue: "Receita (R$)",
} as const;

const COLUMN_ALIASES: Record<keyof typeof REQUIRED_COLUMNS, string[]> = {
  date: ["data", "dia", "date"],
  campaignName: ["nomedacampanha", "campanha", "campaign", "campaignname"],
  investment: ["investimento", "investimentor", "valorinvestido", "custo"],
  clicks: ["cliques", "clicks", "click"],
  impressions: ["impressoes", "impressões", "impressions", "impression"],
  conversions: ["conversoes", "conversões", "conversions", "conversion"],
  revenue: ["receita", "receitar", "revenue", "faturamento"],
};

const LEADS_ALIASES = ["leads", "cadastros", "inscricoes", "inscricoes", "lead"];

const normalizeKey = (value: string): string => {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w]/g, "");
};

const findColumnValue = (
  row: GenericCsvRow,
  aliases: string[],
): string | number | undefined => {
  const normalizedAliases = aliases.map((alias) => normalizeKey(alias));

  for (const [key, value] of Object.entries(row)) {
    if (normalizedAliases.includes(normalizeKey(key))) {
      if (typeof value === "string" || typeof value === "number") {
        return value;
      }
      return undefined;
    }
  }

  return undefined;
};

const normalizeNumber = (value: string | number): number => {
  if (typeof value === "number") {
    return value;
  }

  const cleaned = value
    .toString()
    .replace(/\s/g, "")
    .replace("R$", "")
    .replace("$", "")
    .replace(/\./g, "")
    .replace(",", ".");

  const parsed = Number(cleaned);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const parseDate = (rawDate: string): string => {
  const value = rawDate.trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    const [day, month, year] = value.split("/");
    return `${year}-${month}-${day}`;
  }
  return value;
};

export const extractSheetId = (url: string): string | null => {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] ?? null;
};

export const buildGoogleSheetsCsvUrl = (sheetUrl: string): string => {
  const sheetId = extractSheetId(sheetUrl);
  if (!sheetId) {
    throw new Error("URL inválida: não foi possível extrair o ID da planilha.");
  }

  return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;
};

const validateColumns = (row: CampaignRawRow): void => {
  const missing: string[] = [];

  if (!row.Data) missing.push(REQUIRED_COLUMNS.date);
  if (!row["Nome da Campanha"]) missing.push(REQUIRED_COLUMNS.campaignName);
  if (typeof row["Investimento (R$)"] === "undefined") {
    missing.push(REQUIRED_COLUMNS.investment);
  }
  if (typeof row.Cliques === "undefined") missing.push(REQUIRED_COLUMNS.clicks);
  if (typeof row.Impressões === "undefined") {
    missing.push(REQUIRED_COLUMNS.impressions);
  }
  if (typeof row.Conversões === "undefined") {
    missing.push(REQUIRED_COLUMNS.conversions);
  }
  if (typeof row["Receita (R$)"] === "undefined") {
    missing.push(REQUIRED_COLUMNS.revenue);
  }

  if (missing.length > 0) {
    throw new Error(
      `Formato inválido. Colunas ausentes: ${missing.join(", ")}.`,
    );
  }
};

const toCampaignRawRow = (row: GenericCsvRow): CampaignRawRow => {
  return {
    Data: String(findColumnValue(row, COLUMN_ALIASES.date) ?? "").trim(),
    "Nome da Campanha": String(
      findColumnValue(row, COLUMN_ALIASES.campaignName) ?? "",
    ).trim(),
    "Investimento (R$)": findColumnValue(row, COLUMN_ALIASES.investment) ?? "",
    Cliques: findColumnValue(row, COLUMN_ALIASES.clicks) ?? "",
    Impressões: findColumnValue(row, COLUMN_ALIASES.impressions) ?? "",
    Conversões: findColumnValue(row, COLUMN_ALIASES.conversions) ?? "",
    "Receita (R$)": findColumnValue(row, COLUMN_ALIASES.revenue) ?? "",
  };
};

const monthMap: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
};

const normalizeMonthLabel = (value: string): string => {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

const parseCampaignRowsFromMonthlyCsv = (
  rows: GenericCsvMatrixRow[],
  fileName: string,
): CampaignData[] => {
  const startYearMatch = fileName.match(/(20\d{2})/);
  let currentYear = startYearMatch ? Number(startYearMatch[1]) : new Date().getFullYear();
  let currentMonth: number | null = null;
  let previousMonth: number | null = null;
  const parsedRows: CampaignData[] = [];

  rows.forEach((row, index) => {
    const firstCol = String(row[0] ?? "").trim();
    if (!firstCol) {
      return;
    }

    const normalizedFirstCol = normalizeMonthLabel(firstCol);
    const monthEntry = Object.entries(monthMap).find(([monthName]) =>
      normalizedFirstCol.includes(`mes de ${monthName}`),
    );

    if (monthEntry) {
      const nextMonth = monthEntry[1];
      if (previousMonth === 12 && nextMonth === 1) {
        currentYear += 1;
      }
      currentMonth = nextMonth;
      previousMonth = nextMonth;
      return;
    }

    if (
      normalizedFirstCol.startsWith("soma") ||
      normalizedFirstCol.startsWith("media") ||
      normalizedFirstCol.startsWith("meta")
    ) {
      return;
    }

    const investment = normalizeNumber(String(row[1] ?? ""));
    const impressions = normalizeNumber(String(row[3] ?? ""));
    const clicks = normalizeNumber(String(row[5] ?? ""));
    const conversions = normalizeNumber(String(row[11] ?? ""));
    const revenue = normalizeNumber(String(row[12] ?? ""));

    const hasMetrics =
      investment > 0 || impressions > 0 || clicks > 0 || conversions > 0 || revenue > 0;

    if (!hasMetrics) {
      return;
    }

    const month = currentMonth ?? 1;
    const date = `${currentYear}-${String(month).padStart(2, "0")}-01`;

    parsedRows.push(
      calculateDerivedMetrics(
        {
          date,
          campaignName: firstCol,
          investment,
          clicks,
          impressions,
          conversions,
          leads: 0,
          revenue,
        },
        index,
      ),
    );
  });

  if (parsedRows.length === 0) {
    throw new Error("Não encontramos linhas de campanhas válidas no CSV enviado.");
  }

  return parsedRows;
};

const parseCampaignRows = (rows: GenericCsvRow[]): CampaignData[] => {
  const normalizedRows = rows.map(toCampaignRawRow);
  const validRows = normalizedRows.filter(
    (row) => row["Nome da Campanha"] && row["Data"],
  );

  if (validRows.length === 0) {
    throw new Error("A planilha/arquivo está vazio ou não possui dados válidos.");
  }

  validateColumns(validRows[0]);

  return validRows.map((row, index) => {
    const leadsRaw = findColumnValue(row as unknown as GenericCsvRow, LEADS_ALIASES);
    const leads    = leadsRaw !== undefined ? normalizeNumber(leadsRaw as string | number) : 0;

    return calculateDerivedMetrics(
      {
        date: parseDate(row.Data),
        campaignName: row["Nome da Campanha"]?.toString().trim(),
        investment: normalizeNumber(row["Investimento (R$)"]),
        clicks: normalizeNumber(row.Cliques),
        impressions: normalizeNumber(row.Impressões),
        conversions: normalizeNumber(row.Conversões),
        leads,
        revenue: normalizeNumber(row["Receita (R$)"]),
      },
      index,
    );
  });
};

export const fetchCampaignSheetData = async (
  sheetUrl: string,
): Promise<CampaignData[]> => {
  const csvUrl = buildGoogleSheetsCsvUrl(sheetUrl);

  return new Promise((resolve, reject) => {
    Papa.parse<GenericCsvRow>(csvUrl, {
      header: true,
      download: true,
      delimiter: "",
      skipEmptyLines: true,
      complete: (results) => {
        try {
          if (results.errors.length > 0) {
            reject(new Error("Falha ao fazer parse do CSV da planilha."));
            return;
          }

          resolve(parseCampaignRows(results.data));
        } catch (error) {
          if (error instanceof Error) {
            reject(error);
            return;
          }
          reject(new Error("Erro inesperado no processamento da planilha."));
        }
      },
      error: () => {
        reject(
          new Error(
            "Não foi possível carregar a planilha. Verifique se ela está pública.",
          ),
        );
      },
    });
  });
};

// ─── Leads via planilha (aba Leads + quebra por origem) ───────────────────────
//
// Planilha de leads orgânicos/diversos: cada linha é um lead individual, já com
// a origem (canal) e o produto identificados por coluna. Reusa o mesmo motor de
// aliases/parse das campanhas.

const LEAD_ALIASES = {
  date:    ["data", "dia", "date", "datahora", "carimbodedatahora", "timestamp"],
  origem:  ["origem", "fonte", "canal", "source", "deonde", "lead"],
  produto: ["produto", "product", "curso", "oferta"],
  name:    ["nome", "name", "fullname", "nomecompleto", "contato"],
  email:   ["email", "e-mail", "mail"],
  phone:   ["telefone", "phone", "whatsapp", "celular", "fone", "tel"],
} as const;

const str = (v: string | number | undefined): string =>
  v === undefined || v === null ? "" : String(v).trim();

/** Chave estável p/ upsert idempotente — a planilha não tem id próprio. */
const buildLeadDedupeKey = (lead: Omit<LeadRow, "id" | "source">): string => {
  const ident = lead.email || lead.phone || lead.fullName || "";
  return [lead.createdTime, normalizeKey(lead.origem), normalizeKey(ident), normalizeKey(lead.produto ?? "")]
    .join("|");
};

const parseLeadRows = (rows: GenericCsvRow[]): LeadRow[] => {
  const out: LeadRow[] = [];

  rows.forEach((row) => {
    const fullName = str(findColumnValue(row, [...LEAD_ALIASES.name]));
    const email    = str(findColumnValue(row, [...LEAD_ALIASES.email]));
    const phone    = str(findColumnValue(row, [...LEAD_ALIASES.phone]));

    // Linha sem qualquer identificação não é um lead válido.
    if (!fullName && !email && !phone) return;

    const rawDate = str(findColumnValue(row, [...LEAD_ALIASES.date]));
    const createdTime = rawDate ? parseDate(rawDate.split(" ")[0]) : "";
    const origem  = str(findColumnValue(row, [...LEAD_ALIASES.origem])) || "Orgânico";
    const produto = str(findColumnValue(row, [...LEAD_ALIASES.produto])) || undefined;

    const base = {
      createdTime,
      fullName: fullName || null,
      email: email || null,
      phone: phone || null,
      origem,
      produto,
    };
    const dedupeKey = buildLeadDedupeKey(base);

    out.push({ id: dedupeKey, source: "sheet", ...base });
  });

  if (out.length === 0) {
    throw new Error("Nenhum lead válido na planilha (precisa de nome, email ou telefone).");
  }

  return out;
};

/** Busca leads de uma planilha Google Sheets pública (CSV gviz, ao vivo). */
export const fetchLeadsSheetData = async (sheetUrl: string): Promise<LeadRow[]> => {
  const csvUrl = buildGoogleSheetsCsvUrl(sheetUrl);

  return new Promise((resolve, reject) => {
    Papa.parse<GenericCsvRow>(csvUrl, {
      header: true,
      download: true,
      delimiter: "",
      skipEmptyLines: true,
      complete: (results) => {
        try {
          if (results.errors.length > 0) {
            reject(new Error("Falha ao fazer parse do CSV da planilha de leads."));
            return;
          }
          resolve(parseLeadRows(results.data));
        } catch (error) {
          reject(error instanceof Error ? error : new Error("Erro ao processar a planilha de leads."));
        }
      },
      error: () => {
        reject(new Error("Não foi possível carregar a planilha de leads. Verifique se ela está pública."));
      },
    });
  });
};

/** Chave de dedupe exposta p/ persistência (mesmo cálculo do parser). */
export const leadDedupeKey = buildLeadDedupeKey;

export const parseCampaignCsvFile = async (file: File): Promise<CampaignData[]> => {
  return new Promise((resolve, reject) => {
    Papa.parse<GenericCsvRow>(file, {
      header: true,
      delimiter: "",
      skipEmptyLines: true,
      complete: (results) => {
        try {
          if (results.errors.length === 0) {
            try {
              const parsed = parseCampaignRows(results.data);
              if (parsed.length > 0) {
                resolve(parsed);
                return;
              }
            } catch {
              // fallback para CSV em formato mensal (multilinha de cabeçalho)
            }
          }

          Papa.parse<GenericCsvMatrixRow>(file, {
            header: false,
            delimiter: "",
            skipEmptyLines: true,
            complete: (fallbackResults) => {
              try {
                if (fallbackResults.errors.length > 0) {
                  reject(new Error("Falha ao processar o arquivo CSV enviado."));
                  return;
                }
                resolve(parseCampaignRowsFromMonthlyCsv(fallbackResults.data, file.name));
              } catch (fallbackError) {
                if (fallbackError instanceof Error) {
                  reject(fallbackError);
                  return;
                }
                reject(new Error("Erro inesperado no processamento do arquivo CSV."));
              }
            },
            error: () => {
              reject(new Error("Não foi possível ler o arquivo CSV."));
            },
          });
        } catch (error) {
          if (error instanceof Error) {
            reject(error);
            return;
          }
          reject(new Error("Erro inesperado no processamento do arquivo CSV."));
        }
      },
      error: () => {
        reject(new Error("Não foi possível ler o arquivo CSV."));
      },
    });
  });
};
