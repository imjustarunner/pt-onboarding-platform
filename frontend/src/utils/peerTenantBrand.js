import { toUploadsUrl } from './uploadsUrl';

/**
 * Multi-tenant peer branding for Messages.
 *
 * Rules:
 * - Shared memberships = peer.shared_agency_memberships (viewer-scoped from API)
 * - Exactly one shared tenant → brand peer with that tenant’s logo/primary
 * - Zero or multiple shared tenants → use the viewer’s default/login brand
 *   (single login identity, e.g. @itsco.health)
 */

function parsePalette(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

function resolveAssetUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  // Prefer backend uploads host for relative / stored paths (split-origin safe).
  return toUploadsUrl(s);
}

/**
 * Tenant / membership logo for chips and peer marks.
 * Prefer real brand logos over master icons (icons often 404 as relative frontend paths).
 */
export function resolveMembershipLogoUrl(m) {
  if (!m) return null;
  const candidates = [
    m.logo_url,
    m.logoUrl,
    m.logo_path,
    m.logoPath,
    m.organization_logo_url,
    m.organizationLogoUrl,
    m.organization_logo_path,
    m.organizationLogoPath,
    m.icon_file_path,
    m.iconFilePath,
    m.chat_icon_path,
    m.chatIconPath
  ];
  for (const c of candidates) {
    const url = resolveAssetUrl(c);
    if (url) return url;
  }
  return null;
}

export function membershipPrimaryColor(m) {
  if (!m) return null;
  if (m.primary_color) return String(m.primary_color);
  const palette = parsePalette(m.color_palette || m.colorPalette);
  return palette?.primary || palette?.primaryColor || null;
}

/**
 * @param {object|null} person - presence row with shared_agency_memberships
 * @param {{ defaultPrimary?: string|null, defaultLogoUrl?: string|null, defaultName?: string|null }} defaults
 */
export function resolvePeerTenantBrand(person, defaults = {}) {
  const shared = Array.isArray(person?.shared_agency_memberships)
    ? person.shared_agency_memberships
    : [];

  if (shared.length === 1) {
    const m = shared[0];
    return {
      mode: 'tenant',
      agencyId: m.id,
      name: m.name || `Agency ${m.id}`,
      primaryColor: membershipPrimaryColor(m) || defaults.defaultPrimary || null,
      logoUrl: resolveMembershipLogoUrl(m) || defaults.defaultLogoUrl || null,
      memberships: shared
    };
  }

  return {
    mode: 'default',
    agencyId: null,
    name: defaults.defaultName || 'Your organization',
    primaryColor: defaults.defaultPrimary || null,
    logoUrl: defaults.defaultLogoUrl || null,
    memberships: shared
  };
}

export function membershipsForHover(person, viewerMemberships = []) {
  const shared = Array.isArray(person?.shared_agency_memberships)
    ? person.shared_agency_memberships
    : [];
  if (shared.length) return shared;
  // Self / fallback: show viewer memberships when present
  if (Array.isArray(viewerMemberships) && viewerMemberships.length) {
    return viewerMemberships.map((a) => ({
      id: a.id,
      name: a.name || `Agency ${a.id}`,
      organization_type: a.organization_type || a.organizationType || 'agency',
      logo_url: a.logo_url || a.logoUrl,
      logo_path: a.logo_path || a.logoPath,
      icon_file_path: a.icon_file_path || a.iconFilePath,
      color_palette: a.color_palette || a.colorPalette,
      primary_color: membershipPrimaryColor(a)
    }));
  }
  return [];
}
