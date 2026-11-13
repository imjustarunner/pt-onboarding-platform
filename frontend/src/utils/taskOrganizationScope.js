import { isTenantOrganizationType } from './organizationTypes';
import { isSchoolCareBridgeOnly } from './schoolCareBridgeTenant';

// Team lists belong to full task workspaces, not nested school portals or
// SchoolCareBridge partner companies. Keep the server's product boundary.
export function taskTeamOrganizations(organizations = []) {
  const seen = new Set();
  return (Array.isArray(organizations) ? organizations : []).filter(org => {
    const id = Number(org?.id || org?.agency_id);
    if (!id || seen.has(id) || !isTenantOrganizationType(org) || isSchoolCareBridgeOnly(org)) return false;
    seen.add(id);
    return true;
  });
}
