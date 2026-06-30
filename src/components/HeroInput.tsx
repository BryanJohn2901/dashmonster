"use client";

import { FormEvent, useState } from "react";
import { DatabaseZap, FileUp, Link2, Loader2 } from "lucide-react";

interface HeroInputProps {
  onSubmitUrl: (url: string) => Promise<void>;
  onSubmitCsv: (file: File) => Promise<void>;
  onConnectRealtime?: () => Promise<void>;
  realtimeActive?: boolean;
  showRealtime?: boolean;
}

export function HeroInput({
  onSubmitUrl,
  onSubmitCsv,
  onConnectRealtime,
  realtimeActive = false,
  showRealtime = true,
}: HeroInputProps) {
  const [url, setUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMode, setLoadingMode] = useState<"url" | "csv" | "realtime">(
    "url",
  );

  const handleSubmitUrl = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoadingMode("url");
    setLoading(true);
    try {
      await onSubmitUrl(url);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitCsv = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedFile) {
      return;
    }

    setLoadingMode("csv");
    setLoading(true);
    try {
      await onSubmitCsv(selectedFile);
    } finally {
      setLoading(false);
    }
  };

  const handleConnectRealtime = async () => {
    if (!onConnectRealtime) {
      return;
    }
    setLoadingMode("realtime");
    setLoading(true);
    try {
      await onConnectRealtime();
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Gerador de Dashboard de Campanhas
        </h1>
        <p className="mt-2 text-sm text-slate-600 sm:text-base">
          Cole o link de uma planilha do Google Sheets ou envie um arquivo CSV
          para transformar dados de campanhas em um dashboard executivo.
        </p>
      </div>

      {showRealtime ? (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-[#16A34A]/30 bg-[#16A34A]/[0.06] px-3 py-2">
          <p className="text-xs text-[#15803D] dark:text-[#22C55E]">
            Modo Supabase Realtime:{" "}
            <span className="font-semibold">
              {realtimeActive ? "conectado" : "desconectado"}
            </span>
          </p>
          <button
            type="button"
            onClick={handleConnectRealtime}
            disabled={loading}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-brand px-3 text-xs font-medium text-white transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading && loadingMode === "realtime" ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Conectando...
              </>
            ) : (
              <>
                <DatabaseZap size={14} />
                Conectar Realtime
              </>
            )}
          </button>
        </div>
      ) : null}

      <form onSubmit={handleSubmitUrl} className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Link2
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={18}
          />
          <input
            type="url"
            required
            placeholder="https://docs.google.com/spreadsheets/d/..."
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-[#16A34A] focus:ring-2 focus:ring-[#16A34A]/15"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-11 min-w-44 items-center justify-center gap-2 rounded-lg bg-brand px-5 text-sm font-medium text-white transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading && loadingMode === "url" ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Processando...
            </>
          ) : (
            "Gerar Dashboard"
          )}
        </button>
      </form>

      <div className="my-4 h-px bg-slate-200" />

      <form
        onSubmit={handleSubmitCsv}
        className="flex flex-col gap-3 sm:flex-row sm:items-center"
      >
        <div className="relative flex-1">
          <FileUp
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={18}
          />
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) =>
              setSelectedFile(event.target.files?.[0] ?? null)
            }
            className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-4 text-sm text-slate-900 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-200"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !selectedFile}
          className="inline-flex h-11 min-w-44 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading && loadingMode === "csv" ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Enviando...
            </>
          ) : (
            "Upload CSV"
          )}
        </button>
      </form>
    </section>
  );
}
