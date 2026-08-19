<template>
  <div v-if="open" class="reply-lib-overlay" @click.self="emit('close')">
    <div class="reply-lib-modal" role="dialog" aria-labelledby="reply-lib-title">
      <header class="reply-lib-header">
        <div>
          <h2 id="reply-lib-title">School reply library</h2>
          <p class="muted">Curated templates for school-facing ticket and email replies.</p>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" @click="emit('close')">Close</button>
      </header>

      <div class="reply-lib-mode-tabs">
        <button type="button" class="mode-tab" :class="{ active: viewMode === 'templates' }" @click="viewMode = 'templates'">
          Templates
        </button>
        <button type="button" class="mode-tab" :class="{ active: viewMode === 'proposals' }" @click="switchToProposals">
          Proposals
          <span v-if="pendingProposalCount" class="proposal-badge">{{ pendingProposalCount }}</span>
        </button>
      </div>

      <div v-if="viewMode === 'templates'" class="reply-lib-toolbar">
        <input
          v-model="search"
          type="search"
          class="reply-lib-search"
          placeholder="Search templates…"
          @input="debouncedLoad"
        />
        <select v-model="intentFilter" class="reply-lib-select" @change="loadEntries">
          <option value="">All intents</option>
          <option v-for="key in intentKeys" :key="key" :value="key">{{ intentLabels[key] || key }}</option>
        </select>
        <button type="button" class="btn btn-secondary btn-sm" :disabled="loading" @click="loadEntries">
          {{ loading ? 'Loading…' : 'Refresh' }}
        </button>
        <button type="button" class="btn btn-primary btn-sm" @click="startCreate">New template</button>
      </div>

      <div v-if="error" class="error">{{ error }}</div>

      <div v-if="viewMode === 'templates'" class="reply-lib-body">
        <section class="reply-lib-list">
          <div v-if="loading" class="muted">Loading templates…</div>
          <div v-else-if="!entries.length" class="muted">No templates yet. Save a good school reply from a ticket to start the library.</div>
          <button
            v-for="entry in entries"
            :key="entry.id"
            type="button"
            class="reply-lib-item"
            :class="{ active: selectedEntry?.id === entry.id }"
            @click="selectEntry(entry)"
          >
            <div class="reply-lib-item-title">{{ entry.title }}</div>
            <div class="reply-lib-item-meta muted">
              {{ entry.intentLabel }}
              <span v-if="entry.usageCount"> · used {{ entry.usageCount }}×</span>
            </div>
          </button>
        </section>

        <section class="reply-lib-editor">
          <template v-if="editing">
            <label class="reply-lib-label">Title</label>
            <input v-model="form.title" class="reply-lib-input" type="text" />

            <label class="reply-lib-label">Intent</label>
            <select v-model="form.intentKey" class="reply-lib-select">
              <option v-for="key in intentKeys" :key="key" :value="key">{{ intentLabels[key] || key }}</option>
            </select>

            <label class="reply-lib-label">Subject template (optional)</label>
            <input v-model="form.subjectTemplate" class="reply-lib-input" type="text" />

            <label class="reply-lib-label">Body</label>
            <textarea v-model="form.bodyTemplate" class="reply-lib-textarea" rows="10" />

            <div class="reply-lib-editor-actions">
              <button type="button" class="btn btn-primary btn-sm" :disabled="saving" @click="saveEntry">
                {{ saving ? 'Saving…' : (form.id ? 'Save changes' : 'Create template') }}
              </button>
              <button
                v-if="form.id"
                type="button"
                class="btn btn-secondary btn-sm"
                :disabled="saving"
                @click="deactivateEntry"
              >
                Deactivate
              </button>
              <button type="button" class="btn btn-secondary btn-sm" @click="cancelEdit">Cancel</button>
            </div>
          </template>

          <template v-else-if="selectedEntry">
            <div class="reply-lib-preview-head">
              <strong>{{ selectedEntry.title }}</strong>
              <span class="muted"> · {{ selectedEntry.intentLabel }}</span>
            </div>
            <pre class="reply-lib-preview">{{ selectedEntry.bodyTemplate }}</pre>
            <div class="reply-lib-editor-actions">
              <button type="button" class="btn btn-primary btn-sm" @click="insertSelected">Insert into reply</button>
              <button type="button" class="btn btn-secondary btn-sm" @click="editSelected">Edit</button>
            </div>
          </template>

          <div v-else class="muted">Select a template or create a new one.</div>
        </section>
      </div>

      <div v-else class="reply-lib-proposals">
        <div v-if="proposalsLoading" class="muted">Loading proposals…</div>
        <div v-else-if="!proposals.length" class="muted">
          No pending proposals. When staff edit an AI draft before sending, a template proposal appears here for approval.
        </div>
        <article v-for="proposal in proposals" :key="proposal.id" class="proposal-card">
          <div class="proposal-head">
            <strong>{{ proposal.title }}</strong>
            <span class="muted"> · {{ proposal.schoolName || 'School' }}</span>
          </div>
          <div v-if="proposal.editSummary" class="proposal-summary muted">{{ proposal.editSummary }}</div>
          <details class="proposal-diff">
            <summary>Compare draft vs staff answer</summary>
            <div class="proposal-columns">
              <div>
                <div class="proposal-col-label">AI draft</div>
                <pre>{{ proposal.originalDraft }}</pre>
              </div>
              <div>
                <div class="proposal-col-label">Staff answer</div>
                <pre>{{ proposal.proposedBody }}</pre>
              </div>
            </div>
          </details>
          <div class="reply-lib-editor-actions">
            <button
              type="button"
              class="btn btn-primary btn-sm"
              :disabled="proposalBusyId === proposal.id"
              @click="approveProposal(proposal)"
            >
              {{ proposalBusyId === proposal.id ? 'Saving…' : 'Approve to library' }}
            </button>
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              :disabled="proposalBusyId === proposal.id"
              @click="dismissProposal(proposal)"
            >
              Dismiss
            </button>
          </div>
        </article>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  open: { type: Boolean, default: false },
  agencyId: { type: [Number, String], default: null },
  ticketId: { type: [Number, String], default: null },
  schoolOrganizationId: { type: [Number, String], default: null }
});

