"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchProfilesFromDB, saveProfilesToDB } from "@/utils/supabaseProfiles";
import { useCompany } from "@/hooks/useCompany";
import { loadScoped, persistScoped } from "@/lib/companyScopedStorage";

const STORAGE_PREFIX = "gsah_advertiser_profiles_v2";
// empresa cujo cache local está ativo — persist grava sempre nela.
let activeCid: string | null = null;

/** action_type to use as primary "Resultado" for this campaign */
export type ResultType =
  | "purchase"
  | "offsite_conversion.fb_pixel_purchase"
  | "lead"
  | "offsite_conversion.fb_pixel_lead"
  | "onsite_conversion.lead_grouped"
  | "leadgen_grouped"
  | "omni_complete_registration"
  | "submit_application"
  | "schedule"
  | "contact"
  | "view_content"
  | "profile_visit"
  | "follow"
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
  instagramUsername?: string;    // @handle (ex.: "minhaempresa_")
  instagramAccountId?: string;   // Supabase UUID from instagram_accounts (set after register)
  createdAt: string;
}

function loadProfiles(): AdvertiserProfile[] {
  return loadScoped<AdvertiserProfile[]>(STORAGE_PREFIX, activeCid, []);
}

function persist(profiles: AdvertiserProfile[]): void {
  persistScoped(STORAGE_PREFIX, activeCid, profiles);
  // Background Supabase sync — fire-and-forget, errors silently ignored.
  // saveProfilesToDB grava na empresa ativa (advertiser_profiles by company_id).
  saveProfilesToDB(profiles).catch(() => {});
}

export function useAdvertiserStore() {
  const { company } = useCompany();
  const companyId = company?.id ?? null;
  // Synchronous init from localStorage (same pattern as useCampaignStore) so the
  // profile list never flashes the empty-state on first render.
  const [profiles, setProfiles] = useState<AdvertiserProfile[]>(loadProfiles);

  // ── Carrega (e recarrega na troca de empresa) mesclando cache local + Supabase ─
  // Local wins por ID (preserva edição recente antes do sync); DB contribui os
  // ausentes. Ambos JÁ escopados por empresa, então nada de outra empresa entra.
  useEffect(() => {
    activeCid = companyId;
    const local = loadProfiles();
    setProfiles(local);
    fetchProfilesFromDB()
      .then((dbProfiles) => {
        if (dbProfiles.length === 0) return;
        setProfiles((cur) => {
          const ids = new Set(cur.map((p) => p.id));
          const merged = [...cur, ...dbProfiles.filter((p) => !ids.has(p.id))];
          persistScoped(STORAGE_PREFIX, companyId, merged);
          return merged;
        });
      })
      .catch(() => { /* not authenticated or Supabase not configured — ignore */ });
  }, [companyId]);

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
