"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/hooks/useToast";
import { useCompany, memberAllowedProducts, readCompanyBranding, fetchMyPendingInvites } from "@/hooks/useCompany";
import { AcceptInviteScreen } from "@/components/AcceptInviteScreen";
import { RealtimeChannel, Session } from "@supabase/supabase-js";
import { Dashboard } from "@/components/Dashboard";
import { ControlPanel, type CPTab } from "@/components/ControlPanel";
import { OnboardingTutorial } from "@/components/OnboardingTutorial";
import { AuthScreen } from "@/components/AuthScreen";
import { CompanySelectScreen } from "@/components/CompanySelectScreen";
import { ProductSelectScreen } from "@/components/ProductSelectScreen";
import { CampaignData } from "@/types/campaign";
import { getCompanyDataset, seedDemoData } from "@/utils/mockData";
import { fetchCampaignSheetData, parseCampaignCsvFile } from "@/utils/googleSheets";
import { isSupabaseConfigured, supabaseClient } from "@/lib/supabase";
import { authedFetch } from "@/lib/authedFetch";
import {
  fetchSharedDataSource,
  fetchSupabaseCampaigns,
  MetaSyncResult,
  SharedDataSource,
  replaceSupabaseCampaigns,
  saveSharedDataSource,
  subscribeSharedDataSource,
  subscribeSupabaseCampaigns,
  upsertMetaCampaigns,
} from "@/utils/supabaseCampaigns";
import {
  fetchMetaInsights,
  loadMetaCredentials,
  cacheMetaCredentials,
  metaInsightsToCampaignData,
} from "@/utils/metaApi";
import { fetchMetaTokenFromDB } from "@/utils/supabaseProfiles";
import type { AdvertiserProfile } from "@/hooks/useAdvertiserStore";
import type { UserCategory, UserAccountEntry } from "@/types/userConfig";
import {
  fetchUserCategories,
  fetchUserAccountEntries,
  subscribeUserConfig,
} from "@/utils/supabaseCategories";
import { PTA_PAINEL_SAVE_NAV_EVENT, type PainelSaveNavDetail } from "@/utils/painelDashboardNavigation";

declare global {
  interface Window { supabase?: typeof supabaseClient; }
}

