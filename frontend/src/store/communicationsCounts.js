import { canAccessTicketDesk } from '../utils/ticketAccess.js';
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '../services/api';
import { getStartupData, startupRequestScope } from '../services/startupRequests';
import { useAuthStore } from './auth';
import { useAgencyStore } from './agency';

/**
 * Store for Communications tab badge counts: unread messages, support attention, pending deliveries.
 * Used in top nav to show how many items need attention.
 */
export const useCommunicationsCountsStore = defineStore('communicationsCounts', () => {
  const pendingDeliveryCount = ref(0);
  const openTicketsCount = ref(0);
  const unreadMessagesCount = ref(0);
  const supportAttentionCount = ref(0);
  const qualityIssuesCount = ref(0);

  const totalAttentionCount = computed(
    () =>
      Number(unreadMessagesCount.value || 0) +
      Number(supportAttentionCount.value || 0) +
      Number(qualityIssuesCount.value || 0) +
      Number(pendingDeliveryCount.value || 0)
  );

  const pendingCounts = new Map();
  let activeContext = null;
  const contextKey = () => {
    const user = useAuthStore().user;
    return JSON.stringify([user?.id, user?.role, useAgencyStore().currentAgency?.id, startupRequestScope()]);
  };
  const clearCounts = () => {
    pendingDeliveryCount.value = 0;
    openTicketsCount.value = 0;
    unreadMessagesCount.value = 0;
    supportAttentionCount.value = 0;
    qualityIssuesCount.value = 0;
  };

  const loadCounts = async (requestContext) => {
    try {
      const authStore = useAuthStore();
      const agencyStore = useAgencyStore();
      const role = String(authStore.user?.role || '').toLowerCase();
      const isFamilyAccount = ['client_guardian', 'client'].includes(role);
      // Match the summary endpoint's narrower role check; staff ticket access
      // alone does not authorize an organization-wide communications summary.
      const canFetchCenterSummary = ['admin', 'support', 'super_admin'].includes(role);
      // Match GET /support-tickets/count authorization (avoid 403 noise for providers, etc.).
      const canFetchOpenTicketCount = role === 'school_staff' || canAccessTicketDesk(authStore.user, agencyStore.currentAgency?.id);
      
      const agencyId = agencyStore.currentAgency?.id;
      const params = agencyId ? { agencyId } : {};
      // Backend pending-count is admin/support/staff/super_admin only — skip for providers etc.
      const canFetchPendingDelivery =
        role === 'admin' ||
        role === 'super_admin' ||
        role === 'support' ||
        role === 'staff';

      if (!canFetchOpenTicketCount) {
        openTicketsCount.value = 0;
        supportAttentionCount.value = 0;
      }
      if (!canFetchPendingDelivery) {
        pendingDeliveryCount.value = 0;
        qualityIssuesCount.value = 0;
      }

      let [pendingRes, centerRes, personalRes, ticketsRes] = await Promise.allSettled([
        canFetchPendingDelivery && !canFetchCenterSummary
          ? api.get('/communications/pending-count', { timeout: 30000, skipGlobalLoading: true, skipAuthRedirect: true })
          : Promise.resolve({ data: { count: 0 } }),
        canFetchCenterSummary
          ? getStartupData('/communications/center-summary', { params, skipGlobalLoading: true, skipAuthRedirect: true })
          : Promise.resolve({ data: {} }),
        agencyId && !isFamilyAccount && role !== 'school_staff'
          ? api.get('/communications/attention-summary', { params: { agencyId, hubScope: 1 }, timeout: 30000, skipGlobalLoading: true, skipAuthRedirect: true })
          : Promise.resolve({ data: { summary: { unread: 0 } } }),
        canFetchOpenTicketCount
          ? api.get('/support-tickets/count', { params: { status: 'open' }, timeout: 30000, skipGlobalLoading: true, skipAuthRedirect: true })
          : Promise.resolve({ data: {} })
      ]);

      // The center summary already includes delivery and quality counts. Only
      // run the separate scan as a fallback when that shared request fails.
      if (contextKey() !== requestContext) return;
      if (canFetchPendingDelivery && centerRes.status === 'rejected') {
        [pendingRes] = await Promise.allSettled([
          api.get('/communications/pending-count', { timeout: 30000, skipGlobalLoading: true, skipAuthRedirect: true })
        ]);
      }
      if (contextKey() !== requestContext) return;

      if (pendingRes.status === 'fulfilled' && pendingRes.value?.data) {
        pendingDeliveryCount.value = Number(pendingRes.value.data.count || 0);
        if (pendingRes.value.data.qualityIssuesCount != null) {
          qualityIssuesCount.value = Number(pendingRes.value.data.qualityIssuesCount || 0);
        }
      }

      if (centerRes.status === 'fulfilled' && centerRes.value?.data) {
        const data = centerRes.value.data;
        const openTotal = Number(data.tickets?.open || 0) + Number(data.tickets?.in_progress || 0);
        // Match Communications Center Support Hub + Automation attention
        supportAttentionCount.value = openTotal;
        if (data.engagement?.qualityIssuesCount != null) {
          qualityIssuesCount.value = Number(data.engagement.qualityIssuesCount || 0);
        }
        if (data.engagement?.pendingCount != null) {
          pendingDeliveryCount.value = Number(data.engagement.pendingCount || 0);
        }
      }

      if (
        canFetchOpenTicketCount &&
        ticketsRes.status === 'fulfilled' &&
        ticketsRes.value?.data?.count != null
      ) {
        // We keep the original standalone count for those who just use the Tickets tab
        openTicketsCount.value = Number(ticketsRes.value.data.count);
      }

      if (personalRes.status === 'fulfilled' && personalRes.value?.data?.summary) {
        unreadMessagesCount.value = Number(personalRes.value.data.summary.unread || 0);
      }
    } catch (e) {
      // Silently ignore - counts are best-effort for badge display
    }
  };

  const fetchCounts = () => {
    const key = contextKey();
    if (key !== activeContext) {
      clearCounts();
      activeContext = key;
    }
    if (!useAuthStore().user?.id) return Promise.resolve();
    if (pendingCounts.has(key)) return pendingCounts.get(key);
    const request = loadCounts(key).finally(() => {
      if (pendingCounts.get(key) === request) pendingCounts.delete(key);
    });
    pendingCounts.set(key, request);
    return request;
  };

  return {
    pendingDeliveryCount,
    openTicketsCount,
    unreadMessagesCount,
    supportAttentionCount,
    qualityIssuesCount,
    totalAttentionCount,
    fetchCounts
  };
});
