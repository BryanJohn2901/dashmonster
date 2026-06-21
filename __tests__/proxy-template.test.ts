import { NextRequest } from "next/server";
import { GET } from "@/app/api/tracking/proxy-template/route";

function buildRequest() {
  return new NextRequest("http://localhost:3000/api/tracking/proxy-template");
}

describe("GET /api/tracking/proxy-template", () => {
  it("devolve o dm-proxy.php como download, com a URL do backend já interpolada", async () => {
    const res = await GET(buildRequest());
    const php = await res.text();

    expect(res.headers.get("content-disposition")).toBe('attachment; filename="dm-proxy.php"');
    expect(php).toContain("define('DASHMONSTER_BASE', 'http://localhost:3000/api/tracking')");
    // allowlist fechada de endpoints — nunca concatenar $_GET['ep'] direto numa URL.
    expect(php).toContain("'pixel' => '/pixel.js'");
    expect(php).toContain("'track' => '/track-event'");
    expect(php).toContain("'config' => '/config'");
    // hardening básico: timeout curto e limite de tamanho de body.
    expect(php).toContain("CURLOPT_TIMEOUT, 5");
    expect(php).toContain("65536");
    // repassa Cache-Control (além de Content-Type/Set-Cookie) pro pixel.js
    // no-store valer através do proxy — senão o navegador podia rodar versão velha.
    expect(php).toContain("cache-control:");
  });
});
