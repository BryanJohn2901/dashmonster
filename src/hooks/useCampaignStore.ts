"use client";

import { useCallback, useState } from "react";
import { ProductCategory } from "@/types/campaign";
import type { UserAccountEntry, UserCategory } from "@/types/userConfig";
import {
  getCustomInternalFilterLabel,
  isCustomInternalFilterId,
} from "@/config/categoryInternalFilters";
import { mapPainelInternalFilterToDashboardGroupId } from "@/utils/painelDashboardNavigation";

const STORAGE_KEY = "pta_campaign_store_v2";

export interface CampaignConfig {
  adAccountId: string;
}

export interface CampaignSummary {
  id: string;
  name: string;
  status: string;
}

/** Built-in section IDs plus any custom section string. */
export type GroupSection = "pos" | "livros" | "ebooks" | "perpetuo" | "eventos" | (string & {});

export type ColorKey = "blue" | "emerald" | "violet" | "amber" | "rose" | "pink" | "cyan" | "orange";

/** User-created top-level category, such as "Perfis de Instagram". */
export interface CustomSection {
  id: string;
  label: string;
  description: string;
  iconName: string;
  colorKey: ColorKey;
}

export interface CustomGroup {
  id: string;
  label: string;
  section: GroupSection;
}

const MAX_CUSTOM_SECTIONS = 3;

interface StoreState {
  activeCampaigns: Record<string, boolean>;
  selectedGroup: string;
  selectedTurma: string;
  campaignConfigs: Record<string, CampaignConfig>;
  selectedCategory: ProductCategory | string | null;
  campaignsByGroup: Record<string, CampaignSummary[]>;
  selectedCampaign: string;
  selectedCampaignsByGroup: Record<string, string[]>;
  enabledSections: ProductCategory[];
  customGroups: CustomGroup[];
  customSections: CustomSection[];
  panelGroupIds: string[];
  panelSectionIds: string[];
}

const ALL_SECTIONS: ProductCategory[] = ["pos", "livros", "ebooks", "perpetuo", "eventos"];

const DEFAULT_STATE: StoreState = {
  activeCampaigns: {},
  selectedGroup: "all",
  selectedTurma: "all",
  campaignConfigs: {},
  selectedCategory: null,
  campaignsByGroup: {},
  selectedCampaign: "all",
  selectedCampaignsByGroup: {},
  enabledSections: ALL_SECTIONS,
  customGroups: [],
  customSections: [],
  panelGroupIds: [],
  panelSectionIds: [],
};

function loadStore(): StoreState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
      ?? localStorage.getItem("pta_campaign_store_v1");
    if (!raw) return DEFAULT_STATE;
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_STATE;
  }
}

function persist(state: StoreState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* storage unavailable */ }
}

const PANEL_ENTRY_GROUP_PREFIX = "panel-entry-";
const PANEL_SECTION_COLORS: ColorKey[] = ["blue", "emerald", "violet", "amber", "rose", "pink", "cyan", "orange"];
const BUILTIN_SECTIONS = new Set<string>(ALL_SECTIONS);

// Legacy prefix used by the old event handler (renamed to PANEL_ENTRY_GROUP_PREFIX).
// Keep recognising it so stale localStorage groups get cleaned up.
const LEGACY_PAINEL_PREFIX = "painel-";

function isPanelManagedGroupId(id: string, previousPanelIds: Set<string>): boolean {
  return (
    previousPanelIds.has(id) ||
    id.startsWith(PANEL_ENTRY_GROUP_PREFIX) ||
    id.startsWith(LEGACY_PAINEL_PREFIX) ||
    isCustomInternalFilterId(id)
  );
}

function resolvePanelEntryGroupId(entry: UserAccountEntry, category: UserCategory): string {
  if (category.type === "custom" || !BUILTIN_SECTIONS.has(category.slug)) {
    return `${PANEL_ENTRY_GROUP_PREFIX}${entry.id}`;
  }
  if (isCustomInternalFilterId(entry.internalFilter)) return entry.internalFilter;
  return mapPainelInternalFilterToDashboardGroupId(category.slug, entry.internalFilter);
}

