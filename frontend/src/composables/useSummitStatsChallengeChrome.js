import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAgencyStore } from '../store/agency';
import { isSummitPlatformRouteSlug } from '../utils/summitPlatformSlugs.js';

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
    const t = String(
      agencyStore.currentAgency?.organization_type || agencyStore.currentAgency?.organizationType || ''
    )
      .toLowerCase()
      .trim();
    return t === 'affiliation';
  });
}
