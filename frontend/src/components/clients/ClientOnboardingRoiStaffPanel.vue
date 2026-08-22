<template>
  <div class="roi-inline" :class="{ 'is-complete': stepDone && !editing }">
    <template v-if="readonly">
      <div v-if="stepDone" class="roi-complete-card">
        <div class="roi-complete-head">
          <span class="roi-complete-icon" aria-hidden="true">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 0 1 0 1.414l-8 8a1 1 0 0 1-1.414 0l-4-4a1 1 0 1 1 1.414-1.414L8 12.586l7.293-7.293a1 1 0 0 1 1.414 0z" clip-rule="evenodd"/></svg>
          </span>
          <div>
            <div class="roi-complete-title">ROI permissions complete</div>
            <div class="roi-complete-sub muted">{{ summaryText }}</div>
          </div>
        </div>
      </div>
      <p v-else class="muted small">Office staff is still configuring school ROI permissions.</p>
    </template>

    <template v-else-if="stepDone && !editing">
      <ClientOnboardingRoiExpiryEditor
        :client-id="clientId"
        :roi-expires-at="localRoiExpiresAt || roiExpiresAt"
        readonly
      />
      <div class="roi-complete-card">
        <div class="roi-complete-head">
          <span class="roi-complete-icon" aria-hidden="true">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 0 1 0 1.414l-8 8a1 1 0 0 1-1.414 0l-4-4a1 1 0 1 1 1.414-1.414L8 12.586l7.293-7.293a1 1 0 0 1 1.414 0z" clip-rule="evenodd"/></svg>
          </span>
          <div>
            <div class="roi-complete-title">ROI permissions complete</div>
            <div class="roi-complete-sub muted">{{ summaryText }}</div>
          </div>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" @click="startEditing">
          Update ROI permissions
        </button>
      </div>
    </template>

    <template v-else>
      <p v-if="visionNeedsReview" class="roi-inline-notice roi-inline-notice--warn">
        Packet Vision needs review — confirm version/signatures/DENY, then set staff access and save.
      </p>
      <p v-else-if="visionApplied" class="roi-inline-notice roi-inline-notice--ok">
        Packet Vision matched {{ visionLabel }} — staff ROI was auto-applied. Adjust only if needed.
      </p>
      <p v-else-if="paperPacketPending" class="roi-inline-notice">
        Paper packet uploaded — set each staff member’s access to match the signed form, then save.
      </p>
      <ClientOnboardingRoiExpiryEditor
        :client-id="clientId"
        :roi-expires-at="localRoiExpiresAt || roiExpiresAt"
        :readonly="readonly"
        @saved="onRoiExpirySaved"
      />
      <div v-if="loading && !rows.length" class="muted small">Loading school staff…</div>
      <div v-else-if="error" class="error small">{{ error }}</div>
      <template v-else>
        <div v-if="stepDone" class="roi-editing-bar">
          <span class="muted small">Updating ROI permissions</span>
          <button type="button" class="btn btn-link btn-sm" :disabled="saving" @click="cancelEditing">
            Cancel
          </button>
        </div>
        <div v-if="!rows.length" class="muted small">No school staff found for this school.</div>
        <template v-else>
          <div class="roi-inline-table-wrap">
            <table class="roi-inline-table">
              <thead>
                <tr>
                  <th>Staff</th>
                  <th>Current</th>
                  <th>Permission</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in rows"
                  :key="row.school_staff_user_id"
                  :class="{ 'is-dirty': isDirty(row) }"
                >
                  <td>
                    <div class="roi-staff-name">{{ displayName(row) }}</div>
                    <div class="muted tiny">{{ row.email || '—' }}</div>
                  </td>
                  <td>
                    <span
                      class="roi-state-pill"
                      :class="stateClass(row.effective_access_state)"
                      :title="stateHover(row.effective_access_state)"
                    >
                      {{ stateLabel(row.effective_access_state, row.access_level) }}
                    </span>
                  </td>
                  <td>
                    <select
                      v-model="draftStates[row.school_staff_user_id]"
                      class="roi-inline-select"
                      :disabled="saving"
                      @change="onDraftChange"
                    >
                      <option
                        v-for="opt in roiSelectOptions"
                        :key="opt.value"
                        :value="opt.value"
                        :title="opt.hover"
                      >
                        {{ opt.label }}
                      </option>
                    </select>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="roi-inline-actions">
            <button
              type="button"
              class="btn btn-primary btn-sm"
              :disabled="saving || dirtyCount === 0"
              @click="saveAllDirty"
            >
              {{ saving ? 'Saving…' : (dirtyCount ? `Save changes (${dirtyCount})` : 'Save changes') }}
            </button>
            <button
              v-if="!stepDone"
              type="button"
              class="btn btn-secondary btn-sm"
              :disabled="saving"
              @click="markComplete"
            >
              {{ saving ? 'Saving…' : 'Mark complete' }}
            </button>
            <button
              v-else-if="dirtyCount === 0"
              type="button"
              class="btn btn-secondary btn-sm"
              :disabled="saving"
              @click="finishEditing"
            >
              Done
            </button>
            <span v-if="saveMsg" class="roi-save-msg">{{ saveMsg }}</span>
            <span v-else-if="!stepDone && dirtyCount > 0" class="muted tiny">
              Save changes, or Mark complete to save and confirm they match the signed form.
            </span>
            <span v-else-if="!stepDone" class="muted tiny">
              Confirm each staff member matches the signed ROI form, then Mark complete.
            </span>
          </div>
        </template>
      </template>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
