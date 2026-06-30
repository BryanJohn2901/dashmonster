/**
 * Extrai o nome base do produto a partir do nome bruto do Eduzz.
 * Formatos encontrados no banco:
 *   "[SM7-19x197-C] 1ª com 50% - Pós-graduação em Treinamento Feminino..."
 *   "[SM7-18x247-B] 50% na 1ª -  Pós-graduação em Treinamento Feminino..."
 *   "[SM7-18x229-C] - Pós-graduação em Treinamento Feminino..."
 *   "[SM7-18x167-B] Pós-graduação em Treinamento Feminino... – Opção 02"
 *   "[SM7-18x197-B] 1- 50% de desconto - Matrícula - Pós-graduação em..."
 */
export function productBaseName(raw: string): string {
  // 1. Strip [CODE] prefix
  let s = raw.replace(/^\[[^\]]*\]\s*/, "").trim();

  // 2. Strip leading dash/pipe that sometimes appears right after [CODE]
  s = s.replace(/^\s*[-–—|]\s*/, "").trim();

  // 3. Split by any dash/ndash/mdash surrounded by spaces
  //    (does NOT split "Pós-graduação" — no spaces around that hyphen)
  const parts = s.split(/\s+[-–—]\s+/);

  // 4. Filter to find meaningful parts (actual course names)
  const isPromo = (p: string): boolean => {
    const t = p.trim();
    if (t.length < 12) return true;                          // too short: "Opção 02", "Novo", "Gold"
    if (/^[\d]+[%xX]/i.test(t)) return true;                // "50%", "19x197-C"
    if (/^\d+[-–—]?\s*\d*%/.test(t)) return true;           // "1- 50%" or "50%"
    if (/^\d+[oOº°ªa]\s+com\s/i.test(t)) return true;      // "1º com 50%", "1ª com 50%"
    if (/^\d+[ªa]\s+com\s/i.test(t)) return true;           // extra guard for "1ª com"
    if (/^[-–—]/.test(t)) return true;                      // leading dash
    if (/^(Negoci|Cancela|Entrada|Recorr|Renova|Apenas|Matr[ií]cula|Opção|Lote\s*\d|Turma|Gold|Silver|Bronze|Novo\b)/i.test(t)) return true;
    return false;
  };

  const meaningful = parts.find((p) => !isPromo(p));
  return (meaningful ?? parts[parts.length - 1]).trim() || raw;
}

/**
 * Verifica se dois nomes de produto Eduzz referem-se ao mesmo produto,
 * ignorando diferenças de oferta/parcelamento/código.
 */
export function matchProductNames(a: string, b: string): boolean {
  const baseA = productBaseName(a).toLowerCase();
  const baseB = productBaseName(b).toLowerCase();
  return baseA.includes(baseB) || baseB.includes(baseA);
}

/**
 * Tenta inferir o total de parcelas a partir do código bruto da oferta.
 * Fallback de último recurso quando a ficha do contrato ainda não chegou.
 * Ex.: "[BM9-19x197-C] ..." -> 19
 */
export function inferInstallmentsFromProductName(raw: string): number | null {
  const match = raw.match(/^\s*\[[^\]]*?(\d+)x\d+[^\]]*\]/i);
  if (!match) return null;
  const installments = Number(match[1]);
  return Number.isFinite(installments) && installments > 1 ? installments : null;
}
