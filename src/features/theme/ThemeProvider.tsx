import { FluentProvider, makeStyles, tokens } from '@fluentui/react-components';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { localStore } from '../../lib/storage/localStore';
import { useMediaQuery } from '../../lib/utils/useMediaQuery';
import { readThemePreference, resolveTheme, THEME_STORAGE_KEY, type ResolvedTheme, type ThemePreference } from './themePreference';
import { darkTheme, lightTheme } from './themes';

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const useStyles = makeStyles({
  root: {
    minHeight: '100dvh',
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
  },
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const styles = useStyles();
  const [preference, setPreferenceState] = useState<ThemePreference>(() => readThemePreference(localStore));
  const systemPrefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const resolved = resolveTheme(preference, systemPrefersDark);
  const theme = resolved === 'dark' ? darkTheme : lightTheme;

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    localStore.set(THEME_STORAGE_KEY, next);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.colorNeutralBackground1);
  }, [resolved, theme]);

  const value = useMemo(() => ({ preference, resolved, setPreference }), [preference, resolved, setPreference]);

  return (
    <ThemeContext.Provider value={value}>
      <FluentProvider theme={theme} className={styles.root} applyStylesToPortals>
        {children}
      </FluentProvider>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider');
  return context;
}
