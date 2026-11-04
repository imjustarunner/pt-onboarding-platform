import Agency from '../models/Agency.model.js';
import { routingDestination } from './schoolCareBridgeRouting.service.js';

export const SCHOOL_EMAIL_DISPLAY_NAME = 'Schools';

/** Every school email opens the canonical school workspace and its existing access checks. */
export async function schoolEmailPortalUrl({ schoolOrganizationId }) {
  const school = await Agency.findById(schoolOrganizationId);
  const slug = String(school?.portal_url || school?.slug || '').trim().toLowerCase();
  if (!school || school.organization_type !== 'school' || !slug) {
    throw new Error('School email requires a configured school portal');
  }
  return routingDestination(slug);
}