import ClientOnboardingRoiExpiryEditor from './ClientOnboardingRoiExpiryEditor.vue';
import {
  SCHOOL_STAFF_ROI_SELECT_OPTIONS,
  schoolStaffRoiHover,
  schoolStaffRoiLabel
} from '../../utils/schoolStaffRoiLabels.js';

const props = defineProps({
  clientId: { type: [Number, String], required: true },
  stepDone: { type: Boolean, default: false },
  readonly: { type: Boolean, default: false },
  roiExpiresAt: { type: String, default: null }
});
const emit = defineEmits(['updated', 'mark-complete']);

const loading = ref(false);
const saving = ref(false);
const editing = ref(false);
const error = ref('');
const saveMsg = ref('');
const rows = ref([]);
const draftStates = ref({});
const paperPacketPending = ref(false);
const visionStatus = ref(null);
const visionDetectedLabel = ref('');
const visionNeedsReview = computed(() => {
  const s = String(visionStatus.value || '');
  return s === 'needs_review' || s === 'failed';
});
const visionApplied = computed(() => String(visionStatus.value || '') === 'applied');
const visionLabel = computed(() => {
  const label = String(visionDetectedLabel.value || '').trim();
  return label ? `v${label}` : 'a packet version';
});
const localRoiExpiresAt = ref(null);

const roiSelectOptions = SCHOOL_STAFF_ROI_SELECT_OPTIONS;

function normalizeState(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'none') return 'packet';
  return ['packet', 'limited', 'roi', 'roi_docs'].includes(normalized) ? normalized : 'packet';
}

function displayName(row) {
  const first = String(row?.first_name || '').trim();
  const last = String(row?.last_name || '').trim();
  return [first, last].filter(Boolean).join(' ').trim() || row?.email || `User ${row?.school_staff_user_id || ''}`;
}

function stateLabel(effectiveState, accessLevel) {
  if (String(effectiveState || '').trim().toLowerCase() === 'expired') return schoolStaffRoiLabel('expired');
  const effective = String(effectiveState || accessLevel || '').trim().toLowerCase();
  return schoolStaffRoiLabel(effective === 'none' ? 'packet' : effective);
}

function stateHover(effectiveState) {
  return schoolStaffRoiHover(effectiveState);
}

function stateClass(effectiveState) {
  const state = String(effectiveState || '').trim().toLowerCase();
  return {
    'is-packet': state === 'packet' || state === 'none' || !state,
    'is-limited': state === 'limited',
    'is-roi': state === 'roi',
    'is-roi-docs': state === 'roi_docs',
    'is-expired': state === 'expired'
  };
}

function isDirty(row) {
  return normalizeState(draftStates.value[row.school_staff_user_id]) !== normalizeState(row.access_level);
}

const dirtyCount = computed(() => (rows.value || []).filter((r) => isDirty(r)).length);

