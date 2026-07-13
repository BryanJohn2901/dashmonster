"use client";

/**
 * DevtoolsGuard — deterrente anti-inspeção.
 *
 * AVISO HONESTO: detecção de DevTools NÃO é segurança real. Não existe API
 * confiável; todo heurístico tem falso-positivo e é burlável em segundos (aba
 * Network, view-source:, proxy). Isto é dissuasão/anti-tamper, não proteção.
 * Proteção de verdade = segredo no servidor, nunca ofuscar o cliente.
 *
 * Comportamento: ao detectar DevTools aberto (F12/inspeção/console), desloga o
 * usuário e tranca a tela por 30 min (persiste em localStorage — refresh não
 * escapa) com um overlay de "sistema quebrando". O usuário pode liberar antes
 * digitando a senha da conta ("acha que foi engano? entre de novo").
 *
 * NOTA: a heurística de tamanho de janela foi REMOVIDA de propósito — ela dava
 * falso-positivo ao dar zoom / aumentar as letras (Ctrl +), que encolhe o
 * innerWidth sem DevTools nenhum aberto. Fica só o que indica inspeção real:
 * getter-bait do console + timing do `debugger` + bloqueio de atalhos.
 *
 * Bypass p/ desenvolvimento: localStorage.setItem("pf_devbypass", "1").
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";

const LOCK_KEY = "pf_lockout_until";
const LOCK_EMAIL_KEY = "pf_lockout_email";
const BYPASS_KEY = "pf_devbypass";
const LOCK_MS = 30 * 60 * 1000; // 30 minutos

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
    // Guarda o e-mail logado ANTES de deslogar — é o que o desbloqueio por senha
    // usa pra reautenticar (sem isso o form pediria o e-mail de novo).
    try {
      void createClient().auth.getUser().then(({ data }) => {
        const email = data.user?.email;
        if (email) { try { localStorage.setItem(LOCK_EMAIL_KEY, email); } catch {} }
        void createClient().auth.signOut();
      });
    } catch {}
  }, []);

  useEffect(() => {
    try { if (localStorage.getItem(BYPASS_KEY) === "1") return; } catch {}

    // Já estava travado? Retoma a contagem (refresh não escapa).
    const left = readLockRemaining();
    if (left > 0) { engagedRef.current = true; setRemaining(left); }

    let raf = 0;

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
      // Sem heurística de tamanho de janela: dava falso-positivo no zoom/aumento
      // de fonte. Só getter-bait + debugger indicam inspeção de verdade.
      if (getterHit || debuggerPaused) engage();
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
        try { localStorage.removeItem(LOCK_KEY); localStorage.removeItem(LOCK_EMAIL_KEY); } catch {}
        window.location.reload();
      } else {
        setRemaining(left);
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [remaining]);

  // Desbloqueio por senha: reautentica com o e-mail guardado antes do signOut.
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState("");

  useEffect(() => {
    if (!unlockOpen) return;
    try { setEmail(localStorage.getItem(LOCK_EMAIL_KEY) ?? ""); } catch {}
  }, [unlockOpen]);

  const submitUnlock = useCallback(async () => {
    const mail = email.trim().toLowerCase();
    if (!mail || !password) { setUnlockError("Preencha e-mail e senha."); return; }
    setUnlocking(true);
    setUnlockError("");
    try {
      const { error } = await createClient().auth.signInWithPassword({ email: mail, password });
      if (error) { setUnlockError("E-mail ou senha incorretos."); setUnlocking(false); return; }
      // Credencial válida = foi engano do detector. Libera e recarrega logado.
      try { localStorage.removeItem(LOCK_KEY); localStorage.removeItem(LOCK_EMAIL_KEY); } catch {}
      window.location.reload();
    } catch {
      setUnlockError("Falha ao validar. Tente de novo.");
      setUnlocking(false);
    }
  }, [email, password]);

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
        <div className="dtg-bar" aria-hidden="true"><span style={{ transform: `scaleX(${pct / 100})` }} /></div>

        {!unlockOpen ? (
          <>
            <p className="dtg-note">Aguarde o fim da contagem para voltar.</p>
            <button type="button" className="dtg-unlock-link" onClick={() => setUnlockOpen(true)}>
              Acha que foi um engano? Entre com sua senha para liberar agora.
            </button>
          </>
        ) : (
          <form
            className="dtg-unlock-form"
            onSubmit={(e) => { e.preventDefault(); void submitUnlock(); }}
          >
            <input
              type="email"
              className="dtg-input"
              placeholder="Seu e-mail"
              value={email}
              autoComplete="username"
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              type="password"
              className="dtg-input"
              placeholder="Sua senha"
              value={password}
              autoFocus
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
            />
            {unlockError && <p className="dtg-unlock-error">{unlockError}</p>}
            <button type="submit" className="dtg-unlock-btn" disabled={unlocking}>
              {unlocking ? "Verificando…" : "Liberar acesso"}
            </button>
            <button type="button" className="dtg-unlock-cancel" onClick={() => setUnlockOpen(false)}>
              Cancelar
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
