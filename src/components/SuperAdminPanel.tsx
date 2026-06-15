"use client";

import { useEffect, useState } from "react";
import {
  ShieldCheck, Loader2, Save, Trash2, KeyRound, Users, CheckCircle2,
  AlertCircle, UserPlus, ChevronDown, ChevronRight, Building2, Megaphone, Plus,
} from "lucide-react";
import { toast } from "@/hooks/useToast";
import {
  fetchAdminCompanies, setCompanyToken, fetchCompanyMembers, fetchCompanyToken,
  inviteMemberByEmail, updateMemberRole, removeMember,
  fetchCompanyAdAccounts, addCompanyAdAccount, toggleCompanyAdAccount, deleteCompanyAdAccount,
  type AdminCompany, type CompanyMember, type CompanyRole, type AdAccountEntry,
} from "@/hooks/useCompany";

const ROLE_LABELS: Record<CompanyRole, string> = {
  owner: "Dono", manager: "Gestor de tráfego", viewer: "Visualização",
};
const ROLE_COLORS: Record<CompanyRole, string> = {
  owner: "#8b5cf6", manager: "#10b981", viewer: "#64748b",
};

const isEmail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

/**
 * Painel de super admin: lista todas as empresas e permite configurar token Meta
 * e gerenciar membros de qualquer uma sem trocar de contexto. Visível só para
 * quem é super admin no banco (app_admins, migration 026).
 */
