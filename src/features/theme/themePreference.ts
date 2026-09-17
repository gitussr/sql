import type { KeyValueStore } from '../../lib/storage/localStore';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

/** Storage key. The pre-paint script in index.html reads the same key ("sql-guide:theme"). */
export const THEME_STORAGE_KEY = 'theme';

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function readThemePreference(store: KeyValueStore): ThemePreference {
  const value = store.get<unknown>(THEME_STORAGE_KEY, 'system');
  return isThemePreference(value) ? value : 'system';
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}
