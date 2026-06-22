"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Segmento ESTÁTICO `perpetuo` ganha do dinâmico `[slug]` no Next — então o
// atalho "Perpétuo" da sidebar (ainda sem dashboard de verdade) cai aqui, numa
// tela de "em obras" engraçada, em vez de quebrar tentando achar o produto.
const FRASES = [
  "Os macaco programador ainda tá batendo pedra nesse dashboard.",
  "Perpétuo? Mais pra 'perpetuamente em desenvolvimento'.",
  "Tá quase. (É mentira, mas soa bem.)",
  "Café acabou. Feature pausada.",
  "Essa parte do app fugiu pra caçar mamute. Volta já já.",
];

export default function PerpetuoEmObras() {
  const [frase, setFrase] = useState(FRASES[0]);

  // Troca a frase a cada clique no monstro — pura diversão.
  const [bracos, setBracos] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setBracos((b) => !b), 600);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center"
      style={{ background: "var(--dm-bg-page)", color: "var(--dm-text-primary)" }}
    >
      <div className="select-none text-[110px] leading-none" style={{ transform: bracos ? "rotate(-6deg)" : "rotate(6deg)" }}>
        🦖
      </div>

      <h1 className="text-2xl font-extrabold" style={{ fontFamily: "var(--font-poppins)" }}>
        Obra em andamento 🚧
      </h1>

      <p className="max-w-md text-sm" style={{ color: "var(--dm-text-secondary)" }}>
        O Dashboard <strong>Perpétuo</strong> ainda tá no forno.
      </p>

      <button
        type="button"
        onClick={() => setFrase(FRASES[Math.floor(Math.random() * FRASES.length)])}
        className="max-w-md rounded-xl border px-4 py-3 text-[13px] italic transition hover:opacity-80"
        style={{ borderColor: "var(--dm-border-default)", background: "var(--dm-bg-elevated)", color: "var(--dm-text-tertiary)" }}
      >
        “{frase}”
        <span className="mt-1 block text-[10px] not-italic" style={{ color: "var(--dm-text-tertiary)" }}>
          (clica pra outra desculpa)
        </span>
      </button>

      <Link
        href="/"
        className="rounded-xl px-5 py-2.5 text-[13px] font-bold text-white transition hover:opacity-90"
        style={{ background: "linear-gradient(135deg,#6366C8 0%,#313491 100%)" }}
      >
        ← Voltar pro que funciona
      </Link>
    </div>
  );
}
