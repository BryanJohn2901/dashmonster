"use client";

import { useCallback, useEffect, useState } from "react";
import { useCompany } from "@/hooks/useCompany";
import { loadScoped, persistScoped } from "@/lib/companyScopedStorage";

const STORAGE_PREFIX = "pta_creatives_v1";
let activeCid: string | null = null;

export interface CreativeData {
  mediaUrl: string;  // URL to image / video thumbnail
  adLink: string;    // click-through: the ad, landing page, or Meta Ads Manager link
  notes: string;
  starred?: boolean; // marked as "best creative"
  starredAt?: string; // ISO date when starred
}

export const EMPTY_CREATIVE: CreativeData = { mediaUrl: "", adLink: "", notes: "", starred: false };

type CreativeStore = Record<string, CreativeData>; // key = campaignName

export function useCreativeStore() {
  const { company } = useCompany();
  const companyId = company?.id ?? null;
  const [store, setStore] = useState<CreativeStore>({});

  // Carrega (e recarrega na troca de empresa) o cache DELA — isolado por empresa.
  useEffect(() => {
    activeCid = companyId;
    setStore(loadScoped<CreativeStore>(STORAGE_PREFIX, companyId, {}));
  }, [companyId]);

  const saveCreative = useCallback((campaignName: string, data: CreativeData) => {
    setStore((prev) => {
      const next = { ...prev, [campaignName]: data };
      persistScoped(STORAGE_PREFIX, activeCid, next);
      return next;
    });
  }, []);

  const removeCreative = useCallback((campaignName: string) => {
    setStore((prev) => {
      const next = { ...prev };
      delete next[campaignName];
      persistScoped(STORAGE_PREFIX, activeCid, next);
      return next;
    });
  }, []);

  return { store, saveCreative, removeCreative };
}
