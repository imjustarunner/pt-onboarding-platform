<template>
  <section v-if="reviewAgencies.length" class="waiver-queue" aria-label="Appointment waiver reviews">
    <button type="button" class="queue-toggle" :aria-expanded="expanded" @click="expanded = !expanded">
      Appointment waiver reviews <span v-if="rows.length">({{ rows.length }}{{ hasMore ? '+' : '' }})</span>
    </button>
    <div v-if="expanded" class="queue-content">
      <div class="queue-controls">
        <label v-if="reviewAgencies.length > 1">Organization
          <select v-model.number="agencyId" @change="offset = 0; selected = null; load()">
            <option v-for="id in reviewAgencies" :key="id" :value="id">{{ agencyLabel(id) }}</option>
          </select>
        </label>
        <button type="button" :disabled="loading || saving" @click="load">Refresh</button>
      </div>
      <p class="muted">Review provider recommendations. Approval restores the original credit or waives an unpaid fee. Decisions add a signed, nonbillable session addendum.</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="loading">Loading reviews…</p>
      <p v-else-if="!rows.length">No waiver requests awaiting review.</p>
      <ul v-else>
        <li v-for="row in rows" :key="row.appointment_id">
          <div><strong>{{ row.client_name || row.title || 'Session' }}</strong> · {{ when(row) }}
            <div>{{ row.requested_by_name || 'Provider' }}: {{ row.request_reason.replaceAll('_', ' ') }}</div>
          </div>
          <button type="button" :disabled="saving" @click="openReview(row)">{{ row.status === 'documenting' ? 'Finish documentation' : 'Review' }}</button>
        </li>
      </ul>
      <div class="queue-controls" v-if="offset || hasMore">
        <button :disabled="!offset || loading" @click="offset -= 50; load()">Previous</button>
        <button :disabled="!hasMore || loading" @click="offset += 50; load()">Next</button>
      </div>
      <article v-if="selected && workflow" class="review-detail">
        <h3>{{ selected.client_name || selected.title || 'Session' }} — waiver review</h3>
        <p><strong>Recommendation:</strong> {{ selected.request_reason.replaceAll('_', ' ') }} {{ selected.request_comment || '' }}</p>
        <div class="signed-note">{{ workflow.narrative }}</div>
        <p v-if="workflow.preview?.consequence?.feeCents != null && workflow.preview?.consequence?.model === 'fee'">
          Missed-appointment fee: {{ money(workflow.preview.consequence.feeCents) }}
        </p>
        <label>Decision reason (required)
          <textarea v-model="reason" :disabled="saving || selected.status === 'documenting'" rows="3" />
        </label>
        <label class="attestation"><input v-model="signatureConfirmed" type="checkbox" :disabled="saving" /> I reviewed this request and confirm my signature on the decision.</label>
        <div class="queue-controls">
          <template v-if="selected.status !== 'documenting'">
            <button :disabled="!canDecide" @click="decide('denied')">Deny waiver &amp; sign</button>
            <button :disabled="!canDecide" @click="decide('approved')">Approve waiver &amp; sign</button>
          </template>
          <button v-else :disabled="!canDecide" @click="decide(selected.decision)">Finish saving {{ selected.decision }} decision</button>
          <button :disabled="saving" @click="selected = null">Close</button>
        </div>
      </article>
    </div>
  </section>
</template>
<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api.js';
const props = defineProps({ agencyIds: { type: Array, default: () => [] } });
const emit = defineEmits(['reviewed']);
const auth = useAuthStore(); const agencies = useAgencyStore();
const reviewAgencies = computed(() => props.agencyIds.map(Number).filter((id) => id > 0 && (
  ['admin', 'super_admin'].includes(auth.user?.role) || (auth.user?.billingAgencyIds || []).map(Number).includes(id))));
