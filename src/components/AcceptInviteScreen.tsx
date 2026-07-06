"use client";

// ─── Tela de aceitar convite ────────────────────────────────────────────────────
// Chegada por dois caminhos: (1) clique no magic link do e-mail de convite
// (rota standalone /aceitar-convite, sessão ainda sendo estabelecida) ou
// (2) gate dentro do hub logo após o login, quando há convite(s) pendente(s)
// pro e-mail da pessoa (ver page.tsx). Mesma linguagem visual da AuthScreen.

import { useEffect, useState } from "react";
import { Building2, Check, Loader2, Mail, X } from "lucide-react";
import { DashMonsterLogo } from "@/components/DashMonsterLogo";
import { fetchMyPendingInvites, acceptCompanyInvite, declineCompanyInvite, type MyPendingInvite } from "@/hooks/useCompany";
import { toast } from "@/hooks/useToast";

const INK   = "#0E1108";
const PANEL = "#15180F";
const LIME  = "#B6F500";
const GREEN_BTN = "#A8DCA0";
const TXT   = "#F4F7F0";
const MUTED = "#9AA388";
const HAIR  = "rgba(255,255,255,0.10)";

const ROLE_LABEL: Record<string, string> = { owner: "Dono", manager: "Gestor", viewer: "Visualizador" };

/** @param onDone chamado após aceitar (ou ao pular) — o chamador decide pra onde ir. */
export function AcceptInviteScreen({ onDone }: { onDone: () => void }) {
  const [invites, setInvites] = useState<MyPendingInvite[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => fetchMyPendingInvites().then(setInvites).catch(() => setInvites([]));
  useEffect(() => { void load(); }, []);

  const accept = async (inv: MyPendingInvite) => {
    setBusyId(inv.id);
    try {
      await acceptCompanyInvite(inv.id);
      toast.success(`Você agora faz parte de ${inv.companyName}.`);
      setInvites((prev) => prev?.filter((x) => x.id !== inv.id) ?? null);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao aceitar convite."); }
    finally { setBusyId(null); }
  };

  const decline = async (inv: MyPendingInvite) => {
    setBusyId(inv.id);
    try {
      await declineCompanyInvite(inv.id);
      setInvites((prev) => prev?.filter((x) => x.id !== inv.id) ?? null);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao recusar convite."); }
    finally { setBusyId(null); }
  };

  return (
    <main
      className="relative flex min-h-screen w-full items-center justify-center overflow-hidden p-4 sm:p-8"
      style={{
        fontFamily: "var(--font-inter), 'DM Sans', sans-serif",
        background: "radial-gradient(120% 120% at 50% 0%, #20251A 0%, #14170F 55%, #0B0D08 100%)",
      }}
    >
      <div
        className="relative w-full max-w-[440px] overflow-hidden rounded-[28px] p-8 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.7)]"
        style={{ background: PANEL, border: `1px solid ${HAIR}` }}
      >
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: LIME }}>
            <DashMonsterLogo size={16} className="text-[#0E1108] dark:!text-[#0E1108]" />
          </div>
          <span className="text-[15px] font-semibold tracking-tight" style={{ color: TXT }}>Monster Hub</span>
        </div>

        {invites === null ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <Loader2 size={22} className="animate-spin" style={{ color: LIME }} />
            <p className="text-[13.5px]" style={{ color: MUTED }}>Procurando seus convites…</p>
          </div>
        ) : invites.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Mail size={26} style={{ color: MUTED }} />
            <h1 className="text-[19px] font-semibold" style={{ color: TXT }}>Nenhum convite pendente</h1>
            <p className="text-[13.5px] leading-relaxed" style={{ color: MUTED }}>
              Não encontramos convites em aberto pro seu e-mail.
            </p>
            <button type="button" onClick={onDone}
              className="mt-2 w-full text-[14px] font-semibold transition-all hover:brightness-105"
              style={{ padding: "12px", borderRadius: 11, background: GREEN_BTN, color: INK }}>
              Ir para o Monster Hub
            </button>
          </div>
        ) : (
          <>
            <h1 className="text-[22px] font-semibold tracking-tight" style={{ color: TXT }}>
              Você foi convidado{invites.length > 1 ? "" : ""}
            </h1>
            <p className="mt-1.5 text-[13.5px]" style={{ color: MUTED }}>
              {invites.length === 1 ? "Alguém te chamou pra fazer parte de uma empresa." : `Você tem ${invites.length} convites pendentes.`}
            </p>

            <div className="mt-6 flex flex-col gap-3">
              {invites.map((inv) => (
                <div key={inv.id} className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.045)", border: `1px solid ${HAIR}` }}>
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl" style={{ background: "rgba(182,245,0,0.12)" }}>
                      <Building2 size={17} style={{ color: LIME }} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14.5px] font-semibold" style={{ color: TXT }}>{inv.companyName}</p>
                      <p className="text-[12px]" style={{ color: MUTED }}>Papel: {ROLE_LABEL[inv.role] ?? inv.role}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => void accept(inv)} disabled={busyId === inv.id}
                      className="flex h-10 flex-1 items-center justify-center gap-1.5 text-[13px] font-semibold transition-all hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                      style={{ borderRadius: 10, background: GREEN_BTN, color: INK }}>
                      {busyId === inv.id ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Aceitar
                    </button>
                    <button type="button" onClick={() => void decline(inv)} disabled={busyId === inv.id}
                      className="flex h-10 items-center justify-center gap-1.5 rounded-[10px] px-4 text-[13px] font-semibold transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
                      style={{ color: MUTED, border: `1px solid ${HAIR}` }}>
                      <X size={15} /> Recusar
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button type="button" onClick={onDone}
              className="mt-5 w-full text-[12.5px] font-medium underline underline-offset-2 transition hover:opacity-80"
              style={{ color: MUTED }}>
              Decidir depois
            </button>
          </>
        )}
      </div>
    </main>
  );
}
