/**
 * Minimal JSON wrapper around localStorage.
 *
 * Every read and write is guarded: storage can be unavailable (private mode,
 * blocked site data) and the app must keep working without it. Repositories
 * (progress, bookmarks, notes) are built on top of this so the backing store
 * can be swapped later without touching the UI.
 */
const PREFIX = 'sql-guide:';

export interface KeyValueStore {
  get<T>(key: string, fallback: T): T;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
}

export function createLocalStore(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined = safeLocalStorage()): KeyValueStore {
  return {
    get<T>(key: string, fallback: T): T {
      try {
        const raw = storage?.getItem(PREFIX + key);
        return raw == null ? fallback : (JSON.parse(raw) as T);
      } catch {
        return fallback;
      }
    },
    set<T>(key: string, value: T): void {
      try {
        storage?.setItem(PREFIX + key, JSON.stringify(value));
      } catch {
        // Quota exceeded or storage blocked: persistence is best-effort.
      }
    },
    remove(key: string): void {
      try {
        storage?.removeItem(PREFIX + key);
      } catch {
        // Ignore.
      }
    },
  };
}

function safeLocalStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export const localStore = createLocalStore();
