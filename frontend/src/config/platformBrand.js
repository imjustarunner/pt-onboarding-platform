/** Shared identity for unscoped platform surfaces. Agency identities stay tenant-owned. */
export const PLATFORM_BRAND = Object.freeze({
  name: 'Plot Twist Co',
  logo: '/assets/ptco/logo-flat.webp',
  primary: '#B80016',
  secondary: '#1D2633',
  accent: '#B80016',
  background: '#F6F7F9'
});

export function normalizePlatformBranding(value = {}) {
  const legacy = new Set(['#c69a2b', '#d4b04a', '#6c4df6', '#8b6bff', '#8b5cf6', '#7c3aed', '#3a4c6b']);
  const color = (v, fallback) => !v || legacy.has(String(v).toLowerCase()) ? fallback : v;
  return {
    ...value,
    organization_name: PLATFORM_BRAND.name,
    organization_logo_url: PLATFORM_BRAND.logo,
    primary_color: color(value.primary_color, PLATFORM_BRAND.primary),
    secondary_color: color(value.secondary_color, PLATFORM_BRAND.secondary),
    accent_color: color(value.accent_color, PLATFORM_BRAND.accent),
    background_color: PLATFORM_BRAND.background
  };
}
