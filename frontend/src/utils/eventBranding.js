import { tenantFaviconUrl } from './tenantBrandAssets';
import { toUploadsUrl } from './uploadsUrl';

export function eventAgencyColor(agency = {}) {
  let palette = agency.colorPalette || agency.color_palette || {};
  if (typeof palette === 'string') { try { palette = JSON.parse(palette); } catch { palette = {}; } }
  const value = String(palette?.primary || '').trim();
  return /^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(value) ? value : '#2455ba';
}

export function eventAgencies(branding = {}) {
  const agencies = Array.isArray(branding.agencies) ? branding.agencies.filter(agency => agency && typeof agency.name === 'string') : [];
  if (agencies.length) return agencies;
  return [{ name: branding.hostAgencyName || branding.agencyName || 'Your organization',
    slug: branding.agencySlug || branding.portalUrl || '', logoUrl: branding.logoUrl || '',
    colorPalette: branding.colorPalette, isHost: true }];
}

export function eventAgencyLogo(agency = {}) {
  const value = String(agency.logoUrl || '').trim();
  if (value && (!/^[a-z][a-z\d+.-]*:/i.test(value) || /^https?:\/\//i.test(value))) return toUploadsUrl(value);
  return tenantFaviconUrl(agency.slug || '');
}
