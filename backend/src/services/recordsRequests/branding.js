// Keep image requests on this origin; records pages must not contact third-party trackers.
const defaults = {
  itsco: '/assets/itsco/logo.png',
  nlu: '/assets/nlu/logo.png',
  plottwistco: '/assets/ptco/logo-flat.webp',
  tisi: '/assets/branding/innerstrength-mark.png'
};
export function publicBrand(row) {
  const path = String(row.logo_path || '').replace(/^\/?uploads\//, '');
  const local = String(row.logo_url || '');
  const logoUrl = /^logos\/[a-z0-9_./-]+\.(png|webp|jpe?g|svg)$/i.test(path) && !path.includes('..')
    ? `/uploads/${path}`
    : /^\/assets\/[a-z0-9_./-]+\.(png|webp|jpe?g|svg)$/i.test(local) && !local.includes('..') ? local : defaults[row.slug] || '';
  let palette = row.color_palette;
  try { if (typeof palette === 'string') palette = JSON.parse(palette); } catch { palette = null; }
  return { id: row.id, slug: row.slug, name: row.name, logoUrl, brandColor: /^#[0-9a-f]{6}$/i.test(palette?.primary || '') ? palette.primary : '#0649ce' };
}
