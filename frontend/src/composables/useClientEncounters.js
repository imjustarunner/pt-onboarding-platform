import { ref, computed, watch, unref } from 'vue';
import api from '../services/api';

/**
 * Shared billing-encounter fetch for client chart (overview KPIs, medical record, billing).
 * @param {import('vue').MaybeRefOrGetter<number|null>} agencyId
 * @param {import('vue').MaybeRefOrGetter<number|null>} clientId
 * @param {{ medicalOnly?: boolean }} [options] - medicalOnly uses /medical-record (no financial columns)
 */
export function useClientEncounters(agencyId, clientId, options = {}) {
  const medicalOnly = options.medicalOnly === true;
  const enabled = options.enabled !== undefined ? options.enabled : true;
  const encounters = ref([]);
  const loading = ref(false);
  const error = ref('');

  const sortedEncounters = computed(() => {
    const list = Array.isArray(encounters.value) ? [...encounters.value] : [];
    return list.sort((a, b) => {
      const da = new Date(a?.service_date || 0).getTime();
      const db = new Date(b?.service_date || 0).getTime();
      return db - da;
    });
  });

  const lastSession = computed(() => sortedEncounters.value[0] || null);

  const sessionCount = computed(() => sortedEncounters.value.length);

  const unsignedNotesCount = computed(() =>
    sortedEncounters.value.filter((row) => {
      const s = String(row?.note_status || 'none');
      return s !== 'signed';
    }).length
  );

  const totals = computed(() => {
    let totalBilled = 0;
    let patientBalance = 0;
    let insuranceOutstanding = 0;
    let paymentsReceived = 0;
    for (const row of sortedEncounters.value) {
      const charge = Number(row?.charge_rate);
      const ptBal = Number(row?.patient_balance);
      const insOwed = Number(row?.insurance_outstanding);
      const ptAmt = Number(row?.patient_amount);
      const insAmt = Number(row?.insurance_amount);
      if (Number.isFinite(charge)) totalBilled += charge;
      if (Number.isFinite(ptBal)) patientBalance += ptBal;
      if (Number.isFinite(insOwed)) insuranceOutstanding += insOwed;
      if (Number.isFinite(ptAmt)) paymentsReceived += ptAmt;
      if (Number.isFinite(insAmt)) paymentsReceived += insAmt;
    }
    return { totalBilled, patientBalance, insuranceOutstanding, paymentsReceived };
  });

  const accountBalance = computed(
    () => totals.value.patientBalance + totals.value.insuranceOutstanding
  );

  const pendingClaimsCount = computed(() =>
    sortedEncounters.value.filter((row) => {
      const ins = Number(row?.insurance_outstanding);
      return Number.isFinite(ins) && ins > 0;
    }).length
  );

  const recentPaymentLines = computed(() =>
    sortedEncounters.value
      .filter((row) => {
        const pt = Number(row?.patient_amount);
        const ins = Number(row?.insurance_amount);
        return (Number.isFinite(pt) && pt > 0) || (Number.isFinite(ins) && ins > 0);
      })
      .slice(0, 5)
  );

  async function load() {
    if (!unref(enabled)) {
      encounters.value = [];
      return;
    }
    const aid = Number(unref(agencyId) || 0);
    const cid = Number(unref(clientId) || 0);
    if (!aid || !cid) {
      encounters.value = [];
      return;
    }
    loading.value = true;
    error.value = '';
    try {
      const path = medicalOnly
        ? `/billing-reports/clients/${cid}/medical-record`
        : `/billing-reports/clients/${cid}/encounters`;
      const r = await api.get(path, { params: { agencyId: aid }, skipGlobalLoading: true });
      encounters.value = Array.isArray(r.data?.encounters) ? r.data.encounters : [];
    } catch (e) {
      error.value = e.response?.data?.error?.message || e.message || 'Failed to load sessions';
      encounters.value = [];
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
    encounters,
    sortedEncounters,
    loading,
    error,
    load,
    lastSession,
    sessionCount,
    unsignedNotesCount,
    totals,
    accountBalance,
    pendingClaimsCount,
    recentPaymentLines
  };
}
