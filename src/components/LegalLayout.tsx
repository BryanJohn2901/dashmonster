import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DashMonsterLogo } from "@/components/DashMonsterLogo";

/** Título de seção das páginas legais. Espaçamento/tipografia vêm de
 *  `.legal-prose h2` (globals.css) — aqui só o elemento semântico. */
export function H({ children }: { children: React.ReactNode }) {
  return <h2>{children}</h2>;
}

/** Moldura das páginas legais (privacidade, termos, exclusão de dados).
 *  Pública, sem login. Sóbria, herda tokens claro/escuro do app. */
export function LegalLayout({ title, updated, children }: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <main
      className="mx-auto min-h-screen w-full max-w-3xl px-6 py-16 sm:py-20"
      style={{ color: "var(--dm-text-primary)" }}
    >
      {/* Marca */}
      <Link href="/" className="inline-flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: "var(--dm-ink)" }}>
          <DashMonsterLogo size={18} className="text-[#B6F500] dark:!text-[#B6F500]" />
        </span>
        <span className="text-[17px] font-bold tracking-tight">DashMonster</span>
      </Link>

      {/* Cabeçalho do documento */}
      <header className="mt-12 mb-12">
        <h1 className="text-[34px] font-extrabold leading-tight tracking-tight sm:text-[40px]">{title}</h1>
        <p className="mt-3 text-sm" style={{ color: "var(--dm-text-tertiary)" }}>
          Última atualização: {updated}
        </p>
      </header>

      {/* Corpo — ritmo definido em .legal-prose */}
      <div className="legal-prose">{children}</div>

      {/* Rodapé — entidade + assinatura GSAStúdio */}
      <footer
        className="mt-20 flex flex-col gap-4 border-t pt-8 text-[13px] sm:flex-row sm:items-center sm:justify-between"
        style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-tertiary)" }}
      >
        <Link href="/" className="inline-flex items-center gap-1.5 font-medium transition hover:opacity-70">
          <ArrowLeft size={14} /> Voltar ao início
        </Link>
        <span>
          DashMonster · operado por GSAStúdio ·{" "}
          <a href="mailto:contato@dashmonster.com.br" className="underline underline-offset-2">
            contato@dashmonster.com.br
          </a>
        </span>
      </footer>

      <p className="mt-6 text-center text-[12px]" style={{ color: "var(--dm-text-tertiary)" }}>
        Feito pela{" "}
        <a
          href="https://gsaweb.com.br"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold underline underline-offset-2 transition hover:opacity-70"
          style={{ color: "var(--dm-text-secondary)" }}
        >
          GSAStúdio
        </a>
      </p>
    </main>
  );
}
