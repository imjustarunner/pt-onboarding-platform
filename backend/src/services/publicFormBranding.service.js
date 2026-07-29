/**
 * Resolve tenant branding for public digital forms.
 * Mirrors login-theme inheritance: school/program/learning orgs inherit parent
 * agency colors when useAffiliatedAgencyBranding is true (default).
 */
import Agency from '../models/Agency.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';

const parseJsonObject = (v) => {
  if (!v) return {};
  if (typeof v === 'object') return v || {};
  try {
    const parsed = JSON.parse(v);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const normalizeBool = (v, fallback) => {
  if (v === undefined || v === null || v === '') return fallback;
  if (v === true || v === 1 || v === '1') return true;
  const s = String(v).trim().toLowerCase();
  if (s === 'true' || s === 'yes' || s === 'on') return true;
  if (s === 'false' || s === 'no' || s === 'off' || s === '0') return false;
  return fallback;
};

const normalizeUploadsPath = (p) => {
  if (!p) return null;
  let cleaned = String(p);
  if (cleaned.startsWith('/')) cleaned = cleaned.slice(1);
  if (cleaned.startsWith('uploads/')) cleaned = cleaned.substring('uploads/'.length);
  return cleaned;
};

/**
 * @param {object|null} orgRow - agency/school/program row
 * @param {{ baseUrl?: string }} [opts]
 * @returns {string|null}
 */
export function resolveOrgLogoUrl(orgRow, opts = {}) {
  if (!orgRow) return null;
  const baseUrl = String(opts.baseUrl || '').replace(/\/$/, '');
  if (orgRow.logo_path && baseUrl) {
    const cleaned = normalizeUploadsPath(orgRow.logo_path);
    return cleaned ? `${baseUrl}/uploads/${cleaned}` : orgRow.logo_url || null;
  }
  if (orgRow.icon_file_path && baseUrl) {
    const cleaned = normalizeUploadsPath(orgRow.icon_file_path);
    return cleaned ? `${baseUrl}/uploads/${cleaned}` : orgRow.logo_url || null;
  }
  return orgRow.logo_url || null;
};

/**
 * Resolve which org supplies color/font branding for a portal/display org.
 * @param {object|null} portalOrg - the org shown on the form (school or agency)
 * @param {object|null} [affiliatedAgency] - pre-resolved parent agency if available
 */
export async function resolveBrandingOrg(portalOrg, affiliatedAgency = null) {
  if (!portalOrg) return { brandingOrg: null, portalOrg: null };
  const orgType = String(portalOrg.organization_type || 'agency').toLowerCase();
  const themeSettings = parseJsonObject(portalOrg.theme_settings);
  const useAffiliated = normalizeBool(themeSettings.useAffiliatedAgencyBranding, true);

  let brandingOrg = portalOrg;
  if (['school', 'program', 'learning', 'affiliation'].includes(orgType) && useAffiliated) {
    let parent = affiliatedAgency;
    if (!parent) {
      const linkedId =
        (await OrganizationAffiliation.getActiveAgencyIdForOrganization(portalOrg.id)) ||
        (orgType !== 'affiliation' ? await AgencySchool.getActiveAgencyIdForSchool(portalOrg.id) : null);
      if (linkedId) {
        parent = await Agency.findById(linkedId);
      }
    }
    if (parent) brandingOrg = parent;
  }
  return { brandingOrg, portalOrg };
}

/**
 * Build the public `branding` payload for digital forms.
 * @param {{ organization?: object|null, agency?: object|null, baseUrl?: string }} ctx
 */
export async function buildPublicFormBranding(ctx = {}) {
  const organization = ctx.organization || null;
  const agency = ctx.agency || null;
  const baseUrl = String(ctx.baseUrl || '').replace(/\/$/, '');

  // Portal identity: prefer school/org when different from agency; else agency.
  const portalOrg = organization || agency;
  const affiliatedAgency =
    agency && organization && Number(agency.id) !== Number(organization.id) ? agency : agency;

  const { brandingOrg } = await resolveBrandingOrg(portalOrg, affiliatedAgency);
  const paletteSource = brandingOrg || agency || organization;
  const colorPalette = parseJsonObject(paletteSource?.color_palette);
  const themeSettings = parseJsonObject(paletteSource?.theme_settings);
  const fontFamily =
    themeSettings.fontFamily ||
    colorPalette.fontFamily ||
    null;

  const agencyLogoUrl = resolveOrgLogoUrl(agency || brandingOrg, { baseUrl });
  const organizationLogoUrl = resolveOrgLogoUrl(organization, { baseUrl });
  const brandingLogoUrl = resolveOrgLogoUrl(brandingOrg, { baseUrl });

  return {
    brandingAgencyId: brandingOrg?.id || null,
    portalOrganizationId: portalOrg?.id || null,
    agencyName: agency?.official_name || agency?.name || brandingOrg?.name || null,
    organizationName: organization?.official_name || organization?.name || null,
    programTitle:
      organization?.official_name ||
      organization?.name ||
      agency?.official_name ||
      agency?.name ||
      null,
    logoUrl: organizationLogoUrl || agencyLogoUrl || brandingLogoUrl || null,
    agencyLogoUrl: agencyLogoUrl || null,
    organizationLogoUrl: organizationLogoUrl || null,
    portalUrl: brandingOrg?.portal_url || agency?.portal_url || organization?.portal_url || null,
    slug: brandingOrg?.slug || agency?.slug || organization?.slug || null,
    colorPalette: {
      primary: colorPalette.primary || null,
      secondary: colorPalette.secondary || null,
      accent: colorPalette.accent || null,
      primaryHover: colorPalette.primaryHover || null,
      backgroundColor: colorPalette.backgroundColor || null,
      secondaryBackground: colorPalette.secondaryBackground || null,
      textPrimary: colorPalette.textPrimary || null,
      textSecondary: colorPalette.textSecondary || null,
      textMuted: colorPalette.textMuted || null,
      successColor: colorPalette.successColor || null,
      dividerColor: colorPalette.dividerColor || null
    },
    fontFamily,
    themeSettings: {
      fontFamily: themeSettings.fontFamily || null,
      loginBackground: themeSettings.loginBackground || null,
      useAffiliatedAgencyBranding: normalizeBool(themeSettings.useAffiliatedAgencyBranding, true)
    }
  };
}

/**
 * Convenience: branding from a single agency id.
 */
export async function buildPublicFormBrandingForAgencyId(agencyId, opts = {}) {
  const id = Number(agencyId || 0);
  if (!id) return buildPublicFormBranding({ baseUrl: opts.baseUrl });
  const agency = await Agency.findById(id);
  return buildPublicFormBranding({ organization: agency, agency, baseUrl: opts.baseUrl });
}

export function requestBaseUrl(req) {
  if (!req) return '';
  const proto = (req.get?.('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
  const host = req.get?.('x-forwarded-host') || req.get?.('host') || '';
  if (!host) return '';
  return `${proto}://${host}`;
}
