"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { isSupabaseConfigured, supabaseClient } from "@/lib/supabase";
import { fetchSupabaseCampaigns } from "@/utils/supabaseCampaigns";
import { classifyCampaign } from "@/utils/campaignClassifier";
import { fetchPerpetualData } from "@/utils/perpetuoApi";
import type { CampaignData, ProductCategory } from "@/types/campaign";
import type { PerpetualDashboardData } from "@/types/perpetuo";
import { ProductDashboard } from "@/components/ProductDashboard";
import { PerpetualDashboard } from "@/components/PerpetualDashboard";

const VALID_SLUGS = ["pos", "livros", "ebooks", "perpetuo", "eventos"] as const;
type ValidSlug = typeof VALID_SLUGS[number];

const SLUG_TO_CATEGORY: Record<ValidSlug, ProductCategory> = {
  pos:      "pos",
  livros:   "livros",
  ebooks:   "ebooks",
  perpetuo: "perpetuo",
  eventos:  "eventos",
};

export default function ProdutoPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug   = params?.slug ?? "";

  // Generic product state
  const [campaigns, setCampaigns]   = useState<CampaignData[]>([]);
  // Perpetuo-specific state
  const [perpetuoData, setPerpetuoData] = useState<PerpetualDashboardData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPerpetuoData = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await fetchPerpetualData();
      setPerpetuoData(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao carregar dados do perpétuo.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!VALID_SLUGS.includes(slug as ValidSlug)) {
      router.replace("/");
      return;
    }

    // Auth check
    if (!isSupabaseConfigured || !supabaseClient) {
      // Dev mode — skip auth
      if (slug === "perpetuo") {
        loadPerpetuoData().finally(() => setReady(true));
      } else {
        setReady(true);
      }
      return;
    }

    supabaseClient.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace("/");
        return;
      }

      if (slug === "perpetuo") {
        loadPerpetuoData().finally(() => setReady(true));
        return;
      }

      fetchSupabaseCampaigns()
        .then(({ campaigns: all }) => {
          const category = SLUG_TO_CATEGORY[slug as ValidSlug];
          const filtered = all.filter((c) => classifyCampaign(c.campaignName) === category);
          setCampaigns(filtered);
          setReady(true);
        })
        .catch((e: unknown) => {
          setError(e instanceof Error ? e.message : "Erro ao carregar campanhas.");
          setReady(true);
        });
    });
  }, [slug, router, loadPerpetuoData]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3" style={{ backgroundColor: "var(--dm-bg-base)" }}>
        <Loader2 size={20} className="animate-spin text-violet-500" />
        <span className="text-sm" style={{ color: "var(--dm-text-tertiary)" }}>Carregando…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-8" style={{ backgroundColor: "var(--dm-bg-base)" }}>
        <p className="text-sm text-red-500">{error}</p>
        <button
          onClick={() => router.replace("/")}
          className="rounded-lg border px-4 py-2 text-sm font-semibold hover:opacity-80"
          style={{ borderColor: "var(--dm-border-default)", color: "var(--dm-text-secondary)" }}
        >
          ← Voltar
        </button>
      </div>
    );
  }

  if (slug === "perpetuo" && perpetuoData) {
    return (
      <PerpetualDashboard
        data={perpetuoData}
        onRefresh={loadPerpetuoData}
        refreshing={refreshing}
      />
    );
  }

  return <ProductDashboard slug={slug} campaigns={campaigns} />;
}
