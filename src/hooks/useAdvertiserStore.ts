"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchProfilesFromDB, saveProfilesToDB } from "@/utils/supabaseProfiles";

const STORAGE_KEY = "pta_advertiser_profiles_v2";

/** action_type to use as primary "Resultado" for this campaign */
export type ResultType =
  | "purchase"
  | "lead"
  | "onsite_conversion.lead_grouped"
  | "leadgen_grouped"
  | "omni_complete_registration"
  | "link_click";

export interface ActiveCampaign {
  id: string;
  name: string;
  resultType?: ResultType;  // configurable per campaign; auto-detected if absent
}

export interface AdvertiserProfile {
  id: string;
  name: string;
  product: string;
  adAccountId: string;
  groupId: string;
  campaigns: ActiveCampaign[];
  instagramUserId?: string;      // Meta IBA ID (e.g. "17841401234567890")
  instagramUsername?: string;    // @handle (e.g. "personaltraineracademy_")
  instagramAccountId?: string;   // Supabase UUID from instagram_accounts (set after register)
  createdAt: string;
}

// Migrate old v1 profiles (had activeCampaign: string)
function migrate(raw: unknown[]): AdvertiserProfile[] {
  return raw.map((p: unknown) => {
    const obj = p as Record<string, unknown>;
    if (obj.campaigns) return obj as unknown as AdvertiserProfile;
    const legacy = obj.activeCampaign as string | undefined;
    return {
      id:          obj.id as string,
      name:        obj.name as string,
      product:     (obj.product as string) ?? "",
      adAccountId: (obj.adAccountId as string) ?? "",
      groupId:     (obj.groupId as string) ?? "",
      campaigns:   legacy ? [{ id: legacy, name: legacy }] : [],
      createdAt:   (obj.createdAt as string) ?? new Date().toISOString(),
    };
  });
}

function loadProfiles(): AdvertiserProfile[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // try migrating from v1
      const v1 = localStorage.getItem("pta_advertiser_profiles_v1");
      if (!v1) return [];
      return migrate(JSON.parse(v1) as unknown[]);
    }
    return JSON.parse(raw) as AdvertiserProfile[];
  } catch {
    return [];
  }
}

function persist(profiles: AdvertiserProfile[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles)); } catch { /* noop */ }
  // Background Supabase sync — fire-and-forget, errors silently ignored
  saveProfilesToDB(profiles).catch(() => {});
}

export function useAdvertiserStore() {
  // Synchronous init from localStorage (same pattern as useCampaignStore) so the
  // profile list never flashes the empty-state on first render.
  const [profiles, setProfiles] = useState<AdvertiserProfile[]>(loadProfiles);

  // ── On mount: merge profiles from Supabase with localStorage ───────────────
  // Merge rule: LOCAL wins for IDs that exist in both (preserva edições feitas neste
  // device antes do DB sync confirmar); DB contribui apenas perfis ausentes no local.
  // Isso evita sobrescrever uma edição local recente com uma versão stale do Supabase
  // (que ainda não recebeu o fire-and-forget write do localStorage).
  useEffect(() => {
    fetchProfilesFromDB()
      .then((dbProfiles) => {
        if (dbProfiles.length === 0) return;
        setProfiles((local) => {
          const localIds = new Set(local.map((p) => p.id));
          // Local mantém seus IDs; DB contribui apenas os que não existem localmente
          const merged = [...local, ...dbProfiles.filter((p) => !localIds.has(p.id))];
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch {}
          return merged;
        });
      })
      .catch(() => { /* not authenticated or Supabase not configured — ignore */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addProfile = useCallback((data: Omit<AdvertiserProfile, "id" | "createdAt">) => {
    const profile: AdvertiserProfile = {
      ...data,
      id: `prof-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    setProfiles((prev) => {
      const next = [...prev, profile];
      persist(next);
      return next;
    });
    return profile;
  }, []);

  const updateProfile = useCallback((id: string, data: Partial<Omit<AdvertiserProfile, "id" | "createdAt">>) => {
    setProfiles((prev) => {
      const next = prev.map((p) => p.id === id ? { ...p, ...data } : p);
      persist(next);
      return next;
    });
  }, []);

  const deleteProfile = useCallback((id: string) => {
    setProfiles((prev) => {
      const next = prev.filter((p) => p.id !== id);
      persist(next);
      return next;
    });
  }, []);

  const addCampaignToProfile = useCallback((profileId: string, campaign: ActiveCampaign) => {
    setProfiles((prev) => {
      const next = prev.map((p) => {
        if (p.id !== profileId) return p;
        if (p.campaigns.some((c) => c.id === campaign.id)) return p;
        return { ...p, campaigns: [...p.campaigns, campaign] };
      });
      persist(next);
      return next;
    });
  }, []);

  const removeCampaignFromProfile = useCallback((profileId: string, campaignId: string) => {
    setProfiles((prev) => {
      const next = prev.map((p) =>
        p.id !== profileId ? p : { ...p, campaigns: p.campaigns.filter((c) => c.id !== campaignId) },
      );
      persist(next);
      return next;
    });
  }, []);

  return { profiles, addProfile, updateProfile, deleteProfile, addCampaignToProfile, removeCampaignFromProfile };
}
