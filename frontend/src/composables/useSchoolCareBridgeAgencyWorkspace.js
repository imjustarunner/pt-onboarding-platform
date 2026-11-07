import { computed, ref, unref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../store/auth';
import { useAgencyStore } from '../store/agency';
import { openTenantWorkspace } from '../services/workspaceNavigation';
import { isSchoolCareBridgeOnly } from '../utils/schoolCareBridgeTenant';
import { workspaceSlug } from '../utils/workspaceDestination';
import { readChosenOrganizationId, rememberChosenOrganization, resolveWorkingOrganization } from '../utils/workingOrganization';

export function useSchoolCareBridgeAgencyWorkspace({ partner } = {}) {
  const auth = useAuthStore(), agencies = useAgencyStore(), router = useRouter();
  const opening = ref(false), error = ref('');
  const agency = computed(() => {
    if (!auth.isAuthenticated || auth.user?.role === 'school_staff') return null;
    const fullAgencies = (agencies.userAgencies || []).filter(item =>
      String(item?.organization_type || item?.organizationType || '').toLowerCase() === 'agency'
      && Number(item.id) > 0 && workspaceSlug(item) && !isSchoolCareBridgeOnly(item));
    if (partner !== undefined) {
      const connected = unref(partner);
      if (connected?.workspaceMode !== 'connected') return null;
      if ((agencies.userAgencies || []).some(item => Number(item.id) === Number(connected.id) && isSchoolCareBridgeOnly(item))) return null;
      const membership = fullAgencies.find(item => Number(item.id) === Number(connected.id));
      if (membership) return membership;
      // This partner comes from the authenticated tenant endpoint, which already
      // checks access. Superadmins can visit a tenant without a membership row.
      return auth.user?.role === 'super_admin' && Number(connected.id) > 0 && workspaceSlug(connected)
        ? { ...connected, organization_type: 'agency' } : null;
    }
    return resolveWorkingOrganization({
      memberships: fullAgencies,
      chosenOrganizationId: readChosenOrganizationId(auth.user?.id),
      currentOrganization: agencies.currentAgency,
      role: auth.user?.role
    });
  });

  async function openAgencyWorkspace() {
    const target = agency.value;
    if (!target || opening.value) return;
    opening.value = true;
    error.value = '';
    try {
      // This click is an explicit choice. Save it so the destination's resolver
      // does not restore the SchoolCareBridge-only company after the reload.
      rememberChosenOrganization(auth.user?.id, target.id);
      await openTenantWorkspace(target, router, { path: '/dashboard' });
    } catch {
      error.value = 'We couldn’t open your agency workspace. Please try again.';
    } finally {
      opening.value = false;
    }
  }
  return { agency, opening, error, openAgencyWorkspace };
}
