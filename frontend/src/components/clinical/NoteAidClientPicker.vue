<template>
  <div class="na-client-picker">
    <label class="na-label" for="na-client-search">Active client</label>
    <div class="na-client-picker-row">
      <input
        id="na-client-search"
        v-model="query"
        type="search"
        class="na-input"
        placeholder="Search active clients by name…"
        autocomplete="off"
        :disabled="disabled"
        @focus="open = true"
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
      <span class="muted"> · id {{ modelValue }}</span>
    </p>
    <ul v-if="open && results.length" class="na-client-results" role="listbox">
      <li v-for="c in results" :key="c.id">
        <button type="button" class="na-client-result" @click="pick(c)">
          <strong>{{ displayName(c) }}</strong>
          <span>{{ displayInitials(c) || '—' }}</span>
        </button>
      </li>
    </ul>
    <p v-else-if="open && query.trim() && !loading && !results.length" class="na-field-hint">
      No active clients matched.
    </p>
    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import api from '../../services/api';
import { clientDisplayInitials, clientDisplayName } from '../../utils/noteAidTreatmentHelpers.js';

const props = defineProps({
  modelValue: { type: [Number, String, null], default: null },
  agencyId: { type: [Number, String, null], default: null },
  selectedClient: { type: Object, default: null },
  disabled: { type: Boolean, default: false }
});

const emit = defineEmits(['update:modelValue', 'select', 'clear']);

const query = ref('');
const open = ref(false);
const loading = ref(false);
const error = ref('');
const results = ref([]);
let debounceTimer = null;
let reqSeq = 0;

const selectedLabel = computed(() => {
  if (!props.modelValue) return '';
  return clientDisplayName(props.selectedClient) || `Client #${props.modelValue}`;
});

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
  const aid = Number(props.agencyId || 0);
  const q = String(query.value || '').trim();
  if (!aid || q.length < 1) {
    results.value = [];
    return;
  }
  const seq = ++reqSeq;
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get('/clients', {
      params: {
        agency_id: aid,
        q,
        limit: 12,
        status: 'active'
      },
      skipGlobalLoading: true
    });
    if (seq !== reqSeq) return;
    const rows = Array.isArray(res?.data) ? res.data : res?.data?.clients || [];
    results.value = rows.slice(0, 12);
  } catch (e) {
    if (seq !== reqSeq) return;
    error.value = e.response?.data?.error?.message || e.message || 'Client search failed';
    results.value = [];
  } finally {
    if (seq === reqSeq) loading.value = false;
  }
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

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer);
});
</script>

<style scoped>
.na-client-picker {
  margin-top: 6px;
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
  max-height: 220px;
  overflow: auto;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
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
.na-client-result:hover {
  background: #ccfbf1;
}
.na-client-result span {
  color: #64748b;
  font-size: 0.82rem;
}
.error {
  color: #b91c1c;
  font-size: 0.82rem;
  margin: 4px 0 0;
}
</style>
