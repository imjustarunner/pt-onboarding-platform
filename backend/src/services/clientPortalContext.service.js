import Agency from '../models/Agency.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import { resolvePreferredSenderIdentityForAgency } from './emailSenderIdentityResolver.service.js';
import { preferredIdentityKeysForTemplateType } from '../constants/automatedEmailCatalog.js';
import { buildPublicAppUrl } from '../utils/publicPortalUrl.js';

const typeOf = org => String(org?.organization_type || '').toLowerCase();
const slugOf = org => String(org?.portal_url || org?.slug || '').trim();
const fail = message => Object.assign(new Error(message), { status: 503 });

export async function resolveClientPortalContext(client) {
  let tenant = await Agency.findById(Number(client.agency_id));
  if (!tenant) throw fail('The client’s tenant portal is not configured.');
  const organization = Number(client.organization_id) === Number(tenant.id) ? tenant
    : client.organization_id ? await Agency.findById(Number(client.organization_id)) : null;
  if (['school', 'program', 'learning', 'clinical'].includes(typeOf(tenant))) {
    const parentId = await OrganizationAffiliation.getActiveAgencyIdForOrganization(tenant.id)
      || await AgencySchool.getActiveAgencyIdForSchool(tenant.id);
    tenant = parentId ? await Agency.findById(parentId) : null;
    if (!tenant || ['school', 'program', 'learning', 'clinical'].includes(typeOf(tenant))) {
      throw fail('The client’s main tenant must be configured before sending invitations.');
    }
  }
  // School affiliations never become a clinical client's sign-in portal.
  // Learning organizations retain their dedicated tutoring experience.
  const clientType = String(client.client_type || '').toLowerCase();
  const clinical = ['clinical', 'mental_health', 'school'].includes(clientType);
  const learning = !clinical && (['learning', 'tutoring'].includes(clientType) || typeOf(organization) === 'learning');
  const portal = learning && typeOf(organization) === 'learning'
    ? { ...organization, parent_portal_url: slugOf(tenant), parent_custom_domain: tenant.custom_domain }
    : clinical ? { ...tenant, clinical_portal: true } : tenant;
  if (!slugOf(portal)) throw fail('The client’s portal address is not configured.');
  return { tenant, portal, learning, clinical };
}

export function clientPortalAppUrl(portal, path = 'guardian') {
  if (String(path).replace(/^\//, '').startsWith('billing/complete/')) {
    const origin = portal?.clinical_portal ? 'https://auricwell.com' : new URL(buildPublicAppUrl(portal)).origin;
    const url = new URL(`/${String(path).replace(/^\//, '')}`, origin);
    url.searchParams.set('portal',slugOf(portal));
    return url.toString();
  }
  if (portal?.clinical_portal) return `https://auricwell.com/${encodeURIComponent(slugOf(portal))}/${String(path).replace(/^\//, '')}`;
  return buildPublicAppUrl(portal, path);
}

export function clientPortalInviteUrl({ portal, token, existingAccount }) {
  const url = new URL(clientPortalAppUrl(portal, existingAccount ? 'login' : `new_account/${encodeURIComponent(token)}`));
  url.searchParams.set('portal', slugOf(portal));
  if (existingAccount) {
    const dashboard = ['life_coach', 'consultant'].includes(typeOf(portal)) ? 'client-dashboard' : 'guardian';
    url.searchParams.set('redirect', `/${encodeURIComponent(slugOf(portal))}/${dashboard}?portal=${encodeURIComponent(slugOf(portal))}`);
  }
  return url.toString();
}

export async function resolveClientPortalSender(tenantId) {
  const identity = await resolvePreferredSenderIdentityForAgency({ agencyId: tenantId,
    templateType: 'hub_portal_invite', preferredKeys: preferredIdentityKeysForTemplateType('hub_portal_invite'),
    includePlatformDefaults: false, onlyActive: true });
  // A misconfigured default must never turn a client invitation into an email
  // from another tenant or the platform account.
  if (!identity?.id || Number(identity.agency_id) !== Number(tenantId) || [0, false].includes(identity.is_active)) {
    throw fail('Configure an active portal invitation email sender for the client’s main tenant.');
  }
  return identity;
}
