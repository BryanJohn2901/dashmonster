import Link from "next/link";
import { DashMonsterLogo } from "@/components/DashMonsterLogo";

/** Moldura das páginas legais (privacidade, termos, exclusão de dados).
 *  Público, sem login. Estilo sóbrio, herda tokens claro/escuro do app. */
export function LegalLayout({ title, updated, children }: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-16" style={{ color: "var(--dm-text-primary)" }}>
      <Link href="/" className="mb-10 inline-flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: "var(--dm-ink)" }}>
          <DashMonsterLogo size={18} className="text-[#B6F500] dark:!text-[#B6F500]" />
        </span>
        <span className="text-[17px] font-bold tracking-tight">DashMonster</span>
      </Link>

      <h1 className="mb-1 text-3xl font-extrabold tracking-tight">{title}</h1>
      <p className="mb-10 text-sm" style={{ color: "var(--dm-text-tertiary)" }}>
        Última atualização: {updated}
      </p>

      <div className="legal-prose flex flex-col gap-5 text-[15px] leading-relaxed" style={{ color: "var(--dm-text-secondary)" }}>
        {children}
      </div>

      <footer className="mt-16 border-t pt-6 text-[13px]" style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-tertiary)" }}>
        DashMonster · operado por [RAZÃO SOCIAL], CNPJ [CNPJ] · {" "}
        <a href="mailto:contato@dashmonster.com.br" className="underline">contato@dashmonster.com.br</a>
      </footer>
    </main>
  );
}
