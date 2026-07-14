<template>
  <div class="credentialing-tab">
    <h2>Payer Credentialing</h2>
    <p class="hint intro-hint">
      <strong>Step 1:</strong> Define which payers your agency credentials with (once, agency-wide).
      <strong>Step 2:</strong> For each fully licensed provider, create credentials for the payers they are with and record tracking dates.
    </p>

    <div v-if="!agencyId" class="empty-state">
      <p>Select an agency to view credentialing data.</p>
    </div>

    <div v-else>
      <div class="form-group" style="max-width: 320px; margin-bottom: 16px;">
        <label>Agency</label>
        <select v-model.number="agencyId" :disabled="loading">
          <option v-for="a in agencies" :key="a.id" :value="a.id">{{ a.name }}</option>
        </select>
      </div>

      <!-- Agency-wide insurance definitions -->
      <div class="credentialing-card" style="margin-bottom: 14px;">
        <div class="card-header card-header--actions">
          <div>
            <h3>Agency payer list</h3>
            <p class="hint card-subhint">Shared across all fully licensed providers in this agency.</p>
          </div>
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            @click="showDefinitionsPanel = !showDefinitionsPanel"
          >
            {{ showDefinitionsPanel ? 'Hide' : 'Manage' }} list
          </button>
        </div>
        <div v-if="showDefinitionsPanel || insurances.length === 0" class="card-body">
          <div v-if="insurances.length === 0 && !showDefinitionsPanel" class="empty-definitions">
            <span class="muted">No payers defined yet for this agency.</span>
            <button type="button" class="btn btn-primary btn-sm" @click="showDefinitionsPanel = true">
              Add payers
            </button>
          </div>
          <div v-else class="definitions-panel-wrap">
            <InsuranceDefinitionsPanel
              :agency-id="agencyId"
              @changed="onDefinitionsChanged"
            />
          </div>
        </div>
      </div>

      <!-- Per-provider credentialing checklist -->
      <div v-if="loading" class="loading">Loading credentialing…</div>
      <div v-else-if="loadError" class="error">{{ loadError }}</div>
      <div v-else-if="insurances.length === 0" class="empty-state">
        <p>Add at least one insurance to the agency list above, then return here to track this provider.</p>
      </div>
      <div v-else class="provider-credentialing">
        <h3 class="section-title">This provider's credentialing</h3>
        <p class="hint section-hint">
          Each insurance below is available to every fully licensed provider. Check <strong>Credentialed</strong> when this provider is in-network, then fill in dates and reference numbers as needed.
        </p>

        <div class="credentialing-cards">
          <div
            v-for="row in rows"
            :key="row.definitionId"
            class="credentialing-card"
            :class="{ 'credentialing-card--active': row.credentialed }"
          >
            <div class="card-header card-header--row">
              <label class="credentialed-toggle">
                <input
                  type="checkbox"
                  :checked="row.credentialed"
                  :disabled="row.saving"
                  @change="toggleCredentialed(row, $event.target.checked)"
                />
                <span>Credentialed</span>
              </label>
              <img v-if="row.logoUrl" :src="row.logoUrl" :alt="row.name" class="row-logo" />
              <h3>{{ row.name }}</h3>
              <span v-if="row.credentialed && row.edit.effectiveDate" class="status-pill status-pill--active">
                Active {{ formatDisplayDate(row.edit.effectiveDate) }}
              </span>
              <span v-else-if="row.credentialed" class="status-pill">In progress</span>
            </div>

            <div v-if="row.credentialed" class="card-body">
              <div class="form-grid">
                <div class="form-group">
                  <label>Credentialed / effective date</label>
                  <input v-model="row.edit.effectiveDate" type="date" :disabled="row.saving" />
                  <small class="form-help">When the provider became in-network with this payer</small>
                </div>
                <div class="form-group">
                  <label>Application submitted</label>
                  <input v-model="row.edit.submittedDate" type="date" :disabled="row.saving" />
                  <small class="form-help">Date the credentialing application was sent</small>
                </div>
                <div class="form-group">
                  <label>Last resubmission</label>
                  <input v-model="row.edit.resubmittedDate" type="date" :disabled="row.saving" />
                  <small class="form-help">Most recent resubmission, if applicable</small>
                </div>
                <div class="form-group">
                  <label>Payer PIN / provider ID</label>
                  <input v-model.trim="row.edit.pinOrReference" type="text" :disabled="row.saving" placeholder="e.g. payer-assigned ID" />
                </div>
                <div class="form-group">
                  <label>Portal username (optional)</label>
                  <input v-model.trim="row.edit.loginUsername" type="text" :disabled="row.saving" autocomplete="off" />
                </div>
                <div class="form-group">
                  <label>Portal password (optional)</label>
                  <input v-model.trim="row.edit.loginPassword" type="password" :disabled="row.saving" autocomplete="new-password" />
                </div>
              </div>
              <div class="form-group" style="margin-top: 10px;">
                <label>Notes</label>
                <textarea v-model.trim="row.edit.notes" rows="2" :disabled="row.saving" placeholder="Internal notes about this credentialing"></textarea>
              </div>
              <div v-if="row.hasUserCredentials" class="form-group">
                <label>Saved portal login</label>
                <div class="credential-row">
                  <span v-if="!revealedCreds[row.recordId]" class="masked">••••••••</span>
                  <span v-else class="revealed">{{ revealedCreds[row.recordId] || '(empty)' }}</span>
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm reveal-btn"
                    @click="toggleReveal(row.recordId)"
                    :title="revealedCreds[row.recordId] ? 'Hide' : 'Reveal (requires credential privilege)'"
                  >
                    {{ revealedCreds[row.recordId] ? 'Hide' : 'Reveal' }}
                  </button>
                </div>
              </div>
              <div class="form-actions" style="margin-top: 10px;">
                <button class="btn btn-primary btn-sm" :disabled="row.saving" @click="saveRow(row)">
                  {{ row.saving ? 'Saving…' : 'Save' }}
                </button>
              </div>
              <div v-if="row.error" class="error" style="margin-top: 8px;">{{ row.error }}</div>

              <InsuranceInteractionLog
                :agency-id="agencyId"
                :insurance-definition-id="row.definitionId"
                :user-id="props.userId"
                scope="employee"
                title="Contact history for this provider"
                hint="Log calls with this payer about this provider."
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { toUploadsUrl } from '../../utils/uploadsUrl';
import InsuranceDefinitionsPanel from './InsuranceDefinitionsPanel.vue';
import InsuranceInteractionLog from './InsuranceInteractionLog.vue';

