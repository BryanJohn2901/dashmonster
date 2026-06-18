import { createHash } from "crypto";
import { NextRequest } from "next/server";

function sha256(value: string) {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

// companies: usado tanto pro lookup do id (sempre, 1ª chamada) quanto pro
// fallback de config legada (só quando tracking_pixels não existe, 2ª
// chamada) — mesma fila de mockResolvedValueOnce, a ordem das chamadas
// no código é sempre a mesma então a ordem dos mocks também é.
const mockCompanySingle = jest.fn();
const mockCompanySelect = jest.fn(() => ({ eq: () => ({ single: mockCompanySingle }) }));

// tracking_pixels: query encadeada com .eq() chamado mais de uma vez
// (company_id + slug/is_default) antes do .maybeSingle() terminal.
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

const mockInsertSelect = jest.fn(() => ({ single: jest.fn(() => Promise.resolve({ data: { id: "evt-1" }, error: null })) }));
const mockInsert: jest.Mock = jest.fn(() => ({ select: mockInsertSelect }));
const mockEq = jest.fn(() => Promise.resolve({ data: null, error: null }));
const mockUpdate = jest.fn(() => ({ eq: mockEq }));

const mockFrom = jest.fn((table: string) => {
  if (table === "companies") return { select: mockCompanySelect };
  if (table === "tracking_pixels") return { select: mockPixelSelect };
  if (table === "events_log") return { insert: mockInsert, update: mockUpdate };
  throw new Error(`tabela inesperada: ${table}`);
});

jest.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: () => ({ from: mockFrom }),
}));

import { POST } from "@/app/api/tracking/track-event/route";

function buildRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost:3000/api/tracking/track-event", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000", ...headers },
    body: JSON.stringify(body),
  });
}

const COMPANY_ID_OK = { id: "company-1" };
const PIXEL_OK = {
  id: "pixel-1",
  meta_pixel_id: "PIXEL_123",
  meta_capi_token: "TOKEN_ABC",
  dominio_autorizado: "localhost",
  meta_test_event_code: null as string | null,
};

function mockHappyPath(pixelOverrides: Partial<typeof PIXEL_OK> = {}) {
  mockCompanySingle.mockResolvedValueOnce({ data: COMPANY_ID_OK, error: null });
  mockPixelMaybeSingle.mockResolvedValueOnce({ data: { ...PIXEL_OK, ...pixelOverrides }, error: null });
}

function lastPixelEqCalls() {
  const results = mockPixelSelect.mock.results;
  const query = results[results.length - 1]?.value as { eq: jest.Mock };
  return query.eq.mock.calls;
}

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ events_received: 1 }),
    }),
  ) as unknown as typeof fetch;
});

