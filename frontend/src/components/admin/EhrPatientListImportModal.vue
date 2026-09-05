<template>
  <div v-if="open" class="ehr-modal-backdrop" @click.self="emit('close')">
    <div class="ehr-modal" role="dialog" aria-labelledby="ehr-patient-list-title">
      <header class="ehr-modal-head">
        <h3 id="ehr-patient-list-title">Paste patient list</h3>
        <button type="button" class="ehr-link" @click="emit('close')">Close</button>
      </header>
      <p class="ehr-hint">
        Paste the EHR patient list for
        <strong>{{ providerLabel || 'this provider' }}</strong>.
        We create or match chart clients by name and date of birth, assign them to this provider,
        and skip reminder counts, clinicians, and appointment columns.
      </p>

      <label class="ehr-label">
        Patient list paste
        <textarea
          v-model="pasteText"
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
      <p v-if="error" class="ehr-error">{{ error }}</p>

      <div class="ehr-actions">
        <button type="button" class="ehr-btn-ghost" @click="emit('close')">Cancel</button>
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

const preview = computed(() => parseEhrPatientListPaste(pasteText.value));
const canImport = computed(() => Number(props.providerUserId) > 0 && Number(props.agencyId) > 0);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    pasteText.value = '';
    error.value = '';
    resultSummary.value = '';
  }
);

function dobKey(raw) {
  const s = String(raw || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s.slice(0, 10) || '';
}

function matchExistingClient(item, rows) {
  const nameKey = normalizePersonNameKey(item.fullName);
  const dob = String(item.dateOfBirth || '').slice(0, 10);
  const list = Array.isArray(rows) ? rows : [];
  const withDob = list.filter((c) => {
    const full = normalizePersonNameKey(c.full_name || c.fullName || '');
    const firstLast = normalizePersonNameKey(
      [c.first_name || c.firstName, c.last_name || c.lastName].filter(Boolean).join(' ')
    );
    const nameOk = full === nameKey || (firstLast && firstLast === nameKey);
    if (!nameOk) return false;
    const clientDob = dobKey(c.date_of_birth || c.dateOfBirth || c.dob);
    if (dob && clientDob) return clientDob === dob;
    if (dob && !clientDob) return true; // name-only fallback when chart DOB missing
    return !dob;
  });
  if (withDob.length === 1) return withDob[0];
  if (withDob.length > 1 && dob) {
    const exactDob = withDob.filter((c) => dobKey(c.date_of_birth || c.dateOfBirth || c.dob) === dob);
    if (exactDob.length === 1) return exactDob[0];
  }
  return null;
}

async function ensureProviderAssignment(client, organizationId) {
  const providerId = Number(props.providerUserId);
  const existingProvider = Number(client?.provider_id || client?.providerId || 0) || null;
  const clientId = Number(client?.id || 0);
  if (!clientId || !providerId) return 'none';

  if (!existingProvider) {
    await api.put(
      `/clients/${clientId}/provider`,
      { provider_id: providerId },
      { skipGlobalLoading: true }
    );
    return 'assigned';
  }
  if (existingProvider === providerId) return 'already';

  // Different primary provider — add this provider as an additional assignment when possible.
  const orgId = Number(organizationId || client?.organization_id || client?.organizationId || 0);
  if (!orgId) {
    // Fall back to also setting primary only when org for dual-assign is unknown.
    return 'matched_other_provider';
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
    return 'co_assigned';
  } catch {
    return 'matched_other_provider';
  }
}

async function seedDemographics(clientId, item) {
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
  } catch {
    // best-effort — bring-up-to-date can fill full demographics later
  }
}

async function findOrCreate(item) {
  const agencyId = Number(props.agencyId);
  const providerId = Number(props.providerUserId);
  const organizationId = Number(props.organizationId || 0) || null;

  let match = null;
  try {
    const searchRes = await api.get('/clients', {
      params: { agency_id: agencyId, search: item.fullName, limit: 40 },
      skipGlobalLoading: true
    });
    const rows = searchRes?.data?.clients || searchRes?.data?.items || searchRes?.data || [];
    match = matchExistingClient(item, rows);
  } catch {
    match = null;
  }

  if (match?.id) {
    const assign = await ensureProviderAssignment(match, organizationId || match.organization_id);
    if (!dobKey(match.date_of_birth || match.dateOfBirth) && item.dateOfBirth) {
      await seedDemographics(match.id, item);
    }
    return { clientId: Number(match.id), created: false, assign };
  }

  const createRes = await api.post(
    '/clients',
    {
      agency_id: agencyId,
      organization_id: organizationId || agencyId,
      full_name: item.fullName,
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
  if (clientId) await seedDemographics(clientId, item);
  return { clientId, created: true, assign: 'assigned' };
}

async function submit() {
  if (!canImport.value || !preview.value.items.length) return;
  saving.value = true;
  error.value = '';
  resultSummary.value = '';
  let created = 0;
  let matched = 0;
  let coAssigned = 0;
  const failures = [];
  try {
    for (const item of preview.value.items) {
      try {
        const res = await findOrCreate(item);
        if (res.created) created += 1;
        else matched += 1;
        if (res.assign === 'co_assigned') coAssigned += 1;
      } catch (e) {
        failures.push(`${item.fullName}: ${e.response?.data?.error?.message || e.message || 'failed'}`);
      }
    }
    resultSummary.value = [
      `Created ${created}`,
      `matched ${matched}`,
      coAssigned ? `co-assigned ${coAssigned}` : null,
      failures.length ? `${failures.length} failed` : null
    ].filter(Boolean).join(' · ');
    if (failures.length && !created && !matched) {
      error.value = failures.slice(0, 3).join('; ');
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
