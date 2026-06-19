import { createHash } from "crypto";
import { NextRequest } from "next/server";

function sha256(value: string) {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

// eduzz_webhook_configs (migration 041): só usado pra achar a empresa pelo
// segredo do webhook — substituiu o lookup antigo em companies.settings.
const mockConfigMaybeSingle = jest.fn();
const mockConfigSelect = jest.fn(() => ({ eq: () => ({ maybeSingle: mockConfigMaybeSingle }) }));

// events_log.select: 3 usos diferentes (idempotência, match por tracker code,
// match por email/telefone) — todos terminam em maybeSingle(), na MESMA ordem
// que o código chama (ver POST() e resolveVisitMatch() em route.ts). Fila
// única de mockResolvedValueOnce, igual ao padrão de tracking.test.ts.
const mockEventsLogMaybeSingle = jest.fn();
function makeEventsLogQuery() {
  const query: { eq: jest.Mock; ilike: jest.Mock; order: jest.Mock; limit: jest.Mock; maybeSingle: () => unknown } = {
    eq: jest.fn(),
    ilike: jest.fn(),
    order: jest.fn(),
    limit: jest.fn(),
    maybeSingle: () => mockEventsLogMaybeSingle(),
  };
  query.eq.mockImplementation(() => query);
  query.ilike.mockImplementation(() => query);
  query.order.mockImplementation(() => query);
  query.limit.mockImplementation(() => query);
  return query;
}
const mockEventsLogSelect = jest.fn(() => makeEventsLogQuery());

const mockInsertSelect = jest.fn(() => ({ single: jest.fn(() => Promise.resolve({ data: { id: "evt-1" }, error: null })) }));
const mockInsert: jest.Mock = jest.fn(() => ({ select: mockInsertSelect }));
// .update() encadeia .eq() 1x (sendMetaCapiEvent) ou 2x (handleReversal,
// company_id + external_transaction_id) — chain thenable: cada .eq() retorna
// o próprio objeto (suporta N chamadas) e ele mesmo é awaitable no final.
const mockEq = jest.fn();
function makeUpdateChain() {
  const resolved = Promise.resolve({ data: null, error: null });
  const chain = {
    eq: (...args: unknown[]) => { mockEq(...args); return chain; },
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
  };
  return chain;
}
const mockUpdate = jest.fn(() => makeUpdateChain());

// tracking_pixels: mesma forma encadeada de tracking.test.ts.
const mockPixelMaybeSingle = jest.fn();
function makePixelQuery() {
  const query: { eq: jest.Mock; maybeSingle: () => unknown } = {
    eq: jest.fn(),
    maybeSingle: () => mockPixelMaybeSingle(),
  };
  query.eq.mockImplementation(() => query);
  return query;
}
const mockPixelSelect = jest.fn(() => makePixelQuery());

// campaign_metrics: select encadeado (4x .eq()) + upsert.
const mockMetricsMaybeSingle = jest.fn(() => Promise.resolve({ data: null, error: null }));
function makeMetricsQuery() {
  const query: { eq: jest.Mock; maybeSingle: () => unknown } = {
    eq: jest.fn(),
    maybeSingle: () => mockMetricsMaybeSingle(),
  };
  query.eq.mockImplementation(() => query);
  return query;
}
const mockMetricsSelect = jest.fn(() => makeMetricsQuery());
const mockMetricsUpsert = jest.fn(() => Promise.resolve({ error: null }));

// companies.eduzz_unmapped_purchase_action (migration 048) — política pra
// venda sem produto mapeado e sem visita. Default "sem dado" simula migration
// ainda não rodada, cai pro comportamento de sempre ('default_pixel') sem
// precisar mockar em todo teste que não é sobre essa feature.
// eduzz_product_pixel_map (migration 048/049) — mapeamento explícito
// produto→pixel. 2 formatos de query no mesmo mock: findMappedPixelId()
// termina em .maybeSingle() (espera 1 linha ou nada); companyHasProductMapping()
// só dá await direto no resultado de .limit() (espera um array). Ambos
// resolvem pelo MESMO valor mockado — por padrão "sem dado nenhum" (`{data: [],
// error: null}`), que funciona pra qualquer um dos 2 formatos como "sem
// mapeamento cadastrado" (caminho normal, allowlist nunca liga).
const mockProductMapResult = jest.fn(
  (): Promise<{ data: unknown; error: { message: string } | null }> => Promise.resolve({ data: [], error: null }),
);
function makeProductMapQuery() {
  const query = {
    eq: jest.fn(),
    in: jest.fn(),
    limit: jest.fn(),
    maybeSingle: () => mockProductMapResult(),
    then: (onResolve: (v: unknown) => unknown, onReject?: (e: unknown) => unknown) => mockProductMapResult().then(onResolve, onReject),
  };
  query.eq.mockImplementation(() => query);
  query.in.mockImplementation(() => query);
  query.limit.mockImplementation(() => query);
  return query;
}
const mockProductMapSelect = jest.fn(() => makeProductMapQuery());

const mockFrom = jest.fn((table: string) => {
  if (table === "eduzz_webhook_configs") return { select: mockConfigSelect };
  if (table === "tracking_pixels") return { select: mockPixelSelect };
  if (table === "events_log") return { select: mockEventsLogSelect, insert: mockInsert, update: mockUpdate };
  if (table === "campaign_metrics") return { select: mockMetricsSelect, upsert: mockMetricsUpsert };
  if (table === "eduzz_product_pixel_map") return { select: mockProductMapSelect };
  throw new Error(`tabela inesperada: ${table}`);
});

jest.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: mockFrom }),
}));

