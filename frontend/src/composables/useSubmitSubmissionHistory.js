import { computed, ref, watch } from 'vue';
import api from '../services/api';
import {
  groupSubmissionHistory,
  normalizeBudgetExpenses,
  normalizeCompanyCarTrips,
  normalizeCompanyCardExpenses,
  normalizeEventTimeSessions,
  normalizeMedcancelClaims,
  normalizeMileageClaims,
  normalizePtoRequests,
  normalizeReimbursementClaims,
  normalizeTimeClaims,
} from '../utils/submitSubmissionHistory';

/**
 * Load the current user's payroll-style submissions for the Submit hub history column.
 */
export function useSubmitSubmissionHistory({ agencyId, userId, flags, enabled }) {
  const loading = ref(false);
  const error = ref('');
  const items = ref([]);

  const resolve = (v) => (v && typeof v === 'object' && 'value' in v ? v.value : v);

  const load = async () => {
    const aid = Number(resolve(agencyId) || 0);
    const uid = Number(resolve(userId) || 0);
    const f = resolve(flags) || {};
    if (!aid || !uid) {
      items.value = [];
      return;
    }

    loading.value = true;
    error.value = '';
    const params = { agencyId: aid, skipGlobalLoading: true };
    const collected = [];

    try {
      const tasks = [
        api.get('/payroll/me/mileage-claims', { params }).then((r) => {
          collected.push(...normalizeMileageClaims(r.data, { schoolOnly: false }));
          collected.push(...normalizeMileageClaims(r.data, { schoolOnly: true }));
        }),
        api.get('/payroll/me/reimbursement-claims', { params }).then((r) => {
          collected.push(...normalizeReimbursementClaims(r.data));
        }),
        api.get('/payroll/me/pto-requests', { params }).then((r) => {
          collected.push(...normalizePtoRequests(r.data));
        }),
        api.get('/payroll/me/time-claims', { params }).then((r) => {
          collected.push(...normalizeTimeClaims(r.data));
        }),
        api.get('/payroll/me/medcancel-claims', { params }).then((r) => {
          collected.push(...normalizeMedcancelClaims(r.data));
        }),
        api.get('/payroll/me/event-time', { params: { ...params, limit: 40 } }).then((r) => {
          collected.push(...normalizeEventTimeSessions(r.data?.sessions || []));
        }),
      ];

      if (f.companyCardEnabled) {
        tasks.push(
          api.get('/payroll/me/company-card-expenses', { params }).then((r) => {
            collected.push(...normalizeCompanyCardExpenses(r.data));
          })
        );
      }

      if (f.budgetExpenses) {
        tasks.push(
          api.get(`/budget/agencies/${aid}/expenses`, { params: { userId: uid, limit: 50 } }).then((r) => {
            collected.push(...normalizeBudgetExpenses(r.data?.items || []));
          })
        );
      }

      if (f.companyCar) {
        tasks.push(
          api.get('/company-car/company-car-trips', { params: { agencyId: aid, limit: 30 } }).then((r) => {
            collected.push(...normalizeCompanyCarTrips(r.data?.trips || []));
          })
        );
      }

      await Promise.allSettled(tasks);
      items.value = collected;
    } catch (e) {
      error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load submission history';
      items.value = collected;
    } finally {
      loading.value = false;
    }
  };

  const historyBlocksForGroup = (groupId) => groupSubmissionHistory(items.value, groupId);

  const pendingCount = computed(() => items.value.filter((i) => i.isPending).length);

  watch(
    () => [resolve(agencyId), resolve(userId), resolve(enabled), JSON.stringify(resolve(flags) || {})],
    ([aid, uid, en]) => {
      if (en === false || !aid || !uid) {
        items.value = [];
        return;
      }
      void load();
    },
    { immediate: true }
  );

  return {
    loading,
    error,
    items,
    pendingCount,
    historyBlocksForGroup,
    refresh: load,
  };
}
