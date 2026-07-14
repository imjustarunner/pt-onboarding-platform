/**
 * Soften / tint helpers for Life Balance Wheel category colors.
 */

export function parseHex(hex) {
  const h = String(hex || '').replace('#', '').trim();
  if (h.length === 3) {
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16)
    };
  }
  if (h.length !== 6) return { r: 148, g: 163, b: 184 };
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16)
  };
}

export function toHex({ r, g, b }) {
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[clamp(r), clamp(g), clamp(b)].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

/** Mix color toward white (0–1). */
export function softenColor(hex, amount = 0.28) {
  const c = parseHex(hex);
  const a = Math.max(0, Math.min(1, Number(amount) || 0));
  return toHex({
    r: c.r + (255 - c.r) * a,
    g: c.g + (255 - c.g) * a,
    b: c.b + (255 - c.b) * a
  });
}

/** Very light tint for banners / hover backgrounds. */
export function tintBackground(hex, alpha = 0.18) {
  const c = parseHex(hex);
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
}

export function withAlpha(hex, alpha = 1) {
  const c = parseHex(hex);
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
}
