<template>
  <div class="sbobs">
    <div class="sbobs-toolbar">
      <label class="sbobs-field">
        <span class="sbobs-lbl">Session date</span>
        <input v-model="selectedDate" type="date" class="input input-sm" @change="reload" />
      </label>
      <label class="sbobs-field sbobs-field-grow">
        <span class="sbobs-lbl">Client</span>
        <select v-model.number="selectedClientId" class="input input-sm" @change="reload">
          <option :value="0">All clients</option>
          <option v-for="c in clients" :key="c.id" :value="Number(c.id)">
            {{ clientLabel(c) }}
          </option>
        </select>
      </label>
      <button type="button" class="btn btn-secondary btn-sm" :disabled="loading" @click="reload">
        {{ loading ? '…' : 'Refresh' }}
      </button>
    </div>

    <p v-if="loadError" class="error-box">{{ loadError }}</p>

    <div v-if="selectedClientId && summaryClientMode" class="sbobs-summary-block">
      <div class="sbobs-summary-hdr">
        <h4 class="sbobs-subh">Daily AI summary</h4>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          :disabled="summaryGenerating || !entriesForClient.length"
          @click="generateSummary"
        >
          {{ summaryGenerating ? 'Generating…' : summary ? 'Refresh summary' : 'Generate summary' }}
        </button>
      </div>
      <p v-if="summary?.generatedAt" class="muted small">
        {{ summary.entryCount }} entries · Generated {{ formatWhen(summary.generatedAt) }}
        <span v-if="summary.modelName"> · {{ summary.modelName }}</span>
      </p>
      <div v-if="summary?.summary" class="sbobs-summary-text">{{ summary.summary }}</div>
      <p v-else-if="!summaryGenerating" class="muted small">
        Generate a summary from today's observation entries for this client.
      </p>
      <p v-if="summaryError" class="error-box sbobs-inline-err">{{ summaryError }}</p>
    </div>

    <h4 class="sbobs-subh">Observation entries</h4>
    <p v-if="!entries.length && !loading" class="muted small">No observations logged for this date yet.</p>

    <ul v-else class="sbobs-entry-list">
      <li v-for="entry in entries" :key="entry.id" class="sbobs-entry-card">
        <div class="sbobs-entry-meta">
          <strong>{{ entry.clientName }}</strong>
          <span class="muted small"> · {{ entry.authorName }}</span>
          <span class="muted small"> · {{ formatWhen(entry.createdAt) }}</span>
        </div>
        <dl class="sbobs-entry-dl">
          <template v-if="entry.payload?.overallStatus">
            <dt>Overall</dt>
            <dd>{{ labelPreset('overallStatus', entry.payload.overallStatus) }}</dd>
          </template>
          <template v-if="activityLabels(entry).length">
            <dt>Activities</dt>
            <dd>{{ activityLabels(entry).join(' · ') }}</dd>
          </template>
          <template v-if="entry.payload?.behaviorValence">
            <dt>Behavior tone</dt>
            <dd>{{ labelPreset('behaviorValence', entry.payload.behaviorValence) }}</dd>
          </template>
          <template v-if="behaviorLabels(entry.payload).length">
            <dt>Behaviors</dt>
            <dd>{{ behaviorLabels(entry.payload).join(' · ') }}</dd>
          </template>
          <template v-if="chipLabels('strengths', entry.payload.strengths, entry.payload.strengthsOther).length">
            <dt>Strengths</dt>
            <dd>{{ chipLabels('strengths', entry.payload.strengths, entry.payload.strengthsOther).join(' · ') }}</dd>
          </template>
          <template v-if="chipLabels('struggles', entry.payload.struggles, entry.payload.strugglesOther).length">
            <dt>Struggles</dt>
            <dd>{{ chipLabels('struggles', entry.payload.struggles, entry.payload.strugglesOther).join(' · ') }}</dd>
          </template>
          <template v-if="entry.payload?.peerInteraction">
            <dt>Peer interaction</dt>
            <dd>{{ labelPreset('peerInteraction', entry.payload.peerInteraction) }}</dd>
          </template>
          <template v-if="entry.payload?.briefNote">
            <dt>Note</dt>
            <dd>{{ entry.payload.briefNote }}</dd>
          </template>
        </dl>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: [Number, String], required: true },
  eventId: { type: [Number, String], required: true },
  clients: { type: Array, default: () => [] },
  sessions: { type: Array, default: () => [] },
  clientLabelForRow: { type: Function, default: (c) => c?.fullName || c?.name || 'Client' }
});

const selectedDate = ref('');
const selectedClientId = ref(0);
const entries = ref([]);
const presets = ref({});
const summary = ref(null);
const loading = ref(false);
const loadError = ref('');
const summaryGenerating = ref(false);
const summaryError = ref('');

const summaryClientMode = computed(() => selectedClientId.value > 0);
const entriesForClient = computed(() =>
  entries.value.filter((e) => Number(e.clientId) === Number(selectedClientId.value))
);

