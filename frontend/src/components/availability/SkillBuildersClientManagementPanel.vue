<template>
  <div class="sbcm">
    <div class="sbcm-toolbar">
      <label class="sbcm-label">
        School filter
        <select v-model="schoolFilter" class="input sbcm-select">
          <option :value="''">All schools</option>
          <option v-for="s in schoolOptions" :key="s.id" :value="String(s.id)">{{ s.name }}</option>
        </select>
      </label>
      <button type="button" class="btn btn-secondary btn-sm" :disabled="loading" @click="load">Refresh</button>
    </div>
    <div v-if="loading" class="pch-muted">Loading clients…</div>
    <div v-else-if="error" class="pch-error">{{ error }}</div>
    <div v-else-if="!rows.length" class="pch-muted">No Skill Builders (skills) clients found.</div>
    <div v-else class="sbcm-table-wrap">
      <table class="sbcm-table">
        <thead>
          <tr>
            <th>Initials</th>
            <th>School</th>
            <th>Grade</th>
            <th>Age</th>
            <th>Intake</th>
            <th>Treatment plan</th>
            <th>Confirm</th>
            <th>Events</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="`${row.clientId}-${row.schoolOrganizationId}`">
            <td>
              <button type="button" class="sbcm-status-btn sbcm-initials-btn" @click="openClientProfile(row)">
                {{ row.initials || row.identifierCode || row.clientId }}
              </button>
            </td>
            <td>{{ row.schoolName }}</td>
            <td>{{ formatGradeDisplay(row.grade) }}</td>
            <td>{{ row.ageYears != null ? row.ageYears : '—' }}</td>
            <td>
              <button
                type="button"
                class="sbcm-status-btn"
                :class="{ 'is-complete': row.intakeComplete }"
                @click="toggleIntake(row)"
              >
                {{ row.intakeComplete ? 'Complete' : 'Needed' }}
              </button>
            </td>
            <td>
              <button
                type="button"
                class="sbcm-status-btn"
                :class="{ 'is-complete': row.treatmentPlanComplete }"
                :disabled="!row.intakeComplete && !row.treatmentPlanComplete"
                @click="toggleTp(row)"
              >
                {{ row.treatmentPlanComplete ? 'Complete' : 'Needed' }}
              </button>
            </td>
            <td>
              <button type="button" class="sbcm-confirm-pill" disabled>
                {{ row.treatmentPlanComplete ? 'Confirmed' : 'Confirm' }}
              </button>
            </td>
            <td>
              <span v-if="!row.events.length" class="muted">None</span>
              <ul v-else class="sbcm-ev-list">
                <li v-for="ev in row.events" :key="ev.companyEventId" class="sbcm-ev-row">
                  <span class="sbcm-ev-name">
                    {{ ev.skillsGroupName || `Event ${ev.companyEventId}` }}
                    <span v-if="!ev.activeForProviders" class="sbcm-pill">pending</span>
                  </span>
                  <button
                    type="button"
                    class="sbcm-ev-remove"
                    @click="unassignEvent(row, ev)"
                  >
                    Remove
                  </button>
                </li>
              </ul>
            </td>
            <td class="sbcm-actions">
              <button type="button" class="btn btn-secondary btn-sm" @click="openAssign(row)">
                Assign event
              </button>
              <button
                v-if="row.events.some((e) => !e.activeForProviders)"
                type="button"
                class="btn btn-primary btn-sm"
                @click="confirmRow(row)"
              >
                Confirm / active
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="assignRow" class="sbcm-modal-overlay" @click.self="closeAssign">
      <div class="sbcm-modal" @click.stop>
        <h3>Assign to event</h3>
        <p class="sbcm-school-banner">{{ assignRow.schoolName }}</p>
        <p class="muted sbcm-modal-client-line">{{ assignRow.initials }}</p>
        <label class="sbcm-label">Search company events</label>
        <input
          v-model="assignSearchQuery"
          class="input"
          type="search"
          placeholder="Title or event ID…"
          @input="scheduleAssignSearch"
        />
        <div v-if="assignSearchLoading" class="pch-muted" style="margin-top: 8px;">Searching…</div>
        <ul v-else-if="assignSearchResults.length" class="sbcm-pick-list">
          <li v-for="ev in assignSearchResults" :key="ev.companyEventId">
            <button type="button" class="sbcm-pick-btn" @click="pickAssignEvent(ev)">
              <span class="sbcm-pick-title">{{ ev.title || `Event ${ev.companyEventId}` }}</span>
              <span class="muted sbcm-pick-meta"
                >ID {{ ev.companyEventId }}<template v-if="ev.schoolName"> · {{ ev.schoolName }}</template></span
              >
            </button>
          </li>
        </ul>
        <p v-else class="pch-muted" style="margin-top: 8px;">Type to search, or leave blank for recent events.</p>
        <p v-if="assignSelectedEvent" class="sbcm-selected">
          Selected: <strong>{{ assignSelectedEvent.title }}</strong> (ID {{ assignSelectedEvent.companyEventId }})
        </p>
        <div class="sbcm-modal-actions">
          <button type="button" class="btn btn-secondary btn-sm" @click="closeAssign">Cancel</button>
          <button type="button" class="btn btn-primary btn-sm" :disabled="assignSaving || !assignEventId" @click="submitAssign">
            {{ assignSaving ? 'Saving…' : 'Assign' }}
          </button>
        </div>
        <div v-if="assignError" class="pch-error">{{ assignError }}</div>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="profileLoading" class="sbcm-profile-loading-overlay" role="status" aria-live="polite">
        <div class="sbcm-profile-loading-card muted">Loading client…</div>
      </div>
      <div v-if="profileFullClient" class="sbcm-client-detail-lift">
        <ClientDetailPanel
          :key="`sbcm-client-${profileFullClient.id}`"
          :client="profileFullClient"
          initial-tab="skill-builders"
          :current-client-index="-1"
          :navigation-count="0"
          @close="closeClientProfile"
          @updated="onClientProfileUpdated"
        />
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
import { formatGradeDisplay } from '../../utils/clientGrade.js';
import ClientDetailPanel from '../admin/ClientDetailPanel.vue';