const emit = defineEmits(['close', 'insert', 'proposals-updated']);

const viewMode = ref('templates');
const entries = ref([]);
const proposals = ref([]);
const pendingProposalCount = ref(0);
const proposalsLoading = ref(false);
const proposalBusyId = ref(null);
const intentKeys = ref([]);
const intentLabels = ref({});
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const search = ref('');
const intentFilter = ref('');
const selectedEntry = ref(null);
const editing = ref(false);
const form = ref(emptyForm());

let debounceTimer = null;

function emptyForm() {
  return {
    id: null,
    title: '',
    intentKey: 'general',
    subjectTemplate: '',
    bodyTemplate: ''
  };
}

function debouncedLoad() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => loadEntries(), 250);
}

async function loadEntries() {
  const agencyId = Number(props.agencyId || 0);
  if (!agencyId) return;
  loading.value = true;
  error.value = '';
  try {
    const params = { agencyId };
    if (intentFilter.value) params.intentKey = intentFilter.value;
    if (search.value.trim()) params.search = search.value.trim();
    if (props.schoolOrganizationId) params.schoolOrganizationId = Number(props.schoolOrganizationId);
    const r = await api.get('/school-support-reply-library', { params, skipGlobalLoading: true });
    entries.value = Array.isArray(r.data?.entries) ? r.data.entries : [];
    intentKeys.value = Array.isArray(r.data?.intentKeys) ? r.data.intentKeys : [];
    intentLabels.value = r.data?.intentLabels || {};
    pendingProposalCount.value = Number(r.data?.pendingProposalCount || 0);
    emit('proposals-updated', pendingProposalCount.value);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load reply library';
    entries.value = [];
  } finally {
    loading.value = false;
  }
}

async function loadMatchesForTicket() {
  if (!props.ticketId) return;
  try {
    const r = await api.get(`/school-support-reply-library/match/ticket/${props.ticketId}`, {
      skipGlobalLoading: true
    });
    if (r.data?.intentKey && !intentFilter.value) intentFilter.value = r.data.intentKey;
    const matches = Array.isArray(r.data?.matches) ? r.data.matches : [];
    if (matches.length) {
      selectedEntry.value = matches[0];
      editing.value = false;
    }
  } catch {
    // optional
  }
}

function selectEntry(entry) {
  selectedEntry.value = entry;
  editing.value = false;
}

function startCreate() {
  editing.value = true;
  selectedEntry.value = null;
  form.value = emptyForm();
}

function editSelected() {
  if (!selectedEntry.value) return;
  editing.value = true;
  form.value = {
    id: selectedEntry.value.id,
    title: selectedEntry.value.title,
    intentKey: selectedEntry.value.intentKey || 'general',
    subjectTemplate: selectedEntry.value.subjectTemplate || '',
    bodyTemplate: selectedEntry.value.bodyTemplate || ''
  };
}

function cancelEdit() {
  editing.value = false;
  form.value = emptyForm();
}

async function saveEntry() {
  const agencyId = Number(props.agencyId || 0);
  if (!agencyId) return;
  saving.value = true;
  error.value = '';
  try {
    const payload = {
      agencyId,
      title: form.value.title,
      intentKey: form.value.intentKey,
      subjectTemplate: form.value.subjectTemplate || null,
      bodyTemplate: form.value.bodyTemplate,
      schoolOrganizationId: props.schoolOrganizationId ? Number(props.schoolOrganizationId) : null
    };
    if (form.value.id) {
      await api.put(`/school-support-reply-library/${form.value.id}`, payload);
    } else {
      await api.post('/school-support-reply-library', payload);
    }
    editing.value = false;
    form.value = emptyForm();
    await loadEntries();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to save template';
  } finally {
    saving.value = false;
  }
}

