"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Image as ImageIcon, Loader2, Settings2, Sparkles, X } from "lucide-react";
import { exportReport, type ReportFormat } from "@/utils/exportReport";
import { ReportTemplate, REPORT_WIDTH } from "@/components/ReportTemplate";
import type { ReportData } from "@/types/report";

interface ReportModalProps {
  data: ReportData;
  fileName: string;
  onClose: () => void;
}

interface ToggleItem { id: string; label: string; }

export function ReportModal({ data, fileName, onClose }: ReportModalProps) {
  const [step, setStep]     = useState<"choice" | "preview">("choice");
  const [custom, setCustom] = useState(false);
  const [format, setFormat] = useState<ReportFormat>("png");
  const [busy, setBusy]     = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [scale, setScale]   = useState(1);
  const [capturing, setCapturing] = useState(false);

  const templateRef  = useRef<HTMLDivElement>(null);
  const previewBoxRef = useRef<HTMLDivElement>(null);

  const generatedAt = useMemo(
    () => new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }),
    [],
  );

  // Lista de itens/etapas para o painel Personalizar.
  const toggles = useMemo<ToggleItem[]>(() => {
    const out: ToggleItem[] = [];
    for (const g of data.groups) for (const it of g.items) out.push({ id: it.id, label: it.label });
    for (const s of data.funnel?.steps ?? []) out.push({ id: s.id, label: `Funil · ${s.label}` });
    return out;
  }, [data]);

  // Escala o template (largura fixa) para caber na área de prévia (só scroll vertical).
  useEffect(() => {
    if (step !== "preview") return;
    const recompute = () => {
      const box = previewBoxRef.current;
      if (!box) return;
      setScale(Math.min(1, (box.clientWidth - 24) / REPORT_WIDTH));
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    if (previewBoxRef.current) ro.observe(previewBoxRef.current);
    return () => ro.disconnect();
  }, [step]);

  const toggle = (id: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const save = async () => {
    if (!templateRef.current || busy) return;
    setBusy(true);
    setCapturing(true);
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    try {
      await exportReport(templateRef.current, { format, fileName });
      onClose();
    } catch (e) {
      console.error("[report] falhou:", e);
    } finally {
      setCapturing(false);
      setBusy(false);
    }
  };

  const previewH = capturing ? undefined : (templateRef.current ? templateRef.current.offsetHeight * scale : undefined);

  const bodyEl = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(2,6,23,0.6)", backdropFilter: "blur(10px)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>

      {step === "choice" ? (
        <div className="w-full max-w-md overflow-hidden rounded-3xl border shadow-2xl"
          style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}>
          <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--dm-border-subtle)" }}>
            <h3 className="text-sm font-bold" style={{ color: "var(--dm-text-primary)" }}>Gerar relatório</h3>
            <button type="button" onClick={onClose} className="rounded-lg p-1 hover:bg-white/10" style={{ color: "var(--dm-text-tertiary)" }}><X size={16} /></button>
          </div>
          <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
            <button type="button" onClick={() => { setCustom(false); setStep("preview"); }}
              className="flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition hover:-translate-y-0.5"
              style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)" }}>
              <Sparkles size={18} style={{ color: "var(--dm-brand-500, #6366C8)" }} />
              <span className="text-sm font-bold" style={{ color: "var(--dm-text-primary)" }}>Configuração atual</span>
              <span className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>Gera com todas as métricas e o funil.</span>
            </button>
            <button type="button" onClick={() => { setCustom(true); setStep("preview"); }}
              className="flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition hover:-translate-y-0.5"
              style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)" }}>
              <Settings2 size={18} style={{ color: "var(--dm-brand-500, #6366C8)" }} />
              <span className="text-sm font-bold" style={{ color: "var(--dm-text-primary)" }}>Personalizar</span>
              <span className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>Escolha quais cards e etapas incluir.</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border shadow-2xl"
          style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}>
          <div className="flex items-center justify-between border-b px-5 py-3" style={{ borderColor: "var(--dm-border-subtle)" }}>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold" style={{ color: "var(--dm-text-primary)" }}>Pré-visualização do relatório</h3>
              <button type="button" onClick={() => setCustom((v) => !v)}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold"
                style={custom
                  ? { background: "var(--dm-brand-500, #6366C8)", color: "#fff" }
                  : { backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-tertiary)", border: "1px solid var(--dm-border-default)" }}>
                <Settings2 size={12} /> Personalizar
              </button>
            </div>
            <button type="button" onClick={onClose} className="rounded-lg p-1 hover:bg-white/10" style={{ color: "var(--dm-text-tertiary)" }}><X size={16} /></button>
          </div>

          <div className="flex min-h-0 flex-1">
            {custom && (
              <div className="w-56 flex-shrink-0 overflow-y-auto border-r p-3" style={{ borderColor: "var(--dm-border-subtle)" }}>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Incluir no relatório</p>
                <div className="space-y-1">
                  {toggles.map((t) => (
                    <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] transition hover:bg-white/5" style={{ color: "var(--dm-text-secondary)" }}>
                      <input type="checkbox" checked={!hidden.has(t.id)} onChange={() => toggle(t.id)} className="h-3.5 w-3.5 accent-[var(--dm-brand-500,#6366C8)]" />
                      <span className="truncate">{t.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div ref={previewBoxRef} className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-3" style={{ background: "var(--dm-bg-page, #0b1437)" }}>
              <div style={{ height: previewH }}>
                <div style={{ transform: capturing ? "none" : `scale(${scale})`, transformOrigin: "top left", width: REPORT_WIDTH }}>
                  <ReportTemplate innerRef={templateRef} data={data} hiddenIds={hidden} generatedAt={generatedAt} />
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t px-5 py-3" style={{ borderColor: "var(--dm-border-subtle)" }}>
            <div className="flex rounded-xl p-0.5" style={{ backgroundColor: "var(--dm-bg-elevated)" }}>
              {(["png", "pdf"] as const).map((f) => (
                <button key={f} type="button" onClick={() => setFormat(f)}
                  className="flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[12px] font-semibold transition"
                  style={format === f ? { background: "var(--dm-brand-500, #6366C8)", color: "#fff" } : { color: "var(--dm-text-tertiary)" }}>
                  {f === "png" ? <ImageIcon size={13} /> : <FileText size={13} />}{f.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} className="rounded-xl px-3 py-2 text-[12px] font-semibold" style={{ color: "var(--dm-text-tertiary)" }}>Cancelar</button>
              <button type="button" onClick={() => void save()} disabled={busy}
                className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12px] font-bold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg,#6366C8 0%,#313491 100%)" }}>
                {busy ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
                Salvar {format.toUpperCase()}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(bodyEl, document.body);
}
