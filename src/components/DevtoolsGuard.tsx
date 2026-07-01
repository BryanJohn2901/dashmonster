"use client";

/**
 * DevtoolsGuard — deterrente anti-inspeção.
 *
 * AVISO HONESTO: detecção de DevTools NÃO é segurança real. Não existe API
 * confiável; todo heurístico tem falso-positivo e é burlável em segundos (aba
 * Network, view-source:, proxy). Isto é dissuasão/anti-tamper, não proteção.
 * Proteção de verdade = segredo no servidor, nunca ofuscar o cliente.
 *
 * Comportamento: ao detectar DevTools aberto, desloga o usuário e tranca a tela
 * por 30 min (persiste em localStorage — refresh não escapa) com um overlay de
 * "sistema quebrando".
 *
 * Bypass p/ desenvolvimento: localStorage.setItem("pf_devbypass", "1").
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";

const LOCK_KEY = "pf_lockout_until";
const BYPASS_KEY = "pf_devbypass";
const LOCK_MS = 30 * 60 * 1000; // 30 minutos
const SIZE_THRESHOLD = 170;     // delta janela↔viewport quando DevTools dockado

const MESSAGE = "Você não deveria ver algo que não pode.";

function readLockRemaining(): number {
  try {
    const until = Number(localStorage.getItem(LOCK_KEY) || 0);
    return until > Date.now() ? until - Date.now() : 0;
  } catch {
    return 0;
  }
}

function fmt(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export function DevtoolsGuard() {
  const [remaining, setRemaining] = useState(0); // >0 = travado
  const engagedRef = useRef(false);

  // Dispara o lockout: persiste, desloga, mostra overlay.
  const engage = useCallback(() => {
    if (engagedRef.current) return;
    engagedRef.current = true;
    const until = Date.now() + LOCK_MS;
    try { localStorage.setItem(LOCK_KEY, String(until)); } catch {}
    setRemaining(LOCK_MS);
    try { void createClient().auth.signOut(); } catch {}
  }, []);

  useEffect(() => {
    try { if (localStorage.getItem(BYPASS_KEY) === "1") return; } catch {}

    // Já estava travado? Retoma a contagem (refresh não escapa).
    const left = readLockRemaining();
    if (left > 0) { engagedRef.current = true; setRemaining(left); }

    let raf = 0;
    const sizeOpen = () =>
      window.outerWidth - window.innerWidth > SIZE_THRESHOLD ||
      window.outerHeight - window.innerHeight > SIZE_THRESHOLD;

    // Truque do getter: o console acessa .id ao renderizar o objeto logado.
    let getterHit = false;
    const bait: Record<string, unknown> = {};
    Object.defineProperty(bait, "id", { get() { getterHit = true; return ""; } });

    const probe = () => {
      getterHit = false;
      console.log("%c", bait);
      console.clear();
      // Heurística do debugger: com DevTools aberto, o `debugger` PAUSA a execução;
      // fechado, é no-op (rápido). Timing alto = alguém inspecionando.
      // new Function() em runtime pra o minificador do Next não remover o debugger.
      const t0 = performance.now();
      try { (new Function("debugger"))(); } catch { /* CSP/eval bloqueado — ignora */ }
      const debuggerPaused = performance.now() - t0 > 120;
      if (getterHit || sizeOpen() || debuggerPaused) engage();
      raf = window.setTimeout(probe, 1000);
    };
    probe();

    return () => window.clearTimeout(raf);
  }, [engage]);

  // Bloqueio de atalhos de inspeção + menu de contexto. Deterrência extra —
  // burlável (menu do browser, proxy), mas eleva a barra pra cópia casual.
  useEffect(() => {
    try { if (localStorage.getItem(BYPASS_KEY) === "1") return; } catch {}
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const blocked =
        e.key === "F12" ||
        (e.ctrlKey && e.shiftKey && (k === "i" || k === "j" || k === "c")) ||
        (e.ctrlKey && (k === "u" || k === "s"));
      if (blocked) { e.preventDefault(); e.stopPropagation(); }
    };
    const onCtx = (e: MouseEvent) => e.preventDefault();
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("contextmenu", onCtx, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("contextmenu", onCtx, true);
    };
  }, []);

  // Countdown do overlay; ao zerar, libera (reload p/ estado limpo).
  useEffect(() => {
    if (remaining <= 0) return;
    const id = window.setInterval(() => {
      const left = readLockRemaining();
      if (left <= 0) {
        try { localStorage.removeItem(LOCK_KEY); } catch {}
        window.location.reload();
      } else {
        setRemaining(left);
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [remaining]);

  if (remaining <= 0) return null;

  const pct = Math.max(0, Math.min(100, (remaining / LOCK_MS) * 100));

  return (
    <div className="dtg-overlay" role="alertdialog" aria-label="Acesso bloqueado">
      <div className="dtg-aura" aria-hidden="true" />
      <div className="dtg-grid" aria-hidden="true" />
      <div className="dtg-card">
        <p className="dtg-kicker">SYSTEM BREACH</p>
        <h1 className="dtg-title">{MESSAGE}</h1>
        <p className="dtg-sub">Sessão encerrada. Acesso bloqueado por segurança.</p>
        <div className="dtg-timer" aria-live="polite">{fmt(remaining)}</div>
        <div className="dtg-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
        <p className="dtg-note">Aguarde o fim da contagem para voltar.</p>
      </div>
    </div>
  );
}
