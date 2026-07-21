"use client";

import { useRef, useState } from "react";
import {
  ArrowLeft, ChevronDown, Eye, FileText, Image as ImageIcon,
  Link2, Loader2, Paperclip, Plus, Save, Trash2, Upload, Users, X,
  Download, Sparkles,
} from "lucide-react";
import {
  Attachment, COURSE_GROUPS_PRODUCT, CourseGroupId, DorSolucao, Entregavel, EntregavelItem,
  Lote, LotePagamento, PageLink, PersonaSegmento, ProductData, ProductType, SubPromessa,
  TurmaLink, emptyProduct,
} from "@/types/product";
import { parseTxtTemplate, PRODUCT_TXT_TEMPLATE, summarizeParsed } from "@/utils/parseProductTxt";
import RichTextEditor from "@/components/ui/RichTextEditor";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MAX_SIZE_MB  = 8;
const MAX_IMG_PX   = 1400;
const IMG_QUALITY  = 0.75;

/** Compress an image data-URL to JPEG ≤ MAX_IMG_PX wide */
function compressImage(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale  = Math.min(1, MAX_IMG_PX / img.width);
      const canvas = document.createElement("canvas");
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", IMG_QUALITY));
    };
    img.src = dataUrl;
  });
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = (e) => resolve(e.target!.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Attachment viewer (fullscreen overlay) ───────────────────────────────────

function AttachmentViewer({
  att, onClose,
}: { att: Attachment; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/90"
      onClick={onClose}
    >
      <div className="flex items-center justify-between px-5 py-3">
        <p className="truncate text-sm font-medium text-white/80">{att.name}</p>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
        >
          <X size={16} />
        </button>
      </div>
      <div className="flex flex-1 items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
        {att.fileType === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={att.dataUrl}
            alt={att.name}
            className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
          />
        ) : (
          <iframe
            src={att.dataUrl}
            title={att.name}
            className="h-full w-full max-w-4xl rounded-lg"
          />
        )}
      </div>
    </div>
  );
}

// ─── Attachment panel ─────────────────────────────────────────────────────────

function AttachmentPanel({
  attachments, onChange,
}: { attachments: Attachment[]; onChange: (a: Attachment[]) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [viewing, setViewing] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    setUploading(true);
    const next = [...attachments];
    for (const file of Array.from(files)) {
      const sizeMb = file.size / (1024 * 1024);
      if (sizeMb > MAX_SIZE_MB) {
        alert(`"${file.name}" excede ${MAX_SIZE_MB} MB — arquivo ignorado.`);
        continue;
      }
      const isImage = file.type.startsWith("image/");
      const isPdf   = file.type === "application/pdf";
      if (!isImage && !isPdf) continue;

      let dataUrl = await readFile(file);
      if (isImage) dataUrl = await compressImage(dataUrl);

      next.push({
        id:       crypto.randomUUID(),
        name:     file.name,
        fileType: isImage ? "image" : "pdf",
        dataUrl,
        sizeKb:   Math.round(file.size / 1024),
      });
    }
    onChange(next);
    setUploading(false);
  };

  const remove = (id: string) => onChange(attachments.filter((a) => a.id !== id));

  const totalKb = attachments.reduce((s, a) => s + a.sizeKb, 0);

  return (
    <>
      {viewing && <AttachmentViewer att={viewing} onClose={() => setViewing(null)} />}

      <div
        className="relative"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
      >
        {/* Upload area */}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed py-3 text-center transition hover:border-[color:var(--dm-primary-border)] disabled:opacity-60"
          style={{ borderColor: "var(--dm-border-default)" }}
        >
          {uploading
            ? <Loader2 size={15} className="animate-spin" style={{ color: "var(--dm-primary)" }} />
            : <Upload size={15} style={{ color: "var(--dm-text-tertiary)" }} />}
          <span className="text-[11px] font-medium" style={{ color: "var(--dm-text-tertiary)" }}>
            {uploading ? "Processando…" : "Adicionar prints / PDFs"}
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        {/* Thumbnails */}
        {attachments.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="group flex items-center gap-2 rounded-lg border border-[color:var(--dm-border-default)] bg-[var(--dm-bg-elevated)] p-1.5"
              >
                {/* Thumb */}
                <button
                  type="button"
                  onClick={() => setViewing(att)}
                  className="flex-shrink-0"
                >
                  {att.fileType === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={att.dataUrl}
                      alt={att.name}
                      className="h-10 w-10 rounded-md object-cover ring-1 ring-slate-200 transition group-hover:ring-[#16A34A]"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-red-50 ring-1 ring-red-100">
                      <FileText size={16} className="text-red-400" />
                    </div>
                  )}
                </button>

                {/* Name + size */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-semibold text-slate-700 dark:text-slate-300">{att.name}</p>
                  <p className="text-[10px] text-[color:var(--dm-text-tertiary)]">{att.sizeKb} KB</p>
                </div>

                {/* Actions */}
                <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => setViewing(att)}
                    className="flex h-6 w-6 items-center justify-center rounded text-slate-400 transition hover:bg-[#16A34A]/10 hover:text-[#16A34A]"
                    title="Visualizar"
                  >
                    <Eye size={11} />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(att.id)}
                    className="flex h-6 w-6 items-center justify-center rounded text-slate-400 transition hover:bg-red-50 hover:text-red-500"
                    title="Remover"
                  >
                    <X size={11} />
                  </button>
                </div>
              </div>
            ))}

            {/* Total size */}
            <p className="text-right text-[10px] text-slate-300 dark:text-slate-600">
              {attachments.length} arquivo{attachments.length !== 1 ? "s" : ""} · {(totalKb / 1024).toFixed(1)} MB total
            </p>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Shared input styles ──────────────────────────────────────────────────────

