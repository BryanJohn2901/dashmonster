"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Save, Plus, Trash2, ChevronDown, ChevronRight, RefreshCw, Unlink } from "lucide-react";
import { toast } from "@/hooks/useToast";
import {
  fetchEduzzWebhookConfigs, createEduzzWebhookConfig, renameEduzzWebhookConfig, deleteEduzzWebhookConfig,
  fetchTrackingPixels, fetchEduzzCatalog, upsertEduzzProduct, setEduzzProductPixel,
  fetchEduzzOAuthConnection, disconnectEduzzOAuth, syncEduzzOAuthNow, startEduzzOAuth,
  type Company, type EduzzWebhookConfig, type TrackingPixel, type EduzzProduct, type EduzzOAuthConnection,
} from "@/hooks/useCompany";

const BRAND = "#6366C8";
const inputCls = "h-11 rounded-xl border px-3.5 text-[13px] outline-none transition focus:ring-1";
const inputStyle = { borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" } as React.CSSProperties;
const btnPrimary = "flex items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-bold text-white transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6366C8] focus-visible:ring-offset-1";
const btnPrimaryStyle = { background: "linear-gradient(135deg,#6366C8 0%,#313491 100%)" } as React.CSSProperties;

type EduzzWebhookKind = "legacy" | "modern";

// Lista + CRUD de configs de webhook Eduzz (1 empresa pode ter N — várias
// contas/produtos), mesmo padrão de TrackingConfigPanel.tsx (1 empresa pode
// ter N pixels). Cada config tem seu próprio segredo/URL — ver
// src/app/api/eduzz/CLAUDE.md e migration 041 pro porquê da tabela própria.
export function EduzzConfigPanel({ company, canEdit }: { company: Company; canEdit: boolean }) {
  const [configs, setConfigs] = useState<EduzzWebhookConfig[] | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchEduzzWebhookConfigs(company.id).then((list) => { if (active) setConfigs(list); });
    return () => { active = false; };
  }, [company.id]);

  const addConfig = async () => {
    setCreating(true);
    try {
      const created = await createEduzzWebhookConfig(company.id, "Nova config");
      setConfigs((prev) => [...(prev ?? []), created]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar config.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      {!canEdit && (
        <p className="rounded-lg border px-3 py-2 text-[11px] font-semibold" style={{ borderColor: "#F4A60D", background: "rgba(244,166,13,0.08)", color: "#F4A60D" }}>
          Somente o dono ou o gestor de tráfego da empresa podem editar essas configurações.
        </p>
      )}
      <p className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
        Cada venda <strong style={{ color: "var(--dm-text-secondary)" }}>paga</strong> entra como receita no dashboard e — quando há um
        pixel com Meta CAPI configurado — também vira um evento <strong style={{ color: "var(--dm-text-secondary)" }}>Compra</strong> mandado
        pra Meta Ads, igual aos eventos do pixel próprio. Crie 1 config por conta/produto Eduzz se precisar de URLs separadas.
      </p>

      {configs === null && (
        <div className="flex items-center justify-center gap-2 py-6">
          <Loader2 size={16} className="animate-spin" style={{ color: "var(--dm-text-tertiary)" }} />
        </div>
      )}

      {configs?.length === 0 && (
        <p className="rounded-lg border px-3 py-2 text-[11px]" style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-tertiary)" }}>
          Nenhuma config criada ainda. Crie a primeira pra gerar a URL do webhook.
        </p>
      )}

      {configs?.map((config) => (
        <EduzzConfigCard
          key={config.id}
          config={config}
          canEdit={canEdit}
          onSaved={(updated) => setConfigs((prev) => (prev ?? []).map((c) => (c.id === updated.id ? updated : c)))}
          onDeleted={(id) => setConfigs((prev) => (prev ?? []).filter((c) => c.id !== id))}
        />
      ))}

      {canEdit && (
        <button
          type="button"
          onClick={() => void addConfig()}
          disabled={creating || configs === null}
          className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border text-xs font-bold transition-opacity hover:opacity-80 disabled:opacity-40"
          style={{ borderColor: "var(--dm-border-default)", color: BRAND }}
        >
          {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Nova config
        </button>
      )}

      <EduzzOAuthSection company={company} canEdit={canEdit} />
      <ProductPixelMapSection company={company} canEdit={canEdit} />
    </div>
  );
}

// Conexão OAuth2 com a API da Eduzz (migration 058) — complemento ao webhook
// acima, pra cobrir lacunas estruturais (contract_created que nunca chega,
// invoice_paid com contract:null, histórico anterior ao webhook). Ver
// src/app/api/eduzz/CLAUDE.md. Sincroniza automaticamente a cada 6h (cron) +
// botão manual aqui; o webhook continua sendo o caminho rápido de toda venda.
function computeSyncProgressPct(connection: EduzzOAuthConnection | null | undefined): number | null {
  if (!connection?.lastSyncedAt) return null;
  const start = new Date(connection.createdAt).getTime() - 90 * 86400000;
  const last = new Date(connection.lastSyncedAt).getTime();
  const now = Date.now();
  if (!(now > start) || Number.isNaN(last)) return null;
  return Math.min(100, Math.max(0, Math.round(((last - start) / (now - start)) * 100)));
}

function EduzzOAuthSection({ company, canEdit }: { company: Company; canEdit: boolean }) {
  const [connection, setConnection] = useState<EduzzOAuthConnection | null | undefined>(undefined);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  // Evita 2 loops de sync simultâneos (re-render, StrictMode, clique duplo) —
  // ref e não state porque não precisa re-renderizar quando muda.
  const runningRef = useRef(false);

  const load = useCallback(() => {
    fetchEduzzOAuthConnection(company.id)
      .then(setConnection)
      .catch(() => setConnection(null));
  }, [company.id]);

  useEffect(() => { load(); }, [load]);

  // Notifica erro de sync que aconteceu enquanto o usuário estava fora do
  // painel (ex.: cron de madrugada) — sem isso, só descobria abrindo o
  // painel e lendo o texto pequeno do status. Toast 1x por sessão (ref),
  // não repete a cada re-render.
  const erroredToastedRef = useRef(false);
  useEffect(() => {
    if (connection?.status === "error" && !erroredToastedRef.current) {
      erroredToastedRef.current = true;
      toast.error(connection.lastSyncError ?? "A última sincronização com a Eduzz falhou.");
    }
  }, [connection?.status, connection?.lastSyncError]);

  // Progresso aproximado: do início do período (1ª sync, 90 dias antes da
  // conexão) até hoje, quanto já foi coberto por `last_synced_at`. É uma
  // estimativa (sync que retoma de um erro tem o mesmo cálculo, só não
  // distingue "retomando" de "1ª vez") — serve pra dar uma noção visual de
  // quanto falta, não uma métrica exata. Não memoizado (usa Date.now(), o
  // React Compiler rejeita impureza dentro de useMemo) — cálculo é trivial,
  // não precisa de cache.
  const syncProgressPct = computeSyncProgressPct(connection);

  // A rota sync-now é síncrona e faz UMA fatia por chamada (bounded por tempo),
  // devolvendo done=false enquanto sobrar período. Aqui rodamos as fatias em
  // loop até done — cada fatia atualiza a UI (status/última data) na hora, e o
  // teto de iterações evita loop infinito se algo der errado no servidor.
  const runSync = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setSyncing(true);
    try {
      for (let i = 0; i < 60; i++) {
        const { connection: updated, done } = await syncEduzzOAuthNow(company.id);
        setConnection(updated);
        if (updated.status === "error") {
          toast.error(updated.lastSyncError ?? "Falha na sincronização.");
          return;
        }
        if (done) {
          toast.success("Sincronização concluída.");
          return;
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao sincronizar.");
      load();
    } finally {
      runningRef.current = false;
      setSyncing(false);
    }
  }, [company.id, load]);

  // Auto-retoma: se a conexão está "syncing" (1ª sync após conectar, ou uma
  // sync interrompida por reload/aba fechada), continua sozinho — não fica
  // preso. O guard runningRef impede disparo duplicado durante o loop.
  useEffect(() => {
    if (connection?.status === "syncing" && !runningRef.current) {
      void runSync();
    }
  }, [connection?.status, runSync]);

  // Lê o resultado do callback OAuth (?eduzz_oauth=...) e limpa a URL —
  // mesmo padrão de ?ig_oauth= em ControlPanel.tsx.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const status = params.get("eduzz_oauth");
      if (!status) return;
      if (status === "connected") {
        toast.success("Conta Eduzz conectada! Sincronizando os últimos 90 dias — acompanhe aqui embaixo.");
        load();
      } else {
        toast.error(params.get("reason") ?? "Falha ao conectar com a Eduzz.");
      }
      params.delete("eduzz_oauth"); params.delete("reason");
      const clean = window.location.pathname + (params.toString() ? `?${params}` : "");
      window.history.replaceState({}, "", clean);
    } catch { /* silent */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [connecting, setConnecting] = useState(false);
  const connect = async () => {
    setConnecting(true);
    try {
      const url = await startEduzzOAuth(company.id);
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao conectar com a Eduzz.");
      setConnecting(false);
    }
  };

  const syncNow = () => { void runSync(); };

  // Período customizado (pedido explícito do usuário): a sync incremental
  // sempre varre os mesmos 90 dias fixos na 1ª vez — período menor processa
  // mais rápido (menos volume pra paginar), período maior demora mais. Não
  // toca `last_synced_at` (cursor incremental normal, ver syncCompanyRange em
  // eduzzSync.ts) — só este loop rastreia o cursor entre chamadas.
  const [rangeOpen, setRangeOpen] = useState(false);
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [rangeRunning, setRangeRunning] = useState(false);
  const [rangeProgress, setRangeProgress] = useState<string | null>(null);

  const runRangeSync = useCallback(async () => {
    if (runningRef.current) return;
    if (!rangeFrom || !rangeTo) {
      toast.error("Escolha as 2 datas.");
      return;
    }
    runningRef.current = true;
    setRangeRunning(true);
    setRangeProgress(null);
    let cursor: string | undefined;
    try {
      for (let i = 0; i < 200; i++) {
        const { connection: updated, done, cursor: nextCursor } = await syncEduzzOAuthNow(company.id, { from: rangeFrom, to: rangeTo, cursor });
        setConnection(updated);
        cursor = nextCursor;
        if (cursor) setRangeProgress(`já processou até ${new Date(cursor).toLocaleDateString("pt-BR")}`);
        if (updated.status === "error") {
          toast.error(updated.lastSyncError ?? "Falha ao sincronizar o período.");
          return;
        }
        if (done) {
          toast.success("Período sincronizado.");
          return;
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao sincronizar o período.");
    } finally {
      runningRef.current = false;
      setRangeRunning(false);
    }
  }, [company.id, rangeFrom, rangeTo]);

  const disconnect = async () => {
    if (!confirm("Desconectar a conta Eduzz? A sincronização automática para; o webhook continua funcionando normalmente.")) return;
    setDisconnecting(true);
    try {
      await disconnectEduzzOAuth(company.id);
      setConnection(null);
      toast.success("Conta Eduzz desconectada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao desconectar.");
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border p-4" style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)" }}>
      <div>
        <h3 className="text-[12px] font-bold" style={{ color: "var(--dm-text-secondary)" }}>Sincronização via API (complemento ao webhook)</h3>
        <p className="mt-1 text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
          Conecte sua conta Eduzz pra preencher automaticamente o que o webhook às vezes não recebe (assinaturas sem aviso de
          mudança, histórico antigo, reembolsos atrasados) — roda sozinho a cada 6h, sem precisar fazer nada depois de conectar.
        </p>
      </div>

      {connection === undefined ? (
        <div className="flex items-center justify-center py-3">
          <Loader2 size={14} className="animate-spin" style={{ color: "var(--dm-text-tertiary)" }} />
        </div>
      ) : connection === null ? (
        canEdit ? (
          <button type="button" onClick={connect} disabled={connecting} className={`h-11 w-full ${btnPrimary}`} style={btnPrimaryStyle}>
            {connecting ? <Loader2 size={14} className="animate-spin" /> : "Conectar conta Eduzz"}
          </button>
        ) : (
          <p className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>Nenhuma conta conectada.</p>
        )
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2" style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)" }}>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span
                  className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                  style={{ background: connection.status === "connected" ? "#05CD99" : connection.status === "syncing" ? "#f59e0b" : "#ef4444" }}
                />
                <span className="truncate text-[12px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>
                  {connection.eduzzUserName || connection.eduzzUserEmail || "Conta Eduzz"}
                </span>
              </div>
              <p className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
                {connection.status === "syncing"
                  ? connection.lastSyncedAt
                    ? `Sincronizando... (já processou até ${new Date(connection.lastSyncedAt).toLocaleDateString("pt-BR")}${syncProgressPct != null ? ` — ${syncProgressPct}%` : ""})`
                    : "Sincronizando..."
                  : connection.status === "error"
                    ? "Erro na última sincronização — veja detalhes abaixo."
                    : connection.lastSyncedAt
                      ? `Última sincronização: ${new Date(connection.lastSyncedAt).toLocaleString("pt-BR")}`
                      : "Ainda não sincronizou."}
              </p>
              {connection.status === "syncing" && syncProgressPct != null && (
                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full" style={{ background: "var(--dm-bg-elevated)" }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${syncProgressPct}%`, background: "#f59e0b" }} />
                </div>
              )}
            </div>
          </div>

          {connection.status === "error" && (
            <div className="rounded-xl border px-3 py-2" style={{ borderColor: "rgba(239,68,68,0.4)", backgroundColor: "rgba(239,68,68,0.08)" }}>
              <p className="text-[11px] font-medium" style={{ color: "#ef4444" }}>{connection.lastSyncError ?? "Erro desconhecido na última sincronização."}</p>
            </div>
          )}

          {canEdit && (
            <div className="flex items-center gap-2">
              <button type="button" onClick={syncNow} disabled={syncing || connection.status === "syncing"} className={`h-10 flex-1 ${btnPrimary}`} style={btnPrimaryStyle}>
                {syncing || connection.status === "syncing" ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Sincronizar agora
              </button>
              <button
                type="button"
                onClick={() => void disconnect()}
                disabled={disconnecting}
                title="Desconectar"
                className="flex h-10 items-center justify-center rounded-xl border px-3 transition-opacity hover:opacity-80 disabled:opacity-40"
                style={{ borderColor: "var(--dm-border-default)", color: "#ef4444" }}
              >
                {disconnecting ? <Loader2 size={13} className="animate-spin" /> : <Unlink size={13} />}
              </button>
            </div>
          )}

          {canEdit && (
            <div className="rounded-xl border" style={{ borderColor: "var(--dm-border-default)" }}>
              <button
                type="button"
                onClick={() => setRangeOpen((v) => !v)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-semibold transition-opacity hover:opacity-80"
                style={{ color: "var(--dm-text-secondary)" }}
              >
                {rangeOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                Sincronizar um período específico
                <span className="ml-auto rounded-full px-2 py-0.5 text-[9px] font-semibold" style={{ background: "rgba(100,116,139,0.12)", color: "var(--dm-text-tertiary)" }}>opcional</span>
              </button>

              {rangeOpen && (
                <div className="space-y-2 border-t px-3 py-3" style={{ borderColor: "var(--dm-border-default)" }}>
                  <p className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
                    Período menor sincroniza mais rápido (menos dado pra revisar); período maior demora mais.
                  </p>
                  <div className="flex items-center gap-2">
                    <input type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} className={`${inputCls} h-9 flex-1 text-[12px]`} style={inputStyle} />
                    <span className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>até</span>
                    <input type="date" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} className={`${inputCls} h-9 flex-1 text-[12px]`} style={inputStyle} />
                  </div>
                  <button
                    type="button"
                    onClick={() => void runRangeSync()}
                    disabled={rangeRunning || syncing || connection.status === "syncing"}
                    className={`h-9 w-full ${btnPrimary}`}
                    style={btnPrimaryStyle}
                  >
                    {rangeRunning ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Sincronizar este período
                  </button>
                  {rangeProgress && (
                    <p className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>{rangeProgress}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Seção opcional, recolhida por padrão. Regra final (sem fallback): uma venda
// SÓ vai pra Meta se o produto dela tiver um pixel escolhido aqui — não existe
// mais o fallback antigo de "visita correlacionada → pixel padrão". Produto sem
// pixel = venda fica só no dashboard/relatório, nunca é enviada (ver
// src/app/api/eduzz/CLAUDE.md, "Resolução do pixel — SEM fallback nenhum").
// Produto é descoberto automaticamente na 1ª venda (nome provisório = título
// da oferta) — não precisa de nenhum cadastro manual prévio pra aparecer
// aqui; o formulário "produto novo" é só pra pré-configurar antes de qualquer
// venda ter chegado.
function ProductPixelMapSection({ company, canEdit }: { company: Company; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [ready, setReady] = useState(false);
  const [pixels, setPixels] = useState<TrackingPixel[]>([]);
  const [products, setProducts] = useState<EduzzProduct[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [newParentId, setNewParentId] = useState("");
  const [newName, setNewName] = useState("");
  const [newPixelId, setNewPixelId] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!open || loaded) return;
    setLoaded(true);
    void Promise.all([fetchTrackingPixels(company.id), fetchEduzzCatalog(company.id)]).then(([p, catalog]) => {
      setPixels(p);
      setProducts(catalog);
      if (p[0]) setNewPixelId((cur) => cur || p[0].id);
      setReady(true);
    });
  }, [open, loaded, company.id]);

  const changePixel = async (parentId: string, pixelId: string) => {
    setSavingId(parentId);
    try {
      await setEduzzProductPixel(company.id, parentId, pixelId || null);
      setProducts((prev) => prev.map((p) => (p.parentId === parentId ? { ...p, pixelId: pixelId || null } : p)));
      toast.success(pixelId ? "Pixel vinculado — vendas desse produto já passam a mandar pra Meta." : "Removido — vendas desse produto não mandam mais pra Meta.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSavingId(null);
    }
  };

  const addProduct = async () => {
    if (!newParentId.trim()) {
      toast.error("Preencha o ID do produto (parentId).");
      return;
    }
    setAdding(true);
    try {
      await upsertEduzzProduct(company.id, newParentId.trim(), newName.trim() || newParentId.trim());
      if (newPixelId) await setEduzzProductPixel(company.id, newParentId.trim(), newPixelId);
      setProducts((prev) => [
        ...prev.filter((p) => p.parentId !== newParentId.trim()),
        { parentId: newParentId.trim(), name: newName.trim() || newParentId.trim(), pixelId: newPixelId || null, offers: [] },
      ]);
      setNewParentId("");
      setNewName("");
      toast.success("Produto cadastrado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao cadastrar produto.");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="rounded-2xl border" style={{ borderColor: "var(--dm-border-default)" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-[12px] font-bold transition-opacity hover:opacity-80"
        style={{ color: "var(--dm-text-secondary)" }}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        Avançado: escolher quais produtos mandam pra Meta
        <span className="ml-auto rounded-full px-2 py-0.5 text-[9px] font-semibold" style={{ background: "rgba(100,116,139,0.12)", color: "var(--dm-text-tertiary)" }}>opcional</span>
      </button>

      {open && (
        <div className="space-y-4 border-t px-4 py-4" style={{ borderColor: "var(--dm-border-default)" }}>
          <p className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
            O webhook recebe TODA venda da conta Eduzz, sem filtro por produto. <strong style={{ color: "var(--dm-text-secondary)" }}>
            Só manda pra Meta o produto que você vincular a um pixel aqui</strong> — sem vínculo, a venda continua salva no dashboard pra
            relatório, mas não é enviada. Cada produto (curso) pode ter várias ofertas (preço/parcelamento) — o pixel é vinculado 1x no
            produto e vale pra todas as ofertas dele automaticamente.
          </p>

          {!ready ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 size={14} className="animate-spin" style={{ color: "var(--dm-text-tertiary)" }} />
            </div>
          ) : pixels.length === 0 ? (
            <p className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
              Crie pelo menos 1 pixel na aba Tracking antes de vincular produtos.
            </p>
          ) : (
            <>
              {products.length === 0 ? (
                <p className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
                  Nenhum produto visto em venda ainda — aparece aqui sozinho assim que a 1ª venda chegar, ou cadastre de antemão abaixo.
                </p>
              ) : (
                <div className="space-y-2">
                  {products.map((p) => {
                    const expanded = expandedId === p.parentId;
                    return (
                      <div key={p.parentId} className="rounded-xl border" style={{ borderColor: "var(--dm-border-default)" }}>
                        <div className="flex items-center gap-2 p-2">
                          <button
                            type="button"
                            onClick={() => setExpandedId(expanded ? null : p.parentId)}
                            disabled={p.offers.length === 0}
                            className="flex flex-1 items-center gap-1.5 truncate text-left text-[12px] disabled:cursor-default"
                            title={p.name}
                          >
                            {p.offers.length > 0 && (expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />)}
                            <span style={{ color: "var(--dm-text-primary)" }}>{p.name}</span>
                            <span className="font-mono text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>#{p.parentId}</span>
                            {p.offers.length > 0 && (
                              <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold" style={{ background: "rgba(100,116,139,0.12)", color: "var(--dm-text-tertiary)" }}>
                                {p.offers.length} oferta{p.offers.length !== 1 ? "s" : ""}
                              </span>
                            )}
                          </button>
                          <select
                            value={p.pixelId ?? ""}
                            disabled={!canEdit || savingId === p.parentId}
                            onChange={(e) => void changePixel(p.parentId, e.target.value)}
                            className="h-9 flex-shrink-0 rounded-lg border px-2 text-[11px] disabled:opacity-60"
                            style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }}
                          >
                            <option value="">— Não está sendo enviado —</option>
                            {pixels.map((px) => (
                              <option key={px.id} value={px.id}>{px.name}</option>
                            ))}
                          </select>
                          {savingId === p.parentId && <Loader2 size={13} className="animate-spin flex-shrink-0" style={{ color: "var(--dm-text-tertiary)" }} />}
                        </div>
                        {expanded && p.offers.length > 0 && (
                          <div className="space-y-1 border-t px-3 py-2" style={{ borderColor: "var(--dm-border-default)" }}>
                            {p.offers.map((o) => (
                              <div key={o.productId} className="flex items-center gap-2 truncate text-[11px]" style={{ color: "var(--dm-text-tertiary)" }} title={o.label}>
                                <span className="truncate">{o.label}</span>
                                <span className="font-mono text-[10px] flex-shrink-0">#{o.productId}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {canEdit && (
                <div className="space-y-2 border-t pt-3" style={{ borderColor: "var(--dm-border-default)" }}>
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>
                    Cadastrar produto de antemão
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      value={newParentId}
                      onChange={(e) => setNewParentId(e.target.value)}
                      placeholder="ID do produto (parentId)"
                      className="h-9 w-36 flex-shrink-0 rounded-lg border px-2 font-mono text-[11px]"
                      style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }}
                    />
                    <input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Nome do produto (ex: Saúde da Mulher)"
                      className="h-9 flex-1 rounded-lg border px-2 text-[11px]"
                      style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }}
                    />
                    <select
                      value={newPixelId}
                      onChange={(e) => setNewPixelId(e.target.value)}
                      className="h-9 rounded-lg border px-2 text-[11px]"
                      style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }}
                    >
                      {pixels.map((px) => (
                        <option key={px.id} value={px.id}>{px.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void addProduct()}
                      disabled={adding || !newParentId.trim()}
                      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg transition-opacity hover:opacity-90 disabled:opacity-40"
                      style={btnPrimaryStyle}
                    >
                      {adding ? <Loader2 size={13} className="animate-spin text-white" /> : <Plus size={13} className="text-white" />}
                    </button>
                  </div>
                  <p className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
                    Cole o <code>parentId</code> do produto (curso) — cobre todas as ofertas/parcelamentos dele automaticamente, mesmo as
                    futuras. Já existe um produto na lista acima? Não precisa cadastrar de novo, só escolha o pixel direto nele.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function EduzzConfigCard({ config, canEdit, onSaved, onDeleted }: {
  config: EduzzWebhookConfig;
  canEdit: boolean;
  onSaved: (c: EduzzWebhookConfig) => void;
  onDeleted: (id: string) => void;
}) {
  const [name, setName] = useState(config.name);
  const [kind, setKind] = useState<EduzzWebhookKind>("modern");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);

  const dirty = name !== config.name;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const webhookUrl = `${origin}/api/eduzz/webhook?secret=${config.secret}`;

  const save = async () => {
    setSaving(true);
    try {
      await renameEduzzWebhookConfig(config.id, name.trim());
      onSaved({ ...config, name: name.trim() || "Config sem nome" });
      toast.success("Config salva!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Remover a config "${config.name}"? O webhook cadastrado na Eduzz com essa URL para de funcionar.`)) return;
    setDeleting(true);
    try {
      await deleteEduzzWebhookConfig(config.id);
      onDeleted(config.id);
      toast.success("Config removida.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao remover.");
    } finally {
      setDeleting(false);
    }
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { toast.error("Não foi possível copiar."); }
  };

  return (
    <div className="space-y-3 rounded-2xl border p-4" style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)" }}>
      <input
        value={name}
        disabled={!canEdit}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nome da config (ex: Conta principal)"
        className={`w-full ${inputCls} h-9 font-semibold disabled:opacity-60`}
        style={inputStyle}
      />

      <div className="rounded-xl border" style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)" }}>
        <div className="flex items-center justify-between border-b px-3 py-1.5" style={{ borderColor: "var(--dm-border-default)" }}>
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>URL do webhook</span>
          <button type="button" onClick={() => void copyUrl()} className="text-[10px] font-bold transition-opacity hover:opacity-70" style={{ color: copied ? "#05CD99" : BRAND }}>
            {copied ? "Copiado!" : "Copiar"}
          </button>
        </div>
        <pre className="overflow-x-auto px-3 py-2.5 font-mono text-[11px] leading-relaxed" style={{ color: "var(--dm-text-secondary)" }}>{webhookUrl}</pre>
      </div>

      <div className="flex gap-1 rounded-xl border p-0.5" style={{ borderColor: "var(--dm-border-default)" }}>
        {([
          ["modern", "Órbita (novo)"],
          ["legacy", "MyEduzz (antigo)"],
        ] as [EduzzWebhookKind, string][]).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setKind(k)}
            className="h-8 flex-1 rounded-lg text-[11px] font-semibold transition"
            style={kind === k ? { backgroundColor: BRAND, color: "#fff" } : { color: "var(--dm-text-tertiary)" }}>
            {label}
          </button>
        ))}
      </div>

      {kind === "modern" ? (
        <p className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
          Cadastre na Eduzz em <strong style={{ color: "var(--dm-text-secondary)" }}>Órbita → Webhooks</strong>, evento{" "}
          <strong style={{ color: "var(--dm-text-secondary)" }}>&quot;Fatura paga&quot;</strong>, colando a URL acima. Manda email e
          telefone do comprador — gera evento de compra pra Meta Ads com Match Quality melhor. Recomendado.
        </p>
      ) : (
        <p className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
          Cadastre na Eduzz em <strong style={{ color: "var(--dm-text-secondary)" }}>MyEduzz → Ferramentas → Notificações</strong>,
          colando a URL acima. Só manda email do comprador (sem telefone) — funciona, mas com Match Quality menor na Meta.
        </p>
      )}

      {canEdit && (
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void save()} disabled={saving || !dirty} className={`h-11 flex-1 ${btnPrimary}`} style={btnPrimaryStyle}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Salvar
          </button>
          <button
            type="button"
            onClick={() => void remove()}
            disabled={deleting}
            title="Remover config"
            className="flex h-11 items-center justify-center rounded-xl border px-3 transition-opacity hover:opacity-80 disabled:opacity-40"
            style={{ borderColor: "var(--dm-border-default)", color: "#ef4444" }}
          >
            {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
          </button>
        </div>
      )}
    </div>
  );
}
