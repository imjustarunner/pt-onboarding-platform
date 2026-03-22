<template>
  <div class="sbepm-card sbep-portal-card">
    <div class="sbepm-head">
      <h2 class="sbepm-title">Program week pattern</h2>
      <p class="sbepm-desc muted">
        Recurring meeting times for this skills group. Saving updates the integrated company event description.
      </p>
    </div>
    <div v-if="meetingsLoading" class="muted">Loading…</div>
    <div v-else class="sbepm-rows">
      <div v-for="(row, idx) in rows" :key="idx" class="sbepm-row">
        <select v-model="row.weekday" class="input sbepm-select">
          <option v-for="d in weekdays" :key="d" :value="d">{{ d }}</option>
        </select>
        <input v-model="row.startTime" class="input sbepm-time" type="time" step="60" />
        <span class="muted">–</span>
        <input v-model="row.endTime" class="input sbepm-time" type="time" step="60" />
        <button type="button" class="btn btn-secondary btn-sm" @click="removeRow(idx)" :disabled="saving">Remove</button>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" @click="addRow" :disabled="saving">Add time</button>
    </div>
    <div v-if="error" class="error-box">{{ error }}</div>
    <div class="sbepm-actions">
      <button type="button" class="btn btn-primary btn-sm" :disabled="saving" @click="save">
        {{ saving ? 'Saving…' : 'Save week pattern' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: Number, required: true },
  eventId: { type: Number, required: true },
  initialMeetings: { type: Array, default: () => [] }
});

const emit = defineEmits(['saved']);

const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const rows = ref([]);
const meetingsLoading = ref(false);
const saving = ref(false);
const error = ref('');

function toTimeInput(v) {
  const s = String(v || '').slice(0, 8);
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s.slice(0, 5);
  if (/^\d{2}:\d{2}$/.test(s)) return s;
  return '';
}

function syncFromInitial() {
  const list = Array.isArray(props.initialMeetings) ? props.initialMeetings : [];
  if (!list.length) {
    rows.value = [{ weekday: 'Monday', startTime: '15:00', endTime: '16:30' }];
    return;
  }
  rows.value = list.map((m) => ({
    weekday: m.weekday || 'Monday',
    startTime: toTimeInput(m.startTime),
    endTime: toTimeInput(m.endTime)
  }));
}

function addRow() {
  rows.value.push({ weekday: 'Monday', startTime: '15:00', endTime: '16:30' });
}

function removeRow(idx) {
  rows.value.splice(idx, 1);
}

async function save() {
  error.value = '';
  saving.value = true;
  try {
    const meetings = rows.value.map((r) => ({
      weekday: r.weekday,
      startTime: r.startTime,
      endTime: r.endTime
    }));
    const res = await api.patch(
      `/skill-builders/events/${props.eventId}/group-meetings`,
      { agencyId: props.agencyId, meetings },
      { skipGlobalLoading: true }
    );
    const next = res.data?.meetings || [];
    rows.value = next.map((m) => ({
      weekday: m.weekday,
      startTime: toTimeInput(m.startTime),
      endTime: toTimeInput(m.endTime)
    }));
    emit('saved', next);
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Save failed';
  } finally {
    saving.value = false;
  }
}

watch(
  () => props.initialMeetings,
  () => syncFromInitial(),
  { immediate: true, deep: true }
);
</script>

<style scoped>
.sbepm-card {
  padding: 18px;
}
.sbepm-title {
  margin: 0 0 6px;
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--primary, #0f766e);
}
.sbepm-desc {
  margin: 0 0 12px;
  font-size: 0.88rem;
  line-height: 1.45;
}
.sbepm-rows {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sbepm-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.sbepm-select {
  min-width: 140px;
}
.sbepm-time {
  width: 120px;
}
.sbepm-actions {
  margin-top: 14px;
}
.muted {
  color: var(--text-secondary, #64748b);
}
.error-box {
  margin-top: 10px;
  color: #b91c1c;
  padding: 10px;
  background: #fef2f2;
  border-radius: 8px;
  font-size: 0.88rem;
}
</style>