const cls = {
  input:    "h-9 w-full rounded-lg border px-3 text-sm outline-none transition border-[color:var(--dm-border-default)] bg-[var(--dm-bg-elevated)] text-[color:var(--dm-text-primary)] placeholder:text-[color:var(--dm-text-tertiary)] focus:border-[color:var(--dm-primary)] focus:ring-2 focus:ring-[color:var(--dm-primary-soft)]",
  textarea: "w-full resize-y rounded-lg border px-3 py-2 text-sm outline-none transition border-[color:var(--dm-border-default)] bg-[var(--dm-bg-elevated)] text-[color:var(--dm-text-primary)] placeholder:text-[color:var(--dm-text-tertiary)] focus:border-[color:var(--dm-primary)] focus:ring-2 focus:ring-[color:var(--dm-primary-soft)]",
  label:    "block text-[10px] font-bold uppercase tracking-widest text-[color:var(--dm-text-tertiary)] mb-1",
  addBtn:   "flex items-center gap-1.5 text-xs font-semibold transition text-[color:var(--dm-primary)] hover:opacity-80",
  removeBtn:"flex-shrink-0 rounded-md p-1 transition text-[color:var(--dm-text-tertiary)] hover:bg-red-500/10 hover:text-red-500",
};

const uid = () => crypto.randomUUID();

// ─── Accordion section ────────────────────────────────────────────────────────

function Section({
  title, icon: Icon, defaultOpen = false, badge, children,
}: {
  title: string; icon?: React.ElementType; defaultOpen?: boolean; badge?: string | number; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-xl border transition-colors" style={{ borderColor: "var(--dm-border-default)" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left transition hover:opacity-90"
        style={{ background: open ? "var(--dm-bg-surface)" : "var(--dm-bg-elevated)" }}
      >
        <div className="flex items-center gap-2">
          {Icon && <Icon size={12} style={{ color: "var(--dm-text-tertiary)" }} />}
          <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-secondary)" }}>{title}</span>
          {badge !== undefined && (
            <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={{ background: "var(--dm-bg-elevated)", color: "var(--dm-text-tertiary)" }}>{badge}</span>
          )}
        </div>
        <ChevronDown size={12} className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} style={{ color: "var(--dm-text-tertiary)" }} />
      </button>
      {open && (
        <div className="space-y-3 border-t p-4" style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-surface)" }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Field wrapper ────────────────────────────────────────────────────────────

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1">
        <p className={cls.label + " mb-0"}>
          {label}{required && <span className="ml-0.5" style={{ color: "var(--dm-primary)" }}>*</span>}
        </p>
        {hint && <span className="text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

// ─── Paste → lines helper ─────────────────────────────────────────────────────

/**
 * Splits pasted text into clean lines.
 * Handles: bullet symbols (•, -, *, ✅, ✔, 🎁, –, —), numbered items (1. 2.)
 * and leading/trailing whitespace. Returns only non-empty strings.
 */
function pasteToLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) =>
      l
        .replace(/^\s*[•‣◦⁃∙\-\*\–\—]\s*/, "") // bullet chars
        .replace(/^\s*\d+[\.\)]\s+/, "")                                   // numbered list
        .replace(/^[✅✔\uD83C-􏰀-\uDFFF]+\s*/u, "")    // leading emoji
        .trim()
    )
    .filter(Boolean);
}

// ─── Dynamic string list ──────────────────────────────────────────────────────

function DynamicList({
  items, onChange, placeholder, addLabel,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  addLabel?: string;
}) {
  const update = (i: number, val: string) => {
    const next = [...items]; next[i] = val; onChange(next);
  };
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const add    = () => onChange([...items, ""]);

  // Vírgula ou Enter expande em múltiplos itens
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, i: number) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const parts = items[i].split(",").map((s) => s.trim()).filter((s) => s.length > 0);
    if (parts.length <= 1) { add(); return; }
    const next = [...items];
    next.splice(i, 1, ...parts);
    onChange(next);
  };

  // Paste com múltiplas linhas → expande em itens separados
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>, i: number) => {
    const raw = e.clipboardData.getData("text");
    const lines = pasteToLines(raw);
    if (lines.length <= 1) return; // cola normal, 1 linha
    e.preventDefault();
    const next = [...items];
    next.splice(i, 1, ...lines);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex gap-2">
          <input
            value={item}
            onChange={(e) => update(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            onPaste={(e) => handlePaste(e, i)}
            placeholder={placeholder}
            className={cls.input}
          />
          <button type="button" onClick={() => remove(i)} className={cls.removeBtn}><X size={13} /></button>
        </div>
      ))}
      <button type="button" onClick={add} className={cls.addBtn}>
        <Plus size={12} /> {addLabel ?? "Adicionar"}
      </button>
    </div>
  );
}

// ─── Tags input ───────────────────────────────────────────────────────────────

function TagsInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [draft, setDraft] = useState("");

  const addRaw = (raw: string) => {
    // Split by comma OR newlines, strip bullets
    const lines = raw.includes("\n")
      ? pasteToLines(raw)
      : raw.split(",").map((s) => s.trim()).filter(Boolean);
    const newTags = lines.filter((s) => s.length > 0 && !tags.includes(s));
    if (newTags.length > 0) { onChange([...tags, ...newTags]); setDraft(""); }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const raw = e.clipboardData.getData("text");
    const lines = pasteToLines(raw);
    if (lines.length <= 1) return; // cola normal de 1 linha
    e.preventDefault();
    addRaw(raw);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.map((t) => (
          <span key={t} className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: "var(--dm-primary-soft)", color: "var(--dm-primary)" }}>
            {t}
            <button type="button" onClick={() => onChange(tags.filter((x) => x !== t))} className="opacity-60 hover:opacity-100"><X size={10} /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRaw(draft); } }}
          onPaste={handlePaste}
          placeholder="Digite e pressione Enter — use vírgula para adicionar várias"
          className={cls.input}
        />
        <button type="button" onClick={() => addRaw(draft)} className="flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600">
          <Plus size={12} /> Add
        </button>
      </div>
    </div>
  );
}

