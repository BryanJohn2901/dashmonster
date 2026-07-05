// ─── Registry de produtos do Monster Hub ───────────────────────────────────────
// Fonte única. O que uma empresa PODE abrir vem do cruzamento deste registry com
// os produtos contratados (companies.products, controlado pelo super admin).

export type ProductStatus = "live" | "soon";

export interface ProductDef {
  id: string;            // igual ao valor em companies.products (ex.: "dash", "pipe")
  name: string;
  tagline: string;       // etiqueta curta (ex.: "Analytics · Meta Ads")
  description: string;
  status: ProductStatus; // "live" = abre se contratado; "soon" = teaser p/ todos
}

export const PRODUCTS: ProductDef[] = [
  {
    id: "dash",
    name: "DashMonster",
    tagline: "Analytics · Meta Ads",
    description: "Tráfego pago, criativos e lançamentos — suas métricas em tempo real.",
    status: "live",
  },
  {
    id: "pipe",
    name: "PipeFlow",
    tagline: "CRM · Social Selling",
    description: "Pipeline Kanban, gestão de leads e CRM para quem vende pelo Instagram.",
    status: "live",
  },
];

/** Produto está disponível para abrir? live + contratado pela empresa. */
export function canOpenProduct(product: ProductDef, companyProducts: string[]): boolean {
  return product.status === "live" && companyProducts.includes(product.id);
}
