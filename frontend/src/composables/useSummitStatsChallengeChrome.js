import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAgencyStore } from '../store/agency';

/**
 * Canonical SSC slug(s). The platform org may have been created as "summit-stats" historically,
 * but the public-facing URL is always /ssc. Support both so the chrome works during any
 * in-flight redirect and on any env where the slug differs.
 */
const SSC_SLUGS = new Set(
  ['ssc', 'summit-stats', import.meta.env.VITE_SUMMIT_STATS_PLATFORM_SLUG].filter(Boolean).map((s) =>
    String(s).toLowerCase().trim()
  )
);

/** True when the user is in the Summit Stats Challenge surface. */
export function useSummitStatsChallengeChrome() {
  const route = useRoute();
  const agencyStore = useAgencyStore();
  return computed(() => {
    const slug = String(route.params?.organizationSlug || '').toLowerCase().trim();
    if (SSC_SLUGS.has(slug)) return true;
    const t = String(
      agencyStore.currentAgency?.organization_type || agencyStore.currentAgency?.organizationType || ''
    )
      .toLowerCase()
      .trim();
    return t === 'affiliation';
  });
}