import { POST } from "@/app/api/eduzz/webhook/route";

function buildRequest(body: unknown, secret = "s3cr3t") {
  return new NextRequest(`http://localhost:3000/api/eduzz/webhook?secret=${secret}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const COMPANY_OK = { company_id: "company-1" };
const PIXEL_OK = {
  id: "pixel-1",
  meta_pixel_id: "PIXEL_123",
  meta_capi_token: "TOKEN_ABC",
  dominio_autorizado: null as string | null,
  meta_test_event_code: null as string | null,
};

// Ordem fixa de chamada no código, pra cada teste "feliz" com pixel configurado:
// 1) company pelo secret  2) idempotência (events_log)  3) métricas (campaign_metrics)
// 4) match por tracker/email/telefone (events_log, 0-3x)  5) pixel (tracking_pixels)
function mockNotYetProcessed() {
  mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // idempotência: não existe ainda
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMetricsMaybeSingle.mockResolvedValue({ data: null, error: null });
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ events_received: 1 }) }),
  ) as unknown as typeof fetch;
});

const LEGACY_PAYLOAD = {
  trans_status: "3",
  trans_cod: "TX-001",
  trans_paid: "197,00",
  cus_email: "comprador@teste.com",
  product_name: "Curso X",
  trans_paiddate: "2026-06-18",
  tracker_utm_source: "facebook",
};

const MODERN_PAYLOAD = {
  event: "myeduzz.invoice_paid",
  data: {
    status: "paid",
    buyer: { name: "Maria Silva", email: "maria@teste.com", cellphone: "11999998888" },
    utm: { source: "facebook", medium: "cpc", campaign: "lancamento" },
    tracker: { code1: null },
    paid: { value: 297, currency: "BRL" },
    transaction: { id: "TX-MODERN-1" },
    items: [{ name: "Curso Y" }],
    paymentMethod: "creditCard",
    paidAt: "2026-06-18T12:00:00Z",
  },
};

describe("POST /api/eduzz/webhook", () => {
  it("401 sem secret", async () => {
    const req = new NextRequest("http://localhost:3000/api/eduzz/webhook", {
      method: "POST",
      body: JSON.stringify(LEGACY_PAYLOAD),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("403 quando o secret não corresponde a nenhuma empresa", async () => {
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const res = await POST(buildRequest(LEGACY_PAYLOAD));
    expect(res.status).toBe(403);
  });

  it("formato antigo: ignora status não pago, não aciona nada", async () => {
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
    const res = await POST(buildRequest({ ...LEGACY_PAYLOAD, trans_status: "1" }));
    const json = await res.json();
    expect(json.ignored).toContain("status");
    expect(mockMetricsUpsert).not.toHaveBeenCalled();
  });

  it("formato antigo: agrega em campaign_metrics (regressão do comportamento que já existia)", async () => {
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
    mockNotYetProcessed();
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // resolveVisitMatch: sem match por email (sem telefone no payload antigo)
    mockPixelMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // sem pixel default -> sem Meta

    const res = await POST(buildRequest(LEGACY_PAYLOAD));
    expect(res.status).toBe(200);

    expect(mockMetricsUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ company_id: "company-1", campaign_name: "Curso X", revenue: 197, conversions: 1, source: "eduzz" }),
      expect.anything(),
    );
  });

  it("formato moderno: evento que não é invoice_paid é ignorado", async () => {
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
    const res = await POST(buildRequest({ ...MODERN_PAYLOAD, event: "myeduzz.invoice_scheduled" }));
    const json = await res.json();
    expect(json.ignored).toContain("event=");
    expect(mockMetricsUpsert).not.toHaveBeenCalled();
  });

  it("formato moderno: grava Purchase em events_log e manda pra Meta CAPI quando o pixel está configurado", async () => {
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
    mockNotYetProcessed();
    // resolveVisitMatch: sem tracker code -> tenta email (sem match) -> tenta telefone (sem match).
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    mockPixelMaybeSingle.mockResolvedValueOnce({ data: PIXEL_OK, error: null });

    const res = await POST(buildRequest(MODERN_PAYLOAD));
    expect(res.status).toBe(200);

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_name: "Purchase",
        company_id: "company-1",
        lead_email: "maria@teste.com",
        lead_phone: "11999998888",
        lead_name: "Maria Silva",
        value: 297,
        currency: "BRL",
        external_transaction_id: "TX-MODERN-1",
        source: "eduzz",
        capi_status: "pending",
        pixel_id: "pixel-1",
      }),
    );

    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("PIXEL_123"), expect.anything());
    const sentBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(sentBody.data[0].event_name).toBe("Purchase");
    expect(sentBody.data[0].event_id).toBe("TX-MODERN-1");
    expect(sentBody.data[0].action_source).toBe("system_generated");
    expect(sentBody.data[0].user_data.em).toBe(sha256("maria@teste.com"));
    expect(sentBody.data[0].custom_data).toEqual({ value: 297, currency: "BRL", content_name: "Curso Y", order_id: "TX-MODERN-1", num_items: 1 });

    expect(mockUpdate).toHaveBeenCalledWith({ capi_status: "sent" });
  });

  it("não chama a Meta quando a empresa não tem pixel configurado (mas grava o evento)", async () => {
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
    mockNotYetProcessed();
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // sem match por email
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // sem match por telefone
    mockPixelMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // sem pixel default

    await POST(buildRequest(MODERN_PAYLOAD));

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ capi_status: "skipped" }));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("idempotência: não reprocessa a mesma transação 2x (retry da Eduzz)", async () => {
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: { id: "evt-already" }, error: null }); // já existe

    const res = await POST(buildRequest(MODERN_PAYLOAD));
    const json = await res.json();

    expect(json.duplicate).toBe(true);
    expect(mockMetricsUpsert).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("correlaciona por tracker.code1 com uma visita rastreada e reaproveita fbp/fbc/event_url", async () => {
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
    mockNotYetProcessed();
    mockEventsLogMaybeSingle.mockResolvedValueOnce({
      data: {
        fingerprint_id: "dm-uid-visita-1",
        event_url: "http://site.com/pagina-de-vendas",
        pixel_id: "pixel-1",
        fbp: "fb.1.111.222",
        fbc: "fb.1.111.fbclid-x",
        country: "BR",
        country_region: "SP",
        city: "São Paulo",
        postal_code: "01310-100",
        client_ip_address: "200.1.2.3",
        client_user_agent: "Mozilla/5.0 (visita original)",
      },
      error: null,
    });
    mockPixelMaybeSingle.mockResolvedValueOnce({ data: PIXEL_OK, error: null });

    await POST(buildRequest({ ...MODERN_PAYLOAD, data: { ...MODERN_PAYLOAD.data, tracker: { code1: "dm-uid-visita-1" } } }));

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        fingerprint_id: "dm-uid-visita-1",
        event_url: "http://site.com/pagina-de-vendas",
        fbp: "fb.1.111.222",
        fbc: "fb.1.111.fbclid-x",
        client_ip_address: "200.1.2.3",
        client_user_agent: "Mozilla/5.0 (visita original)",
      }),
    );

    const sentBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(sentBody.data[0].event_source_url).toBe("http://site.com/pagina-de-vendas");
    expect(sentBody.data[0].user_data.fbp).toBe("fb.1.111.222");
    expect(sentBody.data[0].user_data.fbc).toBe("fb.1.111.fbclid-x");
    // IP/UA da visita correlacionada reaproveitados na Purchase (crus, sem hash).
    expect(sentBody.data[0].user_data.client_ip_address).toBe("200.1.2.3");
    expect(sentBody.data[0].user_data.client_user_agent).toBe("Mozilla/5.0 (visita original)");
    // ct usa hashNormalized: "São Paulo" -> "saopaulo" (regra da Meta).
    expect(sentBody.data[0].user_data.ct).toBe(sha256("saopaulo"));
  });

  it("sem nenhum match: usa fingerprint sintético (hash do email) e não manda fbp/fbc/event_source_url", async () => {
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
    mockNotYetProcessed();
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // sem match por email
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // sem match por telefone
    mockPixelMaybeSingle.mockResolvedValueOnce({ data: PIXEL_OK, error: null });

    await POST(buildRequest(MODERN_PAYLOAD));

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ fingerprint_id: sha256("maria@teste.com"), event_url: null, fbp: null, fbc: null }),
    );
    const sentBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(sentBody.data[0].event_source_url).toBeUndefined();
  });

  it("ignora parcela > 1 de boleto parcelado (venda já contada na parcela 1)", async () => {
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });

    const payload = { ...MODERN_PAYLOAD, data: { ...MODERN_PAYLOAD.data, bankSlipInstallment: { installmentNumber: 2, totalInstallments: 3 } } };
    const res = await POST(buildRequest(payload));
    const json = await res.json();

    expect(json.ignored).toContain("parcela 2");
    expect(mockMetricsUpsert).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("1ª parcela de boleto parcelado processa normal e grava o total de parcelas (pra exibir 'Boleto · 3x')", async () => {
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
    mockNotYetProcessed();
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // sem match por email
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // sem match por telefone
    mockPixelMaybeSingle.mockResolvedValueOnce({ data: PIXEL_OK, error: null });

    const payload = {
      ...MODERN_PAYLOAD,
      data: { ...MODERN_PAYLOAD.data, paymentMethod: "installmentBankslip", bankSlipInstallment: { installmentNumber: 1, totalInstallments: 3 } },
    };
    await POST(buildRequest(payload));

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ installments: 3, payment_method: "installmentBankslip" }));
  });

  it("order bump: notificação separada da venda principal grava is_order_bump e o vínculo com mainSaleId", async () => {
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
    mockNotYetProcessed();
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // sem match por email
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // sem match por telefone
    mockPixelMaybeSingle.mockResolvedValueOnce({ data: PIXEL_OK, error: null });

    const payload = {
      ...MODERN_PAYLOAD,
      data: {
        ...MODERN_PAYLOAD.data,
        transaction: { id: "TX-BUMP-1" },
        items: [{ name: "Gadget Y" }],
        paid: { value: 50, currency: "BRL" },
        orderBump: { has: true, isMainSale: false, mainSaleId: "TX-MODERN-1" },
      },
    };
    await POST(buildRequest(payload));

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        is_order_bump: true,
        main_sale_transaction_id: "TX-MODERN-1",
        product_name: "Gadget Y",
        value: 50,
        external_transaction_id: "TX-BUMP-1",
      }),
    );
  });

  it("manda content_ids/contents/subscription_id pra Meta quando o payload tem productId e contract", async () => {
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
    mockNotYetProcessed();
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // isKnownRecurrence: 1ª cobrança, sem renovação anterior
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // sem match por email
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // sem match por telefone
    mockPixelMaybeSingle.mockResolvedValueOnce({ data: PIXEL_OK, error: null });

    const payload = {
      ...MODERN_PAYLOAD,
      data: {
        ...MODERN_PAYLOAD.data,
        items: [{ productId: "P567", name: "Curso Y", price: { value: 297, currency: "BRL" } }],
        contract: { id: "sub-1" },
      },
    };
    await POST(buildRequest(payload));

    const sentBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(sentBody.data[0].custom_data).toEqual(
      expect.objectContaining({
        content_type: "product",
        content_ids: ["P567"],
        contents: [{ id: "P567", quantity: 1, item_price: 297 }],
        num_items: 1,
        subscription_id: "sub-1",
      }),
    );
  });

  it("assinatura recorrente: 1ª cobrança processa normal e usa o valor cheio (price, não paid)", async () => {
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // shouldSkipRecurring: 1ª vez, sem renovação anterior
    mockNotYetProcessed();
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // sem match por email
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // sem match por telefone
    mockPixelMaybeSingle.mockResolvedValueOnce({ data: PIXEL_OK, error: null });

    const payload = {
      ...MODERN_PAYLOAD,
      data: { ...MODERN_PAYLOAD.data, price: { value: 970, currency: "BRL" }, contract: { id: "sub-1" } },
    };
    const res = await POST(buildRequest(payload));
    expect(res.status).toBe(200);

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ value: 970, recurrence_key: "sub-1" }));
  });

  it("assinatura recorrente: renovação (mesmo recurrence_key já visto) guarda receita mas NÃO manda pra Meta", async () => {
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
    mockNotYetProcessed(); // alreadyProcessed: essa transação (da renovação) ainda não foi vista
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: { id: "evt-primeira-cobranca" }, error: null }); // isKnownRecurrence: já existe esse recurrence_key

    const payload = { ...MODERN_PAYLOAD, data: { ...MODERN_PAYLOAD.data, contract: { id: "sub-1" } } };
    const res = await POST(buildRequest(payload));
    const json = await res.json();

    expect(json.renewal).toBe(true);
    expect(mockMetricsUpsert).toHaveBeenCalledWith(expect.objectContaining({ campaign_name: "Curso Y", revenue: 297 }), expect.anything());
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ event_name: "Renewal", recurrence_key: "sub-1", capi_status: "skipped" }));
    expect(global.fetch).not.toHaveBeenCalled(); // nunca manda renovação pra Meta
  });

  it("reembolso (invoice_refunded) marca a venda já gravada como status=refunded", async () => {
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });

    const payload = { event: "myeduzz.invoice_refunded", data: { buyer: {}, transaction: { id: "TX-MODERN-1" } } };
    const res = await POST(buildRequest(payload));
    const json = await res.json();

    expect(json.status).toBe("refunded");
    expect(mockUpdate).toHaveBeenCalledWith({ status: "refunded" });
    expect(mockEq).toHaveBeenCalledWith("external_transaction_id", "TX-MODERN-1");
  });

  it("chargeback (invoice_chargeback) marca a venda já gravada como status=chargeback", async () => {
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });

    const payload = { event: "myeduzz.invoice_chargeback", data: { buyer: {}, transaction: { id: "TX-MODERN-1" } } };
    const res = await POST(buildRequest(payload));
    const json = await res.json();

    expect(json.status).toBe("chargeback");
    expect(mockUpdate).toHaveBeenCalledWith({ status: "chargeback" });
  });

  it("produto mapeado (migration 048/049, por parentId) vence a visita correlacionada", async () => {
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
    mockNotYetProcessed();
    // resolveVisitMatch acha visita por email, ligada a um pixel — mas o mapeamento explícito tem que vencer essa.
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: { fingerprint_id: "fp-1", event_url: "https://x.com", pixel_id: "pixel-DA-VISITA" }, error: null });
    mockProductMapResult.mockResolvedValueOnce({ data: { pixel_id: "pixel-MAPEADO" }, error: null }); // findMappedPixelId
    mockPixelMaybeSingle.mockResolvedValueOnce({ data: { ...PIXEL_OK, meta_pixel_id: "PIXEL_MAPEADO_999" }, error: null });

    const payload = { ...MODERN_PAYLOAD, data: { ...MODERN_PAYLOAD.data, items: [{ name: "Curso Y", parentId: "curso-pai-1" }] } };
    const res = await POST(buildRequest(payload));
    expect(res.status).toBe(200);

    expect(mockProductMapSelect).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("PIXEL_MAPEADO_999"), expect.anything());
  });

  it("produto mapeado por productId (não só parentId) também casa", async () => {
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
    mockNotYetProcessed();
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // sem match por email
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // sem match por telefone
    mockProductMapResult.mockResolvedValueOnce({ data: { pixel_id: "pixel-MAPEADO" }, error: null });
    mockPixelMaybeSingle.mockResolvedValueOnce({ data: { ...PIXEL_OK, meta_pixel_id: "PIXEL_POR_PRODUCTID" }, error: null });

    const payload = { ...MODERN_PAYLOAD, data: { ...MODERN_PAYLOAD.data, items: [{ name: "Curso Y", productId: "3048488" }] } };
    const res = await POST(buildRequest(payload));
    expect(res.status).toBe(200);

    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("PIXEL_POR_PRODUCTID"), expect.anything());
  });

  it("allowlist: empresa com 1+ produto mapeado ignora venda de produto SEM vínculo, mesmo com visita correlacionada", async () => {
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
    mockNotYetProcessed();
    // tem visita correlacionada, mas não importa — produto desta venda não tem mapeamento e a empresa já usa a allowlist.
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: { fingerprint_id: "fp-1", event_url: "https://x.com", pixel_id: "pixel-DA-VISITA" }, error: null });
    mockProductMapResult.mockResolvedValueOnce({ data: null, error: null }); // findMappedPixelId: productId desta venda não está mapeado
    mockProductMapResult.mockResolvedValueOnce({ data: [{ id: "map-1" }], error: null }); // companyHasProductMapping: empresa tem outros produtos mapeados

    const payload = { ...MODERN_PAYLOAD, data: { ...MODERN_PAYLOAD.data, items: [{ name: "Curso Z", productId: "id-nao-mapeado" }] } };
    const res = await POST(buildRequest(payload));
    expect(res.status).toBe(200);

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ capi_status: "skipped", pixel_id: null }));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockPixelSelect).not.toHaveBeenCalled(); // nem chega a resolver pixel da visita nem o padrão
  });

  it("sem nenhum produto mapeado na empresa: comportamento de sempre (visita → pixel padrão), allowlist nunca liga", async () => {
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
    mockNotYetProcessed();
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // sem match por email
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // sem match por telefone
    mockPixelMaybeSingle.mockResolvedValueOnce({ data: PIXEL_OK, error: null }); // resolveDefaultPixel

    const res = await POST(buildRequest(MODERN_PAYLOAD)); // items sem productId/parentId -> sem candidato algum
    expect(res.status).toBe(200);

    expect(global.fetch).toHaveBeenCalled();
  });
});
