<template>
  <div class="clinical-retention card">
    <div class="panel-head">
      <div>
        <h3>Booked Clinical Session Artifacts</h3>
        <p class="muted">Separate clinical data plane with restore and legal hold controls.</p>
      </div>
      <button class="btn btn-secondary btn-sm" :disabled="loading || !canBootstrap" @click="bootstrapAndLoad">
        {{ loading ? 'Loading…' : 'Refresh' }}
      </button>
    </div>

    <div class="inputs">
      <div class="field">
        <label>Agency ID</label>
        <input v-model.number="agencyIdLocal" type="number" min="1" class="input" :disabled="hasFixedContext" />
      </div>
      <div class="field">
        <label>Clinical Client ID</label>
        <input v-model.number="clientIdLocal" type="number" min="1" class="input" :disabled="hasFixedContext" />
      </div>
      <div class="field">
        <label>Booked Session Event ID</label>
        <input v-model.number="officeEventIdLocal" type="number" min="1" class="input" :disabled="hasFixedContext" />
      </div>
      <div class="field check">
        <label class="checkbox"><input type="checkbox" v-model="showDeleted" /> Show deleted</label>
      </div>
    </div>

    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="sessionId" class="muted" style="margin: 6px 0 10px;">Clinical Session ID: {{ sessionId }}</div>

    <div class="create-row">
      <select v-model="createType" class="input small">
        <option value="note">Note</option>
        <option value="claim">Claim</option>
        <option value="document">Document</option>
      </select>
      <input v-model="createTitle" class="input" :placeholder="createType === 'claim' ? 'Claim number or title' : 'Title'" />
      <button class="btn btn-primary btn-sm" :disabled="creating || !sessionId || !String(createTitle || '').trim()" @click="createArtifact">
        {{ creating ? 'Creating…' : 'Create' }}
      </button>
    </div>

    <div class="grid">
      <div class="col">
        <h4>Notes</h4>
        <div v-for="x in artifacts.notes" :key="`n-${x.id}`" class="row-item">
          <div><strong>{{ x.title || `Note ${x.id}` }}</strong></div>
          <div class="meta">{{ statusMeta(x) }}</div>
          <div class="actions">
            <button class="btn btn-secondary btn-sm" :disabled="busyId === `note-${x.id}` || x.is_legal_hold" @click="softDelete('note', x.id)">Delete</button>
            <button class="btn btn-secondary btn-sm" :disabled="busyId === `note-${x.id}` || !x.is_deleted" @click="restore('note', x.id)">Restore</button>
            <button v-if="!x.is_legal_hold" class="btn btn-secondary btn-sm" :disabled="busyId === `note-${x.id}`" @click="setHold('note', x.id)">Legal hold</button>
            <button v-else class="btn btn-secondary btn-sm" :disabled="busyId === `note-${x.id}`" @click="releaseHold('note', x.id)">Release hold</button>
          </div>
        </div>
      </div>
      <div class="col">
        <h4>Claims</h4>
        <div v-for="x in artifacts.claims" :key="`c-${x.id}`" class="row-item">
          <div><strong>{{ x.claim_number || `Claim ${x.id}` }}</strong></div>
          <div class="meta">{{ statusMeta(x) }}</div>
          <div class="actions">
            <button class="btn btn-secondary btn-sm" :disabled="busyId === `claim-${x.id}` || x.is_legal_hold" @click="softDelete('claim', x.id)">Delete</button>
            <button class="btn btn-secondary btn-sm" :disabled="busyId === `claim-${x.id}` || !x.is_deleted" @click="restore('claim', x.id)">Restore</button>
            <button v-if="!x.is_legal_hold" class="btn btn-secondary btn-sm" :disabled="busyId === `claim-${x.id}`" @click="setHold('claim', x.id)">Legal hold</button>
            <button v-else class="btn btn-secondary btn-sm" :disabled="busyId === `claim-${x.id}`" @click="releaseHold('claim', x.id)">Release hold</button>
          </div>
        </div>
      </div>
      <div class="col">
        <h4>Documents</h4>
        <div v-for="x in artifacts.documents" :key="`d-${x.id}`" class="row-item">
          <div><strong>{{ x.title || `Document ${x.id}` }}</strong></div>
          <div class="meta">{{ statusMeta(x) }}</div>
          <div class="actions">
            <button class="btn btn-secondary btn-sm" :disabled="busyId === `document-${x.id}` || x.is_legal_hold" @click="softDelete('document', x.id)">Delete</button>
            <button class="btn btn-secondary btn-sm" :disabled="busyId === `document-${x.id}` || !x.is_deleted" @click="restore('document', x.id)">Restore</button>
            <button v-if="!x.is_legal_hold" class="btn btn-secondary btn-sm" :disabled="busyId === `document-${x.id}`" @click="setHold('document', x.id)">Legal hold</button>
            <button v-else class="btn btn-secondary btn-sm" :disabled="busyId === `document-${x.id}`" @click="releaseHold('document', x.id)">Release hold</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: Number, default: null },
  clientId: { type: Number, default: null },
  officeEventId: { type: Number, default: null }
});

const hasFixedContext = computed(() => Number(props.agencyId) > 0 && Number(props.clientId) > 0 && Number(props.officeEventId) > 0);
const agencyIdLocal = ref(Number(props.agencyId || 0) || null);
const clientIdLocal = ref(Number(props.clientId || 0) || null);
const officeEventIdLocal = ref(Number(props.officeEventId || 0) || null);
const showDeleted = ref(false);
const loading = ref(false);
const creating = ref(false);
const error = ref('');
const sessionId = ref(null);
const artifacts = ref({ notes: [], claims: [], documents: [] });
const createType = ref('note');
const createTitle = ref('');
const busyId = ref('');

