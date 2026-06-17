import { NextRequest } from "next/server";

const mockSingle = jest.fn();
const mockSelect = jest.fn(() => ({ eq: () => ({ single: mockSingle }) }));
const mockInsertSelect = jest.fn(() => ({ single: jest.fn(() => Promise.resolve({ data: { id: "evt-1" }, error: null })) }));
const mockInsert = jest.fn(() => ({ select: mockInsertSelect }));
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
