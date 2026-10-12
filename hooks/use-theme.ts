import { useCallback, useEffect, useState } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
type ResolvedTheme = Exclude<ThemePreference, 'system'>;

export const THEME_STORAGE_KEY = 'ijinden-deckbook-theme';

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme | null>(null);
  const resolvedTheme =
    preference === 'system' ? systemTheme : preference;

  useEffect(() => {
    try {
      const storedPreference = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (
        isThemePreference(storedPreference) &&
        storedPreference !== 'system'
      ) {
        queueMicrotask(() => setPreferenceState(storedPreference));
      }
    } catch {
      // Theme changes remain available for this page even when storage is blocked.
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const syncSystemTheme = () =>
      setSystemTheme(mediaQuery.matches ? 'dark' : 'light');
    syncSystemTheme();
    mediaQuery.addEventListener('change', syncSystemTheme);

    const syncOtherTab = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
      setPreferenceState(
        isThemePreference(event.newValue) ? event.newValue : 'system',
      );
    };
    window.addEventListener('storage', syncOtherTab);

    return () => {
      mediaQuery.removeEventListener('change', syncSystemTheme);
      window.removeEventListener('storage', syncOtherTab);
    };
  }, []);

  useEffect(() => {
    if (resolvedTheme === null) return;
    document.documentElement.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);

  const setPreference = useCallback((nextPreference: ThemePreference) => {
    setPreferenceState(nextPreference);
    try {
      if (nextPreference === 'system') {
        window.localStorage.removeItem(THEME_STORAGE_KEY);
      } else {
        window.localStorage.setItem(THEME_STORAGE_KEY, nextPreference);
      }
    } catch {
      // Keep the in-memory preference active for the current page.
    }
  }, []);

  return { preference, setPreference };
}
