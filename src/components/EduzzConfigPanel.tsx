"use client";

import { useState } from "react";
import { Loader2, RefreshCw, Save, CheckCircle2 } from "lucide-react";
import { updateCompanySettings, refreshCompany, type Company } from "@/hooks/useCompany";

const EDUZZ_WEBHOOK_SECRET_KEY = "eduzz_webhook_secret";
type EduzzWebhookKind = "legacy" | "modern";

const BRAND = "#6366C8";
const inputCls = "h-11 rounded-xl border px-3.5 text-[13px] outline-none transition focus:ring-1";
const inputStyle = { borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" } as React.CSSProperties;
const btnPrimary = "flex items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-bold text-white transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100";
const btnPrimaryStyle = { background: "linear-gradient(135deg,#6366C8 0%,#313491 100%)" } as React.CSSProperties;

// Config do webhook de vendas Eduzz — mesma URL aceita os 2 formatos que a
// Eduzz oferece (postback antigo MyEduzz e webhook moderno Órbita), o toggle
// abaixo só troca a instrução de qual cadastrar do lado de lá (ver
// src/app/api/eduzz/CLAUDE.md pro detalhe de detecção automática de formato).
export function EduzzConfigPanel({ company, canEdit }: { company: Company; canEdit: boolean }) {
  const settings = company.settings ?? {};
  const [secret, setSecret] = useState(() => String(settings[EDUZZ_WEBHOOK_SECRET_KEY] ?? ""));
  const [kind, setKind] = useState<EduzzWebhookKind>("modern");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const webhookUrl =
    typeof window !== "undefined" && secret.trim()
      ? `${window.location.origin}/api/eduzz/webhook?secret=${encodeURIComponent(secret.trim())}`
      : "";

  const generate = () => setSecret((crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)).replace(/-/g, ""));

  const save = async () => {
    setSaving(true);
    try {
      await updateCompanySettings(company.id, { ...settings, [EDUZZ_WEBHOOK_SECRET_KEY]: secret.trim() });
      await refreshCompany();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {!canEdit && (
        <p className="rounded-lg border px-3 py-2 text-[11px] font-semibold" style={{ borderColor: "#F4A60D", background: "rgba(244,166,13,0.08)", color: "#F4A60D" }}>
          Somente o dono ou o gestor de tráfego da empresa podem editar essas configurações.
        </p>
      )}
      <p className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
        Cada venda <strong style={{ color: "var(--dm-text-secondary)" }}>paga</strong> entra como receita no dashboard e — quando há um
        pixel com Meta CAPI configurado — também vira um evento <strong style={{ color: "var(--dm-text-secondary)" }}>Compra</strong> mandado
        pra Meta Ads, igual aos eventos do pixel próprio.
      </p>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Segredo do webhook</span>
        <div className="flex items-center gap-2">
          <input
            value={secret}
            disabled={!canEdit}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="segredo do webhook"
            className={`flex-1 ${inputCls} font-mono disabled:opacity-60`}
            style={inputStyle}
          />
          {canEdit && (
            <button type="button" onClick={generate}
              className="flex h-11 items-center justify-center gap-1 rounded-xl border px-3 text-xs font-semibold transition-opacity hover:opacity-80"
              style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}>
              <RefreshCw size={11} /> Gerar
            </button>
          )}
        </div>
      </label>

      {webhookUrl && (
        <div className="rounded-xl border" style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)" }}>
          <div className="border-b px-3 py-1.5" style={{ borderColor: "var(--dm-border-default)" }}>
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>URL do webhook</span>
          </div>
          <pre className="overflow-x-auto px-3 py-2.5 font-mono text-[11px] leading-relaxed" style={{ color: "var(--dm-text-secondary)" }}>{webhookUrl}</pre>
        </div>
      )}

      {canEdit && (
        <button type="button" onClick={() => void save()} disabled={saving}
          className={`h-11 w-full ${btnPrimary}`} style={btnPrimaryStyle}>
          {saving ? <Loader2 size={13} className="animate-spin" /> : saved ? <CheckCircle2 size={13} /> : <Save size={13} />}
          {saved ? "Salvo!" : "Salvar segredo"}
        </button>
      )}

      <div className="flex gap-1 rounded-xl border p-0.5" style={{ borderColor: "var(--dm-border-default)" }}>
        {([
          ["modern", "Órbita (novo)"],
          ["legacy", "MyEduzz (antigo)"],
        ] as [EduzzWebhookKind, string][]).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setKind(k)}
            className="h-8 flex-1 rounded-lg text-[11px] font-semibold transition"
            style={kind === k ? { backgroundColor: BRAND, color: "#fff" } : { color: "var(--dm-text-tertiary)" }}>
            {label}
          </button>
        ))}
      </div>

      {kind === "modern" ? (
        <p className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
          Cadastre na Eduzz em <strong style={{ color: "var(--dm-text-secondary)" }}>Órbita → Webhooks</strong>, evento{" "}
          <strong style={{ color: "var(--dm-text-secondary)" }}>&quot;Fatura paga&quot;</strong>, colando a URL acima. Manda email e
          telefone do comprador — gera evento de compra pra Meta Ads com Match Quality melhor. Recomendado.
        </p>
      ) : (
        <p className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
          Cadastre na Eduzz em <strong style={{ color: "var(--dm-text-secondary)" }}>MyEduzz → Ferramentas → Notificações</strong>,
          colando a URL acima. Só manda email do comprador (sem telefone) — funciona, mas com Match Quality menor na Meta.
        </p>
      )}
      <p className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
        Só vendas <strong style={{ color: "var(--dm-text-secondary)" }}>pagas</strong> entram no dashboard como receita.
      </p>
    </div>
  );
}
