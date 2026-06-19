import { createHash } from "crypto";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// Normalização oficial da Meta antes de hashear (trim + lowercase — mesma regra
// usada no template GTM oficial da Meta pra em/fn/ln/country): nunca mexer nisso
// sem checar a doc, hash diferente = perde o match na Meta.
// Compartilhado entre track-event e eduzz/webhook — os dois mandam user_data pra CAPI.
export function hashLower(value: string | undefined | null): string | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  return sha256(normalized);
}

// Telefone: remove tudo que não é dígito antes de hashear (a Meta não espera
// máscara/+/-/espaços no hash de ph). Vazio depois de limpar => undefined
// (NÃO mandar hash de string vazia — vira identificador-fantasma que não casa
// com ninguém e derruba a qualidade de correspondência).
export function hashPhone(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, "");
  if (!digits) return undefined;
  return sha256(digits);
}

// Cidade/estado/CEP têm normalização mais agressiva na doc da Meta: além de
// lowercase, remover acentos, espaços e pontuação ("São Paulo" -> "saopaulo",
// "12345-123" -> "12345123"). hashLower (só trim+lowercase) não casaria cidades
// com espaço/acento. Usado pra ct/st/zp; country fica no hashLower (já vem como
// ISO 2-letter "BR" das duas fontes — geo-IP da Vercel e endereço da Eduzz).
export function hashNormalized(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const normalized = value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // tira acentos (marcas diacríticas combinantes)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ""); // tira espaços e pontuação
  if (!normalized) return undefined;
  return sha256(normalized);
}
