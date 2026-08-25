<template>
  <div class="na-client-picker">
    <div class="na-client-picker-head">
      <label class="na-label" for="na-client-search">Active client</label>
      <select
        v-if="tenantOptions.length > 1"
        v-model="tenantFilter"
        class="na-tenant-filter"
        :disabled="disabled"
        aria-label="Filter by tenant"
      >
        <option value="">All tenants</option>
        <option v-for="t in tenantOptions" :key="t.id" :value="String(t.id)">
          {{ t.name }}
        </option>
      </select>
    </div>
    <div class="na-client-picker-row">
      <input
        id="na-client-search"
        v-model="query"
        type="search"
        class="na-input"
        placeholder="Search by name or initials…"
        autocomplete="off"
        :disabled="disabled"
        @focus="onFocus"
        @input="onInput"
      />
      <button
        v-if="modelValue"
        type="button"
        class="na-link-btn na-link-btn--sm"
        :disabled="disabled"
        @click="clear"
      >
        Clear
      </button>
    </div>
    <p v-if="selectedLabel" class="na-client-selected">
      Linked: <strong>{{ selectedLabel }}</strong>
      <span v-if="selectedTenant" class="muted"> · {{ selectedTenant }}</span>
    </p>
    <ul v-if="open && results.length" class="na-client-results" role="listbox">
      <li v-for="c in results" :key="`${c.agencyId || 0}-${c.id}`">
        <button type="button" class="na-client-result" @click="pick(c)">
          <span class="na-client-result-main">
            <strong>{{ displayName(c) }}</strong>
            <em v-if="c.agency_name">{{ c.agency_name }}</em>
          </span>
          <span>{{ displayInitials(c) || '—' }}</span>
        </button>
      </li>
      <li class="na-client-create-row">
        <button
          type="button"
          class="na-link-btn na-link-btn--sm"
          :disabled="disabled"
          @click="emit('create-request', { query, agencyId: filterAgencyId })"
        >
          Create new client…
        </button>
      </li>
    </ul>
    <p v-else-if="open && query.trim() && !loading && !results.length" class="na-field-hint">
      No clients matched.
      <button type="button" class="na-link-btn na-link-btn--sm" :disabled="disabled" @click="emit('create-request', { query, agencyId: filterAgencyId })">
        Create client
      </button>
    </p>
    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import {
  clientDisplayInitials,
  clientDisplayName,
  clientTenantLabel,
  normalizeNoteAidClientRow
} from '../../utils/noteAidTreatmentHelpers.js';

const props = defineProps({
  modelValue: { type: [Number, String, null], default: null },
  /** Preferred tenant; empty = search all affiliated tenants. */
  agencyId: { type: [Number, String, null], default: null },
  selectedClient: { type: Object, default: null },
  disabled: { type: Boolean, default: false },
  /** When true, omit agency_id so API searches all memberships. */
  searchAllTenants: { type: Boolean, default: true }
});

const emit = defineEmits(['update:modelValue', 'select', 'clear', 'create-request']);

const agencyStore = useAgencyStore();
const query = ref('');
const open = ref(false);
const loading = ref(false);
const error = ref('');
const results = ref([]);
const tenantFilter = ref('');
let debounceTimer = null;
let reqSeq = 0;

const agencyLookup = computed(() => {
  const map = {};
  for (const a of agencyStore.userAgencies || []) {
    const id = Number(a?.id || 0);
    if (id) map[id] = a.name || a.organization_name || `Tenant #${id}`;
  }
  return map;
});

const tenantOptions = computed(() =>
  (agencyStore.userAgencies || [])
    .map((a) => ({
      id: Number(a.id),
      name: a.name || a.organization_name || `Tenant #${a.id}`
    }))
    .filter((t) => t.id > 0)
);

const filterAgencyId = computed(() => {
  const fromFilter = Number(tenantFilter.value || 0);
  if (fromFilter) return fromFilter;
  if (!props.searchAllTenants) return Number(props.agencyId || 0) || null;
  return null;
});

