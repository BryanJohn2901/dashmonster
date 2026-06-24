import { NextRequest } from "next/server";
import { geolocation } from "@vercel/functions";

// Servido via route handler (não public/pixel.js estático) pra poder injetar
// a origem da API em runtime e controlar cache sem passo de build — TTL
// curto porque o script ainda deve iterar rápido nesta fase MVP.
//
// MODO PROXY (?via=proxy): pra contornar o cap de 7 dias que o Safari/iOS
// aplica a QUALQUER cookie gravado via document.cookie (JS) — confirmado via
// pesquisa, não é bug nosso, é política do WebKit/ITP desde 2019, e nem o
// próprio Pixel da Meta escapa disso. A única saída real é o cookie nascer
// via header Set-Cookie de um servidor que o navegador considera "1ª parte"
// — como nosso backend é domínio DIFERENTE do cliente, isso só é possível se
// a chamada passar por um proxy reverso hospedado no MESMO domínio da
// landing page (ver `dm-proxy.php` documentado em CLAUDE.md desta pasta).
// Quando esse proxy busca o pixel.js, ele manda `?via=proxy` — o backend,
// vendo isso, gera uma VARIANTE do script com `TRACK_URL`/`CONFIG_URL`
// apontando pro próprio proxy (caminho fixo `/dm-proxy.php`, ver decisão de
// nome de arquivo padronizado no CLAUDE.md) em vez do domínio do dashmonster,
// e com `getUserId()` parando de gravar o cookie via JS (deixa o SERVIDOR,
// através do proxy, mandar o Set-Cookie — ver `track-event/route.ts`).
// DECISÃO DE DESIGN: a detecção do modo proxy é decidida AQUI NO SERVIDOR
// (pelo `?via=proxy` que o PHP manda), nunca por introspecção no navegador
// (ex.: `document.currentScript`) — isso seria frágil com Google Tag Manager
// e outras formas de injeção dinâmica de script, comuns no perfil de cliente
// desta agência.
function buildPixelScript(apiBase: string, proxyMode: boolean, serverGeoJson: string): string {
  // SÓ o track-event precisa passar pelo dm-proxy.php — é a única chamada que
  // grava o Set-Cookie de 1ª parte (_dm_uid). config NÃO seta cookie, então vai
  // DIRETO pro backend mesmo em modo proxy, poupando 1 hop pelo PHP do cliente
  // (e elimina de vez a classe de bug do separador "?ep=config?client_id=", já
  // que config nunca mais carrega a query do proxy). O pixel.js em si também é
  // carregado direto da Vercel pelo snippet novo (ver TrackingConfigPanel) com
  // `async`, então o único hop que sobra no PHP é o do cookie.
  const trackUrl = proxyMode ? "/dm-proxy.php?ep=track" : `${apiBase}/api/tracking/track-event`;
  const configUrl = `${apiBase}/api/tracking/config`;
  return `(function () {
  "use strict";

  var TRACK_URL = ${JSON.stringify(trackUrl)};
  var CONFIG_URL = ${JSON.stringify(configUrl)};
  var PROXY_MODE = ${proxyMode ? "true" : "false"};
  // Geo injetado pelo servidor ao servir este script — só em modo proxy, onde
  // a request do pixel.js chega direto do browser pra Vercel (não via PHP) e
  // a Vercel tem o IP real do visitante. No track-event, em modo proxy, a
  // request já passou pelo PHP e a Vercel veria o IP do servidor PHP.
  var SERVER_GEO = ${serverGeoJson};
  var COOKIE_NAME = "_dm_uid";
  var COOKIE_DAYS = 400; // máximo aceito pelo Chrome pra cookies de 1ª parte
  // Id do visitante memoizado por carga de página — ver getUserId().
  var cachedUserId = null;
  var inFlightForms = new WeakSet();
  // Qual pixel da empresa usar (migration 037, 1 por landing page/produto) —
  // omitido em Tracker.init() = usa o pixel "is_default" da empresa.
  var currentPixelSlug = null;

  // ─── Meta Pixel (fbq) no navegador, pareado por event_id com a CAPI ────────
  // Carregamos o fbq da própria Meta (não um 2º script — é o mesmo de sempre)
  // só quando a empresa tem meta_pixel_id configurado. Cada evento manda o
  // MESMO event_id pro fbq('track', ..., {eventID}) e pro nosso /track-event,
  // que repassa pra CAPI — é assim que a Meta deduplica Pixel (browser) +
  // Conversions API (server) como 1 evento só, em vez de contar em dobro.
  var configResolved = false;
  var hasMetaPixel = false;
  var currentMetaPixelId = null;
  var pendingFbqCalls = [];

  function loadFbq(pixelId, advancedMatching) {
    if (!window.fbq) {
      /* eslint-disable */
      !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
      n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
      document,'script','https://connect.facebook.net/en_US/fbevents.js');
      /* eslint-enable */
    }
    window.fbq("init", pixelId, advancedMatching || {});
  }

  function fireFbqTrack(eventName, eventId) {
    if (!window.fbq) return;
    window.fbq("track", eventName, {}, { eventID: eventId });
  }

  function queueFbqTrack(eventName, eventId) {
    if (configResolved) {
      if (hasMetaPixel) safe(function () { fireFbqTrack(eventName, eventId); });
      return;
    }
    pendingFbqCalls.push({ eventName: eventName, eventId: eventId });
  }

  function initMetaConfig(clientId) {
    // CONFIG_URL em modo proxy já tem query string ("/dm-proxy.php?ep=config"),
    // em modo direto não (".../api/tracking/config") — escolher o separador
    // certo, senão o proxy receberia "?ep=config?client_id=..." (2º "?"
    // literal): o PHP parsearia ep="config?client_id=..." (fora da allowlist)
    // e responderia 400, e o fbq nunca carregaria em modo proxy.
    var sep = CONFIG_URL.indexOf("?") >= 0 ? "&" : "?";
    var url = CONFIG_URL + sep + "client_id=" + encodeURIComponent(clientId);
    if (currentPixelSlug) url += "&pixel_slug=" + encodeURIComponent(currentPixelSlug);
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (cfg) { onConfigResolved(cfg && cfg.metaPixelId); })
      .catch(function () { onConfigResolved(null); });
  }

  function onConfigResolved(metaPixelId) {
    configResolved = true;
    hasMetaPixel = Boolean(metaPixelId);
    currentMetaPixelId = metaPixelId || null;
    if (hasMetaPixel) {
      safe(function () { loadFbq(metaPixelId, getLeadCache()); });
      for (var i = 0; i < pendingFbqCalls.length; i++) {
        (function (call) {
          safe(function () { fireFbqTrack(call.eventName, call.eventId); });
        })(pendingFbqCalls[i]);
      }
    }
    pendingFbqCalls = [];
  }

  function safe(fn) {
    try { fn(); } catch (err) { console.error("[Tracker]", err); }
  }

  // ─── Identificador persistente (1ª parte, sobrevive entre páginas/sessões) ──
  function readCookie(name) {
    var match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function writeCookie(name, value, days) {
    var expires = new Date(Date.now() + days * 86400000).toUTCString();
    document.cookie = name + "=" + encodeURIComponent(value) + "; expires=" + expires + "; path=/; SameSite=Lax";
  }

  function randomId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function getUserId() {
    // Memoiza por carga de página: em MODO PROXY o cookie não é gravado via JS
    // (quem grava é o servidor, via Set-Cookie na resposta do /track-event),
    // então sem memoização, na 1ª visita — antes da resposta do 1º evento
    // voltar e o cookie ficar legível — cada chamada geraria um randomId()
    // NOVO, e 2 eventos quase simultâneos (PageView + Lead) iriam com user_id
    // diferente, virando 2 fingerprints pro mesmo visitante. Travar 1 id por
    // página resolve nos 2 modos (o servidor grava ESSE id no cookie 1ª parte;
    // a próxima página lê do cookie).
    if (cachedUserId) return cachedUserId;
    var id = readCookie(COOKIE_NAME) || randomId();
    // EM MODO PROXY, NUNCA escrever esse cookie via JS — se o JS escrevesse, o
    // Safari reaplicaria o cap de 7 dias nessa escrita e anularia o proxy
    // inteiro (o cap é por ESCRITA via document.cookie, não importa a
    // origem/intenção).
    if (!PROXY_MODE) {
      // Regrava (mesmo quando o cookie já existia) pra empurrar a validade pra
      // +400 dias a partir de AGORA — sem isso, o cookie só valeria 400 dias da
      // 1ª visita e nunca mais. No Safari (modo direto, sem proxy) isso importa
      // MUITO MAIS: o ITP corta todo cookie escrito via JS pra só 7 dias, mas
      // reseta esse prazo de 7 dias a cada escrita — então renovar em toda
      // visita é o que mantém o mesmo histórico desde que o visitante volte
      // pelo menos 1x por semana (não tem como pedir mais que isso sem o
      // proxy, nem o pixel da própria Meta consegue).
      writeCookie(COOKIE_NAME, id, COOKIE_DAYS);
    }
    cachedUserId = id;
    return id;
  }

  // ─── fbp/fbc — identificadores de browser/clique da própria Meta ───────────
  // _fbp é criado pelo fbq (se carregado); _fbc só existe se o visitante
  // clicou um anúncio (?fbclid=...) — não inventar fbc sem fbclid/cookie real,
  // isso pioraria o Event Match Quality em vez de melhorar.
  function getFbp() {
    return readCookie("_fbp");
  }

  function getFbc() {
    var existing = readCookie("_fbc");
    if (existing) return existing;
    var match = window.location.search.match(/[?&]fbclid=([^&]+)/);
    if (!match) return null;
    var fbc = "fb.1." + Date.now() + "." + match[1];
    writeCookie("_fbc", fbc, COOKIE_DAYS);
    return fbc;
  }

  // ─── "Event enhancement" — reaproveita em/ph/fn/ln de um Lead anterior ─────
  // em TODOS os eventos seguintes do mesmo visitante (não só no próprio Lead).
  // Sobe o Event Match Quality de PageView/etc também, ajuda a Meta a otimizar
  // a campanha com mais sinal. Guarda só os HASHES (nunca o valor cru) — mesma
  // técnica que ferramentas de CAPI gateway (ex.: Stape) chamam de "Event
  // Enhancement"/"Customer Information cache".
  var LEAD_CACHE_COOKIE = "_dm_lead";

  function getLeadCache() {
    var raw = readCookie(LEAD_CACHE_COOKIE);
    if (!raw) return {};
    try {
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (err) {
      return {};
    }
  }

  function mergeLeadCache(newData) {
    var current = getLeadCache();
    var changed = false;
    for (var k in newData) {
      if (newData[k] && newData[k] !== current[k]) {
        current[k] = newData[k];
        changed = true;
      }
    }
    if (changed) {
      writeCookie(LEAD_CACHE_COOKIE, JSON.stringify(current), COOKIE_DAYS);
      // Atualiza o Advanced Matching do fbq pros próximos eventos de browser
      // também usarem o que acabou de ser capturado (não só os eventos CAPI).
      if (hasMetaPixel && currentMetaPixelId) {
        safe(function () { loadFbq(currentMetaPixelId, current); });
      }
    }
    return current;
  }

  async function sha256Hex(value) {
    if (!window.crypto || !window.crypto.subtle) return undefined;
    var normalized = String(value == null ? "" : value).trim().toLowerCase();
    // NUNCA hashear string vazia: sha256("") = e3b0c442... é um valor válido de
    // 64 chars que vira identificador-fantasma (não casa com ninguém, derruba o
    // match e ainda envenena o cache _dm_lead). Campo vazio/sem dígito => sem hash.
    if (!normalized) return undefined;
    var data = new TextEncoder().encode(normalized);
    var digest = await window.crypto.subtle.digest("SHA-256", data);
    return Array.prototype.map
      .call(new Uint8Array(digest), function (b) { return b.toString(16).padStart(2, "0"); })
      .join("");
  }

  // Telefone tem normalização própria na Meta: só dígitos (com DDI), sem
  // +/-/espaços/parênteses — um número mascarado tipo "(11) 99999-9999"
  // teria hash diferente do que a Meta espera se só fizesse trim+lowercase.
  function normalizePhone(value) {
    return String(value).replace(/[^\d]/g, "");
  }

  function send(clientId, eventName, extra) {
    var eventId = randomId();
    // Enriquece com o que já sabemos desse visitante de um Lead anterior —
    // o user_data do evento atual (se houver) tem prioridade sobre o cache.
    var enrichedUserData = Object.assign({}, getLeadCache(), (extra && extra.user_data) || {});
    var body = Object.assign(
      {
        client_id: clientId,
        pixel_slug: currentPixelSlug || undefined,
        event_name: eventName,
        event_url: window.location.href,
        page_title: document.title || undefined,
        user_id: getUserId(),
        event_id: eventId,
        fbp: getFbp() || undefined,
        fbc: getFbc() || undefined,
        via: PROXY_MODE ? "proxy" : "direct",
        server_geo: PROXY_MODE ? SERVER_GEO : undefined,
      },
      extra,
      { user_data: enrichedUserData }
    );
    queueFbqTrack(eventName, eventId);
    return fetch(TRACK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify(body),
    }).catch(function (err) { console.error("[Tracker] falha ao enviar evento:", err); });
  }

  function trackPageView(clientId) {
    void send(clientId, "PageView", {});
  }

  // Detecta campos de nome por name/id ou autocomplete — pra hashear fn/ln
  // pro user_data da CAPI (a Meta usa nome como chave de match também, junto
  // com email/telefone). Não impede a captura genérica em "fields" (dashboard).
  var FIRST_NAME_RE = /^(first[-_ ]?name|fname|nome)$/i;
  var LAST_NAME_RE = /^(last[-_ ]?name|lname|sobrenome|apelido)$/i;
  var FULL_NAME_RE = /^(name|full[-_ ]?name|nome[-_ ]?completo)$/i;

  function attachFormListener(clientId) {
    document.addEventListener(
      "submit",
      function (e) {
        var form = e.target;
        if (!(form instanceof HTMLFormElement) || inFlightForms.has(form)) return;
        e.preventDefault();
        inFlightForms.add(form);

        var released = false;
        function release() {
          if (released) return;
          released = true;
          HTMLFormElement.prototype.submit.call(form);
        }
        var fallback = setTimeout(release, 500);

        safe(async function () {
          var userData = {};
          var pii = {};
          var fields = {};
          var nameFirstRaw = "";
          var nameLastRaw = "";
          var skipTypes = { submit: 1, button: 1, hidden: 1, password: 1, file: 1, reset: 1, image: 1 };
          var fieldCount = 0;
          var formEls = form.querySelectorAll("input, select, textarea");
          for (var i = 0; i < formEls.length; i++) {
            var el = formEls[i];
            var type = (el.type || "").toLowerCase();
            if (skipTypes[type]) continue;
            var key = el.name || el.id;
            if (!key || !el.value) continue;

            // em/ph: "primeiro válido vence" (!userData.em/ph) — sem isso um 2º
            // campo de email/telefone no form sobrescreve o 1º, e um 2º campo
            // vazio/sem dígito apagava o bom. sha256Hex já devolve undefined pra
            // vazio, então hash-de-string-vazia nunca mais entra no user_data.
            if (type === "email") {
              if (!userData.em) {
                var emHash = await sha256Hex(el.value);
                if (emHash) { userData.em = emHash; if (!pii.email) pii.email = el.value.trim(); }
              }
              continue;
            }
            if (type === "tel") {
              if (!userData.ph) {
                var phHash = await sha256Hex(normalizePhone(el.value));
                if (phHash) { userData.ph = phHash; if (!pii.phone) pii.phone = el.value.trim(); }
              }
              continue;
            }

            var autocomplete = (el.autocomplete || "").toLowerCase();
            if (!userData.fn && (FIRST_NAME_RE.test(key) || autocomplete === "given-name")) {
              var fnHash = await sha256Hex(el.value);
              if (fnHash) userData.fn = fnHash;
              nameFirstRaw = el.value.trim();
            } else if (!userData.ln && (LAST_NAME_RE.test(key) || autocomplete === "family-name")) {
              var lnHash = await sha256Hex(el.value);
              if (lnHash) userData.ln = lnHash;
              nameLastRaw = el.value.trim();
            } else if (!userData.fn && !userData.ln && (FULL_NAME_RE.test(key) || autocomplete === "name")) {
              var nameParts = el.value.trim().split(/\s+/);
              var fnFullHash = await sha256Hex(nameParts[0]);
              if (fnFullHash) userData.fn = fnFullHash;
              nameFirstRaw = nameParts[0];
              if (nameParts.length > 1) {
                var lnFullHash = await sha256Hex(nameParts.slice(1).join(" "));
                if (lnFullHash) userData.ln = lnFullHash;
                nameLastRaw = nameParts.slice(1).join(" ");
              }
            }

            if (fieldCount >= 25) continue; // limite de segurança contra forms gigantes
            fields[key] = String(el.value).slice(0, 500);
            fieldCount++;
          }
          if (Object.keys(fields).length > 0) pii.fields = fields;
          // Nome em texto puro, fora do JSONB de extra_fields — mesmo padrão de
          // pii.email/pii.phone, pra virar coluna própria (lead_name) e dar pra
          // usar em relatório/exportação sem precisar abrir o JSON.
          var nameRaw = (nameFirstRaw + " " + nameLastRaw).trim();
          if (nameRaw) pii.name = nameRaw;
          mergeLeadCache(userData);
          await send(clientId, "Lead", { user_data: userData, pii: pii });
          clearTimeout(fallback);
          release();
        });
      },
      true
    );
  }

  window.Tracker = {
    // pixelSlug é opcional — cada landing page pode ter o seu pixel
    // (Estúdio > Tracking > Configuração); sem ele, usa o pixel padrão da empresa.
    init: function (clientId, pixelSlug) {
      currentPixelSlug = pixelSlug || null;
      safe(function () { initMetaConfig(clientId); });
      safe(function () { trackPageView(clientId); });
      safe(function () { attachFormListener(clientId); });
    },
  };

  // ─── Fila estilo gtag/fbq — deixa o script carregar com \`async\` ───────────
  // O snippet novo carrega este arquivo com \`async\` (não trava o parse/render
  // da página do cliente) e empilha o init em window.dmq ANTES do script chegar:
  //   window.dmq=window.dmq||[]; dmq.push(["init","empresa","pixel"]);
  // Drenamos a fila aqui e trocamos dmq.push por execução imediata, pra um push
  // tardio (depois que o script carregou) também rodar na hora. O Tracker.init()
  // direto (snippet legado, script bloqueante) continua válido — window.Tracker
  // segue exposto acima, então nenhuma instalação antiga quebra.
  function dmExec(args) {
    if (!args || !args.length) return;
    if (args[0] === "init") safe(function () { window.Tracker.init(args[1], args[2]); });
  }
  var existingQueue = window.dmq && window.dmq.length ? window.dmq : [];
  for (var qi = 0; qi < existingQueue.length; qi++) dmExec(existingQueue[qi]);
  window.dmq = { push: function (args) { dmExec(args); } };
})();
`;
}

