/**
 * Filtros internos por categoria fixa — usados no Painel de Controle ao vincular contas Meta.
 * Slugs alinhados a `FIXED_CATEGORIES` (pos, livros, ebooks, perpetuo, eventos).
 */

export interface CategoryInternalFilterOption {
  id: string;
  label: string;
}

export const CUSTOM_INTERNAL_FILTER_PREFIX = "custom-filter:";

export function createCustomInternalFilterId(categorySlug: string, label: string): string {
  return `${CUSTOM_INTERNAL_FILTER_PREFIX}${categorySlug}:${encodeURIComponent(label.trim())}`;
}

export function isCustomInternalFilterId(filterId: string | null | undefined): filterId is string {
  return Boolean(filterId?.startsWith(CUSTOM_INTERNAL_FILTER_PREFIX));
}

export function parseCustomInternalFilterId(
  filterId: string | null | undefined,
): { categorySlug: string; label: string } | null {
  if (!isCustomInternalFilterId(filterId) || !filterId) return null;
  const rest = filterId.slice(CUSTOM_INTERNAL_FILTER_PREFIX.length);
  const splitAt = rest.indexOf(":");
  if (splitAt <= 0) return null;
  const categorySlug = rest.slice(0, splitAt);
  const encodedLabel = rest.slice(splitAt + 1);
  try {
    return { categorySlug, label: decodeURIComponent(encodedLabel) };
  } catch {
    return { categorySlug, label: encodedLabel };
  }
}

export function getCustomInternalFilterLabel(filterId: string | null | undefined): string | null {
  return parseCustomInternalFilterId(filterId)?.label ?? null;
}

const POS: CategoryInternalFilterOption[] = [
  { id: "bm", label: "Biomecânica (BM)" },
  { id: "tf", label: "Treinamento Funcional (TF)" },
  { id: "sm", label: "Treinamento Feminino / Saúde da Mulher (SM)" },
  { id: "mpa", label: "Pós em Musculação (MPA)" },
  { id: "bb", label: "Bodybuilding (BB)" },
  { id: "fe", label: "Fisiologia (FE)" },
  { id: "pos-outros", label: "Outros (Pós-graduação)" },
];

const LIVROS: CategoryInternalFilterOption[] = [
  { id: "livro-bio", label: "Livro de Biomecânica" },
  { id: "livro-mkt", label: "Livro de Marketing" },
  { id: "livro-outros", label: "Livros — outros temas" },
];

const EBOOKS: CategoryInternalFilterOption[] = [
  { id: "ebook-bio-joelho", label: "Ebook Bio Joelho" },
  { id: "ebook-bio-coluna", label: "Ebook Bio Coluna" },
  { id: "ebook-outros", label: "Ebooks — outros" },
];

const EVENTOS: CategoryInternalFilterOption[] = [
  { id: "bio-spec", label: "Biomechanic Specialist" },
  { id: "mentoria-scala", label: "Mentoria Scala" },
  { id: "next", label: "Next" },
  { id: "power-trainer", label: "Power Trainer" },
  { id: "eventos-outros", label: "Eventos — outros" },
];

const PERPETUO: CategoryInternalFilterOption[] = [
  { id: "notavel-play", label: "Notável Play" },
  { id: "perpetuo-outros", label: "Perpétuo — outros" },
];

export const CATEGORY_INTERNAL_FILTERS: Record<string, CategoryInternalFilterOption[]> = {
  pos:      POS,
  livros:   LIVROS,
  ebooks:   EBOOKS,
  eventos:  EVENTOS,
  perpetuo: PERPETUO,
};

export function getInternalFiltersForCategorySlug(slug: string): CategoryInternalFilterOption[] {
  return CATEGORY_INTERNAL_FILTERS[slug] ?? [];
}

/**
 * Sub-filtros da categoria considerando a EMPRESA: os subfilters configurados
 * no Painel Admin (settings.companyFilters) entram como opções — usam o
 * mecanismo `custom-filter:` existente, então o resto do app já entende.
 */
export function getInternalFiltersForCategory(
  slug: string,
  companySettings?: Record<string, unknown>,
): CategoryInternalFilterOption[] {
  const builtin = getInternalFiltersForCategorySlug(slug);
  const raw = companySettings?.companyFilters;
  if (!Array.isArray(raw)) return builtin;
  const filter = raw.find((f) => f && (f as { id?: string }).id === slug) as
    | { subfilters?: unknown }
    | undefined;
  const subs = Array.isArray(filter?.subfilters) ? filter.subfilters.map(String) : [];
  const fromCompany = subs.map((label) => ({
    id: createCustomInternalFilterId(slug, label),
    label,
  }));
  const seen = new Set(builtin.map((o) => o.id));
  return [...builtin, ...fromCompany.filter((o) => !seen.has(o.id))];
}

export function getInternalFilterLabel(
  slug: string,
  filterId: string | null | undefined,
): string | null {
  if (!filterId) return null;
  const custom = parseCustomInternalFilterId(filterId);
  if (custom) return custom.label;
  const opts = getInternalFiltersForCategorySlug(slug);
  return opts.find((o) => o.id === filterId)?.label ?? filterId;
}