/** Tracks the currently active data source for the disconnect badge */
export type DataSource = SharedDataSource;

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
  const router = useRouter();
  const [campaigns, setCampaigns]       = useState<CampaignData[]>([]);
  const [authError, setAuthError]       = useState<string | null>(null);
  const [session, setSession]           = useState<Session | null>(null);
  const [authReady, setAuthReady]         = useState(!isSupabaseConfigured || !supabaseClient);
  const [realtimeActive, setRealtimeActive] = useState(false);
  const [dataSource, setDataSource]     = useState<DataSource | null>(null);
  const [syncStatus, setSyncStatus]     = useState<{ syncing: boolean; result?: MetaSyncResult; error?: string }>({ syncing: false });
  const campaignChannelRef = useRef<RealtimeChannel | null>(null);
  const sourceChannelRef = useRef<RealtimeChannel | null>(null);
  const unsubscribeUserConfigRef = useRef<(() => void) | null>(null);
  /** Sempre igual ao último `userAccountEntries` commitado — evita sync com lista vazia antes do setState. */
  const userAccountEntriesRef = useRef<UserAccountEntry[]>([]);

  // ── User configuration (Painel de Controle) ──────────────────────────────
  const [showControlPanel,   setShowControlPanel]   = useState(false);
  /** Só aplicado na transição fechado → aberto (ver ControlPanel). */
  const [controlPanelOpeningTab, setControlPanelOpeningTab] = useState<CPTab | undefined>(undefined);
  const [showOnboarding,     setShowOnboarding]     = useState(false);
  const [userCategories,     setUserCategories]     = useState<UserCategory[]>([]);
  const [userAccountEntries, setUserAccountEntries] = useState<UserAccountEntry[]>([]);
  /** true enquanto carrega os dados de uma empresa recém-selecionada. */
  const [switchingCompany,   setSwitchingCompany]   = useState(false);
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

  const handleLoadDemo = (companyId?: string | null) => {
    const ds = getCompanyDataset(companyId);
    seedDemoData(companyId);
    setCampaigns(ds.campaigns);
    setDataSource({ type: "meta", label: ds.sourceLabel });
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
    try { sessionStorage.removeItem(COMPANY_CHOSEN_KEY); } catch {}
    setCompanyChosen(false);
    try { sessionStorage.removeItem(PRODUCT_CHOSEN_KEY); } catch {}
    setProductChosen(false);
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

  const handleForgotPassword = async (email: string): Promise<void> => {
    setAuthError(null);
    if (!supabaseClient) return;
    const { error: resetError } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: typeof window !== "undefined" ? `${window.location.origin}/reset-password` : undefined,
    });
    // Não vaza se o e-mail existe ou não — mensagem genérica mesmo em erro de "usuário não encontrado".
    if (resetError && !/user not found/i.test(resetError.message)) {
      setAuthError(`Falha ao enviar e-mail: ${resetError.message}`);
    }
  };

  const handleOAuth = async (provider: "google" | "github" | "discord"): Promise<void> => {
    setAuthError(null);
    if (!supabaseClient) return;
    const { error: oauthError } = await supabaseClient.auth.signInWithOAuth({
      provider,
      options: { redirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
    });
    if (oauthError) {
      setAuthError(`Falha ao entrar com ${provider}: ${oauthError.message}`);
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
      unsubscribeUserConfigRef.current?.();
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

  // Auditoria: grava 1 evento de login por sessão do browser (Painel Admin).
  useEffect(() => {
    if (!session) return;
    try {
      if (sessionStorage.getItem("dm_login_logged_v1") === "1") return;
      sessionStorage.setItem("dm_login_logged_v1", "1");
    } catch {}
    void authedFetch("/api/auth/login-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: session.user?.email ?? "",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    }).catch(() => {});
  }, [session]);

  // Modo dev sem Supabase — onboarding na primeira visita (o seed por empresa
  // é feito no effect dedicado abaixo, que reage à empresa ativa).
  useEffect(() => {
    if (isSupabaseConfigured) return;
    try {
      const onboarded = localStorage.getItem("pta_onboarding_v1");
      if (!onboarded) setShowOnboarding(true);
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Retorno do OAuth do Instagram (?ig_oauth=...): abre o Painel direto em
  // Integrações para o usuário ver o resultado e as contas conectadas.
  useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).has("ig_oauth")) {
        setShowOnboarding(false);
        setControlPanelOpeningTab("integrations");
        setShowControlPanel(true);
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Retorno do OAuth de Ads (?meta_oauth=...): mostra o resultado e limpa a URL.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const status = params.get("meta_oauth");
      if (!status) return;
      if (status === "connected") {
        const count = params.get("count");
        toast.success(`Facebook conectado! Token de anúncios atualizado em ${count ?? "todas as"} empresa(s).`);
      } else {
        toast.error(params.get("reason") ?? "Falha na conexão com o Facebook.");
      }
      params.delete("meta_oauth"); params.delete("count"); params.delete("reason");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Empresa ativa (multi-empresa / super admin) — usada para recarregar ao trocar.
  const { companyId: activeCompanyId, memberships, isSuperAdmin, loading: companyLoading, switchCompany } = useCompany();
  const companyLoadedRef = useRef<string | null>(null);

  // Dev mode (sem Supabase): cada empresa demo tem dataset próprio. Re-semeia o
  // localStorage e remonta o Dashboard (via demoKey) sempre que a empresa muda.
  const [demoKey, setDemoKey] = useState(0);
  const demoSeededRef = useRef<string | null>(null);
  useEffect(() => {
    if (isSupabaseConfigured) return;
    const cid = activeCompanyId ?? "demo-1";
    if (demoSeededRef.current === cid) return;
    demoSeededRef.current = cid;
    handleLoadDemo(cid);
    setDemoKey((k) => k + 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompanyId]);

  // Seletor de empresa pós-login: a flag de sessão zera no logout, então uma
  // nova autenticação volta a perguntar qual empresa abrir (só se houver 2+).
  const COMPANY_CHOSEN_KEY = "dm_company_chosen_v1";
  const [companyChosen, setCompanyChosen] = useState<boolean>(() => {
    try { return sessionStorage.getItem(COMPANY_CHOSEN_KEY) === "1"; } catch { return false; }
  });

  // Seletor de produto (Monster Hub): Dash vs PipeFlow, 1x por sessão.
  const PRODUCT_CHOSEN_KEY = "dm_product_chosen_v1";
  const [productChosen, setProductChosen] = useState<boolean>(() => {
    try { return sessionStorage.getItem(PRODUCT_CHOSEN_KEY) === "1"; } catch { return false; }
  });

  // Gate de convites pendentes (tela de aceitar), 1x por sessão — checa antes
  // do seletor de empresa, já que aceitar um convite pode adicionar empresa nova.
  const INVITE_GATE_KEY = "dm_invite_gate_v1";
  const [inviteGateDone, setInviteGateDone] = useState<boolean>(() => {
    try { return sessionStorage.getItem(INVITE_GATE_KEY) === "1"; } catch { return false; }
  });
  const [hasPendingInvites, setHasPendingInvites] = useState<boolean | null>(null);
  const inviteCheckedRef = useRef(false);

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

        // ── Realtime de configuração (Painel de Controle) ───────────────────────
        // Categorias/contas alteradas por qualquer membro da empresa atualizam
        // o dashboard ao vivo, sem refresh manual.
        unsubscribeUserConfigRef.current?.();
        unsubscribeUserConfigRef.current = subscribeUserConfig(() => {
          void Promise.all([fetchUserCategories(), fetchUserAccountEntries()])
            .then(([liveCats, liveEntries]) => {
              setUserCategories(liveCats);
              replaceUserAccountEntries(liveEntries);
            })
            .catch(() => {});
        });

        // ── Sincroniza token Meta da empresa ────────────────────────────────────
        // O dono configura o token uma vez e ele propaga para todos os membros.
        // Sempre busca do DB: cobre device novo E rotação de token pelo dono.
        const localToken = loadMetaCredentials().accessToken;
        fetchMetaTokenFromDB()
          .then((dbToken) => {
            if (dbToken && dbToken !== localToken) cacheMetaCredentials({ accessToken: dbToken });
          })
          .catch(() => {});

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

  // ── Trocar de empresa recarrega token + dados da nova empresa ────────────────
  // O effect principal só roda no login. Sem isto, trocar de empresa no painel
  // (super admin / multi-empresa) deixava campanhas/filtros/contas da anterior
  // em tela. Pula a 1ª passagem: o effect principal já carregou a empresa inicial.
  useEffect(() => {
    if (!activeCompanyId || !session?.user.id) return;
    if (companyLoadedRef.current === null) { companyLoadedRef.current = activeCompanyId; return; }
    if (companyLoadedRef.current === activeCompanyId) return;
    companyLoadedRef.current = activeCompanyId;

    setSwitchingCompany(true);
    void (async () => {
      try {
        // Substitui o token pelo da empresa nova SEMPRE — se ela não tem token,
        // limpa o cache (senão o token da empresa anterior vazaria pra esta).
        const dbToken = await fetchMetaTokenFromDB().catch(() => "");
        cacheMetaCredentials({ accessToken: dbToken });

        await loadSupabaseData();
        const [cats, entries] = await Promise.all([fetchUserCategories(), fetchUserAccountEntries()]);
        setUserCategories(cats);
        replaceUserAccountEntries(entries);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao trocar de empresa.");
      } finally {
        setSwitchingCompany(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompanyId]);

  const devBypass = process.env.NODE_ENV === "development" && !isSupabaseConfigured;

  // Checa convites pendentes 1x por sessão, assim que o login é confirmado.
  useEffect(() => {
    if (!session || devBypass || !isSupabaseConfigured || inviteGateDone || inviteCheckedRef.current) return;
    inviteCheckedRef.current = true;
    void fetchMyPendingInvites()
      .then((list) => setHasPendingInvites(list.length > 0))
      .catch(() => setHasPendingInvites(false));
  }, [session, devBypass, inviteGateDone]);

  if (isSupabaseConfigured && !authReady) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 dark:bg-[#0C0C0C] px-4">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-[#16A34A] border-t-transparent" aria-hidden />
        <p className="text-sm text-slate-600 dark:text-slate-400">A preparar sessão…</p>
      </div>
    );
  }

  if (!session && !devBypass) {
    return (
      <AuthScreen
        onSignIn={handleSignIn}
        onSignUp={handleSignUp}
        onOAuth={handleOAuth}
        onForgotPassword={handleForgotPassword}
        authError={authError}
        supabaseReady={isSupabaseConfigured}
      />
    );
  }

  const currentUser = {
    email: devBypass ? "dev@preview.local" : (session?.user.email ?? ""),
    name:  devBypass ? "Dev Preview" : String(session?.user.user_metadata?.full_name ?? "").trim(),
  };

  // ── Convites pendentes: aceitar/recusar antes de escolher empresa ─────────────
  if (session && isSupabaseConfigured && !devBypass && !inviteGateDone) {
    if (hasPendingInvites === null) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 dark:bg-[#0C0C0C] px-4">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-[#16A34A] border-t-transparent" aria-hidden />
          <p className="text-sm text-slate-600 dark:text-slate-400">Verificando convites…</p>
        </div>
      );
    }
    if (hasPendingInvites) {
      return (
        <AcceptInviteScreen onDone={() => {
          try { sessionStorage.setItem(INVITE_GATE_KEY, "1"); } catch {}
          setInviteGateDone(true);
        }} />
      );
    }
  }

  // ── Seletor de empresa pós-login (só com 2+ empresas, 1x por sessão) ──────────
  if (session && isSupabaseConfigured && !devBypass) {
    if (companyLoading) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 dark:bg-[#0C0C0C] px-4">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-[#16A34A] border-t-transparent" aria-hidden />
          <p className="text-sm text-slate-600 dark:text-slate-400">A carregar empresas…</p>
        </div>
      );
    }
    if (memberships.length >= 2 && !companyChosen) {
      return (
        <CompanySelectScreen
          memberships={memberships}
          activeCompanyId={activeCompanyId}
          userName={currentUser.name}
          onSelect={(id) => {
            switchCompany(id);
            try { sessionStorage.setItem(COMPANY_CHOSEN_KEY, "1"); } catch {}
            setCompanyChosen(true);
          }}
          onSignOut={handleSignOut}
        />
      );
    }
  }

  // ── Seletor de produto pós-login (Monster Hub): Dash vs PipeFlow ──────────────
  // As cards refletem o que a EMPRESA ativa contratou (liberação via /admin) —
  // inclusive pra super admin, senão a liberação não é demonstrável. Super admin
  // sem empresa ativa (ex.: recém-provisionado) vê tudo. Empresa sem "dash" fica
  // presa no hub mesmo com productChosen antigo no sessionStorage.
  // memberAllowedProducts aplica também a restrição POR MEMBRO (settings.memberProducts).
  const activeMembership = memberships.find((m) => m.company.id === activeCompanyId);
  const activeProducts = activeMembership
    ? memberAllowedProducts(activeMembership.company, currentUser.email)
    : (isSuperAdmin ? ["dash", "pipe"] : ["dash"]);
  if ((session || devBypass) && (!productChosen || !activeProducts.includes("dash"))) {
    return (
      <ProductSelectScreen
        userName={currentUser.name || currentUser.email.split("@")[0]}
        email={currentUser.email}
        companyName={activeMembership?.company.name}
        companyLogoUrl={activeMembership?.company.logoUrl}
        companyBannerUrl={readCompanyBranding(activeMembership?.company.settings).bannerUrl}
        companyDescription={readCompanyBranding(activeMembership?.company.settings).description}
        products={activeProducts}
        onOpenDash={() => {
          try { sessionStorage.setItem(PRODUCT_CHOSEN_KEY, "1"); } catch {}
          setProductChosen(true);
        }}
        onOpenPipe={() => router.push("/crm")}
        onSignOut={handleSignOut}
        onUpdateProfile={handleUpdateProfile}
        categories={userCategories}
      />
    );
  }

  // Troca de empresa: tela de loading enquanto os dados da nova empresa carregam.
  // Garante que nada da empresa anterior fica visível durante a transição.
  if (switchingCompany) {
    const switchingName = memberships.find((m) => m.company.id === activeCompanyId)?.company.name;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4"
        style={{ background: "var(--dm-bg-page)" }}>
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#16A34A] border-t-transparent" aria-hidden />
        <div className="text-center">
          <p className="text-sm font-bold" style={{ color: "var(--dm-text-primary)" }}>
            Carregando {switchingName ?? "a empresa"}…
          </p>
          <p className="mt-1 text-[12px]" style={{ color: "var(--dm-text-tertiary)" }}>
            Preparando os dados desta empresa
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {showOnboarding && (
        <OnboardingTutorial
          onComplete={handleOnboardingComplete}
          onLoadDemo={() => handleLoadDemo(activeCompanyId)}
        />
      )}

      <Dashboard
        key={`dash-${demoKey}`}
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
        onBackToWorkspace={() => {
          try { sessionStorage.removeItem(PRODUCT_CHOSEN_KEY); } catch {}
          setProductChosen(false);
        }}
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
