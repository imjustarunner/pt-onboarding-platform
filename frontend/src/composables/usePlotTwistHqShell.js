import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../store/auth';
import { useAgencyStore } from '../store/agency';

/**
 * True when the signed-in super admin is in unscoped Plot Twist HQ context
 * (no tenant selected, no org slug on route) — same rules as SupportTicketsQueueView.
 */
export function usePlotTwistHqShell() {
  const authStore = useAuthStore();
  const agencyStore = useAgencyStore();
  const route = useRoute();

  const usePlatformShell = computed(() => {
    const role = String(authStore.user?.role || '').toLowerCase();
    if (role !== 'super_admin' && role !== 'superadmin') return false;
    if (String(route.query?.classic || '') === '1') return false;
    if (String(route.params?.organizationSlug || '').trim()) return false;
    if (agencyStore.currentAgency?.id) return false;
    return true;
  });

  return { usePlatformShell };
}
