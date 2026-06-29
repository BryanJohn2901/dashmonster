import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAccess } from "@/lib/trackingAuth";

// Botão "Testar" do modo proxy em TrackingConfigPanel.tsx — confere de ponta a
// ponta se a instalação do dm-proxy.php no domínio do CLIENTE está funcionando,
// sem precisar que o usuário abra o site num navegador real. 3 checagens:
//   1) a página tem o snippet certo (script + Tracker.init);
//   2) dm-proxy.php está no ar nesse domínio e fala com nosso backend (?ep=config);
//   3) o cookie _dm_uid realmente nasce 1ª parte (?ep=track, ping=true — não
//      grava evento nenhum, ver ping em track-event/route.ts) — a prova real
//      de que o modo proxy cumpre o que promete (ver CLAUDE.md desta pasta).
// `url` é informado livremente pelo usuário (qualquer domínio que ele alegue
// ser o site dele) — como este servidor faz requests pra esse endereço,
// trata-se de superfície de SSRF; `isPrivateOrLoopbackHost` bloqueia os
// alvos óbvios (loopback/rede privada/link-local, inclui o IP de metadata
// 169.254.169.254 de provedores de nuvem). Não resolve DNS rebinding (um
// domínio público que resolve pra IP privado) — aceito pro escopo desta
// ferramenta de diagnóstico interna, não é endpoint de uso geral.
const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_CHARS = 200_000;

interface TestProxyBody {
  url?: string;
  companySlug?: string;
  pixelSlug?: string;
}

function isPrivateOrLoopbackHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "0.0.0.0" || h.endsWith(".local")) return true;
  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // inclui o IP de metadata de cloud (AWS/GCP/Azure)
    return false;
  }
  if (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return true;
  return false;
}

function normalizeUrl(raw: string): URL | null {
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withProtocol);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (isPrivateOrLoopbackHost(u.hostname)) return null;
    return u;
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url: URL, init?: RequestInit, redirects = 0): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, redirect: "manual" });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      if (redirects >= 5) throw new Error("redirecionamentos demais");
      const next = normalizeUrl(new URL(res.headers.get("location")!, url).toString());
      if (!next) throw new Error("redirect para URL nao permitida");
      return fetchWithTimeout(next, init, redirects + 1);
    }
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: NextRequest) {
  let body: TestProxyBody;
  try {
    body = (await request.json()) as TestProxyBody;
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  if (!body.url?.trim() || !body.companySlug?.trim()) {
    return NextResponse.json({ error: "url e companySlug são obrigatórios." }, { status: 400 });
  }

  const target = normalizeUrl(body.url.trim());
  if (!target) {
    return NextResponse.json({ error: "URL inválida ou não permitida." }, { status: 400 });
  }

  const origin = target.origin;
  const companySlug = body.companySlug.trim();
  const pixelSlug = body.pixelSlug?.trim() || undefined;
  const access = await requireCompanyAccess(request, { companySlug, write: true });
  if (!access.ok) return access.response;

  const configQs = `client_id=${encodeURIComponent(companySlug)}${pixelSlug ? `&pixel_slug=${encodeURIComponent(pixelSlug)}` : ""}`;
  const httpsOk = target.protocol === "https:";

  // 1) A página tem o snippet certo?
  let scriptFound = false;
  let pageError: string | null = null;
  try {
    const pageRes = await fetchWithTimeout(target);
    if (!pageRes.ok) {
      pageError = `Página respondeu ${pageRes.status}.`;
    } else {
      const html = (await pageRes.text()).slice(0, MAX_HTML_CHARS);
      // Aceita os 2 formatos de snippet: o novo (pixel.js direto da Vercel +
      // dmq.push(["init", ...]), carregado async) e o legado (dm-proxy.php?ep=pixel
      // + Tracker.init(...)). Os dois resultam no mesmo modo proxy/cookie.
      const hasScript = html.includes("pixel.js?via=proxy") || html.includes("dm-proxy.php?ep=pixel");
      const hasInit =
        html.includes(`Tracker.init("${companySlug}"`) ||
        html.includes(`"init","${companySlug}"`);
      const hasPixelSlug = !pixelSlug || html.includes(`"${pixelSlug}"`) || html.includes(`'${pixelSlug}'`);
      scriptFound = hasScript && hasInit && hasPixelSlug;
      if (!scriptFound) pageError = "Página acessível, mas não achei o script do pixel (ou o init com o slug da empresa) nela.";
    }
  } catch {
    pageError = "Não foi possível acessar essa página (timeout ou domínio incorreto).";
  }

  // 2) dm-proxy.php está no ar nesse domínio e fala com nosso backend?
  let configOk = false;
  let configError: string | null = null;
  try {
    const configRes = await fetchWithTimeout(new URL(`/dm-proxy.php?ep=config&${configQs}`, origin));
    if (configRes.ok) {
      const json = (await configRes.json().catch(() => null)) as Record<string, unknown> | null;
      configOk = Boolean(json && "metaPixelId" in json);
      if (!configOk) configError = "dm-proxy.php respondeu, mas não no formato esperado — verifique se o arquivo não foi alterado.";
    } else {
      configError = `dm-proxy.php?ep=config respondeu ${configRes.status} — arquivo ausente, fora da raiz do site, ou DASHMONSTER_BASE incorreto.`;
    }
  } catch {
    configError = "Não consegui acessar o dm-proxy.php nesse domínio (não está no ar, ou não foi enviado pra raiz do site).";
  }

  // 3) o cookie realmente nasce 1ª parte? (?ep=track, ping=true — não grava nada)
  let cookieOk = false;
  let cookieError: string | null = null;
  try {
    const trackRes = await fetchWithTimeout(new URL("/dm-proxy.php?ep=track", origin), {
      method: "POST",
      headers: { "Content-Type": "application/json", Referer: `${origin}/` },
      body: JSON.stringify({ client_id: companySlug, pixel_slug: pixelSlug, event_name: "ProxyTest", ping: true }),
    });
    const setCookie = trackRes.headers.get("set-cookie");
    cookieOk = httpsOk && trackRes.ok && Boolean(setCookie?.includes("_dm_uid="));
    if (!cookieOk) {
      if (!httpsOk) cookieError = "O site precisa estar em HTTPS para o navegador aceitar o cookie Secure.";
      else cookieError = trackRes.ok
        ? "dm-proxy.php respondeu, mas o cookie _dm_uid não voltou no Set-Cookie — a hospedagem pode estar removendo esse header."
        : `dm-proxy.php?ep=track respondeu ${trackRes.status}.`;
    }
  } catch {
    cookieError = "Não consegui testar o cookie nesse domínio.";
  }

  return NextResponse.json({
    scriptFound,
    pageError,
    configOk,
    configError,
    cookieOk,
    cookieError,
    httpsOk,
    allOk: scriptFound && configOk && cookieOk,
  });
}