// ─── Lotes table ──────────────────────────────────────────────────────────────

const PAGAMENTO_OPTIONS: { value: LotePagamento; label: string }[] = [
  { value: "cartao",  label: "Cartão" },
  { value: "boleto",  label: "Boleto" },
  { value: "ambos",   label: "Ambos"  },
];

function LotesTable({ lotes, onChange }: { lotes: Lote[]; onChange: (l: Lote[]) => void }) {
  const update = (id: string, patch: Partial<Lote>) =>
    onChange(lotes.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const remove = (id: string) => onChange(lotes.filter((l) => l.id !== id));
  const add    = () =>
    onChange([...lotes, { id: uid(), label: `Lote ${lotes.length + 1}`, valor: "", promo: "" }]);

  return (
    <div className="space-y-2">
      {lotes.length > 0 && (
        <div className="grid grid-cols-[1fr_1fr_1fr_auto_28px] gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1 dark:text-slate-500">
          <span>Lote</span><span>Valor</span><span>Promoção</span><span>Pagamento</span><span />
        </div>
      )}
      {lotes.map((l) => (
        <div key={l.id} className="grid grid-cols-[1fr_1fr_1fr_auto_28px] gap-2 items-center">
          <input
            value={l.label}
            onChange={(e) => update(l.id, { label: e.target.value })}
            className={cls.input}
          />
          <input
            value={l.valor}
            onChange={(e) => update(l.id, { valor: e.target.value })}
            placeholder="R$ 0,00"
            className={cls.input}
          />
          <input
            value={l.promo}
            onChange={(e) => update(l.id, { promo: e.target.value })}
            placeholder="—"
            className={cls.input}
          />
          {/* Pagamento toggle */}
          <div className="flex gap-0.5 rounded-lg border p-0.5"
            style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)" }}>
            {PAGAMENTO_OPTIONS.map((opt) => {
              const active = l.pagamento === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => update(l.id, { pagamento: active ? undefined : opt.value })}
                  className="rounded-md px-2 py-1 text-[10px] font-semibold transition-all"
                  style={active
                    ? { backgroundColor: "var(--dm-brand-500)", color: "#fff" }
                    : { color: "var(--dm-text-tertiary)" }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <button type="button" onClick={() => remove(l.id)} className={cls.removeBtn}><X size={13} /></button>
        </div>
      ))}
      <button type="button" onClick={add} className={cls.addBtn}><Plus size={12} /> Adicionar lote</button>
    </div>
  );
}

// ─── Entregável block ─────────────────────────────────────────────────────────

function EntregavelBlock({
  entregaveis, onChange,
}: { entregaveis: Entregavel[]; onChange: (e: Entregavel[]) => void }) {
  const updateTitulo = (id: string, v: string) =>
    onChange(entregaveis.map((e) => (e.id === id ? { ...e, titulo: v } : e)));
  const updateItens = (id: string, itens: EntregavelItem[]) =>
    onChange(entregaveis.map((e) => (e.id === id ? { ...e, itens } : e)));
  const addItem = (id: string) =>
    updateItens(id, [...(entregaveis.find((e) => e.id === id)?.itens ?? []), { id: uid(), text: "" }]);
  const updateItem = (eid: string, iid: string, text: string) =>
    updateItens(eid, entregaveis.find((e) => e.id === eid)!.itens.map((i) => (i.id === iid ? { ...i, text } : i)));
  const removeItem = (eid: string, iid: string) =>
    updateItens(eid, entregaveis.find((e) => e.id === eid)!.itens.filter((i) => i.id !== iid));
  const remove = (id: string) => onChange(entregaveis.filter((e) => e.id !== id));
  const add    = () => onChange([...entregaveis, { id: uid(), titulo: `Entregável ${entregaveis.length + 1}`, itens: [] }]);

  // Paste com múltiplas linhas → expande os itens do bloco
  const handleItemPaste = (
    e: React.ClipboardEvent<HTMLInputElement>,
    eid: string,
    iid: string,
  ) => {
    const raw = e.clipboardData.getData("text");
    const lines = pasteToLines(raw);
    if (lines.length <= 1) return;
    e.preventDefault();
    const block = entregaveis.find((b) => b.id === eid)!;
    const idx   = block.itens.findIndex((i) => i.id === iid);
    const newItems = lines.map((l) => ({ id: uid(), text: l }));
    const next = [...block.itens];
    next.splice(idx, 1, ...newItems);
    updateItens(eid, next);
  };

  return (
    <div className="space-y-4">
      {entregaveis.map((e) => (
        <div key={e.id} className="rounded-lg border border-[color:var(--dm-border-default)] bg-[var(--dm-bg-elevated)] p-3 space-y-2">
          <div className="flex gap-2 items-center">
            <input
              value={e.titulo}
              onChange={(ev) => updateTitulo(e.id, ev.target.value)}
              placeholder="Título do entregável"
              className={`${cls.input} font-semibold`}
            />
            <button type="button" onClick={() => remove(e.id)} className={cls.removeBtn}><Trash2 size={13} /></button>
          </div>
          <div className="ml-2 space-y-1.5">
            {e.itens.map((item) => (
              <div key={item.id} className="flex gap-2 items-center">
                <input
                  value={item.text}
                  onChange={(ev) => updateItem(e.id, item.id, ev.target.value)}
                  onPaste={(ev) => handleItemPaste(ev, e.id, item.id)}
                  placeholder="Item incluído"
                  className={cls.input}
                />
                <button type="button" onClick={() => removeItem(e.id, item.id)} className={cls.removeBtn}><X size={12} /></button>
              </div>
            ))}
            <button type="button" onClick={() => addItem(e.id)} className={`${cls.addBtn} text-[11px]`}>
              <Plus size={11} /> item
            </button>
          </div>
        </div>
      ))}
      <button type="button" onClick={add} className={cls.addBtn}><Plus size={12} /> Adicionar entregável</button>
    </div>
  );
}

// ─── Dores & Soluções table ───────────────────────────────────────────────────

function DoresSolucoes({
  pairs, onChange,
}: { pairs: DorSolucao[]; onChange: (p: DorSolucao[]) => void }) {
  const update = (id: string, key: keyof DorSolucao, v: string) =>
    onChange(pairs.map((p) => (p.id === id ? { ...p, [key]: v } : p)));
  const remove = (id: string) => onChange(pairs.filter((p) => p.id !== id));
  const add    = () => onChange([...pairs, { id: uid(), dor: "", solucao: "" }]);

  return (
    <div className="space-y-1.5">
      {pairs.length > 0 && (
        <div className="grid grid-cols-[1fr_1fr_28px] gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1 dark:text-slate-500">
          <span>Dor / Objeção</span><span>Solução</span><span />
        </div>
      )}
      {pairs.map((p, i) => (
        <div key={p.id} className="grid grid-cols-[1fr_1fr_28px] gap-2 items-center">
          <input
            value={p.dor}
            onChange={(e) => update(p.id, "dor", e.target.value)}
            placeholder={`Dor ${i + 1}…`}
            className={cls.input}
          />
          <input
            value={p.solucao}
            onChange={(e) => update(p.id, "solucao", e.target.value)}
            placeholder="Solução…"
            className={cls.input}
          />
          <button type="button" onClick={() => remove(p.id)} className={cls.removeBtn}><X size={13} /></button>
        </div>
      ))}
      <button type="button" onClick={add} className={`${cls.addBtn} pt-1`}><Plus size={12} /> Adicionar par</button>
    </div>
  );
}

// ─── Turma links table ────────────────────────────────────────────────────────

function TurmaLinks({ links, onChange }: { links: TurmaLink[]; onChange: (l: TurmaLink[]) => void }) {
  const update = (id: string, key: keyof TurmaLink, v: string) =>
    onChange(links.map((l) => (l.id === id ? { ...l, [key]: v } : l)));
  const remove = (id: string) => onChange(links.filter((l) => l.id !== id));
  const add    = () =>
    onChange([...links, { id: uid(), turma: `T${links.length + 1}`, valor: "", link: "" }]);

  return (
    <div className="space-y-2">
      {links.length > 0 && (
        <div className="grid grid-cols-[80px_1fr_2fr_28px] gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1 dark:text-slate-500">
          <span>Turma</span><span>Valor</span><span>Link de pagamento</span><span />
        </div>
      )}
      {links.map((l) => (
        <div key={l.id} className="grid grid-cols-[80px_1fr_2fr_28px] gap-2 items-center">
          <input value={l.turma}  onChange={(e) => update(l.id, "turma",  e.target.value)} placeholder="T1" className={cls.input} />
          <input value={l.valor}  onChange={(e) => update(l.id, "valor",  e.target.value)} placeholder="R$" className={cls.input} />
          <input value={l.link}   onChange={(e) => update(l.id, "link",   e.target.value)} placeholder="https://…" className={cls.input} />
          <button type="button" onClick={() => remove(l.id)} className={cls.removeBtn}><X size={13} /></button>
        </div>
      ))}
      <button type="button" onClick={add} className={cls.addBtn}><Plus size={12} /> Adicionar turma</button>
    </div>
  );
}

// ─── Page links editor (capture / sales pages) ───────────────────────────────

function PageLinksEditor({
  links, onChange, addLabel, placeholder,
}: {
  links: PageLink[];
  onChange: (l: PageLink[]) => void;
  addLabel: string;
  placeholder?: string;
}) {
  const update = (id: string, key: keyof PageLink, v: string) =>
    onChange(links.map((l) => (l.id === id ? { ...l, [key]: v } : l)));
  const remove = (id: string) => onChange(links.filter((l) => l.id !== id));
  const add    = () => onChange([...links, { id: uid(), label: "", url: "" }]);

  return (
    <div className="space-y-2">
      {links.length > 0 && (
        <div className="grid grid-cols-[140px_1fr_28px] gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1 dark:text-slate-500">
          <span>Nome / Rótulo</span><span>URL</span><span />
        </div>
      )}
      {links.map((l) => (
        <div key={l.id} className="grid grid-cols-[140px_1fr_28px] gap-2 items-center">
          <input
            value={l.label}
            onChange={(e) => update(l.id, "label", e.target.value)}
            placeholder={placeholder ?? "Ex: Principal"}
            className={cls.input}
          />
          <input
            value={l.url}
            onChange={(e) => update(l.id, "url", e.target.value)}
            placeholder="https://…"
            className={cls.input}
          />
          <button type="button" onClick={() => remove(l.id)} className={cls.removeBtn}><X size={13} /></button>
        </div>
      ))}
      <button type="button" onClick={add} className={cls.addBtn}><Plus size={12} /> {addLabel}</button>
    </div>
  );
}

// ─── Persona segmentos ────────────────────────────────────────────────────────

function PersonaSegmentos({
  segments, onChange,
}: { segments: PersonaSegmento[]; onChange: (s: PersonaSegmento[]) => void }) {
  const update = (id: string, key: keyof PersonaSegmento, v: string) =>
    onChange(segments.map((s) => (s.id === id ? { ...s, [key]: v } : s)));
  const remove = (id: string) => onChange(segments.filter((s) => s.id !== id));
  const add    = () => onChange([...segments, { id: uid(), titulo: `Segmento ${segments.length + 1}`, pontos: "" }]);

  return (
    <div className="space-y-3">
      {segments.map((s) => (
        <div key={s.id} className="rounded-lg border border-[color:var(--dm-border-default)] bg-[var(--dm-bg-elevated)] p-3 space-y-2">
          <div className="flex gap-2 items-center">
            <input value={s.titulo} onChange={(e) => update(s.id, "titulo", e.target.value)} placeholder="Ex: perfil do público" className={`${cls.input} font-semibold`} />
            <button type="button" onClick={() => remove(s.id)} className={cls.removeBtn}><X size={13} /></button>
          </div>
          <textarea
            value={s.pontos}
            onChange={(e) => update(s.id, "pontos", e.target.value)}
            placeholder="Descreva os sofrimentos desse segmento…"
            rows={2}
            className={cls.textarea}
          />
        </div>
      ))}
      <button type="button" onClick={add} className={cls.addBtn}><Plus size={12} /> Adicionar segmento</button>
    </div>
  );
}

// ─── Main form component ──────────────────────────────────────────────────────

// ─── Categoria (filtro da Base) — presets + criar personalizada ────────────────

const CATEGORIA_PRESETS = ["Pós Graduação", "Imersão", "Livro", "Ebook", "Produto"];

function CategoriaField({
  value, existing, onChange,
}: { value: string; existing: string[]; onChange: (v: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const options = [...new Set([...CATEGORIA_PRESETS, ...existing, ...(value ? [value] : [])])];

  const commit = () => {
    const v = draft.trim();
    if (v) onChange(v);
    setDraft("");
    setAdding(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map((opt) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className="rounded-full px-3 py-1 text-[11px] font-semibold transition"
            style={active
              ? { background: "var(--dm-primary)", color: "#fff" }
              : { background: "var(--dm-bg-elevated)", color: "var(--dm-text-secondary)", border: "1px solid var(--dm-border-default)" }}
          >
            {opt}
          </button>
        );
      })}
      {adding ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(); }
            if (e.key === "Escape") { setAdding(false); setDraft(""); }
          }}
          onBlur={commit}
          placeholder="Nova categoria…"
          className="h-7 w-40 rounded-full border px-3 text-[11px] outline-none"
          style={{ borderColor: "var(--dm-primary)", background: "var(--dm-bg-elevated)", color: "var(--dm-text-primary)" }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 rounded-full border border-dashed px-3 py-1 text-[11px] font-semibold transition hover:border-[color:var(--dm-primary)] hover:text-[color:var(--dm-primary)]"
          style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-tertiary)" }}
        >
          <Plus size={11} /> Outra
        </button>
      )}
    </div>
  );
}

