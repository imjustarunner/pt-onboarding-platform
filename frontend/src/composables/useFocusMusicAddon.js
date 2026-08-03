/**
 * Composable for Focus Music add-on feature gating.
 */
import { ref, watch, nextTick } from 'vue';
import api from '../services/api';

const cache = new Map();

export function useFocusMusicAddon(agencyIdRef) {
  const focusMusicEnabled = ref(false);
  const loading = ref(false);

  const fetchAddons = async () => {
    const id = typeof agencyIdRef === 'function' ? agencyIdRef() : (agencyIdRef?.value ?? agencyIdRef);
    const agencyId = Number(id);
    if (!agencyId || !Number.isInteger(agencyId)) {
      focusMusicEnabled.value = false;
      return;
    }
    if (cache.has(agencyId) && cache.get(agencyId) === true) {
      focusMusicEnabled.value = true;
      return;
    }
    loading.value = true;
    try {
      const res = await api.get(`/billing/${agencyId}/addons`, { skipGlobalLoading: true });
      const enabled = Boolean(res.data?.focusMusic);
      if (enabled) cache.set(agencyId, true);
      focusMusicEnabled.value = enabled;
    } catch {
      focusMusicEnabled.value = false;
    } finally {
      loading.value = false;
    }
  };

  if (agencyIdRef != null) {
    watch(agencyIdRef, fetchAddons, { immediate: true, flush: 'post' });
  } else {
    nextTick(() => fetchAddons());
  }

  return { focusMusicEnabled, loading, refetch: fetchAddons };
}