const props = defineProps({
  agencyId: { type: [Number, String], required: true }
});

const loading = ref(false);
const error = ref('');
const rawClients = ref([]);
const schoolFilter = ref('');
const assignRow = ref(null);
const assignEventId = ref('');
const assignSearchQuery = ref('');
const assignSearchResults = ref([]);
const assignSearchLoading = ref(false);
const assignSelectedEvent = ref(null);
const assignSaving = ref(false);
const assignError = ref('');
let assignSearchTimer = null;

const profileLoading = ref(false);
const profileFullClient = ref(null);

const aid = computed(() => Number(props.agencyId));

const schoolOptions = computed(() => {
  const m = new Map();
  for (const c of rawClients.value || []) {
    const id = Number(c.schoolOrganizationId);
    const name = String(c.schoolName || '').trim();
    if (id && name) m.set(id, { id, name });
  }
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
});

const rows = computed(() => {
  const list = rawClients.value || [];
  const sf = schoolFilter.value ? Number(schoolFilter.value) : null;
  return list.filter((c) => !sf || Number(c.schoolOrganizationId) === sf);
});

/** @param {{ silent?: boolean }} [opts] — silent: refresh without hiding the table (no full-panel loading state) */
async function load(opts = {}) {
  const silent = !!opts.silent;
  if (!Number.isFinite(aid.value) || aid.value <= 0) return;
  if (!silent) {
    loading.value = true;
  }
  error.value = '';
  try {
    const res = await api.get('/skill-builders/coordinator/master-clients', {
      params: { agencyId: aid.value },
      skipGlobalLoading: true
    });
    rawClients.value = Array.isArray(res.data?.clients) ? res.data.clients : [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load';
    rawClients.value = [];
  } finally {
    if (!silent) {
      loading.value = false;
    }
  }
}

/** Open full client panel in a modal (above Skill Builders hub); Overview shows Skills client + Skill Builders fields. */
async function openClientProfile(row) {
  const id = Number(row?.clientId);
  if (!Number.isFinite(id) || id <= 0) return;
  profileFullClient.value = null;
  profileLoading.value = true;
  try {
    const r = await api.get(`/clients/${id}`, { skipGlobalLoading: true });
    if (r.data) {
      profileFullClient.value = { ...r.data };
    } else {
      window.alert('Client not found.');
    }
  } catch (e) {
    window.alert(e.response?.data?.error?.message || e.message || 'Failed to load client');
  } finally {
    profileLoading.value = false;
  }
}

function closeClientProfile() {
  profileFullClient.value = null;
}

function onClientProfileUpdated(payload) {
  load({ silent: true });
  if (payload?.keepOpen && payload?.client) {
    profileFullClient.value = { ...payload.client };
  } else if (!payload?.keepOpen) {
    closeClientProfile();
  }
}

async function toggleIntake(row) {
  if (row.intakeComplete && row.treatmentPlanComplete) {
    window.alert('Mark treatment plan as not complete before marking intake incomplete.');
    return;
  }
  try {
    await api.patch(`/skill-builders/coordinator/clients/${row.clientId}`, {
      agencyId: aid.value,
      skillBuildersIntakeComplete: !row.intakeComplete
    });
    await load({ silent: true });
  } catch (e) {
    window.alert(e.response?.data?.error?.message || e.message || 'Update failed');
  }
}

async function toggleTp(row) {
  if (!row.treatmentPlanComplete && !row.intakeComplete) {
    window.alert('Complete intake before marking treatment plan complete.');
    return;
  }
  try {
    await api.patch(`/skill-builders/coordinator/clients/${row.clientId}`, {
      agencyId: aid.value,
      skillBuildersTreatmentPlanComplete: !row.treatmentPlanComplete
    });
    await load({ silent: true });
  } catch (e) {
    window.alert(e.response?.data?.error?.message || e.message || 'Update failed');
  }
}

async function unassignEvent(row, ev) {
  const label = ev.skillsGroupName || `event ${ev.companyEventId}`;
  if (!window.confirm(`Remove ${row.initials || 'this client'} from ${label}?`)) return;
  try {
    await api.post(`/skill-builders/coordinator/clients/${row.clientId}/unassign-event`, {
      agencyId: aid.value,
      companyEventId: ev.companyEventId
    });
    await load({ silent: true });
  } catch (e) {
    window.alert(e.response?.data?.error?.message || e.message || 'Remove failed');
  }
}

function closeAssign() {
  assignRow.value = null;
  assignSearchQuery.value = '';
  assignSearchResults.value = [];
  assignSelectedEvent.value = null;
  assignEventId.value = '';
  assignError.value = '';
  if (assignSearchTimer) clearTimeout(assignSearchTimer);
}

async function fetchAssignEvents(q) {
  if (!Number.isFinite(aid.value) || aid.value <= 0) return;
  assignSearchLoading.value = true;
  try {
    const res = await api.get('/skill-builders/coordinator/company-events-search', {
      params: { agencyId: aid.value, q: q || undefined },
      skipGlobalLoading: true
    });
    assignSearchResults.value = Array.isArray(res.data?.events) ? res.data.events : [];
  } catch {
    assignSearchResults.value = [];
  } finally {
    assignSearchLoading.value = false;
  }
}

function scheduleAssignSearch() {
  if (assignSearchTimer) clearTimeout(assignSearchTimer);
  assignSearchTimer = setTimeout(() => fetchAssignEvents(String(assignSearchQuery.value || '').trim()), 280);
}

function pickAssignEvent(ev) {
  assignSelectedEvent.value = ev;
  assignEventId.value = String(ev?.companyEventId || '');
}

function openAssign(row) {
  assignRow.value = row;
  assignSearchQuery.value = '';
  assignSelectedEvent.value = null;
  assignEventId.value = '';
  assignError.value = '';
  fetchAssignEvents('');
}

async function submitAssign() {
  if (!assignRow.value) return;
  const eid = Number(String(assignEventId.value || '').trim());
  if (!Number.isFinite(eid) || eid <= 0) {
    assignError.value = 'Pick an event from the list';
    return;
  }
  const row = assignRow.value;
  assignSaving.value = true;
  assignError.value = '';
  try {
    await api.post(`/skill-builders/coordinator/clients/${row.clientId}/assign-event`, {
      agencyId: aid.value,
      companyEventId: eid,
      schoolOrganizationId: row.schoolOrganizationId
    });
    closeAssign();
    await load({ silent: true });
    if (row.intakeComplete && row.treatmentPlanComplete) {
      const yes = window.confirm(
        'Confirm attendance for this event so providers can see this student on the roster?'
      );
      if (yes) {
        await api.post(`/skill-builders/coordinator/clients/${row.clientId}/confirm-ready`, {
          agencyId: aid.value,
          companyEventIds: [eid]
        });
        await load({ silent: true });
      }
    }
  } catch (e) {
    assignError.value = e.response?.data?.error?.message || e.message || 'Assign failed';
  } finally {
    assignSaving.value = false;
  }
}

async function confirmRow(row) {
  const pending = (row.events || []).filter((e) => !e.activeForProviders);
  if (!pending.length) return;
  let ids = [];
  if (pending.length === 1) {
    ids = [pending[0].companyEventId];
  } else {
    const raw = window.prompt(
      `Enter company event id to confirm:\n${pending.map((p) => `${p.companyEventId}: ${p.skillsGroupName}`).join('\n')}`
    );
    const n = Number(String(raw || '').trim());
    if (Number.isFinite(n) && n > 0) ids = [n];
  }
  if (!ids.length) return;
  try {
    await api.post(`/skill-builders/coordinator/clients/${row.clientId}/confirm-ready`, {
      agencyId: aid.value,
      companyEventIds: ids
    });
    await load({ silent: true });
  } catch (e) {
    window.alert(e.response?.data?.error?.message || e.message || 'Confirm failed');
  }
}

watch(
  () => props.agencyId,
  () => {
    load();
  },
  { immediate: true }
);
</script>

<style scoped>
.sbcm-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-end;
  margin-bottom: 12px;
}
.sbcm-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.85rem;
  color: var(--text-secondary, #64748b);
}
.sbcm-select {
  min-width: 200px;
}
.sbcm-table-wrap {
  overflow: auto;
  max-height: 52vh;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
}
.sbcm-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}
.sbcm-table th,
.sbcm-table td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--border, #e2e8f0);
  text-align: left;
  vertical-align: top;
}
.sbcm-status-btn {
  min-width: 5.25rem;
  padding: 7px 12px;
  border-radius: 10px;
  border: 1px solid rgba(15, 118, 110, 0.35);
  background: linear-gradient(180deg, #ffffff 0%, #f4fbf9 100%);
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: var(--text-primary, #0f172a);
  cursor: pointer;
  text-align: center;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.1s ease;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
}
.sbcm-status-btn:hover {
  border-color: rgba(15, 118, 110, 0.55);
  box-shadow: 0 4px 14px rgba(15, 118, 110, 0.12);
}
.sbcm-status-btn:active {
  transform: translateY(1px);
}
.sbcm-status-btn.is-complete {
  background: linear-gradient(180deg, rgba(15, 118, 110, 0.14) 0%, #ffffff 100%);
  color: var(--primary, #0f766e);
  border-color: rgba(15, 118, 110, 0.45);
}
.sbcm-status-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  box-shadow: none;
}
.sbcm-status-btn:disabled:hover {
  border-color: rgba(15, 118, 110, 0.35);
  box-shadow: none;
}
.sbcm-confirm-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 5.5rem;
  padding: 7px 12px;
  border-radius: 10px;
  border: 1px solid rgba(100, 116, 139, 0.45);
  background: #f1f5f9;
  color: #64748b;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  cursor: default;
  opacity: 0.92;
}
.sbcm-school-banner {
  margin: 10px 0 4px;
  font-size: 1.35rem;
  font-weight: 800;
  line-height: 1.25;
  color: var(--text-primary, #0f172a);
  letter-spacing: -0.02em;
}
.sbcm-modal-client-line {
  margin: 0 0 12px;
}
.sbcm-ev-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px 10px;
  margin-bottom: 4px;
}
.sbcm-ev-name {
  flex: 1;
  min-width: 0;
}
.sbcm-ev-remove {
  flex-shrink: 0;
  padding: 2px 8px;
  font-size: 0.72rem;
  font-weight: 600;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 6px;
  background: #fff;
  color: var(--text-secondary, #64748b);
  cursor: pointer;
}
.sbcm-ev-remove:hover {
  border-color: #cbd5e1;
  color: #0f172a;
}
.sbcm-initials-btn {
  min-width: 4.5rem;
  text-align: left;
  text-decoration: underline;
  text-underline-offset: 3px;
  color: var(--primary, #0f766e);
}
.sbcm-profile-loading-overlay {
  position: fixed;
  inset: 0;
  z-index: 4000;
  background: rgba(15, 23, 42, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.sbcm-profile-loading-card {
  padding: 16px 22px;
  border-radius: 12px;
  background: #fff;
  border: 1px solid var(--border, #e2e8f0);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.12);
  font-weight: 600;
}
/* ClientDetailPanel’s own overlay defaults to z-index 1000 — sit above Program hub modal (1500). */
.sbcm-client-detail-lift :deep(.modal-overlay) {
  z-index: 4000;
}
.sbcm-ev-list {
  margin: 0;
  padding-left: 1.1rem;
}
.sbcm-pill {
  display: inline-block;
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 999px;
  background: #fef3c7;
  color: #92400e;
  font-size: 0.72rem;
  text-transform: uppercase;
}
.sbcm-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sbcm-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  z-index: 12000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.sbcm-modal {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  max-width: 520px;
  width: 100%;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.2);
}
.sbcm-pick-list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  max-height: 220px;
  overflow: auto;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
}
.sbcm-pick-list li {
  border-bottom: 1px solid var(--border, #e2e8f0);
}
.sbcm-pick-list li:last-child {
  border-bottom: none;
}
.sbcm-pick-btn {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  padding: 10px 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font: inherit;
}
.sbcm-pick-btn:hover {
  background: #f8fafc;
}
.sbcm-pick-title {
  font-weight: 600;
}
.sbcm-pick-meta {
  font-size: 0.8rem;
}
.sbcm-selected {
  margin-top: 10px;
  font-size: 0.9rem;
}
.sbcm-modal-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 12px;
}
.muted {
  color: var(--text-secondary, #64748b);
}
</style>
