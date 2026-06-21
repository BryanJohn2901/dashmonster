import { NextRequest } from "next/server";
import { GET } from "@/app/api/tracking/pixel.js/route";

function buildRequest(query = "") {
  return new NextRequest(`http://localhost:3000/api/tracking/pixel.js${query}`);
}

describe("GET /api/tracking/pixel.js", () => {
  it("modo direto (sem ?via=proxy): URLs absolutas pro domínio do dashmonster, cookie sempre escrito via JS", async () => {
    const res = await GET(buildRequest());
    const script = await res.text();

    expect(script).toContain('var TRACK_URL = "http://localhost:3000/api/tracking/track-event"');
    expect(script).toContain('var CONFIG_URL = "http://localhost:3000/api/tracking/config"');
    expect(script).toContain("var PROXY_MODE = false");
  });

  it("modo proxy (?via=proxy): URLs relativas pro dm-proxy.php do próprio cliente, getUserId() guardado por PROXY_MODE", async () => {
    const res = await GET(buildRequest("?via=proxy"));
    const script = await res.text();

    expect(script).toContain('var TRACK_URL = "/dm-proxy.php?ep=track"');
    expect(script).toContain('var CONFIG_URL = "/dm-proxy.php?ep=config"');
    expect(script).toContain("var PROXY_MODE = true");
    // getUserId() não pode escrever o cookie incondicionalmente nesse modo —
    // a escrita via JS tem que estar atrás do `if (!PROXY_MODE)`.
    expect(script).toMatch(/if \(!PROXY_MODE\) \{\s*\n\s*\/\/.*\n(\s*\/\/.*\n)*\s*writeCookie\(COOKIE_NAME, id, COOKIE_DAYS\);/);
  });

  it("manda via:\"proxy\"/\"direct\" em todo evento (migration 057), pro dashboard saber se o cookie nasceu 1ª parte", async () => {
    const direct = await GET(buildRequest());
    const proxied = await GET(buildRequest("?via=proxy"));

    expect(await direct.text()).toContain('via: PROXY_MODE ? "proxy" : "direct"');
    expect(await proxied.text()).toContain('via: PROXY_MODE ? "proxy" : "direct"');
  });

  it("cache desligado (no-store) nos 2 modos — script ainda itera, não pode cachear versão errada", async () => {
    const direct = await GET(buildRequest());
    const proxied = await GET(buildRequest("?via=proxy"));

    expect(direct.headers.get("cache-control")).toBe("no-store");
    expect(proxied.headers.get("cache-control")).toBe("no-store");
  });
});
