const validColor = value => /^#[a-f\d]{6}$/i.test(String(value || '')) ? String(value) : null;
const parse = value => { try { return typeof value === 'string' ? JSON.parse(value) : value || {}; } catch { return {}; } };
const rgb = hex => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
const luminance = hex => rgb(hex).map(value => { const n = value / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; }).reduce((n, value, index) => n + value * [.2126, .7152, .0722][index], 0);
const tint = (hex, weight) => '#' + rgb(hex).map(value => Math.round(255 * (1 - weight) + value * weight).toString(16).padStart(2, '0')).join('');

// Configured palette wins. Theme fallbacks preserve existing saved editions until
// their metadata is refreshed; these are the companies' verified actual palettes.
const themePalettes = {
  'itsco-foundations': { primary: '#669878', secondary: '#5A9B58', accent: '#145A3D' },
  'nlu-foundations': { primary: '#6FCFBE', secondary: '#1F2A44', accent: '#9FB7A5' },
  'isi-foundations': { primary: '#0F172A', secondary: '#1E40AF', accent: '#F97316' }
};
export function resolveDocumentBrand(metadata = {}, { agency } = {}) {
  const presentation = metadata.presentation || metadata || {};
  const palette = parse(agency?.color_palette || agency?.colorPalette);
  const saved = presentation.agencyBrand || {};
  const fallback = themePalettes[presentation.theme] || {};
  const primary = validColor(palette.primary) || validColor(saved.primary) || fallback.primary || validColor(presentation.primaryColor) || '#243B53';
  const secondary = validColor(palette.secondary) || validColor(saved.secondary) || fallback.secondary || primary;
  const accent = validColor(palette.accent) || validColor(saved.accent) || fallback.accent || validColor(presentation.accentColor) || secondary;
  const ink = [primary, secondary, accent].sort((a, b) => luminance(a) - luminance(b))[0];
  return { primary, secondary, accent, ink: luminance(ink) <= .18 ? ink : '#172A35', theme: presentation.theme || null,
    agencyId: Number(agency?.id || saved.agencyId || 0) || null };
}
export function documentBrandStyle(metadata = {}, options = {}) {
  const brand = resolveDocumentBrand(metadata, options);
  return { color: brand.ink, '--doc-primary': brand.primary, '--doc-secondary': brand.secondary, '--doc-accent': brand.accent,
    '--doc-ink': brand.ink, '--doc-muted': tint(brand.ink, .7), '--doc-line': tint(brand.ink, .18),
    '--doc-tint': tint(brand.primary, .09), '--doc-active': tint(brand.primary, .22), '--doc-page': '#FFFFFF',
    '--ink': brand.ink, '--muted': tint(brand.ink, .7), '--line': tint(brand.ink, .18) };
}
