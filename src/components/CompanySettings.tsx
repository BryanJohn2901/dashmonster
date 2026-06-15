"use client";

import { useEffect, useState } from "react";
import {
  Building2, Loader2, Save, Trash2, KeyRound, Users, CheckCircle2, AlertCircle, UserPlus, ArrowLeftRight,
} from "lucide-react";
import { toast } from "@/hooks/useToast";
import {
  useCompany, fetchCompanyMembers, updateMemberRole, removeMember, renameCompany, inviteMemberByEmail,
  fetchCompanyToken, type CompanyMember, type CompanyRole,
} from "@/hooks/useCompany";
import { loadMetaCredentials, saveMetaCredentials } from "@/utils/metaApi";
import { SuperAdminPanel } from "@/components/SuperAdminPanel";

const ROLE_LABELS: Record<CompanyRole, string> = {
  owner:   "Dono",
  manager: "Gestor de tráfego",
  viewer:  "Visualização",
};

const ROLE_COLORS: Record<CompanyRole, string> = {
  owner: "#8b5cf6", manager: "#10b981", viewer: "#64748b",
};

function SectionCard({ icon: Icon, title, subtitle, children }: {
  icon: typeof Building2; title: string; subtitle: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border p-5 space-y-4"
      style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: "rgba(99,102,200,0.12)" }}>
          <Icon size={17} style={{ color: "#6366C8" }} />
        </div>
        <div>
          <h3 className="text-sm font-bold" style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins),Poppins,sans-serif" }}>
            {title}
          </h3>
          <p className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

