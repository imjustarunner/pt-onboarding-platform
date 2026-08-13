<template>
  <div class="clh">
    <p class="hint clh-intro">
      Provider and agency submissions for this client, by school year.
      New clients start here; spring continue moves them into the next year, and fall lives on that next year.
      Open items stay on the year they belong to until they are submitted.
    </p>
    <div v-if="loading" class="muted">Loading school-year history…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="!years.length" class="muted">No school-year submissions on file yet.</div>
    <div v-else class="clh-years">
      <section v-for="year in years" :key="year.schoolYear" class="clh-year">
        <header class="clh-year-head">
          <h3>{{ year.schoolYear }}</h3>
          <span v-if="year.schoolYear === joinSchoolYear" class="clh-pill">Joined</span>
        </header>
        <ol class="clh-events">
          <li v-for="ev in year.events" :key="ev.id" class="clh-event" :class="{ 'clh-event--pending': ev.kind === 'action_needed' }">
            <div class="clh-event-main">
              <div class="clh-event-title">{{ ev.title }}</div>
              <div class="clh-event-meta">
                <span v-if="ev.statusLabel" class="clh-status">{{ ev.statusLabel }}</span>
                <span v-if="ev.completedAt" class="muted">{{ formatWhen(ev.completedAt) }}</span>
              </div>
              <dl v-if="detailRows(ev).length" class="clh-details">
                <template v-for="row in detailRows(ev)" :key="row.label">
                  <dt>{{ row.label }}</dt>
                  <dd>{{ row.value }}</dd>
                </template>
              </dl>
            </div>
            <button
              v-if="ev.canView && ev.actionKey"
              type="button"
              class="btn btn-secondary btn-sm"
              @click="$emit('view-event', ev)"
            >
              View
            </button>
          </li>
        </ol>
      </section>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  clientId: { type: [Number, String], required: true }
});
defineEmits(['view-event']);

const loading = ref(false);
const error = ref('');
const years = ref([]);
const joinSchoolYear = ref('');

async function load() {
  const id = Number(props.clientId || 0);
  if (!id) return;
  loading.value = true;
  error.value = '';
  try {
    const r = await api.get(`/clients/${id}/lifecycle-history`, { skipGlobalLoading: true });
    years.value = Array.isArray(r.data?.years) ? r.data.years : [];
    joinSchoolYear.value = String(r.data?.joinSchoolYear || '');
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load school-year history';
    years.value = [];
  } finally {
    loading.value = false;
  }
}

function formatWhen(value) {
  if (!value) return '';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return String(value).slice(0, 10);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function yesNo(v) {
  if (v === true) return 'Yes';
  if (v === false) return 'No';
  return '—';
}

function detailRows(ev) {
  const d = ev?.details || {};
  if (ev.kind === 'new_client') {
    return [
      { label: 'Parents contacted', value: d.parentsContactedAt || '—' },
      { label: 'Contact successful', value: yesNo(d.parentsContactedSuccessful) },
      { label: 'First service', value: d.firstServiceAt || '—' }
    ];
  }
  if (ev.kind === 'spring_update') {
    return [
      { label: 'Summer notes', value: d.summerNotes || '—' },
      { label: 'Fall plan', value: d.fallPlanKnown === 'known' ? (d.fallNotes || 'Known') : (d.fallPlanKnown || '—') },
      { label: 'Next year', value: d.carriesToNextYear ? 'Moved forward if continuing' : 'Not carried forward' }
    ].filter((row) => row.value && row.value !== '—');
  }
  if (ev.kind === 'spring_carryforward') {
    return [{ label: 'From', value: d.fromSchoolYear || '—' }];
  }
  if (ev.kind === 'fall_confirmation') {
    return [
      { label: 'Private comment', value: d.privateComment || '—' },
      { label: 'Support follow-up', value: d.supportFollowUp ? 'Yes' : 'No' }
    ].filter((row) => row.label !== 'Private comment' || (d.privateComment && d.privateComment !== '—'));
  }
  if (ev.kind === 'agency_intake') {
    return [
      { label: 'Packet', value: d.packetType || '—' },
      { label: 'Insurance reviewed', value: yesNo(d.insuranceReviewed) }
    ];
  }
  if (ev.kind === 'action_needed') {
    return [{ label: 'Status', value: 'Waiting on this step' }];
  }
  return [];
}

onMounted(load);
watch(() => props.clientId, load);
</script>

<style scoped>
.clh-intro { margin-top: 0; max-width: 52rem; }
.clh-years { display: flex; flex-direction: column; gap: 18px; }
.clh-year {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px 16px;
  background: var(--surface, #fff);
}
.clh-year-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.clh-year-head h3 { margin: 0; font-size: 1.05rem; }
.clh-pill {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(102, 152, 120, 0.16);
  color: #145A3D;
}
.clh-events { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.clh-event {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.03);
}
.clh-event-title { font-weight: 700; }
.clh-event-meta { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 2px; font-size: 13px; }
.clh-status { font-weight: 650; color: #145A3D; }
.clh-details {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 2px 12px;
  margin: 8px 0 0;
  font-size: 13px;
}
.clh-details dt { color: var(--text-secondary, #64748b); }
.clh-event--pending { background: rgba(217, 119, 6, 0.08); }
.clh-event--pending .clh-status { color: #b45309; }
</style>
