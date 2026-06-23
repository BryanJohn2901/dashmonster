"use client";

import { useEffect, useState } from "react";
import { Loader2, Save, Plus, Trash2, Star, Download, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "@/hooks/useToast";
import {
  fetchTrackingPixels, createTrackingPixel, updateTrackingPixel, deleteTrackingPixel, setDefaultTrackingPixel, verifyMetaToken, normalizeHostname,
  type Company, type TrackingPixel,
} from "@/hooks/useCompany";

const BRAND = "#6366C8";
const inputCls = "h-11 rounded-xl border px-3.5 text-[13px] outline-none transition focus:ring-1";
const inputStyle = { borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" } as React.CSSProperties;
const btnPrimary = "flex items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-bold text-white transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6366C8] focus-visible:ring-offset-1";
const btnPrimaryStyle = { background: "linear-gradient(135deg,#6366C8 0%,#313491 100%)" } as React.CSSProperties;

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
      <p className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>
        Cada pixel abaixo gera seu próprio código de instalação — use 1 por landing page/produto se quiser Pixel ID/domínio
        separados. Pixel próprio (PageView automático + Lead no submit) captura e mostra na aba{" "}
        <strong style={{ color: "var(--dm-text-secondary)" }}>Tracking</strong> mesmo sem nenhuma credencial da Meta.
        Com Pixel ID preenchido, o script também carrega o Pixel da Meta no navegador (fbq) e envia o mesmo evento pela
        Conversions API — os dois lados usam o mesmo <code>event_id</code>, então a Meta deduplica automaticamente em vez de contar 2x.
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
  // Caminho RELATIVO (sem origin), porque o dm-proxy.php mora no domínio do
  // PRÓPRIO cliente, nunca no dashmonster — ver download/instruções abaixo.
  const snippet = `<script src="/dm-proxy.php?ep=pixel"></script>\n<script>Tracker.init("${company.slug}", "${pixel.slug}");</script>`;

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

  return (
    <div className="space-y-3 rounded-2xl border p-4" style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)" }}>
      <div className="flex items-center gap-2">
        <input
          value={name}
          disabled={!canEdit}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome do pixel (ex: Lançamento Junho)"
          className={`flex-1 ${inputCls} h-9 font-semibold disabled:opacity-60`}
          style={inputStyle}
        />
        {pixel.isDefault && (
          <span className="flex-shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ background: "rgba(5,205,153,0.12)", color: "#05CD99" }}>
            Padrão
          </span>
        )}
      </div>

      <div className="rounded-xl border" style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-surface)" }}>
        <div className="flex items-center justify-between border-b px-3 py-1.5" style={{ borderColor: "var(--dm-border-default)" }}>
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Código de instalação</span>
          <button type="button" onClick={() => void copySnippet()} className="text-[10px] font-bold transition-opacity hover:opacity-70" style={{ color: copied ? "#05CD99" : BRAND }}>
            {copied ? "Copiado!" : "Copiar"}
          </button>
        </div>
        <pre className="overflow-x-auto px-3 py-2.5 font-mono text-[11px] leading-relaxed" style={{ color: "var(--dm-text-secondary)" }}>{snippet}</pre>
        <div className="border-t px-3 py-2.5" style={{ borderColor: "var(--dm-border-default)" }}>
          <div className="mb-2 flex items-start gap-1.5 text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
            <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" style={{ color: "#F4A60D" }} />
            <p>
              A instalação usa um arquivo pequeno (PHP) hospedado no PRÓPRIO domínio do cliente — é ele que faz o cookie de
              visitante nascer como 1ª parte e durar 400 dias, inclusive no Safari/iPhone (que corta cookie gravado por
              JavaScript pra 7 dias). Baixe abaixo, suba na raiz do site (<code>public_html/</code>) <strong>sem renomear</strong>,
              e use o snippet acima em <strong>todas</strong> as páginas do domínio. O site precisa estar em{" "}
              <strong>HTTPS</strong>. Para vários domínios, suba 1 cópia em cada um.
            </p>
          </div>
          <a
            href="/api/tracking/proxy-template"
            download="dm-proxy.php"
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition-opacity hover:opacity-80"
            style={{ borderColor: "var(--dm-border-default)", color: BRAND }}
          >
            <Download size={11} /> Baixar dm-proxy.php
          </a>

          <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--dm-border-default)" }}>
            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>
              Testar instalação (opcional)
            </span>
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
                  ["dm-proxy.php no ar e conectado ao backend", testResult.configOk, testResult.configError],
                  ["Cookie nasce 1ª parte (Set-Cookie)", testResult.cookieOk, testResult.cookieError],
                ] as [string, boolean, string | null][]).map(([label, ok, error]) => (
                  <li key={label} className="flex items-start gap-1.5">
                    {ok ? (
                      <CheckCircle2 size={12} className="mt-0.5 flex-shrink-0" style={{ color: "#05CD99" }} />
                    ) : (
                      <XCircle size={12} className="mt-0.5 flex-shrink-0" style={{ color: "#F25767" }} />
                    )}
                    <span style={{ color: ok ? "var(--dm-text-secondary)" : "#F25767" }}>
                      {label}
                      {!ok && error ? ` — ${error}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Domínio autorizado (opcional)</span>
        <input value={dominio} disabled={!canEdit} onChange={(e) => setDominio(e.target.value)} placeholder="meusite.com.br" className={`${inputCls} h-10 font-mono disabled:opacity-60`} style={inputStyle} />
        <span className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
          Só o hostname, sem protocolo nem porta (ex: <code>meusite.com.br</code>, não <code>https://meusite.com.br</code>). Em branco = aceita qualquer origem (ok pra testar).
        </span>
      </label>

      <div className="mt-1 flex items-center gap-2 border-t pt-3" style={{ borderColor: "var(--dm-border-default)" }}>
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Enviar também pra Meta Conversions API</span>
        <span className="rounded-full px-2 py-0.5 text-[9px] font-semibold" style={{ background: "rgba(100,116,139,0.12)", color: "var(--dm-text-tertiary)" }}>opcional</span>
      </div>
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
        <span className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>Diferente do token de gestão de anúncios da Conexão Meta — gere em Events Manager → Configurações → Conversions API.</span>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Código de teste (opcional — só durante validação)</span>
        <input value={testEventCode} disabled={!canEdit} onChange={(e) => setTestEventCode(e.target.value)} placeholder="TEST12345" className={`${inputCls} h-10 font-mono disabled:opacity-60`} style={inputStyle} />
        <span className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
          Cole o código da aba <strong style={{ color: "var(--dm-text-secondary)" }}>Eventos de teste</strong> do Events Manager pra ver os eventos chegando
          em tempo real (Navegador + Servidor, deduplicados). Apague depois de validar — a própria Meta recomenda não deixar isso ligado em produção.
        </span>
      </label>

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
