import { NextRequest } from "next/server";

// Gera o `dm-proxy.php` pronto pra subir no domínio do CLIENTE (Hostinger,
// HostGator, qualquer hospedagem PHP) — é o que faz o cookie de identidade
// do visitante (_dm_uid) nascer como 1ª parte no Safari/iOS, contornando o
// cap de 7 dias que o WebKit aplica a cookie gravado via JavaScript. Ver
// raciocínio completo em src/app/api/tracking/CLAUDE.md ("Cap de 7 dias do
// Safari/iOS em cookies JS, e o 'modo proxy' pra contornar").
//
// Nome de arquivo é FIXO (dm-proxy.php) por decisão deliberada — o caminho
// embutido no script gerado por pixel.js/route.ts (`/dm-proxy.php?ep=...`)
// não faz introspecção nenhuma no navegador, então tem que bater exatamente.
function buildProxyPhp(dashmonsterBase: string): string {
  return `<?php
// dm-proxy.php — sobe na raiz do site (public_html/), nome FIXO.
// Faz o pixel server-side do dashmonster nascer como 1ª parte no Safari/iOS.
// PRÉ-REQUISITO: o site precisa estar em HTTPS — o cookie é marcado Secure e o
// navegador ignora cookie Secure em conexão HTTP (a captura ainda funciona,
// mas a persistência de 400 dias do _dm_uid só vale sob HTTPS).
define('DASHMONSTER_BASE', '${dashmonsterBase}/api/tracking'); // hardcoded — NUNCA de input do request (SSRF)

$ep = $_GET['ep'] ?? '';
$paths = ['pixel' => '/pixel.js', 'track' => '/track-event', 'config' => '/config']; // allowlist fechada — nunca concatenar $_GET['ep'] numa URL
if (!isset($paths[$ep])) { http_response_code(400); exit; }

$method = $_SERVER['REQUEST_METHOD'];
if ($method !== 'GET' && $method !== 'POST') { http_response_code(405); exit; }

$qs = $_GET; unset($qs['ep']);
if ($ep === 'pixel') $qs['via'] = 'proxy'; // sinaliza pro backend gerar a variante proxy do script
$url = DASHMONSTER_BASE . $paths[$ep] . (count($qs) ? '?' . http_build_query($qs) : '');

$headers = ['Referer: ' . ($_SERVER['HTTP_REFERER'] ?? '')]; // preserva a checagem de dominio_autorizado (senão cai sempre no soft-fail)
$body = null;
if ($method === 'POST') {
  $body = file_get_contents('php://input', false, null, 0, 65536); // limite de 64KB — sem isso é vetor de DoS sob a identidade do domínio do cliente
  $headers[] = 'Content-Type: application/json';
}

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HEADER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 5); // hosts compartilhados tem max_execution_time baixo — sem isso, lentidao nossa deixa o SITE DO CLIENTE lento
if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $body);

$response = curl_exec($ch);
$headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

http_response_code($status ?: 502);
foreach (explode("\\r\\n", substr($response, 0, $headerSize)) as $line) {
  // só repassa Content-Type, Set-Cookie e Cache-Control — nunca todos os
  // headers cegamente. Cache-Control importa pro pixel.js (servido no-store
  // enquanto itera): sem repassar, o navegador podia cachear via heurística e
  // rodar uma versão velha do script depois de um deploy.
  if (stripos($line, 'content-type:') === 0 || stripos($line, 'set-cookie:') === 0 || stripos($line, 'cache-control:') === 0) {
    header($line, false);
  }
}
echo substr($response, $headerSize);
`;
}

export async function GET(request: NextRequest) {
  const dashmonsterBase = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;

  return new Response(buildProxyPhp(dashmonsterBase), {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": 'attachment; filename="dm-proxy.php"',
      "Cache-Control": "no-store",
    },
  });
}
