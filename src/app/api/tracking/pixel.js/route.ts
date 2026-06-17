import { NextRequest } from "next/server";

// Servido via route handler (não public/pixel.js estático) pra poder injetar
// a origem da API em runtime e controlar cache sem passo de build — TTL
// curto porque o script ainda deve iterar rápido nesta fase MVP.
function buildPixelScript(apiBase: string): string {
  return `(function () {
  "use strict";

  var TRACK_URL = ${JSON.stringify(`${apiBase}/api/tracking/track-event`)};
  var COOKIE_NAME = "_dm_uid";
  var COOKIE_DAYS = 400; // máximo aceito pelo Chrome pra cookies de 1ª parte
  var inFlightForms = new WeakSet();

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
    var id = readCookie(COOKIE_NAME);
    if (!id) {
      id = randomId();
      writeCookie(COOKIE_NAME, id, COOKIE_DAYS);
    }
    return id;
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
      { client_id: clientId, event_name: eventName, event_url: window.location.href, user_id: getUserId() },
      extra
    );
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
          var inputs = form.querySelectorAll("input[type='email'], input[type='tel']");
          for (var i = 0; i < inputs.length; i++) {
            var input = inputs[i];
            if (!input.value) continue;
            var hash = await sha256Hex(input.value);
            if (input.type === "email") {
              pii.email = input.value.trim();
              if (hash) userData.em = hash;
            }
            if (input.type === "tel") {
              pii.phone = input.value.trim();
              if (hash) userData.ph = hash;
            }
          }
          await send(clientId, "Lead", { user_data: userData, pii: pii });
          clearTimeout(fallback);
          release();
        });
      },
      true
    );
  }

  window.Tracker = {
    init: function (clientId) {
      safe(function () { trackPageView(clientId); });
      safe(function () { attachFormListener(clientId); });
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
