"use client";

import { useEffect, useState } from "react";
import { Eye, Loader2, MousePointerClick, ShoppingCart, CreditCard, Trophy } from "lucide-react";
import { loadMetaCredentials } from "@/utils/metaApi";
import type { PixelFunnelResponse } from "@/app/api/meta/pixel/route";

const FUNNEL_EVENTS = [
  "page_view", "lead", "initiate_checkout", "add_payment_info", "purchase",
  "offsite_conversion.fb_pixel_page_view", "offsite_conversion.fb_pixel_lead",
  "offsite_conversion.fb_pixel_initiate_checkout", "offsite_conversion.fb_pixel_add_payment_info",
  "offsite_conversion.fb_pixel_purchase",
];

interface FunnelStep {
  icon: React.ElementType;
  label: string;
  count: number;
  rate: number | undefined;   // rate from PREVIOUS step (0–1)
  rateLabel: string;
  color: string;
  colorLight: string;
}

function fmt(n: number) {
  return n.toLocaleString("pt-BR");
}

function fmtPct(r: number) {
  return (r * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
}

interface Props {
  adAccountId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export function PixelFunnelSection({ adAccountId, dateFrom, dateTo }: Props) {
  const [data, setData]       = useState<PixelFunnelResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!adAccountId) { setData(null); return; }
    const { accessToken } = loadMetaCredentials();
    if (!accessToken) { setError("Token Meta não configurado."); return; }

    const from = dateFrom ?? new Date(Date.now() - 30 * 86400 * 1000).toISOString().slice(0, 10);
    const to   = dateTo   ?? new Date().toISOString().slice(0, 10);

    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ adAccountId, accessToken, dateFrom: from, dateTo: to });
    fetch(`/api/meta/pixel?${params}`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? "Erro ao buscar dados do pixel.");
        setData(body as PixelFunnelResponse);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Erro desconhecido."))
      .finally(() => setLoading(false));
  }, [adAccountId, dateFrom, dateTo]);

  if (!adAccountId) {
    return (
      <div className="px-4 py-6 text-center">
        <p className="text-xs" style={{ color: "var(--dm-text-tertiary)" }}>
          Selecione um grupo com Meta Ads configurado para ver o funil do pixel.
        </p>
      </div>
    );
  }

  const f = data?.funnel;
  const maxVal = f ? Math.max(f.pageView, f.lead, f.initiateCheckout, f.addPaymentInfo, f.purchase, 1) : 1;

  const steps: FunnelStep[] = f ? [
    {
      icon: Eye,
      label: "Page View",
      count: f.pageView,
      rate: undefined,
      rateLabel: "",
      color: "#6366f1",
      colorLight: "#6366f115",
    },
    {
      icon: MousePointerClick,
      label: "Lead",
      count: f.lead,
      rate: f.pageView > 0 ? f.lead / f.pageView : 0,
      rateLabel: "Capture Rate",
      color: "#0ea5e9",
      colorLight: "#0ea5e915",
    },
    {
      icon: ShoppingCart,
      label: "Checkout",
      count: f.initiateCheckout,
      rate: f.lead > 0 ? f.initiateCheckout / f.lead : 0,
      rateLabel: "Checkout Rate",
      color: "#f59e0b",
      colorLight: "#f59e0b15",
    },
    {
      icon: CreditCard,
      label: "Pagamento",
      count: f.addPaymentInfo,
      rate: f.initiateCheckout > 0 ? f.addPaymentInfo / f.initiateCheckout : 0,
      rateLabel: "Payment Rate",
      color: "#f97316",
      colorLight: "#f9731615",
    },
    {
      icon: Trophy,
      label: "Purchase",
      count: f.purchase,
      rate: f.addPaymentInfo > 0 ? f.purchase / f.addPaymentInfo : 0,
      rateLabel: "Close Rate",
      color: "#22c55e",
      colorLight: "#22c55e15",
    },
  ] : [];

  const otherEvents = data?.events.filter((e) => !FUNNEL_EVENTS.includes(e.name)) ?? [];

  return (
    <div className="px-4 pb-5 pt-3">
      {loading && (
        <div className="flex items-center justify-center gap-2 py-8">
          <Loader2 size={16} className="animate-spin" style={{ color: "var(--dm-brand-500)" }} />
          <span className="text-xs" style={{ color: "var(--dm-text-tertiary)" }}>Carregando eventos…</span>
        </div>
      )}

      {error && !loading && (
        <p className="py-4 text-center text-xs text-red-500">{error}</p>
      )}

      {data && !loading && !error && (
        <>
          {/* Tapering funnel */}
          <div className="flex flex-col items-center gap-0 select-none">
            {steps.map((step, i) => {
              const widthPct = step.count > 0
                ? Math.max(22, (step.count / maxVal) * 100)
                : 22;
              const Icon = step.icon;

              return (
                <div key={step.label} className="w-full flex flex-col items-center">
                  {/* Rate connector between steps */}
                  {i > 0 && (
                    <div className="flex items-center gap-2 py-1.5">
                      <span className="h-px w-8" style={{ backgroundColor: "var(--dm-border-subtle)" }} />
                      <span
                        className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold"
                        style={{
                          backgroundColor: "var(--dm-bg-elevated)",
                          color: step.rate !== undefined && step.rate >= 0.1
                            ? "#22c55e"
                            : step.rate !== undefined && step.rate >= 0.03
                              ? "#f59e0b"
                              : "var(--dm-text-tertiary)",
                          border: "1px solid var(--dm-border-subtle)",
                        }}
                      >
                        {step.rateLabel}: {step.rate !== undefined ? fmtPct(step.rate) : "—"}
                      </span>
                      <span className="h-px w-8" style={{ backgroundColor: "var(--dm-border-subtle)" }} />
                    </div>
                  )}

                  {/* Funnel bar */}
                  <div
                    className="flex items-center justify-between gap-3 rounded-xl px-4 py-3 transition-all duration-500"
                    style={{
                      width: `${widthPct}%`,
                      minWidth: 180,
                      backgroundColor: step.colorLight,
                      border: `1px solid ${step.color}30`,
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
                        style={{ backgroundColor: step.color + "22" }}
                      >
                        <Icon size={13} style={{ color: step.color }} />
                      </span>
                      <span className="text-[11px] font-semibold truncate" style={{ color: "var(--dm-text-secondary)" }}>
                        {step.label}
                      </span>
                    </div>
                    <span className="text-sm font-bold flex-shrink-0" style={{ color: step.color }}>
                      {fmt(step.count)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary metrics row */}
          {f && (f.pageView > 0 || f.purchase > 0) && (
            <div
              className="mt-4 grid grid-cols-2 gap-px rounded-xl overflow-hidden border sm:grid-cols-4"
              style={{ borderColor: "var(--dm-border-subtle)", backgroundColor: "var(--dm-border-subtle)" }}
            >
              {[
                { label: "Connect Rate",  value: f.pageView > 0 && f.lead > 0      ? fmtPct(f.lead / f.pageView) : "—" },
                { label: "Checkout Rate", value: f.lead > 0 && f.initiateCheckout > 0 ? fmtPct(f.initiateCheckout / f.lead) : "—" },
                { label: "Payment Rate",  value: f.initiateCheckout > 0 && f.addPaymentInfo > 0 ? fmtPct(f.addPaymentInfo / f.initiateCheckout) : "—" },
                { label: "Close Rate",    value: f.addPaymentInfo > 0 && f.purchase > 0 ? fmtPct(f.purchase / f.addPaymentInfo) : "—" },
              ].map(({ label, value }) => (
                <div key={label} className="flex flex-col items-center justify-center px-3 py-2.5" style={{ backgroundColor: "var(--dm-bg-elevated)" }}>
                  <p className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: "var(--dm-text-tertiary)" }}>{label}</p>
                  <p className="mt-0.5 text-sm font-bold" style={{ color: "var(--dm-text-primary)" }}>{value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Other events */}
          {otherEvents.length > 0 && (
            <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--dm-border-subtle)" }}>
              <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--dm-text-tertiary)" }}>
                Outros eventos
              </p>
              <div className="flex flex-wrap gap-2">
                {otherEvents.map((e) => (
                  <span
                    key={e.name}
                    className="rounded-md border px-2 py-0.5 text-[11px]"
                    style={{ borderColor: "var(--dm-border)", color: "var(--dm-text-secondary)" }}
                  >
                    {e.name}: <strong>{e.total.toLocaleString("pt-BR")}</strong>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