export function useCampaignStore() {
  const [state, setState] = useState<StoreState>(loadStore);

  const setSelectedGroup = useCallback((group: string) => {
    setState((prev) => {
      const next = { ...prev, selectedGroup: group, selectedTurma: "all", selectedCampaign: "all" };
      persist(next);
      return next;
    });
  }, []);

  const setSelectedTurma = useCallback((turma: string) => {
    setState((prev) => {
      const next = { ...prev, selectedTurma: turma, selectedCampaign: "all" };
      persist(next);
      return next;
    });
  }, []);

  const toggleActive = useCallback((group: string, isActive: boolean) => {
    setState((prev) => {
      const next = {
        ...prev,
        activeCampaigns: { ...prev.activeCampaigns, [group]: isActive },
      };
      persist(next);
      return next;
    });
  }, []);

  const setCampaignConfig = useCallback((group: string, config: CampaignConfig) => {
    setState((prev) => {
      const next = {
        ...prev,
        campaignConfigs: { ...prev.campaignConfigs, [group]: config },
      };
      persist(next);
      return next;
    });
  }, []);

  const setSelectedCategory = useCallback((cat: ProductCategory | string | null) => {
    setState((prev) => {
      const next = {
        ...prev,
        selectedCategory: cat,
        selectedGroup: "all",
        selectedTurma: "all",
        selectedCampaign: "all",
      };
      persist(next);
      return next;
    });
  }, []);

  const setCampaignsForGroup = useCallback((groupId: string, campaigns: CampaignSummary[]) => {
    setState((prev) => {
      const next = {
        ...prev,
        campaignsByGroup: { ...prev.campaignsByGroup, [groupId]: campaigns },
      };
      persist(next);
      return next;
    });
  }, []);

  const setSelectedCampaign = useCallback((id: string) => {
    setState((prev) => {
      const next = { ...prev, selectedCampaign: id };
      persist(next);
      return next;
    });
  }, []);

  const setEnabledSections = useCallback((sections: ProductCategory[]) => {
    setState((prev) => {
      const next = { ...prev, enabledSections: sections };
      persist(next);
      return next;
    });
  }, []);

  const addCustomGroup = useCallback((group: CustomGroup) => {
    setState((prev) => {
      if (prev.customGroups.some((g) => g.id === group.id)) return prev;
      const next = { ...prev, customGroups: [...prev.customGroups, group] };
      persist(next);
      return next;
    });
  }, []);

  const removeCustomGroup = useCallback((id: string) => {
    setState((prev) => {
      const next = {
        ...prev,
        customGroups: prev.customGroups.filter((g) => g.id !== id),
        campaignConfigs: Object.fromEntries(
          Object.entries(prev.campaignConfigs).filter(([k]) => k !== id),
        ),
      };
      persist(next);
      return next;
    });
  }, []);

  const addCustomSection = useCallback((section: CustomSection) => {
    setState((prev) => {
      if (prev.customSections.length >= MAX_CUSTOM_SECTIONS) return prev;
      if (prev.customSections.some((s) => s.id === section.id)) return prev;
      const next = { ...prev, customSections: [...prev.customSections, section] };
      persist(next);
      return next;
    });
  }, []);

  const updateCustomSection = useCallback((id: string, data: Partial<Omit<CustomSection, "id">>) => {
    setState((prev) => {
      const next = {
        ...prev,
        customSections: prev.customSections.map((s) =>
          s.id === id ? { ...s, ...data } : s,
        ),
      };
      persist(next);
      return next;
    });
  }, []);

  const removeCustomSection = useCallback((id: string) => {
    setState((prev) => {
      const removedGroups = prev.customGroups.filter((g) => g.section === id).map((g) => g.id);
      const newConfigs = { ...prev.campaignConfigs };
      removedGroups.forEach((gId) => delete newConfigs[gId]);

      const next = {
        ...prev,
        customSections: prev.customSections.filter((s) => s.id !== id),
        customGroups: prev.customGroups.filter((g) => g.section !== id),
        campaignConfigs: newConfigs,
      };
      persist(next);
      return next;
    });
  }, []);

  const setCampaignSelectionForGroup = useCallback((groupId: string, ids: string[]) => {
    setState((prev) => {
      const next = {
        ...prev,
        selectedCampaignsByGroup: { ...prev.selectedCampaignsByGroup, [groupId]: ids },
      };
      persist(next);
      return next;
    });
  }, []);

  const clearCampaignSelectionForGroup = useCallback((groupId: string) => {
    setState((prev) => {
      const newMap = { ...prev.selectedCampaignsByGroup };
      delete newMap[groupId];
      const next = { ...prev, selectedCampaignsByGroup: newMap };
      persist(next);
      return next;
    });
  }, []);

  const syncPanelConfig = useCallback((categories: UserCategory[], entries: UserAccountEntry[]) => {
    // Guard: if no data has loaded yet (initial render before Supabase responds),
    // skip the sync entirely. Running with empty arrays would clear previously-stored
    // campaign configs and reset selectedGroup — all persisted to localStorage — before
    // the real data arrives. The sync will run correctly once Supabase returns data.
    if (categories.length === 0 && entries.length === 0) return;

    setState((prev) => {
      const previousPanelIds = new Set(prev.panelGroupIds);
      const categoryById = new Map(categories.map((cat) => [cat.id, cat]));
      const panelGroupIds = new Set<string>();
      const panelSectionIds = new Set<string>();
      const panelGroups = new Map<string, CustomGroup>();

      const campaignConfigs = { ...prev.campaignConfigs };
      const campaignsByGroup = { ...prev.campaignsByGroup };
      const selectedCampaignsByGroup = { ...prev.selectedCampaignsByGroup };

      previousPanelIds.forEach((id) => {
        delete campaignConfigs[id];
        delete campaignsByGroup[id];
        delete selectedCampaignsByGroup[id];
      });

      categories
        .filter((cat) => cat.type === "custom" && cat.isEnabled)
        .forEach((cat) => {
          panelSectionIds.add(cat.slug);
        });

      entries.forEach((entry) => {
        const category = categoryById.get(entry.categoryId);
        if (!category || !category.isEnabled || !entry.isEnabled || !entry.adAccountId.trim()) return;

        const groupId = resolvePanelEntryGroupId(entry, category);
        panelGroupIds.add(groupId);

        if (category.type === "custom" || !BUILTIN_SECTIONS.has(category.slug)) {
          panelSectionIds.add(category.slug);
          panelGroups.set(groupId, {
            id: groupId,
            label: entry.label.trim() || category.name,
            section: category.slug,
          });
        } else if (isCustomInternalFilterId(entry.internalFilter)) {
          panelGroups.set(groupId, {
            id: groupId,
            label: (getCustomInternalFilterLabel(entry.internalFilter) ?? entry.label.trim()) || groupId,
            section: category.slug,
          });
        }

        campaignConfigs[groupId] = { adAccountId: entry.adAccountId };
        campaignsByGroup[groupId] = entry.campaigns;
        if (entry.selectedCampaignIds.length > 0) {
          selectedCampaignsByGroup[groupId] = entry.selectedCampaignIds;
        } else {
          delete selectedCampaignsByGroup[groupId];
        }
      });

      // Bridge the group-ID mismatch: non-panel groups created by the Meta import flow
      // may have a different ID from the panel entry that represents the same account.
      // Sync their campaign list + selection from the matching entry so the header
      // dropdown and creatives filter always reflect the ControlPanel's state.
      //
      // Guard: only sync when there is a single unambiguous match — if two enabled entries
      // share the same adAccountId but have DIFFERENT selectedCampaignIds, skip (don't guess).
      const enabledEntries = entries.filter((e) => e.isEnabled && e.adAccountId.trim());
      const entryByAcct = new Map<string, UserAccountEntry[]>();
      for (const e of enabledEntries) {
        const acct = e.adAccountId.replace(/^act_/, "");
        entryByAcct.set(acct, [...(entryByAcct.get(acct) ?? []), e]);
      }

      for (const nonPanelGroupId of Object.keys(campaignConfigs)) {
        if (panelGroupIds.has(nonPanelGroupId)) continue; // already handled above
        const acct = (campaignConfigs[nonPanelGroupId]?.adAccountId ?? "").replace(/^act_/, "");
        if (!acct) continue;
        const matchingEntries = entryByAcct.get(acct);
        if (!matchingEntries?.length) continue;

        // Unambiguous campaign list: all entries agree (same campaigns array length)
        if (matchingEntries.length === 1 || matchingEntries.every((e) => e.campaigns.length === matchingEntries[0].campaigns.length)) {
          campaignsByGroup[nonPanelGroupId] = matchingEntries[0].campaigns;
        }

        // Unambiguous selection: all matching entries have the same selectedCampaignIds
        const canonical = [...matchingEntries[0].selectedCampaignIds].sort().join(",");
        const allAgree  = matchingEntries.every((e) => [...e.selectedCampaignIds].sort().join(",") === canonical);
        if (allAgree) {
          if (matchingEntries[0].selectedCampaignIds.length > 0) {
            selectedCampaignsByGroup[nonPanelGroupId] = matchingEntries[0].selectedCampaignIds;
          } else {
            delete selectedCampaignsByGroup[nonPanelGroupId];
          }
        }
      }

      const previousPanelSections = new Set(prev.panelSectionIds);
      const keptSections = prev.customSections.filter((section) => !previousPanelSections.has(section.id));
      const panelSections = categories
        .filter((cat) => cat.type === "custom" && cat.isEnabled)
        .map((cat, index): CustomSection => ({
          id: cat.slug,
          label: cat.name,
          description: "Categoria configurada no Painel de Controle",
          iconName: "Package",
          colorKey: PANEL_SECTION_COLORS[index % PANEL_SECTION_COLORS.length],
        }));

      const keptGroups = prev.customGroups.filter((group) => !isPanelManagedGroupId(group.id, previousPanelIds));
      const mergedGroups = [...keptGroups, ...panelGroups.values()];
      const mergedSections = [
        ...keptSections,
        ...panelSections.filter((section) => !keptSections.some((existing) => existing.id === section.id)),
      ];

      const nextSelectedGroup =
        previousPanelIds.has(prev.selectedGroup) && !panelGroupIds.has(prev.selectedGroup)
          ? "all"
          : prev.selectedGroup;
      const nextSelectedCategory =
        previousPanelSections.has(String(prev.selectedCategory)) && !panelSectionIds.has(String(prev.selectedCategory))
          ? null
          : prev.selectedCategory;

      const next = {
        ...prev,
        campaignConfigs,
        campaignsByGroup,
        selectedCampaignsByGroup,
        customGroups: mergedGroups,
        customSections: mergedSections,
        panelGroupIds: [...panelGroupIds],
        panelSectionIds: [...panelSectionIds],
        selectedGroup: nextSelectedGroup,
        selectedCategory: nextSelectedCategory,
      };
      persist(next);
      return next;
    });
  }, []);

  return {
    selectedGroup: state.selectedGroup,
    selectedTurma: state.selectedTurma,
    activeCampaigns: state.activeCampaigns,
    campaignConfigs: state.campaignConfigs,
    selectedCategory: state.selectedCategory,
    campaignsByGroup: state.campaignsByGroup,
    selectedCampaign: state.selectedCampaign,
    enabledSections: state.enabledSections,
    customGroups: state.customGroups,
    customSections: state.customSections,
    canAddCustomSection: state.customSections.length < MAX_CUSTOM_SECTIONS,
    setSelectedGroup,
    setSelectedTurma,
    toggleActive,
    setCampaignConfig,
    setSelectedCategory,
    setCampaignsForGroup,
    setSelectedCampaign,
    setEnabledSections,
    addCustomGroup,
    removeCustomGroup,
    addCustomSection,
    updateCustomSection,
    removeCustomSection,
    selectedCampaignsByGroup: state.selectedCampaignsByGroup,
    setCampaignSelectionForGroup,
    clearCampaignSelectionForGroup,
    syncPanelConfig,
  };
}