const props = defineProps({
  userId: { type: Number, required: true }
});

const agencyStore = useAgencyStore();
const agencies = computed(() => agencyStore.userAgencies || agencyStore.agencies || []);
const agencyId = ref(null);

const credentialing = ref([]);
const insurances = ref([]);
const loading = ref(false);
const loadError = ref('');
const showDefinitionsPanel = ref(false);
const revealedCreds = ref({});

const newEmptyEdit = () => ({
  effectiveDate: '',
  submittedDate: '',
  resubmittedDate: '',
  pinOrReference: '',
  notes: '',
  loginUsername: '',
  loginPassword: ''
});

const rowMeta = ref({});
const rows = ref([]);

const formatDisplayDate = (raw) => {
  if (!raw) return '';
  const d = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const mapRecordToEdit = (record) => ({
  effectiveDate: record?.effective_date || '',
  submittedDate: record?.submitted_date || '',
  resubmittedDate: record?.resubmitted_date || '',
  pinOrReference: record?.pin_or_reference || '',
  notes: record?.notes || '',
  loginUsername: '',
  loginPassword: ''
});

const rebuildRows = () => {
  const currentEdits = new Map((rows.value || []).map((r) => [r.definitionId, r.edit]));
  rows.value = (insurances.value || []).map((ins) => {
    const defId = Number(ins.id);
    const meta = rowMeta.value[defId] || {
      credentialed: false,
      recordId: null,
      edit: newEmptyEdit(),
      saving: false,
      error: '',
      hasUserCredentials: false
    };
    return {
      definitionId: defId,
      name: ins.name,
      logoUrl: ins.logo_path ? toUploadsUrl(ins.logo_path) : '',
      ...meta,
      edit: currentEdits.get(defId) || meta.edit
    };
  });
};

const syncRowMetaFromCredentialing = () => {
  const credByDefId = new Map();
  for (const c of credentialing.value || []) {
    credByDefId.set(Number(c.insurance_credentialing_definition_id), c);
  }
  const next = { ...rowMeta.value };
  for (const ins of insurances.value || []) {
    const defId = Number(ins.id);
    const cred = credByDefId.get(defId);
    const existing = next[defId];
    if (cred) {
      next[defId] = {
        credentialed: true,
        recordId: cred.id,
        edit: existing?.recordId === cred.id ? existing.edit : mapRecordToEdit(cred),
        saving: existing?.saving || false,
        error: existing?.error || '',
        hasUserCredentials: !!cred.has_user_credentials
      };
    } else if (!existing || existing.recordId) {
      next[defId] = {
        credentialed: false,
        recordId: null,
        edit: newEmptyEdit(),
        saving: false,
        error: '',
        hasUserCredentials: false
      };
    }
  }
  rowMeta.value = next;
  rebuildRows();
};

const onDefinitionsChanged = async (list) => {
  insurances.value = Array.isArray(list) ? list : insurances.value;
  syncRowMetaFromCredentialing();
};

const fetchCredentialing = async () => {
  if (!props.userId || !agencyId.value) return;
  loading.value = true;
  loadError.value = '';
  try {
    const res = await api.get(`/agencies/${agencyId.value}/credentialing/users/${props.userId}`);
    credentialing.value = res.data?.credentialing || [];
    syncRowMetaFromCredentialing();
  } catch (e) {
    loadError.value = e.response?.data?.error?.message || 'Failed to load credentialing';
    credentialing.value = [];
    syncRowMetaFromCredentialing();
  } finally {
    loading.value = false;
  }
};

const fetchInsurances = async () => {
  if (!agencyId.value) return;
  try {
    const res = await api.get(`/agencies/${agencyId.value}/credentialing/insurances`);
    insurances.value = res.data?.insurances || [];
    syncRowMetaFromCredentialing();
  } catch {
    insurances.value = [];
    syncRowMetaFromCredentialing();
  }
};

const setRowState = (defId, patch) => {
  rowMeta.value = {
    ...rowMeta.value,
    [defId]: { ...(rowMeta.value[defId] || {}), ...patch }
  };
  rebuildRows();
};

const toggleCredentialed = async (row, checked) => {
  if (!agencyId.value || !props.userId) return;
  setRowState(row.definitionId, { saving: true, error: '' });

  if (checked) {
    try {
      const res = await api.post(`/agencies/${agencyId.value}/credentialing/user-insurance`, {
        userId: props.userId,
        insuranceCredentialingDefinitionId: row.definitionId,
        effectiveDate: row.edit.effectiveDate || null,
        submittedDate: row.edit.submittedDate || null,
        resubmittedDate: row.edit.resubmittedDate || null,
        pinOrReference: row.edit.pinOrReference || null,
        notes: row.edit.notes || null
      });
      await fetchCredentialing();
      const createdId = res.data?.id;
      if (createdId) {
        setRowState(row.definitionId, {
          credentialed: true,
          recordId: createdId,
          saving: false,
          error: ''
        });
      }
    } catch (e) {
      setRowState(row.definitionId, {
        credentialed: false,
        saving: false,
        error: e.response?.data?.error?.message || 'Failed to mark as credentialed'
      });
    }
    return;
  }

  if (!confirm(`Remove ${row.name} credentialing for this provider? Tracking data will be deleted.`)) {
    setRowState(row.definitionId, { saving: false });
    return;
  }

  try {
    await api.delete(`/agencies/${agencyId.value}/credentialing/user-insurance`, {
      data: {
        userId: props.userId,
        insuranceCredentialingDefinitionId: row.definitionId
      }
    });
    setRowState(row.definitionId, {
      credentialed: false,
      recordId: null,
      edit: newEmptyEdit(),
      saving: false,
      error: '',
      hasUserCredentials: false
    });
    await fetchCredentialing();
  } catch (e) {
    setRowState(row.definitionId, {
      saving: false,
      error: e.response?.data?.error?.message || 'Failed to remove credentialing'
    });
  }
};

const saveRow = async (row) => {
  if (!agencyId.value || !row.recordId) return;
  setRowState(row.definitionId, { saving: true, error: '' });
  try {
    await api.patch(`/agencies/${agencyId.value}/credentialing/user-insurance/${row.recordId}`, {
      effectiveDate: row.edit.effectiveDate || null,
      submittedDate: row.edit.submittedDate || null,
      resubmittedDate: row.edit.resubmittedDate || null,
      pinOrReference: row.edit.pinOrReference || null,
      notes: row.edit.notes || null,
      loginUsername: row.edit.loginUsername || null,
      loginPassword: row.edit.loginPassword || null
    });
    setRowState(row.definitionId, {
      saving: false,
      edit: { ...row.edit, loginUsername: '', loginPassword: '' }
    });
    await fetchCredentialing();
  } catch (e) {
    setRowState(row.definitionId, {
      saving: false,
      error: e.response?.data?.error?.message || 'Failed to save credentialing'
    });
  }
};

const toggleReveal = async (uicId) => {
  if (!uicId) return;
  if (revealedCreds.value[uicId]) {
    revealedCreds.value = { ...revealedCreds.value, [uicId]: undefined };
    return;
  }
  try {
    const res = await api.post(`/agencies/${agencyId.value}/credentialing/reveal`, {
      type: 'user_level',
      id: uicId,
      field: 'username'
    });
    revealedCreds.value = { ...revealedCreds.value, [uicId]: res.data?.value ?? '' };
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to reveal credential');
  }
};

watch([() => props.userId, agencyId], () => fetchCredentialing(), { immediate: true });
watch(agencyId, (newId, oldId) => {
  if (oldId != null) showDefinitionsPanel.value = false;
  fetchInsurances();
});

watch(insurances, (list) => {
  if (Array.isArray(list) && list.length === 0 && !showDefinitionsPanel.value) {
    showDefinitionsPanel.value = true;
  }
});

watch(agencies, (list) => {
  if (list?.length && !agencyId.value) {
    agencyId.value = agencyStore.currentAgency?.id || list[0]?.id || null;
  }
}, { immediate: true });

onMounted(async () => {
  if (!agencies.value?.length) {
    await agencyStore.fetchUserAgencies?.();
  }
  if (agencies.value?.length && !agencyId.value) {
    agencyId.value = agencyStore.currentAgency?.id || agencies.value[0]?.id || null;
  }
  await fetchInsurances();
});
</script>

<style scoped>
.credentialing-tab {
  padding: 0;
  font-family: var(--agency-font-family, var(--font-body));
}
.intro-hint {
  margin-top: -6px;
  line-height: 1.5;
}
.section-title {
  margin: 0 0 6px;
  font-size: 1.05rem;
}
.section-hint {
  margin: 0 0 14px;
  line-height: 1.45;
}
.card-subhint {
  margin: 4px 0 0;
  font-size: 12px;
}
.credentialing-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.form-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.credentialing-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}
.credentialing-card--active {
  border-color: color-mix(in srgb, var(--primary, #c8922a) 35%, var(--border));
}
.card-header {
  background: var(--bg-alt);
  padding: 12px 16px;
}
.card-header--actions {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.card-header--row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.card-header h3 {
  margin: 0;
  font-size: 1rem;
  font-family: var(--agency-font-family, var(--font-header));
  flex: 1;
}
.credentialed-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  user-select: none;
}
.credentialed-toggle input {
  width: 16px;
  height: 16px;
  cursor: pointer;
}
.status-pill {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--bg-alt);
  color: var(--text-secondary);
  border: 1px solid var(--border);
}
.status-pill--active {
  background: #ecfdf5;
  color: #047857;
  border-color: #a7f3d0;
}
.definitions-panel-wrap {
  padding: 0;
}
.card-body {
  padding: 16px;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}
.form-help {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.35;
}
.credential-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.masked {
  font-family: var(--agency-font-family, var(--font-body));
  letter-spacing: 2px;
}
.empty-state {
  padding: 24px;
  text-align: center;
  color: var(--text-secondary);
}
.empty-definitions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.row-logo {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  object-fit: contain;
  border: 1px solid var(--border);
  background: #fff;
}
</style>
