import Agency from '../models/Agency.model.js';
import { buildPublicAppUrl } from '../utils/publicPortalUrl.js';

export const SCHOOL_EMAIL_DISPLAY_NAME = 'Schools';

/** School dashboard routes preserve school branding when sign-in is required. */
export async function schoolEmailPortalUrl({ schoolOrganizationId, agencyId }) {
  const [school, agency] = await Promise.all([
    Agency.findById(schoolOrganizationId),
    agencyId ? Agency.findById(agencyId) : null
  ]);
  const slug = String(school?.portal_url || school?.slug || '').trim().toLowerCase();
  if (!school || school.organization_type !== 'school' || !slug) {
    throw new Error('School email requires a configured school portal');
  }
  const context = {
    ...school,
    parent_slug: agency?.slug,
    parent_portal_url: agency?.portal_url || agency?.slug,
    parent_custom_domain: agency?.custom_domain
  };
  // Use the existing tenant/custom-domain resolver for the origin. Dashboard
  // routes are /:organizationSlug/dashboard, including on the platform host.
  const url = new URL(buildPublicAppUrl(context, 'login'));
  url.pathname = `/${slug}/dashboard`;
  return url.toString();
}
