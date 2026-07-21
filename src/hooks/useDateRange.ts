"use client";
import { useState, useCallback, useEffect } from "react";

const KEY_FROM = "gsah_date_range_v2_from";
const KEY_TO   = "gsah_date_range_v2_to";

// Legacy keys written by older Dashboard code — read once on mount for migration.
const LEGACY_FROM = "gsah_date_from_v1";
const LEGACY_TO   = "gsah_date_to_v1";

export function useDateRange() {
  const [dateFrom, setDateFromState] = useState<string>("");
  const [dateTo,   setDateToState]   = useState<string>("");

  useEffect(() => {
    const from = localStorage.getItem(KEY_FROM)
      ?? localStorage.getItem(LEGACY_FROM)
      ?? "";
    const to   = localStorage.getItem(KEY_TO)
      ?? localStorage.getItem(LEGACY_TO)
      ?? "";
    setDateFromState(from);
    setDateToState(to);
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

/** Read-only: returns the shared date range from localStorage without mounting a hook. */
export function readSharedDateRange(): { from: string; to: string } {
  if (typeof window === "undefined") return { from: "", to: "" };
  return {
    from: localStorage.getItem(KEY_FROM) ?? localStorage.getItem(LEGACY_FROM) ?? "",
    to:   localStorage.getItem(KEY_TO)   ?? localStorage.getItem(LEGACY_TO)   ?? "",
  };
}
