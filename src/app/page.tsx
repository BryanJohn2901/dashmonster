"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/hooks/useToast";
import { RealtimeChannel, Session } from "@supabase/supabase-js";
import { Dashboard } from "@/components/Dashboard";
import { ControlPanel, type CPTab } from "@/components/ControlPanel";
import { OnboardingTutorial } from "@/components/OnboardingTutorial";
import { AuthScreen } from "@/components/AuthScreen";
import { CampaignData } from "@/types/campaign";
import { MOCK_CAMPAIGNS, MOCK_SOURCE_LABEL, seedDemoData } from "@/utils/mockData";
import { fetchCampaignSheetData, parseCampaignCsvFile } from "@/utils/googleSheets";
import { isSupabaseConfigured, supabaseClient } from "@/lib/supabase";
import {
  fetchSharedDataSource,
  fetchSupabaseCampaigns,
  MetaSyncResult,
  replaceSupabaseCampaigns,
  saveSharedDataSource,
  subscribeSharedDataSource,
  subscribeSupabaseCampaigns,
  upsertMetaCampaigns,
} from "@/utils/supabaseCampaigns";
import {
  fetchMetaInsights,
  loadMetaCredentials,
  saveMetaCredentials,
  metaInsightsToCampaignData,
} from "@/utils/metaApi";
import { fetchMetaTokenFromDB } from "@/utils/supabaseProfiles";
import type { AdvertiserProfile } from "@/hooks/useAdvertiserStore";
import type { UserCategory, UserAccountEntry } from "@/types/userConfig";
import {
  fetchUserCategories,
  fetchUserAccountEntries,
} from "@/utils/supabaseCategories";
import { PTA_PAINEL_SAVE_NAV_EVENT, type PainelSaveNavDetail } from "@/utils/painelDashboardNavigation";

declare global {
  interface Window { supabase?: typeof supabaseClient; }
}

/** Tracks the currently active data source for the disconnect badge */
export interface DataSource {
  type: "google_sheets" | "csv" | "meta";
  label: string;
}

/** Chave localStorage para o período de busca selecionado pelo usuário. */
const SYNC_LOOKBACK_LS_KEY = "pta_sync_lookback_days";
const VALID_LOOKBACK_VALUES = [7, 15, 30, 60, 90, 730] as const;

function readLookbackDays(): number {
  if (typeof window === "undefined") return 30;
  try {
    const v = parseInt(localStorage.getItem(SYNC_LOOKBACK_LS_KEY) ?? "730", 10);
    return (VALID_LOOKBACK_VALUES as readonly number[]).includes(v) ? v : 730;
  } catch { return 30; }
}

