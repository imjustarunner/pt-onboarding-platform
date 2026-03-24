import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '../services/api';
import { useAuthStore } from './auth';

/**
 * Store for Communications tab badge counts: pending deliveries + open tickets.
 * Used in top nav to show how many items need attention.
 */
export const useCommunicationsCountsStore = defineStore('communicationsCounts', () => {
  const pendingDeliveryCount = ref(0);
  const openTicketsCount = ref(0);

  const totalAttentionCount = computed(
    () => Number(pendingDeliveryCount.value || 0) + Number(openTicketsCount.value || 0)
  );

  const fetchCounts = async () => {
    try {
      const role = String(useAuthStore().user?.role || '').toLowerCase();
      // Match GET /support-tickets/count authorization (avoid 403 noise for providers, etc.).
      const canFetchOpenTicketCount =
        role === 'school_staff' ||
        role === 'admin' ||
        role === 'super_admin' ||
        role === 'support' ||
        role === 'staff' ||
        role === 'clinical_practice_assistant' ||
        role === 'provider_plus';
      if (!canFetchOpenTicketCount) {
        openTicketsCount.value = 0;
      }

      const [pendingRes, ticketsRes] = await Promise.allSettled([
        api.get('/communications/pending-count', { skipGlobalLoading: true }),
        canFetchOpenTicketCount
          ? api.get('/support-tickets/count', { params: { status: 'open' }, skipGlobalLoading: true })
          : Promise.resolve({ data: {} })
      ]);
      if (pendingRes.status === 'fulfilled' && pendingRes.value?.data?.count != null) {
        pendingDeliveryCount.value = Number(pendingRes.value.data.count);
      }
      if (
        canFetchOpenTicketCount &&
        ticketsRes.status === 'fulfilled' &&
        ticketsRes.value?.data?.count != null
      ) {
        openTicketsCount.value = Number(ticketsRes.value.data.count);
      }
    } catch (e) {
      // Silently ignore - counts are best-effort for badge display
    }
  };

  return {
    pendingDeliveryCount,
    openTicketsCount,
    totalAttentionCount,
    fetchCounts
  };
});