export function SuperAdminPanel() {
  const [rows, setRows] = useState<AdminCompany[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = () => {
    void fetchAdminCompanies()
      .then(setRows)
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : "Erro ao carregar empresas.");
        setRows([]);
      });
  };
  useEffect(load, []);

  return (
    <div className="rounded-2xl border p-5 space-y-4"
      style={{ backgroundColor: "var(--dm-bg-surface)", borderColor: "#6366C8" }}>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: "rgba(99,102,200,0.12)" }}>
          <ShieldCheck size={17} style={{ color: "#6366C8" }} />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold"
            style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins),Poppins,sans-serif" }}>
            Super Admin — todas as empresas
          </h3>
          <p className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
            Configure token Meta e membros de qualquer empresa, sem trocar de contexto.
          </p>
        </div>
        {rows && (
          <span className="rounded-full px-2.5 py-1 text-[11px] font-bold"
            style={{ backgroundColor: "rgba(99,102,200,0.12)", color: "#6366C8" }}>
            {rows.length} empresa{rows.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {rows === null ? (
        <div className="flex items-center justify-center gap-2 py-8">
          <Loader2 size={16} className="animate-spin" style={{ color: "var(--dm-text-tertiary)" }} />
          <span className="text-xs" style={{ color: "var(--dm-text-tertiary)" }}>Carregando empresas…</span>
        </div>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-xs" style={{ color: "var(--dm-text-tertiary)" }}>
          Nenhuma empresa encontrada.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <CompanyAdminRow
              key={row.company.id}
              row={row}
              open={openId === row.company.id}
              onToggle={() => setOpenId((id) => (id === row.company.id ? null : row.company.id))}
              onTokenChange={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CompanyAdminRow({ row, open, onToggle, onTokenChange }: {
  row: AdminCompany;
  open: boolean;
  onToggle: () => void;
  onTokenChange: () => void;
}) {
  const { company } = row;
  const [hasToken, setHasToken] = useState(row.hasToken);

  // ── Token ──
  const [currentToken, setCurrentToken] = useState<string>("");
  const [reveal, setReveal] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [savingToken, setSavingToken] = useState(false);

  // ── Contas de anúncio ──
  const [accounts, setAccounts] = useState<AdAccountEntry[] | null>(null);
  const [acctId, setAcctId] = useState("");
  const [acctLabel, setAcctLabel] = useState("");
  const [addingAcct, setAddingAcct] = useState(false);
  const [busyAcctId, setBusyAcctId] = useState<string | null>(null);

  // ── Membros ──
  const [members, setMembers] = useState<CompanyMember[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<CompanyRole>("manager");
  const [inviting, setInviting] = useState(false);

  // Carrega token + contas + membros sob demanda quando a linha abre.
  useEffect(() => {
    if (!open) return;
    let active = true;
    void fetchCompanyToken(company.id).then((t) => { if (active) setCurrentToken(t); }).catch(() => {});
    if (accounts === null) {
      void fetchCompanyAdAccounts(company.id)
        .then((a) => { if (active) setAccounts(a); })
        .catch(() => { if (active) setAccounts([]); });
    }
    if (members === null) {
      void fetchCompanyMembers(company.id)
        .then((m) => { if (active) setMembers(m); })
        .catch(() => { if (active) setMembers([]); });
    }
    return () => { active = false; };
  }, [open, company.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddAccount = async () => {
    if (!acctId.trim()) { toast.error("Informe o ID da conta de anúncio."); return; }
    setAddingAcct(true);
    try {
      const entry = await addCompanyAdAccount(company.id, acctId, acctLabel);
      setAccounts((prev) => [...(prev ?? []), entry]);
      setAcctId(""); setAcctLabel("");
      toast.success(`Conta ${entry.adAccountId} adicionada. O cron passa a sincronizá-la.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao adicionar conta.");
    } finally { setAddingAcct(false); }
  };

  const handleToggleAccount = async (a: AdAccountEntry) => {
    setBusyAcctId(a.id);
    try {
      await toggleCompanyAdAccount(a.id, !a.isEnabled);
      setAccounts((prev) => prev?.map((x) => (x.id === a.id ? { ...x, isEnabled: !x.isEnabled } : x)) ?? prev);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao alterar conta.");
    } finally { setBusyAcctId(null); }
  };

  const handleDeleteAccount = async (a: AdAccountEntry) => {
    setBusyAcctId(a.id);
    try {
      await deleteCompanyAdAccount(a.id);
      setAccounts((prev) => prev?.filter((x) => x.id !== a.id) ?? prev);
      toast.success(`Conta ${a.adAccountId} removida.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao remover conta.");
    } finally { setBusyAcctId(null); }
  };

  const handleSaveToken = async () => {
    if (!tokenInput.trim()) return;
    setSavingToken(true);
    try {
      await setCompanyToken(company.id, tokenInput.trim());
      setCurrentToken(tokenInput.trim());
      setTokenInput("");
      setHasToken(true);
      onTokenChange();
      toast.success(`Token salvo para ${company.name}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar token.");
    } finally { setSavingToken(false); }
  };

  const handleInvite = async () => {
    const e = email.trim().toLowerCase();
    if (!isEmail(e)) { toast.error("Informe um e-mail válido."); return; }
    setInviting(true);
    try {
      const result = await inviteMemberByEmail(company.id, e, role);
      setEmail("");
      if (result === "added") {
        toast.success(`${e} adicionado como ${ROLE_LABELS[role]}.`);
        setMembers(await fetchCompanyMembers(company.id));
      } else {
        toast.success(`Convite registrado para ${e}. Vira membro ao criar a conta.`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao adicionar.");
    } finally { setInviting(false); }
  };

  const handleRole = async (m: CompanyMember, newRole: CompanyRole) => {
    setBusyId(m.id);
    try {
      await updateMemberRole(m.id, newRole);
      setMembers((prev) => prev?.map((x) => (x.id === m.id ? { ...x, role: newRole } : x)) ?? prev);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao trocar papel.");
    } finally { setBusyId(null); }
  };

  const handleRemove = async (m: CompanyMember) => {
    setBusyId(m.id);
    try {
      await removeMember(m.id);
      setMembers((prev) => prev?.filter((x) => x.id !== m.id) ?? prev);
      toast.success(`${m.email || "Membro"} removido.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao remover.");
    } finally { setBusyId(null); }
  };

  const masked = currentToken
    ? `${currentToken.slice(0, 8)}${"•".repeat(20)}${currentToken.slice(-4)}`
    : "";

  return (
    <div className="rounded-xl border"
      style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)" }}>
      {/* Cabeçalho clicável */}
      <button type="button" onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:opacity-90">
        {open
          ? <ChevronDown size={15} style={{ color: "var(--dm-text-tertiary)" }} />
          : <ChevronRight size={15} style={{ color: "var(--dm-text-tertiary)" }} />}
        <Building2 size={15} style={{ color: "#6366C8" }} className="flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold" style={{ color: "var(--dm-text-primary)" }}>
            {company.name}
          </p>
          <p className="truncate text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>/{company.slug}</p>
        </div>
        <span className="flex items-center gap-1 text-[10px] font-semibold"
          style={{ color: hasToken ? "#05CD99" : "#F4A60D" }}>
          {hasToken ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
          {hasToken ? "Token" : "Sem token"}
        </span>
        <span className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: "var(--dm-text-tertiary)" }}>
          <Users size={12} /> {row.memberCount}
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t px-4 py-4" style={{ borderColor: "var(--dm-border-default)" }}>
          {/* Token */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: "var(--dm-text-secondary)" }}>
              <KeyRound size={12} /> Token da API Meta
            </div>
            {currentToken && (
              <div className="flex items-center gap-2 rounded-lg border px-3 py-2"
                style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)" }}>
                <span className="min-w-0 flex-1 truncate font-mono text-[11px]" style={{ color: "var(--dm-text-secondary)" }}>
                  {reveal ? currentToken : masked}
                </span>
                <button type="button" onClick={() => setReveal((v) => !v)}
                  className="flex-shrink-0 text-[10px] font-bold transition hover:opacity-70" style={{ color: "#6366C8" }}>
                  {reveal ? "Ocultar" : "Revelar"}
                </button>
              </div>
            )}
            <div className="flex gap-2">
              <input type="password" value={tokenInput} onChange={(e) => setTokenInput(e.target.value)}
                placeholder={currentToken ? "Colar novo token para substituir…" : "EAAxxxx…"}
                className="h-10 flex-1 rounded-lg border px-3 font-mono text-[12px] outline-none transition focus:ring-1"
                style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)", color: "var(--dm-text-primary)" }} />
              <button type="button" onClick={() => void handleSaveToken()}
                disabled={savingToken || !tokenInput.trim()}
                className="flex h-10 items-center gap-1.5 rounded-lg px-3.5 text-[11px] font-bold text-white transition hover:opacity-90 disabled:opacity-40"
                style={{ background: "linear-gradient(135deg,#6366C8 0%,#313491 100%)" }}>
                {savingToken ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                {currentToken ? "Substituir" : "Salvar"}
              </button>
            </div>
          </div>

          {/* Contas de anúncio */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: "var(--dm-text-secondary)" }}>
              <Megaphone size={12} /> Contas de anúncio
              <span className="font-normal" style={{ color: "var(--dm-text-tertiary)" }}>
                — o cron sincroniza as habilitadas
              </span>
            </div>

            {/* Adicionar conta */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input value={acctId} onChange={(e) => setAcctId(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void handleAddAccount(); }}
                placeholder="ID da conta (act_123… ou 123…)"
                className="h-9 flex-1 rounded-lg border px-3 font-mono text-[12px] outline-none transition focus:ring-1"
                style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)", color: "var(--dm-text-primary)" }} />
              <input value={acctLabel} onChange={(e) => setAcctLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void handleAddAccount(); }}
                placeholder="Apelido (opcional)"
                className="h-9 flex-1 rounded-lg border px-3 text-[12px] outline-none transition focus:ring-1"
                style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)", color: "var(--dm-text-primary)" }} />
              <button type="button" onClick={() => void handleAddAccount()} disabled={addingAcct || !acctId.trim()}
                className="flex h-9 items-center justify-center gap-1.5 rounded-lg px-3.5 text-[11px] font-bold text-white transition hover:opacity-90 disabled:opacity-40"
                style={{ background: "linear-gradient(135deg,#6366C8 0%,#313491 100%)" }}>
                {addingAcct ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                Adicionar
              </button>
            </div>

            {/* Lista de contas */}
            {accounts === null ? (
              <div className="flex items-center gap-2 py-2">
                <Loader2 size={13} className="animate-spin" style={{ color: "var(--dm-text-tertiary)" }} />
                <span className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>Carregando contas…</span>
              </div>
            ) : accounts.length === 0 ? (
              <p className="py-1 text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>Nenhuma conta de anúncio ainda.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {accounts.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 rounded-lg border px-3 py-2"
                    style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)" }}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>
                        {a.label || a.adAccountId}
                      </p>
                      <p className="truncate font-mono text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>act_{a.adAccountId}</p>
                    </div>
                    <button type="button" onClick={() => void handleToggleAccount(a)} disabled={busyAcctId === a.id}
                      className="flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold transition hover:opacity-80 disabled:opacity-50"
                      style={{
                        backgroundColor: a.isEnabled ? "rgba(5,205,153,0.12)" : "rgba(148,163,184,0.15)",
                        color: a.isEnabled ? "#05CD99" : "var(--dm-text-tertiary)",
                      }}>
                      {busyAcctId === a.id ? "…" : a.isEnabled ? "Sincronizando" : "Pausada"}
                    </button>
                    <button type="button" onClick={() => void handleDeleteAccount(a)} disabled={busyAcctId === a.id}
                      className="flex-shrink-0 rounded-md p-1 transition hover:opacity-70 disabled:opacity-40"
                      style={{ color: "#ef4444" }}>
                      {busyAcctId === a.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Membros */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: "var(--dm-text-secondary)" }}>
              <Users size={12} /> Membros
            </div>

            {/* Adicionar por e-mail */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <UserPlus size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                  style={{ color: "var(--dm-text-tertiary)" }} />
                <input type="email" value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void handleInvite(); }}
                  placeholder="email@pessoa.com"
                  className="h-9 w-full rounded-lg border pl-8 pr-3 text-[12px] outline-none transition focus:ring-1"
                  style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)", color: "var(--dm-text-primary)" }} />
              </div>
              <select value={role} onChange={(e) => setRole(e.target.value as CompanyRole)}
                className="h-9 flex-shrink-0 rounded-lg border px-2 text-[11px] font-semibold outline-none"
                style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)", color: ROLE_COLORS[role] }}>
                {(["manager", "viewer", "owner"] as CompanyRole[]).map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
              <button type="button" onClick={() => void handleInvite()} disabled={inviting || !email.trim()}
                className="flex h-9 items-center justify-center gap-1.5 rounded-lg px-3.5 text-[11px] font-bold text-white transition hover:opacity-90 disabled:opacity-40"
                style={{ background: "linear-gradient(135deg,#6366C8 0%,#313491 100%)" }}>
                {inviting ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />}
                Adicionar
              </button>
            </div>

            {/* Lista de membros */}
            {members === null ? (
              <div className="flex items-center gap-2 py-2">
                <Loader2 size={13} className="animate-spin" style={{ color: "var(--dm-text-tertiary)" }} />
                <span className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>Carregando membros…</span>
              </div>
            ) : members.length === 0 ? (
              <p className="py-1 text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>Nenhum membro ainda.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 rounded-lg border px-3 py-2"
                    style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)" }}>
                    <span className="min-w-0 flex-1 truncate text-[12px]" style={{ color: "var(--dm-text-primary)" }}>
                      {m.email || "—"}
                    </span>
                    <select value={m.role} onChange={(e) => void handleRole(m, e.target.value as CompanyRole)}
                      disabled={busyId === m.id}
                      className="h-7 flex-shrink-0 rounded-md border px-1.5 text-[10px] font-semibold outline-none disabled:opacity-50"
                      style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: ROLE_COLORS[m.role] }}>
                      {(["owner", "manager", "viewer"] as CompanyRole[]).map((r) => (
                        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                      ))}
                    </select>
                    <button type="button" onClick={() => void handleRemove(m)} disabled={busyId === m.id}
                      className="flex-shrink-0 rounded-md p-1 transition hover:opacity-70 disabled:opacity-40"
                      style={{ color: "#ef4444" }}>
                      {busyId === m.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
