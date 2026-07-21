import { ProductCategory } from "@/types/campaign";

// ─── Normalization ────────────────────────────────────────────────────────────

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// ─── Category classification ──────────────────────────────────────────────────
//
// Classificação genérica por palavra-chave (sem taxonomia de nenhum nicho
// específico). A classificação fina de verdade vem dos filtros da empresa
// (companyFilters); isto é só um fallback por nome de campanha.
//   1. Livros    — "livro"
//   2. Ebooks    — "ebook"
//   3. Eventos   — evento / imersão / mentoria / workshop / masterclass
//   4. Cursos    — curso / formação / graduação / pós
//   5. Perpétuo  — resto

export function classifyCampaign(name: string): ProductCategory {
  const n = norm(name);

  if (/livro/.test(n)) return "livros";
  if (/ebook/.test(n)) return "ebooks";
  if (/evento|imersao|mentoria|workshop|masterclass/.test(n)) return "eventos";
  if (/\bpos\b|pos.?grad|graduacao|formacao|\bcurso/.test(n)) return "pos";

  return "perpetuo";
}

// Sem agrupamento por curso embutido — o agrupamento vem dos grupos que a
// empresa configura (customGroups / companyFilters).
export function classifyCourse(_name: string): string {
  return "";
}
