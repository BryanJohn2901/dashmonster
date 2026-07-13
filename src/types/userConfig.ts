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

// The 5 built-in fixed categories — always present, cannot be deleted
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

// Filtros personalizados por empresa, além dos 5 padrão. Folga para empresas
// com taxonomias diferentes da PTA (cada empresa monta os seus).
export const MAX_CUSTOM_CATEGORIES = 10;

// ─── Template de filtros da EMPRESA ─────────────────────────────────────────
// Fonte única do que aparece como "filtro fixo" no Painel de Controle e nos
// wizards de conta: 1) settings.companyFilters (Painel Admin / wizard de criar
// empresa); 2) empresa nova sem filtros (blankTaxonomy) → NADA de PTA;
// 3) empresas legadas (sem flag) → os 5 fixos PTA de sempre.

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
  if (settings?.blankTaxonomy) return [];
  return FIXED_CATEGORIES;
}

/** true = empresa legada sem config própria — herda taxonomia e templates PTA. */
export function isLegacyCompanyTaxonomy(settings?: Record<string, unknown>): boolean {
  return readCompanyFilterDefs(settings).length === 0 && !settings?.blankTaxonomy;
}