const canBootstrap = computed(() => Number(agencyIdLocal.value) > 0 && Number(clientIdLocal.value) > 0 && Number(officeEventIdLocal.value) > 0);

watch(() => [props.agencyId, props.clientId, props.officeEventId], ([aid, cid, eid]) => {
  if (Number(aid) > 0) agencyIdLocal.value = Number(aid);
  if (Number(cid) > 0) clientIdLocal.value = Number(cid);
  if (Number(eid) > 0) officeEventIdLocal.value = Number(eid);
});

const fixedContextKey = computed(() =>
  `${Number(agencyIdLocal.value || 0)}:${Number(clientIdLocal.value || 0)}:${Number(officeEventIdLocal.value || 0)}`
);

watch(showDeleted, () => {
  if (sessionId.value) loadArtifacts();
});

const statusMeta = (row) => {
  const parts = [];
  if (row.is_deleted) parts.push('Deleted');
  if (row.is_legal_hold) parts.push(`Legal hold${row.legal_hold_reason ? `: ${row.legal_hold_reason}` : ''}`);
  if (!parts.length) parts.push('Active');
  return parts.join(' | ');
};

const bootstrapAndLoad = async () => {
  if (!canBootstrap.value) return;
  try {
    loading.value = true;
    error.value = '';
    const res = await api.post('/clinical-data/sessions/bootstrap', {
      agencyId: Number(agencyIdLocal.value),
      clientId: Number(clientIdLocal.value),
      officeEventId: Number(officeEventIdLocal.value)
    });
    sessionId.value = Number(res.data?.session?.id || 0) || null;
    await loadArtifacts();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load clinical session artifacts';
  } finally {
    loading.value = false;
  }
};

const loadArtifacts = async () => {
  if (!sessionId.value) return;
  const res = await api.get(`/clinical-data/sessions/${sessionId.value}/artifacts`, {
    params: {
      includeDeleted: showDeleted.value ? 'true' : 'false'
    }
  });
  artifacts.value = {
    notes: Array.isArray(res.data?.artifacts?.notes) ? res.data.artifacts.notes : [],
    claims: Array.isArray(res.data?.artifacts?.claims) ? res.data.artifacts.claims : [],
    documents: Array.isArray(res.data?.artifacts?.documents) ? res.data.artifacts.documents : []
  };
};

const createArtifact = async () => {
  if (!sessionId.value) return;
  try {
    creating.value = true;
    const title = String(createTitle.value || '').trim();
    if (createType.value === 'note') {
      await api.post(`/clinical-data/sessions/${sessionId.value}/notes`, { title, notePayload: '' });
    } else if (createType.value === 'claim') {
      await api.post(`/clinical-data/sessions/${sessionId.value}/claims`, { claimNumber: title, claimStatus: 'PENDING', amountCents: 0 });
    } else {
      await api.post(`/clinical-data/sessions/${sessionId.value}/documents`, { title, documentType: 'session_attachment' });
    }
    createTitle.value = '';
    await loadArtifacts();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to create artifact';
  } finally {
    creating.value = false;
  }
};

const softDelete = async (recordType, id) => {
  busyId.value = `${recordType}-${id}`;
  try {
    await api.delete(`/clinical-data/records/${recordType}/${id}`);
    await loadArtifacts();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Delete failed';
  } finally {
    busyId.value = '';
  }
};

const restore = async (recordType, id) => {
  busyId.value = `${recordType}-${id}`;
  try {
    await api.post(`/clinical-data/records/${recordType}/${id}/restore`, {});
    await loadArtifacts();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Restore failed';
  } finally {
    busyId.value = '';
  }
};

const setHold = async (recordType, id) => {
  const reason = window.prompt('Legal hold reason (required):', '');
  if (!reason) return;
  busyId.value = `${recordType}-${id}`;
  try {
    await api.post(`/clinical-data/records/${recordType}/${id}/legal-hold`, { reason: String(reason).trim() });
    await loadArtifacts();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to set legal hold';
  } finally {
    busyId.value = '';
  }
};

const releaseHold = async (recordType, id) => {
  busyId.value = `${recordType}-${id}`;
  try {
    await api.post(`/clinical-data/records/${recordType}/${id}/legal-hold/release`, {});
    await loadArtifacts();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to release legal hold';
  } finally {
    busyId.value = '';
  }
};

watch(
  [hasFixedContext, canBootstrap, fixedContextKey],
  async ([fixed, can]) => {
    if (!fixed || !can) return;
    await bootstrapAndLoad();
  },
  { immediate: true }
);
</script>

<style scoped>
.clinical-retention { margin-top: 16px; padding: 14px; border: 1px solid var(--border); border-radius: 10px; }
.panel-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.panel-head h3 { margin: 0; font-size: 16px; }
.inputs { display: grid; grid-template-columns: repeat(4, minmax(120px, 1fr)); gap: 10px; margin: 10px 0; }
.field { display: flex; flex-direction: column; gap: 4px; }
.field.check { justify-content: flex-end; }
.input { width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 8px; }
.input.small { max-width: 140px; }
.create-row { display: flex; gap: 8px; margin: 10px 0; }
.grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.col { border: 1px solid var(--border); border-radius: 8px; padding: 8px; min-height: 120px; }
.col h4 { margin: 0 0 8px; font-size: 14px; }
.row-item { border-bottom: 1px solid var(--border); padding: 8px 0; }
.row-item:last-child { border-bottom: none; }
.meta { font-size: 12px; color: var(--text-secondary); margin-top: 4px; }
.actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.muted { color: var(--text-secondary); font-size: 12px; }
.error { color: #b32727; margin: 6px 0; }
</style>

