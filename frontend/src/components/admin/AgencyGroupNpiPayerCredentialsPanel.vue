<template>
  <div class="payer-panel">
    <div class="payer-panel-header">
      <div>
        <h4>Payer credentials</h4>
        <p class="muted">Track submitted / returned / effective dates, documents, and notes for this group NPI.</p>
      </div>
      <div class="header-actions">
        <select v-model.number="createPayerId" class="payer-select" :disabled="creating || availablePayers.length === 0">
          <option :value="0">Select payer…</option>
          <option v-for="p in availablePayers" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <button
          class="btn btn-primary btn-sm"
          type="button"
          :disabled="creating || !createPayerId"
          @click="createCredential"
        >
          {{ creating ? 'Creating…' : 'Create credential' }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="loading">Loading payer credentials…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="!rows.length" class="empty muted">
      No payer credentials yet. Choose a payer above and click <strong>Create credential</strong>.
    </div>

    <div v-else class="payer-cards">
      <div v-for="row in rows" :key="row.recordId || row.definitionId" class="payer-card">
        <div class="payer-card-head">
          <img v-if="row.logoUrl" :src="row.logoUrl" :alt="row.name" class="payer-logo" />
          <div v-else class="payer-logo payer-logo--fallback">{{ (row.name || '?').slice(0, 1) }}</div>
          <div class="payer-title">
            <strong>{{ row.name }}</strong>
            <span class="status-pill" :class="payerStatusTone(row)">{{ payerStatusLabel(row) }}</span>
          </div>
          <button class="btn btn-danger btn-sm" type="button" :disabled="row.saving" @click="removeCredential(row)">
            Remove
          </button>
        </div>

        <div class="form-grid">
          <div class="form-group">
            <label>Date submitted</label>
            <input v-model="row.edit.submittedDate" type="date" :disabled="row.saving" />
          </div>
          <div class="form-group">
            <label>Date returned</label>
            <input v-model="row.edit.returnedDate" type="date" :disabled="row.saving" />
          </div>
          <div class="form-group">
            <label>Effective date</label>
            <input v-model="row.edit.effectiveDate" type="date" :disabled="row.saving" />
          </div>
          <div class="form-group">
            <label>Last resubmission</label>
            <input v-model="row.edit.resubmittedDate" type="date" :disabled="row.saving" />
          </div>
        </div>

        <div class="docs-row">
          <div class="doc-block" :class="{ 'doc-missing': !row.welcomeLetterUrl }">
            <div class="doc-label">Welcome letter</div>
            <a v-if="row.welcomeLetterUrl" class="link" :href="row.welcomeLetterUrl" target="_blank" rel="noopener">View</a>
            <span v-else class="missing">Not uploaded</span>
            <label class="link upload">
              {{ row.uploadingWelcome ? 'Uploading…' : 'Upload' }}
              <input
                type="file"
                accept="application/pdf,image/*"
                hidden
                :disabled="row.uploadingWelcome || row.saving"
                @change="uploadDoc(row, 'welcome_letter', $event)"
              />
            </label>
          </div>
          <div class="doc-block" :class="{ 'doc-missing': !row.contractUrl }">
            <div class="doc-label">Contract</div>
            <a v-if="row.contractUrl" class="link" :href="row.contractUrl" target="_blank" rel="noopener">View</a>
            <span v-else class="missing">Not uploaded</span>
            <label class="link upload">
              {{ row.uploadingContract ? 'Uploading…' : 'Upload' }}
              <input
                type="file"
                accept="application/pdf,image/*"
                hidden
                :disabled="row.uploadingContract || row.saving"
                @change="uploadDoc(row, 'contract', $event)"
              />
            </label>
          </div>
        </div>

        <div class="optional-toggles">
          <button
            type="button"
            class="plus-btn"
            :class="{ open: row.showProviderId }"
            @click="row.showProviderId = !row.showProviderId"
          >
            {{ row.showProviderId ? '−' : '+' }} Group provider ID
          </button>
          <button
            type="button"
            class="plus-btn"
            :class="{ open: row.showLogin }"
            @click="row.showLogin = !row.showLogin"
          >
            {{ row.showLogin ? '−' : '+' }} Username / password
          </button>
        </div>

        <div v-if="row.showProviderId" class="form-group optional-field">
          <label>Payer PIN / group provider ID</label>
          <input v-model.trim="row.edit.pinOrReference" type="text" :disabled="row.saving" placeholder="Payer-assigned ID" />
        </div>

        <div v-if="row.showLogin" class="form-grid optional-field">
          <div class="form-group">
            <label>Portal username</label>
            <input v-model.trim="row.edit.loginUsername" type="text" autocomplete="off" :disabled="row.saving" />
          </div>
          <div class="form-group">
            <label>Portal password</label>
            <input v-model.trim="row.edit.loginPassword" type="password" autocomplete="new-password" :disabled="row.saving" />
          </div>
          <div v-if="row.hasGroupCredentials" class="form-group reveal-group">
            <label>Saved login</label>
            <div class="reveal-row">
              <span v-if="!revealed[row.recordId]" class="masked">••••••••</span>
              <span v-else>{{ revealed[row.recordId] }}</span>
              <button class="btn btn-secondary btn-sm" type="button" @click="toggleReveal(row)">
                {{ revealed[row.recordId] ? 'Hide' : 'Reveal' }}
              </button>
            </div>
          </div>
        </div>

        <div class="form-group">
          <label>Payer notes</label>
          <textarea v-model.trim="row.edit.notes" rows="2" :disabled="row.saving" placeholder="Notes for this payer…" />
        </div>

        <div class="card-actions">
          <button class="btn btn-primary btn-sm" type="button" :disabled="row.saving" @click="saveRow(row)">
            {{ row.saving ? 'Saving…' : 'Save' }}
          </button>
          <span v-if="row.message" class="muted">{{ row.message }}</span>
          <span v-if="row.error" class="error-inline">{{ row.error }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
import { toUploadsUrl } from '../../utils/uploadsUrl';

const props = defineProps({
  agencyId: { type: Number, required: true },
  groupNpiId: { type: Number, required: true }
});

const emit = defineEmits(['changed']);

const loading = ref(false);
const creating = ref(false);
const error = ref('');
const rows = ref([]);
const payers = ref([]);
const createPayerId = ref(0);
const revealed = ref({});

const availablePayers = computed(() => {
  const taken = new Set(rows.value.map((r) => Number(r.definitionId)));
  return (payers.value || []).filter((p) => !taken.has(Number(p.id)));
});

const toDateInput = (v) => {
  if (!v) return '';
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
};

const mapRow = (cred, def) => {
  const definitionId = Number(cred?.insurance_credentialing_definition_id || def?.id || 0);
  const name = cred?.insurance_name || def?.name || 'Payer';
  const logoPath = cred?.insurance_logo_url || cred?.insurance_logo_path || def?.logo_path || null;
  const pin = String(cred?.pin_or_reference || '').trim();
  return {
    definitionId,
    recordId: Number(cred?.id || 0) || null,
    name,
    logoUrl: logoPath ? toUploadsUrl(logoPath) : null,
    hasGroupCredentials: !!cred?.has_group_credentials,
    welcomeLetterUrl: cred?.welcome_letter_url
      ? toUploadsUrl(cred.welcome_letter_url)
      : cred?.welcome_letter_path
        ? toUploadsUrl(cred.welcome_letter_path)
        : null,
    contractUrl: cred?.contract_url
      ? toUploadsUrl(cred.contract_url)
      : cred?.contract_path
        ? toUploadsUrl(cred.contract_path)
        : null,
    showProviderId: !!pin,
    showLogin: !!cred?.has_group_credentials,
    saving: false,
    uploadingWelcome: false,
    uploadingContract: false,
    message: '',
    error: '',
    edit: {
      effectiveDate: toDateInput(cred?.effective_date),
      submittedDate: toDateInput(cred?.submitted_date),
      resubmittedDate: toDateInput(cred?.resubmitted_date),
      returnedDate: toDateInput(cred?.returned_date),
      pinOrReference: pin,
      notes: String(cred?.notes || ''),
      loginUsername: '',
      loginPassword: ''
    }
  };
};

const payerStatusLabel = (row) => {
  if (row.edit.effectiveDate) return 'Active';
  if (row.edit.returnedDate) return 'Returned';
  if (row.edit.submittedDate) return 'Submitted';
  return 'In progress';
};

const payerStatusTone = (row) => {
  if (row.edit.effectiveDate) return 'active';
  if (row.edit.returnedDate) return 'returned';
  if (row.edit.submittedDate) return 'submitted';
  return 'progress';
};

const load = async () => {
  if (!props.agencyId || !props.groupNpiId) return;
  loading.value = true;
  error.value = '';
  try {
    const [credRes, payerRes] = await Promise.all([
      api.get(`/agencies/${props.agencyId}/credentialing/group-npis/${props.groupNpiId}/payers`),
      api.get(`/agencies/${props.agencyId}/credentialing/insurances`)
    ]);
    payers.value = payerRes.data?.insurances || payerRes.data?.definitions || payerRes.data || [];
    const creds = credRes.data?.credentialing || [];
    const byDef = new Map(creds.map((c) => [Number(c.insurance_credentialing_definition_id), c]));
    rows.value = (payers.value || [])
      .map((def) => {
        const cred = byDef.get(Number(def.id));
        return cred ? mapRow(cred, def) : null;
      })
      .filter(Boolean);
    for (const cred of creds) {
      if (!rows.value.some((r) => Number(r.definitionId) === Number(cred.insurance_credentialing_definition_id))) {
        rows.value.push(mapRow(cred, null));
      }
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load payer credentials';
    rows.value = [];
  } finally {
    loading.value = false;
  }
};

const createCredential = async () => {
  if (!createPayerId.value) return;
  creating.value = true;
  error.value = '';
  try {
    await api.post(`/agencies/${props.agencyId}/credentialing/group-npi-insurance`, {
      agencyGroupNpiId: props.groupNpiId,
      insuranceCredentialingDefinitionId: createPayerId.value
    });
    createPayerId.value = 0;
    await load();
    emit('changed');
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to create credential';
  } finally {
    creating.value = false;
  }
};

const saveRow = async (row) => {
  row.saving = true;
  row.error = '';
  row.message = '';
  try {
    if (!row.recordId) {
      const created = await api.post(`/agencies/${props.agencyId}/credentialing/group-npi-insurance`, {
        agencyGroupNpiId: props.groupNpiId,
        insuranceCredentialingDefinitionId: row.definitionId,
        effectiveDate: row.edit.effectiveDate || null,
        submittedDate: row.edit.submittedDate || null,
        resubmittedDate: row.edit.resubmittedDate || null,
        returnedDate: row.edit.returnedDate || null,
        pinOrReference: row.edit.pinOrReference || null,
        notes: row.edit.notes || null
      });
      row.recordId = Number(created.data?.id || 0) || row.recordId;
    } else {
      await api.patch(`/agencies/${props.agencyId}/credentialing/group-npi-insurance/${row.recordId}`, {
        effectiveDate: row.edit.effectiveDate || null,
        submittedDate: row.edit.submittedDate || null,
        resubmittedDate: row.edit.resubmittedDate || null,
        returnedDate: row.edit.returnedDate || null,
        pinOrReference: row.edit.pinOrReference || null,
        notes: row.edit.notes || null,
        loginUsername: row.edit.loginUsername || undefined,
        loginPassword: row.edit.loginPassword || undefined
      });
    }
    row.edit.loginUsername = '';
    row.edit.loginPassword = '';
    row.message = 'Saved.';
    await load();
    emit('changed');
  } catch (e) {
    row.error = e.response?.data?.error?.message || 'Failed to save';
  } finally {
    row.saving = false;
  }
};

const removeCredential = async (row) => {
  if (!confirm(`Remove ${row.name} credential for this group NPI?`)) return;
  row.saving = true;
  row.error = '';
  try {
    await api.delete(`/agencies/${props.agencyId}/credentialing/group-npi-insurance`, {
      data: {
        agencyGroupNpiId: props.groupNpiId,
        insuranceCredentialingDefinitionId: row.definitionId
      }
    });
    await load();
    emit('changed');
  } catch (e) {
    row.error = e.response?.data?.error?.message || 'Failed to remove';
  } finally {
    row.saving = false;
  }
};

const uploadDoc = async (row, docType, event) => {
  const file = event?.target?.files?.[0];
  event.target.value = '';
  if (!file) return;
  if (!row.recordId) {
    row.error = 'Save the credential first, then upload documents.';
    return;
  }
  if (docType === 'welcome_letter') row.uploadingWelcome = true;
  else row.uploadingContract = true;
  row.error = '';
  try {
    const form = new FormData();
    form.append('file', file);
    const res = await api.post(
      `/agencies/${props.agencyId}/credentialing/group-npi-insurance/${row.recordId}/documents/${docType}`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    const url = res.data?.url ? toUploadsUrl(res.data.url) : null;
    if (docType === 'welcome_letter') row.welcomeLetterUrl = url;
    else row.contractUrl = url;
    row.message = `${docType === 'welcome_letter' ? 'Welcome letter' : 'Contract'} uploaded.`;
    emit('changed');
  } catch (e) {
    row.error = e.response?.data?.error?.message || 'Upload failed';
  } finally {
    row.uploadingWelcome = false;
    row.uploadingContract = false;
  }
};

const toggleReveal = async (row) => {
  if (revealed.value[row.recordId]) {
    const next = { ...revealed.value };
    delete next[row.recordId];
    revealed.value = next;
    return;
  }
  try {
    const res = await api.post(`/agencies/${props.agencyId}/credentialing/reveal`, {
      type: 'group_level',
      id: row.recordId,
      field: 'username'
    });
    const user = res.data?.value || '';
    let pass = '';
    try {
      const passRes = await api.post(`/agencies/${props.agencyId}/credentialing/reveal`, {
        type: 'group_level',
        id: row.recordId,
        field: 'password'
      });
      pass = passRes.data?.value || '';
    } catch {
      pass = '';
    }
    revealed.value = {
      ...revealed.value,
      [row.recordId]: pass ? `${user} / ${pass}` : user || '(empty)'
    };
  } catch (e) {
    row.error = e.response?.data?.error?.message || 'Failed to reveal credentials';
  }
};

watch(
  () => [props.agencyId, props.groupNpiId],
  () => {
    void load();
  },
  { immediate: true }
);
</script>

<style scoped>
.payer-panel {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 14px;
}
.payer-panel-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.payer-panel-header h4 {
  margin: 0 0 4px;
}
.muted {
  color: #64748b;
  font-size: 13px;
  margin: 0;
}
.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.payer-select {
  min-width: 180px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 6px 8px;
  background: #fff;
}
.form-group label,
.doc-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #475569;
  margin-bottom: 4px;
}
.form-group textarea,
.form-group input {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 6px 8px;
  background: #fff;
}
.card-actions {
  margin-top: 8px;
  display: flex;
  gap: 8px;
  align-items: center;
}
.payer-cards {
  display: grid;
  gap: 10px;
}
.payer-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px;
}
.payer-card-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.payer-logo {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  object-fit: contain;
  background: #f1f5f9;
  flex: 0 0 auto;
}
.payer-logo--fallback {
  display: grid;
  place-items: center;
  font-weight: 700;
  color: #0f766e;
}
.payer-title {
  flex: 1;
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.status-pill {
  display: inline-flex;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}
.status-pill.active { background: #dcfce7; color: #15803d; }
.status-pill.returned { background: #dbeafe; color: #1d4ed8; }
.status-pill.submitted { background: #ffedd5; color: #c2410c; }
.status-pill.progress { background: #ede9fe; color: #6d28d9; }
.form-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.docs-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 10px;
}
.doc-block {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px;
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.doc-block.doc-missing {
  background: #fef2f2;
  border-color: #fecaca;
}
.missing {
  color: #b91c1c;
  font-weight: 700;
  font-size: 12px;
}
.link {
  color: #0f766e;
  font-weight: 600;
  font-size: 12px;
  cursor: pointer;
  text-decoration: none;
}
.upload {
  margin-left: auto;
}
.optional-toggles {
  display: flex;
  gap: 8px;
  margin: 10px 0 6px;
  flex-wrap: wrap;
}
.plus-btn {
  border: 1px dashed #94a3b8;
  background: #fff;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  color: #334155;
  cursor: pointer;
}
.plus-btn.open {
  border-style: solid;
  background: #ecfdf5;
  border-color: #6ee7b7;
  color: #065f46;
}
.optional-field {
  margin-top: 8px;
}
.reveal-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.masked {
  letter-spacing: 2px;
}
.error-inline {
  color: #b91c1c;
  font-size: 12px;
}
.empty,
.loading,
.error {
  padding: 8px 0;
}
.error {
  color: #b91c1c;
}
@media (max-width: 900px) {
  .form-grid,
  .docs-row {
    grid-template-columns: 1fr 1fr;
  }
}
@media (max-width: 640px) {
  .form-grid,
  .docs-row {
    grid-template-columns: 1fr;
  }
}
</style>
