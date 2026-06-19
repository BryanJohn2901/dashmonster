import { createHash } from "crypto";
import { hashLower, hashPhone, hashNormalized } from "@/lib/metaHash";

const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const EMPTY_HASH = sha(""); // e3b0c442... — o "hash de string vazia" que NÃO pode vazar pra Meta

describe("metaHash", () => {
  describe("hashLower", () => {
    it("trim + lowercase antes de hashear", () => {
      expect(hashLower("  Wesley@Teste.COM ")).toBe(sha("wesley@teste.com"));
    });
    it("vazio/whitespace/null => undefined (nunca hash de vazio)", () => {
      expect(hashLower("")).toBeUndefined();
      expect(hashLower("   ")).toBeUndefined();
      expect(hashLower(null)).toBeUndefined();
      expect(hashLower(undefined)).toBeUndefined();
    });
  });

  describe("hashPhone", () => {
    it("remove tudo que não é dígito antes de hashear", () => {
      expect(hashPhone("+55 (41) 98624-0714")).toBe(sha("5541986240714"));
    });
    it("sem nenhum dígito => undefined (não manda hash-fantasma)", () => {
      expect(hashPhone("(__) _____-____")).toBeUndefined();
      expect(hashPhone("")).toBeUndefined();
      expect(hashPhone(null)).toBeUndefined();
      expect(hashPhone("abc")).toBeUndefined();
    });
    it("nunca produz o hash de string vazia", () => {
      expect(hashPhone("---")).not.toBe(EMPTY_HASH);
      expect(hashPhone("---")).toBeUndefined();
    });
  });

  describe("hashNormalized (ct/st/zp)", () => {
    it("remove acento, espaço e pontuação", () => {
      expect(hashNormalized("São Paulo")).toBe(sha("saopaulo"));
      expect(hashNormalized("01310-100")).toBe(sha("01310100"));
      expect(hashNormalized("Rio De Janeiro")).toBe(sha("riodejaneiro"));
    });
    it("vazio depois de limpar => undefined", () => {
      expect(hashNormalized("---")).toBeUndefined();
      expect(hashNormalized("")).toBeUndefined();
      expect(hashNormalized(null)).toBeUndefined();
    });
  });
});