const hasRoiGrantDraft = computed(() => (rows.value || []).some((row) => {
  const level = normalizeState(draftStates.value[row.school_staff_user_id] ?? row.access_level);
  return level === 'limited' || level === 'roi' || level === 'roi_docs';
}));

const roiAccessCount = computed(() => (rows.value || []).filter((row) => {
  const level = normalizeState(row.access_level);
  return level === 'limited' || level === 'roi' || level === 'roi_docs';
}).length);

const summaryText = computed(() => {
  const total = rows.value.length;
  if (!total) return 'School staff permissions reviewed.';
  const roi = roiAccessCount.value;
  const none = total - roi;
  const parts = [`${total} staff reviewed`];
  if (roi) parts.push(`${roi} with ROI access`);
  if (none) parts.push(`${none} with no ROI`);
  return parts.join(' · ');
});

async function load({ quiet = false } = {}) {
  const clientId = Number(props.clientId || 0);
  if (!clientId) return;
  if (!quiet) loading.value = true;
  error.value = '';
  if (!quiet) saveMsg.value = '';
  try {
    const { data } = await api.get(`/clients/${clientId}/school-roi-access`, { skipGlobalLoading: true });
    rows.value = Array.isArray(data?.staff) ? data.staff : [];
    paperPacketPending.value = data?.paper_packet_staff_roi_pending === true;
    visionStatus.value = data?.paper_packet_vision?.status || null;
    visionDetectedLabel.value = data?.paper_packet_vision?.detected_version_label || '';
    localRoiExpiresAt.value = data?.roi_expires_at || props.roiExpiresAt || null;
    draftStates.value = rows.value.reduce((acc, row) => {
      acc[row.school_staff_user_id] = normalizeState(row.access_level);
      return acc;
    }, {});
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load school staff ROI access';
    rows.value = [];
  } finally {
    if (!quiet) loading.value = false;
  }
}

function startEditing() {
  editing.value = true;
  saveMsg.value = '';
  if (!rows.value.length) load();
}

function cancelEditing() {
  editing.value = false;
  saveMsg.value = '';
  error.value = '';
  draftStates.value = rows.value.reduce((acc, row) => {
    acc[row.school_staff_user_id] = normalizeState(row.access_level);
    return acc;
  }, {});
}

function finishEditing() {
  editing.value = false;
  saveMsg.value = '';
}

function onDraftChange() {
  saveMsg.value = '';
}

async function saveAllDirty() {
  const clientId = Number(props.clientId || 0);
  if (!clientId) return;
  const dirtyRows = (rows.value || []).filter((r) => isDirty(r));
  if (!dirtyRows.length) return;

  saving.value = true;
  error.value = '';
  saveMsg.value = '';
  const errors = [];
  let saved = 0;

  for (const row of dirtyRows) {
    const uid = Number(row.school_staff_user_id || 0);
    if (!uid) continue;
    try {
      await api.put(`/clients/${clientId}/school-roi-access/${uid}`, {
        nextState: normalizeState(draftStates.value[uid])
      }, { skipGlobalLoading: true });
      saved += 1;
    } catch (e) {
      errors.push(`${displayName(row)}: ${e.response?.data?.error?.message || e.message}`);
    }
  }

  saving.value = false;

  if (errors.length) {
    error.value = `Saved ${saved}/${dirtyRows.length}. ${errors.join('; ')}`;
    return;
  }

  saveMsg.value = 'Changes saved';
  await load({ quiet: true });
  if (props.stepDone) {
    editing.value = false;
  }
  emit('updated');
}

function onRoiExpirySaved(payload) {
  localRoiExpiresAt.value = payload?.client?.roi_expires_at || localRoiExpiresAt.value;
  emit('updated', { checklist: payload });
}

