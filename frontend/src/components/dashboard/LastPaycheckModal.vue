<template>
  <Teleport to="body">
    <div
      v-if="loading || error || !period"
      class="pay-stub-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Last paycheck"
      @click.self="close"
    >
      <div class="last-paycheck-loading-card">
        <div v-if="loading" class="muted">Loading paycheck…</div>
        <div v-else-if="error" class="warn-box">{{ error }}</div>
        <div v-else class="muted">Pay period not found.</div>
        <button type="button" class="btn btn-secondary btn-sm" style="margin-top: 12px;" @click="close">Close</button>
      </div>
    </div>
  </Teleport>
  <PayStubDetailModal
    v-if="period"
    :show="true"
    :period="period"
    :all-periods="periods"
    @close="close"
  />
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
import PayStubDetailModal from './PayStubDetailModal.vue';
import { normalizePeriodId } from '../../utils/payStubBreakdown';

const props = defineProps({
  agencyId: { type: Number, required: true },
  payrollPeriodId: { type: Number, required: true },
});

const emit = defineEmits(['close']);

const loading = ref(false);
const error = ref('');
const periods = ref([]);

const period = computed(() => {
  const pid = normalizePeriodId(props.payrollPeriodId);
  if (!pid) return null;
  return (
    (periods.value || []).find(
      (p) => normalizePeriodId(p?.payroll_period_id) === pid
    ) || null
  );
});

const load = async () => {
  const agencyId = Number(props.agencyId || 0);
  const pid = Number(props.payrollPeriodId || 0);
  if (!agencyId || !pid) return;
  try {
    loading.value = true;
    error.value = '';
    const resp = await api.get('/payroll/me/periods', { params: { agencyId } });
    periods.value = Array.isArray(resp.data) ? resp.data : [];
  } catch (e) {
    periods.value = [];
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load paycheck';
  } finally {
    loading.value = false;
  }
};

const close = () => emit('close');

watch(() => [props.agencyId, props.payrollPeriodId], load, { immediate: true });
</script>

<style scoped>
.pay-stub-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(15, 23, 42, 0.45);
}

.last-paycheck-loading-card {
  background: #fff;
  border-radius: 12px;
  padding: 20px 24px;
  min-width: min(360px, 100%);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.15);
}

.warn-box {
  color: #b45309;
  font-size: 14px;
}

.muted {
  color: #6b7280;
  font-size: 14px;
}
</style>
