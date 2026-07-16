<template>
  <div class="modal-backdrop" @click.self="close">
    <div class="modal" role="dialog" aria-modal="true" :aria-label="modalTitle">
      <div class="modal-header">
        <h3>{{ modalTitle }}</h3>
        <button type="button" class="close-btn" aria-label="Close" @click="close">✕</button>
      </div>

      <div class="modal-body">
        <p class="tool-line">
          <strong>{{ toolTitle }}</strong>
          <span v-if="modeHint" class="muted"> — {{ modeHint }}</span>
        </p>

        <label class="field-label">Search client</label>
        <input
          ref="searchInput"
          v-model="search"
          type="text"
          class="form-input"
          placeholder="Name or phone…"
          autocomplete="off"
          @input="onSearch"
        />

        <div v-if="loading" class="hint">Searching…</div>
        <div v-else-if="search.trim().length >= 2 && !results.length" class="hint">No clients found.</div>
        <div v-if="searchError" class="err">{{ searchError }}</div>

        <ul v-if="results.length" class="client-list">
          <li
            v-for="c in results"
            :key="c.id"
            class="client-row"
            :class="{ 'client-row--selected': selected?.id === c.id }"
            @click="selected = c"
          >
            <div class="client-info">
              <span class="client-name">{{ clientLabel(c) }}</span>
              <span v-if="c.contact_phone || c.phone" class="client-meta">{{ c.contact_phone || c.phone }}</span>
            </div>
            <span v-if="selected?.id === c.id" class="check">✓</span>
          </li>
        </ul>

        <div v-if="shareUrl" class="share-box">
          <label class="field-label">Share link</label>
          <div class="share-row">
            <input type="text" class="form-input" readonly :value="shareUrl" />
            <button type="button" class="btn btn-secondary" @click="copyShareUrl">Copy</button>
          </div>
          <p v-if="notice" class="ok">{{ notice }}</p>
          <p v-if="partnerBUrl" class="partner-hint">
            Partner B link:
            <a :href="partnerBUrl" target="_blank" rel="noopener">{{ partnerBUrl }}</a>
          </p>
        </div>

        <p v-if="actionError" class="err">{{ actionError }}</p>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" @click="close">Close</button>
        <button
          v-if="selected && isClientTokenAssign"
          type="button"
          class="btn btn-primary"
          :disabled="assigning || !agencyId"
          @click="assignAssessment"
        >
          {{ assigning ? 'Assigning…' : 'Assign assessment' }}
        </button>
        <button
          v-else-if="selected && !isClientTokenAssign"
          type="button"
          class="btn btn-primary"
          @click="preparePublicLink"
        >
          Get share link
        </button>
        <button
          v-if="selected && clientProfilePath"
          type="button"
          class="btn btn-secondary"
          @click="openClient"
        >
          Open client
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../services/api';
import { getAssessmentPublicUrl, getAssessmentTokenUrl } from '../../navigation/toolsCatalog.js';

const props = defineProps({
  /** assessment | game | ai */
  kind: { type: String, default: 'assessment' },
  tool: { type: Object, required: true },
  agencyId: { type: [Number, String], default: null },
  organizationSlug: { type: String, default: '' },
  /** Prefixed path helper from parent (orgTo) */
  orgTo: { type: Function, default: (p) => p }
});

const emit = defineEmits(['close']);

const router = useRouter();
const search = ref('');
const results = ref([]);
const loading = ref(false);
const searchError = ref('');
const selected = ref(null);
const shareUrl = ref('');
const partnerBUrl = ref('');
const notice = ref('');
const actionError = ref('');
const assigning = ref(false);
const searchInput = ref(null);
let searchTimer = null;

const toolTitle = computed(() => props.tool?.title || props.tool?.displayName || 'Tool');
const isClientTokenAssign = computed(
  () =>
    props.kind === 'assessment' &&
    (props.tool?.assignMode === 'client_token' || props.tool?.assignMode === 'life_balance')
);
const modalTitle = computed(() =>
  isClientTokenAssign.value ? 'Assign to client' : 'Share with client'
);
const modeHint = computed(() => {
  if (isClientTokenAssign.value) {
    return 'Creates a client-linked assessment with a shareable token link';
  }
  if (props.kind === 'assessment') return 'Copy the public assessment link for this client';
  if (props.kind === 'game') return 'Copy the open link for this game';
  return 'Copy a link for this tool';
});

const clientProfilePath = computed(() => {
  if (!selected.value?.id) return '';
  return props.orgTo(`/admin/clients/${selected.value.id}`);
});

function clientLabel(c) {
  return c.full_name || c.name || c.initials || `Client #${c.id}`;
}

function close() {
  emit('close');
}

