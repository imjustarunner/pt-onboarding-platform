import { normalizeTenantBrandKey } from './tenantBrandAssets';

// Match the established tenant login/public-site identities. Stored custom
// palettes win; these replace only the old shared navy/blue/orange seed.
export const TENANT_PALETTES = Object.freeze({
  itsco: { primary: '#086653', secondary: '#064C41', accent: '#46D6B5' },
  nlu: { primary: '#092E58', secondary: '#008591', accent: '#008591' },
  innerstrength: { primary: '#12364B', secondary: '#2F6B3A', accent: '#2F6B3A' },
  mh4kidz: { primary: '#317E32', secondary: '#08263E', accent: '#00799E' },
  mentalrange: { primary: '#105B3D', secondary: '#0B222C', accent: '#91D096' },
  riserevive: { primary: '#123F2E', secondary: '#101E24', accent: '#53615C' },
  plottwistco: { primary: '#B80016', secondary: '#1D2633', accent: '#B80016' }
});
const LEGACY = { primary: '#0f172a', secondary: '#1e40af', accent: '#f97316' };

export function resolveTenantPalette(slug, palette = {}) {
  const source = palette && typeof palette === 'object' ? palette : {};
  const defaults = TENANT_PALETTES[normalizeTenantBrandKey(slug)];
  if (!defaults) return source;
  const isLegacy = Object.entries(LEGACY).every(([key, value]) =>
    !source[key] || String(source[key]).trim().toLowerCase() === value);
  return isLegacy ? { ...source, ...defaults } : source;
}
