import type { Metadata } from "next";
import { DM_Sans, Geist_Mono, Poppins } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Toaster } from "@/components/Toaster";
import { DevtoolsGuard } from "@/components/DevtoolsGuard";

const dmSans = DM_Sans({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "DashMonster",
  description: "SPA para análise de campanhas a partir de Google Sheets.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${dmSans.variable} ${geistMono.variable} ${poppins.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <ThemeProvider>
          {/* Granulado global — opacity 0.035, quase imperceptível */}
          <div className="app-grain" aria-hidden="true" />
          <div className="app-grain-glow" aria-hidden="true" />
          {children}
          <Toaster />
          <DevtoolsGuard />
        </ThemeProvider>
      </body>
    </html>
  );
}
