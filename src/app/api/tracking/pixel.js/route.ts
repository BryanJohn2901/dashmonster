import { NextRequest } from "next/server";

// Servido via route handler (não public/pixel.js estático) pra poder injetar
// a origem da API em runtime e controlar cache sem passo de build — TTL
// curto porque o script ainda deve iterar rápido nesta fase MVP.
function buildPixelScript(apiBase: string): string {
  return `(function () {
  "use strict";

  var TRACK_URL = ${JSON.stringify(`${apiBase}/api/tracking/track-event`)};
  var inFlightForms = new WeakSet();

  function safe(fn) {
    try { fn(); } catch (err) { console.error("[Tracker]", err); }
  }

  async function sha256Hex(value) {
    if (!window.crypto || !window.crypto.subtle) return undefined;
    var data = new TextEncoder().encode(String(value).trim().toLowerCase());
    var digest = await window.crypto.subtle.digest("SHA-256", data);
    return Array.prototype.map
      .call(new Uint8Array(digest), function (b) { return b.toString(16).padStart(2, "0"); })
      .join("");
  }

  function send(clientId, eventName, extra) {
    var body = Object.assign(
      { client_id: clientId, event_name: eventName, event_url: window.location.href },
      extra
    );
    return fetch(TRACK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify(body),
    }).catch(function () {});
  }

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
          var inputs = form.querySelectorAll("input[type='email'], input[type='tel']");
          for (var i = 0; i < inputs.length; i++) {
            var input = inputs[i];
            if (!input.value) continue;
            var hash = await sha256Hex(input.value);
            if (!hash) continue;
            if (input.type === "email") userData.em = hash;
            if (input.type === "tel") userData.ph = hash;
          }
          await send(clientId, "Lead", { user_data: userData });
          clearTimeout(fallback);
          release();
        });
      },
      true
    );
  }

  function attachWhatsAppListener(clientId) {
    document.addEventListener(
      "click",
      function (e) {
        var link = e.target.closest && e.target.closest("a[href*='whatsapp']");
        if (!link) return;
        e.preventDefault();

        var navigated = false;
        function go() {
          if (navigated) return;
          navigated = true;
          window.location.href = link.href;
        }
        var fallback = setTimeout(go, 300);

        safe(async function () {
          await send(clientId, "Contact", {});
          clearTimeout(fallback);
          go();
        });
      },
      true
    );
  }

  // Suporta o shape GA4 ecommerce documentado para o MVP — schemas
  // diferentes de dataLayer (Universal Analytics, GTM customizado) são
  // um rough edge conhecido; mapeamento semântico genérico fica fora
  // do escopo MVP (ver PRD: "AI semântica" explicitamente out-of-scope).
  function attachDataLayerInterceptor(clientId) {
    window.dataLayer = window.dataLayer || [];
    var originalPush = window.dataLayer.push.bind(window.dataLayer);
    window.dataLayer.push = function () {
      var args = arguments;
      safe(function () {
        for (var i = 0; i < args.length; i++) {
          var item = args[i];
          if (item && (item.event === "purchase" || item.ecommerce)) {
            var ecommerce = item.ecommerce || {};
            send(clientId, "Purchase", {
              custom_data: { value: ecommerce.value, currency: ecommerce.currency },
            });
          }
        }
      });
      return originalPush.apply(window.dataLayer, args);
    };
  }

  window.Tracker = {
    init: function (clientId) {
      safe(function () { attachFormListener(clientId); });
      safe(function () { attachWhatsAppListener(clientId); });
      safe(function () { attachDataLayerInterceptor(clientId); });
    },
  };
})();
`;
}

export async function GET(request: NextRequest) {
  const apiBase = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;

  return new Response(buildPixelScript(apiBase), {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
