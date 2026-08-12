<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="$emit('close')">
      <div class="modal timeline-import-modal">
        <div class="modal-header">
          <h2>Import from Google Timeline</h2>
          <button type="button" class="btn-close" @click="$emit('close')" aria-label="Close">&times;</button>
        </div>

        <div class="modal-body">
          <div v-if="error" class="warn-box" style="margin-bottom: 12px;">{{ error }}</div>

          <p class="hint" style="margin-bottom: 12px;">
            Upload your Google Timeline <code>.json</code> export (Google Maps → Timeline → Export).
            Trips are inferred from driving segments, classified as work or personal, and odometer readings chain from your last logged trip.
            <strong>Before April 2026</strong> home office is Masters/Windchime; <strong>from April 2026</strong> Larkspur becomes home office.
          </p>

          <div v-if="step === 'upload'" class="upload-step">
            <div class="field-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div class="field">
                <label>Company car</label>
                <select v-model="form.companyCarId">
                  <option :value="null" disabled>Select car…</option>
                  <option v-for="c in cars" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
              </div>
              <div v-if="manageAccess" class="field">
                <label>Driver</label>
                <select v-model="form.userId">
                  <option v-for="u in agencyUsers" :key="u.id" :value="u.id">
                    {{ u.first_name }} {{ u.last_name }}
                  </option>
                </select>
              </div>
            </div>

            <div class="field-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px;">
              <div class="field">
                <label>From date</label>
                <input v-model="form.fromDate" type="date" />
                <div class="hint">Only trips on or after this date (e.g. 2026-01-19 to catch up after Jan 18).</div>
              </div>
              <div class="field">
                <label>To date (optional)</label>
                <input v-model="form.toDate" type="date" />
              </div>
            </div>

            <div class="field" style="margin-top: 12px;">
              <label>Timeline JSON file</label>
              <input ref="fileInput" type="file" accept=".json,application/json" @change="onFileChange" />
            </div>

            <div class="actions" style="margin-top: 16px; justify-content: flex-end;">
              <button type="button" class="btn btn-secondary" @click="$emit('close')">Cancel</button>
              <button
                type="button"
                class="btn btn-primary"
                :disabled="previewing || !canPreview"
                @click="runPreview"
              >
                {{ previewing ? 'Parsing…' : 'Preview trips' }}
              </button>
            </div>
          </div>

          <div v-else class="preview-step">
            <div class="preview-summary">
              <span>{{ includedCount }} of {{ previewRows.length }} trips selected</span>
              <span v-if="anchorEnd != null"> · Chains from <strong>{{ formatOdometer(anchorEnd) }}</strong> mi</span>
              <span v-if="homeOfficeNote"> · {{ homeOfficeNote }}</span>
            </div>

            <div class="bulk-actions" style="display: flex; gap: 8px; flex-wrap: wrap; margin: 12px 0;">
              <button type="button" class="btn btn-secondary btn-sm" @click="markAllWork">Mark all work</button>
              <button type="button" class="btn btn-secondary btn-sm" @click="markAllPersonal">Mark all personal</button>
              <button type="button" class="btn btn-secondary btn-sm" @click="selectAll(true)">Select all</button>
              <button type="button" class="btn btn-secondary btn-sm" @click="selectAll(false)">Deselect all</button>
              <button type="button" class="btn btn-secondary btn-sm" @click="step = 'upload'">Change file</button>
            </div>

            <div class="table-wrap preview-table-wrap">
              <table class="table preview-table">
                <thead>
                  <tr>
                    <th>Include</th>
                    <th>Date</th>
                    <th>From</th>
                    <th>To</th>
                    <th class="right">Miles</th>
                    <th class="right">Start</th>
                    <th class="right">End</th>
                    <th>Work?</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, idx) in previewRows" :key="idx" :class="{ personal: !row.isWork }">
                    <td>
                      <input v-model="row.include" type="checkbox" />
                    </td>
                    <td>{{ row.driveDate }}</td>
                    <td class="place-cell" :title="row.originLabel || row.origin">{{ truncate(row.originLabel || row.origin) }}</td>
                    <td class="place-cell" :title="row.destinationLabel || row.destination">{{ truncate(row.destinationLabel || row.destination) }}</td>
                    <td class="right">{{ formatOdometer(row.miles) }}</td>
                    <td class="right">{{ row.include ? formatOdometer(row.startOdometerMiles) : '—' }}</td>
                    <td class="right">{{ row.include ? formatOdometer(row.endOdometerMiles) : '—' }}</td>
                    <td>
                      <input v-model="row.isWork" type="checkbox" @change="onWorkToggle(row)" />
                    </td>
                    <td>
                      <input v-model="row.reasonForTravel" type="text" class="reason-input" />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="actions" style="margin-top: 16px; justify-content: flex-end;">
              <button type="button" class="btn btn-secondary" @click="$emit('close')">Cancel</button>
              <button
                type="button"
                class="btn btn-primary"
                :disabled="committing || includedCount === 0"
                @click="commitImport"
              >
                {{ committing ? 'Importing…' : `Import ${includedCount} trip(s)` }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';

const authStore = useAuthStore();

const props = defineProps({
  agencyId: { type: Number, required: true },
  manageAccess: { type: Boolean, default: false },
  cars: { type: Array, default: () => [] }
});

const emit = defineEmits(['close', 'imported']);

const step = ref('upload');
const error = ref('');
const previewing = ref(false);
const committing = ref(false);
const fileInput = ref(null);
const selectedFile = ref(null);
const previewRows = ref([]);
const anchorEnd = ref(null);
const homeOfficeNote = ref('');
const agencyUsers = ref([]);

const form = ref({
  companyCarId: null,
  userId: authStore.user?.id || null,
  fromDate: '2026-01-19',
  toDate: ''
});

const canPreview = computed(() => form.value.companyCarId && selectedFile.value && form.value.fromDate);

const includedCount = computed(() => previewRows.value.filter((r) => r.include).length);

function formatOdometer(val) {
  const n = Number(val);
  if (!Number.isFinite(n)) return '—';
  return n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1);
}

