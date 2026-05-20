import {
  CourseGroupId, DorSolucao, Entregavel, EntregavelItem,
  Lote, PageLink, PersonaSegmento, ProductData, ProductType, SubPromessa, TurmaLink,
} from "@/types/product";

// ─── Normalise string (remove accents, uppercase, trim) ───────────────────────

function n(s: string): string {
  return s.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

/** Strip emojis and common icon prefixes (✅, 🎁, ⚡, etc.) */
function stripIcons(s: string): string {
  return s.replace(/[\u{1F300}-\u{1FFFF}]/gu, "").replace(/✅|🎁|⚡|❌|⚠️/g, "").trim();
}

// ─── Section detection ────────────────────────────────────────────────────────

/**
 * Detects section headers in multiple formats:
 *   # SECTION NAME
 *   ── SECTION NAME ──────
 *   == SECTION NAME ==
 *   SECTION NAME:  (ALL CAPS only line, optional colon)
 */
function detectSection(line: string): string | null {
  const t = line.trim();

  // # Section
  if (t.match(/^#+\s+/)) return t.replace(/^#+\s*/, "");

  // ── Section ── (unicode dash or regular dash, at least 2)
  const dashMatch = t.match(/^[─\-]{2,}\s+(.+?)\s+[─\-]+$/);
  if (dashMatch) return dashMatch[1].trim();

  // == Section ==
  const eqMatch = t.match(/^={2,}\s+(.+?)\s+={2,}$/);
  if (eqMatch) return eqMatch[1].trim();

  return null;
}

// ─── Item parsers ─────────────────────────────────────────────────────────────

/** `- text` or `• text` → text */
function bulletText(line: string): string | null {
  const m = line.trim().match(/^[-•]\s+(.+)/);
  return m ? stripIcons(m[1]).trim() : null;
}

/** `1. text` or `1) text` → text (strips surrounding quotes too) */
function numberedText(line: string): string | null {
  const m = line.trim().match(/^\d+[.)]\s+(.+)/);
  if (!m) return null;
  return m[1].replace(/^["'""'']|["'""'']$/g, "").trim();
}

/** Either bullet or numbered → text */
function listItem(line: string): string | null {
  return bulletText(line) ?? numberedText(line);
}

/** `KEY: value` → [key, value]. Handles leading spaces. */
function keyValue(line: string): [string, string] | null {
  const idx = line.indexOf(":");
  if (idx === -1) return null;
  const k = line.slice(0, idx).trim();
  if (!k || k.includes("\n")) return null;
  return [k, line.slice(idx + 1).trim()];
}

// ─── Section parser ───────────────────────────────────────────────────────────

function parseSections(text: string): Record<string, string[]> {
  const sections: Record<string, string[]> = {};
  let current = "";
  for (const raw of text.split("\n")) {
    const sec = detectSection(raw);
    if (sec) {
      current = n(sec);
      sections[current] = [];
    } else if (current) {
      sections[current].push(raw.trimEnd());
    }
  }
  return sections;
}

/** First matching section (normalised name lookup). */
function sec(sections: Record<string, string[]>, ...keys: string[]): string[] {
  for (const k of keys) {
    if (sections[n(k)]) return sections[n(k)];
  }
  return [];
}

/** Value for a key inside a section lines array. Tries multiple key aliases. */
function kv(lines: string[], ...keys: string[]): string {
  for (const key of keys) {
    const nk = n(key);
    for (const line of lines) {
      const pair = keyValue(line);
      if (pair && n(pair[0]) === nk && pair[1]) return pair[1];
    }
  }
  return "";
}

/**
 * Collect items after the line whose key matches one of the given keys.
 * Accepts both bullet (`- item`) and numbered (`1. item`) formats.
 * Stops when a new key line is encountered (not a blank or list item).
 */
function itemsAfterKey(lines: string[], ...keys: string[]): string[] {
  const nks = keys.map(n);
  let collecting = false;
  const result: string[] = [];
  for (const line of lines) {
    if (!collecting) {
      const pair = keyValue(line);
      if (pair && nks.includes(n(pair[0]))) {
        collecting = true;
        if (pair[1]) result.push(stripIcons(pair[1])); // inline value
        continue;
      }
    }
    if (collecting) {
      const item = listItem(line);
      if (item) { result.push(stripIcons(item)); continue; }
      if (line.trim() === "") continue;
      // Non-list, non-blank line with a colon = new key → stop
      if (line.includes(":") && !line.trimStart().startsWith("-")) break;
    }
  }
  return result.filter(Boolean);
}

/** All bullet/numbered items in a section (any position). */
function allItems(lines: string[]): string[] {
  return lines.map(l => listItem(l)).filter((x): x is string => x !== null).map(stripIcons);
}

/** Non-key, non-list lines joined as free text. */
function freeText(lines: string[]): string {
  return lines
    .filter(l => {
      const t = l.trim();
      return t && !listItem(t) && !detectSection(t);
    })
    .map(l => l.trim())
    .join("\n")
    .trim();
}

// ─── Multi-line value (text block under a key) ────────────────────────────────

function multilineValue(lines: string[], ...keys: string[]): string {
  const nks = keys.map(n);
  let found = false;
  const result: string[] = [];
  for (const line of lines) {
    if (!found) {
      const pair = keyValue(line);
      if (pair && nks.includes(n(pair[0]))) {
        found = true;
        if (pair[1]) result.push(pair[1]);
        continue;
      }
    } else {
      const pair = keyValue(line);
      if (pair && pair[1] && !line.trimStart().startsWith("-")) break; // new key
      if (line.trim() === "" && result.length > 0) break; // blank line = end
      if (line.trim()) result.push(line.trim());
    }
  }
  return result.join(" ").trim();
}

// ─── Main parser ──────────────────────────────────────────────────────────────

export function parseTxtTemplate(
  text: string,
): Partial<Omit<ProductData, "id" | "createdAt" | "updatedAt">> {
  const sections = parseSections(text);
  const result: Partial<Omit<ProductData, "id" | "createdAt" | "updatedAt">> = {};

  // ── TIPO ─────────────────────────────────────────────────────────────────────
  const idSec = sec(sections, "IDENTIFICAÇÃO", "IDENTIFICACAO", "BASE", "INFORMACOES GERAIS");
  // also check document header line for IMERSÃO / PÓS-GRADUAÇÃO
  const headerLine = text.split("\n").slice(0, 8).find(l => /IMERS[AÃ]O|IMERSAO/i.test(l));
  const tipoField = kv(idSec, "TIPO");
  const rawTipo = n(tipoField || (headerLine ? "IMERSAO" : "POS"));
  result.type = (rawTipo.includes("IMERS") ? "imersao" : "pos") as ProductType;

  // ── NOME DO PRODUTO ───────────────────────────────────────────────────────────
  // Can live in IDENTIFICAÇÃO, BASE, or NOME/PROMESSA section
  const nomeProm = sec(sections, "NOME, PROMESSA E SUB PROMESSAS", "NOME PROMESSA E SUB PROMESSAS",
    "PROMESSA", "NOME E PROMESSA");
  result.nome =
    kv(idSec, "NOME")
    || kv(nomeProm, "NOME");

  // ── EXPERT ────────────────────────────────────────────────────────────────────
  result.expert = kv(idSec, "NOME DO EXPERT", "EXPERT", "ESPECIALISTA", "PROFESSOR");

  // ── TURMA VINCULADA ───────────────────────────────────────────────────────────
  result.turmaVinculada = kv(idSec, "TURMA VINCULADA", "TURMA") || undefined;

  // ── CURSO ─────────────────────────────────────────────────────────────────────
  const curso = n(kv(idSec, "CURSO") || "");
  const cursoMap: Record<string, CourseGroupId> = {
    BIOMECANICA: "biomecanica", BM: "biomecanica",
    MUSCULACAO: "musculacao",   MPA: "musculacao",
    FISIOLOGIA: "fisiologia",  FE: "fisiologia",
    BODYBUILDING: "bodybuilding", BB: "bodybuilding",
    FEMININO: "feminino", SM: "feminino",
    FUNCIONAL: "funcional", TF: "funcional",
  };
  if (cursoMap[curso]) result.courseGroup = cursoMap[curso];

  // ── EQUIPE ────────────────────────────────────────────────────────────────────
  const eqSec = sec(sections, "EQUIPE", "BASE", "INFORMACOES GERAIS");
  result.coProdutores     = kv(eqSec, "CO-PRODUTORES", "COPRODUTORES", "COPRODUÇÃO");
  result.coordenador      = kv(eqSec, "COORDENADOR DA PÓS", "COORDENADOR DA POS", "COORDENADOR");
  result.debateProduto    = kv(eqSec, "DEBATE DO PRODUTO", "DEBATE");
  result.profSlides       = kv(eqSec, "PROF. SLIDES", "PROF SLIDES");
  result.headMarketing    = kv(eqSec, "HEAD DE MARKETING", "HEAD MARKETING");
  result.liderLancamentos = kv(eqSec, "LIDER DE LANCAMENTOS", "LÍDER DE LANÇAMENTOS", "GERENTE DO PRODUTO");
  result.designer         = kv(eqSec, "DESIGNER");
  result.editorVideo      = kv(eqSec, "EDITOR DE VIDEO", "EDITOR DE VÍDEO");
  result.socialMedia      = kv(eqSec, "SOCIAL MEDIA");
  result.gestorTrafego    = kv(eqSec, "GESTOR DE TRAFEGO", "GESTOR DE TRÁFEGO");
  result.webDesigner      = kv(eqSec, "WEB DESIGNER");

  // ── PALAVRAS-CHAVE ────────────────────────────────────────────────────────────
  const pkSec = sec(sections, "PALAVRAS-CHAVE", "PALAVRAS CHAVE");
  // Try bullet/numbered format first, then comma-separated
  const pkItems = allItems(pkSec);
  if (pkItems.length > 0) {
    result.palavrasChave = pkItems;
  } else {
    const pkLine = pkSec.find(l => l.trim() && !detectSection(l));
    if (pkLine) result.palavrasChave = pkLine.split(",").map(s => s.trim()).filter(Boolean);
  }

  // ── PROMESSA PRINCIPAL ────────────────────────────────────────────────────────
  const promSecLines = nomeProm.length > 0 ? nomeProm : sec(sections, "PROMESSA");
  result.promessa =
    multilineValue(promSecLines, "PROMESSA", "PROMESSA PRINCIPAL", "PRINCIPAL")
    || freeText(promSecLines.slice(0, 8));

  // ── SUB-PROMESSAS ─────────────────────────────────────────────────────────────
  const subItems = itemsAfterKey(promSecLines, "SUB PROMESSAS", "SUB-PROMESSAS", "SUBPROMESSAS");
  if (subItems.length > 0) {
    result.subPromessas = subItems
      .filter(t => !t.match(/^a definir/i))
      .map((t): SubPromessa => ({ id: crypto.randomUUID(), text: t }));
  }

  // ── AVATAR ────────────────────────────────────────────────────────────────────
  const avatarSec = sec(sections, "AVATAR DO PRODUTO", "AVATAR");
  if (avatarSec.length > 0) {
    result.descricaoAvatar = avatarSec
      .filter(l => l.trim() && !l.match(/^a definir/i))
      .join("\n").trim();
  }

  // ── O QUE VAI APRENDER ────────────────────────────────────────────────────────
  const oqSec = sec(sections, "O QUE VAI APRENDER", "O QUE VOCE VAI APRENDER");
  if (oqSec.length > 0) result.oQueVaiAprender = allItems(oqSec);

  // ── TEMA AULA INAUGURAL ───────────────────────────────────────────────────────
  const temaSec = sec(sections,
    "TEMA DA AULA INAUGURAL / IMERSÃO", "TEMA DA AULA INAUGURAL",
    "TEMA DA IMERSAO", "AULA INAUGURAL", "TEMA IMERSAO");
  const temaText = temaSec.filter(l => l.trim()).join(" ").trim();
  if (result.type === "imersao") {
    result.temaImersao = temaText;
  } else {
    result.temaAulaInaugural = temaText;
  }

  // ── PRECIFICAÇÃO ──────────────────────────────────────────────────────────────
  const precSec = sec(sections,
    "VALOR DO PRODUTO E VARIAÇÕES", "VALOR DO PRODUTO E VARIACOES",
    "PRECIFICAÇÃO", "PRECIFICACAO", "PRECOS", "PREÇOS");
  const valorRaw = kv(precSec, "VALOR", "VALOR BASE");
  result.valorBase = valorRaw.replace(/[Rr]\$\s*/g, "").replace(/\?\?\?/g, "").trim();

  const loteLines = precSec.filter(l => bulletText(l) !== null || (l.trim().match(/^Lote\s*\d/i)));
  if (loteLines.length > 0) {
    result.lotes = loteLines.map((l, i): Lote => {
      const raw = (bulletText(l) || l).trim();
      // Format: "Lote 1 → Promo 4" or "Lote 1 = R$19,90" or "Lote 1 | 997,00 | promo: 897,00"
      const parts = raw.split(/[|→=]/).map(s => s.trim());
      return {
        id: crypto.randomUUID(),
        label: parts[0] || `Lote ${i + 1}`,
        valor: (parts[1] || "").replace(/[Rr]\$\s*/g, "").replace(/promo:\s*/i, ""),
        promo: (parts[2] || "").replace(/[Rr]\$\s*/g, "").replace(/promo:\s*/i, ""),
      };
    });
  }

  // ── ENTREGÁVEIS ───────────────────────────────────────────────────────────────
  const entSec = sec(sections, "O QUE SERÁ ENTREGUE + BÔNUS", "O QUE SERA ENTREGUE E BONUS",
    "ENTREGÁVEIS", "ENTREGAVEIS", "O QUE SERA ENTREGUE");
  if (entSec.length > 0) {
    const entregaveis: Entregavel[] = [];
    let cur: Entregavel | null = null;

    for (const line of entSec) {
      const t = line.trim();
      if (!t) continue;

      // BÔNUS / BONUS section inside entregáveis → stop collecting entregáveis
      if (n(t).startsWith("BONUS")) break;

      // Key-value "ENTREGÁVEIS 1:", "MÓDULO:", "MODULO:" → new module
      const pair = keyValue(line);
      if (pair) {
        const kn = n(pair[0]);
        if (kn.startsWith("ENTREGAV") || kn.startsWith("MODULO")) {
          if (cur) entregaveis.push(cur);
          cur = { id: crypto.randomUUID(), titulo: pair[1] || pair[0], itens: [] };
          continue;
        }
      }

      // Bullet/numbered items
      const item = listItem(t);
      if (item) {
        const clean = stripIcons(item);
        if (!clean.match(/^a definir/i)) {
          if (!cur) cur = { id: crypto.randomUUID(), titulo: "Entregáveis", itens: [] };
          cur.itens.push({ id: crypto.randomUUID(), text: clean } as EntregavelItem);
        }
      }
    }
    if (cur) entregaveis.push(cur);
    if (entregaveis.length > 0) result.entregaveis = entregaveis;
  }

  // ── BÔNUS ─────────────────────────────────────────────────────────────────────
  // Can be inside entregáveis section OR its own section
  const bonSec = sec(sections, "BONUS", "BÔNUS");
  const bonItems = allItems(bonSec.length > 0 ? bonSec : entSec.slice(
    entSec.findIndex(l => n(l.trim()).startsWith("BONUS"))
  )).filter(b => !b.match(/^a definir/i));
  if (bonItems.length > 0) result.bonus = bonItems;

  // ── PARA QUEM É ───────────────────────────────────────────────────────────────
  const pubSec = sec(sections, "PARA QUEM E", "PARA QUEM É", "PUBLICO-ALVO", "PÚBLICO-ALVO");
  result.paraQuemE = kv(pubSec, "PARA QUEM E", "PARA QUEM É") || freeText(pubSec.slice(0, 4));
  // Bullet list items = types of audience → join as text
  const pubItems = allItems(pubSec);
  if (!result.paraQuemE && pubItems.length > 0) result.paraQuemE = pubItems.join("; ");

  // ── SENTIMENTO / SOFRIMENTO DA PERSONA ───────────────────────────────────────
  const sentSec = sec(sections,
    "SENTIMENTO DA PERSONA", "SOFRIMENTO DA PERSONA",
    "PERSONA", "PUBLICO-ALVO", "PÚBLICO-ALVO");

  const segmentos: PersonaSegmento[] = [];

  if (sentSec.length > 0) {
    let curSeg: PersonaSegmento | null = null;
    for (const line of sentSec) {
      const t = line.trim();
      if (!t) continue;

      // S1 — Título | S2 — Título | S3 — Título pattern
      const sMatch = t.match(/^S\d+\s*[—–-]+\s*(.+)/);
      if (sMatch) {
        if (curSeg) segmentos.push(curSeg);
        curSeg = { id: crypto.randomUUID(), titulo: sMatch[1].trim(), pontos: "" };
        continue;
      }
      // SEGMENTO: Título pattern
      const pair = keyValue(line);
      if (pair && n(pair[0]) === "SEGMENTO") {
        if (curSeg) segmentos.push(curSeg);
        curSeg = { id: crypto.randomUUID(), titulo: pair[1], pontos: "" };
        continue;
      }
      // Bullet/numbered items under current segment
      const item = listItem(t);
      if (item && curSeg) {
        curSeg.pontos = curSeg.pontos ? `${curSeg.pontos}\n${item}` : item;
      }
    }
    if (curSeg) segmentos.push(curSeg);
  }
  if (segmentos.length > 0) result.sofrimentoPersona = segmentos;

  // ── DORES & SOLUÇÕES ─────────────────────────────────────────────────────────
  const dorSec = sec(sections,
    "DORES E SOLUCOES", "DORES E SOLUÇÕES",
    "DORES", "OBJEÇÕES E SOLUÇÕES");

  if (dorSec.length > 0) {
    const dores: DorSolucao[] = [];

    // Format A: paired DOR: / SOLUCAO: blocks
    const dorPaired = dorSec.some(l => n(l).startsWith("DOR:") || n(l).startsWith("DOR "));
    if (dorPaired) {
      let curDor: Partial<DorSolucao> | null = null;
      for (const line of dorSec) {
        const t = line.trim();
        if (!t) {
          if (curDor?.dor) { dores.push({ id: crypto.randomUUID(), dor: curDor.dor, solucao: curDor.solucao || "" }); curDor = null; }
          continue;
        }
        const pair = keyValue(line);
        if (!pair) continue;
        const k = n(pair[0]);
        if (k === "DOR") {
          if (curDor?.dor) dores.push({ id: crypto.randomUUID(), dor: curDor.dor, solucao: curDor.solucao || "" });
          curDor = { dor: pair[1], solucao: "" };
        } else if (k === "SOLUCAO" || k === "SOLUÇÃO" || k === "OBJECAO" || k === "OBJEÇÃO") {
          if (curDor) curDor.solucao = pair[1];
        }
      }
      if (curDor?.dor) dores.push({ id: crypto.randomUUID(), dor: curDor.dor, solucao: curDor.solucao || "" });

    } else {
      // Format B: "20 DORES" list then "20 SOLUÇÕES" list (their natural format)
      let mode: "none" | "dores" | "solucoes" = "none";
      const dorList: string[] = [];
      const solList: string[] = [];

      for (const line of dorSec) {
        const t = line.trim();
        if (!t) continue;
        const nt = n(t);

        if (nt.includes("DORE") || nt.startsWith("20 DOR")) { mode = "dores"; continue; }
        if (nt.includes("SOLUC") || nt.startsWith("20 SOL")) { mode = "solucoes"; continue; }

        const item = listItem(t);
        if (item) {
          if (mode === "dores") dorList.push(item);
          else if (mode === "solucoes") solList.push(item);
        }
      }

      // Pair dores + soluções by index
      const maxLen = Math.max(dorList.length, solList.length);
      for (let i = 0; i < maxLen; i++) {
        const dor = dorList[i] || "";
        const solucao = solList[i] || "";
        if (dor || solucao) dores.push({ id: crypto.randomUUID(), dor, solucao });
      }
    }

    if (dores.length > 0) result.doresESolucoes = dores;
  }

  // ── RECEITA TÉCNICA / NARRATIVA ───────────────────────────────────────────────
  const recSec = sec(sections, "RECEITA TECNICA", "RECEITA TÉCNICA", "NARRATIVA CENTRAL", "NARRATIVA");
  result.receitaTecnica = recSec.filter(l => l.trim()).join("\n").trim();

  // ── LINKS DE VENDA ────────────────────────────────────────────────────────────
  const lnkSec = sec(sections, "LINKS DE VENDA", "LINK", "LINKS");

  /** Parse "Rótulo: URL" or bare URL into PageLink */
  function parsePageLink(item: string, fallbackLabel: string): PageLink {
    const colonIdx = item.indexOf(":");
    // If colon exists and text before it is NOT "http", it's a label
    if (colonIdx > 0 && !item.slice(0, colonIdx).trim().toLowerCase().startsWith("http")) {
      return { id: crypto.randomUUID(), label: item.slice(0, colonIdx).trim(), url: item.slice(colonIdx + 1).trim() };
    }
    return { id: crypto.randomUUID(), label: fallbackLabel, url: item.trim() };
  }

  // Páginas de captura — suporta lista (- Rótulo: URL) ou key-value único
  const capturaItems = itemsAfterKey(lnkSec,
    "PÁGINAS DE CAPTURA", "PAGINAS DE CAPTURA", "PÁGINA DE CAPTURA", "PAGINA DE CAPTURA", "CAPTURA");
  if (capturaItems.length > 0) {
    result.paginasCaptura = capturaItems.map((item) => parsePageLink(item, "Captura"));
  } else {
    const single = kv(lnkSec, "PÁGINA DE CAPTURA", "PAGINA DE CAPTURA", "CAPTURA")
      || allItems(lnkSec).find(l => l.startsWith("http")) || "";
    if (single) result.paginasCaptura = [{ id: crypto.randomUUID(), label: "Captura", url: single }];
  }

  // Páginas de venda — suporta lista (- Rótulo: URL) ou key-value único
  const vendaItems = itemsAfterKey(lnkSec,
    "PÁGINAS DE VENDA", "PAGINAS DE VENDA", "PÁGINA DE VENDAS", "PAGINA DE VENDAS", "VENDAS");
  if (vendaItems.length > 0) {
    result.paginasVenda = vendaItems.map((item) => parsePageLink(item, "Vendas"));
  } else {
    const single = kv(lnkSec, "PÁGINA DE VENDAS", "PAGINA DE VENDAS", "VENDAS") || "";
    if (single) result.paginasVenda = [{ id: crypto.randomUUID(), label: "Vendas", url: single }];
  }

  // TURMA: lines
  const turmaLines = lnkSec.filter(l => n(l.slice(0, l.indexOf(":")|| 0)) === "TURMA");
  if (turmaLines.length > 0) {
    result.linksVenda = turmaLines.map((l): TurmaLink => {
      const parts = l.slice(l.indexOf(":") + 1).split("|").map(s => s.trim());
      return { id: crypto.randomUUID(), turma: parts[0] || "", valor: (parts[1] || "").replace(/[Rr]\$\s*/g, ""), link: parts[2] || "" };
    });
  }

  return result;
}

// ─── Template TXT (formato recomendado, aceito pelo parser) ───────────────────

export const PRODUCT_TXT_TEMPLATE = `======================================================
  PRODUTO — PÓS-GRADUAÇÃO
  [Substitua pela linha acima: PÓS-GRADUAÇÃO ou IMERSÃO]
======================================================
[INSTRUÇÕES: Preencha cada campo após os dois-pontos (:).
 Listas usam hífen (- item) ou número (1. item).
 Não apague os títulos das seções (linhas com ──).
 Campos opcionais podem ficar em branco.]


── IDENTIFICAÇÃO ─────────────────────────────────────

TIPO:             PÓS-GRADUAÇÃO
[Opções: PÓS-GRADUAÇÃO ou IMERSÃO]

NOME:             Nome completo do produto
NOME DO EXPERT:   Prof. Nome Sobrenome
TURMA VINCULADA:  (ex: Turma 5 — deixe em branco se não houver)

CURSO:            Biomecânica
[Opções: Biomecânica | Musculação | Fisiologia | Bodybuilding | Treinamento Feminino | Treinamento Funcional]


── EQUIPE ────────────────────────────────────────────

CO-PRODUTORES:       Nome(s) ou (a definir)
COORDENADOR DA PÓS:  Nome ou (a definir)
DEBATE DO PRODUTO:   Nome ou (a definir)
PROF. SLIDES:        Nome ou (a definir)
HEAD DE MARKETING:   Nome ou (a definir)
GERENTE DO PRODUTO:  Nome ou (a definir)
DESIGNER:            Nome ou (a definir)
EDITOR DE VÍDEO:     Nome ou (a definir)
SOCIAL MEDIA:        Nome ou (a definir)
GESTOR DE TRÁFEGO:   Nome ou (a definir)
WEB DESIGNER:        Nome ou (a definir)


── PALAVRAS-CHAVE ────────────────────────────────────
[Liste as palavras ou expressões que descrevem o produto]

- Palavra-chave 1
- Palavra-chave 2
- Palavra-chave 3
- Palavra-chave 4
- Palavra-chave 5


── AVATAR DO PRODUTO ─────────────────────────────────
[Descreva o aluno ideal: quem é, o que sente, o que deseja,
 seus obstáculos e nível de consciência sobre o problema]

Escreva aqui a descrição completa do avatar...


── NOME, PROMESSA E SUB PROMESSAS ───────────────────

NOME:
  Nome completo do produto (repita aqui se necessário)

PROMESSA:
  A transformação principal que o aluno vai ter ao concluir o curso.
  Escreva em linguagem direta e orientada a resultado.

SUB PROMESSAS:
  1. Resultado específico 1 que o aluno vai alcançar
  2. Resultado específico 2 que o aluno vai alcançar
  3. Resultado específico 3 que o aluno vai alcançar
  4. Benefício adicional 4
  5. Benefício adicional 5


── VALOR DO PRODUTO E VARIAÇÕES ─────────────────────

VALOR:    R$997,00

LOTES:
  - Lote 1 → R$797,00
  - Lote 2 → R$897,00
  - Lote 3 → R$997,00


── O QUE VAI APRENDER ────────────────────────────────
[Liste os principais tópicos / módulos / disciplinas do curso]

- Tópico ou módulo 1
- Tópico ou módulo 2
- Tópico ou módulo 3
- Tópico ou módulo 4
- Tópico ou módulo 5


── TEMA DA AULA INAUGURAL / IMERSÃO ─────────────────
[Para Pós: escreva o tema da aula inaugural.
 Para Imersão: escreva o tema central da imersão.]

  Título completo da aula inaugural ou tema da imersão.


── SENTIMENTO DA PERSONA ─────────────────────────────
[Descreva 3 segmentos de persona com seus pontos de dor e desejo.
 Cada segmento começa com S1, S2 ou S3 seguido de — e o título.]

S1 — Estado atual (dor latente):
  - Dor ou frustração principal
  - Outra dor ou frustração

S2 — Consciência do problema:
  - O que a persona percebe que precisa mudar
  - Outro ponto de consciência

S3 — Busca ativa por solução:
  - O que ela está buscando ativamente
  - O que ela já tentou sem sucesso


── O QUE SERÁ ENTREGUE + BÔNUS ──────────────────────
[Use ENTREGÁVEIS 1:, ENTREGÁVEIS 2: etc. para separar blocos.
 Liste itens com - ou ✅. Bônus vêm depois, com - ou 🎁.]

ENTREGÁVEIS 1: Módulo Principal
  - Entregável 1 (ex: Aulas gravadas com base científica)
  - Entregável 2 (ex: Material de apoio em PDF)
  - Entregável 3 (ex: Certificado de conclusão)

ENTREGÁVEIS 2: Módulo Complementar
  - Entregável 4
  - Entregável 5

BÔNUS:
  - Bônus 1 (ex: Mentoria em grupo)
  - Bônus 2 (ex: Acesso à comunidade exclusiva)


── PARA QUEM É ───────────────────────────────────────
[Descreva o público-alvo. Pode ser texto livre ou lista com -]

Esta formação é ideal para:

  - Personal Trainers que buscam aprofundar conhecimentos
  - Professores de academia que desejam se especializar
  - Profissionais da área que querem crescer na carreira


── DORES E SOLUÇÕES ──────────────────────────────────
[Liste as dores na voz da persona (entre aspas) e, abaixo,
 as soluções que o produto oferece para cada uma.
 A ordem deve ser a mesma: dor 1 ↔ solução 1, etc.]

20 DORES:

  1. "Frase na voz da persona — dor 1"
  2. "Frase na voz da persona — dor 2"
  3. "Frase na voz da persona — dor 3"
  4. "Frase na voz da persona — dor 4"
  5. "Frase na voz da persona — dor 5"

20 SOLUÇÕES:

  1. O que o produto entrega para resolver a dor 1
  2. O que o produto entrega para resolver a dor 2
  3. O que o produto entrega para resolver a dor 3
  4. O que o produto entrega para resolver a dor 4
  5. O que o produto entrega para resolver a dor 5


── NARRATIVA CENTRAL ─────────────────────────────────
[Texto da narrativa / receita técnica principal da campanha.
 Pode ser longo — escreva tudo aqui.]

  Escreva aqui o texto completo da narrativa central da campanha...


── LINKS DE VENDA ────────────────────────────────────
[Para múltiplas páginas use - Rótulo: https://... em cada linha]

PÁGINAS DE CAPTURA:
  - Principal: https://
  - Alternativa: https://

PÁGINAS DE VENDA:
  - Principal: https://
  - Lote 1: https://

======================================================
`;

// ─── Summary of parsed fields (for UI feedback) ───────────────────────────────

export function summarizeParsed(
  data: Partial<Omit<ProductData, "id" | "createdAt" | "updatedAt">>,
): string[] {
  const lines: string[] = [];
  if (data.type)               lines.push(`✅ Tipo: ${data.type === "imersao" ? "Imersão" : "Pós-Graduação"}`);
  if (data.nome)               lines.push(`✅ Nome: ${data.nome}`);
  if (data.expert)             lines.push(`✅ Expert: ${data.expert}`);
  if (data.courseGroup)        lines.push(`✅ Curso: ${data.courseGroup}`);
  if (data.promessa)           lines.push(`✅ Promessa principal`);
  if (data.subPromessas?.length)  lines.push(`✅ ${data.subPromessas.length} sub-promessa(s)`);
  if (data.palavrasChave?.length) lines.push(`✅ ${data.palavrasChave.length} palavras-chave`);
  if (data.descricaoAvatar)    lines.push(`✅ Avatar preenchido`);
  if (data.oQueVaiAprender?.length) lines.push(`✅ ${data.oQueVaiAprender.length} tópicos "o que vai aprender"`);
  if (data.entregaveis?.length) lines.push(`✅ ${data.entregaveis.length} bloco(s) de entregáveis`);
  if (data.bonus?.length)      lines.push(`✅ ${data.bonus.length} bônus`);
  if (data.sofrimentoPersona?.length) lines.push(`✅ ${data.sofrimentoPersona.length} segmento(s) de persona`);
  if (data.doresESolucoes?.length) lines.push(`✅ ${data.doresESolucoes.length} dor(es) & solução`);
  if (data.lotes?.length)      lines.push(`✅ ${data.lotes.length} lote(s)`);
  if (data.receitaTecnica)          lines.push(`✅ Narrativa / receita técnica`);
  if (data.paginasCaptura?.length)  lines.push(`✅ ${data.paginasCaptura.length} página(s) de captura`);
  if (data.paginasVenda?.length)    lines.push(`✅ ${data.paginasVenda.length} página(s) de venda`);
  if (!lines.length)           lines.push("⚠️ Nenhum campo reconhecido — verifique o formato do arquivo.");
  return lines;
}
