import { describe, expect, it } from 'vitest';
import { createLocalStore } from '../../lib/storage/localStore';
import { readThemePreference, resolveTheme, THEME_STORAGE_KEY } from './themePreference';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

describe('theme preference', () => {
  it('defaults to system', () => {
    expect(readThemePreference(createLocalStore(memoryStorage()))).toBe('system');
  });

  it('persists and reads back a choice', () => {
    const store = createLocalStore(memoryStorage());
    store.set(THEME_STORAGE_KEY, 'dark');
    expect(readThemePreference(store)).toBe('dark');
  });

  it('writes the key and JSON format the pre-paint script in index.html expects', () => {
    const storage = memoryStorage();
    createLocalStore(storage).set(THEME_STORAGE_KEY, 'light');
    expect(JSON.parse(storage.data.get('sql-guide:theme')!)).toBe('light');
  });

  it('ignores invalid stored values', () => {
    const storage = memoryStorage();
    storage.setItem('sql-guide:theme', '"sepia"');
    expect(readThemePreference(createLocalStore(storage))).toBe('system');
    storage.setItem('sql-guide:theme', '{not json');
    expect(readThemePreference(createLocalStore(storage))).toBe('system');
  });

  it('resolves the system preference', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('keeps working when storage is unavailable', () => {
    const store = createLocalStore(undefined);
    store.set(THEME_STORAGE_KEY, 'dark');
    expect(readThemePreference(store)).toBe('system');
  });
});
