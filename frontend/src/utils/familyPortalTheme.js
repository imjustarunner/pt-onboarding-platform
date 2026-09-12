// Tenant color is validated before interpolation and darkened for readable links.
export function portalTheme(input) {
  const color = /^#[\da-f]{6}$/i.test(String(input || '')) ? input : '#2459ad';
  let rgb = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
  const luminance = values => values.map(v => { const n = v / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
  while (1.05 / (luminance(rgb) + .05) < 4.5) rgb = rgb.map(v => Math.floor(v * .92));
  const hex = values => `#${values.map(v => v.toString(16).padStart(2, '0')).join('')}`;
  return { '--portal-accent': hex(rgb), '--portal-on-accent': '#ffffff', '--portal-tint': hex(rgb.map(v => Math.round(v * .075 + 255 * .925))), '--portal-bg': hex(rgb.map(v => Math.round(v * .025 + 255 * .975))) };
}
