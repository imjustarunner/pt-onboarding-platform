<template>
  <div class="aps" data-testid="appointment-package-settlement">
    <div class="aps-head">
      <h4>Session settlement</h4>
      <p class="muted">
        Package autodeduct, free rebook / forfeit on no-show, or mark a fee invoice pending.
        Separate from clinical claims.
      </p>
    </div>

    <div v-if="!appointmentId" class="aps-empty muted">
      Save the appointment first, then settle complete or no-show.
    </div>

    <template v-else>
      <div class="aps-row">
        <span class="aps-k">Package</span>
        <span class="aps-v">
          <template v-if="packageEntitlementId">#{{ packageEntitlementId }}</template>
          <template v-else>Self-pay / no package</template>
        </span>
      </div>
      <div v-if="paymentStatus" class="aps-row">
        <span class="aps-k">Payment</span>
        <span class="aps-v" :class="statusClass">{{ paymentStatus }}</span>
      </div>
      <div v-if="lastResult" class="aps-result" :class="lastResult.settled ? 'ok' : 'warn'">
        {{ resultSummary }}
      </div>

      <div class="aps-actions">
        <button
          type="button"
          class="btn btn-primary btn-sm"
          :disabled="busy || disabled"
          @click="settle('completed')"
        >
          {{ busyOutcome === 'completed' ? 'Settling…' : 'Mark completed → debit package' }}
        </button>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          :disabled="busy || disabled"
          @click="settle('no_show')"
        >
          {{ busyOutcome === 'no_show' ? 'Settling…' : 'Mark no-show → miss policy' }}
        </button>
      </div>
      <p v-if="error" class="aps-err">{{ error }}</p>
    </template>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import api from '../../services/api';

const props = defineProps({
  appointmentId: { type: [Number, String], default: 0 },
  packageEntitlementId: { type: [Number, String], default: 0 },
  paymentStatus: { type: String, default: '' },
  disabled: { type: Boolean, default: false }
});

const emit = defineEmits(['settled']);

const busy = ref(false);
const busyOutcome = ref('');
const error = ref('');
const lastResult = ref(null);

const statusClass = computed(() => {
  const s = String(props.paymentStatus || '').toLowerCase();
  if (['package_consumed', 'paid', 'free_rebook'].includes(s)) return 'ok';
  if (['forfeited', 'fee_pending'].includes(s)) return 'warn';
  return '';
});

const resultSummary = computed(() => {
  const r = lastResult.value;
  if (!r) return '';
  if (!r.settled) return r.reason || 'Not settled';
  const bits = [r.outcome, r.paymentStatus];
  if (r.practitionerPackage?.action) bits.push(`practitioner:${r.practitionerPackage.action}`);
  if (r.feeCents > 0) bits.push(`fee $${(r.feeCents / 100).toFixed(2)}`);
  return bits.filter(Boolean).join(' · ');
});

async function settle(outcome) {
  const id = Number(props.appointmentId || 0);
  if (!id || busy.value) return;
  busy.value = true;
  busyOutcome.value = outcome;
  error.value = '';
  try {
    const res = await api.post(`/appointments/${id}/settle`, { outcome });
    lastResult.value = res?.data?.appointment?.settlement || res?.data?.settlement || { settled: true, outcome };
    emit('settled', res?.data?.appointment || null);
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Settlement failed';
  } finally {
    busy.value = false;
    busyOutcome.value = '';
  }
}
</script>

<style scoped>
.aps {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px 14px;
  background: #f8fafc;
  margin-top: 12px;
}
.aps-head h4 {
  margin: 0 0 4px;
  font-size: 0.95rem;
}
.aps-head p {
  margin: 0 0 10px;
  font-size: 0.8rem;
}
.aps-row {
  display: flex;
  gap: 10px;
  font-size: 0.86rem;
  margin-bottom: 4px;
}
.aps-k { color: #64748b; min-width: 72px; }
.aps-v.ok { color: #065f46; font-weight: 700; }
.aps-v.warn { color: #9a3412; font-weight: 700; }
.aps-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}
.aps-result {
  margin-top: 8px;
  font-size: 0.82rem;
  font-weight: 600;
}
.aps-result.ok { color: #065f46; }
.aps-result.warn { color: #9a3412; }
.aps-err { color: #b91c1c; font-size: 0.82rem; margin: 8px 0 0; }
.aps-empty { font-size: 0.85rem; }
</style>
