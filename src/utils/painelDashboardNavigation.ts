import type { UserAccountEntry } from "@/types/userConfig";
import { isCustomInternalFilterId } from "@/config/categoryInternalFilters";

/** Evento disparado após salvar vínculo no Painel — o Dashboard aplica foco na categoria/grupo. */
export const PAINEL_SAVE_NAV_EVENT = "painel:apply-save" as const;

export interface PainelSaveNavDetail {
  entry: UserAccountEntry;
  /** Slug da categoria: pos, livros, … ou custom-* */
  categorySlug: string;
  isCustom: boolean;
  /**
   * true = quem disparou (wizard dentro do Dashboard) NÃO mexe na lista de
   * entries nem sincroniza métricas — o listener do Dashboard faz isso.
   * Falso/ausente = caminho do Painel (page.tsx já faz merge+sync), evita duplicar.
   */
  syncAfter?: boolean;
}
export function mapPainelInternalFilterToDashboardGroupId(
  categorySlug: string,
  internalFilter: string | null,
): string {
  // Sem taxonomia embutida de nenhum nicho: os grupos vêm dos filtros que a
  // empresa configura. Filtro custom → é o próprio id do grupo. Sem filtro
  // custom, o grupo é o subfiltro (quando houver) ou a própria categoria.
  if (isCustomInternalFilterId(internalFilter)) return internalFilter;
  return internalFilter || categorySlug;
}