const selectedLabel = computed(() => {
  if (!props.modelValue) return '';
  return clientDisplayName(props.selectedClient) || `Client #${props.modelValue}`;
});

const selectedTenant = computed(() =>
  clientTenantLabel(props.selectedClient, agencyLookup.value)
);

function displayName(c) {
  return clientDisplayName(c) || `Client #${c.id}`;
}

function displayInitials(c) {
  return clientDisplayInitials(c);
}

function clear() {
  query.value = '';
  results.value = [];
  open.value = false;
  emit('update:modelValue', null);
  emit('clear');
}

function pick(c) {
  open.value = false;
  query.value = displayName(c);
  emit('update:modelValue', Number(c.id));
  emit('select', c);
}

async function search() {
  const q = String(query.value || '').trim();
  if (q.length < 1) {
    results.value = [];
    return;
  }
  const seq = ++reqSeq;
  loading.value = true;
  error.value = '';
  try {
    const params = {
      search: q,
      per_page: 20,
      page: 1
    };
    const aid = filterAgencyId.value;
    if (aid) params.agency_id = aid;
    const res = await api.get('/clients', {
      params,
      skipGlobalLoading: true
    });
    if (seq !== reqSeq) return;
    const rows = Array.isArray(res?.data)
      ? res.data
      : res?.data?.clients || res?.data?.items || [];
    results.value = rows
      .map((r) => normalizeNoteAidClientRow(r, agencyLookup.value))
      .filter(Boolean)
      .slice(0, 20);
  } catch (e) {
    if (seq !== reqSeq) return;
    error.value = e.response?.data?.error?.message || e.message || 'Client search failed';
    results.value = [];
  } finally {
    if (seq === reqSeq) loading.value = false;
  }
}

function onFocus() {
  open.value = true;
  if (String(query.value || '').trim()) search();
}

function onInput() {
  open.value = true;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(search, 220);
}

watch(
  () => props.selectedClient,
  (c) => {
    if (c && props.modelValue) query.value = displayName(c);
  },
  { immediate: true }
);

watch(tenantFilter, () => {
  if (open.value && String(query.value || '').trim()) search();
});

watch(
  () => props.agencyId,
  (aid) => {
    if (aid && !tenantFilter.value) tenantFilter.value = String(aid);
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer);
});
</script>

<style scoped>
.na-client-picker { margin-top: 6px; }
.na-client-picker-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}
.na-tenant-filter {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 4px 8px;
  font-size: 0.78rem;
  background: #fff;
  color: #334155;
  max-width: 180px;
}
.na-client-picker-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.na-client-selected {
  margin: 6px 0 0;
  font-size: 0.82rem;
  color: #334155;
}
.na-client-selected .muted {
  color: #64748b;
  font-weight: 500;
}
.na-client-results {
  list-style: none;
  margin: 6px 0 0;
  padding: 4px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  max-height: 260px;
  overflow: auto;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
  z-index: 5;
  position: relative;
}
.na-client-result {
  width: 100%;
  display: flex;
  justify-content: space-between;
  gap: 10px;
  text-align: left;
  border: none;
  background: transparent;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  font: inherit;
}
.na-client-result:hover { background: #ccfbf1; }
.na-client-result-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.na-client-result-main em {
  font-style: normal;
  font-size: 0.72rem;
  color: #0f766e;
  font-weight: 600;
}
.na-client-result > span:last-child {
  color: #64748b;
  font-size: 0.82rem;
  white-space: nowrap;
}
.na-client-create-row {
  border-top: 1px solid #e2e8f0;
  padding: 6px 10px 8px;
}
.na-field-hint {
  margin: 6px 0 0;
  font-size: 0.82rem;
  color: #64748b;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.error {
  color: #b91c1c;
  font-size: 0.82rem;
  margin: 4px 0 0;
}
</style>