function truncate(s, max = 48) {
  const t = String(s || '');
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function onFileChange(ev) {
  selectedFile.value = ev.target?.files?.[0] || null;
}

function recalcOdometerPreview() {
  let prev = Number(anchorEnd.value);
  if (!Number.isFinite(prev)) prev = 0;

  for (const row of previewRows.value) {
    if (!row.include) {
      row.startOdometerMiles = null;
      row.endOdometerMiles = null;
      continue;
    }
    const miles = Math.round(Number(row.miles || 0) * 100) / 100;
    const start = Math.round(prev * 100) / 100;
    const end = Math.round((start + miles) * 100) / 100;
    row.startOdometerMiles = start;
    row.endOdometerMiles = end;
    prev = end;
  }
}

watch(
  () => previewRows.value.map((r) => `${r.include}|${r.miles}`).join(','),
  () => recalcOdometerPreview()
);

function onWorkToggle(row) {
  if (row.isWork) {
    if (!row.reasonForTravel || row.reasonForTravel === 'Personal' || row.reasonForTravel === 'Personal errands') {
      row.reasonForTravel = 'Business travel';
    }
  } else {
    row.reasonForTravel = 'Personal';
    row.include = false;
  }
}

function markAllWork() {
  previewRows.value.forEach((r) => {
    r.isWork = true;
    r.include = true;
    if (!r.reasonForTravel || r.reasonForTravel === 'Personal') r.reasonForTravel = 'Business travel';
  });
}

function markAllPersonal() {
  previewRows.value.forEach((r) => {
    r.isWork = false;
    r.include = false;
    r.reasonForTravel = 'Personal';
  });
}

function selectAll(val) {
  previewRows.value.forEach((r) => {
    r.include = val;
    if (val && r.isWork && (r.reasonForTravel === 'Personal')) {
      r.reasonForTravel = 'Business travel';
    }
  });
}

async function loadAgencyUsers() {
  if (!props.manageAccess) return;
  try {
    const res = await api.get('/company-car/agency-users', { params: { agencyId: props.agencyId } });
    agencyUsers.value = res.data?.users || [];
    if (agencyUsers.value.length && !form.value.userId) {
      form.value.userId = agencyUsers.value[0].id;
    }
  } catch {
    agencyUsers.value = [];
  }
}

async function runPreview() {
  if (!canPreview.value) return;
  error.value = '';
  previewing.value = true;
  try {
    const fd = new FormData();
    fd.append('file', selectedFile.value);
    fd.append('agencyId', String(props.agencyId));
    fd.append('companyCarId', String(form.value.companyCarId));
    fd.append('fromDate', form.value.fromDate);
    if (form.value.toDate) fd.append('toDate', form.value.toDate);
    fd.append('geocode', 'true');

    const res = await api.post('/company-car/import/timeline/preview', fd);
    previewRows.value = (res.data?.rows || []).map((r) => ({
      ...r,
      include: r.include !== false,
      isWork: r.isWork !== false,
      reasonForTravel: r.reasonForTravel || 'Business travel'
    }));
    anchorEnd.value = res.data?.anchorEndOdometer;
    homeOfficeNote.value = res.data?.homeOfficeNote || '';
    step.value = 'preview';
    recalcOdometerPreview();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Preview failed';
  } finally {
    previewing.value = false;
  }
}

async function commitImport() {
  if (includedCount.value === 0) return;
  error.value = '';
  committing.value = true;
  try {
    recalcOdometerPreview();
    const rows = previewRows.value.map((r) => ({
      driveDate: r.driveDate,
      miles: r.miles,
      destinations: r.destinations || [r.destinationLabel || r.destination].filter(Boolean),
      reasonForTravel: r.reasonForTravel || (r.isWork ? 'Business travel' : 'Personal'),
      include: r.include,
      notes: r.startTime ? `Timeline: ${r.startTime}` : null
    }));

    await api.post('/company-car/import/timeline/commit', {
      agencyId: props.agencyId,
      companyCarId: form.value.companyCarId,
      userId: form.value.userId,
      fromDate: form.value.fromDate,
      rows
    });

    emit('imported');
    emit('close');
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Import failed';
  } finally {
    committing.value = false;
  }
}

onMounted(() => {
  if (props.cars?.length === 1) form.value.companyCarId = props.cars[0].id;
  loadAgencyUsers();
});

watch(
  () => props.cars,
  (list) => {
    if (list?.length === 1 && !form.value.companyCarId) form.value.companyCarId = list[0].id;
  },
  { immediate: true }
);
</script>

<style scoped>
.timeline-import-modal {
  width: min(960px, 96vw);
  max-height: 90vh;
}

.modal-body {
  max-height: calc(90vh - 80px);
  overflow-y: auto;
}

.preview-table-wrap {
  overflow-x: auto;
  max-height: 50vh;
}

.preview-table {
  width: 100%;
  table-layout: fixed;
  font-size: 13px;
}

.preview-table th,
.preview-table td {
  padding: 6px 8px;
  vertical-align: middle;
  border-bottom: 1px solid var(--border-color, #e9ecef);
}

.preview-table .right {
  text-align: right;
}

.place-cell {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reason-input {
  width: 100%;
  min-width: 120px;
  font-size: 12px;
}

.preview-summary {
  font-size: 13px;
  color: var(--text-muted, #6c757d);
}

tr.personal td {
  background: rgba(108, 117, 125, 0.06);
}

.bulk-actions {
  align-items: center;
}
</style>
