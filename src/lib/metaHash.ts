import { createHash } from "crypto";

// Normalização oficial da Meta antes de hashear (trim + lowercase — mesma regra
// usada no template GTM oficial da Meta pra em/fn/ln/ct/st/zp/country): nunca
// mexer nisso sem checar a doc, hash diferente = perde o match na Meta.
// Compartilhado entre track-event e eduzz/webhook — os dois mandam user_data pra CAPI.
export function hashLower(value: string | undefined | null): string | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  return createHash("sha256").update(normalized).digest("hex");
}

// Telefone é a única exceção à regra acima: remove tudo que não é dígito antes
// de hashear (a Meta não espera máscara/+/-/espaços no hash de ph).
export function hashPhone(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, "");
  if (!digits) return undefined;
  return createHash("sha256").update(digits).digest("hex");
}
