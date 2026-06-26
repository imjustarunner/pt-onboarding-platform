/**
 * useProfileOverview
 *
 * Provides a single-call aggregator for the employee profile Overview tab.
 * Fetches from GET /users/:id/profile-overview which assembles account-info,
 * lifecycle summary, tasks, supervisors, recent activity, and notes in one
 * round trip on the server side.
 *
 * Usage in UserProfileView:
 *   const { overview, overviewLoading, overviewError, refreshOverview } = useProfileOverview(userId, agencyId);
 *   provide('refreshProfileOverview', refreshOverview);
 */
import { ref, watch } from 'vue';
import api from '../services/api';

export function useProfileOverview(userId, agencyId) {
  const overview = ref(null);
  const overviewLoading = ref(false);
  const overviewError = ref('');

  const refreshOverview = async () => {
    const uid = typeof userId === 'object' ? userId.value : userId;
    const aid = typeof agencyId === 'object' ? agencyId?.value : agencyId;

    if (!uid) return;
    overviewLoading.value = true;
    overviewError.value = '';
    try {
      const params = {};
      if (aid) params.agencyId = aid;
      const res = await api.get(`/users/${uid}/profile-overview`, { params });
      overview.value = res.data;
    } catch (err) {
      overviewError.value = err.response?.data?.error?.message || 'Failed to load overview data.';
      overview.value = null;
    } finally {
      overviewLoading.value = false;
    }
  };

  // Fetch immediately and again whenever userId changes
  if (typeof userId === 'object') {
    watch(userId, (newId) => {
      if (newId) void refreshOverview();
    }, { immediate: true });
  } else if (userId) {
    void refreshOverview();
  }

  return { overview, overviewLoading, overviewError, refreshOverview };
}