async function deactivateEntry() {
  if (!form.value.id) return;
  saving.value = true;
  error.value = '';
  try {
    await api.delete(`/school-support-reply-library/${form.value.id}`);
    editing.value = false;
    selectedEntry.value = null;
    form.value = emptyForm();
    await loadEntries();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to deactivate template';
  } finally {
    saving.value = false;
  }
}

function insertSelected() {
  const text = String(selectedEntry.value?.bodyTemplate || '').trim();
  if (!text) return;
  emit('insert', text);
  emit('close');
}

async function loadProposals() {
  const agencyId = Number(props.agencyId || 0);
  if (!agencyId) return;
  proposalsLoading.value = true;
  error.value = '';
  try {
    const r = await api.get('/school-support-reply-library/proposals', {
      params: { agencyId, status: 'pending' },
      skipGlobalLoading: true
    });
    proposals.value = Array.isArray(r.data?.proposals) ? r.data.proposals : [];
    pendingProposalCount.value = proposals.value.length;
    emit('proposals-updated', pendingProposalCount.value);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load proposals';
    proposals.value = [];
  } finally {
    proposalsLoading.value = false;
  }
}

async function switchToProposals() {
  viewMode.value = 'proposals';
  await loadProposals();
}

async function approveProposal(proposal) {
  if (!proposal?.id) return;
  proposalBusyId.value = proposal.id;
  error.value = '';
  try {
    await api.post(`/school-support-reply-library/proposals/${proposal.id}/approve`, {
      title: proposal.title
    });
    await loadProposals();
    await loadEntries();
    viewMode.value = 'templates';
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to approve proposal';
  } finally {
    proposalBusyId.value = null;
  }
}

async function dismissProposal(proposal) {
  if (!proposal?.id) return;
  proposalBusyId.value = proposal.id;
  error.value = '';
  try {
    await api.post(`/school-support-reply-library/proposals/${proposal.id}/dismiss`);
    await loadProposals();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to dismiss proposal';
  } finally {
    proposalBusyId.value = null;
  }
}

watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) return;
    await loadEntries();
    await loadMatchesForTicket();
  }
);

onMounted(() => {
  if (props.open) {
    loadEntries();
    loadMatchesForTicket();
  }
});
</script>

<style scoped>
.reply-lib-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
  padding: 16px;
}
.reply-lib-modal {
  width: min(960px, 100%);
  max-height: 90vh;
  overflow: auto;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.2);
  padding: 16px;
}
.reply-lib-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 12px;
}
.reply-lib-header h2 { margin: 0 0 4px; font-size: 1.15rem; }
.reply-lib-mode-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.mode-tab {
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  border-radius: 999px;
  padding: 6px 12px;
  cursor: pointer;
  font: inherit;
}
.mode-tab.active {
  background: #eff6ff;
  border-color: #2563eb;
  color: #1d4ed8;
}
.proposal-badge {
  display: inline-flex;
  min-width: 18px;
  justify-content: center;
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 999px;
  background: #f97316;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}
.reply-lib-proposals {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 62vh;
  overflow: auto;
}
.proposal-card {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 12px;
  background: #fff;
}
.proposal-head { margin-bottom: 6px; }
.proposal-summary { font-size: 12px; margin-bottom: 8px; }
.proposal-diff summary { cursor: pointer; font-size: 12px; color: #2563eb; }
.proposal-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 8px;
}
.proposal-col-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: #64748b;
  margin-bottom: 4px;
}
.proposal-columns pre {
  white-space: pre-wrap;
  font: inherit;
  background: #f8fafc;
  border-radius: 8px;
  padding: 8px;
  max-height: 180px;
  overflow: auto;
}
.reply-lib-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}
.reply-lib-search, .reply-lib-input, .reply-lib-select, .reply-lib-textarea {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
}
.reply-lib-search { flex: 1 1 220px; }
.reply-lib-select { flex: 0 1 200px; }
.reply-lib-body {
  display: grid;
  grid-template-columns: minmax(220px, 280px) 1fr;
  gap: 12px;
  min-height: 320px;
}
.reply-lib-list {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 8px;
  overflow: auto;
  max-height: 52vh;
}
.reply-lib-item {
  display: block;
  width: 100%;
  text-align: left;
  border: 1px solid transparent;
  background: #f8fafc;
  border-radius: 8px;
  padding: 8px 10px;
  margin-bottom: 6px;
  cursor: pointer;
}
.reply-lib-item.active { border-color: #2563eb; background: #eff6ff; }
.reply-lib-item-title { font-weight: 600; font-size: 0.92rem; }
.reply-lib-item-meta { font-size: 0.78rem; margin-top: 2px; }
.reply-lib-editor {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 12px;
  overflow: auto;
}
.reply-lib-label {
  display: block;
  font-size: 0.82rem;
  font-weight: 600;
  margin: 8px 0 4px;
}
.reply-lib-preview {
  white-space: pre-wrap;
  font: inherit;
  background: #f8fafc;
  border-radius: 8px;
  padding: 10px;
  margin: 8px 0;
}
.reply-lib-editor-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}
@media (max-width: 760px) {
  .reply-lib-body { grid-template-columns: 1fr; }
}
</style>
