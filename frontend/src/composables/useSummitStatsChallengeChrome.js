import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAgencyStore } from '../store/agency';
import { isSummitPlatformRouteSlug } from '../utils/summitPlatformSlugs.js';
import { isBookClubAgency } from '../utils/bookClubAgency.js';

export {
  isSummitPlatformRouteSlug,
  isSummitPlatformRouteSlug as isSummitPlatformDashboardSlug,
  SUMMIT_PLATFORM_ROUTE_SLUGS,
  NATIVE_APP_ORG_SLUG
} from '../utils/summitPlatformSlugs.js';

/** True when the user is in the Summit Stats Team Challenge surface (SSC / SSTC / aliases). */
export function useSummitStatsChallengeChrome() {
  const route = useRoute();
  const agencyStore = useAgencyStore();
  return computed(() => {
    const slug = String(route.params?.organizationSlug || '').toLowerCase().trim();
    if (isSummitPlatformRouteSlug(slug)) return true;
    const agency = agencyStore.currentAgency;
    // Book Club uses affiliation org type but is not Summit Stats Team Challenge.
    if (isBookClubAgency(agency)) return false;
    const t = String(agency?.organization_type || agency?.organizationType || '')
      .toLowerCase()
      .trim();
    return t === 'affiliation';
  });
}
