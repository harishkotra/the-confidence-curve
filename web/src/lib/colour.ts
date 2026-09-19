/**
 * The reasoning-token heat ramp.
 *
 * Defined once here and used by both the 3D surface and the HTML legend, so
 * the colour a viewer reads off the legend is the colour they see in space.
 * Cool = few reasoning tokens, hot = many.
 */

import { Color } from 'three';

export const RAMP_STOPS: { at: number; color: string }[] = [
  { at: 0.0, color: '#1d3f5c' }, // deep cool blue — barely thinking
  { at: 0.25, color: '#2f7fa8' },
  { at: 0.5, color: '#57a86f' }, // neutral green — the middle of the range
  { at: 0.72, color: '#e0a92c' },
  { at: 0.88, color: '#f2701d' },
  { at: 1.0, color: '#ff3d1f' }, // hot — burning tokens
];

/** CSS gradient for the HTML legend, derived from the same stops. */
export const RAMP_CSS = `linear-gradient(90deg, ${RAMP_STOPS.map(
  (s) => `${s.color} ${(s.at * 100).toFixed(0)}%`,
).join(', ')})`;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Sample the ramp at t in 0..1, returning a three.js Color. */
export function rampColor(t: number, target = new Color()): Color {
  const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  let lo = RAMP_STOPS[0]!;
  let hi = RAMP_STOPS[RAMP_STOPS.length - 1]!;
  for (let i = 0; i < RAMP_STOPS.length - 1; i++) {
    const a = RAMP_STOPS[i]!;
    const b = RAMP_STOPS[i + 1]!;
    if (x >= a.at && x <= b.at) {
      lo = a;
      hi = b;
      break;
    }
  }
  const span = hi.at - lo.at;
  const f = span === 0 ? 0 : (x - lo.at) / span;
  const [r1, g1, b1] = hexToRgb(lo.color);
  const [r2, g2, b2] = hexToRgb(hi.color);
  return target.setRGB(r1 + (r2 - r1) * f, g1 + (g2 - g1) * f, b1 + (b2 - b1) * f);
}

/** Sample the ramp as a CSS colour, for HTML swatches. */
export function rampCss(t: number): string {
  const c = rampColor(t);
  const to = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${to(c.r)}${to(c.g)}${to(c.b)}`;
}

export const SLOT_COLORS: Record<'A' | 'B', string> = {
  A: '#c8a24a',
  B: '#6fa8c9',
};