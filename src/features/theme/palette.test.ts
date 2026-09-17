import { describe, expect, it } from 'vitest';
import { contrastRatio } from './codeColors';
import { hexToOklch, oklchToHex } from './color';
import { crimsonRamp, palette } from './palette';
import { darkTheme, lightTheme } from './themes';

const AA = 4.5;
/** WCAG non-text contrast, for borders and other shapes. */
const AA_NON_TEXT = 3;

describe('palette', () => {
  it('pins the brand seed at the step Fluent builds its brand tokens from', () => {
    expect(crimsonRamp[80]).toBe(palette.crimson);
    expect(lightTheme.colorBrandBackground).toBe(palette.crimson);
  });

  it('rises monotonically in lightness', () => {
    const steps = Object.values(crimsonRamp).map((hex) => hexToOklch(hex).L);
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1]!);
  });

  it('uses the palette surfaces for the page background', () => {
    expect(lightTheme.colorNeutralBackground1).toBe(palette.white);
    expect(darkTheme.colorNeutralBackground1).toBe(palette.plum);
  });

  it.each([
    ['light', lightTheme],
    ['dark', darkTheme],
  ] as const)('meets AA for brand and body text on the %s surface', (_name, theme) => {
    const surface = theme.colorNeutralBackground1;
    for (const color of [theme.colorBrandForeground1, theme.colorBrandForeground2, theme.colorNeutralForeground1, theme.colorNeutralForeground2, theme.colorNeutralForeground3]) {
      expect(contrastRatio(color, surface), `${color} on ${surface}`).toBeGreaterThanOrEqual(AA);
    }
    expect(contrastRatio(theme.colorNeutralForegroundOnBrand, theme.colorBrandBackground)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(theme.colorNeutralStrokeAccessible, surface)).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  it('only ever uses amber as a fill, because it fails against white', () => {
    expect(contrastRatio(palette.amber, palette.white)).toBeLessThan(AA_NON_TEXT);
    expect(contrastRatio(palette.amberInk, palette.amber)).toBeGreaterThanOrEqual(AA);
  });

  it('keeps dark neutrals on the plum hue without shifting their lightness', () => {
    const plum = hexToOklch(palette.plum);
    for (const name of ['colorNeutralBackground2', 'colorNeutralBackground3', 'colorNeutralStroke1'] as const) {
      const tone = hexToOklch(darkTheme[name]);
      expect(tone.C).toBeGreaterThan(0);
      // Rounding to 8-bit hex nudges the hue; a hundredth of a radian is imperceptible.
      expect(Math.abs(tone.h - plum.h)).toBeLessThan(0.05);
    }
  });

  it('round-trips a colour through OKLCh', () => {
    for (const hex of ['#ffffff', '#000000', palette.crimson, palette.plum]) {
      expect(oklchToHex(hexToOklch(hex))).toBe(hex);
    }
  });
});