describe("POST /api/tracking/track-event", () => {
  it("400 quando falta client_id/event_name", async () => {
    const res = await POST(buildRequest({ event_url: "http://x" }));
    expect(res.status).toBe(400);
  });

  it("404 quando empresa não existe", async () => {
    mockCompanySingle.mockResolvedValueOnce({ data: null, error: { message: "not found" } });
    const res = await POST(buildRequest({ client_id: "ghost", event_name: "Lead", event_url: "http://x" }));
    expect(res.status).toBe(404);
  });

  it("200 + grava events_log sem chamar Meta CAPI quando a empresa não tem nenhum pixel configurado", async () => {
    mockCompanySingle.mockResolvedValueOnce({ data: { id: "c1" }, error: null });
    mockPixelMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const res = await POST(buildRequest({ client_id: "sem-config", event_name: "Lead", event_url: "http://x" }));

    expect(res.status).toBe(200);
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ company_id: "c1", capi_status: "skipped" }));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("403 quando domínio não bate com dominio_autorizado do pixel", async () => {
    mockHappyPath();
    const res = await POST(
      buildRequest(
        { client_id: "acme", event_name: "Lead", event_url: "http://evil.com" },
        { origin: "http://evil.com" },
      ),
    );
    expect(res.status).toBe(403);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("200 + grava events_log + chama Meta CAPI quando tudo certo", async () => {
    mockHappyPath();
    const res = await POST(
      buildRequest({
        client_id: "acme",
        event_name: "Lead",
        event_url: "http://localhost:3000/pagina",
        user_data: { em: "hash-email", ph: "hash-tel" },
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: "company-1",
        pixel_id: "pixel-1",
        event_name: "Lead",
        event_url: "http://localhost:3000/pagina",
        user_data: { em: "hash-email", ph: "hash-tel" },
        fingerprint_id: expect.any(String),
        capi_status: "pending",
      }),
    );

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("graph.facebook.com"),
      expect.objectContaining({ method: "POST" }),
    );

    expect(mockUpdate).toHaveBeenCalledWith({ capi_status: "sent" });
  });

  it("retorna 200 ao pixel mesmo se a chamada à Meta CAPI falhar", async () => {
    mockHappyPath();
    global.fetch = jest.fn(() => Promise.reject(new Error("rede fora"))) as unknown as typeof fetch;

    const res = await POST(buildRequest({ client_id: "acme", event_name: "Lead", event_url: "http://localhost:3000/" }));

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({ capi_status: "failed", capi_error: "rede fora" });
  });

  it("usa user_id do cookie persistente como fingerprint_id quando enviado", async () => {
    mockHappyPath();
    await POST(
      buildRequest({
        client_id: "acme",
        event_name: "PageView",
        event_url: "http://localhost:3000/",
        user_id: "uuid-persistente-123",
      }),
    );

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ fingerprint_id: "uuid-persistente-123" }),
    );
  });

  it("cai pro hash de IP+UA quando não vem user_id (fallback)", async () => {
    mockHappyPath();
    await POST(buildRequest({ client_id: "acme", event_name: "PageView", event_url: "http://localhost:3000/" }));

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ fingerprint_id: expect.stringMatching(/^[a-f0-9]{64}$/) }),
    );
  });

  it("grava page_title e extra_fields do formulário", async () => {
    mockHappyPath();
    await POST(
      buildRequest({
        client_id: "acme",
        event_name: "Lead",
        event_url: "http://localhost:3000/pagina",
        page_title: "Página de Vendas",
        pii: { email: "a@b.com", fields: { nome: "Wesley", cidade: "SP" } },
      }),
    );

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        page_title: "Página de Vendas",
        extra_fields: { nome: "Wesley", cidade: "SP" },
      }),
    );
  });

  it("regrava sem page_title/extra_fields se a migration 033 ainda não rodou no banco", async () => {
    mockHappyPath();
    mockInsert
      .mockImplementationOnce(() => ({
        select: () => ({
          single: () => Promise.resolve({ data: null, error: { message: 'column events_log.page_title does not exist' } }),
        }),
      }))
      .mockImplementationOnce(() => ({
        select: () => ({ single: () => Promise.resolve({ data: { id: "evt-2" }, error: null }) }),
      }));

    const res = await POST(
      buildRequest({ client_id: "acme", event_name: "Lead", event_url: "http://localhost:3000/", page_title: "X" }),
    );

    expect(res.status).toBe(200);
    expect(mockInsert).toHaveBeenCalledTimes(2);
    expect(mockInsert.mock.calls[1][0]).not.toHaveProperty("page_title");
    expect(mockInsert.mock.calls[1][0]).not.toHaveProperty("extra_fields");
  });

  it("regrava sem country/country_region/city se a migration 034 ainda não rodou no banco", async () => {
    mockHappyPath();
    mockInsert
      .mockImplementationOnce(() => ({
        select: () => ({
          single: () => Promise.resolve({ data: null, error: { message: 'column events_log.country does not exist' } }),
        }),
      }))
      .mockImplementationOnce(() => ({
        select: () => ({ single: () => Promise.resolve({ data: { id: "evt-3" }, error: null }) }),
      }));

    const res = await POST(
      buildRequest({ client_id: "acme", event_name: "PageView", event_url: "http://localhost:3000/" }),
    );

    expect(res.status).toBe(200);
    expect(mockInsert).toHaveBeenCalledTimes(2);
    expect(mockInsert.mock.calls[1][0]).not.toHaveProperty("country");
    expect(mockInsert.mock.calls[1][0]).not.toHaveProperty("country_region");
    expect(mockInsert.mock.calls[1][0]).not.toHaveProperty("city");
  });

  it("regrava sem pixel_id se a migration 037 ainda não rodou no banco (events_log)", async () => {
    mockHappyPath();
    mockInsert
      .mockImplementationOnce(() => ({
        select: () => ({
          single: () => Promise.resolve({ data: null, error: { message: "column events_log.pixel_id does not exist" } }),
        }),
      }))
      .mockImplementationOnce(() => ({
        select: () => ({ single: () => Promise.resolve({ data: { id: "evt-9" }, error: null }) }),
      }));

    const res = await POST(buildRequest({ client_id: "acme", event_name: "PageView", event_url: "http://localhost:3000/" }));

    expect(res.status).toBe(200);
    expect(mockInsert).toHaveBeenCalledTimes(2);
    expect(mockInsert.mock.calls[1][0]).not.toHaveProperty("pixel_id");
  });

  it("manda event_id e fbp/fbc pra Meta CAPI e grava event_id em events_log", async () => {
    mockHappyPath();
    await POST(
      buildRequest({
        client_id: "acme",
        event_name: "PageView",
        event_url: "http://localhost:3000/",
        event_id: "evt-uuid-123",
        fbp: "fb.1.123.456",
        fbc: "fb.1.123.fbclid-abc",
      }),
    );

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ event_id: "evt-uuid-123" }));

    const sentBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(sentBody.data[0].event_id).toBe("evt-uuid-123");
    expect(sentBody.data[0].user_data.fbp).toBe("fb.1.123.456");
    expect(sentBody.data[0].user_data.fbc).toBe("fb.1.123.fbclid-abc");
  });

  it("manda fn/ln (pass-through, já hasheados pelo pixel) pra Meta CAPI", async () => {
    mockHappyPath();
    await POST(
      buildRequest({
        client_id: "acme",
        event_name: "Lead",
        event_url: "http://localhost:3000/",
        user_data: { fn: "hash-first-name", ln: "hash-last-name" },
      }),
    );

    const sentBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(sentBody.data[0].user_data.fn).toBe("hash-first-name");
    expect(sentBody.data[0].user_data.ln).toBe("hash-last-name");
  });

  it("hasheia país/estado/cidade/CEP (geo-IP da Vercel) e external_id (user_id) pra Meta CAPI", async () => {
    mockHappyPath();
    const req = new NextRequest("http://localhost:3000/api/tracking/track-event", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        "x-vercel-ip-country": "BR",
        "x-vercel-ip-country-region": "SP",
        "x-vercel-ip-city": "S%C3%A3o%20Paulo",
        "x-vercel-ip-postal-code": "01310-100",
      },
      body: JSON.stringify({
        client_id: "acme",
        event_name: "PageView",
        event_url: "http://localhost:3000/",
        user_id: "uuid-persistente-123",
      }),
    });

    await POST(req);

    const sentBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(sentBody.data[0].user_data.country).toBe(sha256("BR"));
    expect(sentBody.data[0].user_data.st).toBe(sha256("SP"));
    expect(sentBody.data[0].user_data.ct).toBe(sha256("São Paulo"));
    expect(sentBody.data[0].user_data.zp).toBe(sha256("01310-100"));
    expect(sentBody.data[0].user_data.external_id).toBe(sha256("uuid-persistente-123"));
  });

  it("inclui test_event_code no payload da CAPI quando o pixel tem código de teste", async () => {
    mockHappyPath({ meta_test_event_code: "TEST123" });
    await POST(buildRequest({ client_id: "acme", event_name: "PageView", event_url: "http://localhost:3000/" }));

    const sentBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(sentBody.test_event_code).toBe("TEST123");
  });

  it("não inclui test_event_code quando o pixel não tem código de teste", async () => {
    mockHappyPath();
    await POST(buildRequest({ client_id: "acme", event_name: "PageView", event_url: "http://localhost:3000/" }));

    const sentBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(sentBody.test_event_code).toBeUndefined();
  });

  it("resolve o pixel pelo pixel_slug do payload (não o is_default)", async () => {
    mockHappyPath();
    await POST(
      buildRequest({ client_id: "acme", pixel_slug: "landing-x", event_name: "PageView", event_url: "http://localhost:3000/" }),
    );

    const calls = lastPixelEqCalls();
    expect(calls).toEqual(expect.arrayContaining([["slug", "landing-x"]]));
    expect(calls.some((c) => c[0] === "is_default")).toBe(false);
  });

  it("usa o pixel is_default quando o payload não manda pixel_slug (snippet antigo)", async () => {
    mockHappyPath();
    await POST(buildRequest({ client_id: "acme", event_name: "PageView", event_url: "http://localhost:3000/" }));

    const calls = lastPixelEqCalls();
    expect(calls).toEqual(expect.arrayContaining([["is_default", true]]));
  });

  it("cai pra config legada de companies se a tabela tracking_pixels ainda não existir (migration 037 pendente)", async () => {
    mockCompanySingle
      .mockResolvedValueOnce({ data: COMPANY_ID_OK, error: null })
      .mockResolvedValueOnce({
        data: { meta_pixel_id: "LEGACY_PIXEL", meta_capi_token: "LEGACY_TOKEN", dominio_autorizado: null, meta_test_event_code: null },
        error: null,
      });
    mockPixelMaybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'relation "public.tracking_pixels" does not exist' } });

    const res = await POST(buildRequest({ client_id: "acme", event_name: "PageView", event_url: "http://localhost:3000/" }));

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("LEGACY_PIXEL"), expect.anything());
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ pixel_id: null }));
  });

  it("segue mesmo sem Origin/Referer (soft-fail)", async () => {
    mockHappyPath();
    const req = new NextRequest("http://localhost:3000/api/tracking/track-event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_id: "acme", event_name: "Lead", event_url: "http://localhost:3000/" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockInsert).toHaveBeenCalled();
  });
});
