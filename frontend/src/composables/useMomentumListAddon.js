/**
 * Composable for Momentum List add-on feature gating.
 * Fetches agency billing addons and returns whether Momentum List is enabled.
 */
import { ref, watch } from 'vue';
import api from '../services/api';

const cache = new Map();

export function useMomentumListAddon(agencyIdRef) {
  const momentumListEnabled = ref(false);
  const loading = ref(false);

  const fetchAddons = async () => {
    const id = typeof agencyIdRef === 'function' ? agencyIdRef() : (agencyIdRef?.value ?? agencyIdRef);
    const agencyId = Number(id);
    if (!agencyId || !Number.isInteger(agencyId)) {
      momentumListEnabled.value = false;
      return;
    }
    if (cache.has(agencyId)) {
      momentumListEnabled.value = cache.get(agencyId);
      return;
    }
    loading.value = true;
    try {
      const res = await api.get(`/billing/${agencyId}/addons`);
      const enabled = Boolean(res.data?.momentumList);
      cache.set(agencyId, enabled);
      momentumListEnabled.value = enabled;
    } catch {
      momentumListEnabled.value = false;
    } finally {
      loading.value = false;
    }
  };

  if (agencyIdRef != null) {
    watch(agencyIdRef, fetchAddons, { immediate: true });
  } else {
    fetchAddons();
  }

  return { momentumListEnabled, loading, refetch: fetchAddons };
}
