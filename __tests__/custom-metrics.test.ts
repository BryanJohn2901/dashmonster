import {
  evaluateFormula, validateFormula, formatCustom, tokenize,
} from "@/lib/customMetrics";

const VALUES = {
  spend: 1000, revenue: 3000, clicks: 200, impressions: 10000,
  leads: 50, customResult: 25, reach: 8000,
};

describe("evaluateFormula — aritmética básica e precedência", () => {
  it("respeita precedência (* antes de +)", () => {
    expect(evaluateFormula("2 + 3 * 4", {})).toBe(14);
  });

  it("respeita parênteses", () => {
    expect(evaluateFormula("(2 + 3) * 4", {})).toBe(20);
  });

  it("menos unário no início", () => {
    expect(evaluateFormula("-5 + 2", {})).toBe(-3);
  });

  it("menos unário após operador e após parêntese", () => {
    expect(evaluateFormula("3 * -2", {})).toBe(-6);
    expect(evaluateFormula("10 / (-2)", {})).toBe(-5);
  });

  it("subtração normal continua binária", () => {
    expect(evaluateFormula("10 - 3 - 2", {})).toBe(5);
  });
});

describe("evaluateFormula — métricas reais", () => {
  it("ROAS = revenue / spend", () => {
    expect(evaluateFormula("revenue / spend", VALUES)).toBe(3);
  });

  it("CTR = clicks / impressions * 100", () => {
    expect(evaluateFormula("clicks / impressions * 100", VALUES)).toBe(2);
  });

  it("custo por resultado = spend / customResult", () => {
    expect(evaluateFormula("spend / customResult", VALUES)).toBe(40);
  });

  it("identificador ausente resolve para 0", () => {
    expect(evaluateFormula("spend + naoexiste", VALUES)).toBe(1000);
  });
});

describe("evaluateFormula — robustez", () => {
  it("divisão por zero devolve 0 (igual safeDivide)", () => {
    expect(evaluateFormula("revenue / zero", { revenue: 100, zero: 0 })).toBe(0);
  });

  it("fórmula vazia → null", () => {
    expect(evaluateFormula("", VALUES)).toBeNull();
    expect(evaluateFormula("   ", VALUES)).toBeNull();
  });

  it("parênteses desbalanceados → null", () => {
    expect(evaluateFormula("(revenue / spend", VALUES)).toBeNull();
    expect(evaluateFormula("revenue / spend)", VALUES)).toBeNull();
  });

  it("operador solto → null", () => {
    expect(evaluateFormula("revenue /", VALUES)).toBeNull();
    expect(evaluateFormula("* spend", VALUES)).toBeNull();
  });

  it("caractere inválido → null", () => {
    expect(evaluateFormula("revenue % spend", VALUES)).toBeNull();
  });
});

describe("validateFormula", () => {
  const allowed = new Set(["spend", "revenue", "clicks", "impressions"]);

  it("aceita fórmula válida com métricas conhecidas", () => {
    expect(validateFormula("revenue / spend", allowed)).toEqual({ ok: true });
  });

  it("rejeita métrica desconhecida", () => {
    const r = validateFormula("revenue / xpto", allowed);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("xpto");
  });

  it("rejeita fórmula vazia", () => {
    expect(validateFormula("", allowed).ok).toBe(false);
    expect(validateFormula("   ", allowed).ok).toBe(false);
  });

  it("rejeita sintaxe inválida (parênteses)", () => {
    expect(validateFormula("(revenue / spend", allowed).ok).toBe(false);
  });

  it("aceita constante numérica pura", () => {
    expect(validateFormula("100", allowed)).toEqual({ ok: true });
  });

  it("rejeita só operadores", () => {
    expect(validateFormula("+ - *", allowed).ok).toBe(false);
  });
});

describe("tokenize", () => {
  it("identifica números, identificadores, operadores e parênteses", () => {
    const t = tokenize("(revenue + 2.5) / spend");
    expect(t.map((x) => x.type)).toEqual([
      "lparen", "ident", "op", "num", "rparen", "op", "ident",
    ]);
  });

  it("lança em caractere inválido", () => {
    expect(() => tokenize("a & b")).toThrow();
  });
});

describe("formatCustom", () => {
  it("currency → R$", () => {
    expect(formatCustom(1234.5, "currency")).toContain("R$");
  });
  it("multiplier → x", () => {
    expect(formatCustom(3, "multiplier")).toBe("3.00x");
  });
  it("percent → %", () => {
    expect(formatCustom(12.34, "percent")).toContain("%");
  });
  it("int arredonda", () => {
    expect(formatCustom(1234.7, "int")).toBe("1.235");
  });
  it("decimal → 2 casas", () => {
    expect(formatCustom(2, "decimal")).toBe("2,00");
  });
});
