import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "dm_avatar_url";
const EVENT_NAME  = "dm:avatar-changed";

/** Total number of icon sets available in /public/avatars/ */
export const AVATAR_ICON_COUNT = 15;

/**
 * Resolves the stored avatar value to a usable <img src>.
 * - null / empty          → null (show initials)
 * - "data:..."            → the dataURL directly (uploaded photo)
 * - "icon:N"              → /avatars/N B.svg (dark) or /avatars/N W.svg (light)
 */
export function resolveAvatarSrc(stored: string | null, _isDark?: boolean): string | null {
  if (!stored) return null;
  if (stored.startsWith("data:")) return stored;
  if (stored.startsWith("icon:")) {
    const n = stored.slice(5);
    return `/avatars/${n} W.webp`;
  }
  return stored;
}

/** Reads/writes the user avatar from localStorage.
 *  Syncs across components via a custom DOM event.
 *  Values: null | "data:..." (photo) | "icon:N" (preset icon) */
export function useAvatarUrl() {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => {
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
  });

  useEffect(() => {
    const handler = () => {
      try { setAvatarUrl(localStorage.getItem(STORAGE_KEY)); } catch {}
    };
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
  }, []);

  const updateAvatar = useCallback((value: string | null) => {
    try {
      if (value) localStorage.setItem(STORAGE_KEY, value);
      else       localStorage.removeItem(STORAGE_KEY);
    } catch {}
    setAvatarUrl(value);
    window.dispatchEvent(new Event(EVENT_NAME));
  }, []);

  return { avatarUrl, updateAvatar };
}
