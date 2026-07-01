import type { NextConfig } from "next";

// ─── Content-Security-Policy (report-only por enquanto) ────────────────────────
// Report-only NÃO bloqueia nada — só reporta violações no console. É a base pra
// endurecer depois sem quebrar o app (inline styles/scripts do Next, fontes, etc.).
// 'unsafe-inline'/'unsafe-eval' ficam por causa do runtime do Next; apertar depois
// com nonce. connect-src libera Supabase + Meta (chamadas do app).
const cspReportOnly = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://graph.facebook.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

// Headers de segurança aplicados a todas as respostas.
const securityHeaders = [
  // Clickjacking: ninguém embeda o app em iframe.
  { key: "X-Frame-Options", value: "DENY" },
  // Impede o browser de "adivinhar" content-type (MIME sniffing).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Vaza o mínimo de referrer pra origens externas.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Desliga APIs sensíveis do browser por padrão.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  // Força HTTPS por 2 anos (só surte efeito em prod/https).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Content-Security-Policy-Report-Only", value: cspReportOnly },
];

const nextConfig: NextConfig = {
  // Não gera source maps do bundle client em produção — dificulta reconstruir o código.
  productionBrowserSourceMaps: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
