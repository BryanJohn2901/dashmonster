"use client";

// Rota standalone: destino do magic link do e-mail de convite. A sessão ainda
// está sendo estabelecida pelo client Supabase (troca o token da URL sozinho),
// por isso esperamos SIGNED_IN antes de mostrar os convites — mesmo padrão do
// /reset-password.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { AcceptInviteScreen } from "@/components/AcceptInviteScreen";
import { supabaseClient } from "@/lib/supabase";

export default function AceitarConvitePage() {
  const router = useRouter();
  const [ready, setReady] = useState(!supabaseClient);

  useEffect(() => {
    if (!supabaseClient) return;
    let settled = false;

    void supabaseClient.auth.getSession().then(({ data }) => {
      if (!settled && data.session) { settled = true; setReady(true); }
    });
    const { data: sub } = supabaseClient.auth.onAuthStateChange((event, session) => {
      if (session && !settled) { settled = true; setReady(true); }
      if (event === "SIGNED_OUT") router.push("/");
    });
    const timeout = setTimeout(() => { if (!settled) router.push("/"); }, 5000);

    return () => { sub.subscription.unsubscribe(); clearTimeout(timeout); };
  }, [router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3" style={{ background: "#0E1108" }}>
        <Loader2 size={22} className="animate-spin" style={{ color: "#B6F500" }} />
        <p className="text-[13.5px]" style={{ color: "#9AA388" }}>Entrando…</p>
      </div>
    );
  }

  return <AcceptInviteScreen onDone={() => router.push("/")} />;
}
