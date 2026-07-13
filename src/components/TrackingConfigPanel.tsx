"use client";

import { useEffect, useState } from "react";
import { Loader2, Save, Plus, Trash2, Star, Download, AlertTriangle, CheckCircle2, XCircle, ChevronDown, Code2, Send, Globe, Webhook, Info, Copy, X, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/useToast";
import { authedFetch } from "@/lib/authedFetch";
import {
  fetchTrackingPixels, createTrackingPixel, updateTrackingPixel, deleteTrackingPixel, setDefaultTrackingPixel, verifyMetaToken, normalizeHostname,
  generateWebhookSecret, clearWebhookSecret,
  type Company, type TrackingPixel,
} from "@/hooks/useCompany";

const BRAND = "#16A34A";
const inputCls = "h-11 rounded-xl border px-3.5 text-[13px] outline-none transition focus:ring-1";
const inputStyle = { borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" } as React.CSSProperties;
const btnPrimary = "flex items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-bold text-white transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16A34A] focus-visible:ring-offset-1";
const btnPrimaryStyle = { background: "var(--dm-btn-primary-bg)" } as React.CSSProperties;

// Resposta de POST /api/tracking/test-proxy (botão "Testar" do modo proxy).
interface TestProxyResult {
  scriptFound: boolean;
  pageError: string | null;
  configOk: boolean;
  configError: string | null;
  cookieOk: boolean;
  cookieError: string | null;
  allOk: boolean;
}

// Lista + CRUD de pixels de tracking (1 empresa pode ter N, ex.: 1 por landing
// page/produto) — usado tanto no Estúdio da Empresa quanto direto na aba
// Tracking, pra não ter 2 cópias da mesma lógica de salvar/criar/remover.
export function TrackingConfigPanel({ company, canEdit }: { company: Company; canEdit: boolean }) {
  const [pixels, setPixels] = useState<TrackingPixel[] | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchTrackingPixels(company.id).then((list) => { if (active) setPixels(list); });
    return () => { active = false; };
  }, [company.id]);

  const addPixel = async () => {
    setCreating(true);
    try {
      const created = await createTrackingPixel(company.id, { name: "Novo pixel", isFirst: (pixels?.length ?? 0) === 0 });
      setPixels((prev) => [...(prev ?? []), created]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar pixel.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      {!canEdit && (
        <p className="rounded-lg border px-3 py-2 text-[11px] font-semibold" style={{ borderColor: "#F4A60D", background: "rgba(244,166,13,0.08)", color: "#F4A60D" }}>
          Somente o dono ou o gestor de tráfego da empresa podem editar essas configurações — os campos abaixo estão travados pro seu papel atual.
        </p>
      )}
      <p className="text-[13px] leading-relaxed" style={{ color: "var(--dm-text-secondary)" }}>
        Um pixel por landing page ou produto. Ele captura visitas e leads sozinho — a Meta (Conversions API) é opcional.
      </p>

      {pixels === null && (
        <div className="flex items-center justify-center gap-2 py-6">
          <Loader2 size={16} className="animate-spin" style={{ color: "var(--dm-text-tertiary)" }} />
        </div>
      )}

      {pixels?.length === 0 && (
        <p className="rounded-lg border px-3 py-2 text-[11px]" style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-tertiary)" }}>
          Nenhum pixel criado ainda. Crie o primeiro pra gerar o código de instalação.
        </p>
      )}

      {pixels?.map((pixel) => (
        <PixelCard
          key={pixel.id}
          company={company}
          canEdit={canEdit}
          pixel={pixel}
          onlyPixel={pixels.length === 1}
          onSaved={(updated) => setPixels((prev) => (prev ?? []).map((p) => (p.id === updated.id ? updated : p)))}
          onDeleted={(id) => setPixels((prev) => (prev ?? []).filter((p) => p.id !== id))}
          onMadeDefault={(id) => setPixels((prev) => (prev ?? []).map((p) => ({ ...p, isDefault: p.id === id })))}
        />
      ))}

      {canEdit && (
        <button
          type="button"
          onClick={() => void addPixel()}
          disabled={creating || pixels === null}
          className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border text-xs font-bold transition-opacity hover:opacity-80 disabled:opacity-40"
          style={{ borderColor: "var(--dm-border-default)", color: BRAND }}
        >
          {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Novo pixel
        </button>
      )}
    </div>
  );
}

function PixelCard({ company, canEdit, pixel, onlyPixel, onSaved, onDeleted, onMadeDefault }: {
  company: Company;
  canEdit: boolean;
  pixel: TrackingPixel;
  onlyPixel: boolean;
  onSaved: (p: TrackingPixel) => void;
  onDeleted: (id: string) => void;
  onMadeDefault: (id: string) => void;
}) {
  const [name, setName] = useState(pixel.name);
  const [pixelId, setPixelId] = useState(pixel.metaPixelId);
  const [capiToken, setCapiToken] = useState("");
  const [clearCapiToken, setClearCapiToken] = useState(false);
  const [dominio, setDominio] = useState(pixel.dominioAutorizado);
  const [testEventCode, setTestEventCode] = useState(pixel.metaTestEventCode);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [revealToken, setRevealToken] = useState(false);
  const [copied, setCopied] = useState(false);
  const [testUrl, setTestUrl] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestProxyResult | null>(null);
  const [sendingTestCapi, setSendingTestCapi] = useState(false);
  const [generatingSecret, setGeneratingSecret] = useState(false);
  const [newWebhookSecret, setNewWebhookSecret] = useState<string | null>(null);
  const [webhookSecretCopied, setWebhookSecretCopied] = useState(false);
  const [webhookUrlCopied, setWebhookUrlCopied] = useState(false);
  const [showWebhookInfo, setShowWebhookInfo] = useState(false);

  const tokenChanged = capiToken.trim().length > 0 || clearCapiToken;
  const dirty =
    name !== pixel.name ||
    pixelId !== pixel.metaPixelId ||
    tokenChanged ||
    dominio !== pixel.dominioAutorizado ||
    testEventCode !== pixel.metaTestEventCode;

  // pixel.slug é opaco e estável — renomear o pixel (campo "name") nunca muda
  // esse snippet, então uma instalação já feita não quebra.
  // O pixel.js carrega DIRETO do dashmonster com `async` (não trava o
  // carregamento da página do cliente) e a fila `dmq` garante a ordem mesmo
  // assíncrono (mesma técnica do gtag/fbq). Só o track-event passa pelo
  // dm-proxy.php (1ª parte, é o que grava o cookie _dm_uid de 400 dias) — por
  // isso o arquivo PHP continua obrigatório, mesmo o script vindo daqui.
  const appBase = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== "undefined" ? window.location.origin : "");
  const snippet = `<script async src="${appBase}/api/tracking/pixel.js?via=proxy"></script>\n<script>window.dmq=window.dmq||[];dmq.push(["init","${company.slug}","${pixel.slug}"]);</script>`;

  const save = async () => {
    setSaving(true);
    try {
      // Normaliza o domínio aqui também (não só no hook) pra UI refletir o que
      // foi salvo de fato — senão o dirty-check ficaria sempre "sujo" se o
      // usuário colou uma URL completa que o hook reduziu a hostname.
      const cleanDominio = normalizeHostname(dominio);
      if (cleanDominio !== dominio) setDominio(cleanDominio);
      const nextToken = capiToken.trim();
      const patch: {
        name: string; metaPixelId: string; dominioAutorizado: string; metaTestEventCode: string;
        metaCapiToken?: string | null;
      } = { name: name.trim(), metaPixelId: pixelId.trim(), dominioAutorizado: cleanDominio, metaTestEventCode: testEventCode.trim() };
      // Token só vai no patch se foi digitado um novo (ou pedido pra limpar) —
      // o valor real fica só no servidor (segurança), nunca volta pro cliente.
      if (nextToken || clearCapiToken) patch.metaCapiToken = nextToken;

      // Com Pixel ID + token preenchidos, confere com a Meta se o token autoriza
      // ESSE pixel antes de salvar — token de outro pixel é aceito pela Meta mas
      // o evento é descartado (problema silencioso). Bloqueia só em mismatch/token
      // inválido (certeza); "unknown" (não deu pra verificar) salva mesmo assim.
      let validated = false;
      if (patch.metaPixelId && nextToken) {
        const check = await verifyMetaToken(patch.metaPixelId, nextToken);
        if (check.status === "mismatch") {
          const autoriza = check.authorizedIds?.length ? ` Ele autoriza: ${check.authorizedIds.join(", ")}.` : "";
          toast.error(`Esse token NÃO pertence ao Pixel ${patch.metaPixelId}.${autoriza} Gere o token dentro do pixel certo (Events Manager → Configurações → Conversions API) e tente de novo.`);
          return;
        }
        if (check.status === "invalid") {
          toast.error("Token inválido ou expirado. Gere um novo no Events Manager → Configurações → Conversions API.");
          return;
        }
        validated = check.status === "match";
      }

      const updated = await updateTrackingPixel(pixel.id, patch);
      setCapiToken("");
      setClearCapiToken(false);
      onSaved(updated);
      toast.success(validated ? "Pixel salvo — token validado com a Meta ✓" : "Pixel salvo!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (onlyPixel) return;
    if (!confirm(`Remover o pixel "${pixel.name}"? O código instalado nas páginas que usam ele para de capturar.`)) return;
    setDeleting(true);
    try {
      await deleteTrackingPixel(pixel.id);
      onDeleted(pixel.id);
      toast.success("Pixel removido.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao remover.");
    } finally {
      setDeleting(false);
    }
  };

  const makeDefault = async () => {
    try {
      await setDefaultTrackingPixel(company.id, pixel.id);
      onMadeDefault(pixel.id);
      toast.success("Pixel marcado como padrão.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao marcar como padrão.");
    }
  };

  const copySnippet = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { toast.error("Não foi possível copiar."); }
  };

  const webhookUrl = `${appBase}/api/tracking/webhook/${pixel.slug}`;

  const copyWebhookUrl = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setWebhookUrlCopied(true);
      setTimeout(() => setWebhookUrlCopied(false), 2000);
    } catch { toast.error("Não foi possível copiar."); }
  };

  const copyNewSecret = async () => {
    if (!newWebhookSecret) return;
    try {
      await navigator.clipboard.writeText(newWebhookSecret);
      setWebhookSecretCopied(true);
      setTimeout(() => setWebhookSecretCopied(false), 2000);
    } catch { toast.error("Não foi possível copiar."); }
  };

  const handleGenerateSecret = async () => {
    if (pixel.hasWebhookSecret && !confirm("Regenerar o secret vai invalidar o token atual. Ferramentas que usam o token antigo vão parar de funcionar. Continuar?")) return;
    setGeneratingSecret(true);
    setNewWebhookSecret(null);
    try {
      const { pixel: updated, webhookSecret } = await generateWebhookSecret(pixel.id);
      onSaved(updated);
      setNewWebhookSecret(webhookSecret);
      toast.success("Secret gerado! Copie agora — não será exibido novamente.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar secret.");
    } finally {
      setGeneratingSecret(false);
    }
  };

  const handleClearSecret = async () => {
    if (!confirm("Remover o secret vai desativar o webhook. Continuar?")) return;
    try {
      const updated = await clearWebhookSecret(pixel.id);
      onSaved(updated);
      setNewWebhookSecret(null);
      toast.success("Webhook desativado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao remover secret.");
    }
  };

  const runProxyTest = async () => {
    if (!testUrl.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await authedFetch("/api/tracking/test-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: testUrl.trim(), companySlug: company.slug, pixelSlug: pixel.slug }),
      });
      const json = (await res.json()) as TestProxyResult | { error: string };
      if (!res.ok || "error" in json) {
        toast.error("error" in json ? json.error : "Erro ao testar.");
        return;
      }
      setTestResult(json);
    } catch {
      toast.error("Não foi possível rodar o teste.");
    } finally {
      setTesting(false);
    }
  };

  const runCapiTest = async () => {
    setSendingTestCapi(true);
    try {
      const res = await authedFetch("/api/tracking/test-capi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companySlug: company.slug, pixelSlug: pixel.slug }),
      });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || json.error) {
        toast.error(json.error ?? "Erro ao enviar evento de teste.");
      } else {
        toast.success("Purchase de teste enviado! Verifique em Eventos de teste no Events Manager.");
      }
    } catch {
      toast.error("Não foi possível conectar.");
    } finally {
      setSendingTestCapi(false);
    }
  };

  const capiActive = Boolean(pixelId.trim() && (capiToken.trim() || pixel.hasMetaCapiToken));
  const installState: "ok" | "fail" | "idle" = testResult ? (testResult.allOk ? "ok" : "fail") : "idle";

  return (
    <div className="space-y-3 rounded-2xl border p-4" style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)" }}>
      {/* Cabeçalho: nome + chips de status */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          disabled={!canEdit}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome do pixel (ex: Lançamento Junho)"
          className={`min-w-[160px] flex-1 ${inputCls} h-10 font-semibold disabled:opacity-60`}
          style={inputStyle}
        />
        {pixel.isDefault && <Chip tone="ok" label="Padrão" />}
        <Chip
          tone={installState === "ok" ? "ok" : installState === "fail" ? "warn" : "neutral"}
          label={installState === "ok" ? "Instalado" : installState === "fail" ? "Revisar" : "A instalar"}
        />
        <Chip tone={capiActive ? "ok" : "neutral"} label={capiActive ? "Meta CAPI ✓" : "Meta CAPI off"} />
      </div>

      {/* ── Passo 1 — Instalação ── */}
      <Collapsible icon={Code2} title="Instalação" subtitle="Código do pixel + teste" defaultOpen>
        <p className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
          Cole o código em <strong style={{ color: "var(--dm-text-secondary)" }}>todas</strong> as páginas do site (precisa ser HTTPS).
        </p>

        <div className="rounded-xl border" style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)" }}>
          <div className="flex items-center justify-between border-b px-3 py-1.5" style={{ borderColor: "var(--dm-border-default)" }}>
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Código de instalação</span>
            <button type="button" onClick={() => void copySnippet()} className="text-[10px] font-bold transition-opacity hover:opacity-70" style={{ color: copied ? "#05CD99" : BRAND }}>
              {copied ? "Copiado!" : "Copiar"}
            </button>
          </div>
          <pre className="overflow-x-auto px-3 py-2.5 font-mono text-[11px] leading-relaxed" style={{ color: "var(--dm-text-secondary)" }}>{snippet}</pre>
        </div>

        {/* Download + "como instalar" (texto longo escondido) */}
        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/api/tracking/proxy-template"
            download="dm-proxy.php"
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition-opacity hover:opacity-80"
            style={{ borderColor: "var(--dm-border-default)", color: BRAND }}
          >
            <Download size={11} /> Baixar dm-proxy.php
          </a>
          <Hint label="Como instalar?">
            O <code>dm-proxy.php</code> faz o cookie do visitante nascer como 1ª parte e durar 400 dias, inclusive no Safari/iPhone
            (que corta cookie de JavaScript em 7 dias). Suba o arquivo na raiz do site (<code>public_html/</code>) <strong>sem renomear</strong>.
            Para vários domínios, 1 cópia em cada.
          </Hint>
        </div>

        {/* Testar instalação */}
        <div className="rounded-xl border px-3 py-2.5" style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)" }}>
          <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Testar instalação</span>
          <div className="flex items-center gap-2">
            <input
              value={testUrl}
              onChange={(e) => setTestUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void runProxyTest(); }}
              placeholder="https://meusite.com.br/pagina"
              className={`flex-1 ${inputCls} h-9 font-mono text-[11px]`}
              style={inputStyle}
            />
            <button
              type="button"
              onClick={() => void runProxyTest()}
              disabled={testing || !testUrl.trim()}
              className="flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[10px] font-bold transition-opacity hover:opacity-80 disabled:opacity-40"
              style={{ borderColor: "var(--dm-border-default)", color: BRAND }}
            >
              {testing ? <Loader2 size={12} className="animate-spin" /> : null} Testar
            </button>
          </div>
          {testResult && (
            <ul className="mt-2 space-y-1 text-[10px]">
              {([
                ["Script instalado na página", testResult.scriptFound, testResult.pageError],
                ["dm-proxy.php no ar e conectado", testResult.configOk, testResult.configError],
                ["Cookie nasce 1ª parte (Set-Cookie)", testResult.cookieOk, testResult.cookieError],
              ] as [string, boolean, string | null][]).map(([label, ok, error]) => (
                <li key={label} className="flex items-start gap-1.5">
                  {ok
                    ? <CheckCircle2 size={12} className="mt-0.5 flex-shrink-0" style={{ color: "#05CD99" }} />
                    : <XCircle size={12} className="mt-0.5 flex-shrink-0" style={{ color: "#F25767" }} />}
                  <span style={{ color: ok ? "var(--dm-text-secondary)" : "#F25767" }}>{label}{!ok && error ? ` — ${error}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Domínio autorizado */}
        <label className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>
            <Globe size={11} /> Domínio autorizado <span className="font-normal normal-case">(opcional)</span>
          </span>
          <input value={dominio} disabled={!canEdit} onChange={(e) => setDominio(e.target.value)} placeholder="meusite.com.br" className={`${inputCls} h-10 font-mono disabled:opacity-60`} style={inputStyle} />
          <span className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>Só o hostname (sem <code>https://</code>). Em branco = aceita qualquer origem.</span>
        </label>
      </Collapsible>

      {/* ── Passo 2 — Meta Conversions API (opcional) ── */}
      <Collapsible icon={Send} title="Enviar pra Meta (Conversions API)" subtitle="Opcional — dobra o sinal com o servidor" defaultOpen={capiActive} badge={capiActive ? { tone: "ok", label: "ativo" } : { tone: "neutral", label: "opcional" }}>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Pixel ID (Meta)</span>
          <input value={pixelId} disabled={!canEdit} onChange={(e) => setPixelId(e.target.value)} placeholder="123456789012345" className={`${inputCls} h-10 font-mono disabled:opacity-60`} style={inputStyle} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Token CAPI (Conversions API)</span>
          <div className="flex items-center gap-2">
            <input
              type={revealToken ? "text" : "password"}
              value={capiToken}
              disabled={!canEdit}
              onChange={(e) => { setCapiToken(e.target.value); setClearCapiToken(false); }}
              placeholder={pixel.hasMetaCapiToken ? "•••••••• (salvo no servidor)" : "EAAxxxx…"}
              className={`flex-1 ${inputCls} h-10 font-mono disabled:opacity-60`}
              style={inputStyle}
            />
            {capiToken && (
              <button type="button" onClick={() => setRevealToken((v) => !v)} className="text-[10px] font-bold" style={{ color: BRAND }}>{revealToken ? "Ocultar" : "Revelar"}</button>
            )}
            {pixel.hasMetaCapiToken && !capiToken && canEdit && (
              <button type="button" onClick={() => setClearCapiToken((v) => !v)} className="text-[10px] font-bold" style={{ color: clearCapiToken ? "#F25767" : BRAND }}>
                {clearCapiToken ? "Manter" : "Remover"}
              </button>
            )}
          </div>
          {pixel.hasMetaCapiToken && !clearCapiToken && (
            <span className="text-[10px] font-semibold" style={{ color: "#05CD99" }}>Token CAPI configurado. O valor real fica somente no servidor.</span>
          )}
          {clearCapiToken && (
            <span className="text-[10px] font-semibold" style={{ color: "#F25767" }}>O token salvo será removido ao salvar.</span>
          )}
          <span className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>Gere em Events Manager → Configurações → Conversions API (não é o token da Conexão Meta).</span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Código de teste <span className="font-normal normal-case">(só durante validação)</span></span>
          <input value={testEventCode} disabled={!canEdit} onChange={(e) => setTestEventCode(e.target.value)} placeholder="TEST12345" className={`${inputCls} h-10 font-mono disabled:opacity-60`} style={inputStyle} />
          <span className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>Da aba <strong style={{ color: "var(--dm-text-secondary)" }}>Eventos de teste</strong> do Events Manager. Apague depois de validar.</span>
        </label>
        {testEventCode.trim() && (
          <div className="space-y-2 rounded-xl border px-3 py-2.5" style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)" }}>
            <button
              type="button"
              onClick={() => void runCapiTest()}
              disabled={sendingTestCapi}
              className="flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[10px] font-bold transition-opacity hover:opacity-80 disabled:opacity-40"
              style={{ borderColor: BRAND, color: BRAND }}
            >
              {sendingTestCapi ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              Enviar Purchase de teste
            </button>
            <p className="text-[10px] leading-relaxed" style={{ color: "var(--dm-text-tertiary)" }}>
              Envia um evento <strong style={{ color: "var(--dm-text-secondary)" }}>Purchase</strong> fictício direto pra Meta com o código de teste acima.{" "}
              <strong style={{ color: "var(--dm-text-secondary)" }}>Lead</strong> e{" "}
              <strong style={{ color: "var(--dm-text-secondary)" }}>PageView</strong> devem ser testados abrindo a página real do site com o código ativo.
            </p>
          </div>
        )}
      </Collapsible>

      {/* ── Passo 3 — Webhook (formulários externos) ── */}
      <Collapsible
        icon={Webhook}
        title="Webhook"
        subtitle="Receba eventos de ferramentas externas"
        defaultOpen={pixel.hasWebhookSecret || Boolean(newWebhookSecret)}
        badge={pixel.hasWebhookSecret || Boolean(newWebhookSecret) ? { tone: "ok", label: "ativo" } : { tone: "neutral", label: "opcional" }}
      >
        <p className="text-[11px] leading-relaxed" style={{ color: "var(--dm-text-tertiary)" }}>
          Envie eventos de formulários externos (Typeform, JotForm, ActiveCampaign etc.) via requisição POST — sem precisar instalar o pixel na ferramenta.
        </p>

        {/* URL do webhook */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>URL do Webhook</span>
            <button
              type="button"
              onClick={() => setShowWebhookInfo(true)}
              title="Ver formato do payload"
              className="transition-opacity hover:opacity-70"
              style={{ color: "var(--dm-text-tertiary)" }}
            >
              <Info size={12} />
            </button>
          </div>
          <div className="flex items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)" }}>
            <code className="flex-1 overflow-x-auto text-[11px]" style={{ color: "var(--dm-text-secondary)" }}>{webhookUrl}</code>
            <button
              type="button"
              onClick={() => void copyWebhookUrl()}
              className="flex-shrink-0 text-[10px] font-bold transition-opacity hover:opacity-70"
              style={{ color: webhookUrlCopied ? "#05CD99" : BRAND }}
            >
              {webhookUrlCopied ? "Copiado!" : <Copy size={11} />}
            </button>
          </div>
        </div>

        {/* Secret recém-gerado — exibido UMA vez */}
        {newWebhookSecret && (
          <div className="space-y-1.5 rounded-xl border p-3" style={{ borderColor: "#F4A60D", backgroundColor: "rgba(244,166,13,0.06)" }}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#F4A60D" }}>Secret gerado — copie agora</span>
              <button type="button" onClick={() => void copyNewSecret()} className="text-[10px] font-bold" style={{ color: webhookSecretCopied ? "#05CD99" : BRAND }}>
                {webhookSecretCopied ? "Copiado!" : "Copiar"}
              </button>
            </div>
            <code className="block break-all font-mono text-[11px]" style={{ color: "var(--dm-text-primary)" }}>{newWebhookSecret}</code>
            <p className="text-[10px]" style={{ color: "#F4A60D" }}>
              Este valor não será exibido novamente. Guarde em local seguro e configure na sua ferramenta.
            </p>
          </div>
        )}

        {/* Gerenciamento do secret */}
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>
            Secret de autenticação
            {(pixel.hasWebhookSecret || newWebhookSecret) && (
              <span className="font-normal normal-case" style={{ color: "#05CD99" }}>✓ configurado</span>
            )}
          </span>
          {canEdit && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleGenerateSecret()}
                disabled={generatingSecret}
                className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[10px] font-bold transition-opacity hover:opacity-80 disabled:opacity-40"
                style={{ borderColor: "var(--dm-border-default)", color: BRAND }}
              >
                {generatingSecret
                  ? <Loader2 size={11} className="animate-spin" />
                  : pixel.hasWebhookSecret || newWebhookSecret
                    ? <RefreshCw size={11} />
                    : <Plus size={11} />}
                {pixel.hasWebhookSecret || newWebhookSecret ? "Regenerar secret" : "Gerar secret"}
              </button>
              {(pixel.hasWebhookSecret || newWebhookSecret) && (
                <button
                  type="button"
                  onClick={() => void handleClearSecret()}
                  className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[10px] font-bold transition-opacity hover:opacity-80"
                  style={{ borderColor: "var(--dm-border-default)", color: "#ef4444" }}
                >
                  <X size={11} /> Desativar
                </button>
              )}
            </div>
          )}
          <span className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
            Envie o secret no header <code>Authorization: Bearer &lt;secret&gt;</code> de cada requisição.
          </span>
        </div>
      </Collapsible>

      {/* Modal de formato do webhook */}
      {showWebhookInfo && (
        <WebhookInfoModal url={webhookUrl} onClose={() => setShowWebhookInfo(false)} />
      )}

      {canEdit && (
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void save()} disabled={saving || !dirty} className={`h-11 flex-1 ${btnPrimary}`} style={btnPrimaryStyle}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Salvar
          </button>
          {!pixel.isDefault && (
            <button
              type="button"
              onClick={() => void makeDefault()}
              title="Usar este pixel quando o código instalado não especificar nenhum"
              className="flex h-11 items-center justify-center rounded-xl border px-3 transition-opacity hover:opacity-80"
              style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}
            >
              <Star size={13} />
            </button>
          )}
          <button
            type="button"
            onClick={() => void remove()}
            disabled={deleting || onlyPixel}
            title={onlyPixel ? "A empresa precisa ter pelo menos 1 pixel" : "Remover pixel"}
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

// ─── Modal de documentação do Webhook ────────────────────────────────────────────

const WH_EXAMPLE_LEAD = `{
  "event_name": "Lead",
  "email": "joao@exemplo.com.br",
  "phone": "+5511999999999",
  "name": "João Silva",
  "event_url": "https://meusite.com.br/obrigado",
  "utm_source": "facebook",
  "utm_medium": "cpc",
  "utm_campaign": "lancamento-junho",
  "utm_content": "video-depoimento"
}`;

const WH_EXAMPLE_PURCHASE = `{
  "event_name": "Purchase",
  "email": "maria@exemplo.com.br",
  "phone": "+5521988887777",
  "name": "Maria Souza",
  "value": 297.00,
  "currency": "BRL",
  "event_id": "order_89f3a2b1",
  "event_url": "https://meusite.com.br/checkout/obrigado",
  "utm_source": "google",
  "utm_medium": "cpc",
  "utm_campaign": "remarketing-q2",
  "action_source": "website",
  "custom_data": {
    "produto": "Mentoria Premium",
    "parcelas": 12
  }
}`;

const WH_EXAMPLE_TYPEFORM = `{
  "event_name": "CompleteRegistration",
  "email": "{{ field:email }}",
  "name": "{{ field:nome_completo }}",
  "phone": "{{ field:telefone }}",
  "utm_source": "{{ hidden:utm_source }}",
  "utm_medium": "{{ hidden:utm_medium }}",
  "utm_campaign": "{{ hidden:utm_campaign }}",
  "event_url": "{{ form_url }}"
}`;

type WH_FIELD = { name: string; type: string; req?: boolean; auto?: string; desc: string };

const WH_FIELDS_IDENTIDADE: WH_FIELD[] = [
  { name: "event_name",   type: "string",  req: true,  desc: 'Nome do evento. Pode ser qualquer evento padrão Meta ou customizado (ver catálogo abaixo). Ex: "Lead", "Purchase".' },
  { name: "email",        type: "string",  desc: "E-mail do lead em texto puro. O servidor aplica SHA-256 automaticamente antes de enviar à Meta." },
  { name: "phone",        type: "string",  desc: 'Telefone com DDI. Ex: "+5511999999999". Apenas dígitos são mantidos; hasheado com SHA-256.' },
  { name: "name",         type: "string",  desc: 'Nome completo. O servidor separa em primeiro e último nome. Alternativa: envie "first_name" + "last_name" separados.' },
  { name: "first_name",   type: "string",  desc: 'Primeiro nome (alternativa a "name").' },
  { name: "last_name",    type: "string",  desc: 'Sobrenome (alternativa a "name").' },
];

const WH_FIELDS_EVENTO: WH_FIELD[] = [
  { name: "event_url",    type: "string",  desc: "URL completa da página onde ocorreu a conversão. Melhora a correspondência de eventos na Meta." },
  { name: "event_id",     type: "string",  auto: "UUID gerado pelo servidor se omitido", desc: "ID único por disparo do evento. Usado para deduplicar pixel ↔ CAPI. Recomendado: UUID ou ID interno da ferramenta (ex: ID do form submission)." },
  { name: "event_time",   type: "number",  auto: "Horário de recebimento (Unix segundos)", desc: "Data/hora do evento como Unix timestamp em segundos. Ex: 1751234567. Permite registrar eventos que ocorreram no passado." },
  { name: "action_source",type: "string",  auto: '"website"', desc: 'Origem da ação para a Meta. Valores aceitos: "website", "email", "app", "phone_call", "chat", "physical_store", "system_generated", "other".' },
];

const WH_FIELDS_VALOR: WH_FIELD[] = [
  { name: "value",        type: "number",  desc: "Valor monetário da transação. Ex: 297.00. Obrigatório junto com currency para eventos Purchase." },
  { name: "currency",     type: "string",  auto: '"BRL"', desc: 'Código de moeda ISO 4217. Ex: "BRL", "USD", "EUR". Ignorado se "value" não for enviado.' },
];

const WH_FIELDS_UTM: WH_FIELD[] = [
  { name: "utm_source",   type: "string",  desc: 'Origem do tráfego. Ex: "facebook", "google", "email".' },
  { name: "utm_medium",   type: "string",  desc: 'Meio de marketing. Ex: "cpc", "organic", "email".' },
  { name: "utm_campaign", type: "string",  desc: "Nome da campanha." },
  { name: "utm_content",  type: "string",  desc: "Variação de anúncio ou conteúdo (A/B test)." },
  { name: "utm_term",     type: "string",  desc: "Palavra-chave (para buscas pagas)." },
  { name: "utm_placement",type: "string",  desc: "Posicionamento do anúncio (feed, stories, etc.)." },
];

const WH_FIELDS_EXTRA: WH_FIELD[] = [
  { name: "custom_data",  type: "object",  desc: "Objeto chave-valor livre. Salvo no histórico de tracking da dashboard. Ex: { produto: 'Mentoria', parcelas: 12 }." },
];

const META_EVENTS = [
  { name: "Lead",                   desc: "Formulário preenchido, interesse demonstrado." },
  { name: "CompleteRegistration",   desc: "Cadastro concluído (criação de conta, inscrição em lista)." },
  { name: "Purchase",               desc: "Compra finalizada. Envie value + currency." },
  { name: "InitiateCheckout",       desc: "Checkout iniciado (carro de compras, botão de comprar)." },
  { name: "AddToCart",              desc: "Produto ou oferta adicionado ao carrinho." },
  { name: "ViewContent",            desc: "Página de produto ou oferta visualizada." },
  { name: "Search",                 desc: "Busca realizada dentro da ferramenta/site." },
  { name: "AddPaymentInfo",         desc: "Dados de pagamento inseridos no checkout." },
  { name: "Subscribe",              desc: "Assinatura criada (recorrência, plano)." },
  { name: "StartTrial",             desc: "Período de teste iniciado." },
  { name: "Contact",                desc: "Contato realizado (WhatsApp, ligação, chat)." },
  { name: "Schedule",               desc: "Agendamento realizado (reunião, consulta)." },
  { name: "SubmitApplication",      desc: "Candidatura ou aplicação enviada." },
  { name: "Donate",                 desc: "Doação realizada." },
  { name: "FindLocation",           desc: "Localização de loja ou unidade encontrada." },
  { name: "CustomizeProduct",       desc: "Produto personalizado (cor, tamanho, configuração)." },
  { name: "PageView",               desc: "Visualização de página genérica." },
  { name: "CustomEvent",            desc: 'Qualquer nome seguindo o padrão [A-Za-z][A-Za-z0-9_:-]* (até 64 caracteres). Ex: "QuizConcluido", "VideoAssistido".' },
];

function WH_FieldTable({ fields }: { fields: WH_FIELD[] }) {
  return (
    <div className="rounded-lg border divide-y overflow-hidden" style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)" }}>
      {fields.map((f) => (
        <div key={f.name} className="grid gap-x-3 px-2.5 py-2" style={{ gridTemplateColumns: "140px 1fr" }}>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1">
              <code className="text-[10px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>{f.name}</code>
              {f.req && <span className="text-[8px] font-bold" style={{ color: "#ef4444" }}>*</span>}
            </div>
            <span className="text-[9px] font-bold uppercase" style={{ color: "var(--dm-text-tertiary)" }}>{f.type}</span>
            {f.auto && (
              <span className="text-[9px] leading-tight" style={{ color: "#05CD99" }}>auto: {f.auto}</span>
            )}
          </div>
          <p className="text-[10px] leading-snug self-center" style={{ color: "var(--dm-text-secondary)" }}>{f.desc}</p>
        </div>
      ))}
    </div>
  );
}

function WH_Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 border-t pt-4" style={{ borderColor: "var(--dm-border-default)" }}>
      <h3 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>{title}</h3>
      {children}
    </div>
  );
}

function WebhookInfoModal({ url, onClose }: { url: string; onClose: () => void }) {
  const [exTab, setExTab] = useState<"lead" | "purchase" | "typeform">("lead");

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative my-4 flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl border"
        style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)" }}
      >
        {/* Header fixo */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b px-5 py-3.5" style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)" }}>
          <div className="flex items-center gap-2">
            <Webhook size={15} style={{ color: BRAND }} />
            <span className="text-[14px] font-bold" style={{ color: "var(--dm-text-primary)" }}>Referência do Webhook</span>
            <span className="rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ background: "rgba(22,163,74,0.12)", color: BRAND }}>v1</span>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 transition-opacity hover:opacity-60" style={{ color: "var(--dm-text-tertiary)" }}>
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-0">

          {/* Endpoint e Autenticação */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <h3 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Endpoint</h3>
              <div className="flex items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)" }}>
                <span className="flex-shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold" style={{ background: "rgba(22,163,74,0.15)", color: BRAND }}>POST</span>
                <code className="flex-1 overflow-x-auto text-[10px]" style={{ color: "var(--dm-text-secondary)" }}>{url}</code>
              </div>
            </div>
            <div className="space-y-1.5">
              <h3 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Autenticação</h3>
              <div className="rounded-lg border px-3 py-2.5 space-y-1.5" style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)" }}>
                <p className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>Use um dos dois headers abaixo (qualquer um é aceito):</p>
                <code className="block text-[10px]" style={{ color: "var(--dm-text-secondary)" }}>
                  <span style={{ color: "var(--dm-text-tertiary)" }}>Authorization:</span> Bearer &lt;webhook_secret&gt;
                </code>
                <code className="block text-[10px]" style={{ color: "var(--dm-text-secondary)" }}>
                  <span style={{ color: "var(--dm-text-tertiary)" }}>X-DM-Secret:</span> &lt;webhook_secret&gt;
                </code>
                <p className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
                  O secret é gerado na seção Webhook acima. Retornado <strong style={{ color: "var(--dm-text-secondary)" }}>uma única vez</strong> — guarde-o imediatamente.
                </p>
              </div>
            </div>
          </div>

          {/* Processamento automático */}
          <WH_Section title="O que o servidor faz automaticamente">
            <div className="rounded-lg border divide-y overflow-hidden" style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)" }}>
              {([
                ["event_id",     "Gera um UUID v4 único se não enviado (necessário para deduplicação Meta)."],
                ["event_time",   "Usa o horário exato de recebimento (Unix segundos) se não enviado."],
                ["currency",     'Define "BRL" como padrão se não enviado junto com value.'],
                ["action_source",'Define "website" como padrão se não enviado.'],
                ["email",        "Aplica SHA-256 (trim + lowercase) antes de enviar à Meta. Nunca envie já hasheado."],
                ["phone",        "Remove todos os não-dígitos e aplica SHA-256 antes de enviar à Meta."],
                ["name",         "Hasha primeiro e último nome separadamente com SHA-256."],
                ["fingerprint",  "Gera um ID de correlação de sessão: SHA-256(email) quando disponível (liga eventos do mesmo lead), ou UUID aleatório."],
              ] as [string, string][]).map(([field, desc]) => (
                <div key={field} className="flex gap-3 px-2.5 py-2">
                  <code className="w-28 flex-shrink-0 text-[10px] font-semibold self-start mt-0.5" style={{ color: "#05CD99" }}>{field}</code>
                  <p className="text-[10px] leading-snug" style={{ color: "var(--dm-text-secondary)" }}>{desc}</p>
                </div>
              ))}
            </div>
          </WH_Section>

          {/* Campos — Identidade */}
          <WH_Section title="Campos do body — Identidade do lead">
            <WH_FieldTable fields={WH_FIELDS_IDENTIDADE} />
          </WH_Section>

          {/* Campos — Evento */}
          <WH_Section title="Campos do body — Dados do evento">
            <WH_FieldTable fields={WH_FIELDS_EVENTO} />
          </WH_Section>

          {/* Campos — Valor */}
          <WH_Section title="Campos do body — Valor monetário">
            <WH_FieldTable fields={WH_FIELDS_VALOR} />
          </WH_Section>

          {/* Campos — UTMs */}
          <WH_Section title="Campos do body — UTMs / Origem de tráfego">
            <p className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
              Salvo no histórico de tracking. Ferramentas como Typeform permitem passar UTMs via hidden fields; inclua-os no payload para manter a rastreabilidade completa.
            </p>
            <WH_FieldTable fields={WH_FIELDS_UTM} />
          </WH_Section>

          {/* Campos — Extra */}
          <WH_Section title="Campos do body — Dados extras">
            <WH_FieldTable fields={WH_FIELDS_EXTRA} />
            <p className="text-[9px]" style={{ color: "var(--dm-text-tertiary)" }}><span style={{ color: "#ef4444" }}>*</span> obrigatório</p>
          </WH_Section>

          {/* Catálogo de eventos */}
          <WH_Section title="Catálogo de eventos Meta padrão">
            <p className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
              Use qualquer nome abaixo em <code>event_name</code>. Nomes customizados também são aceitos (padrão <code>[A-Za-z][A-Za-z0-9_:-]*</code>, até 64 chars).
            </p>
            <div className="rounded-lg border divide-y overflow-hidden" style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)" }}>
              {META_EVENTS.map((e) => (
                <div key={e.name} className="flex gap-3 px-2.5 py-1.5">
                  <code className="w-44 flex-shrink-0 text-[10px] font-semibold self-start mt-0.5" style={{ color: "var(--dm-text-primary)" }}>{e.name}</code>
                  <p className="text-[10px] leading-snug" style={{ color: "var(--dm-text-secondary)" }}>{e.desc}</p>
                </div>
              ))}
            </div>
          </WH_Section>

          {/* Exemplos */}
          <WH_Section title="Exemplos de payload">
            <div className="flex gap-1.5 rounded-lg border p-1" style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)" }}>
              {(["lead", "purchase", "typeform"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setExTab(tab)}
                  className="flex-1 rounded-md px-2.5 py-1 text-[10px] font-bold transition-all"
                  style={exTab === tab
                    ? { background: "rgba(22,163,74,0.15)", color: BRAND }
                    : { color: "var(--dm-text-tertiary)" }}
                >
                  {tab === "lead" ? "Lead" : tab === "purchase" ? "Purchase" : "Typeform"}
                </button>
              ))}
            </div>
            {exTab === "typeform" && (
              <p className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
                Exemplo de mapeamento usando variáveis do Typeform (Webhooks → Body). Substitua os campos hidden por suas próprias variáveis da ferramenta.
              </p>
            )}
            <pre className="overflow-x-auto rounded-lg border px-3 py-3 text-[10px] leading-relaxed font-mono" style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)", color: "var(--dm-text-secondary)" }}>
              {exTab === "lead" ? WH_EXAMPLE_LEAD : exTab === "purchase" ? WH_EXAMPLE_PURCHASE : WH_EXAMPLE_TYPEFORM}
            </pre>
          </WH_Section>

          {/* Respostas esperadas */}
          <WH_Section title="Respostas esperadas">
            <div className="rounded-lg border divide-y overflow-hidden" style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)" }}>
              {([
                ["200", "#05CD99", '{ "received": true }',     "Evento gravado. CAPI enviado em background (falhas de CAPI não alteram o 200)."],
                ["400", "#F4A60D", '{ "error": "..." }',       'JSON inválido ou event_name ausente/fora do padrão.'],
                ["401", "#ef4444", '{ "error": "..." }',       "Header de autenticação ausente, ou webhook secret incorreto."],
                ["404", "#ef4444", '{ "error": "..." }',       "Pixel não encontrado (slug errado na URL)."],
                ["413", "#ef4444", '{ "error": "..." }',       "Payload maior que 64 KB."],
              ] as [string, string, string, string][]).map(([code, color, body, desc]) => (
                <div key={code} className="flex gap-3 px-2.5 py-2">
                  <span className="w-8 flex-shrink-0 text-[11px] font-bold self-start mt-0.5" style={{ color }}>{code}</span>
                  <div className="min-w-0 flex-1">
                    <code className="block text-[10px]" style={{ color: "var(--dm-text-secondary)" }}>{body}</code>
                    <p className="mt-0.5 text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </WH_Section>

          <div className="pt-4" />
        </div>
      </div>
    </div>
  );
}

// ─── Helpers de UI: chip, collapsible, hint ─────────────────────────────────────

type ChipTone = "ok" | "warn" | "neutral";
const CHIP_STYLE: Record<ChipTone, React.CSSProperties> = {
  ok:      { background: "rgba(5,205,153,0.12)",  color: "#05CD99" },
  warn:    { background: "rgba(244,166,13,0.14)", color: "#F4A60D" },
  neutral: { background: "rgba(100,116,139,0.14)", color: "var(--dm-text-tertiary)" },
};
function Chip({ tone, label }: { tone: ChipTone; label: string }) {
  return <span className="flex-shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold" style={CHIP_STYLE[tone]}>{label}</span>;
}

function Collapsible({ icon: Icon, title, subtitle, defaultOpen, badge, children }: {
  icon: typeof Code2; title: string; subtitle?: string; defaultOpen?: boolean;
  badge?: { tone: ChipTone; label: string }; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  return (
    <div className="rounded-xl border" style={{ borderColor: open ? BRAND : "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)" }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-3 text-left transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.03]">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg" style={{ background: "rgba(22,163,74,0.12)" }}>
          <Icon size={15} style={{ color: BRAND }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-bold" style={{ color: "var(--dm-text-primary)" }}>{title}</p>
          {subtitle && <p className="truncate text-[11.5px]" style={{ color: "var(--dm-text-tertiary)" }}>{subtitle}</p>}
        </div>
        {badge && <Chip tone={badge.tone} label={badge.label} />}
        <ChevronDown size={16} className="flex-shrink-0 transition-transform duration-200" style={{ color: "var(--dm-text-tertiary)", transform: open ? "rotate(0deg)" : "rotate(-90deg)" }} />
      </button>
      {open && <div className="space-y-3 border-t px-3.5 py-3" style={{ borderColor: "var(--dm-border-default)" }}>{children}</div>}
    </div>
  );
}

function Hint({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="inline-flex flex-col">
      <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 text-[10px] font-bold" style={{ color: "var(--dm-text-tertiary)" }}>
        <AlertTriangle size={11} style={{ color: "#F4A60D" }} /> {label}
      </button>
      {open && (
        <p className="mt-1.5 max-w-[460px] rounded-lg border p-2.5 text-[10px] leading-relaxed" style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-tertiary)" }}>
          {children}
        </p>
      )}
    </span>
  );
}
