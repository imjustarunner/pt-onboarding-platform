<template>
  <section class="na-doc-queue" aria-label="Sessions needing documentation">
    <div class="na-doc-queue-head">
      <div>
        <h3>Choose a session to document</h3>
        <p class="muted">Undocumented appointments and encounters, oldest first. Or continue unlinked.</p>
      </div>
      <button type="button" class="na-link-btn" :disabled="loading" @click="load">
        {{ loading ? 'Loading…' : 'Refresh' }}
      </button>
    </div>

    <div class="na-doc-queue-filters">
      <select
        v-if="tenantOptions.length > 1"
        v-model="tenantFilter"
        class="na-input"
        @change="load"
      >
        <option value="">All tenants</option>
        <option v-for="t in tenantOptions" :key="t.id" :value="String(t.id)">{{ t.name }}</option>
      </select>
      <input
        v-model="search"
        type="search"
        class="na-input"
        :class="{ 'na-doc-queue-search--wide': tenantOptions.length <= 1 }"
        placeholder="Search name, initials, service, or date…"
        @input="onSearchInput"
      />
    </div>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-else-if="clinicalUnavailable && !items.length" class="na-doc-queue-hint">
      Clinical note database is unavailable — showing schedule and billing sessions when possible.
      You can still continue unlinked or pick a client below.
    </p>
    <p v-else-if="loading && !items.length" class="muted">Loading documentation queue…</p>
    <p v-else-if="!items.length" class="muted">No undocumented sessions found for this filter.</p>

    <ul v-else class="na-doc-queue-list">
      <li v-for="row in items" :key="rowKey(row)">
        <button type="button" class="na-doc-queue-row" @click="emit('select', row)">
          <span class="na-doc-queue-main">
            <strong>{{ row.clientName || row.clientInitials || `Client #${row.clientId}` }}</strong>
            <em>{{ row.agencyName || `Tenant #${row.agencyId}` }}</em>
          </span>
          <span class="na-doc-queue-meta">
            <span>{{ row.dateOfService || '—' }}</span>
            <span>{{ row.serviceCode || '—' }}</span>
            <span class="na-doc-status" :data-status="row.noteStatus">{{ statusLabel(row.noteStatus) }}</span>
          </span>
        </button>
      </li>
    </ul>

    <div class="na-doc-queue-footer">
      <button type="button" class="na-btn-outline" @click="emit('continue-unlinked')">
        Continue unlinked
      </button>
      <button type="button" class="na-link-btn" @click="emit('client-first')">
        Pick client first
      </button>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import { noteAidTenantOptions } from '../../utils/noteAidTreatmentHelpers.js';

const props = defineProps({
  agencyId: { type: [Number, String, null], default: null },
  clientId: { type: [Number, String, null], default: null },
  active: { type: Boolean, default: true }
});

const emit = defineEmits(['select', 'continue-unlinked', 'client-first']);

const agencyStore = useAgencyStore();
const authStore = useAuthStore();
const items = ref([]);
const loading = ref(false);
const error = ref('');
const clinicalUnavailable = ref(false);
const search = ref('');
const tenantFilter = ref('');
let debounceTimer = null;

const tenantOptions = computed(() =>
  noteAidTenantOptions(agencyStore, { role: authStore.user?.role })
);

async function ensureTenantOptionsLoaded() {
  await agencyStore.fetchUserAgencies();
  const role = String(authStore.user?.role || '').toLowerCase();
  if (role === 'super_admin' && !tenantOptions.value.length) {
    await agencyStore.fetchAgencies();
  }
}

function statusLabel(st) {
  if (st === 'draft') return 'Draft note';
  if (st === 'signed') return 'Signed';
  return 'No note';
}

function rowKey(row) {
  return row.clinicalSessionId || row.officeEventId || row.billingEncounterId || `${row.clientId}-${row.dateOfService}`;
}

async function load() {
  if (!props.active) return;
  loading.value = true;
  error.value = '';
  clinicalUnavailable.value = false;
  try {
    const params = {
      noteStatus: 'undocumented',
      limit: 80
    };
    const aid = Number(tenantFilter.value || props.agencyId || 0);
    if (aid) params.agencyId = aid;
    const cid = Number(props.clientId || 0);
    if (cid) params.clientId = cid;
    const providerId = Number(authStore.user?.id || 0);
    if (providerId) params.providerUserId = providerId;
    if (String(search.value || '').trim()) params.search = String(search.value).trim();
    const res = await api.get('/clinical-data/documentation-queue', {
      params,
      skipGlobalLoading: true
    });
    items.value = Array.isArray(res?.data?.items) ? res.data.items : [];
    clinicalUnavailable.value = !!res?.data?.clinicalUnavailable;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Could not load documentation queue';
    items.value = [];
  } finally {
    loading.value = false;
  }
}

function onSearchInput() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(load, 250);
}

watch(
  () => [props.agencyId, props.clientId, props.active],
  ([aid, , active]) => {
    if (aid && !tenantFilter.value) tenantFilter.value = String(aid);
    if (active) load();
  },
  { immediate: true }
);

onMounted(async () => {
  if (props.agencyId) tenantFilter.value = String(props.agencyId);
  await ensureTenantOptionsLoaded();
});

defineExpose({ load });
</script>

<style scoped>
.na-doc-queue {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 14px;
  background: #f8fafc;
  margin-bottom: 14px;
}
.na-doc-queue-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}
.na-doc-queue-head h3 {
  margin: 0 0 4px;
  font-size: 0.98rem;
}
.muted { color: #64748b; font-size: 0.82rem; margin: 0; }
.na-doc-queue-hint {
  margin: 8px 0;
  padding: 10px;
  border-radius: 8px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  color: #92400e;
  font-size: 0.82rem;
}
.na-doc-queue-filters {
  display: grid;
  grid-template-columns: minmax(120px, 180px) 1fr;
  gap: 8px;
  margin: 12px 0;
}
.na-doc-queue-search--wide {
  grid-column: 1 / -1;
}
.na-doc-queue-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 320px;
  overflow: auto;
}
.na-doc-queue-row {
  width: 100%;
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  text-align: left;
  cursor: pointer;
  font: inherit;
}
.na-doc-queue-row:hover { border-color: #14b8a6; background: #f0fdfa; }
.na-doc-queue-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.na-doc-queue-main em {
  font-style: normal;
  font-size: 0.72rem;
  color: #0f766e;
  font-weight: 600;
}
.na-doc-queue-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  font-size: 0.78rem;
  color: #475569;
  white-space: nowrap;
}
.na-doc-status[data-status='none'] { color: #b45309; font-weight: 600; }
.na-doc-status[data-status='draft'] { color: #0369a1; font-weight: 600; }
.na-doc-queue-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 12px;
  align-items: center;
}
.error { color: #b91c1c; font-size: 0.85rem; }
</style>
