import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencySchool from '../models/AgencySchool.model.js';

const CHILD_ORG_TYPES = new Set(['school', 'program', 'learning']);

function requestBaseUrl(req) {
  const proto = String(req?.get?.('x-forwarded-proto') || req?.protocol || 'https')
    .split(',')[0]
    .trim();
  const host = req?.get?.('x-forwarded-host') || req?.get?.('host') || '';
  if (!host) return '';
  return `${proto}://${host}`;
}

function normalizeUploadsPath(path) {
  if (!path) return null;
  let cleaned = String(path);
  if (cleaned.startsWith('/')) cleaned = cleaned.slice(1);
  if (cleaned.startsWith('uploads/')) cleaned = cleaned.slice('uploads/'.length);
  return cleaned;
}

function resolveLogoUrl(req, row) {
  if (!row) return null;
  const baseUrl = requestBaseUrl(req);
  if (row.logo_path) {
    const cleaned = normalizeUploadsPath(row.logo_path);
    return cleaned && baseUrl ? `${baseUrl}/uploads/${cleaned}` : (row.logo_url || null);
  }
  if (row.icon_file_path) {
    const cleaned = normalizeUploadsPath(row.icon_file_path);
    return cleaned && baseUrl ? `${baseUrl}/uploads/${cleaned}` : (row.logo_url || null);
  }
  const raw = String(row.logo_url || '').trim();
  if (!raw) return null;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  if (!baseUrl) return raw;
  return `${baseUrl}${raw.startsWith('/') ? '' : '/'}${raw}`;
}

function orgType(row) {
  return String(row?.organization_type || row?.organizationType || '').trim().toLowerCase();
}

function orgSlug(row) {
  return String(row?.portal_url || row?.slug || '').trim().toLowerCase() || null;
}

function toBrand(req, row) {
  if (!row) return null;
  return {
    id: row.id || null,
    name: row.name || row.short_name || null,
    slug: orgSlug(row),
    logoUrl: resolveLogoUrl(req, row)
  };
}

/**
 * Tenant + optional school branding for password set/reset screens.
 * School staff get the affiliated school logo; everyone else gets tenant only.
 */
export async function buildPasswordRecoveryBranding(req, user) {
  const role = String(user?.role || '').toLowerCase();
  const agencies = await User.getAgencies(user.id);
  const list = Array.isArray(agencies) ? agencies : [];

  const school = list.find((row) => CHILD_ORG_TYPES.has(orgType(row))) || null;
  let tenant = list.find((row) => !CHILD_ORG_TYPES.has(orgType(row))) || null;

  if (!tenant && school) {
    try {
      const linkedId =
        (await OrganizationAffiliation.getActiveAgencyIdForOrganization(school.id)) ||
        (await AgencySchool.getActiveAgencyIdForSchool(school.id)) ||
        null;
      if (linkedId) tenant = await Agency.findById(linkedId);
    } catch {
      tenant = tenant || null;
    }
  }
  if (!tenant) tenant = list[0] || null;

  const tenantBrand = toBrand(req, tenant);
  const schoolBrand = role === 'school_staff' ? toBrand(req, school) : null;
  const portalSlug = schoolBrand?.slug || tenantBrand?.slug || null;

  return {
    role,
    portalSlug,
    tenant: tenantBrand,
    school: schoolBrand
  };
}
