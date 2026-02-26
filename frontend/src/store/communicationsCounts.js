import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '../services/api';

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
      const [pendingRes, ticketsRes] = await Promise.allSettled([
        api.get('/communications/pending-count', { skipGlobalLoading: true }),
        api.get('/support-tickets/count', { params: { status: 'open' }, skipGlobalLoading: true })
      ]);
      if (pendingRes.status === 'fulfilled' && pendingRes.value?.data?.count != null) {
        pendingDeliveryCount.value = Number(pendingRes.value.data.count);
      }
      if (ticketsRes.status === 'fulfilled' && ticketsRes.value?.data?.count != null) {
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
