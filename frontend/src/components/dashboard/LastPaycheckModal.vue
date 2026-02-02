<template>
  <div class="modal-backdrop" @click.self="close">
    <div class="modal" style="width: min(980px, 100%); max-height: 85vh; overflow: auto;">
      <div class="modal-header">
        <div>
          <div class="modal-title">Last Paycheck</div>
          <div v-if="period" class="hint">
            {{ fmtDateRange(period.period_start, period.period_end) }}
          </div>
        </div>
        <button class="btn btn-secondary btn-sm" type="button" @click="close">Close</button>
      </div>

      <div v-if="loading" class="muted" style="margin-top: 10px;">Loading paycheck…</div>
      <div v-else-if="error" class="warn-box" style="margin-top: 10px;">{{ error }}</div>
      <div v-else-if="period" style="margin-top: 10px;">
        <PayrollPeriodBreakdown :period="period" :all-periods="periods" :show-title="false" />
      </div>
      <div v-else class="muted" style="margin-top: 10px;">Pay period not found.</div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import PayrollPeriodBreakdown from './PayrollPeriodBreakdown.vue';

const props = defineProps({
  agencyId: { type: Number, required: true },
  payrollPeriodId: { type: Number, required: true }
});

const emit = defineEmits(['close']);

const loading = ref(false);
const error = ref('');
const periods = ref([]);

const period = computed(() => {
  const pid = Number(props.payrollPeriodId || 0);
  if (!pid) return null;
  return (periods.value || []).find((p) => Number(p?.payroll_period_id || 0) === pid) || null;
});

const fmtDateRange = (start, end) => {
  const s = String(start || '').slice(0, 10);
  const e = String(end || '').slice(0, 10);
  if (s && e) return `${s} → ${e}`;
  return s || e || '';
};

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
onMounted(load);
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  z-index: 6000;
}

.modal {
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.18);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: flex-start;
}

.modal-title {
  font-weight: 800;
}

.hint {
  color: var(--text-secondary);
  font-size: 12px;
  margin-top: 4px;
}

.muted {
  color: var(--text-secondary);
}
</style>

