import { isAuricwellQaAgency } from './auricwellQaPolicy.js';
import { isNluTutoringQaAgency } from './nluTutoringQaPolicy.js';

const flagsFor = agency => {
  const raw = agency?.feature_flags;
  if (!raw || typeof raw !== 'object' && typeof raw !== 'string') return {};
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return {}; }
};

// Input must be a server-loaded organization, never a request body/flag. These
// are retained synthetic records, not a naming convention for arbitrary tenants.
export function isSyntheticQaCaptchaAgency(agency) {
  if (Number(agency?.is_active) !== 1 || Number(agency?.is_archived || 0) !== 0) return false;
  if (isAuricwellQaAgency(agency)) return true;
  if (isNluTutoringQaAgency(agency)) {
    return Number(agency.id) === 453 || Number(agency.affiliated_agency_id) === 453;
  }
  const flags = flagsFor(agency);
  const child = new Map([[451, 'auricwell-qa-demo-school'], [452, 'auricwell-qa-demo-clinic']]);
  if (child.get(Number(agency.id)) === agency.slug && Number(agency.affiliated_agency_id) === 450) {
    return flags?.qaSandbox?.syntheticOnly === true;
  }
  return Number(agency.id) === 456 && agency.slug === 'scb-qa-company'
    && agency.organization_type === 'agency' && flags?.qaCaptcha?.syntheticOnly === true;
}

// Even a real account with a demo membership must retain the ordinary policy.
// The selected tenant and every active membership must be verified synthetic.
export function canSkipSyntheticQaRecoveryCaptcha(user, memberships, organizationSlug) {
  const slug = String(organizationSlug || '').trim().toLowerCase();
  if (!slug || Number(user?.is_demo) !== 1 || Number(user?.is_active) !== 1
      || Number(user?.is_archived || 0) !== 0 || user?.switchedFromUserId || user?.testAccountSwitch) return false;
  return Array.isArray(memberships) && memberships.length > 0
    && memberships.every(isSyntheticQaCaptchaAgency)
    && memberships.some(a => a.slug === slug || a.portal_url === slug);
}

// Branded marketing/support aliases do not inherit a demo exemption merely
// because their support routing happens to point at a synthetic agency.
export function isSyntheticQaPublicCaptchaContext(agency, requestedSlug) {
  const slug = String(requestedSlug || '').trim().toLowerCase();
  return isSyntheticQaCaptchaAgency(agency) && !!slug
    && [agency.slug, agency.portal_url, String(agency.id)].filter(Boolean).includes(slug);
}