interface ProductFormProps {
  product?: ProductData | null;
  /** Categorias já usadas — sugeridas no combobox (pode-se criar uma nova digitando). */
  existingCategories?: string[];
  onSave: (p: ProductData) => void;
  onCancel: () => void;
}

export function ProductForm({ product, existingCategories = [], onSave, onCancel }: ProductFormProps) {
  const isEdit = !!product;

  // ── Tipo do produto (Pós/Imersão) ───────────────────────────────────────────
  // Não é mais uma etapa-gate: entra direto no formulário. O tipo define quais
  // campos aparecem e pode ser alternado inline — será personalizado por cliente,
  // então não faz sentido travar todo mundo numa escolha padrão antes de começar.
  const [typeChosen, setTypeChosen] = useState<ProductType>(
    isEdit ? product!.type : "pos",
  );

  // ── Form state ──────────────────────────────────────────────────────────────
  // Ao editar, mescla com emptyProduct como base para garantir que campos
  // adicionados após o produto ter sido salvo nunca fiquem como undefined.
  // Migra campos legados: paginaCaptura/paginaVendas (string) → arrays.
  const [form, setForm] = useState<Omit<ProductData, "id" | "createdAt" | "updatedAt">>(() => {
    const base = isEdit ? { ...emptyProduct(product!.type), ...product! } : emptyProduct("pos");
    if (isEdit) {
      const any = product as unknown as Record<string, unknown>;
      if (!base.paginasCaptura?.length && typeof any.paginaCaptura === "string" && any.paginaCaptura)
        base.paginasCaptura = [{ id: uid(), label: "Captura", url: any.paginaCaptura as string }];
      if (!base.paginasVenda?.length && typeof any.paginaVendas === "string" && any.paginaVendas)
        base.paginasVenda = [{ id: uid(), label: "Vendas", url: any.paginaVendas as string }];
    }
    return base;
  });

  const set = <K extends keyof typeof form>(key: K, val: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const setSub = (subs: SubPromessa[]) => set("subPromessas", subs);
  const addSub = () => setSub([...form.subPromessas, { id: uid(), text: "" }]);
  const updateSub = (id: string, text: string) =>
    setSub(form.subPromessas.map((s) => (s.id === id ? { ...s, text } : s)));
  const removeSub = (id: string) =>
    setSub(form.subPromessas.filter((s) => s.id !== id));

  const [saving, setSaving] = useState(false);

  // ── Import TXT ──────────────────────────────────────────────────────────────
  const [showImport, setShowImport]   = useState(false);
  const [importText, setImportText]   = useState("");
  const [importResult, setImportResult] = useState<string[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    const blob = new Blob([PRODUCT_TXT_TEMPLATE], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = "template-produto.txt"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setImportText(ev.target?.result as string ?? "");
    reader.readAsText(file, "utf-8");
  };

  const handleImport = () => {
    if (!importText.trim()) return;
    const parsed = parseTxtTemplate(importText);
    const summary = summarizeParsed(parsed);
    // Merge into form and set type
    const base = emptyProduct(parsed.type ?? form.type);
    setForm((prev) => ({ ...base, ...prev, ...parsed } as typeof prev));
    if (parsed.type && !isEdit) setTypeChosen(parsed.type);
    setImportResult(summary.length > 0 ? summary : ["⚠️ Nenhum campo reconhecido — verifique o formato do template."]);
  };

  const closeImport = () => {
    setShowImport(false);
    setImportText("");
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.nome.trim()) { alert("O nome do produto é obrigatório."); return; }
    setSaving(true);
    await new Promise((r) => setTimeout(r, 200)); // visual feedback
    const now = new Date().toISOString();
    const saved: ProductData = isEdit
      ? { ...product!, ...form, updatedAt: now }
      : { ...form, id: uid(), createdAt: now, updatedAt: now };
    onSave(saved);
    setSaving(false);
  };

  // ── Import overlay ───────────────────────────────────────────────────────────
  const importOverlay = showImport && (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl dark:bg-slate-800">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <Sparkles size={16} style={{ color: "var(--dm-primary)" }} />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Importar produto via TXT</h3>
          </div>
          <button onClick={closeImport} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"><X size={16} /></button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Download template */}
          <div className="flex items-center justify-between rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 dark:border-slate-600 dark:bg-slate-700/40">
            <div>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">1. Baixe o template e preencha</p>
              <p className="text-[11px] text-[color:var(--dm-text-tertiary)]">Abra no Bloco de Notas e preencha cada campo</p>
            </div>
            <button onClick={downloadTemplate} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-700 dark:bg-slate-600 dark:hover:bg-slate-500">
              <Download size={12} /> template.txt
            </button>
          </div>

          {/* Paste or upload */}
          <div>
            <p className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">2. Cole o conteúdo preenchido aqui</p>
            <textarea
              value={importText}
              onChange={(e) => { setImportText(e.target.value); setImportResult(null); }}
              placeholder="Cole o conteúdo do template.txt aqui..."
              rows={8}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono text-slate-800 outline-none transition focus:border-[color:var(--dm-primary)] focus:ring-2 focus:ring-[color:var(--dm-primary-soft)] dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
            />
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-[11px] text-slate-400">ou</span>
              <label className="cursor-pointer text-[11px] font-medium text-[color:var(--dm-primary)] hover:underline">
                carregar arquivo .txt
                <input ref={fileInputRef} type="file" accept=".txt,text/plain" className="hidden" onChange={handleFileUpload} />
              </label>
            </div>
          </div>

          {/* Result summary */}
          {importResult && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800 dark:bg-emerald-900/20">
              <p className="mb-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">Campos identificados:</p>
              <ul className="space-y-0.5">
                {importResult.map((r, i) => (
                  <li key={i} className="text-[11px] text-emerald-700 dark:text-emerald-300">{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-700">
          <button onClick={closeImport} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300">
            Cancelar
          </button>
          {!importResult ? (
            <button
              onClick={handleImport}
              disabled={!importText.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-hover disabled:opacity-40"
            >
              <Sparkles size={12} /> Analisar e Preencher
            </button>
          ) : (
            <button
              onClick={closeImport}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700"
            >
              ✓ Aplicado — Continuar editando
            </button>
          )}
        </div>
      </div>
    </div>
  );

  const isPos = form.type === "pos";

  return (
    <div className="flex flex-col">
      {importOverlay}

      {/* ── Top bar — flutuante e arredondada (sem slab full-bleed) ──────────── */}
      <div className="sticky top-3 z-20 mx-3 mt-3 flex items-center justify-between gap-3 rounded-2xl border px-4 py-2.5 shadow-sm backdrop-blur-md lg:mx-4" style={{ borderColor: "var(--dm-border-default)", background: "color-mix(in srgb, var(--dm-bg-surface) 85%, transparent)" }}>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="flex h-7 w-7 items-center justify-center rounded-lg border transition hover:opacity-80"
            style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}
          >
            <ArrowLeft size={14} />
          </button>
          <div className="flex items-center gap-2">
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ background: "var(--dm-primary-soft)", color: "var(--dm-primary)" }}>
              {form.categoria?.trim() || (isPos ? "Pós" : "Imersão")}
            </span>
            <p className="text-sm font-semibold truncate max-w-xs" style={{ color: "var(--dm-text-primary)" }}>
              {form.nome || (isEdit ? "Editar produto" : "Novo produto")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition hover:border-[color:var(--dm-primary-border)] hover:text-[color:var(--dm-primary)]"
            style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-elevated)", color: "var(--dm-text-secondary)" }}
          >
            <Sparkles size={12} style={{ color: "var(--dm-primary)" }} /> TXT
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-hover disabled:opacity-60"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>

      {/* ── Form body ───────────────────────────────────────────────────────── */}
      <div className="flex gap-6 p-4 lg:p-6 max-w-[1400px] mx-auto w-full">

        {/* Left — attachments panel */}
        <aside className="hidden w-48 flex-shrink-0 xl:block">
          <div className="sticky top-[72px]">
            <div className="mb-2 flex items-center gap-1.5">
              <Paperclip size={12} className="text-slate-400" />
              <p className={cls.label + " mb-0"}>Referências</p>
              {form.attachments.length > 0 && (
                <span className="ml-auto rounded-full bg-[#16A34A]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#15803D]">
                  {form.attachments.length}
                </span>
              )}
            </div>
            <p className="mb-3 text-[10px] text-slate-400 leading-relaxed dark:text-slate-500">
              Suba prints ou PDFs do Milanote para usar como referência enquanto preenche
            </p>
            <AttachmentPanel
              attachments={form.attachments}
              onChange={(a) => set("attachments", a)}
            />
          </div>
        </aside>

        {/* Right — form fields */}
        <div className="min-w-0 flex-1 space-y-3 max-w-4xl">

          {/* ══ REFERÊNCIAS — mobile only (hidden on xl where left panel shows) ══ */}
          <div className="xl:hidden">
            <Section title="Referências (prints / PDFs)" icon={Paperclip} defaultOpen={false}>
              <p className="text-xs text-[color:var(--dm-text-tertiary)]">
                Suba prints do Milanote ou PDFs para usar como referência enquanto preenche os campos
              </p>
              <AttachmentPanel
                attachments={form.attachments}
                onChange={(a) => set("attachments", a)}
              />
            </Section>
          </div>

          {/* ══ IDENTIDADE (always open) ══ */}
          <div className="rounded-xl border border-[color:var(--dm-border-default)] bg-[var(--dm-bg-surface)] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-secondary)" }}>Identidade do produto</p>
              {/* Modelo de CAMPOS (layout) — separado da categoria/filtro */}
              <div className="flex items-center gap-1.5" title="Define quais campos aparecem no formulário">
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dm-text-tertiary)" }}>Campos</span>
                <div className="flex gap-0.5 rounded-lg p-0.5" style={{ background: "var(--dm-bg-elevated)" }}>
                  {([["pos", "Completo"], ["imersao", "Enxuto"]] as [ProductType, string][]).map(([t, label]) => {
                    const active = form.type === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => set("type", t)}
                        className="rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-all"
                        style={active
                          ? { background: "var(--dm-bg-surface)", color: "var(--dm-primary)", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }
                          : { color: "var(--dm-text-tertiary)" }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <Field label="Categoria" hint="é o filtro que agrupa o produto na Base — clique numa ou crie a sua">
              <CategoriaField
                value={form.categoria ?? ""}
                existing={existingCategories}
                onChange={(v) => set("categoria", v)}
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nome do produto" required>
                <input
                  value={form.nome}
                  onChange={(e) => set("nome", e.target.value)}
                  placeholder="Ex: nome do produto"
                  className={cls.input}
                />
              </Field>
              <Field label="Expert / Autor">
                <input
                  value={form.expert}
                  onChange={(e) => set("expert", e.target.value)}
                  placeholder="Prof. Nome Sobrenome"
                  className={cls.input}
                />
              </Field>
            </div>

            <Field label="Promessa principal" required>
              <textarea
                value={form.promessa}
                onChange={(e) => set("promessa", e.target.value)}
                placeholder="A grande transformação que o produto entrega…"
                rows={2}
                className={cls.textarea + " min-h-[56px]"}
              />
            </Field>

            <Field label="Sub-promessas" required>
              <div className="space-y-2">
                {form.subPromessas.map((s, i) => (
                  <div key={s.id} className="flex gap-2">
                    <input
                      value={s.text}
                      onChange={(e) => updateSub(s.id, e.target.value)}
                      placeholder={`Sub-promessa ${i + 1}`}
                      className={cls.input}
                    />
                    {form.subPromessas.length > 1 && (
                      <button type="button" onClick={() => removeSub(s.id)} className={cls.removeBtn}><X size={13} /></button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={addSub} className={cls.addBtn}>
                  <Plus size={12} /> Adicionar sub-promessa
                </button>
              </div>
            </Field>
          </div>

          {/* ══ EQUIPE ══ */}
          <Section title="Equipe" defaultOpen={false}>
            <div className="space-y-4">
              {/* Produção */}
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-600">Produção</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Co-produtores">
                    <input value={form.coProdutores} onChange={(e) => set("coProdutores", e.target.value)} placeholder="Nomes separados por vírgula" className={cls.input} />
                  </Field>
                  <Field label="Coordenador do Pós">
                    <input value={form.coordenador} onChange={(e) => set("coordenador", e.target.value)} placeholder="Nome do coordenador" className={cls.input} />
                  </Field>
                  <Field label="Debate do produto">
                    <input value={form.debateProduto} onChange={(e) => set("debateProduto", e.target.value)} placeholder="Responsável pelo debate" className={cls.input} />
                  </Field>
                  {isPos && (
                    <Field label="Prof. demais slides">
                      <input value={form.profSlides} onChange={(e) => set("profSlides", e.target.value)} placeholder="Nomes" className={cls.input} />
                    </Field>
                  )}
                </div>
              </div>

              {/* Marketing & Tráfego */}
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-600">Marketing & Tráfego</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Head de Marketing">
                    <input value={form.headMarketing} onChange={(e) => set("headMarketing", e.target.value)} placeholder="Nome" className={cls.input} />
                  </Field>
                  <Field label="Líder de Lançamentos">
                    <input value={form.liderLancamentos} onChange={(e) => set("liderLancamentos", e.target.value)} placeholder="Nome" className={cls.input} />
                  </Field>
                  <Field label="Gestor de Tráfego">
                    <input value={form.gestorTrafego} onChange={(e) => set("gestorTrafego", e.target.value)} placeholder="Nome" className={cls.input} />
                  </Field>
                  <Field label="Social Media">
                    <input value={form.socialMedia} onChange={(e) => set("socialMedia", e.target.value)} placeholder="Nome" className={cls.input} />
                  </Field>
                </div>
              </div>

              {/* Criação */}
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-600">Criação</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Designer">
                    <input value={form.designer} onChange={(e) => set("designer", e.target.value)} placeholder="Nome" className={cls.input} />
                  </Field>
                  <Field label="Editor de Vídeo">
                    <input value={form.editorVideo} onChange={(e) => set("editorVideo", e.target.value)} placeholder="Nome" className={cls.input} />
                  </Field>
                  <Field label="Web Designer">
                    <input value={form.webDesigner} onChange={(e) => set("webDesigner", e.target.value)} placeholder="Nome" className={cls.input} />
                  </Field>
                </div>
              </div>
            </div>
          </Section>

          {/* ══ PALAVRAS-CHAVE ══ */}
          <Section title="Palavras-chave" badge={form.palavrasChave.length || undefined}>
            <Field label="Tags do produto">
              <TagsInput tags={form.palavrasChave} onChange={(t) => set("palavrasChave", t)} />
            </Field>
          </Section>

          {/* ══ AVATAR ══ */}
          <Section title="Avatar & Posicionamento">
            <Field label="Descrição do avatar / do produto">
              <RichTextEditor
                value={form.descricaoAvatar}
                onChange={(html) => set("descricaoAvatar", html)}
                placeholder="Quem é o aluno ideal? O que ele sente, deseja e teme? Como o produto transforma a vida dele?"
                minHeight={160}
              />
            </Field>
          </Section>

          {/* ══ PROPOSTA DE VALOR ══ */}
          <Section title={isPos ? "Proposta de Valor & Aula Inaugural" : "Tema da Imersão"}>
            {isPos ? (
              <>
                <Field label="O que o aluno vai aprender">
                  <DynamicList
                    items={form.oQueVaiAprender}
                    onChange={(v) => set("oQueVaiAprender", v)}
                    placeholder="Ex: tema ou módulo do produto"
                    addLabel="Adicionar item"
                  />
                </Field>
                <Field label="Tema da Aula Inaugural (para promover a imersão)">
                  <textarea
                    value={form.temaAulaInaugural}
                    onChange={(e) => set("temaAulaInaugural", e.target.value)}
                    placeholder="Ex: promessa principal do produto…"
                    rows={3}
                    className={cls.textarea}
                  />
                </Field>
              </>
            ) : (
              <Field label="Tema e descrição da imersão">
                <textarea
                  value={form.temaImersao}
                  onChange={(e) => set("temaImersao", e.target.value)}
                  placeholder="Qual é o tema central? O que os participantes vão vivenciar?"
                  rows={4}
                  className={cls.textarea}
                />
              </Field>
            )}
          </Section>

          {/* ══ PRECIFICAÇÃO ══ */}
          <Section title="Precificação">
            <Field label="Valor base">
              <input
                value={form.valorBase}
                onChange={(e) => set("valorBase", e.target.value)}
                placeholder="R$ 0,00"
                className={`${cls.input} max-w-xs`}
              />
            </Field>
            <Field label="Lotes e promoções">
              <LotesTable lotes={form.lotes} onChange={(l) => set("lotes", l)} />
            </Field>
          </Section>

          {/* ══ ENTREGÁVEIS & BÔNUS — pos only ══ */}
          {isPos && (
            <Section title="Entregáveis & Bônus" badge={form.entregaveis.length + form.bonus.length || undefined}>
              <Field label="Entregáveis">
                <EntregavelBlock entregaveis={form.entregaveis} onChange={(e) => set("entregaveis", e)} />
              </Field>
              <Field label="Bônus">
                <DynamicList
                  items={form.bonus}
                  onChange={(b) => set("bonus", b)}
                  placeholder="Ex: Apostila exclusiva"
                  addLabel="Adicionar bônus"
                />
              </Field>
            </Section>
          )}

          {/* ══ PÚBLICO-ALVO ══ */}
          <Section title="Público-Alvo" badge={form.sofrimentoPersona.length || undefined}>
            <Field label="Para quem é">
              <RichTextEditor
                value={form.paraQuemE}
                onChange={(html) => set("paraQuemE", html)}
                placeholder="Descreva o público ideal — profissão, estágio de carreira, objetivos…"
                minHeight={120}
              />
            </Field>
            <Field label="Sofrimento da persona (por segmento)">
              <PersonaSegmentos
                segments={form.sofrimentoPersona}
                onChange={(s) => set("sofrimentoPersona", s)}
              />
            </Field>
          </Section>

          {/* ══ DORES & SOLUÇÕES ══ */}
          <Section title="Dores & Soluções" badge={form.doresESolucoes.length || undefined}>
            <DoresSolucoes
              pairs={form.doresESolucoes}
              onChange={(p) => set("doresESolucoes", p)}
            />
          </Section>

          {/* ══ RECEITA TÉCNICA — pos only ══ */}
          {isPos && (
            <Section title="Receita Técnica">
              <Field label="Descrição técnica do produto">
                <RichTextEditor
                  value={form.receitaTecnica}
                  onChange={(html) => set("receitaTecnica", html)}
                  placeholder="Aqui vai a receita técnica completa do produto — módulos, carga horária, metodologia…"
                  minHeight={180}
                />
              </Field>
            </Section>
          )}

          {/* ══ LINKS DE VENDA ══ */}
          <Section title="Links de Venda" icon={Link2}>
            <Field label="Links de pagamento por turma">
              <TurmaLinks links={form.linksVenda} onChange={(l) => set("linksVenda", l)} />
            </Field>
            <Field label="Páginas de Captura">
              <PageLinksEditor
                links={form.paginasCaptura}
                onChange={(l) => set("paginasCaptura", l)}
                addLabel="Adicionar página de captura"
                placeholder="Ex: Principal"
              />
            </Field>
            <Field label="Páginas de Venda">
              <PageLinksEditor
                links={form.paginasVenda}
                onChange={(l) => set("paginasVenda", l)}
                addLabel="Adicionar página de venda"
                placeholder="Ex: Principal"
              />
            </Field>
          </Section>

          {/* ══ VINCULAÇÃO ══ */}
          <Section title="Vinculação ao Curso / Turma" icon={Users}>
            <p className="text-xs text-[color:var(--dm-text-tertiary)]">Opcional — vincule este produto a um curso e turma específicos para cruzar com os dados das campanhas</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Curso vinculado">
                <select
                  value={form.courseGroup ?? ""}
                  onChange={(e) => set("courseGroup", (e.target.value as CourseGroupId) || undefined)}
                  className={cls.input}
                >
                  <option value="">— Nenhum —</option>
                  {COURSE_GROUPS_PRODUCT.map((g) => (
                    <option key={g.id} value={g.id}>{g.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Turma vinculada">
                <input
                  value={form.turmaVinculada ?? ""}
                  onChange={(e) => set("turmaVinculada", e.target.value || undefined)}
                  placeholder="Ex: Turma 5, T3…"
                  className={cls.input}
                />
              </Field>
            </div>
          </Section>

          {/* Bottom save */}
          <div className="flex justify-end gap-3 pt-2 pb-6">
            <button type="button" onClick={onCancel} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700">
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-hover disabled:opacity-60"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? "Salvando…" : "Salvar produto"}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