export async function GET(request: NextRequest) {
  const apiBase = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  const proxyMode = request.nextUrl.searchParams.get("via") === "proxy";

  // Em modo proxy, a request DO PIXEL.JS vem direto do browser (não via PHP) —
  // nessa request a Vercel tem o IP real do visitante e os x-vercel-ip-* certos.
  // Injetamos esse geo no script pra track-event receber via payload.server_geo
  // (em track-event a Vercel vê o IP do servidor PHP do cliente, não do visitante).
  // Em modo direto, track-event já recebe a request do browser diretamente.
  let serverGeoJson = "null";
  if (proxyMode) {
    const geo = geolocation(request);
    serverGeoJson = JSON.stringify({
      country: geo.country ?? null,
      countryRegion: geo.countryRegion ?? null,
      city: geo.city ?? null,
      postalCode: geo.postalCode ?? null,
      latitude: geo.latitude ? parseFloat(geo.latitude) || null : null,
      longitude: geo.longitude ? parseFloat(geo.longitude) || null : null,
    });
  }

  return new Response(buildPixelScript(apiBase, proxyMode, serverGeoJson), {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      // MVP em iteração ativa: cache de 5min já causou confusão (cliente rodando
      // versão antiga do script logo após um deploy, parecendo "bug" no backend).
      // no-store até o script estabilizar — reavaliar cache só quando o pixel
      // parar de mudar com frequência.
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
