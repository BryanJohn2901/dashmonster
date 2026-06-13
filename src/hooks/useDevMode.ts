"use client";

import { useEffect, useState } from "react";

// ─── Modo DEV ─────────────────────────────────────────────────────────────────
// Destrava todo o gating de papel no client: quem ativa passa a ser tratado
// como dono em qualquer empresa, com acesso a todas as configurações.
//
// AVISO: isto é um portão de CONVENIÊNCIA, não de segurança. A senha vive no
// bundle e o destravamento é só de UI. As políticas RLS do Supabase continuam
// valendo no servidor — escrever em dados de outra empresa exige ser membro
// (owner/manager) daquela empresa no banco; o modo DEV não fura o RLS.

const DEV_MODE_KEY = "dm_dev_mode_v1";
const DEV_PASSWORD = "DashMonsterGWBY";

let devActive = ((): boolean => {
  if (typeof window === "undefined") return false;
  try { return localStorage.getItem(DEV_MODE_KEY) === "1"; } catch { return false; }
})();

const listeners = new Set<(v: boolean) => void>();

function setDevActive(v: boolean) {
  devActive = v;
  try { localStorage.setItem(DEV_MODE_KEY, v ? "1" : "0"); } catch {}
  listeners.forEach((l) => l(v));
}

/** Leitura síncrona fora de React (ex.: gating no useCompany). */
export function isDevModeActive(): boolean {
  return devActive;
}

/** Tenta ativar com a senha. Retorna true se a senha conferir. */
export function tryEnableDevMode(password: string): boolean {
  if (password === DEV_PASSWORD) {
    setDevActive(true);
    return true;
  }
  return false;
}

export function disableDevMode(): void {
  setDevActive(false);
}

export function useDevMode() {
  const [active, setActive] = useState(devActive);

  useEffect(() => {
    listeners.add(setActive);
    return () => { listeners.delete(setActive); };
  }, []);

  return {
    active,
    enable: tryEnableDevMode,
    disable: disableDevMode,
  };
}