async function markComplete() {
  const clientId = Number(props.clientId || 0);
  if (!clientId || saving.value) return;

  const expiry = localRoiExpiresAt.value || props.roiExpiresAt || null;
  if (hasRoiGrantDraft.value && !expiry) {
    error.value = 'Set and save the ROI expiration date before marking complete.';
    return;
  }

  saving.value = true;
  error.value = '';
  saveMsg.value = '';

  try {
    const dirtyRows = (rows.value || []).filter((r) => isDirty(r));
    if (dirtyRows.length) {
      const errors = [];
      for (const row of dirtyRows) {
        const uid = Number(row.school_staff_user_id || 0);
        if (!uid) continue;
        try {
          await api.put(`/clients/${clientId}/school-roi-access/${uid}`, {
            nextState: normalizeState(draftStates.value[uid])
          }, { skipGlobalLoading: true });
        } catch (e) {
          errors.push(`${displayName(row)}: ${e.response?.data?.error?.message || e.message}`);
        }
      }
      if (errors.length) {
        error.value = errors.join('; ');
        return;
      }
    }

    const { data } = await api.post(`/clients/${clientId}/onboarding/acknowledge-roi-staff`, {
      roi_expires_at: hasRoiGrantDraft.value ? expiry : undefined
    }, { skipGlobalLoading: true });
    editing.value = false;
    await load({ quiet: true });
    emit('mark-complete', { checklist: data });
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to mark ROI permissions complete';
  } finally {
    saving.value = false;
  }
}

watch(() => props.roiExpiresAt, (value) => {
  if (value) localRoiExpiresAt.value = value;
}, { immediate: true });

watch(() => props.clientId, () => {
  if (props.readonly) {
    load({ quiet: true });
    return;
  }
  editing.value = false;
  load();
}, { immediate: true });

watch(() => props.stepDone, (done) => {
  if (props.readonly) {
    load({ quiet: true });
    return;
  }
  if (done) {
    editing.value = false;
    load({ quiet: true });
  }
});
</script>

<style scoped>
.roi-inline {
  margin-top: 10px;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid #bae6fd;
  background: #f0f9ff;
}
.roi-inline.is-complete {
  border-color: #86efac;
  background: #f0fdf4;
  padding: 10px 12px;
}
.roi-complete-card {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.roi-complete-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}
.roi-complete-icon {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #0f766e;
  color: #fff;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.roi-complete-icon svg { width: 16px; height: 16px; }
.roi-complete-title {
  font-weight: 800;
  font-size: 0.92rem;
  color: #0f172a;
}
.roi-complete-sub { font-size: 0.78rem; margin-top: 2px; }
.roi-editing-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px dashed #cbd5e1;
}
.btn-link {
  border: none;
  background: none;
  color: #0369a1;
  font-weight: 700;
  cursor: pointer;
  padding: 0;
}
.btn-link:disabled { opacity: 0.5; cursor: not-allowed; }
.roi-inline-notice {
  margin: 0 0 10px;
  font-size: 0.82rem;
  color: #92400e;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 8px;
  padding: 8px 10px;
}
.roi-inline-notice--ok {
  color: #065f46;
  background: #ecfdf5;
  border-color: #a7f3d0;
}
.roi-inline-notice--warn {
  color: #9d174d;
  background: #fdf2f8;
  border-color: #fbcfe8;
}
.roi-inline-table-wrap { overflow-x: auto; }
.roi-inline-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.84rem;
}
.roi-inline-table th,
.roi-inline-table td {
  padding: 8px 10px;
  border-bottom: 1px solid #e0f2fe;
  text-align: left;
  vertical-align: middle;
}
.roi-inline-table th {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
  background: #fff;
}
.roi-inline-table tr.is-dirty { background: #fff; }
.roi-staff-name { font-weight: 700; color: #0f172a; }
.tiny { font-size: 0.72rem; }
.small { font-size: 0.82rem; }
.roi-state-pill {
  display: inline-block;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 3px 7px;
  border-radius: 999px;
}
.roi-state-pill.is-packet { background: #f1f5f9; color: #475569; }
.roi-state-pill.is-limited { background: #e0e7ff; color: #3730a3; }
.roi-state-pill.is-roi { background: #dcfce7; color: #166534; }
.roi-state-pill.is-roi-docs { background: #bbf7d0; color: #14532d; }
.roi-state-pill.is-expired { background: #fee2e2; color: #b91c1c; }
.roi-inline-select {
  width: 100%;
  min-width: 150px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 0.82rem;
  background: #fff;
  cursor: pointer;
}
.roi-inline-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}
.roi-save-msg { font-size: 0.82rem; font-weight: 700; color: #0369a1; }
.error { color: #b91c1c; }
.muted { color: #64748b; }
</style>
