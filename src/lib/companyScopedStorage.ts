"use client";

// ─── Storage local isolado por empresa ─────────────────────────────────────────
// Caches em localStorage NÃO podem ser globais: dados de uma empresa vazariam
// para o dashboard de outra ao trocar (super admin vê várias empresas). Cada
// empresa tem sua própria chave `<prefix>:<companyId>`. O Supabase (já filtrado
// por empresa) é a fonte de verdade; estes caches são só para render imediato.

export const scopedKey = (prefix: string, companyId: string | null): string =>
  `${prefix}:${companyId ?? "none"}`;

export function loadScoped<T>(prefix: string, companyId: string | null, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(scopedKey(prefix, companyId));
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function persistScoped(prefix: string, companyId: string | null, value: unknown): void {
  try {
    localStorage.setItem(scopedKey(prefix, companyId), JSON.stringify(value));
  } catch {
    /* storage indisponível */
  }
}
