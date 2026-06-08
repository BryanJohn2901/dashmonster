"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { ReportModal } from "@/components/ReportModal";

interface ExportReportButtonProps {
  /** Ref para o elemento a capturar (métricas + funil). */
  targetRef: React.RefObject<HTMLElement | null>;
  /** Nome base do arquivo (sem extensão). */
  fileName: string;
  /** Título do relatório (perfil/grupo). */
  title?: string;
  /** Período exibido no cabeçalho. */
  period?: string;
  /** Rótulo do botão. */
  label?: string;
}

export function ExportReportButton({ targetRef, fileName, title = "", period = "", label = "Relatório" }: ExportReportButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-semibold transition"
        style={{ backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-secondary)", border: "1px solid var(--dm-border-default)" }}
      >
        <Download size={14} />
        <span className="hidden sm:inline">{label}</span>
      </button>

      {open && (
        <ReportModal
          targetRef={targetRef}
          fileName={fileName}
          title={title}
          period={period}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
