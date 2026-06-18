import { NextRequest } from "next/server";

const mockCompanySingle = jest.fn();
const mockCompanyEq = jest.fn(() => ({ single: mockCompanySingle }));
const mockCompanySelect = jest.fn(() => ({ eq: mockCompanyEq }));

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

const mockFrom = jest.fn((table: string) => {
  if (table === "companies") return { select: mockCompanySelect };
  if (table === "tracking_pixels") return { select: mockPixelSelect };
  throw new Error(`tabela inesperada: ${table}`);
});

jest.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: () => ({ from: mockFrom }),
}));

import { GET } from "@/app/api/tracking/config/route";

function buildRequest(clientId?: string, pixelSlug?: string) {
  const params = new URLSearchParams();
  if (clientId) params.set("client_id", clientId);
  if (pixelSlug) params.set("pixel_slug", pixelSlug);
  return new NextRequest(`http://localhost:3000/api/tracking/config?${params.toString()}`);
}

beforeEach(() => jest.clearAllMocks());

describe("GET /api/tracking/config", () => {
  it("400 quando falta client_id", async () => {
    const res = await GET(buildRequest());
    expect(res.status).toBe(400);
  });

  it("devolve o metaPixelId do pixel resolvido — nunca token, domínio ou código de teste", async () => {
    mockCompanySingle.mockResolvedValueOnce({ data: { id: "company-1", meta_pixel_id: "LEGACY" }, error: null });
    mockPixelMaybeSingle.mockResolvedValueOnce({
      data: { meta_pixel_id: "PIXEL_123", meta_capi_token: "SECRET", dominio_autorizado: "x.com", meta_test_event_code: "TEST1" },
      error: null,
    });
    const res = await GET(buildRequest("acme"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ metaPixelId: "PIXEL_123" });
  });

  it("resolve por pixel_slug quando informado", async () => {
    mockCompanySingle.mockResolvedValueOnce({ data: { id: "company-1", meta_pixel_id: null }, error: null });
    mockPixelMaybeSingle.mockResolvedValueOnce({ data: { meta_pixel_id: "PIXEL_LANDING_X" }, error: null });

    const res = await GET(buildRequest("acme", "landing-x"));
    const json = await res.json();

    expect(json).toEqual({ metaPixelId: "PIXEL_LANDING_X" });
    const results = mockPixelSelect.mock.results;
    const query = results[results.length - 1].value as { eq: jest.Mock };
    expect(query.eq.mock.calls).toEqual(expect.arrayContaining([["slug", "landing-x"]]));
  });

  it("cai pro metaPixelId legado de companies se tracking_pixels ainda não existir (migration 037 pendente)", async () => {
    mockCompanySingle.mockResolvedValueOnce({ data: { id: "company-1", meta_pixel_id: "LEGACY_PIXEL" }, error: null });
    mockPixelMaybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'relation "public.tracking_pixels" does not exist' } });

    const res = await GET(buildRequest("acme"));
    const json = await res.json();

    expect(json).toEqual({ metaPixelId: "LEGACY_PIXEL" });
  });

  it("metaPixelId null quando empresa não existe", async () => {
    mockCompanySingle.mockResolvedValueOnce({ data: null, error: { message: "not found" } });
    const res = await GET(buildRequest("ghost"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ metaPixelId: null });
  });

  it("metaPixelId null quando a empresa existe mas não tem pixel default configurado", async () => {
    mockCompanySingle.mockResolvedValueOnce({ data: { id: "company-1", meta_pixel_id: null }, error: null });
    mockPixelMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await GET(buildRequest("acme"));
    const json = await res.json();

    expect(json).toEqual({ metaPixelId: null });
  });

  it("CORS aberto (Access-Control-Allow-Origin: *)", async () => {
    mockCompanySingle.mockResolvedValueOnce({ data: { id: "company-1", meta_pixel_id: null }, error: null });
    mockPixelMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const res = await GET(buildRequest("acme"));
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});
