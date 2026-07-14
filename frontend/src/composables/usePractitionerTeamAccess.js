import { computed, onMounted, ref, watch } from 'vue';
import api from '../services/api';
import { useAuthStore } from '../store/auth';
import { useAgencyStore } from '../store/agency';
import { isPractitionerOrgType } from '../utils/practitionerVertical';

const DEFAULT_PERMS = Object.freeze({
  clients: true,
  inquiries: true,
  calendar: true,
  discovery: true,
  packets: true,
  messages: true
});

/**
 * Loads practitioner team access for the current tenant (owner vs assistant caps).
 */
export function usePractitionerTeamAccess() {
  const authStore = useAuthStore();
  const agencyStore = useAgencyStore();

  const loading = ref(false);
  const isOwner = ref(true);
  const permissions = ref({ ...DEFAULT_PERMS });
  const error = ref('');

  const agencyId = computed(() => {
    const current = agencyStore.currentAgency?.value ?? agencyStore.currentAgency;
    return Number(current?.id || 0) || 0;
  });

  const orgType = computed(() => {
    const current = agencyStore.currentAgency?.value ?? agencyStore.currentAgency;
    return current?.organization_type || current?.organizationType || '';
  });

  const isPractitioner = computed(() => isPractitionerOrgType(orgType.value));

  async function refresh() {
    if (!isPractitioner.value || !agencyId.value) {
      isOwner.value = true;
      permissions.value = { ...DEFAULT_PERMS };
      return;
    }
    const role = String(authStore.user?.role || '').toLowerCase();
    // Client / non-employee surfaces should not hit the team API.
    if (['client_guardian', 'kiosk'].includes(role) || !role) {
      isOwner.value = false;
      permissions.value = { ...DEFAULT_PERMS };
      return;
    }
    if (role === 'admin' || role === 'super_admin' || role === 'support') {
      isOwner.value = true;
      permissions.value = { ...DEFAULT_PERMS };
    }
    loading.value = true;
    error.value = '';
    try {
      const res = await api.get('/practitioner-team/me', { params: { agencyId: agencyId.value } });
      isOwner.value = !!res.data?.isOwner;
      permissions.value = { ...DEFAULT_PERMS, ...(res.data?.permissions || {}) };
    } catch (e) {
      error.value = e?.response?.data?.error?.message || e.message || '';
      // Fail open for owners; fail closed-ish for staff (hide owner nav)
      if (role === 'staff') {
        isOwner.value = false;
        permissions.value = { ...DEFAULT_PERMS };
      } else {
        isOwner.value = true;
        permissions.value = { ...DEFAULT_PERMS };
      }
    } finally {
      loading.value = false;
    }
  }

  onMounted(refresh);
  watch([agencyId, orgType], refresh);

  return {
    loading,
    isOwner,
    permissions,
    error,
    refresh,
    isPractitioner,
    agencyId
  };
}
