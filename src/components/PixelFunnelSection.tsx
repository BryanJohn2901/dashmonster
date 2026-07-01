"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Eye, Loader2, MousePointerClick, ShoppingCart, CreditCard, Trophy } from "lucide-react";
import { loadMetaCredentials } from "@/utils/metaApi";
import { metaFetch } from "@/lib/authedFetch";
import type { PixelFunnelResponse } from "@/app/api/meta/pixel/route";

interface FunnelStepProps {
  icon: React.ElementType;
  label: string;
  count: number;
  rate?: number;
  color: string;
  isLast?: boolean;
}

function FunnelStep({ icon: Icon, label, count, rate, color, isLast }: FunnelStepProps) {
  const pct = rate !== undefined
    ? (rate * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : null;
  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-col items-center">
        <div
          className="flex h-14 w-14 flex-col items-center justify-center rounded-xl border text-center"
          style={{ borderColor: color + "40", backgroundColor: color + "15" }}
        >
          <Icon size={18} style={{ color }} />
          <span className="mt-0.5 text-[11px] font-bold leading-none" style={{ color }}>
            {count.toLocaleString("pt-BR")}
          </span>
        </div>
        <span className="mt-1 max-w-[56px] text-center text-[10px] leading-tight" style={{ color: "var(--dm-text-tertiary)" }}>
          {label}
        </span>
      </div>
      {!isLast && (
        <div className="flex flex-col items-center gap-0.5">
          <ChevronRight size={14} style={{ color: "var(--dm-text-tertiary)" }} />
          {pct !== null && (
            <span className="text-[9px] font-medium" style={{ color: "var(--dm-text-tertiary)" }}>
              {pct}%
            </span>
          )}
        </div>
      )}
    </div>
  );
}

interface Props {
  adAccountId?: string;
  dateFrom?: string;
  dateTo?: string;
}

const FUNNEL_EVENTS = ["page_view", "lead", "initiate_checkout", "add_payment_info", "purchase",
  "offsite_conversion.fb_pixel_page_view", "offsite_conversion.fb_pixel_lead",
  "offsite_conversion.fb_pixel_initiate_checkout", "offsite_conversion.fb_pixel_add_payment_info",
  "offsite_conversion.fb_pixel_purchase"];

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

    const params = new URLSearchParams({ adAccountId, dateFrom: from, dateTo: to });
    metaFetch(`/api/meta/pixel?${params}`, accessToken)
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
      <div className="rounded-xl border p-4" style={{ borderColor: "var(--dm-border)", backgroundColor: "var(--dm-surface)" }}>
        <h3 className="mb-1 text-sm font-semibold" style={{ color: "var(--dm-text-primary)" }}>Funil do Pixel</h3>
        <p className="text-xs" style={{ color: "var(--dm-text-tertiary)" }}>
          Selecione um grupo com Meta Ads configurado para ver o funil de conversão.
        </p>
      </div>
    );
  }

  const f = data?.funnel;
  const steps = f ? [
    { icon: Eye,               label: "PageView",  count: f.pageView,         rate: undefined,                                                              color: "#16A34A" },
    { icon: MousePointerClick, label: "Lead",       count: f.lead,             rate: f.pageView > 0          ? f.lead / f.pageView : 0,                     color: "#0D9488" },
    { icon: ShoppingCart,      label: "Checkout",   count: f.initiateCheckout, rate: f.lead > 0              ? f.initiateCheckout / f.lead : 0,              color: "#f59e0b" },
    { icon: CreditCard,        label: "Pagamento",  count: f.addPaymentInfo,   rate: f.initiateCheckout > 0  ? f.addPaymentInfo / f.initiateCheckout : 0,    color: "#f97316" },
    { icon: Trophy,            label: "Purchase",   count: f.purchase,         rate: f.addPaymentInfo > 0    ? f.purchase / f.addPaymentInfo : 0,            color: "#22c55e" },
  ] : [];

  const otherEvents = data?.events.filter((e) => !FUNNEL_EVENTS.includes(e.name)) ?? [];

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--dm-border)", backgroundColor: "var(--dm-surface)" }}>
      <h3 className="mb-3 text-sm font-semibold" style={{ color: "var(--dm-text-primary)" }}>Funil do Pixel</h3>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-6">
          <Loader2 size={16} className="animate-spin" style={{ color: "var(--dm-brand-500)" }} />
          <span className="text-xs" style={{ color: "var(--dm-text-tertiary)" }}>Carregando eventos…</span>
        </div>
      )}

      {error && !loading && (
        <p className="py-2 text-center text-xs text-red-500">{error}</p>
      )}

      {data && !loading && !error && (
        <>
          <div className="flex flex-wrap items-start gap-1">
            {steps.map((s, i) => (
              <FunnelStep key={s.label} {...s} isLast={i === steps.length - 1} />
            ))}
          </div>

          {otherEvents.length > 0 && (
            <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--dm-border)" }}>
              <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--dm-text-tertiary)" }}>
                Outros eventos
              </p>
              <div className="flex flex-wrap gap-2">
                {otherEvents.map((e) => (
                  <span key={e.name} className="rounded-md border px-2 py-0.5 text-[11px]"
                    style={{ borderColor: "var(--dm-border)", color: "var(--dm-text-secondary)" }}>
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
