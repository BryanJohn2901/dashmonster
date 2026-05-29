import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// ─── Criptografia simétrica de access tokens (AES-256-GCM) ────────────────────
// Tokens do Instagram não podem ficar em texto puro na coluna access_token
// (legível por qualquer cliente anon). Guardamos cifrado e decifrar só no server.
//
// Formato armazenado: "enc:v1:<iv_b64>:<tag_b64>:<ciphertext_b64>"
// Tokens legados (sem prefixo "enc:") são tratados como texto puro e devolvidos
// como estão por decryptToken — permite migração suave sem quebrar contas antigas.

const PREFIX = "enc:v1:";

function getKey(): Buffer {
  const raw = process.env.IG_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "IG_TOKEN_ENCRYPTION_KEY não configurada. Gere 32 bytes base64 e adicione ao .env.",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `IG_TOKEN_ENCRYPTION_KEY inválida: esperado 32 bytes (base64), recebido ${key.length}.`,
    );
  }
  return key;
}

/** Cifra um token em string. Retorna string pronta para gravar no banco. */
export function encryptToken(plain: string): string {
  const key = getKey();
  const iv = randomBytes(12); // GCM recomenda nonce de 12 bytes
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

/** Decifra. Se o valor não tiver o prefixo (token legado em texto puro), devolve como está. */
export function decryptToken(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored; // legado: texto puro
  const body = stored.slice(PREFIX.length);
  const [ivB64, tagB64, dataB64] = body.split(":");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Token cifrado em formato inválido.");
  }
  const key = getKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return plain.toString("utf8");
}

/** True se o valor já está cifrado (tem o prefixo). */
export function isEncrypted(stored: string): boolean {
  return stored.startsWith(PREFIX);
}
