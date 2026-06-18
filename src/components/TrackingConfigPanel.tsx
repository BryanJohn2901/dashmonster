"use client";

import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "@/hooks/useToast";
import { setCompanyTracking, type Company, type TrackingConfig } from "@/hooks/useCompany";

const BRAND = "#6366C8";
const inputCls = "h-11 rounded-xl border px-3.5 text-[13px] outline-none transition focus:ring-1";
const inputStyle = { borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" } as React.CSSProperties;
const btnPrimary = "flex items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-bold text-white transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6366C8] focus-visible:ring-offset-1";
const btnPrimaryStyle = { background: "linear-gradient(135deg,#6366C8 0%,#313491 100%)" } as React.CSSProperties;

// Conteúdo do formulário de config do pixel — usado tanto no Estúdio da Empresa
// (dentro do accordion "Tracking Pixel") quanto direto na aba Tracking (seção
// "Configuração"), pra não ter 2 cópias da mesma lógica de salvar/validar.
export function TrackingConfigPanel({ company, canEdit, tracking, onTracking }: {
  company: Company;
  canEdit: boolean;
  tracking: TrackingConfig;
  onTracking: (t: TrackingConfig) => void;
}) {
  const [pixelId, setPixelId] = useState(tracking.metaPixelId);
  const [capiToken, setCapiToken] = useState(tracking.metaCapiToken);
  const [dominio, setDominio] = useState(tracking.dominioAutorizado);
  const [saving, setSaving] = useState(false);
  const [revealToken, setRevealToken] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPixelId(tracking.metaPixelId);
    setCapiToken(tracking.metaCapiToken);
    setDominio(tracking.dominioAutorizado);
  }, [tracking]);

  const dirty = pixelId !== tracking.metaPixelId || capiToken !== tracking.metaCapiToken || dominio !== tracking.dominioAutorizado;
  const slug = company.slug;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const snippet = `<script src="${origin}/api/tracking/pixel.js"></script>\n<script>Tracker.init("${slug}");</script>`;
  const [copied, setCopied] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const next: TrackingConfig = { metaPixelId: pixelId.trim(), metaCapiToken: capiToken.trim(), dominioAutorizado: dominio.trim() };
      await setCompanyTracking(company.id, next);
      onTracking(next);
      toast.success("Tracking pixel configurado!");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao salvar."); } finally { setSaving(false); }
  };

  const copySnippet = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { toast.error("Não foi possível copiar."); }
  };

  return (
    <div className="space-y-3">
      {!canEdit && (
        <p className="rounded-lg border px-3 py-2 text-[11px] font-semibold" style={{ borderColor: "#F4A60D", background: "rgba(244,166,13,0.08)", color: "#F4A60D" }}>
          Somente o dono da empresa pode editar essas configurações — os campos abaixo estão travados pro seu papel atual.
        </p>
      )}
      <p className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
        Pixel server-side próprio (form submit, clique WhatsApp, dataLayer) — captura e mostra na aba{" "}
        <strong style={{ color: "var(--dm-text-secondary)" }}>Tracking</strong> mesmo sem nenhuma credencial da Meta abaixo.
        O envio pra Meta Conversions API é opcional, só acontece se Pixel ID e Token CAPI estiverem preenchidos.
      </p>
      <div className="rounded-xl border" style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)" }}>
        <div className="flex items-center justify-between border-b px-3 py-1.5" style={{ borderColor: "var(--dm-border-default)" }}>
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Código de instalação</span>
          <button type="button" onClick={() => void copySnippet()} className="text-[10px] font-bold transition-opacity hover:opacity-70" style={{ color: copied ? "#05CD99" : BRAND }}>
            {copied ? "Copiado!" : "Copiar"}
          </button>
        </div>
        <pre className="overflow-x-auto px-3 py-2.5 font-mono text-[11px] leading-relaxed" style={{ color: "var(--dm-text-secondary)" }}>{snippet}</pre>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Domínio autorizado (opcional)</span>
        <input value={dominio} disabled={!canEdit} onChange={(e) => setDominio(e.target.value)} placeholder="meusite.com.br" className={`${inputCls} h-10 font-mono disabled:opacity-60`} style={inputStyle} />
        <span className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
          Só o hostname, sem protocolo nem porta (ex: <code>meusite.com.br</code>, não <code>https://meusite.com.br</code>). Em branco = aceita qualquer origem (ok pra testar).
        </span>
      </label>

      <div className="mt-1 flex items-center gap-2 border-t pt-3" style={{ borderColor: "var(--dm-border-default)" }}>
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Enviar também pra Meta Conversions API</span>
        <span className="rounded-full px-2 py-0.5 text-[9px] font-semibold" style={{ background: "rgba(100,116,139,0.12)", color: "var(--dm-text-tertiary)" }}>opcional</span>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Pixel ID (Meta)</span>
        <input value={pixelId} disabled={!canEdit} onChange={(e) => setPixelId(e.target.value)} placeholder="123456789012345" className={`${inputCls} h-10 font-mono disabled:opacity-60`} style={inputStyle} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Token CAPI (Conversions API)</span>
        <div className="flex items-center gap-2">
          <input
            type={revealToken ? "text" : "password"}
            value={capiToken}
            disabled={!canEdit}
            onChange={(e) => setCapiToken(e.target.value)}
            placeholder="EAAxxxx…"
            className={`flex-1 ${inputCls} h-10 font-mono disabled:opacity-60`}
            style={inputStyle}
          />
          {capiToken && (
            <button type="button" onClick={() => setRevealToken((v) => !v)} className="text-[10px] font-bold" style={{ color: BRAND }}>{revealToken ? "Ocultar" : "Revelar"}</button>
          )}
        </div>
        <span className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>Diferente do token de gestão de anúncios da Conexão Meta — gere em Events Manager → Configurações → Conversions API.</span>
      </label>
      {canEdit && (
        <button type="button" onClick={() => void save()} disabled={saving || !dirty} className={`h-11 w-full ${btnPrimary}`} style={btnPrimaryStyle}>
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Salvar tracking
        </button>
      )}
    </div>
  );
}
