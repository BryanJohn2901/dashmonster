import { createHash } from "crypto";
import { NextRequest } from "next/server";

function sha256(value: string) {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

const mockSingle = jest.fn();
const mockSelect = jest.fn(() => ({ eq: () => ({ single: mockSingle }) }));
const mockInsertSelect = jest.fn(() => ({ single: jest.fn(() => Promise.resolve({ data: { id: "evt-1" }, error: null })) }));
const mockInsert: jest.Mock = jest.fn(() => ({ select: mockInsertSelect }));
const mockEq = jest.fn(() => Promise.resolve({ data: null, error: null }));
const mockUpdate = jest.fn(() => ({ eq: mockEq }));

const mockFrom = jest.fn((table: string) => {
  if (table === "companies") return { select: mockSelect };
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

const COMPANY_OK = {
  id: "company-1",
  meta_pixel_id: "PIXEL_123",
  meta_capi_token: "TOKEN_ABC",
  dominio_autorizado: "localhost",
};

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
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: "not found" } });
    const res = await POST(buildRequest({ client_id: "ghost", event_name: "Lead", event_url: "http://x" }));
    expect(res.status).toBe(404);
  });

  it("200 + grava events_log sem chamar Meta CAPI quando empresa não tem pixel configurado", async () => {
    mockSingle.mockResolvedValueOnce({ data: { id: "c1", meta_pixel_id: null, meta_capi_token: null, dominio_autorizado: null }, error: null });
    const res = await POST(buildRequest({ client_id: "sem-config", event_name: "Lead", event_url: "http://x" }));

    expect(res.status).toBe(200);
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ company_id: "c1", capi_status: "skipped" }));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("403 quando domínio não bate com dominio_autorizado", async () => {
    mockSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
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
    mockSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
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
    mockSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
    global.fetch = jest.fn(() => Promise.reject(new Error("rede fora"))) as unknown as typeof fetch;

    const res = await POST(buildRequest({ client_id: "acme", event_name: "Lead", event_url: "http://localhost:3000/" }));

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({ capi_status: "failed", capi_error: "rede fora" });
  });

  it("usa user_id do cookie persistente como fingerprint_id quando enviado", async () => {
    mockSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
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
    mockSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
    await POST(buildRequest({ client_id: "acme", event_name: "PageView", event_url: "http://localhost:3000/" }));

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ fingerprint_id: expect.stringMatching(/^[a-f0-9]{64}$/) }),
    );
  });

  it("grava page_title e extra_fields do formulário", async () => {
    mockSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
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
    mockSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
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
    mockSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
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

  it("manda event_id e fbp/fbc pra Meta CAPI e grava event_id em events_log", async () => {
    mockSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
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
    mockSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
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
    mockSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
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

  it("inclui test_event_code no payload da CAPI quando a empresa tem código de teste", async () => {
    mockSingle.mockResolvedValueOnce({ data: { ...COMPANY_OK, meta_test_event_code: "TEST123" }, error: null });
    await POST(buildRequest({ client_id: "acme", event_name: "PageView", event_url: "http://localhost:3000/" }));

    const sentBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(sentBody.test_event_code).toBe("TEST123");
  });

  it("não inclui test_event_code quando a empresa não tem código de teste", async () => {
    mockSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
    await POST(buildRequest({ client_id: "acme", event_name: "PageView", event_url: "http://localhost:3000/" }));

    const sentBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(sentBody.test_event_code).toBeUndefined();
  });

  it("cai pro select sem meta_test_event_code se a coluna ainda não existir (migration 036 pendente)", async () => {
    mockSingle
      .mockResolvedValueOnce({ data: null, error: { message: "column companies.meta_test_event_code does not exist" } })
      .mockResolvedValueOnce({ data: COMPANY_OK, error: null });

    const res = await POST(buildRequest({ client_id: "acme", event_name: "PageView", event_url: "http://localhost:3000/" }));

    expect(res.status).toBe(200);
    expect(mockSingle).toHaveBeenCalledTimes(2);
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ company_id: "company-1" }));
  });

  it("segue mesmo sem Origin/Referer (soft-fail)", async () => {
    mockSingle.mockResolvedValueOnce({ data: COMPANY_OK, error: null });
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