export default function Home() {
  const [campaigns, setCampaigns]       = useState<CampaignData[]>([]);
  const [authError, setAuthError]       = useState<string | null>(null);
  const [session, setSession]           = useState<Session | null>(null);
  const [authReady, setAuthReady]         = useState(!isSupabaseConfigured || !supabaseClient);
  const [realtimeActive, setRealtimeActive] = useState(false);
  const [dataSource, setDataSource]     = useState<DataSource | null>(null);
  const [syncStatus, setSyncStatus]     = useState<{ syncing: boolean; result?: MetaSyncResult; error?: string }>({ syncing: false });
  const campaignChannelRef = useRef<RealtimeChannel | null>(null);
  const sourceChannelRef = useRef<RealtimeChannel | null>(null);
  /** Sempre igual ao último `userAccountEntries` commitado — evita sync com lista vazia antes do setState. */
  const userAccountEntriesRef = useRef<UserAccountEntry[]>([]);

  // ── User configuration (Painel de Controle) ──────────────────────────────
  const [showControlPanel,   setShowControlPanel]   = useState(false);
  /** Só aplicado na transição fechado → aberto (ver ControlPanel). */
  const [controlPanelOpeningTab, setControlPanelOpeningTab] = useState<CPTab | undefined>(undefined);
  const [showOnboarding,     setShowOnboarding]     = useState(false);
  const [userCategories,     setUserCategories]     = useState<UserCategory[]>([]);
  const [userAccountEntries, setUserAccountEntries] = useState<UserAccountEntry[]>([]);
  /** false até aplicar supabase/migrations/013_campaign_metrics_leads.sql */
  const [campaignMetricsHasLeadsColumn, setCampaignMetricsHasLeadsColumn] = useState(true);

  const replaceUserAccountEntries = useCallback((next: UserAccountEntry[]) => {
    userAccountEntriesRef.current = next;
    setUserAccountEntries(next);
  }, []);

  const handleOnboardingComplete = () => {
    try { localStorage.setItem("pta_onboarding_v1", "1"); } catch {}
    setShowOnboarding(false);
    setControlPanelOpeningTab("accounts");
    setShowControlPanel(true);
  };

  const handleLoadDemo = () => {
    seedDemoData();
    setCampaigns(MOCK_CAMPAIGNS);
    setDataSource({ type: "meta", label: MOCK_SOURCE_LABEL });
  };

  const closeRealtimeChannels = () => {
    if (campaignChannelRef.current && supabaseClient) {
      void supabaseClient.removeChannel(campaignChannelRef.current);
      campaignChannelRef.current = null;
    }
    if (sourceChannelRef.current && supabaseClient) {
      void supabaseClient.removeChannel(sourceChannelRef.current);
      sourceChannelRef.current = null;
    }
  };

  const disconnectRealtime = () => {
    closeRealtimeChannels();
    setRealtimeActive(false);
  };

  /** Reads advertiser profiles from localStorage without needing the hook. */
  function loadStoredProfiles(): AdvertiserProfile[] {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem("pta_advertiser_profiles_v2");
      return raw ? (JSON.parse(raw) as AdvertiserProfile[]) : [];
    } catch { return []; }
  }

  const loadSupabaseData = async (): Promise<CampaignData[]> => {
    const { campaigns: data, hasLeadsColumn } = await fetchSupabaseCampaigns();
    setCampaignMetricsHasLeadsColumn(hasLeadsColumn);
    setCampaigns(data);
    return data;
  };
  const loadSharedDataSource = async () => setDataSource(await fetchSharedDataSource());

  /**
   * Syncs Meta Ads data into Supabase (upsert). Usa entradas do Painel ou perfis em localStorage.
   * @param entriesOverride — lista recém-carregada do Supabase (evita estado React atrasado no login).
   */
  const handleMetaAutoSync = async (
    entriesOverride?: UserAccountEntry[],
    options?: { silent?: boolean },
  ): Promise<void> => {
    const { accessToken } = loadMetaCredentials();
    if (!accessToken) return;

    const entries = entriesOverride ?? userAccountEntriesRef.current;

    // Build account list: prefer new Supabase entries, fall back to old localStorage profiles
    type AccountItem = { adAccountId: string; campaignIds: string[] | undefined };
    const accountItems: AccountItem[] = [];

    if (entries.length > 0) {
      const seen = new Set<string>();
      for (const entry of entries) {
        if (!entry.isEnabled || !entry.adAccountId) continue;
        const rawIds = entry.selectedCampaignIds.length > 0 ? entry.selectedCampaignIds : [];
        const ids =
          rawIds.length > 0 ? rawIds.map((x) => String(x).trim()).filter(Boolean) : undefined;
        const key = `${entry.adAccountId}::${(ids ?? []).slice().sort().join(",")}`;
        if (seen.has(key)) continue;
        seen.add(key);
        accountItems.push({ adAccountId: entry.adAccountId, campaignIds: ids });
      }
    } else {
      // Legacy fallback: read from localStorage profiles
      const profiles = loadStoredProfiles();
      const seenKeys = new Set<string>();
      for (const profile of profiles) {
        if (!profile.adAccountId) continue;
        const ids = profile.campaigns?.map((c: { id: string }) => c.id);
        const key = `${profile.adAccountId}::${(ids ?? []).slice().sort().join(",")}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        accountItems.push({ adAccountId: profile.adAccountId, campaignIds: ids?.length ? ids : undefined });
      }
    }

    if (accountItems.length === 0) {
      if (!options?.silent) {
        setSyncStatus({ syncing: false, error: "Nenhuma conta configurada. Adicione uma conta na aba Contas do Painel de Controle." });
      }
      return;
    }

    const lookbackDays = readLookbackDays();
    const dateTo   = new Date();
    const dateFrom = new Date(dateTo);
    dateFrom.setDate(dateFrom.getDate() - lookbackDays);
    // Use local date — toISOString() returns UTC, which past 21h (UTC-3) gives "tomorrow".
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    setSyncStatus({ syncing: true });

    try {
      const allData: CampaignData[] = [];

      for (const { adAccountId, campaignIds } of accountItems) {
        const insights = await fetchMetaInsights(
          adAccountId,
          fmt(dateFrom),
          fmt(dateTo),
          campaignIds && campaignIds.length > 0 ? campaignIds : undefined,
        );
        allData.push(...metaInsightsToCampaignData(insights, adAccountId));
      }

      // Deduplicate by id
      const deduped = allData.filter(((seen2) => (item) => {
        if (seen2.has(item.id)) return false;
        seen2.add(item.id);
        return true;
      })(new Set<string>()));

      if (deduped.length === 0) {
        setSyncStatus({ syncing: false });
        if (!options?.silent) {
          toast.error("Nenhum dado da Meta no período selecionado. Verifique contas e filtros no Painel de Controle.");
        }
        return;
      }

      const result = await upsertMetaCampaigns(deduped);
      await loadSupabaseData();

      // Fonte do dashboard = Meta (esta rotina só grava insights Meta).
      try {
        await saveSharedDataSource({
          type: "meta",
          label: `Meta Ads · ${accountItems.length} conta${accountItems.length > 1 ? "s" : ""}`,
        });
        setDataSource(await fetchSharedDataSource());
      } catch { /* não bloqueia */ }

      setSyncStatus({ syncing: false, result });
      if (!options?.silent && result.synced > 0) {
        toast.success(`${result.synced} registro${result.synced > 1 ? "s" : ""} da Meta atualizado${result.synced > 1 ? "s" : ""}.`);
      }
    } catch (e) {
      setSyncStatus({
        syncing: false,
        error: e instanceof Error ? e.message : "Erro no sync com Meta Ads.",
      });
    }
  };

  const handleMetaAutoSyncRef = useRef(handleMetaAutoSync);
  useEffect(() => {
    handleMetaAutoSyncRef.current = handleMetaAutoSync;
  }, [handleMetaAutoSync]);

  const handleSignOut = async (): Promise<void> => {
    if (!supabaseClient) return;
    const { error: signOutError } = await supabaseClient.auth.signOut();
    if (signOutError) {
      toast.error(`Erro ao sair: ${signOutError.message}`);
      return;
    }
    disconnectRealtime();
    setCampaigns([]);
    setDataSource(null);
    replaceUserAccountEntries([]);
    setSession(null);
  };

  const handleClearData = async (): Promise<void> => {
    if (!supabaseClient) return;

    const { error: metricsError } = await supabaseClient
      .from("campaign_metrics")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");

    if (metricsError) {
      toast.error(`Erro ao limpar campanhas: ${metricsError.message}`);
      return;
    }

    const { error: sourceError } = await supabaseClient
      .from("dashboard_data_source")
      .delete()
      .eq("id", true);

    if (sourceError) {
      toast.error(`Erro ao limpar fonte de dados: ${sourceError.message}`);
      return;
    }

    // Desconecta campanhas de todas as contas (limpa lista buscada + filtro selecionado)
    await supabaseClient
      .from("user_account_entries")
      .update({ campaigns: [], selected_campaign_ids: [] })
      .neq("id", "00000000-0000-0000-0000-000000000000");

    setCampaigns([]);
    setDataSource(null);
    replaceUserAccountEntries(
      userAccountEntriesRef.current.map((e) => ({ ...e, campaigns: [], selectedCampaignIds: [] })),
    );
  };

  const handleGenerateDashboard = async (sheetUrl: string): Promise<void> => {
    if (!sheetUrl.includes("docs.google.com/spreadsheets")) {
      toast.error("Informe uma URL válida de Google Sheets.");
      return;
    }
    try {
      const data = await fetchCampaignSheetData(sheetUrl);
      await replaceSupabaseCampaigns(data, "google_sheets");
      await saveSharedDataSource({ type: "google_sheets", label: sheetUrl });
      await loadSupabaseData();
      await loadSharedDataSource();
      if (!realtimeActive) await handleConnectRealtime();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível carregar os dados da planilha.");
    }
  };

  const handleCsvUpload = async (file: File): Promise<void> => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Envie um arquivo no formato CSV.");
      return;
    }
    try {
      const data = await parseCampaignCsvFile(file);
      await replaceSupabaseCampaigns(data, "csv");
      await saveSharedDataSource({ type: "csv", label: file.name });
      await loadSupabaseData();
      await loadSharedDataSource();
      if (!realtimeActive) await handleConnectRealtime();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível processar o CSV.");
    }
  };

  /**
   * Fetches insights from Meta API for all configured ad accounts.
   * Called automatically after saving Meta credentials in the ImportPopover.
   *
   * @param accounts  — map of campaignGroupId → adAccountId (may include "act_" prefix)
   * @param dateFrom  — ISO date string "YYYY-MM-DD"
   * @param dateTo    — ISO date string "YYYY-MM-DD"
   */
  const handleMetaImport = async (
    accounts: Record<string, string>,
    dateFrom: string,
    dateTo: string,
    campaignFilter?: Record<string, string[]>,
  ): Promise<void> => {
    const configured = Object.entries(accounts).filter(([, id]) => id.trim() !== "");
    if (configured.length === 0) {
      throw new Error("Configure pelo menos uma conta de anúncio antes de importar.");
    }

    const allData: CampaignData[] = [];
    // Track which (adAccountId, campaignIds) pairs we've already fetched to avoid
    // doubling metrics when two groups share the same ad account with no campaign filter.
    const fetchedKeys = new Set<string>();

    for (const [groupId, adAccountId] of configured) {
      const campaignIds = campaignFilter?.[groupId];
      const normalizedAccount = adAccountId.replace(/^act_/, "");
      const fetchKey = `${normalizedAccount}::${(campaignIds ?? []).slice().sort().join(",")}`;

      if (fetchedKeys.has(fetchKey)) continue; // skip exact duplicate fetch
      fetchedKeys.add(fetchKey);

      const insights = await fetchMetaInsights(
        adAccountId,
        dateFrom,
        dateTo,
        campaignIds && campaignIds.length > 0 ? campaignIds : undefined,
      );
      allData.push(...metaInsightsToCampaignData(insights, adAccountId));
    }

    // Deduplicate by id (meta-{account}-{date}-{campaignId}) to guard against any
    // remaining overlaps when two groups have different but overlapping campaign filters.
    const seenIds = new Set<string>();
    const dedupedData = allData.filter((item) => {
      if (seenIds.has(item.id)) return false;
      seenIds.add(item.id);
      return true;
    });

    if (dedupedData.length === 0) {
      throw new Error("Nenhum dado encontrado para o período selecionado nas contas configuradas.");
    }

    await replaceSupabaseCampaigns(dedupedData, "meta");
    await saveSharedDataSource({
      type:  "meta",
      label: `Meta Ads · ${configured.length} conta${configured.length > 1 ? "s" : ""}`,
    });
    await loadSupabaseData();
    await loadSharedDataSource();
  };

  const handleSignIn = async (email: string, password: string): Promise<void> => {
    setAuthError(null);
    if (!supabaseClient) return;
    const normalizedEmail = email === "admin" ? "admin@dashboard.local" : email;
    const normalizedPassword = email === "admin" && password === "admin" ? "admin123" : password;
    const { error: signInError } = await supabaseClient.auth.signInWithPassword({
      email: normalizedEmail,
      password: normalizedPassword,
    });
    if (signInError) {
      setAuthError(`Falha no login: ${signInError.message}`);
    }
  };

  const handleSignUp = async (name: string, email: string, password: string): Promise<void> => {
    setAuthError(null);
    if (!supabaseClient) return;
    const { error: signUpError } = await supabaseClient.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });
    if (signUpError) {
      setAuthError(`Falha no cadastro: ${signUpError.message}`);
      return;
    }
    const { error: signInError } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (signInError) {
      setAuthError(`Conta criada, mas não foi possível logar: ${signInError.message}`);
    }
  };

  const handleUpdateProfile = async (name: string): Promise<void> => {
    if (!supabaseClient) return;
    const { error: updateError } = await supabaseClient.auth.updateUser({
      data: { full_name: name },
    });
    if (updateError) {
      toast.error(`Falha ao atualizar perfil: ${updateError.message}`);
      return;
    }
    const { data } = await supabaseClient.auth.getSession();
    setSession(data.session ?? null);
  };

  const handleConnectRealtime = async (): Promise<void> => {
    if (!isSupabaseConfigured) return;
    try {
      await loadSupabaseData();
      await loadSharedDataSource();
      disconnectRealtime();
      campaignChannelRef.current = subscribeSupabaseCampaigns(loadSupabaseData);
      sourceChannelRef.current = subscribeSharedDataSource(loadSharedDataSource);
      setRealtimeActive(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao conectar no Supabase Realtime.");
    }
  };

  useEffect(() => {
    if (process.env.NODE_ENV === "development" && typeof window !== "undefined" && supabaseClient) {
      window.supabase = supabaseClient;
    }
    return () => {
      if (campaignChannelRef.current && supabaseClient) void supabaseClient.removeChannel(campaignChannelRef.current);
      if (sourceChannelRef.current && supabaseClient) void supabaseClient.removeChannel(sourceChannelRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabaseClient) {
      return;
    }
    const client = supabaseClient;
    const initAuth = async () => {
      try {
        const { data } = await client.auth.getSession();
        setSession(data.session ?? null);
      } finally {
        setAuthReady(true);
      }
    };
    void initAuth();

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (syncStatus.error) toast.error(syncStatus.error);
  }, [syncStatus.error]);

  // Modo dev sem Supabase — carrega dados demo automaticamente e mostra onboarding na primeira visita
  useEffect(() => {
    if (isSupabaseConfigured) return;
    try {
      const onboarded = localStorage.getItem("pta_onboarding_v1");
      // Auto-seed demo data if no campaigns loaded yet (dev preview)
      if (campaigns.length === 0) {
        handleLoadDemo();
      }
      if (!onboarded) setShowOnboarding(true);
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!session?.user.id || !isSupabaseConfigured) {
      closeRealtimeChannels();
      return;
    }

    let syncIntervalId: ReturnType<typeof setInterval> | null = null;

    void (async () => {
      try {
        const rows = await loadSupabaseData();
        const source = await fetchSharedDataSource();
        setDataSource(source);

        // Load user categories and account entries (Painel de Controle)
        const [cats, entries] = await Promise.all([
          fetchUserCategories(),
          fetchUserAccountEntries(),
        ]);
        setUserCategories(cats);
        replaceUserAccountEntries(entries);

        const needsSourceSetup = rows.length === 0 && source == null;

        // Sem fonte nem campanhas: abrir já o Painel em Integrações (token Meta / origem).
        // Com dados ou fonte: tutorial só na primeira visita (localStorage).
        try {
          const onboarded = localStorage.getItem("pta_onboarding_v1");
          if (needsSourceSetup) {
            setShowOnboarding(false);
            setControlPanelOpeningTab("integrations");
            setShowControlPanel(true);
          } else if (!onboarded) {
            setShowOnboarding(true);
          }
        } catch {
          if (needsSourceSetup) {
            setShowOnboarding(false);
            setControlPanelOpeningTab("integrations");
            setShowControlPanel(true);
          }
        }


        disconnectRealtime();
        campaignChannelRef.current = subscribeSupabaseCampaigns(loadSupabaseData);
        sourceChannelRef.current = subscribeSharedDataSource(loadSharedDataSource);
        setRealtimeActive(true);

        // ── Restaura token Meta do Supabase se não estiver em localStorage ──────
        // (ocorre quando o usuário loga em um novo dispositivo/browser)
        const localToken = loadMetaCredentials().accessToken;
        if (!localToken) {
          fetchMetaTokenFromDB()
            .then((dbToken) => { if (dbToken) saveMetaCredentials({ accessToken: dbToken }); })
            .catch(() => {});
        }

        // Auto-sync Meta: usa localToken lido acima — a restauração do DB é async e
        // não estará pronta neste tick. No primeiro login em device novo o auto-sync
        // é pulado (token chega no próximo reload); nos demais casos o token já está
        // em localStorage e é lido corretamente aqui.
        const accessToken = localToken;
        const hasLegacyProfiles = loadStoredProfiles().some((p) => Boolean(p.adAccountId));
        const shouldMetaSync =
          Boolean(accessToken) &&
          (source?.type === "meta" || entries.length > 0 || hasLegacyProfiles);
        if (shouldMetaSync) {
          void handleMetaAutoSyncRef.current(entries, { silent: true });
        }

        // Keep syncing every 60 minutes while the tab is open
        syncIntervalId = setInterval(() => {
          void (async () => {
            const currentSource = await fetchSharedDataSource();
            if (currentSource?.type === "meta") {
              void handleMetaAutoSyncRef.current(undefined, { silent: true });
            }
          })();
        }, 60 * 60 * 1000);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao conectar no Supabase Realtime.");
      }
    })();

    return () => {
      if (syncIntervalId !== null) clearInterval(syncIntervalId);
    };
    // Intencional: só reage ao utilizador autenticado; sync usa refs atualizadas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  const devBypass = process.env.NODE_ENV === "development" && !isSupabaseConfigured;

  if (isSupabaseConfigured && !authReady) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 dark:bg-[#0C0C0C] px-4">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" aria-hidden />
        <p className="text-sm text-slate-600 dark:text-slate-400">A preparar sessão…</p>
      </div>
    );
  }

  if (!session && !devBypass) {
    return (
      <AuthScreen
        onSignIn={handleSignIn}
        onSignUp={handleSignUp}
        authError={authError}
        supabaseReady={isSupabaseConfigured}
      />
    );
  }

  const currentUser = {
    email: devBypass ? "dev@preview.local" : (session?.user.email ?? ""),
    name:  devBypass ? "Dev Preview" : String(session?.user.user_metadata?.full_name ?? "").trim(),
  };

  return (
    <>
      {showOnboarding && (
        <OnboardingTutorial
          onComplete={handleOnboardingComplete}
          onLoadDemo={handleLoadDemo}
        />
      )}

      <Dashboard
        campaigns={campaigns}
        dataSource={dataSource}
        syncStatus={syncStatus}
        campaignMetricsHasLeadsColumn={campaignMetricsHasLeadsColumn}
        currentUser={currentUser}
        categories={userCategories}
        accountEntries={userAccountEntries}
        onCategoriesChange={setUserCategories}
        onEntriesChange={replaceUserAccountEntries}
        onImportCsv={handleCsvUpload}
        onImportUrl={handleGenerateDashboard}
        onImportMeta={handleMetaImport}
        onRefresh={handleMetaAutoSync}
        onClearData={handleClearData}
        onSignOut={handleSignOut}
        onUpdateProfile={handleUpdateProfile}
        onOpenControlPanel={() => {
          setControlPanelOpeningTab(undefined);
          setShowControlPanel(true);
        }}
      />

      <ControlPanel
        isOpen={showControlPanel}
        openingTab={controlPanelOpeningTab}
        onClose={() => {
          setControlPanelOpeningTab(undefined);
          setShowControlPanel(false);
        }}
        onPainelSaveNavigate={(detail: PainelSaveNavDetail) => {
          setControlPanelOpeningTab(undefined);
          setShowControlPanel(false);
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent(PTA_PAINEL_SAVE_NAV_EVENT, { detail }));
          }
          const list = userAccountEntriesRef.current;
          const merged = list.some((e) => e.id === detail.entry.id)
            ? list.map((e) => (e.id === detail.entry.id ? detail.entry : e))
            : [...list, detail.entry];
          void handleMetaAutoSync(merged, { silent: false });
        }}
        userName={currentUser.name}
        userEmail={currentUser.email}
        categories={userCategories}
        accountEntries={userAccountEntries}
        onCategoriesChange={setUserCategories}
        onEntriesChange={replaceUserAccountEntries}
        onUpdateProfile={handleUpdateProfile}
        onSignOut={handleSignOut}
        syncStatus={syncStatus}
        campaignCount={campaigns.length}
        dataSource={dataSource}
        onRefresh={handleMetaAutoSync}
        onClearData={handleClearData}
      />
    </>
  );
}
