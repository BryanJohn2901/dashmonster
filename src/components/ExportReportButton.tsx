"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FileText, Image as ImageIcon, Loader2 } from "lucide-react";
import { exportReport, type ReportFormat } from "@/utils/exportReport";

interface ExportReportButtonProps {
  /** Ref para o elemento a capturar (métricas + funil). */
  targetRef: React.RefObject<HTMLElement | null>;
  /** Nome base do arquivo (sem extensão). */
  fileName: string;
  /** Rótulo do botão. */
  label?: string;
}

export function ExportReportButton({ targetRef, fileName, label = "Relatório" }: ExportReportButtonProps) {
  const [open, setOpen]       = useState(false);
  const [busy, setBusy]       = useState<ReportFormat | null>(null);
  const wrapRef               = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const run = async (format: ReportFormat) => {
    const el = targetRef.current;
    if (!el || busy) return;
    setBusy(format);
    try {
      await exportReport(el, { format, fileName });
      setOpen(false);
    } catch (e) {
      console.error("[export] falhou:", e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-semibold transition"
        style={{ backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-secondary)", border: "1px solid var(--dm-border-default)" }}
      >
        <Download size={14} />
        <span className="hidden sm:inline">{label}</span>
      </button>

      {open && (
        <div
          className="absolute right-0 z-50 mt-1 w-44 overflow-hidden rounded-xl border shadow-lg"
          style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}
        >
          <button type="button" disabled={busy !== null} onClick={() => void run("pdf")}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[12px] transition hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50"
            style={{ color: "var(--dm-text-primary)" }}>
            {busy === "pdf" ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
            Baixar PDF
          </button>
          <button type="button" disabled={busy !== null} onClick={() => void run("png")}
            className="flex w-full items-center gap-2 border-t px-3 py-2.5 text-left text-[12px] transition hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50"
            style={{ color: "var(--dm-text-primary)", borderColor: "var(--dm-border-subtle)" }}>
            {busy === "png" ? <Loader2 size={13} className="animate-spin" /> : <ImageIcon size={13} />}
            Baixar imagem (PNG)
          </button>
        </div>
      )}
    </div>
  );
}
