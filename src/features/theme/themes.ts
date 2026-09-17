import { createDarkTheme, createLightTheme, type Theme } from '@fluentui/react-components';
import { hexToOklch, oklchToHex } from './color';
import { crimsonRamp, palette } from './palette';

/**
 * Fluent 2 themes on the handbook's crimson ramp. The only typographic override
 * is the monospace stack: Cascadia is Microsoft's developer typeface and reads
 * far better than the Consolas/Courier default for long SQL listings. It falls
 * back to system fonts, so nothing is downloaded.
 */
const fontFamilyMonospace = "'Cascadia Code', 'Cascadia Mono', Consolas, 'SF Mono', Menlo, 'Liberation Mono', monospace";

/** Only these token families describe surfaces, strokes and text on them. */
const NEUTRAL_TOKEN = /^color(Neutral|Subtle|Background|Stroke)/;

/** Above this chroma a token is already a colour, not a grey, and is left alone. */
const GREY_MAX_CHROMA = 0.02;

/**
 * Tints Fluent's dark greys towards `plum`, which becomes the page surface.
 *
 * Each token keeps its OKLCh lightness, so every contrast ratio Fluent tuned is
 * preserved; only hue and chroma change. Chroma fades out as a tone lightens,
 * which keeps body text neutral and confines the tint to the surfaces, where it
 * reads as a single tinted family rather than a purple cast over everything.
 */
function tintNeutrals(theme: Theme, plum: string): Theme {
  const target = hexToOklch(plum);
  const surface = hexToOklch(theme.colorNeutralBackground1);
  const chromaFor = (L: number) => Math.max(0, target.C * ((1 - L) / (1 - surface.L)));

  const tinted: Record<string, string> = {};
  for (const [name, value] of Object.entries(theme)) {
    if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) continue;
    if (!NEUTRAL_TOKEN.test(name)) continue;
    const color = hexToOklch(value);
    if (color.C > GREY_MAX_CHROMA) continue;
    tinted[name] = name === 'colorNeutralBackground1' ? plum : oklchToHex({ L: color.L, C: chromaFor(color.L), h: target.h });
  }
  return { ...theme, ...tinted };
}

export const lightTheme: Theme = { ...createLightTheme(crimsonRamp), fontFamilyMonospace };

export const darkTheme: Theme = { ...tintNeutrals(createDarkTheme(crimsonRamp), palette.plum), fontFamilyMonospace };
