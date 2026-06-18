import { NextRequest } from "next/server";

const mockSingle = jest.fn();
const mockEq = jest.fn(() => ({ single: mockSingle }));
const mockSelect = jest.fn(() => ({ eq: mockEq }));
const mockFrom = jest.fn((table: string) => {
  if (table === "companies") return { select: mockSelect };
  throw new Error(`tabela inesperada: ${table}`);
});

jest.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: () => ({ from: mockFrom }),
}));

import { GET } from "@/app/api/tracking/config/route";

function buildRequest(clientId?: string) {
  const url = clientId
    ? `http://localhost:3000/api/tracking/config?client_id=${encodeURIComponent(clientId)}`
    : "http://localhost:3000/api/tracking/config";
  return new NextRequest(url);
}

beforeEach(() => jest.clearAllMocks());

describe("GET /api/tracking/config", () => {
  it("400 quando falta client_id", async () => {
    const res = await GET(buildRequest());
    expect(res.status).toBe(400);
  });

  it("devolve só o metaPixelId — nunca token, domínio ou código de teste", async () => {
    mockSingle.mockResolvedValueOnce({
      data: { meta_pixel_id: "PIXEL_123", meta_capi_token: "SECRET", dominio_autorizado: "x.com", meta_test_event_code: "TEST1" },
      error: null,
    });
    const res = await GET(buildRequest("acme"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ metaPixelId: "PIXEL_123" });
  });

  it("metaPixelId null quando empresa não existe ou não tem pixel configurado", async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: "not found" } });
    const res = await GET(buildRequest("ghost"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ metaPixelId: null });
  });

  it("CORS aberto (Access-Control-Allow-Origin: *)", async () => {
    mockSingle.mockResolvedValueOnce({ data: { meta_pixel_id: null }, error: null });
    const res = await GET(buildRequest("acme"));
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});
