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

// events_log.select: maioria dos usos (idempotência, match por tracker code,
// match por email/telefone, isKnownRecurrence) termina em maybeSingle(), na
// MESMA ordem que o código chama (ver POST() e resolveVisitMatch() em
// route.ts) — fila única de mockResolvedValueOnce, igual ao padrão de
// tracking.test.ts. countRecurrenceCharges() é DIFERENTE: não chama
// maybeSingle(), dá await direto na query (espera um array) — por isso tem
// mock PRÓPRIO (mockEventsLogCount), pra não disputar a mesma fila do
// maybeSingle (senão bagunçaria a ordem de TODOS os outros testes).
const mockEventsLogMaybeSingle = jest.fn();
const mockEventsLogCount = jest.fn((): Promise<{ data: unknown[]; error: { message: string } | null }> => Promise.resolve({ data: [], error: null }));
function makeEventsLogQuery() {
  const query: { eq: jest.Mock; ilike: jest.Mock; order: jest.Mock; limit: jest.Mock; maybeSingle: () => unknown; then: (...args: never[]) => unknown } = {
    eq: jest.fn(),
    ilike: jest.fn(),
    order: jest.fn(),
    limit: jest.fn(),
    maybeSingle: () => mockEventsLogMaybeSingle(),
    then: (onResolve: (v: unknown) => unknown, onReject?: (e: unknown) => unknown) => mockEventsLogCount().then(onResolve, onReject),
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
// company_id + external_transaction_id), e .is() no backfill de contrato
// (.eq().eq().is("installments", null)) — chain thenable: cada eq/is retorna
// o próprio objeto (suporta N chamadas) e ele mesmo é awaitable no final.
const mockEq = jest.fn();
function makeUpdateChain() {
  const resolved = Promise.resolve({ data: null, error: null });
  const chain = {
    eq: (...args: unknown[]) => { mockEq(...args); return chain; },
    is: () => chain,
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
const mockMetricsMaybeSingle = jest.fn(
  (): Promise<{ data: { revenue: number; conversions: number } | null; error: { message: string } | null }> =>
    Promise.resolve({ data: null, error: null }),
);
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
// eduzz_products (migration 050) — catálogo produto→pixel. 2 formatos de
// query no mesmo mock: findProductPixelId() termina em .maybeSingle() (espera
// 1 linha ou nada); companyHasAnyProductPixel() só dá await direto no
// resultado de .limit() (espera um array). Ambos resolvem pelo MESMO valor
// mockado — por padrão "sem dado nenhum" (`{data: [], error: null}`), que
// funciona pra qualquer um dos 2 formatos como "produto sem pixel escolhido"
// (caminho normal, allowlist nunca liga).
const mockProductsResult = jest.fn(
  (): Promise<{ data: unknown; error: { message: string } | null }> => Promise.resolve({ data: [], error: null }),
);
function makeProductsQuery() {
  const query = {
    eq: jest.fn(),
    not: jest.fn(),
    limit: jest.fn(),
    maybeSingle: () => mockProductsResult(),
    then: (onResolve: (v: unknown) => unknown, onReject?: (e: unknown) => unknown) => mockProductsResult().then(onResolve, onReject),
  };
  query.eq.mockImplementation(() => query);
  query.not.mockImplementation(() => query);
  query.limit.mockImplementation(() => query);
  return query;
}
const mockProductsSelect = jest.fn(() => makeProductsQuery());
// upsertProductCatalog() — sempre dá await direto, sem mais nada encadeado.
const mockProductsUpsert = jest.fn(() => Promise.resolve({ data: null, error: null }));
const mockOffersUpsert = jest.fn(() => Promise.resolve({ data: null, error: null }));

// eduzz_contracts (migration 052) — "ficha do contrato" (nº de parcelas, se
// tem fim definido), só existe pra assinatura/PSL. findContractTotalInstallments()
// termina em .maybeSingle() (2x .eq() antes); default "sem ficha" (data: null)
// = comportamento de sempre, sem multiplicar nada (mesma ideia do default dos
// outros mocks "sem dado" desta suite).
const mockContractMaybeSingle = jest.fn(
  (): Promise<{ data: { total_installments: number; is_finite: boolean } | null; error: { message: string } | null }> =>
    Promise.resolve({ data: null, error: null }),
);
function makeContractQuery() {
  const query: { eq: jest.Mock; maybeSingle: () => unknown } = {
    eq: jest.fn(),
    maybeSingle: () => mockContractMaybeSingle(),
  };
  query.eq.mockImplementation(() => query);
  return query;
}
const mockContractSelect = jest.fn(() => makeContractQuery());
const mockContractUpsert = jest.fn(() => Promise.resolve({ data: null, error: null }));

const mockFrom = jest.fn((table: string) => {
  if (table === "eduzz_webhook_configs") return { select: mockConfigSelect };
  if (table === "tracking_pixels") return { select: mockPixelSelect };
  if (table === "events_log") return { select: mockEventsLogSelect, insert: mockInsert, update: mockUpdate };
  if (table === "campaign_metrics") return { select: mockMetricsSelect, upsert: mockMetricsUpsert };
  if (table === "eduzz_products") return { select: mockProductsSelect, upsert: mockProductsUpsert };
  if (table === "eduzz_product_offers") return { upsert: mockOffersUpsert };
  if (table === "eduzz_contracts") return { select: mockContractSelect, upsert: mockContractUpsert };
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

// Nenhuma venda manda pra Meta sem o produto ter um pixel escolhido no
// catálogo (eduzz_products) — decisão explícita, não cai mais pra visita
// correlacionada nem pro pixel padrão da empresa. Testes "felizes" (que
// esperam Meta chamada) precisam disso ANTES do mock de tracking_pixels
// (mockPixelMaybeSingle), na mesma ordem que findProductPixelId() roda.
function mockProductPixelConfigured(pixelId = "pixel-1") {
  mockProductsResult.mockResolvedValueOnce({ data: { pixel_id: pixelId }, error: null });
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
    // parentId presente por padrão — produto precisa de pixel escolhido no
    // catálogo pra mandar pra Meta (decisão: nenhuma venda manda sem
    // configuração explícita, nem por visita correlacionada nem por padrão).
    items: [{ name: "Curso Y", parentId: "curso-padrao" }],
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
    // formato antigo nunca manda parentId -> findProductPixelId nem consulta o banco, sem Meta.

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
    mockProductPixelConfigured();
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

  it("não chama a Meta quando o produto não tem pixel escolhido no catálogo (mas grava o evento)", async () => {
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
    mockNotYetProcessed();
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // sem match por email
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // sem match por telefone
    // produto sem pixel escolhido (default da fila: sem dado) — nem resolve tracking_pixels.

    await POST(buildRequest(MODERN_PAYLOAD));

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ capi_status: "skipped", pixel_id: null }));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockPixelSelect).not.toHaveBeenCalled();
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
    mockProductPixelConfigured();
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
    mockProductPixelConfigured();
    mockPixelMaybeSingle.mockResolvedValueOnce({ data: PIXEL_OK, error: null });

    await POST(buildRequest(MODERN_PAYLOAD));

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ fingerprint_id: sha256("maria@teste.com"), event_url: null, fbp: null, fbc: null }),
    );
    const sentBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(sentBody.data[0].event_source_url).toBeUndefined();
  });

  it("parcela > 1 de boleto parcelado: grava linha própria (event_name=Installment, valor só dessa parcela), sem somar receita nem mandar pra Meta", async () => {
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // idempotência da parcela (chave sintética própria)
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // recordInstallment correlaciona visita: sem match por email
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // sem match por telefone

    const payload = {
      ...MODERN_PAYLOAD,
      data: { ...MODERN_PAYLOAD.data, paid: { value: 297, currency: "BRL" }, bankSlipInstallment: { installmentNumber: 2, totalInstallments: 3 } },
    };
    const res = await POST(buildRequest(payload));
    const json = await res.json();

    expect(json.installment).toBe(true);
    expect(json.parcela).toBe(2);
    expect(mockMetricsUpsert).not.toHaveBeenCalled(); // valor cheio já foi somado na parcela 1, não soma de novo aqui
    expect(global.fetch).not.toHaveBeenCalled(); // não é conversão nova, não manda pra Meta

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_name: "Installment",
        value: 297, // só o valor DESSA parcela, não o total (891)
        installment_number: 2,
        installments: 3,
        main_sale_transaction_id: "TX-MODERN-1", // liga com a venda principal (parcela 1)
        external_transaction_id: "TX-MODERN-1-parcela-2",
        capi_status: "skipped",
      }),
    );
  });

  it("parcela > 1 de boleto parcelado: retry da Eduzz (mesma parcela 2x) não duplica a linha", async () => {
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: { id: "evt-parcela-2-ja-gravada" }, error: null });

    const payload = { ...MODERN_PAYLOAD, data: { ...MODERN_PAYLOAD.data, bankSlipInstallment: { installmentNumber: 2, totalInstallments: 3 } } };
    const res = await POST(buildRequest(payload));
    const json = await res.json();

    expect(json.duplicate).toBe(true);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("1ª parcela de boleto parcelado processa normal, multiplica pro valor cheio e grava o total de parcelas (pra exibir 'Boleto · 3x')", async () => {
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
    mockNotYetProcessed();
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // sem match por email
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // sem match por telefone
    // produto sem pixel escolhido — teste só verifica os campos gravados, não o envio à Meta.

    const payload = {
      ...MODERN_PAYLOAD,
      data: { ...MODERN_PAYLOAD.data, paymentMethod: "installmentBankslip", bankSlipInstallment: { installmentNumber: 1, totalInstallments: 3 } },
    };
    await POST(buildRequest(payload));

    // MODERN_PAYLOAD manda paid.value=297 (só dessa parcela) — price/paid são
    // "valor da FATURA", não da compra (confirmado na doc oficial da Eduzz),
    // então o valor cheio é 297 × 3 = 891, não 297.
    // value = total (891) pro card mostrar o valor cheio; installment_value =
    // só o que essa 1ª parcela cobrou de fato (297) — os 2 ficam diferentes.
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ installments: 3, payment_method: "installmentBankslip", value: 891, installment_value: 297 }),
    );
  });

  it("order bump: notificação separada da venda principal grava is_order_bump e o vínculo com mainSaleId", async () => {
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
    mockNotYetProcessed();
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // sem match por email
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // sem match por telefone
    // produto sem pixel escolhido — teste só verifica os campos gravados, não o envio à Meta.

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
    mockProductPixelConfigured();
    mockPixelMaybeSingle.mockResolvedValueOnce({ data: PIXEL_OK, error: null });

    const payload = {
      ...MODERN_PAYLOAD,
      data: {
        ...MODERN_PAYLOAD.data,
        items: [{ productId: "P567", parentId: "curso-padrao", name: "Curso Y", price: { value: 297, currency: "BRL" } }],
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

  it("assinatura recorrente: 1ª cobrança sem ficha de contrato (contract_created nunca recebido) usa o valor da cobrança, sem inventar total", async () => {
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // shouldSkipRecurring: 1ª vez, sem renovação anterior
    mockNotYetProcessed();
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // sem match por email
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // sem match por telefone
    // produto sem pixel escolhido — teste só verifica os campos gravados, não o envio à Meta.

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
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // recordRenewal correlaciona visita: sem match por email
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // sem match por telefone
    // sem ficha em eduzz_contracts (default) e sem linhas anteriores contadas (default mockEventsLogCount: []) -> installment_number=1.

    const payload = { ...MODERN_PAYLOAD, data: { ...MODERN_PAYLOAD.data, contract: { id: "sub-1" } } };
    const res = await POST(buildRequest(payload));
    const json = await res.json();

    expect(json.renewal).toBe(true);
    expect(mockMetricsUpsert).toHaveBeenCalledWith(expect.objectContaining({ campaign_name: "Curso Y", revenue: 297 }), expect.anything());
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ event_name: "Renewal", recurrence_key: "sub-1", capi_status: "skipped", installment_number: 1 }));
    expect(global.fetch).not.toHaveBeenCalled(); // nunca manda renovação pra Meta
  });

  it("assinatura recorrente: renovação numera a cobrança atual (3ª de 12) usando a ficha do contrato e a contagem de linhas já gravadas", async () => {
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
    mockNotYetProcessed();
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: { id: "evt-primeira-cobranca" }, error: null }); // isKnownRecurrence
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // recordRenewal correlaciona visita: sem match por email
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // sem match por telefone
    mockContractMaybeSingle.mockResolvedValueOnce({ data: { total_installments: 12, is_finite: true }, error: null });
    mockEventsLogCount.mockResolvedValueOnce({ data: [{ id: "evt-1" }, { id: "evt-2" }], error: null }); // já existem 2 linhas (1ª cobrança + 1 renovação) -> essa é a 3ª

    const payload = { ...MODERN_PAYLOAD, data: { ...MODERN_PAYLOAD.data, paid: { value: 10, currency: "BRL" }, contract: { id: "sub-psl-1" } } };
    await POST(buildRequest(payload));

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ event_name: "Renewal", recurrence_key: "sub-psl-1", installment_number: 3, installments: 12, value: 10 }),
    );
  });

  it("contract_created guarda a ficha do contrato (nº de parcelas, fim definido) em eduzz_contracts, sem tratar como venda", async () => {
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });

    const payload = {
      event: "myeduzz.contract_created",
      data: {
        contract: {
          id: "sub-psl-1",
          isUnlimitedInstallments: true,
          payment: { totalOfInstallments: 12 },
          recurrence: { isFinite: true, price: { value: 299, currency: "BRL" } },
        },
      },
    };
    const res = await POST(buildRequest(payload));
    const json = await res.json();

    expect(json.received).toBe(true);
    expect(mockContractUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: "company-1",
        contract_id: "sub-psl-1",
        total_installments: 12,
        is_finite: true,
        is_unlimited_installments: true,
        charge_value: 299,
        currency: "BRL",
      }),
      expect.objectContaining({ onConflict: "company_id,contract_id" }),
    );
    // Não é venda — não passa por nenhuma lógica de SaleEvent.
    expect(mockMetricsUpsert).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("contract_updated atualiza a mesma ficha (ex.: cliente fez upgrade, nº de parcelas mudou)", async () => {
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });

    const payload = {
      event: "myeduzz.contract_updated",
      data: { reason: "upgrade", contract: { id: "sub-psl-1", payment: { totalOfInstallments: 10 }, recurrence: { isFinite: true, price: { value: 350 } } } },
    };
    await POST(buildRequest(payload));

    expect(mockContractUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ contract_id: "sub-psl-1", total_installments: 10, charge_value: 350 }),
      expect.anything(),
    );
  });

  it("contract_created backfilla a Purchase quando o invoice_paid chegou ANTES (corrige valor cheio retroativo)", async () => {
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
    // backfill: acha a Purchase já gravada com o valor da cobrança (10 === installment_value, sem multiplicação).
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: { id: "evt-p", value: 10, installment_value: 10 }, error: null });

    const payload = {
      event: "myeduzz.contract_created",
      data: { contract: { id: "sub-late", payment: { totalOfInstallments: 12 }, recurrence: { isFinite: true, price: { value: 10 } } } },
    };
    await POST(buildRequest(payload));

    // 1) preenche o total de parcelas nas linhas que estavam sem; 2) recalcula o valor cheio (10 × 12 = 120).
    expect(mockUpdate).toHaveBeenCalledWith({ installments: 12 });
    expect(mockUpdate).toHaveBeenCalledWith({ value: 120 });
  });

  it("renovação entra como RECEITA mas NÃO conta conversão nova (conversions += 0)", async () => {
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
    mockNotYetProcessed();
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: { id: "evt-1a" }, error: null }); // isKnownRecurrence
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // match email
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // match telefone
    mockMetricsMaybeSingle.mockResolvedValueOnce({ data: { revenue: 1000, conversions: 5 }, error: null });

    const payload = { ...MODERN_PAYLOAD, data: { ...MODERN_PAYLOAD.data, contract: { id: "sub-1" } } };
    await POST(buildRequest(payload));

    // revenue soma (1000 + 297), conversions fica em 5 (renovação não é venda nova).
    expect(mockMetricsUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ revenue: 1297, conversions: 5 }),
      expect.anything(),
    );
  });

  it("normaliza country da Eduzz pra ISO-2 antes de gravar/hashear (Brazil -> BR)", async () => {
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
    mockNotYetProcessed();
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // match email
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // match telefone
    mockProductPixelConfigured();
    mockPixelMaybeSingle.mockResolvedValueOnce({ data: PIXEL_OK, error: null });

    const payload = {
      ...MODERN_PAYLOAD,
      data: { ...MODERN_PAYLOAD.data, buyer: { ...MODERN_PAYLOAD.data.buyer, address: { country: "Brazil", state: "PR", city: "Palmas", zipCode: "85555000" } } },
    };
    await POST(buildRequest(payload));

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ country: "BR" }));
    const sentBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(sentBody.data[0].user_data.country).toBe(sha256("BR")); // hash de "br", não "brazil"
  });

  it("grava o erro DETALHADO da Meta quando a CAPI rejeita (não só 'Invalid parameter')", async () => {
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
    mockNotYetProcessed();
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // match email
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // match telefone
    mockProductPixelConfigured();
    mockPixelMaybeSingle.mockResolvedValueOnce({ data: PIXEL_OK, error: null });
    global.fetch = jest.fn(() => Promise.resolve({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: { message: "Invalid parameter", error_user_msg: "O campo country não é válido", error_subcode: 2804003, fbtrace_id: "Abc123" } }),
    })) as unknown as typeof fetch;

    await POST(buildRequest(MODERN_PAYLOAD));

    const failed = mockUpdate.mock.calls.map((c) => (c as unknown[])[0] as { capi_status?: string; capi_error?: string }).find((u) => u?.capi_status === "failed");
    expect(failed).toBeTruthy();
    expect(failed!.capi_error).toContain("O campo country não é válido");
    expect(failed!.capi_error).toContain("subcode 2804003");
    expect(failed!.capi_error).toContain("fbtrace Abc123");
  });

  it("PSL com ficha conhecida: 1ª cobrança manda valor CHEIO pra Meta/events_log, mas campaign_metrics soma só o valor da cobrança (sem dobrar a receita)", async () => {
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // isKnownRecurrence: 1ª cobrança
    mockNotYetProcessed();
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // sem match por email
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // sem match por telefone
    mockProductPixelConfigured();
    mockPixelMaybeSingle.mockResolvedValueOnce({ data: PIXEL_OK, error: null });
    // ficha do contrato: 12 parcelas, fim definido — achada por findContractTotalInstallments().
    mockContractMaybeSingle.mockResolvedValueOnce({ data: { total_installments: 12, is_finite: true }, error: null });

    const payload = { ...MODERN_PAYLOAD, data: { ...MODERN_PAYLOAD.data, paid: { value: 10, currency: "BRL" }, contract: { id: "sub-psl-1" } } };
    await POST(buildRequest(payload));

    // Receita REAL dessa cobrança (não o contrato cheio) — upsertCampaignMetrics
    // já rodou ANTES de recordSale, com o valor original (10), então não dobra
    // quando as próximas 11 renovações somarem de novo.
    expect(mockMetricsUpsert).toHaveBeenCalledWith(expect.objectContaining({ revenue: 10 }), expect.anything());

    // Card da venda/relatório mostra o valor CHEIO do contrato (10 × 12 = 120)
    // e já vem com o total de parcelas + nº da parcela (1ª cobrança = 1).
    expect(mockInsert).toHaveBeenCalledWith(
      // value = total do contrato (120); installment_value = só essa 1ª cobrança (10).
      expect.objectContaining({ value: 120, recurrence_key: "sub-psl-1", installments: 12, installment_number: 1, installment_value: 10 }),
    );

    // Meta também recebe o valor cheio (decisão explícita do usuário — ajuda
    // a otimizar campanha pelo valor real do negócio, não só a 1ª cobrança).
    const sentBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(sentBody.data[0].custom_data.value).toBe(120);
  });

  it("PSL sem ficha conhecida (contract_created não recebido ainda): usa o valor da cobrança, sem adivinhar total", async () => {
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // isKnownRecurrence: 1ª cobrança
    mockNotYetProcessed();
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // sem match por email
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // sem match por telefone
    // sem pixel configurado e sem ficha em eduzz_contracts (default da fila: null).

    const payload = { ...MODERN_PAYLOAD, data: { ...MODERN_PAYLOAD.data, paid: { value: 10, currency: "BRL" }, contract: { id: "sub-psl-novo" } } };
    await POST(buildRequest(payload));

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ value: 10, recurrence_key: "sub-psl-novo" }));
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

  it("produto com pixel escolhido no catálogo (migration 050, por parentId) vence a visita correlacionada", async () => {
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
    mockNotYetProcessed();
    // resolveVisitMatch acha visita por email, ligada a um pixel — mas o produto com pixel escolhido no catálogo tem que vencer essa.
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: { fingerprint_id: "fp-1", event_url: "https://x.com", pixel_id: "pixel-DA-VISITA" }, error: null });
    mockProductsResult.mockResolvedValueOnce({ data: { pixel_id: "pixel-MAPEADO" }, error: null }); // findProductPixelId
    mockPixelMaybeSingle.mockResolvedValueOnce({ data: { ...PIXEL_OK, meta_pixel_id: "PIXEL_MAPEADO_999" }, error: null });

    const payload = { ...MODERN_PAYLOAD, data: { ...MODERN_PAYLOAD.data, items: [{ name: "Curso Y", parentId: "curso-pai-1" }] } };
    const res = await POST(buildRequest(payload));
    expect(res.status).toBe(200);

    expect(mockProductsSelect).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("PIXEL_MAPEADO_999"), expect.anything());
  });

  it("venda com produto novo (parentId + productId) auto-popula o catálogo (eduzz_products + eduzz_product_offers)", async () => {
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
    mockNotYetProcessed();
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // sem match por email
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // sem match por telefone
    // produto novo nunca tem pixel escolhido ainda — não manda pra Meta, só popula o catálogo.

    const payload = { ...MODERN_PAYLOAD, data: { ...MODERN_PAYLOAD.data, items: [{ name: "Curso Y", productId: "3048488", parentId: "curso-pai-2" }] } };
    const res = await POST(buildRequest(payload));
    expect(res.status).toBe(200);

    expect(mockProductsUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ parent_id: "curso-pai-2", name: "Curso Y" }),
      expect.objectContaining({ onConflict: "company_id,parent_id", ignoreDuplicates: true }),
    );
    expect(mockOffersUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ parent_id: "curso-pai-2", product_id: "3048488", name: "Curso Y" }),
      expect.objectContaining({ onConflict: "company_id,product_id" }),
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("produto sem pixel escolhido nunca manda pra Meta, mesmo com visita correlacionada (decisão: só envia o que for configurado)", async () => {
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
    mockNotYetProcessed();
    // tem visita correlacionada (pixel-DA-VISITA) — mas não importa mais, pixel só vem do catálogo agora.
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: { fingerprint_id: "fp-1", event_url: "https://x.com", pixel_id: "pixel-DA-VISITA" }, error: null });
    // findProductPixelId: produto sem pixel escolhido (default da fila: sem dado).

    const payload = { ...MODERN_PAYLOAD, data: { ...MODERN_PAYLOAD.data, items: [{ name: "Curso Z", parentId: "curso-sem-pixel" }] } };
    const res = await POST(buildRequest(payload));
    expect(res.status).toBe(200);

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ capi_status: "skipped", pixel_id: null }));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockPixelSelect).not.toHaveBeenCalled(); // nem chega a resolver pixel nenhum (nem da visita, nem padrão)
  });

  it("formato antigo (sem parentId) nunca manda pra Meta — sem item estruturado não tem como configurar produto nenhum", async () => {
    mockConfigMaybeSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
    mockNotYetProcessed();
    mockEventsLogMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); // sem match por email

    const res = await POST(buildRequest(LEGACY_PAYLOAD));
    expect(res.status).toBe(200);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockPixelSelect).not.toHaveBeenCalled();
  });
});