const expanded = ref(false), agencyId = ref(0), offset = ref(0), rows = ref([]), hasMore = ref(false);
const loading = ref(false), saving = ref(false), error = ref(''), selected = ref(null), workflow = ref(null);
const reason = ref(''), signatureConfirmed = ref(false);
const canDecide = computed(() => !saving.value && !loading.value && !!reason.value.trim() && signatureConfirmed.value);
const agencyLabel = (id) => (agencies.agencies || []).find((a) => Number(a.id) === id)?.name || (Number(agencies.currentAgency?.id) === id ? agencies.currentAgency.name : `Organization ${id}`);
const when = (row) => {
  const raw = String(row.start_at || '');
  const date = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(raw) ? raw : raw.replace(' ', 'T') + 'Z');
  return date.toLocaleString([], { timeZone: row.source_timezone || 'America/Denver', dateStyle: 'medium', timeStyle: 'short' });
};
const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) / 100);
let generation = 0;
async function load() {
  if (!agencyId.value || !reviewAgencies.value.includes(agencyId.value)) return;
  const request = ++generation; loading.value = true; error.value = '';
  try {
    const response = await api.get('/appointments/waiver-reviews', { params: { agencyId: agencyId.value, offset: offset.value }, skipGlobalLoading: true });
    if (request !== generation) return;
    rows.value = response.data.reviews || []; hasMore.value = response.data.hasMore === true;
  } catch (e) { if (request === generation) error.value = e.response?.data?.error?.message || 'Could not load waiver reviews.'; }
  finally { if (request === generation) loading.value = false; }
}
async function openReview(row) {
  selected.value = row; workflow.value = null; reason.value = row.decision_reason || ''; signatureConfirmed.value = false;
  error.value = ''; loading.value = true;
  try {
    const response = await api.get(`/appointments/${row.appointment_id}/change`, { skipGlobalLoading: true });
    if (selected.value === row) workflow.value = response.data.workflow;
  } catch (e) { error.value = e.response?.data?.error?.message || 'Could not load the signed session note.'; }
  finally { loading.value = false; }
}
async function decide(decision) {
  if (!canDecide.value || !selected.value) return;
  saving.value = true; error.value = '';
  const id = selected.value.appointment_id;
  try {
    await api.post(`/appointments/${id}/change/waiver-decision`, { decision, reason: reason.value.trim(), signatureConfirmed: true });
    selected.value = null; workflow.value = null; emit('reviewed', id); await load();
  } catch (e) {
    const message = e.response?.data?.error?.message || 'Could not save the waiver decision.';
    // The balance adjustment may have committed before addendum storage failed.
    await load();
    const current = rows.value.find((r) => r.appointment_id === id);
    if (current) await openReview(current);
    error.value = message;
  } finally { saving.value = false; }
}
watch(reviewAgencies, (ids) => {
  if (!ids.includes(agencyId.value)) { ++generation; rows.value = []; selected.value = null; agencyId.value = ids[0] || 0; offset.value = 0; }
  void load();
}, { immediate: true });
onMounted(() => window.addEventListener('pt-schedule-refresh', load));
onBeforeUnmount(() => { ++generation; window.removeEventListener('pt-schedule-refresh', load); });
</script>
<style scoped>
.waiver-queue { margin: 10px 0; border: 1px solid #cbd5e1; border-radius: 12px; background: var(--bg-card, #fff); color: var(--text-primary, #0f172a); }
.queue-toggle { width: 100%; text-align: left; font-weight: 700; background: transparent; border: 0; padding: 12px 16px; cursor: pointer; color: inherit; }
.queue-content { padding: 0 16px 16px; }
.queue-controls { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
button, select { padding: 8px 12px; border: 1px solid #94a3b8; border-radius: 7px; cursor: pointer; }
button:disabled { opacity: .5; cursor: default; }
ul { padding: 0; list-style: none; } li { display: flex; justify-content: space-between; gap: 12px; padding: 12px 0; border-bottom: 1px solid #e2e8f0; }
.review-detail { border: 1px solid #cbd5e1; padding: 16px; border-radius: 8px; }
.signed-note { white-space: pre-wrap; padding: 12px; background: #f1f5f9; color: #0f172a; border-radius: 8px; }
label { display: block; margin: 12px 0; } textarea { display: block; width: 100%; box-sizing: border-box; } .attestation { display: flex; gap: 8px; } [role=alert] { color: #b91c1c; }
</style>
