"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { ReportModal } from "@/components/ReportModal";
import type { ReportData } from "@/types/report";

interface ExportReportButtonProps {
  /** Builder dos dados do relatório (lazy: só monta ao abrir). */
  buildData: () => ReportData;
  fileName: string;
  label?: string;
}

export function ExportReportButton({ buildData, fileName, label = "Relatório" }: ExportReportButtonProps) {
  const [data, setData] = useState<ReportData | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => setData(buildData())}
        title="Gerar relatório"
        className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-bold text-white shadow-sm transition hover:opacity-90 active:scale-[0.98]"
        style={{ background: "linear-gradient(135deg,#6366C8 0%,#313491 100%)" }}
      >
        <FileText size={14} />
        <span className="hidden sm:inline">{label}</span>
      </button>

      {data && (
        <ReportModal data={data} fileName={fileName} onClose={() => setData(null)} />
      )}
    </>
  );
}