async function searchClients() {
  const q = String(search.value || '').trim();
  if (q.length < 2) {
    results.value = [];
    return;
  }
  loading.value = true;
  searchError.value = '';
  try {
    const r = await api.get('/clients', { params: { search: q, limit: 20 } });
    const data = r.data?.data ?? r.data?.clients ?? r.data;
    results.value = Array.isArray(data) ? data : [];
  } catch (e) {
    searchError.value = e?.response?.data?.error?.message || 'Search failed';
    results.value = [];
  } finally {
    loading.value = false;
  }
}

function onSearch() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(searchClients, 300);
}

async function assignAssessment() {
  if (!selected.value?.id || !props.agencyId) {
    actionError.value = 'Agency and client are required';
    return;
  }
  assigning.value = true;
  actionError.value = '';
  notice.value = '';
  partnerBUrl.value = '';
  try {
    const res = await api.post('/assessment-deliverables/assign', {
      family: props.tool?.id,
      clientId: Number(selected.value.id),
      agencyId: Number(props.agencyId),
      organizationSlug: props.organizationSlug || ''
    });
    const token = res.data?.accessToken;
    const path = props.tool?.path || `/${props.tool?.id}`;
    shareUrl.value = token
      ? getAssessmentTokenUrl(
          window.location.origin,
          path,
          token,
          props.organizationSlug
        )
      : '';
    const tokenB = res.data?.inviteTokens?.partnerB;
    if (tokenB) {
      partnerBUrl.value = getAssessmentTokenUrl(
        window.location.origin,
        path,
        tokenB,
        props.organizationSlug
      );
    }
    notice.value = shareUrl.value ? 'Assessment created — copy the link below' : 'Assessment created';
  } catch (e) {
    actionError.value = e?.response?.data?.error || e?.response?.data?.error?.message || e.message || 'Assign failed';
  } finally {
    assigning.value = false;
  }
}

function preparePublicLink() {
  actionError.value = '';
  notice.value = '';
  partnerBUrl.value = '';
  const path = props.tool?.path || props.tool?.routePath || '/';
  shareUrl.value = getAssessmentPublicUrl(
    window.location.origin,
    path,
    props.organizationSlug
  );
  notice.value = 'Public link ready — copy below';
}

async function copyShareUrl() {
  try {
    await navigator.clipboard.writeText(shareUrl.value);
    notice.value = 'Copied';
  } catch {
    notice.value = 'Copy manually from the field above';
  }
}

function openClient() {
  if (!clientProfilePath.value) return;
  router.push(clientProfilePath.value);
  close();
}

watch(selected, () => {
  shareUrl.value = '';
  partnerBUrl.value = '';
  notice.value = '';
  actionError.value = '';
});

onMounted(() => {
  nextTick(() => searchInput.value?.focus?.());
});
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}
.modal {
  background: #fff;
  border-radius: 12px;
  width: min(520px, 100%);
  max-height: 90vh;
  overflow: auto;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
}
.modal-header,
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 1rem 1.1rem;
  border-bottom: 1px solid #eee;
}
.modal-footer {
  border-bottom: none;
  border-top: 1px solid #eee;
  justify-content: flex-end;
}
.modal-body {
  padding: 1rem 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}
.close-btn {
  border: none;
  background: transparent;
  font-size: 1.1rem;
  cursor: pointer;
}
.tool-line {
  margin: 0;
}
.muted {
  color: #777;
}
.field-label {
  font-size: 0.8rem;
  font-weight: 600;
}
.form-input {
  width: 100%;
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 0.5rem 0.65rem;
  font-size: 0.95rem;
}
.client-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 220px;
  overflow: auto;
  border: 1px solid #eee;
  border-radius: 8px;
}
.client-row {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.55rem 0.7rem;
  cursor: pointer;
  border-bottom: 1px solid #f3f3f3;
}
.client-row--selected {
  background: #f0f5f2;
}
.client-name {
  display: block;
  font-weight: 600;
}
.client-meta {
  font-size: 0.8rem;
  color: #666;
}
.share-box {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.share-row {
  display: flex;
  gap: 0.4rem;
}
.hint,
.err,
.ok {
  font-size: 0.85rem;
}
.err {
  color: #b00020;
}
.ok {
  color: #1b4332;
}
.partner-hint {
  font-size: 0.8rem;
  word-break: break-all;
}
.btn {
  border: 1px solid #ccc;
  background: #f5f5f5;
  border-radius: 8px;
  padding: 0.45rem 0.8rem;
  cursor: pointer;
}
.btn-primary {
  background: #2c4a3e;
  color: #fff;
  border-color: #2c4a3e;
}
.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.check {
  color: #1b4332;
  font-weight: 700;
}
</style>
