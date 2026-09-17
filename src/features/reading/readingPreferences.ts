import { useCallback, useSyncExternalStore } from 'react';
import { localStore, type KeyValueStore } from '../../lib/storage/localStore';

export interface ReadingPreferences {
  /** Wrap long code lines instead of scrolling horizontally. */
  wrapCode: boolean;
  showLineNumbers: boolean;
}

export const DEFAULT_READING_PREFERENCES: ReadingPreferences = { wrapCode: false, showLineNumbers: false };
const STORAGE_KEY = 'reading';

/**
 * Tiny observable store so every code block on the page reacts when one
 * block's toggle changes the preference.
 */
export function createReadingPreferencesStore(store: KeyValueStore) {
  let current: ReadingPreferences = { ...DEFAULT_READING_PREFERENCES, ...sanitize(store.get<unknown>(STORAGE_KEY, {})) };
  const listeners = new Set<() => void>();

  return {
    get: () => current,
    set(patch: Partial<ReadingPreferences>) {
      current = { ...current, ...patch };
      store.set(STORAGE_KEY, current);
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function sanitize(value: unknown): Partial<ReadingPreferences> {
  if (!value || typeof value !== 'object') return {};
  const record = value as Record<string, unknown>;
  const result: Partial<ReadingPreferences> = {};
  if (typeof record.wrapCode === 'boolean') result.wrapCode = record.wrapCode;
  if (typeof record.showLineNumbers === 'boolean') result.showLineNumbers = record.showLineNumbers;
  return result;
}

const readingPreferences = createReadingPreferencesStore(localStore);

export function useReadingPreferences(): [ReadingPreferences, (patch: Partial<ReadingPreferences>) => void] {
  const preferences = useSyncExternalStore(readingPreferences.subscribe, readingPreferences.get, () => DEFAULT_READING_PREFERENCES);
  const update = useCallback((patch: Partial<ReadingPreferences>) => readingPreferences.set(patch), []);
  return [preferences, update];
}
