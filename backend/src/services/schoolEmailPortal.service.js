import Agency from '../models/Agency.model.js';
import { routingDestination } from './schoolCareBridgeRouting.service.js';

export const SCHOOL_EMAIL_DISPLAY_NAME = 'Schools Team';

/** Every school email opens the canonical school workspace and its existing access checks. */
export async function schoolEmailPortalUrl({ schoolOrganizationId }) {
  const school = await Agency.findById(schoolOrganizationId);
  const slug = String(school?.portal_url || school?.slug || '').trim().toLowerCase();
  if (!school || school.organization_type !== 'school' || !slug) {
    throw new Error('School email requires a configured school portal');
  }
  return routingDestination(slug);
}

/** Keep the existing guarded annual-management view on the school host. */
export function schoolEmailAdminOverviewUrl(agency) {
  const slug = String(agency?.portal_url || agency?.slug || '').trim().toLowerCase();
  if (!slug) throw new Error('School administration requires a configured agency portal');
  return `${routingDestination(slug)}/admin/schools/overview?orgType=school&yearUpdate=1`;
}