function clientLabel(c) {
  return props.clientLabelForRow(c);
}

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatWhen(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return String(v);
  }
}

function labelPreset(category, id) {
  const list = presets.value[category] || [];
  const hit = list.find((p) => p.id === id);
  return hit?.label || String(id || '').replace(/_/g, ' ');
}

function chipLabels(category, ids, other) {
  const base = Array.isArray(ids) ? ids.map((id) => labelPreset(category, id)) : [];
  if (other) base.push(other);
  return base.filter(Boolean);
}

function labelBehavior(id) {
  for (const cat of ['behaviorsPositive', 'behaviorsConcerning']) {
    const list = presets.value[cat] || [];
    const hit = list.find((p) => p.id === id);
    if (hit) return hit.label;
  }
  return String(id || '').replace(/_/g, ' ');
}

function behaviorLabels(payload) {
  const ids = payload?.behaviors || [];
  const labels = ids.map((id) => labelBehavior(id));
  if (payload?.behaviorsOther) labels.push(payload.behaviorsOther);
  return labels.filter(Boolean);
}

function activityLabels(entry) {
  if (entry.activityLabels?.length) {
    const labels = [...entry.activityLabels];
    if (entry.payload?.activityOther) labels.push(entry.payload.activityOther);
    return labels;
  }
  const ids = entry.payload?.activityIds || [];
  const labels = ids.map((id) => `Activity #${id}`);
  if (entry.payload?.activityOther) labels.push(entry.payload.activityOther);
  return labels;
}

async function loadPresets() {
  try {
    const res = await api.get(`/skill-builders/events/${props.eventId}/observations/presets`, {
      params: { agencyId: props.agencyId },
      skipGlobalLoading: true
    });
    presets.value = res.data?.presets || {};
  } catch {
    /* optional */
  }
}

async function loadEntries() {
  if (!selectedDate.value) return;
  loading.value = true;
  loadError.value = '';
  try {
    const params = {
      agencyId: props.agencyId,
      date: selectedDate.value
    };
    if (selectedClientId.value > 0) params.clientId = selectedClientId.value;
    const res = await api.get(`/skill-builders/events/${props.eventId}/observations`, {
      params,
      skipGlobalLoading: true
    });
    entries.value = res.data?.entries || [];
  } catch (e) {
    loadError.value = e.response?.data?.error?.message || 'Could not load observations';
    entries.value = [];
  } finally {
    loading.value = false;
  }
}

async function loadSummary() {
  summary.value = null;
  summaryError.value = '';
  if (!summaryClientMode.value || !selectedDate.value) return;
  try {
    const res = await api.get(
      `/skill-builders/events/${props.eventId}/observations/clients/${selectedClientId.value}/daily-summary`,
      {
        params: { agencyId: props.agencyId, date: selectedDate.value },
        skipGlobalLoading: true
      }
    );
    summary.value = res.data?.summary || null;
  } catch {
    summary.value = null;
  }
}

async function generateSummary() {
  if (!summaryClientMode.value) return;
  summaryGenerating.value = true;
  summaryError.value = '';
  try {
    const res = await api.post(
      `/skill-builders/events/${props.eventId}/observations/clients/${selectedClientId.value}/daily-summary/generate`,
      { agencyId: props.agencyId, date: selectedDate.value },
      { skipGlobalLoading: true }
    );
    summary.value = res.data?.summary || null;
  } catch (e) {
    summaryError.value = e.response?.data?.error?.message || 'Summary generation failed';
  } finally {
    summaryGenerating.value = false;
  }
}

async function reload() {
  await loadEntries();
  await loadSummary();
}

watch(
  () => [props.eventId, props.agencyId],
  () => {
    loadPresets();
    reload();
  }
);

onMounted(() => {
  selectedDate.value = todayYmd();
  loadPresets();
  reload();
});
</script>

<style scoped>
.sbobs-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-end;
  margin-bottom: 16px;
}
.sbobs-field { display: flex; flex-direction: column; gap: 4px; min-width: 140px; }
.sbobs-field-grow { flex: 1; min-width: 200px; }
.sbobs-lbl { font-size: 12px; color: #64748b; font-weight: 600; }
.sbobs-subh { margin: 16px 0 8px; font-size: 1rem; color: #166534; }
.sbobs-summary-block {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 14px;
  margin-bottom: 16px;
}
.sbobs-summary-hdr {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.sbobs-summary-text {
  white-space: pre-wrap;
  line-height: 1.5;
  margin-top: 8px;
}
.sbobs-entry-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.sbobs-entry-card {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 12px 14px;
  background: #fff;
}
.sbobs-entry-meta { margin-bottom: 8px; }
.sbobs-entry-dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 12px;
  margin: 0;
  font-size: 0.92rem;
}
.sbobs-entry-dl dt { color: #64748b; font-weight: 600; margin: 0; }
.sbobs-entry-dl dd { margin: 0; }
.sbobs-inline-err { margin-top: 8px; }
</style>
