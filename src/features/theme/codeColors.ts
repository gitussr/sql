import type { TokenKind } from '../../content/types';
import type { ResolvedTheme } from './themePreference';

export interface CodePalette {
  background: string;
  foreground: string;
  tokens: Record<TokenKind, string>;
}

/**
 * Syntax colours based on VS Code Light+ / Dark+, adjusted where needed so
 * every token meets WCAG AA (4.5:1) against the code background.
 * Backgrounds equal Fluent colorNeutralBackground3 (light) / Background2 (dark),
 * so the dark listing sits on the same plum family as the rest of the page.
 */
export const codePalettes: Record<ResolvedTheme, CodePalette> = {
  light: {
    background: '#f5f5f5',
    foreground: '#242424',
    tokens: {
      k: '#0000ff',
      s: '#a31515',
      n: '#067a50',
      b: '#0000ff',
      c: '#008000',
      f: '#795e26',
      t: '#1a7389',
      o: '#242424',
      p: '#424242',
      v: '#001080',
    },
  },
  dark: {
    background: '#261830',
    foreground: '#d6d6d6',
    tokens: {
      k: '#569cd6',
      s: '#ce9178',
      n: '#b5cea8',
      b: '#569cd6',
      c: '#6a9955',
      f: '#dcdcaa',
      t: '#4ec9b0',
      o: '#d4d4d4',
      p: '#c8c8c8',
      v: '#9cdcfe',
    },
  },
};

/** CSS custom property holding a token kind's colour. */
export const codeVar = (kind: TokenKind | 'bg' | 'fg') => `--sg-code-${kind}`;

/** Custom properties for one theme, applied on the theme root. */
export function codeCssVariables(theme: ResolvedTheme): Record<string, string> {
  const palette = codePalettes[theme];
  const variables: Record<string, string> = { [codeVar('bg')]: palette.background, [codeVar('fg')]: palette.foreground };
  for (const [kind, color] of Object.entries(palette.tokens)) variables[codeVar(kind as TokenKind)] = color;
  return variables;
}

export function contrastRatio(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, bl] = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}
