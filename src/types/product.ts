// ─── Attachment (reference images / PDFs) ────────────────────────────────────

export interface Attachment {
  id: string;
  name: string;
  fileType: "image" | "pdf";
  dataUrl: string;   // base64 — images compressed, PDFs stored as-is
  sizeKb: number;
}

// ─── Product type ─────────────────────────────────────────────────────────────

export type ProductType = "pos" | "imersao";

// Sem catálogo de curso embutido: cada empresa define as próprias linhas.
export const COURSE_GROUPS_PRODUCT: ReadonlyArray<{ id: string; label: string }> = [];

export type CourseGroupId = string;

// ─── Sub-structures ───────────────────────────────────────────────────────────

export interface SubPromessa {
  id: string;
  text: string;
}

export type LotePagamento = "cartao" | "boleto" | "ambos";

export interface Lote {
  id: string;
  label: string;   // "Lote 1"
  valor: string;
  promo: string;
  pagamento?: LotePagamento;
}

export interface TurmaLink {
  id: string;
  turma: string;   // "T1", "Turma 5", etc.
  valor: string;
  link: string;
}

export interface PageLink {
  id: string;
  label: string;   // ex: "Principal", "Captação", "Checkout"
  url: string;
}

export interface DorSolucao {
  id: string;
  dor: string;
  solucao: string;
}

export interface EntregavelItem {
  id: string;
  text: string;
}

export interface Entregavel {
  id: string;
  titulo: string;
  itens: EntregavelItem[];
}

export interface PersonaSegmento {
  id: string;
  titulo: string;    // "01", "Iniciante", etc.
  pontos: string;    // free text — comma or newline separated
}

// ─── Main product data ────────────────────────────────────────────────────────

export interface ProductData {
  id: string;
  type: ProductType;
  /** Categoria personalizada (criada pelo cliente no formulário). É o que agrupa
   *  a Base de Produtos. `type` (pos/imersão) passa a controlar só o layout. */
  categoria?: string;
  courseGroup?: CourseGroupId;
  turmaVinculada?: string;   // e.g. "Turma 5", "T3"
  attachments: Attachment[];  // reference prints & PDFs
  createdAt: string;
  updatedAt: string;

  // ── TOP — always visible ──────────────────────────────────────────────────
  nome: string;
  expert: string;
  promessa: string;
  subPromessas: SubPromessa[];

  // ── EQUIPE ────────────────────────────────────────────────────────────────
  coProdutores: string;
  coordenador: string;
  debateProduto: string;
  profSlides: string;       // pos only
  ptoDigital?: string;      // legado — mantido para retrocompatibilidade
  headMarketing: string;
  liderLancamentos: string;
  designer: string;
  editorVideo: string;
  socialMedia: string;
  gestorTrafego: string;
  webDesigner: string;

  // ── PALAVRAS-CHAVE ────────────────────────────────────────────────────────
  palavrasChave: string[];

  // ── AVATAR ────────────────────────────────────────────────────────────────
  descricaoAvatar: string;

  // ── PROPOSTA DE VALOR ─────────────────────────────────────────────────────
  oQueVaiAprender: string[];       // pos — dynamic list
  temaAulaInaugural: string;       // pos — text (tema para promover a imersão)
  temaImersao: string;             // imersão — main theme/description

  // ── PRECIFICAÇÃO ──────────────────────────────────────────────────────────
  valorBase: string;
  lotes: Lote[];

  // ── ENTREGÁVEIS & BÔNUS (pos only) ───────────────────────────────────────
  entregaveis: Entregavel[];
  bonus: string[];

  // ── PÚBLICO-ALVO ──────────────────────────────────────────────────────────
  paraQuemE: string;
  sofrimentoPersona: PersonaSegmento[];

  // ── DORES & SOLUÇÕES ──────────────────────────────────────────────────────
  doresESolucoes: DorSolucao[];

  // ── RECEITA TÉCNICA (pos only) ────────────────────────────────────────────
  receitaTecnica: string;

  // ── LINKS DE VENDA ────────────────────────────────────────────────────────
  linksVenda: TurmaLink[];
  paginasCaptura: PageLink[];   // múltiplas páginas de captura
  paginasVenda:   PageLink[];   // múltiplas páginas de venda
}

// ─── Empty factory ────────────────────────────────────────────────────────────

export function emptyProduct(type: ProductType): Omit<ProductData, "id" | "createdAt" | "updatedAt"> {
  return {
    type,
    categoria: "",
    attachments: [],
    nome: "",
    expert: "",
    promessa: "",
    subPromessas: [{ id: crypto.randomUUID(), text: "" }],
    coProdutores: "",
    coordenador: "",
    debateProduto: "",
    profSlides: "",
    headMarketing: "",
    liderLancamentos: "",
    designer: "",
    editorVideo: "",
    socialMedia: "",
    gestorTrafego: "",
    webDesigner: "",
    palavrasChave: [],
    descricaoAvatar: "",
    oQueVaiAprender: [],
    temaAulaInaugural: "",
    temaImersao: "",
    valorBase: "",
    lotes: [],
    entregaveis: [],
    bonus: [],
    paraQuemE: "",
    sofrimentoPersona: [],
    doresESolucoes: [],
    receitaTecnica: "",
    linksVenda: [],
    paginasCaptura: [],
    paginasVenda: [],
  };
}
