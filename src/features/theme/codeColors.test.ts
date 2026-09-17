import { describe, expect, it } from 'vitest';
import { codeCssVariables, codePalettes, contrastRatio } from './codeColors';
import { darkTheme, lightTheme } from './themes';

describe('code colours', () => {
  it.each(['light', 'dark'] as const)('meet WCAG AA against the %s code background', (theme) => {
    const { background, foreground, tokens } = codePalettes[theme];
    for (const color of [foreground, ...Object.values(tokens)]) {
      expect(contrastRatio(color, background), `${color} on ${background}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("sit on the page's own neutral surfaces", () => {
    expect(codePalettes.light.background).toBe(lightTheme.colorNeutralBackground3);
    expect(codePalettes.dark.background).toBe(darkTheme.colorNeutralBackground2);
  });

  it('exposes every token as a CSS variable', () => {
    expect(Object.keys(codeCssVariables('dark'))).toHaveLength(12);
    expect(codeCssVariables('light')['--sg-code-k']).toBe('#0000ff');
  });

  it('computes contrast ratios', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1);
  });
});
