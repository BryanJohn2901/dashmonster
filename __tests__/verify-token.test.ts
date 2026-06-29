import { NextRequest } from "next/server";

jest.mock("@/lib/trackingAuth", () => ({
  requireAuth: jest.fn(() => Promise.resolve({ ok: true, userId: "user-1", db: {} })),
}));

import { POST } from "@/app/api/tracking/verify-token/route";

function req(body: unknown) {
  return new NextRequest("http://localhost:3000/api/tracking/verify-token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockDebugToken(payload: unknown) {
  global.fetch = jest.fn(() => Promise.resolve({ json: () => Promise.resolve(payload) })) as unknown as typeof fetch;
}

describe("POST /api/tracking/verify-token", () => {
  it("skipped quando falta pixelId ou token", async () => {
    expect((await (await POST(req({ token: "x" }))).json()).status).toBe("skipped");
    expect((await (await POST(req({ pixelId: "1" }))).json()).status).toBe("skipped");
  });

  it("match quando o token autoriza o pixel (granular_scopes.target_ids contém o id)", async () => {
    mockDebugToken({ data: { is_valid: true, granular_scopes: [{ scope: "read_ads_dataset_quality", target_ids: ["186669543489056", "140949378101575"] }] } });
    const json = await (await POST(req({ pixelId: "186669543489056", token: "tok" }))).json();
    expect(json.status).toBe("match");
  });

  it("mismatch quando o token autoriza OUTRO pixel — retorna os ids autorizados", async () => {
    mockDebugToken({ data: { is_valid: true, granular_scopes: [{ scope: "read_ads_dataset_quality", target_ids: ["140949378101575"] }] } });
    const json = await (await POST(req({ pixelId: "186669543489056", token: "tok" }))).json();
    expect(json.status).toBe("mismatch");
    expect(json.authorizedIds).toEqual(["140949378101575"]);
  });

  it("invalid quando o token está expirado/revogado", async () => {
    mockDebugToken({ data: { is_valid: false } });
    expect((await (await POST(req({ pixelId: "1", token: "tok" }))).json()).status).toBe("invalid");
  });

  it("unknown quando a Graph API retorna erro (não bloqueia o save)", async () => {
    mockDebugToken({ error: { message: "Malformed access token" } });
    expect((await (await POST(req({ pixelId: "1", token: "tok" }))).json()).status).toBe("unknown");
  });

  it("unknown quando o token não tem restrição de dataset (sem target_ids)", async () => {
    mockDebugToken({ data: { is_valid: true, granular_scopes: [{ scope: "ads_management" }] } });
    expect((await (await POST(req({ pixelId: "1", token: "tok" }))).json()).status).toBe("unknown");
  });
});
