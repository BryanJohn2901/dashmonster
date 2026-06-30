"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";

// ─── Date helpers (local-time, sem armadilha de UTC) ─────────────────────────────

/** YYYY-MM-DD a partir de ano/mês(1-based)/dia. */
function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseIso(s: string): { y: number; m: number; d: number } | null {
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d };
}

/** YYYY-MM-DD → DD/MM/AAAA (curto: DD/MM/AA). */
export function isoToBR(s: string, short = false): string {
  const p = parseIso(s);
  if (!p) return "";
  const yy = short ? String(p.y).slice(-2) : String(p.y);
  return `${String(p.d).padStart(2, "0")}/${String(p.m).padStart(2, "0")}/${yy}`;
}

function todayIso(): string {
  const d = new Date();
  return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function daysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function firstOfMonthIso(): string {
  const d = new Date();
  return iso(d.getFullYear(), d.getMonth() + 1, 1);
}

/** Grade do mês: células com dia (ou null pra espaços), semana começando segunda. */
function monthGrid(year: number, month: number): (number | null)[] {
  const firstDow = (new Date(year, month - 1, 1).getDay() + 6) % 7; // 0 = segunda
  const daysIn = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysIn; d++) cells.push(d);
  return cells;
}

const WEEKDAYS = ["S", "T", "Q", "Q", "S", "S", "D"];
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

interface Preset { label: string; from: () => string; to: () => string }
const PRESETS: Preset[] = [
  { label: "Hoje",    from: todayIso,         to: todayIso },
  { label: "7 dias",  from: () => daysAgoIso(6),  to: todayIso },
  { label: "15 dias", from: () => daysAgoIso(14), to: todayIso },
  { label: "30 dias", from: () => daysAgoIso(29), to: todayIso },
  { label: "Mês",     from: firstOfMonthIso,  to: todayIso },
];

// ─── DateRangePicker ─────────────────────────────────────────────────────────────

export interface DateRangePickerProps {
  from: string;                                   // YYYY-MM-DD ("" = sem início)
  to: string;                                     // YYYY-MM-DD ("" = sem fim)
  onChange: (from: string, to: string) => void;
  align?: "left" | "right";
}

export function DateRangePicker({ from, to, onChange, align = "left" }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<string | null>(null); // 1º clique aguardando o 2º
  const [hover, setHover] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Mês visível: começa no mês do "from" (ou hoje).
  const [view, setView] = useState(() => {
    const p = parseIso(from) ?? parseIso(todayIso())!;
    return { y: p.y, m: p.m };
  });

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setAnchor(null);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const cells = useMemo(() => monthGrid(view.y, view.m), [view]);

  const activePreset = PRESETS.find((p) => from && to && p.from() === from && p.to() === to);

  const shiftMonth = (delta: number) => {
    setView((v) => {
      const m0 = v.m - 1 + delta;
      return { y: v.y + Math.floor(m0 / 12), m: ((m0 % 12) + 12) % 12 + 1 };
    });
  };

  const pickDay = (day: number) => {
    const clicked = iso(view.y, view.m, day);
    if (!anchor) {
      setAnchor(clicked);
      setHover(clicked);
      return;
    }
    // 2º clique: define o range corrigindo a ordem.
    const [a, b] = anchor <= clicked ? [anchor, clicked] : [clicked, anchor];
    onChange(a, b);
    setAnchor(null);
    setHover(null);
    setOpen(false);
  };

  // Início/fim "efetivos" pra pintar o range (inclui prévia do hover enquanto escolhe).
  const effFrom = anchor ? (hover && hover < anchor ? hover : anchor) : from;
  const effTo   = anchor ? (hover && hover > anchor ? hover : anchor) : to;

  const inRange = (cellIso: string) => effFrom && effTo && cellIso >= effFrom && cellIso <= effTo;
  const isEdge  = (cellIso: string) => cellIso === effFrom || cellIso === effTo;

  const label = from
    ? `${isoToBR(from, true)} → ${to ? isoToBR(to, true) : "…"}`
    : "Selecionar período";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition hover:opacity-80"
        style={{ borderColor: open ? "var(--dm-primary)" : "var(--dm-border-default)", background: "var(--dm-bg-surface)", color: "var(--dm-text-primary)" }}
      >
        <Calendar size={13} style={{ color: "var(--dm-text-tertiary)" }} />
        {label}
        <ChevronDown size={12} style={{ color: "var(--dm-text-tertiary)", transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
      </button>

      {open && (
        <div
          className="absolute z-50 mt-1.5 flex overflow-hidden rounded-xl border shadow-xl"
          style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-surface)", [align === "right" ? "right" : "left"]: 0 }}
        >
          {/* Presets */}
          <div className="flex flex-col gap-0.5 border-r p-2" style={{ borderColor: "var(--dm-border-subtle)" }}>
            {PRESETS.map((p) => {
              const active = p.label === activePreset?.label;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => { onChange(p.from(), p.to()); setAnchor(null); setOpen(false); }}
                  className="rounded-md px-3 py-1.5 text-left text-[11px] font-semibold transition"
                  style={active
                    ? { background: "linear-gradient(135deg,#16A34A 0%,#15803D 100%)", color: "#fff" }
                    : { color: "var(--dm-text-secondary)" }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Calendário */}
          <div className="p-3" style={{ width: 248 }}>
            <div className="mb-2 flex items-center justify-between">
              <button type="button" onClick={() => shiftMonth(-1)} className="rounded p-1 transition hover:opacity-70" style={{ color: "var(--dm-text-secondary)" }}>
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs font-bold" style={{ color: "var(--dm-text-primary)" }}>
                {MONTHS[view.m - 1]} {view.y}
              </span>
              <button type="button" onClick={() => shiftMonth(1)} className="rounded p-1 transition hover:opacity-70" style={{ color: "var(--dm-text-secondary)" }}>
                <ChevronRight size={14} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {WEEKDAYS.map((w, i) => (
                <span key={i} className="py-1 text-center text-[9px] font-bold" style={{ color: "var(--dm-text-tertiary)" }}>{w}</span>
              ))}
              {cells.map((day, i) => {
                if (day === null) return <span key={i} />;
                const cellIso = iso(view.y, view.m, day);
                const edge = isEdge(cellIso);
                const mid = inRange(cellIso) && !edge;
                const isToday = cellIso === todayIso();
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => pickDay(day)}
                    onMouseEnter={() => anchor && setHover(cellIso)}
                    className="flex h-7 items-center justify-center rounded-md text-[11px] font-medium transition"
                    style={edge
                      ? { background: "linear-gradient(135deg,#16A34A 0%,#15803D 100%)", color: "#fff", fontWeight: 700 }
                      : mid
                        ? { background: "rgba(22,163,74,0.16)", color: "var(--dm-text-primary)" }
                        : { color: "var(--dm-text-secondary)", border: isToday ? "1px solid var(--dm-primary)" : "1px solid transparent" }}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            <p className="mt-2 text-center text-[10px]" style={{ color: "var(--dm-text-tertiary)" }}>
              {anchor ? "Escolha a data final" : "Clique início → fim"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
