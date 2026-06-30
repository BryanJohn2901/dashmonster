import type { UserAccountEntry } from "@/types/userConfig";
import { isCustomInternalFilterId } from "@/config/categoryInternalFilters";

/** Evento disparado após salvar vínculo no Painel — o Dashboard aplica foco na categoria/grupo. */
export const PTA_PAINEL_SAVE_NAV_EVENT = "pta:apply-painel-save" as const;

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
  const fallback: Record<string, string> = {
    pos: "biomecanica",
    livros: "livros",
    ebooks: "ebookJoelho",
    perpetuo: "perpetuo",
    eventos: "bs",
  };
  const fb = fallback[categorySlug] ?? "biomecanica";
  if (isCustomInternalFilterId(internalFilter)) return internalFilter;

  if (categorySlug === "pos") {
    const m: Record<string, string> = {
      bm: "biomecanica",
      tf: "funcional",
      sm: "feminino",
      mpa: "musculacao",
      bb: "bodybuilding",
      fe: "fisiologia",
      "pos-outros": fb,
    };
    return (internalFilter && m[internalFilter]) || fb;
  }
  if (categorySlug === "livros") {
    const m: Record<string, string> = {
      "livro-bio": "livros",
      "livro-mkt": "livroMarketing",
      "livro-outros": fb,
    };
    return (internalFilter && m[internalFilter]) || fb;
  }
  if (categorySlug === "ebooks") {
    const m: Record<string, string> = {
      "ebook-bio-joelho": "ebookJoelho",
      "ebook-bio-coluna": "ebookColuna",
      "ebook-outros": fb,
    };
    return (internalFilter && m[internalFilter]) || fb;
  }
  if (categorySlug === "perpetuo") {
    const m: Record<string, string> = {
      "notavel-play": "perpetuo",
      "perpetuo-outros": fb,
    };
    return (internalFilter && m[internalFilter]) || fb;
  }
  if (categorySlug === "eventos") {
    const m: Record<string, string> = {
      "bio-spec": "bs",
      "mentoria-scala": "mentoria",
      next: "next",
      "power-trainer": "powertrainer",
      "eventos-outros": fb,
    };
    return (internalFilter && m[internalFilter]) || fb;
  }
  return fb;
}
