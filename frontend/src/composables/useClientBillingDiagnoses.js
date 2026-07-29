import { ref, computed, watch, unref } from 'vue';
import api from '../services/api';

/**
 * Billing-import diagnoses for a clinical client.
 * @param {import('vue').MaybeRefOrGetter<number|null>} agencyId
 * @param {import('vue').MaybeRefOrGetter<number|null>} clientId
 * @param {import('vue').MaybeRefOrGetter<boolean>} enabled
 */
export function useClientBillingDiagnoses(agencyId, clientId, enabled = true) {
  const diagnoses = ref([]);
  const loading = ref(false);
  const error = ref('');

  const primaryDiagnosis = computed(() => {
    const first = (diagnoses.value || [])[0];
    if (!first) return null;
    return {
      code: first.code || '—',
      description: first.description || first.name || ''
    };
  });

  const primaryDiagnosisLabel = computed(() => primaryDiagnosis.value?.code || '—');

  async function load() {
    if (!unref(enabled)) {
      diagnoses.value = [];
      return;
    }
    const aid = Number(unref(agencyId) || 0);
    const cid = Number(unref(clientId) || 0);
    if (!aid || !cid) {
      diagnoses.value = [];
      return;
    }
    loading.value = true;
    error.value = '';
    try {
      const r = await api.get(`/billing-reports/clients/${cid}/diagnoses`, {
        params: { agencyId: aid },
        skipGlobalLoading: true
      });
      diagnoses.value = Array.isArray(r.data?.diagnoses) ? r.data.diagnoses : [];
    } catch (e) {
      error.value = e.response?.data?.error?.message || e.message || 'Failed to load diagnoses';
      diagnoses.value = [];
    } finally {
      loading.value = false;
    }
  }

  watch(
    () => [unref(agencyId), unref(clientId), unref(enabled)],
    () => { void load(); },
    { immediate: true }
  );

  return {
    diagnoses,
    loading,
    error,
    load,
    primaryDiagnosis,
    primaryDiagnosisLabel
  };
}
