"use client";

// ─── Shells de conexão (Facebook/BM e Instagram) ───────────────────────────────
// Usados no HubSettings (usuário/gestor de tráfego) e no Painel Admin.
// Facebook: OAuth REAL — POST /api/meta/oauth/start devolve a URL do diálogo de
// login; o callback grava o token longo nas empresas.
// Instagram: vincula o perfil da empresa (settings.instagramHandle); a lista
// automática de contas IG vem da conexão do app quando o OAuth estiver feito.

import { useEffect, useState } from "react";
import { Link2, Loader2, Save } from "lucide-react";
import { toast } from "@/hooks/useToast";
import { authedFetch } from "@/lib/authedFetch";
import { updateCompanySettings, type Company } from "@/hooks/useCompany";

export function FacebookConnectShell({ connected }: { connected?: boolean }) {
  const [busy, setBusy] = useState(false);
  const connect = async () => {
    setBusy(true);
    try {
      const res = await authedFetch("/api/meta/oauth/start", { method: "POST" });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        toast.error(json.error ?? "Falha ao iniciar a conexão com o Facebook.");
        setBusy(false);
        return;
      }
      window.location.assign(json.url);
    } catch {
      toast.error("Falha de rede ao iniciar a conexão com o Facebook.");
      setBusy(false);
    }
  };
  return (
    <div className="rounded-2xl border p-5" style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-surface)" }}>
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--dm-bg-elevated)", border: "1px solid var(--dm-border-default)" }}>
          <FacebookIcon />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold" style={{ color: "var(--dm-text-primary)" }}>Conexão do app (Meta / BM)</p>
            <span className="rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ background: "rgba(100,116,139,0.14)", color: "var(--dm-text-tertiary)" }}>global</span>
          </div>
          <p className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>Conecta 1x e o token vale pra todas as empresas.</p>
        </div>
        {connected ? (
          <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ background: "rgba(34,197,94,0.14)", color: "#22C55E" }}>
            Conectado
          </span>
        ) : (
          <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ background: "rgba(244,166,13,0.14)", color: "#F4A60D" }}>
            Não conectado
          </span>
        )}
      </div>
      <button type="button" onClick={() => void connect()} disabled={busy}
        className="flex h-10 w-full items-center justify-center gap-2 rounded-xl text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-60"
        style={{ background: "#1877F2" }}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : <FacebookIcon light />}
        {busy ? "Abrindo o Facebook…" : connected ? "Reconectar Facebook" : "Conectar Facebook (BM)"}
      </button>
      <p className="mt-3 rounded-lg border p-2.5 text-[11px] leading-relaxed" style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-tertiary)" }}>
        Um app conecta <strong style={{ color: "var(--dm-text-secondary)" }}>todas</strong> as contas de anúncio e Instagram da BM. O token é o mesmo pra todo mundo —
        o que muda por empresa é só o <strong style={{ color: "var(--dm-text-secondary)" }}>ID da conta de anúncio (ACT)</strong>, na aba <em>Contas de anúncio</em>.
      </p>
    </div>
  );
}

// ─── Instagram (por empresa) ────────────────────────────────────────────────────
export function InstagramConnectShell({ company, onSaved }: { company: Company; onSaved?: () => void }) {
  const saved = String(company.settings?.instagramHandle ?? "");
  const [handle, setHandle] = useState(saved);
  const [saving, setSaving] = useState(false);
  useEffect(() => setHandle(String(company.settings?.instagramHandle ?? "")), [company]);

  const save = async () => {
    setSaving(true);
    try {
      await updateCompanySettings(company.id, {
        ...company.settings,
        instagramHandle: handle.trim().replace(/^@/, ""),
      });
      toast.success("Conta do Instagram vinculada.");
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally { setSaving(false); }
  };

  return (
    <div className="rounded-2xl border p-5" style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-surface)" }}>
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--dm-bg-elevated)", border: "1px solid var(--dm-border-default)" }}>
          <InstagramIcon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold" style={{ color: "var(--dm-text-primary)" }}>Conta do Instagram</p>
          <p className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>Qual perfil IG pertence a esta empresa — usado no monitoramento de ganhos/perdas.</p>
        </div>
        {saved ? (
          <span className="rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ background: "rgba(34,197,94,0.14)", color: "#22C55E" }}>@{saved}</span>
        ) : (
          <span className="rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ background: "rgba(244,166,13,0.14)", color: "#F4A60D" }}>Não vinculado</span>
        )}
      </div>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px] font-bold" style={{ color: "var(--dm-text-tertiary)" }}>@</span>
          <input value={handle} onChange={(e) => setHandle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void save(); }}
            placeholder="perfil.da.empresa"
            className="h-10 w-full rounded-xl border pl-8 pr-3 text-[13px] outline-none"
            style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }} />
        </div>
        <button type="button" onClick={() => void save()} disabled={saving || handle.trim().replace(/^@/, "") === saved}
          className="flex h-10 items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-40"
          style={{ background: "var(--dm-btn-primary-bg)" }}>
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />} Vincular
        </button>
      </div>
      <p className="mt-3 rounded-lg border p-2.5 text-[11px] leading-relaxed" style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-tertiary)" }}>
        Com o app conectado (botão do Facebook acima), a lista de contas IG disponíveis da BM aparece aqui automaticamente.
      </p>
    </div>
  );
}

function InstagramIcon({ size = 18, muted }: { size?: number; muted?: boolean }) {
  const c = muted ? "var(--dm-text-tertiary)" : "var(--dm-text-secondary)";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill={c} stroke="none" />
    </svg>
  );
}

function FacebookIcon({ light }: { light?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={light ? "#fff" : "#1877F2"} aria-hidden>
      <path d="M24 12c0-6.627-5.373-12-12-12S0 5.373 0 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874V12h3.328l-.532 3.469h-2.796v8.385C19.612 22.954 24 17.99 24 12z"/>
    </svg>
  );
}
