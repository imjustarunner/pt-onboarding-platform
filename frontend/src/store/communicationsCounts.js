import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '../services/api';
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

  const fetchCounts = async () => {
    try {
      const authStore = useAuthStore();
      const agencyStore = useAgencyStore();
      const role = String(authStore.user?.role || '').toLowerCase();
      // Match GET /support-tickets/count authorization (avoid 403 noise for providers, etc.).
      const canFetchOpenTicketCount =
        role === 'school_staff' ||
        role === 'admin' ||
        role === 'super_admin' ||
        role === 'support' ||
        role === 'staff' ||
        role === 'clinical_practice_assistant' ||
        role === 'provider_plus';
      
      const agencyId = agencyStore.currentAgency?.id;
      const params = agencyId ? { agencyId } : {};
      const membershipCount = (agencyStore.userAgencies || []).length;
      const combineAll = role === 'super_admin' || membershipCount > 1;
      const messageParams = {};
      if (combineAll) messageParams.allAgencies = 'true';
      else if (agencyId) messageParams.agencyId = agencyId;
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

      const [pendingRes, centerRes, personalRes, ticketsRes] = await Promise.allSettled([
        canFetchPendingDelivery
          ? api.get('/communications/pending-count', { skipGlobalLoading: true, skipAuthRedirect: true })
          : Promise.resolve({ data: { count: 0 } }),
        canFetchOpenTicketCount
          ? api.get('/communications/center-summary', { params, skipGlobalLoading: true, skipAuthRedirect: true })
          : Promise.resolve({ data: {} }),
        api.get('/messages/dashboard-summary', { params: messageParams, skipGlobalLoading: true, skipAuthRedirect: true }).catch(() => ({ data: {} })),
        canFetchOpenTicketCount
          ? api.get('/support-tickets/count', { params: { status: 'open' }, skipGlobalLoading: true, skipAuthRedirect: true })
          : Promise.resolve({ data: {} })
      ]);

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

      if (personalRes.status === 'fulfilled' && personalRes.value?.data?.cards) {
        unreadMessagesCount.value = Number(personalRes.value.data.cards.unread || 0);
      }
    } catch (e) {
      // Silently ignore - counts are best-effort for badge display
    }
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
