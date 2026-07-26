<template>
  <div class="mtcp" data-testid="meeting-time-claims-panel">
    <div class="mtcp__head">
      <h4>Time Claims</h4>
      <button type="button" class="btn btn-ghost btn-sm" :disabled="loading" @click="load">Refresh</button>
    </div>
    <p v-if="!eligible" class="muted">Time claims apply to Huddles, Admin Meetings, and Town Halls.</p>
    <p v-else-if="error" class="error">{{ error }}</p>
    <p v-else-if="loading" class="muted">Loading time claims…</p>
    <div v-else-if="rows.length" class="mtcp__table-wrap">
      <table class="mtcp__table">
        <thead>
          <tr>
            <th>Attendee</th>
            <th>Code</th>
            <th>Minutes</th>
            <th>Status</th>
            <th v-if="canEdit"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="`${r.userId}-${r.claimId || 'x'}`">
            <td>
              {{ r.name }}
              <span v-if="r.isHost" class="mtcp__host">Host</span>
            </td>
            <td>{{ r.serviceCode || '—' }}</td>
            <td>
              <template v-if="canEdit && r.claimId && editingId === r.claimId">
                <input v-model.number="editMinutes" class="mtcp__input" type="number" min="0.5" step="0.5" />
              </template>
              <template v-else>
                {{ formatMins(r.totalMinutes) }}
                <span v-if="r.attendanceMinutes != null && r.attendanceMinutes !== r.totalMinutes" class="muted">
                  (attended {{ formatMins(r.attendanceMinutes) }})
                </span>
              </template>
            </td>
            <td>{{ r.status || (r.attendanceMinutes >= 0.5 ? 'pending sync' : 'no time') }}</td>
            <td v-if="canEdit" class="mtcp__edit">
              <template v-if="r.claimId && editingId === r.claimId">
                <button type="button" class="btn btn-primary btn-xs" :disabled="saving" @click="save(r)">Save</button>
                <button type="button" class="btn btn-ghost btn-xs" :disabled="saving" @click="cancelEdit">Cancel</button>
              </template>
              <button
                v-else-if="r.claimId && canEditClaim(r)"
                type="button"
                class="btn btn-secondary btn-xs"
                @click="startEdit(r)"
              >Edit</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!canEdit" class="muted mtcp__hint">Only admin, super admin, or payroll can edit claims.</p>
    </div>
    <p v-else class="muted">No attendees yet.</p>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue';
import api from '../../services/api';

const props = defineProps({
  eventId: { type: [Number, String], required: true }
});

const loading = ref(false);
const saving = ref(false);
const error = ref('');
const rows = ref([]);
const canEdit = ref(false);
const eligible = ref(true);
const editingId = ref(0);
const editMinutes = ref(0);

function formatMins(m) {
  const n = Number(m || 0);
  if (!Number.isFinite(n)) return '0';
  return String(Math.round(n * 10) / 10);
}

function canEditClaim(r) {
  const s = String(r?.status || '').toLowerCase();
  return ['submitted', 'deferred', 'rejected', 'withdrawn'].includes(s);
}

async function load() {
  const eid = Number(props.eventId || 0);
  if (!eid) return;
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get(`/team-meetings/${eid}/time-claims`, { skipGlobalLoading: true });
    eligible.value = data?.eligible !== false;
    canEdit.value = !!data?.canEdit;
    rows.value = Array.isArray(data?.rows) ? data.rows : [];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load time claims';
  } finally {
    loading.value = false;
  }
}

function startEdit(r) {
  editingId.value = Number(r.claimId || 0);
  editMinutes.value = Number(r.totalMinutes || r.attendanceMinutes || 0);
}

function cancelEdit() {
  editingId.value = 0;
  editMinutes.value = 0;
}

async function save(r) {
  const eid = Number(props.eventId || 0);
  const cid = Number(r.claimId || 0);
  if (!eid || !cid) return;
  saving.value = true;
  error.value = '';
  try {
    await api.patch(`/team-meetings/${eid}/time-claims/${cid}`, {
      totalMinutes: Number(editMinutes.value)
    }, { skipGlobalLoading: true });
    cancelEdit();
    await load();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to save';
  } finally {
    saving.value = false;
  }
}

watch(() => props.eventId, () => load());
onMounted(load);

defineExpose({ load });
</script>

<style scoped>
.mtcp { display: flex; flex-direction: column; gap: 10px; }
.mtcp__head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.mtcp__head h4 { margin: 0; font-size: 0.95rem; }
.mtcp__table-wrap { overflow-x: auto; }
.mtcp__table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.mtcp__table th, .mtcp__table td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: middle; }
.mtcp__table th { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.03em; color: #64748b; }
.mtcp__host { margin-left: 6px; font-size: 0.68rem; font-weight: 700; text-transform: uppercase; color: #0f766e; }
.mtcp__input { width: 72px; padding: 4px 6px; border: 1px solid #cbd5e1; border-radius: 6px; }
.mtcp__edit { white-space: nowrap; display: flex; gap: 4px; }
.mtcp__hint { margin-top: 6px; }
.error { color: #b91c1c; margin: 0; font-size: 0.85rem; }
.muted { color: #64748b; margin: 0; font-size: 0.85rem; }
</style>