export function CompanySettings() {
  const { company, role, isOwner, loading, migrationMissing, memberships, switchCompany, devMode, isSuperAdmin } = useCompany();

  // ── Nome da empresa (derivado: digitação sobrepõe o valor vindo do server) ──
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const name = nameOverride ?? company?.name ?? "";
  const setName = setNameOverride;
  const [savingName, setSavingName] = useState(false);

  // ── Token Meta da empresa ──
  const [token, setToken] = useState("");
  const [savingToken, setSavingToken] = useState(false);
  const hasToken = Boolean(loadMetaCredentials().accessToken);

  // Token real da empresa ativa — revelável no modo DEV (super admin)
  const [companyToken, setCompanyToken] = useState<string>("");
  const [revealToken, setRevealToken] = useState(false);

  // ── Membros (null = ainda carregando) ──
  const [membersState, setMembers] = useState<CompanyMember[] | null>(null);
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);

  // ── Convite por e-mail ──
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<CompanyRole>("manager");
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    if (!company) return;
    let active = true;
    void fetchCompanyMembers(company.id)
      .then((m) => { if (active) setMembers(m); })
      .catch(() => { if (active) setMembers([]); });
    return () => { active = false; };
  }, [company]);

  // Carrega o token real da empresa ativa quando em modo DEV.
  // (O bloco que mostra o token só renderiza com devMode, então não precisa
  // resetar de forma síncrona aqui — evita re-render em cascata.)
  useEffect(() => {
    if (!company || !devMode) return;
    let active = true;
    void fetchCompanyToken(company.id)
      .then((t) => { if (active) { setCompanyToken(t); setRevealToken(false); } })
      .catch(() => { if (active) setCompanyToken(""); });
    return () => { active = false; };
  }, [company, devMode]);

  const members = membersState ?? [];
  const loadingMembers = company != null && membersState === null;

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16">
        <Loader2 size={18} className="animate-spin" style={{ color: "var(--dm-text-tertiary)" }} />
        <span className="text-sm" style={{ color: "var(--dm-text-tertiary)" }}>Carregando empresa…</span>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="rounded-2xl border p-10 text-center"
        style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "var(--dm-border-default)" }}>
        <Building2 size={28} className="mx-auto mb-3" style={{ color: "var(--dm-text-tertiary)" }} />
        <p className="text-sm font-semibold mb-1" style={{ color: "var(--dm-text-primary)" }}>
          Nenhuma empresa configurada
        </p>
        <p className="text-xs" style={{ color: "var(--dm-text-tertiary)" }}>
          {migrationMissing
            ? "Execute a migration 021 no Supabase SQL Editor para ativar o sistema de empresas."
            : "Sua conta ainda não pertence a nenhuma empresa. Peça ao dono para te adicionar."}
        </p>
      </div>
    );
  }

  const handleSaveName = async () => {
    if (!name.trim() || name.trim() === company.name) return;
    setSavingName(true);
    try {
      await renameCompany(company.id, name.trim());
      toast.success("Nome da empresa atualizado!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao renomear.");
    } finally { setSavingName(false); }
  };

  const handleSaveToken = async () => {
    if (!token.trim()) return;
    setSavingToken(true);
    try {
      // grava em companies.meta_access_token (RLS: só owner) + cache local
      saveMetaCredentials({ accessToken: token.trim() });
      setToken("");
      toast.success("Token salvo! Ele propaga para todos os membros da empresa.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar token.");
    } finally { setSavingToken(false); }
  };

  const handleRoleChange = async (member: CompanyMember, newRole: CompanyRole) => {
    setBusyMemberId(member.id);
    try {
      await updateMemberRole(member.id, newRole);
      setMembers((prev) => prev?.map((m) => (m.id === member.id ? { ...m, role: newRole } : m)) ?? prev);
      toast.success(`${member.email || "Membro"} agora é ${ROLE_LABELS[newRole]}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao trocar papel.");
    } finally { setBusyMemberId(null); }
  };

  const handleRemove = async (member: CompanyMember) => {
    setBusyMemberId(member.id);
    try {
      await removeMember(member.id);
      setMembers((prev) => prev?.filter((m) => m.id !== member.id) ?? prev);
      toast.success(`${member.email || "Membro"} removido da empresa.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao remover membro.");
    } finally { setBusyMemberId(null); }
  };

  const handleInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      toast.error("Informe um e-mail válido.");
      return;
    }
    setInviting(true);
    try {
      const result = await inviteMemberByEmail(company.id, email, inviteRole);
      setInviteEmail("");
      if (result === "added") {
        toast.success(`${email} adicionado como ${ROLE_LABELS[inviteRole]}.`);
        const fresh = await fetchCompanyMembers(company.id);
        setMembers(fresh);
      } else {
        toast.success(`Convite registrado para ${email}. Vira membro assim que criar a conta.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao convidar.");
    } finally { setInviting(false); }
  };

  const ownersCount = members.filter((m) => m.role === "owner").length;

  return (
    <div className="flex flex-col gap-5">
      {/* ── Banner DEV: super admin enxerga todas as empresas ── */}
      {devMode && (
        <div className="flex items-center gap-2.5 rounded-2xl border px-4 py-3"
          style={{ backgroundColor: "rgba(99,102,200,0.08)", borderColor: "#6366C8" }}>
          <KeyRound size={15} style={{ color: "#6366C8" }} className="flex-shrink-0" />
          <span className="text-xs font-semibold" style={{ color: "var(--dm-text-primary)" }}>
            Modo DEV ativo
          </span>
          <span className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
            {isSuperAdmin
              ? `Acesso total — ${memberships.length} empresa${memberships.length !== 1 ? "s" : ""} visíveis com tokens e usuários.`
              : "Sua conta não é super admin no banco. Rode a migration 026 e insira seu usuário em app_admins (o seed usa um UUID de exemplo, não o seu)."}
          </span>
        </div>
      )}

      {/* ── Painel de super admin: gerencia todas as empresas ── */}
      {isSuperAdmin && <SuperAdminPanel />}

      {/* ── Seletor de empresa (mais de uma, ou DEV vendo todas) ── */}
      {memberships.length > 1 && (
        <div className="flex items-center gap-3 rounded-2xl border p-4"
          style={{ backgroundColor: "var(--dm-bg-elevated)", borderColor: "var(--dm-border-default)" }}>
          <ArrowLeftRight size={16} style={{ color: "#6366C8" }} className="flex-shrink-0" />
          <span className="text-xs font-semibold" style={{ color: "var(--dm-text-secondary)" }}>
            Empresa ativa
          </span>
          <select value={company.id} onChange={(e) => switchCompany(e.target.value)}
            className="h-9 flex-1 rounded-lg border px-2.5 text-xs font-semibold outline-none"
            style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)", color: "var(--dm-text-primary)" }}>
            {memberships.map((m) => (
              <option key={m.company.id} value={m.company.id}>
                {m.company.name} · {ROLE_LABELS[m.role]}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* ── Identidade ── */}
      <SectionCard icon={Building2} title="Empresa"
        subtitle={isOwner ? "Você é o dono — configura aqui e propaga para todos os membros." : `Seu papel: ${role ? ROLE_LABELS[role] : "—"}`}>
        <div className="flex gap-3">
          <input value={name} onChange={(e) => setName(e.target.value)} disabled={!isOwner}
            className="h-11 flex-1 rounded-xl border px-3.5 text-[13px] font-medium outline-none transition focus:ring-1 disabled:opacity-60"
            style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }} />
          {isOwner && (
            <button type="button" onClick={() => void handleSaveName()}
              disabled={savingName || !name.trim() || name.trim() === company.name}
              className="flex h-11 items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-40"
              style={{ background: "linear-gradient(135deg,#6366C8 0%,#313491 100%)" }}>
              {savingName ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              Salvar
            </button>
          )}
        </div>
      </SectionCard>

      {/* ── Token Meta ── */}
      <SectionCard icon={KeyRound} title="Token da API Meta"
        subtitle="O dono configura uma vez e propaga para todas as contas — ninguém reconfigura ao acessar.">
        <div className="flex items-center gap-2 text-xs font-semibold"
          style={{ color: (devMode ? companyToken : hasToken) ? "#05CD99" : "#F4A60D" }}>
          {(devMode ? companyToken : hasToken) ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          {(devMode ? companyToken : hasToken) ? "Token configurado e ativo" : "Nenhum token configurado ainda"}
        </div>

        {/* Token real desta empresa — só no modo DEV */}
        {devMode && companyToken && (
          <div className="flex items-center gap-2 rounded-lg border px-3 py-2"
            style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)" }}>
            <span className="min-w-0 flex-1 truncate font-mono text-[11px]" style={{ color: "var(--dm-text-secondary)" }}>
              {revealToken ? companyToken : `${companyToken.slice(0, 8)}${"•".repeat(24)}${companyToken.slice(-4)}`}
            </span>
            <button type="button" onClick={() => setRevealToken((v) => !v)}
              className="flex-shrink-0 text-[10px] font-bold transition hover:opacity-70" style={{ color: "#6366C8" }}>
              {revealToken ? "Ocultar" : "Revelar"}
            </button>
            <button type="button"
              onClick={() => { void navigator.clipboard?.writeText(companyToken); toast.success("Token copiado."); }}
              className="flex-shrink-0 text-[10px] font-bold transition hover:opacity-70" style={{ color: "#6366C8" }}>
              Copiar
            </button>
          </div>
        )}
        {isOwner && (
          <div className="flex gap-3">
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)}
              placeholder={hasToken ? "Colar novo token para substituir…" : "EAAxxxx…"}
              className="h-11 flex-1 rounded-xl border px-3.5 text-[13px] font-mono outline-none transition focus:ring-1"
              style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }} />
            <button type="button" onClick={() => void handleSaveToken()}
              disabled={savingToken || !token.trim()}
              className="flex h-11 items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-40"
              style={{ background: "linear-gradient(135deg,#6366C8 0%,#313491 100%)" }}>
              {savingToken ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              {hasToken ? "Substituir" : "Salvar"}
            </button>
          </div>
        )}
      </SectionCard>

      {/* ── Membros ── */}
      <SectionCard icon={Users} title={`Membros (${members.length})`}
        subtitle={isOwner
          ? "Convide por e-mail, troque papéis ou remova membros."
          : "Quem participa desta empresa e o papel de cada um."}>
        {/* Convidar por e-mail */}
        {isOwner && (
          <div className="flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center"
            style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)" }}>
            <div className="relative flex-1">
              <UserPlus size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: "var(--dm-text-tertiary)" }} />
              <input type="email" value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void handleInvite(); }}
                placeholder="email@pessoa.com"
                className="h-10 w-full rounded-lg border pl-9 pr-3 text-xs outline-none transition focus:ring-1"
                style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)", color: "var(--dm-text-primary)" }} />
            </div>
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as CompanyRole)}
              className="h-10 flex-shrink-0 rounded-lg border px-2.5 text-xs font-semibold outline-none"
              style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)", color: ROLE_COLORS[inviteRole] }}>
              {(["manager", "viewer", "owner"] as CompanyRole[]).map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
            <button type="button" onClick={() => void handleInvite()} disabled={inviting || !inviteEmail.trim()}
              className="flex h-10 flex-shrink-0 items-center justify-center gap-1.5 rounded-lg px-4 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-40"
              style={{ background: "linear-gradient(135deg,#6366C8 0%,#313491 100%)" }}>
              {inviting ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />}
              Convidar
            </button>
          </div>
        )}
        {isOwner && (
          <p className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
            Se a pessoa já tiver conta, entra na hora. Se não, o convite fica guardado e ela é vinculada ao criar a conta com esse e-mail.
          </p>
        )}
        {loadingMembers ? (
          <div className="flex items-center gap-2 py-4 justify-center">
            <Loader2 size={14} className="animate-spin" style={{ color: "var(--dm-text-tertiary)" }} />
            <span className="text-xs" style={{ color: "var(--dm-text-tertiary)" }}>Carregando membros…</span>
          </div>
        ) : (
          <div className="space-y-2">
            {members.map((m) => {
              const isLastOwner = m.role === "owner" && ownersCount === 1;
              const busy = busyMemberId === m.id;
              return (
                <div key={m.id} className="flex items-center gap-3 rounded-xl border px-4 py-3"
                  style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)" }}>
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                    style={{ backgroundColor: ROLE_COLORS[m.role] }}>
                    {(m.email || "?").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>
                      {m.email || m.userId}
                    </p>
                    <p className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
                      desde {new Date(m.createdAt).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  {isOwner && !isLastOwner ? (
                    <>
                      <select value={m.role} disabled={busy}
                        onChange={(e) => void handleRoleChange(m, e.target.value as CompanyRole)}
                        className="h-9 flex-shrink-0 rounded-lg border px-2.5 text-xs font-semibold outline-none disabled:opacity-50"
                        style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)", color: ROLE_COLORS[m.role] }}>
                        {(Object.keys(ROLE_LABELS) as CompanyRole[]).map((r) => (
                          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                        ))}
                      </select>
                      <button type="button" disabled={busy} onClick={() => void handleRemove(m)}
                        title="Remover da empresa"
                        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg transition hover:opacity-70 disabled:opacity-40"
                        style={{ color: "var(--dm-text-tertiary)" }}>
                        {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    </>
                  ) : (
                    <span className="flex-shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold text-white"
                      style={{ backgroundColor: ROLE_COLORS[m.role] }}>
                      {ROLE_LABELS[m.role]}{isLastOwner && isOwner ? " (único dono)" : ""}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
