"use client";
import { useState, useCallback, useEffect } from "react";

const KEY_FROM = "pta_date_range_v2_from";
const KEY_TO   = "pta_date_range_v2_to";

/**
 * Shared date-range state persisted in localStorage.
 *
 * Use this hook in ALL components that need a global date filter (Dashboard,
 * ProfileAnalysis, BestCreatives) so they stay in sync without prop-drilling.
 *
 * Keys upgrade from v1 (pta_date_from_v1 / pta_date_to_v1 / pta_profile_dates_v1)
 * to a single shared namespace. Old keys are read once on first mount for
 * backward-compat and then migrated.
 */
export function useDateRange() {
  const [dateFrom, setDateFromState] = useState<string>("");
  const [dateTo,   setDateToState]   = useState<string>("");

  // Hydrate from localStorage on mount (client-only — avoids SSR mismatch).
  useEffect(() => {
    try {
      const storedFrom = localStorage.getItem(KEY_FROM);
      const storedTo   = localStorage.getItem(KEY_TO);

      if (storedFrom !== null) {
        setDateFromState(storedFrom);
      } else {
        // Migrate from v1 key (one-time)
        const legacyFrom = localStorage.getItem("pta_date_from_v1") ?? "";
        setDateFromState(legacyFrom);
        if (legacyFrom) localStorage.setItem(KEY_FROM, legacyFrom);
      }

      if (storedTo !== null) {
        setDateToState(storedTo);
      } else {
        // Migrate from v1 key (one-time)
        const legacyTo = localStorage.getItem("pta_date_to_v1") ?? "";
        setDateToState(legacyTo);
        if (legacyTo) localStorage.setItem(KEY_TO, legacyTo);
      }
    } catch { /* localStorage unavailable */ }
  }, []);

  const setDateFrom = useCallback((v: string) => {
    setDateFromState(v);
    try {
      v ? localStorage.setItem(KEY_FROM, v) : localStorage.removeItem(KEY_FROM);
    } catch {}
  }, []);

  const setDateTo = useCallback((v: string) => {
    setDateToState(v);
    try {
      v ? localStorage.setItem(KEY_TO, v) : localStorage.removeItem(KEY_TO);
    } catch {}
  }, []);

  return { dateFrom, dateTo, setDateFrom, setDateTo };
}
