// ─── Motor de métricas personalizadas (fórmulas) ──────────────────────────────
// Permite ao usuário CRIAR uma métrica a partir das que já temos, via fórmula
// que referencia outras métricas por id + operadores aritméticos. Ex:
//   "revenue / spend"            → ROAS
//   "(leads / clicks) * 100"     → taxa de captura (%)
//   "spend / customResult"       → custo por resultado
//
// Avaliação SEGURA — sem eval/new Function. Pipeline: tokenize → shunting-yard
// (notação polonesa reversa) → avalia a RPN resolvendo identificadores contra um
// mapa de valores. Divisão por zero devolve 0 (mesma semântica do safeDivide).

import { formatBRL, formatInt, formatPercent } from "@/lib/format";

export type CustomFormat = "currency" | "int" | "decimal" | "percent" | "multiplier";

export interface CustomMetric {
  id: string;          // "cm_..." — único por perfil
  label: string;
  formula: string;     // identificadores + números + ( ) + - * /
  format: CustomFormat;
  invert?: boolean;    // true = menor é melhor (CPA, CPC…)
}

// ─── Tokenizer ─────────────────────────────────────────────────────────────────

type TokType = "num" | "ident" | "op" | "lparen" | "rparen";
interface Token { type: TokType; value: string; }

const OPS = new Set(["+", "-", "*", "/"]);

