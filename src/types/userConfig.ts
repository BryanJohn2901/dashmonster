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
