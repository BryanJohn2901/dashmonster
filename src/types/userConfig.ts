// Shared types for the user configuration system (Painel de Controle)

export interface UserCategory {
  id: string;
  userId: string;
  slug: string;         // "pos" | "livros" | "ebooks" | "perpetuo" | "eventos" | custom-uuid
  name: string;
  type: "fixed" | "custom";
  emoji: string | null;
  position: number;
  isEnabled: boolean;
}

export interface UserAccountEntry {
  id: string;
  userId: string;
  categoryId: string;
  label: string;
  adAccountId: string;
  /** Subfiltro da categoria fixa (ex.: bm, tf). Categorias personalizadas: null. */
  internalFilter: string | null;
  campaigns: Array<{ id: string; name: string; status: string }>;
  selectedCampaignIds: string[]; // empty array = all campaigns
  isEnabled: boolean;
}

// Conjunto genérico de categorias que uma empresa PODE adotar (educação /
// infoproduto). Não é mais auto-aplicado: cada empresa define os próprios
// filtros em companyFilters. Mantido como default opcional/selecionável.
export const FIXED_CATEGORIES: ReadonlyArray<{
  slug: string;
  name: string;
  emoji: string;
  defaultPosition: number;
}> = [
  { slug: "pos",      name: "Pós-graduação", emoji: "🎓", defaultPosition: 0 },
  { slug: "livros",   name: "Livros",        emoji: "📚", defaultPosition: 1 },
  { slug: "ebooks",   name: "Ebooks",        emoji: "📱", defaultPosition: 2 },
  { slug: "perpetuo", name: "Perpétuo",      emoji: "♾️",  defaultPosition: 3 },
  { slug: "eventos",  name: "Eventos",       emoji: "🎫", defaultPosition: 4 },
];

// Filtros personalizados por empresa. Cada empresa monta a própria taxonomia.
export const MAX_CUSTOM_CATEGORIES = 10;

// ─── Template de filtros da EMPRESA ─────────────────────────────────────────
// Fonte única do que aparece como "filtro fixo" no Painel de Controle e nos
// wizards de conta: settings.companyFilters (Painel Admin / wizard de criar
// empresa). Empresa sem filtros configurados = taxonomia vazia (mostra o
// estado de "configure seus filtros"). Não há taxonomia embutida.

export interface CompanyFilterDef {
  id: string;
  name: string;
  subfilters: string[];
}

export function readCompanyFilterDefs(settings?: Record<string, unknown>): CompanyFilterDef[] {
  const raw = settings?.companyFilters;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f): f is CompanyFilterDef => !!f && typeof (f as CompanyFilterDef).id === "string")
    .map((f) => ({
      id: f.id,
      name: String(f.name ?? ""),
      subfilters: Array.isArray(f.subfilters) ? f.subfilters.map(String) : [],
    }));
}

export function companyTemplateCategories(
  settings?: Record<string, unknown>,
): ReadonlyArray<{ slug: string; name: string; emoji: string; defaultPosition: number }> {
  const filters = readCompanyFilterDefs(settings);
  if (filters.length > 0) {
    return filters.map((f, i) => ({ slug: f.id, name: f.name, emoji: "🏷️", defaultPosition: i }));
  }
  // Sem filtros configurados = taxonomia vazia. Nenhuma categoria embutida.
  return [];
}

/** Mantido por compatibilidade de assinatura — nunca há tenant legado no fork. */
export function isLegacyCompanyTaxonomy(_settings?: Record<string, unknown>): boolean {
  return false;
}
