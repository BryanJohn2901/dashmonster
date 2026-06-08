"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Image as ImageIcon, Loader2, Settings2, Sparkles, X } from "lucide-react";
import { exportReport, type ReportFormat } from "@/utils/exportReport";

interface ReportModalProps {
  targetRef: React.RefObject<HTMLElement | null>;
  fileName: string;
  title: string;        // perfil / grupo
  period: string;       // "dd/mm → dd/mm"
  onClose: () => void;
}

interface Block { idx: number; label: string; }

export function ReportModal({ targetRef, fileName, title, period, onClose }: ReportModalProps) {
  const [step, setStep]       = useState<"choice" | "preview">("choice");
  const [custom, setCustom]   = useState(false);
  const [format, setFormat]   = useState<ReportFormat>("png");
  const [busy, setBusy]       = useState(false);
  const [blocks, setBlocks]   = useState<Block[]>([]);
  const [hidden, setHidden]   = useState<Set<number>>(new Set());

  const REPORT_WIDTH = 1024; // largura fixa do relatório (px) — layout consistente
  const captureRef  = useRef<HTMLDivElement>(null);   // cabeçalho + clone (capturado)
  const cloneHostRef = useRef<HTMLDivElement>(null);  // host do clone
  const previewBoxRef = useRef<HTMLDivElement>(null); // área de scroll
  const blockNodesRef = useRef<HTMLElement[]>([]);
  const [scale, setScale]     = useState(1);
  const [previewH, setPreviewH] = useState(0);

  const generatedAt = useMemo(
    () => new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }),
    [],
  );

  // Clona o conteúdo vivo para a prévia quando entra no passo "preview".
  useEffect(() => {
    if (step !== "preview") return;
    const src = targetRef.current;
    const host = cloneHostRef.current;
    if (!src || !host) return;

    host.innerHTML = "";
    const clone = src.cloneNode(true) as HTMLElement;
    clone.style.width = "100%";
    host.appendChild(clone);

    const nodes = Array.from(clone.querySelectorAll<HTMLElement>("[data-report-block]"));
    blockNodesRef.current = nodes;
    setBlocks(nodes.map((n, idx) => ({ idx, label: n.getAttribute("data-report-label") || `Bloco ${idx + 1}` })));
    setHidden(new Set());
  }, [step, targetRef]);

  // Escala o relatório (largura fixa) para caber na largura da área de prévia,
  // mantendo só a rolagem vertical. Recalcula no resize e quando blocos mudam.
  useEffect(() => {
    if (step !== "preview") return;
    const recompute = () => {
      const box = previewBoxRef.current;
      const cap = captureRef.current;
      if (!box || !cap) return;
      const avail = box.clientWidth - 24; // padding
      const s = Math.min(1, avail / REPORT_WIDTH);
      setScale(s);
      setPreviewH(cap.scrollHeight * s);
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    if (previewBoxRef.current) ro.observe(previewBoxRef.current);
    if (captureRef.current) ro.observe(captureRef.current);
    return () => ro.disconnect();
  }, [step, custom, hidden, blocks]);

  // Aplica visibilidade no clone.
  useEffect(() => {
    blockNodesRef.current.forEach((n, idx) => {
      n.style.display = hidden.has(idx) ? "none" : "";
    });
  }, [hidden, blocks]);

  const toggle = (idx: number) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });

  const save = async () => {
    if (!captureRef.current || busy) return;
    setBusy(true);
    try {
      await exportReport(captureRef.current, { format, fileName });
      onClose();
    } catch (e) {
      console.error("[report] falhou:", e);
    } finally {
      setBusy(false);
    }
  };

  const enter = (mode: "atual" | "custom") => { setCustom(mode === "custom"); setStep("preview"); };

  const body = (
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
            <button type="button" onClick={() => enter("atual")}
              className="flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition hover:-translate-y-0.5"
              style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)" }}>
              <Sparkles size={18} style={{ color: "var(--dm-brand-500, #6366C8)" }} />
              <span className="text-sm font-bold" style={{ color: "var(--dm-text-primary)" }}>Configuração atual</span>
              <span className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>Gera com tudo que está na tela.</span>
            </button>
            <button type="button" onClick={() => enter("custom")}
              className="flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition hover:-translate-y-0.5"
              style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)" }}>
              <Settings2 size={18} style={{ color: "var(--dm-brand-500, #6366C8)" }} />
              <span className="text-sm font-bold" style={{ color: "var(--dm-text-primary)" }}>Personalizar</span>
              <span className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>Escolha quais cards e o funil incluir.</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border shadow-2xl"
          style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}>
          {/* Topbar */}
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
            {/* Painel de toggles */}
            {custom && (
              <div className="w-56 flex-shrink-0 overflow-y-auto border-r p-3" style={{ borderColor: "var(--dm-border-subtle)" }}>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Incluir no relatório</p>
                <div className="space-y-1">
                  {blocks.map((b) => (
                    <label key={b.idx} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] transition hover:bg-white/5"
                      style={{ color: "var(--dm-text-secondary)" }}>
                      <input type="checkbox" checked={!hidden.has(b.idx)} onChange={() => toggle(b.idx)}
                        className="h-3.5 w-3.5 accent-[var(--dm-brand-500,#6366C8)]" />
                      <span className="truncate">{b.label}</span>
                    </label>
                  ))}
                  {blocks.length === 0 && <p className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>Nenhum bloco.</p>}
                </div>
              </div>
            )}

            {/* Prévia — só scroll vertical; o relatório (largura fixa) é escalado p/ caber */}
            <div ref={previewBoxRef} className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-3"
              style={{ background: "var(--dm-bg-page, #0b1437)" }}>
              <div style={{ height: previewH || undefined }}>
                <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: REPORT_WIDTH }}>
                  <div ref={captureRef} style={{ background: "var(--dm-bg-page, #0b1437)", padding: 24, width: REPORT_WIDTH }}>
                    {/* Cabeçalho do relatório */}
                    <div className="mb-4 flex items-center justify-between gap-4 rounded-2xl px-5 py-4"
                      style={{ background: "linear-gradient(135deg,#6366C8 0%,#313491 100%)", color: "#fff" }}>
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "rgba(255,255,255,0.15)" }}>
                          <Sparkles size={18} />
                        </div>
                        <div>
                          <p className="text-base font-black leading-tight">{title || "Relatório"}</p>
                          <p className="text-[11px] opacity-80">DashMonster · {period}</p>
                        </div>
                      </div>
                      <p className="text-[10px] opacity-70">Gerado em {generatedAt}</p>
                    </div>
                    {/* Host do clone */}
                    <div ref={cloneHostRef} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Rodapé */}
          <div className="flex items-center justify-between gap-3 border-t px-5 py-3" style={{ borderColor: "var(--dm-border-subtle)" }}>
            <div className="flex rounded-xl p-0.5" style={{ backgroundColor: "var(--dm-bg-elevated)" }}>
              {(["png", "pdf"] as const).map((f) => (
                <button key={f} type="button" onClick={() => setFormat(f)}
                  className="flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[12px] font-semibold transition"
                  style={format === f
                    ? { background: "var(--dm-brand-500, #6366C8)", color: "#fff" }
                    : { color: "var(--dm-text-tertiary)" }}>
                  {f === "png" ? <ImageIcon size={13} /> : <FileText size={13} />}{f.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose}
                className="rounded-xl px-3 py-2 text-[12px] font-semibold" style={{ color: "var(--dm-text-tertiary)" }}>Cancelar</button>
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
  return createPortal(body, document.body);
}
