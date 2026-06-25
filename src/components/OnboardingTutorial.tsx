"use client";

import { useState } from "react";
import {
  TrendingUp, Settings2, CheckCircle2, BarChart2, Target,
  Sparkles, X, ChevronRight, Database, Zap, History,
} from "lucide-react";

interface OnboardingTutorialProps {
  onComplete: () => void;
  onLoadDemo?: () => void;
}

const BRAND_GRAD = "linear-gradient(135deg, #7C3AED 0%, #7C3AED 100%)";

const SLIDES = [
  {
    emoji: "👾",
    title: "Bem-vindo ao DashMonster",
    subtitle: "A central de métricas para todas as suas campanhas de anúncio — análise completa em um só lugar.",
    features: [
      { icon: BarChart2, label: "KPIs em tempo real",     desc: "ROAS, CPA, CTR, CPC e muito mais, sempre atualizados." },
      { icon: Target,    label: "Análise por campanha",   desc: "Compare campanhas e identifique as que mais convertem." },
      { icon: Sparkles,  label: "Criativos & insights",   desc: "Veja quais criativos geram mais resultado." },
    ],
  },
  {
    emoji: "📊",
    title: "Histórico & Base de Produtos",
    subtitle: "Acompanhe a evolução de todos os seus lançamentos e gerencie seus produtos em uma base centralizada.",
    features: [
      { icon: History,  label: "Histórico de lançamentos", desc: "Compare lançamentos por ROAS, faturamento e vendas." },
      { icon: Database, label: "Base de Produtos",          desc: "Cadastre Pós-Graduações e Imersões com todos os detalhes." },
      { icon: Target,   label: "Filtro por tags",           desc: "Biomecânica, Bodybuilding, Treinamento Feminino e mais." },
    ],
  },
  {
    emoji: "⚙️",
    title: "Configure no Painel de Controle",
    subtitle: "Vincule suas contas Meta Ads, configure categorias e importe dados pelo botão ⚙️ no topo.",
    features: [
      { icon: Settings2,    label: "Contas Meta Ads",           desc: "Vincule contas de anúncio por categoria (Pós-grad., etc.)." },
      { icon: Target,       label: "Categorias personalizadas", desc: "Crie até 3 categorias com nome e emoji próprios." },
      { icon: CheckCircle2, label: "Salvo na sua conta",        desc: "Configurações ficam no Supabase — acessíveis em qualquer device." },
    ],
  },
  {
    emoji: "🚀",
    title: "Tudo pronto!",
    subtitle: "Quer explorar o dashboard agora com dados de demonstração ou conectar sua conta Meta Ads?",
    features: [],
    isLast: true,
  },
] as const;

export function OnboardingTutorial({ onComplete, onLoadDemo }: OnboardingTutorialProps) {
  const [step, setStep] = useState(0);
  const slide = SLIDES[step];
  const isLast = step === SLIDES.length - 1;

  const advance = () => {
    if (isLast) { onComplete(); return; }
    setStep(s => s + 1);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(11,20,55,0.65)", backdropFilter: "blur(6px)" }}>
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-[20px] shadow-horizon"
        style={{
          backgroundColor: "var(--dm-bg-surface)",
          border: "1px solid var(--dm-border-default)",
          animation: "dm-fade-up 0.3s ease both",
        }}
      >
        {/* Gradient top bar */}
        <div className="h-1.5 w-full" style={{ background: BRAND_GRAD }} />

        {/* Skip */}
        <button
          onClick={onComplete}
          className="absolute right-4 top-4 z-10 flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition hover:opacity-70"
          style={{ color: "var(--dm-text-tertiary)" }}
        >
          Pular <X size={12} />
        </button>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 px-5 pb-0 pt-6">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className="h-1.5 rounded-full transition-all duration-300"
              style={{
                width: i === step ? "2rem" : "0.5rem",
                background: i === step ? BRAND_GRAD : "var(--dm-border-default)",
              }}
            />
          ))}
        </div>

        {/* Content */}
        <div className="space-y-5 px-8 py-6" key={step} style={{ animation: "dm-fade-up 0.25s ease both" }}>

          {/* Emoji icon */}
          <div
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-[20px] text-3xl"
            style={{ background: "rgba(124,58,237,0.08)" }}
          >
            {slide.emoji}
          </div>

          {/* Title + subtitle */}
          <div className="text-center">
            <h2
              className="text-xl font-bold"
              style={{ color: "var(--dm-text-primary)", fontFamily: "var(--font-poppins), Poppins, sans-serif" }}
            >
              {slide.title}
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--dm-text-secondary)" }}>
              {slide.subtitle}
            </p>
          </div>

          {/* Feature list */}
          {slide.features.length > 0 && (
            <div
              className="space-y-3 rounded-[14px] border p-4"
              style={{ borderColor: "var(--dm-border-default)", backgroundColor: "var(--dm-bg-elevated)" }}
            >
              {slide.features.map(f => (
                <div key={f.label} className="flex items-start gap-3">
                  <div
                    className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full"
                    style={{ background: BRAND_GRAD }}
                  >
                    <f.icon size={13} className="text-white" />
                  </div>
                  <div>
                    <p className="text-[12px] font-semibold" style={{ color: "var(--dm-text-primary)" }}>{f.label}</p>
                    <p className="text-[11px]" style={{ color: "var(--dm-text-tertiary)" }}>{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Last slide — demo vs configurar */}
          {isLast && (
            <div className="space-y-3">
              {onLoadDemo && (
                <button
                  type="button"
                  onClick={() => { onLoadDemo(); onComplete(); }}
                  className="flex w-full items-center justify-center gap-2 rounded-[14px] py-3 text-[14px] font-bold text-white transition hover:opacity-90"
                  style={{ background: BRAND_GRAD, boxShadow: "0 4px 18px rgba(124,58,237,0.35)" }}
                >
                  <Zap size={16} />
                  Explorar com dados de demo
                </button>
              )}
              <button
                type="button"
                onClick={onComplete}
                className="flex w-full items-center justify-center gap-2 rounded-[14px] border py-3 text-[14px] font-semibold transition hover:opacity-80"
                style={{
                  borderColor: "var(--dm-border-default)",
                  color: "var(--dm-text-secondary)",
                  backgroundColor: "var(--dm-bg-elevated)",
                }}
              >
                <Settings2 size={15} />
                Conectar minha conta Meta Ads
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {!isLast && (
          <div
            className="flex items-center justify-between border-t px-8 py-4"
            style={{ borderColor: "var(--dm-border-default)" }}
          >
            {step > 0 ? (
              <button
                onClick={() => setStep(s => s - 1)}
                className="text-xs font-medium transition hover:opacity-70"
                style={{ color: "var(--dm-text-tertiary)" }}
              >
                ← Voltar
              </button>
            ) : <span />}

            <button
              onClick={advance}
              className="flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
              style={{ background: BRAND_GRAD, boxShadow: "0 4px 14px rgba(124,58,237,0.30)" }}
            >
              Próximo <ChevronRight size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
