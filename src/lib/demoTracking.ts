// Dados demo do Tracking — só usados quando NÃO há Supabase + modo DEV ativo.
// Permitem ver a tela de Eventos de Tracking populada (visitantes, leads, vendas)
// sem backend. Mesmo formato de TrackingEvent de TrackingEventsView.

interface DemoEvent {
  id: string;
  event_name: string;
  fingerprint_id: string;
  event_url: string | null;
  page_title: string | null;
  user_data: { em?: string; ph?: string } | null;
  lead_email: string | null;
  lead_phone: string | null;
  lead_name: string | null;
  extra_fields: Record<string, string> | null;
  country: string | null;
  country_region: string | null;
  city: string | null;
  event_id: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  utm_placement: string | null;
  utm_campaign_id: string | null;
  utm_adset_id: string | null;
  utm_ad_id: string | null;
  capi_status: "pending" | "sent" | "failed" | "skipped";
  capi_error: string | null;
  value: number | null;
  currency: string | null;
  external_transaction_id: string | null;
  source: string | null;
  payment_method: string | null;
  installments: number | null;
  installment_number: number | null;
  installment_value: number | null;
  recurrence_key: string | null;
  product_name: string | null;
  is_order_bump: boolean | null;
  main_sale_transaction_id: string | null;
  client_user_agent: string | null;
  via: string | null;
  created_at: string;
}

const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

const UA_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const UA_ANDROID = "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
const UA_DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Base comum p/ reduzir repetição; cada evento sobrescreve o que precisa.
function ev(p: Partial<DemoEvent> & Pick<DemoEvent, "id" | "event_name" | "fingerprint_id" | "created_at">): DemoEvent {
  return {
    event_url: "https://demo.dashmonster.com/oferta",
    page_title: "Pós-Graduação · Oferta",
    user_data: null,
    lead_email: null, lead_phone: null, lead_name: null,
    extra_fields: null,
    country: "BR", country_region: "SP", city: "São Paulo",
    event_id: p.id,
    utm_source: "facebook", utm_medium: "paid", utm_campaign: "[PTA] Pós Grad",
    utm_content: null, utm_term: null, utm_placement: "feed",
    utm_campaign_id: "23851", utm_adset_id: "78422", utm_ad_id: "991024",
    capi_status: "sent", capi_error: null,
    value: null, currency: null, external_transaction_id: null,
    source: "pixel", payment_method: null,
    installments: null, installment_number: null, installment_value: null,
    recurrence_key: null, product_name: null, is_order_bump: null, main_sale_transaction_id: null,
    client_user_agent: UA_DESKTOP, via: "proxy",
    ...p,
  };
}

// 4 visitantes (fingerprints), cada um com jornada própria.
export const DEMO_TRACKING_EVENTS: DemoEvent[] = [
  // ── Visitante 1: jornada completa até compra (cartão) ──
  ev({ id: "d1", event_name: "PageView", fingerprint_id: "fp_ana", created_at: minsAgo(58), client_user_agent: UA_IPHONE, city: "Campinas" }),
  ev({ id: "d2", event_name: "ViewContent", fingerprint_id: "fp_ana", created_at: minsAgo(54), client_user_agent: UA_IPHONE, city: "Campinas", page_title: "Pós Grad. Biomecânica" }),
  ev({ id: "d3", event_name: "Lead", fingerprint_id: "fp_ana", created_at: minsAgo(50), client_user_agent: UA_IPHONE, city: "Campinas",
       lead_name: "Ana Souza", lead_email: "ana.souza@gmail.com", lead_phone: "+5519998877665", user_data: { em: "ana.souza@gmail.com", ph: "5519998877665" } }),
  ev({ id: "d4", event_name: "InitiateCheckout", fingerprint_id: "fp_ana", created_at: minsAgo(46), client_user_agent: UA_IPHONE, city: "Campinas" }),
  ev({ id: "d5", event_name: "Purchase", fingerprint_id: "fp_ana", created_at: minsAgo(44), client_user_agent: UA_IPHONE, city: "Campinas",
       lead_name: "Ana Souza", lead_email: "ana.souza@gmail.com",
       value: 1997, currency: "BRL", source: "eduzz", payment_method: "credit_card",
       external_transaction_id: "EZ-100501", product_name: "Pós-Grad. Biomecânica Aplicada",
       installments: null, installment_number: 1, installment_value: 1997 }),

  // ── Visitante 2: lead, sem compra ainda (CAPI pendente em 1) ──
  ev({ id: "d6", event_name: "PageView", fingerprint_id: "fp_carlos", created_at: minsAgo(120), client_user_agent: UA_ANDROID, city: "Belo Horizonte", country_region: "MG", utm_campaign: "[PTA] Musculação MPA" }),
  ev({ id: "d7", event_name: "ViewContent", fingerprint_id: "fp_carlos", created_at: minsAgo(116), client_user_agent: UA_ANDROID, city: "Belo Horizonte", country_region: "MG", capi_status: "pending" }),
  ev({ id: "d8", event_name: "Lead", fingerprint_id: "fp_carlos", created_at: minsAgo(110), client_user_agent: UA_ANDROID, city: "Belo Horizonte", country_region: "MG",
       lead_name: "Carlos Lima", lead_email: "carlos.lima@hotmail.com", lead_phone: "+5531991234567", user_data: { em: "carlos.lima@hotmail.com" } }),

  // ── Visitante 3: compra parcelada (boleto 3x) + order bump ──
  ev({ id: "d9", event_name: "PageView", fingerprint_id: "fp_julia", created_at: minsAgo(220), client_user_agent: UA_DESKTOP, city: "Curitiba", country_region: "PR", utm_campaign: "[PTA] Trein. Funcional" }),
  ev({ id: "d10", event_name: "Purchase", fingerprint_id: "fp_julia", created_at: minsAgo(210), client_user_agent: UA_DESKTOP, city: "Curitiba", country_region: "PR",
       lead_name: "Júlia Mendes", lead_email: "julia.mendes@gmail.com",
       value: 2400, currency: "BRL", source: "eduzz", payment_method: "boleto",
       external_transaction_id: "EZ-100777", product_name: "Pós-Grad. Treinamento Funcional TF",
       installments: 3, installment_number: 1, installment_value: 800 }),
  ev({ id: "d11", event_name: "Purchase", fingerprint_id: "fp_julia", created_at: minsAgo(210), client_user_agent: UA_DESKTOP, city: "Curitiba", country_region: "PR",
       lead_name: "Júlia Mendes", lead_email: "julia.mendes@gmail.com",
       value: 297, currency: "BRL", source: "eduzz", payment_method: "boleto",
       external_transaction_id: "EZ-100778", product_name: "Bônus: Avaliação Física",
       is_order_bump: true, main_sale_transaction_id: "EZ-100777",
       installments: 1, installment_number: 1, installment_value: 297 }),

  // ── Visitante 4: só PageView (visita fria), CAPI skipped ──
  ev({ id: "d12", event_name: "PageView", fingerprint_id: "fp_anon", created_at: minsAgo(8), client_user_agent: UA_ANDROID, city: "Recife", country_region: "PE",
       capi_status: "skipped", utm_source: "instagram", utm_campaign: "[PTA] Pós Grad. Femini" }),
];
