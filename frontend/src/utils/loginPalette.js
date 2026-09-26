import { normalizeTenantBrandKey } from './tenantBrandAssets';

export function resolveLoginPalette(slug, palette = {}) {
  // ITSCO's legacy generic navy/blue/orange palette is not its login identity.
  // Preserve an explicitly customized palette; replace only the known old default.
  const generic = (!palette.primary || palette.primary.toLowerCase() === '#0f172a')
    && (!palette.accent || palette.accent.toLowerCase() === '#f97316');
  if (normalizeTenantBrandKey(slug) === 'itsco' && generic) {
    return { ...palette, primary: '#086653', secondary: '#064C41', accent: '#46D6B5' };
  }
  return palette;
}
