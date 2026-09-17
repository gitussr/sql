import { describe, expect, it, vi } from 'vitest';
import { createLocalStore } from '../../lib/storage/localStore';
import { createReadingPreferencesStore, DEFAULT_READING_PREFERENCES } from './readingPreferences';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

describe('reading preferences', () => {
  it('starts from defaults', () => {
    expect(createReadingPreferencesStore(createLocalStore(memoryStorage())).get()).toEqual(DEFAULT_READING_PREFERENCES);
  });

  it('persists changes and notifies subscribers', () => {
    const storage = memoryStorage();
    const store = createReadingPreferencesStore(createLocalStore(storage));
    const listener = vi.fn();
    store.subscribe(listener);
    store.set({ wrapCode: true });
    expect(listener).toHaveBeenCalledOnce();
    expect(createReadingPreferencesStore(createLocalStore(storage)).get()).toEqual({ wrapCode: true, showLineNumbers: false });
  });

  it('ignores malformed stored values', () => {
    const storage = memoryStorage();
    storage.setItem('sql-guide:reading', '{"wrapCode":"yes","showLineNumbers":true}');
    expect(createReadingPreferencesStore(createLocalStore(storage)).get()).toEqual({ wrapCode: false, showLineNumbers: true });
  });
});
