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
            <th>Events</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="`${row.clientId}-${row.schoolOrganizationId}`">
            <td>{{ row.initials || row.identifierCode || row.clientId }}</td>
            <td>{{ row.schoolName }}</td>
            <td>{{ row.grade || '—' }}</td>
            <td>{{ row.ageYears != null ? row.ageYears : '—' }}</td>
            <td>
              <button type="button" class="btn-link" @click="toggleIntake(row)">
                {{ row.intakeComplete ? 'Complete' : 'Needed' }}
              </button>
            </td>
            <td>
              <button type="button" class="btn-link" @click="toggleTp(row)">
                {{ row.treatmentPlanComplete ? 'Complete' : 'Needed' }}
              </button>
            </td>
            <td>
              <span v-if="!row.events.length" class="muted">None</span>
              <ul v-else class="sbcm-ev-list">
                <li v-for="ev in row.events" :key="ev.companyEventId">
                  {{ ev.skillsGroupName || `Event ${ev.companyEventId}` }}
                  <span v-if="!ev.activeForProviders" class="sbcm-pill">pending</span>
                </li>
              </ul>
            </td>
            <td class="sbcm-actions">
              <button type="button" class="btn btn-secondary btn-sm" @click="openAssign(row)">Assign event</button>
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
        <p class="muted">{{ assignRow.initials }} · {{ assignRow.schoolName }}</p>
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
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';

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

async function load() {
  if (!Number.isFinite(aid.value) || aid.value <= 0) return;
  loading.value = true;
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
    loading.value = false;
  }
}

async function toggleIntake(row) {
  try {
    await api.patch(`/skill-builders/coordinator/clients/${row.clientId}`, {
      agencyId: aid.value,
      skillBuildersIntakeComplete: !row.intakeComplete
    });
    await load();
  } catch (e) {
    window.alert(e.response?.data?.error?.message || e.message || 'Update failed');
  }
}

async function toggleTp(row) {
  try {
    const res = await api.patch(`/skill-builders/coordinator/clients/${row.clientId}`, {
      agencyId: aid.value,
      skillBuildersTreatmentPlanComplete: !row.treatmentPlanComplete
    });
    if (res.data?.shouldPromptMarkReady) {
      const ok = window.confirm(String(res.data?.promptMessage || 'Mark client as confirmed for providers?'));
      if (ok) {
        await api.post(`/skill-builders/coordinator/clients/${row.clientId}/confirm-ready`, {
          agencyId: aid.value,
          all: true
        });
      } else {
        const pending = (row.events || []).filter((e) => !e.activeForProviders);
        if (pending.length === 1) {
          const go = window.confirm('Confirm attendance for the assigned event so providers can see this student?');
          if (go) {
            await api.post(`/skill-builders/coordinator/clients/${row.clientId}/confirm-ready`, {
              agencyId: aid.value,
              companyEventIds: [pending[0].companyEventId]
            });
          }
        } else if (pending.length > 1) {
          const raw = window.prompt(
            `Multiple events need confirmation. Enter company event id(s) comma-separated:\n${pending.map((p) => `${p.companyEventId}: ${p.skillsGroupName}`).join('\n')}`
          );
          const ids = String(raw || '')
            .split(',')
            .map((x) => Number(String(x).trim()))
            .filter((n) => Number.isFinite(n) && n > 0);
          if (ids.length) {
            await api.post(`/skill-builders/coordinator/clients/${row.clientId}/confirm-ready`, {
              agencyId: aid.value,
              companyEventIds: ids
            });
          }
        }
      }
    }
    await load();
  } catch (e) {
    window.alert(e.response?.data?.error?.message || e.message || 'Update failed');
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
  assignSaving.value = true;
  assignError.value = '';
  try {
    await api.post(`/skill-builders/coordinator/clients/${assignRow.value.clientId}/assign-event`, {
      agencyId: aid.value,
      companyEventId: eid,
      schoolOrganizationId: assignRow.value.schoolOrganizationId
    });
    closeAssign();
    await load();
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
    await load();
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
