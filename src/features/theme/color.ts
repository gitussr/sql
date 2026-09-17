/**
 * Just enough colour science to retint Fluent's neutral ramp.
 *
 * OKLCh is used rather than HSL because its lightness axis is perceptual: a
 * neutral and its tinted counterpart keep the same apparent lightness, so every
 * contrast ratio Fluent tuned survives the tint.
 */

export interface Oklch {
  /** Perceptual lightness, 0–1. */
  L: number;
  /** Chroma; 0 is a pure grey. */
  C: number;
  /** Hue, in radians. */
  h: number;
}

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const clamp01 = (c: number) => Math.min(1, Math.max(0, c));

export function hexToOklch(hex: string): Oklch {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = srgbToLinear(((n >> 16) & 255) / 255);
  const g = srgbToLinear(((n >> 8) & 255) / 255);
  const b = srgbToLinear((n & 255) / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, C: Math.hypot(A, B), h: Math.atan2(B, A) };
}

function toLinearRgb({ L, C, h }: Oklch): [number, number, number] {
  const A = C * Math.cos(h);
  const B = C * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** Converts to hex, reducing chroma (never lightness) until the colour fits sRGB. */
export function oklchToHex(color: Oklch): string {
  const fits = (scale: number) => toLinearRgb({ ...color, C: color.C * scale }).every((v) => v >= -0.0005 && v <= 1.0005);
  let scale = 1;
  if (!fits(1)) {
    let low = 0;
    let high = 1;
    for (let i = 0; i < 24; i++) {
      const mid = (low + high) / 2;
      if (fits(mid)) low = mid;
      else high = mid;
    }
    scale = low;
  }
  const channels = toLinearRgb({ ...color, C: color.C * scale });
  return `#${channels.map((v) => Math.round(clamp01(linearToSrgb(v)) * 255).toString(16).padStart(2, '0')).join('')}`;
}
