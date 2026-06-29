"use client";

import { useEffect, useState } from "react";
import { Loader2, Save, Plus, Trash2, Star, Download, AlertTriangle, CheckCircle2, XCircle, ChevronDown, Code2, Send, Globe } from "lucide-react";
import { toast } from "@/hooks/useToast";
import {
  fetchTrackingPixels, createTrackingPixel, updateTrackingPixel, deleteTrackingPixel, setDefaultTrackingPixel, verifyMetaToken, normalizeHostname,
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
      <p className="text-[12px] leading-relaxed" style={{ color: "var(--dm-text-tertiary)" }}>
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
  const [capiToken, setCapiToken] = useState(pixel.metaCapiToken);
  const [dominio, setDominio] = useState(pixel.dominioAutorizado);
  const [testEventCode, setTestEventCode] = useState(pixel.metaTestEventCode);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [revealToken, setRevealToken] = useState(false);
  const [copied, setCopied] = useState(false);
  const [testUrl, setTestUrl] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestProxyResult | null>(null);

  const dirty =
    name !== pixel.name ||
    pixelId !== pixel.metaPixelId ||
    capiToken !== pixel.metaCapiToken ||
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
      const patch = { name: name.trim(), metaPixelId: pixelId.trim(), metaCapiToken: capiToken.trim(), dominioAutorizado: cleanDominio, metaTestEventCode: testEventCode.trim() };

      // Com Pixel ID + token preenchidos, confere com a Meta se o token autoriza
      // ESSE pixel antes de salvar — token de outro pixel é aceito pela Meta mas
      // o evento é descartado (problema silencioso). Bloqueia só em mismatch/token
      // inválido (certeza); "unknown" (não deu pra verificar) salva mesmo assim.
      let validated = false;
      if (patch.metaPixelId && patch.metaCapiToken) {
        const check = await verifyMetaToken(patch.metaPixelId, patch.metaCapiToken);
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

      await updateTrackingPixel(pixel.id, patch);
      onSaved({ ...pixel, ...patch, name: patch.name || "Pixel sem nome" });
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

  const runProxyTest = async () => {
    if (!testUrl.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/tracking/test-proxy", {
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

  const capiActive = Boolean(pixelId.trim() && capiToken.trim());
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
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Código de instalação</span>
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
          <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Testar instalação</span>
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
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>
            <Globe size={11} /> Domínio autorizado <span className="font-normal normal-case">(opcional)</span>
          </span>
          <input value={dominio} disabled={!canEdit} onChange={(e) => setDominio(e.target.value)} placeholder="meusite.com.br" className={`${inputCls} h-10 font-mono disabled:opacity-60`} style={inputStyle} />
          <span className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>Só o hostname (sem <code>https://</code>). Em branco = aceita qualquer origem.</span>
        </label>
      </Collapsible>

      {/* ── Passo 2 — Meta Conversions API (opcional) ── */}
      <Collapsible icon={Send} title="Enviar pra Meta (Conversions API)" subtitle="Opcional — dobra o sinal com o servidor" defaultOpen={capiActive} badge={capiActive ? { tone: "ok", label: "ativo" } : { tone: "neutral", label: "opcional" }}>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Pixel ID (Meta)</span>
          <input value={pixelId} disabled={!canEdit} onChange={(e) => setPixelId(e.target.value)} placeholder="123456789012345" className={`${inputCls} h-10 font-mono disabled:opacity-60`} style={inputStyle} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Token CAPI (Conversions API)</span>
          <div className="flex items-center gap-2">
            <input
              type={revealToken ? "text" : "password"}
              value={capiToken}
              disabled={!canEdit}
              onChange={(e) => setCapiToken(e.target.value)}
              placeholder="EAAxxxx…"
              className={`flex-1 ${inputCls} h-10 font-mono disabled:opacity-60`}
              style={inputStyle}
            />
            {capiToken && (
              <button type="button" onClick={() => setRevealToken((v) => !v)} className="text-[10px] font-bold" style={{ color: BRAND }}>{revealToken ? "Ocultar" : "Revelar"}</button>
            )}
          </div>
          <span className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>Gere em Events Manager → Configurações → Conversions API (não é o token da Conexão Meta).</span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Código de teste <span className="font-normal normal-case">(só durante validação)</span></span>
          <input value={testEventCode} disabled={!canEdit} onChange={(e) => setTestEventCode(e.target.value)} placeholder="TEST12345" className={`${inputCls} h-10 font-mono disabled:opacity-60`} style={inputStyle} />
          <span className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>Da aba <strong style={{ color: "var(--dm-text-secondary)" }}>Eventos de teste</strong> do Events Manager. Apague depois de validar.</span>
        </label>
      </Collapsible>

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
          <p className="text-[13px] font-bold" style={{ color: "var(--dm-text-primary)" }}>{title}</p>
          {subtitle && <p className="truncate text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>{subtitle}</p>}
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