/** Quebra a fórmula em tokens. Lança Error em caractere inválido. */
export function tokenize(formula: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const s = formula;
  while (i < s.length) {
    const c = s[i]!;
    if (c === " " || c === "\t" || c === "\n" || c === "\r") { i++; continue; }
    if (c >= "0" && c <= "9") {
      let j = i + 1;
      while (j < s.length && ((s[j]! >= "0" && s[j]! <= "9") || s[j] === ".")) j++;
      tokens.push({ type: "num", value: s.slice(i, j) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < s.length && /[A-Za-z0-9_]/.test(s[j]!)) j++;
      tokens.push({ type: "ident", value: s.slice(i, j) });
      i = j;
      continue;
    }
    if (OPS.has(c)) { tokens.push({ type: "op", value: c }); i++; continue; }
    if (c === "(") { tokens.push({ type: "lparen", value: c }); i++; continue; }
    if (c === ")") { tokens.push({ type: "rparen", value: c }); i++; continue; }
    throw new Error(`Caractere inválido: "${c}"`);
  }
  return tokens;
}

// ─── Shunting-yard → RPN ─────────────────────────────────────────────────────────

// Precedência: unário "u-" (3) > * / (2) > + - (1).
const PREC: Record<string, number> = { "u-": 3, "*": 2, "/": 2, "+": 1, "-": 1 };
const RIGHT_ASSOC = new Set(["u-"]);

/** Converte tokens (infixa) em RPN. Lança Error em parênteses desbalanceados. */
function toRPN(tokens: Token[]): Token[] {
  const out: Token[] = [];
  const stack: Token[] = [];
  // Detecta menos unário: "-" no início, ou após operador/"(".
  let prevType: TokType | null = null;
  for (const t of tokens) {
    if (t.type === "num" || t.type === "ident") {
      out.push(t);
    } else if (t.type === "op") {
      const isUnary = t.value === "-" && (prevType === null || prevType === "op" || prevType === "lparen");
      const op: Token = isUnary ? { type: "op", value: "u-" } : t;
      while (stack.length > 0) {
        const top = stack[stack.length - 1]!;
        if (top.type !== "op") break;
        const higher = PREC[top.value]! > PREC[op.value]!;
        const equalLeft = PREC[top.value]! === PREC[op.value]! && !RIGHT_ASSOC.has(op.value);
        if (higher || equalLeft) out.push(stack.pop()!);
        else break;
      }
      stack.push(op);
    } else if (t.type === "lparen") {
      stack.push(t);
    } else if (t.type === "rparen") {
      let found = false;
      while (stack.length > 0) {
        const top = stack.pop()!;
        if (top.type === "lparen") { found = true; break; }
        out.push(top);
      }
      if (!found) throw new Error("Parênteses desbalanceados");
    }
    prevType = t.type;
  }
  while (stack.length > 0) {
    const top = stack.pop()!;
    if (top.type === "lparen" || top.type === "rparen") throw new Error("Parênteses desbalanceados");
    out.push(top);
  }
  return out;
}

/** Avalia a RPN. `resolve(id)` devolve o valor de um identificador. */
function evalRPN(rpn: Token[], resolve: (id: string) => number): number {
  const st: number[] = [];
  for (const t of rpn) {
    if (t.type === "num") {
      st.push(Number(t.value));
    } else if (t.type === "ident") {
      st.push(resolve(t.value));
    } else if (t.type === "op") {
      if (t.value === "u-") {
        if (st.length < 1) throw new Error("Operador sem operando");
        st.push(-st.pop()!);
        continue;
      }
      if (st.length < 2) throw new Error("Operador sem operandos");
      const b = st.pop()!;
      const a = st.pop()!;
      switch (t.value) {
        case "+": st.push(a + b); break;
        case "-": st.push(a - b); break;
        case "*": st.push(a * b); break;
        case "/": st.push(b === 0 ? 0 : a / b); break; // div/0 → 0 (igual safeDivide)
      }
    }
  }
  if (st.length !== 1) throw new Error("Fórmula incompleta");
  const r = st[0]!;
  return Number.isFinite(r) ? r : 0;
}

// ─── API pública ───────────────────────────────────────────────────────────────

/**
 * Avalia uma fórmula contra um mapa de valores de métricas.
 * Identificadores ausentes resolvem para 0. Devolve `null` se a fórmula for
 * inválida (sintaxe/parênteses) — o chamador então exibe "—".
 */
export function evaluateFormula(formula: string, values: Record<string, number>): number | null {
  if (!formula.trim()) return null;
  try {
    const rpn = toRPN(tokenize(formula));
    if (rpn.length === 0) return null;
    return evalRPN(rpn, (id) => {
      const v = values[id];
      return typeof v === "number" && Number.isFinite(v) ? v : 0;
    });
  } catch {
    return null;
  }
}

/**
 * Valida a fórmula: sintaxe OK e todos os identificadores ∈ `allowedIds`.
 * Não permite fórmula vazia nem identificadores desconhecidos.
 */
export function validateFormula(
  formula: string,
  allowedIds: Set<string>,
): { ok: true } | { ok: false; error: string } {
  if (!formula.trim()) return { ok: false, error: "Fórmula vazia" };
  let tokens: Token[];
  try {
    tokens = tokenize(formula);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Fórmula inválida" };
  }
  if (!tokens.some((t) => t.type === "num" || t.type === "ident")) {
    return { ok: false, error: "Fórmula sem métricas nem números" };
  }
  for (const t of tokens) {
    if (t.type === "ident" && !allowedIds.has(t.value)) {
      return { ok: false, error: `Métrica desconhecida: ${t.value}` };
    }
  }
  // Tenta avaliar com 1 em tudo para pegar erros estruturais (parênteses, operadores soltos).
  try {
    const rpn = toRPN(tokens);
    evalRPN(rpn, () => 1);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Fórmula inválida" };
  }
  return { ok: true };
}

/** Formata um valor conforme o tipo de formato escolhido na métrica custom. */
export function formatCustom(value: number, fmt: CustomFormat): string {
  switch (fmt) {
    case "currency":   return formatBRL(value);
    case "int":        return formatInt(value);
    case "percent":    return formatPercent(value);
    case "multiplier": return `${(Number.isFinite(value) ? value : 0).toFixed(2)}x`;
    case "decimal":
    default:
      return (Number.isFinite(value) ? value : 0).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
  }
}

let cmCounter = 0;
/** Gera um id único para uma métrica custom. */
export function newCustomMetricId(): string {
  cmCounter += 1;
  return `cm_${Date.now().toString(36)}_${cmCounter.toString(36)}`;
}
