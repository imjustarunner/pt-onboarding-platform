<template>
  <div v-if="open" class="ehr-modal-backdrop" @click.self="!saving && emit('close')">
    <div class="ehr-modal" role="dialog" aria-labelledby="ehr-patient-list-title">
      <header class="ehr-modal-head">
        <h3 id="ehr-patient-list-title">Paste patient list</h3>
        <button type="button" class="ehr-link" :disabled="saving" @click="emit('close')">Close</button>
      </header>
      <p class="ehr-hint">
        Paste the EHR patient list for
        <strong>{{ providerLabel || 'this provider' }}</strong>.
        We match chart clients by name and date of birth, then assign them to this provider.
        Uncertain matches need chart review before import. Reminder counts, clinicians, and appointment columns are skipped.
      </p>

      <label class="ehr-label">
        Patient list paste
        <textarea
          v-model="pasteText"
          :disabled="saving"
          class="ehr-textarea"
          rows="14"
          placeholder="Patient Name&#9;DOB&#9;Phone Number&#9;…&#10;Sheldon Baron&#9;12/11/1982&#9;(218) 556-0827&#9;…"
        />
      </label>

      <div v-if="preview.items.length" class="ehr-preview">
        <p class="ehr-muted">
          {{ preview.items.length }} client{{ preview.items.length === 1 ? '' : 's' }} ready to import
          <span v-if="preview.skipped.length"> · {{ preview.skipped.length }} line(s) skipped</span>
        </p>
        <div class="ehr-table-wrap">
          <table class="ehr-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>DOB</th>
                <th>Phone</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, idx) in preview.items" :key="`${row.fullName}-${row.dateOfBirth}-${idx}`">
                <td>{{ row.fullName }}</td>
                <td>{{ row.dateOfBirth }}</td>
                <td>{{ row.phone || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <p v-else-if="pasteText.trim()" class="ehr-error">
        Could not parse any patients. Paste tab-separated rows with name and DOB.
      </p>

      <p v-if="resultSummary" class="ehr-ok">{{ resultSummary }}</p>
      <p v-if="error" class="ehr-error" role="alert">{{ error }}</p>
      <ul v-if="rowFailures.length" class="ehr-error" aria-label="Clients needing review">
        <li v-for="failure in rowFailures" :key="failure">{{ failure }}</li>
      </ul>

      <div class="ehr-actions">
        <button type="button" class="ehr-btn-ghost" :disabled="saving" @click="emit('close')">Cancel</button>
        <button
          type="button"
          class="ehr-btn-primary"
          :disabled="saving || !preview.items.length || !canImport"
          @click="submit"
        >
          {{ saving ? 'Importing…' : 'Import clients' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
import { deriveInitialsFromName, normalizePersonNameKey } from '../../utils/noteAidWorkQueue.js';
import { parseEhrPatientListPaste } from '../../utils/ehrPatientListPaste.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  providerUserId: { type: [Number, String], required: true },
  providerLabel: { type: String, default: '' },
  agencyId: { type: [Number, String], required: true },
  organizationId: { type: [Number, String, null], default: null }
});

const emit = defineEmits(['close', 'imported']);

const pasteText = ref('');
const saving = ref(false);
const error = ref('');
const resultSummary = ref('');
const rowFailures = ref([]);
// Keep successful rows in memory while the operator fixes other rows and retries.
const completedRows = new Map();
const pendingRows = new Map();
let importGeneration = 0;

const preview = computed(() => parseEhrPatientListPaste(pasteText.value));
const canImport = computed(() => Number(props.providerUserId) > 0 && Number(props.agencyId) > 0);

watch(
  () => [props.open, props.agencyId, props.providerUserId, props.organizationId],
  ([open]) => {
    importGeneration += 1;
    if (!open) return;
    pasteText.value = '';
    error.value = '';
    resultSummary.value = '';
    rowFailures.value = [];
    completedRows.clear();
  },
  { flush: 'sync' }
);

function assertImportContext(context) {
  if (context.generation !== importGeneration || !props.open) {
    throw new Error('The provider or agency changed during import. Review the selected context before retrying; no further import steps were run.');
  }
}

function dobKey(raw) {
  const s = String(raw || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s.slice(0, 10) || '';
}

function matchExistingClient(item, rows) {
  const nameKey = normalizePersonNameKey(item.fullName);
  const dob = String(item.dateOfBirth || '').slice(0, 10);
  if (!nameKey || !dob) throw new Error('Review the client name and date of birth before importing.');
  const sameName = rows.filter((c) => {
    const full = normalizePersonNameKey(c.full_name || c.fullName || '');
    const firstLast = normalizePersonNameKey(
      [c.first_name || c.firstName, c.last_name || c.lastName].filter(Boolean).join(' ')
    );
    const nameOk = full === nameKey || (firstLast && firstLast === nameKey);
    return nameOk;
  });
  const missingDob = sameName.filter((c) => !dobKey(c.date_of_birth || c.dateOfBirth || c.dob));
  if (missingDob.length) {
    throw new Error(`Existing chart${missingDob.length === 1 ? '' : 's'} ${missingDob.map(c => `#${c.id}`).join(', ')} lack a date of birth. Review and complete the matching chart before retrying; no client was created or linked.`);
  }
  const exactDob = sameName.filter((c) => dobKey(c.date_of_birth || c.dateOfBirth || c.dob) === dob);
  if (exactDob.length > 1) {
    throw new Error(`Multiple charts match this name and date of birth (${exactDob.map(c => `#${c.id}`).join(', ')}). Resolve the duplicate charts before retrying; no client was created or linked.`);
  }
  const match = exactDob[0] || null;
  if (match && String(match.status || '').toUpperCase() === 'ARCHIVED') {
    throw new Error(`Matching chart #${match.id} is archived. Review and restore it before retrying; no client was created or linked.`);
  }
  return match;
}

async function ensureProviderAssignment(client, organizationId, context) {
  assertImportContext(context);
  const providerId = context.providerId;
  const existingProvider = Number(client?.provider_id || client?.providerId || 0) || null;
  const clientId = Number(client?.id || 0);
  if (!clientId || !providerId) return 'none';

  if (!existingProvider) {
    await api.put(
      `/clients/${clientId}/provider`,
      { provider_id: providerId },
      { skipGlobalLoading: true }
    );
    assertImportContext(context);
    return 'assigned';
  }
  if (existingProvider === providerId) return 'already';

  // Different primary provider — add this provider as an additional assignment when possible.
  const orgId = Number(organizationId || client?.organization_id || client?.organizationId || 0);
  if (!orgId) {
    throw new Error(`Chart #${clientId} has another primary provider and needs an organization for an additional assignment. Review the assignment before retrying.`);
  }
  try {
    await api.post(
      `/clients/${clientId}/provider-assignments`,
      {
        organization_id: orgId,
        provider_user_id: providerId,
        service_day: 'Unknown',
        is_primary: false
      },
      { skipGlobalLoading: true }
    );
    assertImportContext(context);
    return 'co_assigned';
  } catch (e) {
    assertImportContext(context);
    throw new Error(`Chart #${clientId} was matched, but the provider assignment was not saved. Retry after reviewing the assignment. ${e.response?.data?.error?.message || e.message || ''}`.trim());
  }
}

async function seedDemographics(clientId, item, context) {
  assertImportContext(context);
  try {
    await api.post(
      `/clients/${clientId}/demographics/import`,
      {
        demographics: {
          fullName: item.fullName,
          dateOfBirth: item.dateOfBirth,
          contactPhone: item.phone || ''
        }
      },
      { skipGlobalLoading: true }
    );
    assertImportContext(context);
  } catch (e) {
    assertImportContext(context);
    throw new Error(`Chart #${clientId} was created, but demographics were not saved. Retry in this window to finish the same chart. ${e.response?.data?.error?.message || e.message || ''}`.trim());
  }
}

async function findOrCreate(item, context, rowKey) {
  assertImportContext(context);
  const { agencyId, providerId, organizationId } = context;
  const pending = pendingRows.get(rowKey);
  if (pending) {
    await seedDemographics(pending.clientId, item, context);
    pendingRows.delete(rowKey);
    return pending;
  }

  let searchRes;
  try {
    searchRes = await api.get('/clients', {
      params: { agency_id: agencyId, search: item.fullName, includeArchived: true },
      skipGlobalLoading: true
    });
  } catch {
    assertImportContext(context);
    throw new Error('Existing-client lookup failed. Retry when lookup is available; no client was created or linked.');
  }
  assertImportContext(context);
  const payload = searchRes?.data;
  const rows = Array.isArray(payload) ? payload : payload?.clients || payload?.items;
  if (!Array.isArray(rows) || rows.some(row => !Number.isSafeInteger(Number(row?.id)) || Number(row.id) < 1)
      || (payload?.total != null && Number(payload.total) > rows.length)
      || rows.some(row => row.agency_id != null && Number(row.agency_id) !== agencyId)) {
    throw new Error('Existing-client lookup was incomplete. Review the client search before retrying; no client was created or linked.');
  }
  const match = matchExistingClient(item, rows);

  if (match?.id) {
    const assign = await ensureProviderAssignment(match, organizationId || match.organization_id, context);
    return { clientId: Number(match.id), created: false, assign };
  }

  const createRes = await api.post(
    '/clients',
    {
      agency_id: agencyId,
      organization_id: organizationId || agencyId,
      full_name: item.fullName,
      date_of_birth: item.dateOfBirth,
      initials: deriveInitialsFromName(item.fullName),
      contact_phone: item.phone || undefined,
      submission_date: new Date().toISOString().slice(0, 10),
      client_type: 'clinical',
      source: 'EHR_PATIENT_LIST',
      provider_id: providerId,
      serviceType: 'counseling'
    },
    { skipGlobalLoading: true }
  );
  const row = createRes?.data?.client || createRes?.data || {};
  const clientId = Number(row.id);
  if (!Number.isSafeInteger(clientId) || clientId < 1) throw new Error('Client creation did not return a chart ID. Review the client search before retrying.');
  if (createRes?.data?.reused) {
    throw new Error(`The server returned an existing chart (#${clientId}) without a reviewed match. Review the chart before retrying; demographics were not changed.`);
  }
  const result = { clientId, created: true, assign: 'assigned' };
  pendingRows.set(rowKey, result);
  await seedDemographics(clientId, item, context);
  pendingRows.delete(rowKey);
  return result;
}

async function submit() {
  if (saving.value || !canImport.value || !preview.value.items.length) return;
  saving.value = true;
  error.value = '';
  resultSummary.value = '';
  rowFailures.value = [];
  let created = 0;
  let matched = 0;
  let coAssigned = 0;
  const failures = [];
  const context = { generation: importGeneration, agencyId: Number(props.agencyId), providerId: Number(props.providerUserId), organizationId: Number(props.organizationId || 0) || null };
  try {
    for (const item of preview.value.items) {
      assertImportContext(context);
      try {
        const key = JSON.stringify([context.agencyId, context.providerId, context.organizationId, normalizePersonNameKey(item.fullName), item.dateOfBirth]);
        const res = completedRows.get(key) || await findOrCreate(item, context, key);
        assertImportContext(context);
        completedRows.set(key, res);
        if (res.created) created += 1;
        else matched += 1;
        if (res.assign === 'co_assigned') coAssigned += 1;
      } catch (e) {
        assertImportContext(context);
        failures.push(`${item.fullName}: ${e.response?.data?.error?.message || e.message || 'failed'}`);
      }
    }
    resultSummary.value = [
      `Created ${created}`,
      `matched ${matched}`,
      coAssigned ? `co-assigned ${coAssigned}` : null,
      failures.length ? `${failures.length} failed` : null
    ].filter(Boolean).join(' · ');
    if (failures.length) {
      rowFailures.value = failures;
      error.value = 'Review the clients listed below, then retry. Successful rows are kept and will not be imported again.';
    } else {
      emit('imported', { created, matched, coAssigned, failures });
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Import failed';
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.ehr-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  z-index: 5000;
  padding: 64px 16px 24px;
  overflow: auto;
}
.ehr-modal {
  width: min(760px, 100%);
  background: #fff;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  padding: 18px 20px;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.18);
}
.ehr-modal-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}
.ehr-modal-head h3 {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 800;
}
.ehr-link {
  border: none;
  background: none;
  color: #0f766e;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.ehr-hint {
  margin: 0 0 12px;
  color: #475569;
  font-size: 0.9rem;
  line-height: 1.45;
}
.ehr-label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.8rem;
  font-weight: 700;
  color: #334155;
}
.ehr-textarea {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 10px 12px;
  font: inherit;
  font-size: 0.85rem;
  resize: vertical;
  box-sizing: border-box;
}
.ehr-preview { margin-top: 12px; }
.ehr-muted { margin: 0 0 8px; color: #64748b; font-size: 0.85rem; }
.ehr-table-wrap {
  max-height: 220px;
  overflow: auto;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
}
.ehr-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.84rem;
}
.ehr-table th, .ehr-table td {
  text-align: left;
  padding: 8px 10px;
  border-bottom: 1px solid #f1f5f9;
}
.ehr-table th {
  background: #f8fafc;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
}
.ehr-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
.ehr-btn-ghost, .ehr-btn-primary {
  border-radius: 8px;
  padding: 8px 14px;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.ehr-btn-ghost {
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #334155;
}
.ehr-btn-primary {
  border: none;
  background: #0f766e;
  color: #fff;
}
.ehr-btn-primary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.ehr-error { color: #b91c1c; font-size: 0.85rem; margin: 10px 0 0; }
.ehr-ok { color: #0f766e; font-size: 0.85rem; font-weight: 600; margin: 10px 0 0; }
</style>
