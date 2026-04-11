<template>
  <div class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal" role="dialog" aria-modal="true" aria-label="New conversation">
      <div class="modal-header">
        <h3>New conversation</h3>
        <button type="button" class="close-btn" aria-label="Close" @click="$emit('close')">✕</button>
      </div>

      <div class="modal-body">
        <div class="modal-tabs">
          <button 
            type="button" 
            class="modal-tab" 
            :class="{ 'modal-tab--active': activeTab === 'clients' }"
            @click="setTab('clients')"
          >
            Clients
          </button>
          <button 
            type="button" 
            class="modal-tab" 
            :class="{ 'modal-tab--active': activeTab === 'contacts' }"
            @click="setTab('contacts')"
          >
            Contacts
          </button>
        </div>

        <label class="field-label">Search {{ activeTab === 'clients' ? 'client' : 'contact' }}</label>
        <input
          ref="searchInput"
          v-model="search"
          type="text"
          class="form-input"
          :placeholder="activeTab === 'clients' ? 'Name or phone number…' : 'Name, phone, or email…'"
          autocomplete="off"
          @input="onSearch"
        />

        <div v-if="loading" class="hint">Searching…</div>
        <div v-else-if="search && results.length === 0" class="hint">No {{ activeTab }} found.</div>

        <ul v-if="results.length" class="client-list">
          <li
            v-for="r in results"
            :key="r.id"
            class="client-row"
            :class="{ 'client-row--selected': selected?.id === r.id }"
            @click="select(r)"
          >
            <div class="client-avatar">{{ (r.initials || r.full_name || r.name || '?')[0].toUpperCase() }}</div>
            <div class="client-info">
              <span class="client-name">{{ r.full_name || r.name || r.initials || 'Unknown' }}</span>
              <span class="client-phone">{{ formatPhone(r.contact_phone || r.phone) }}</span>
            </div>
            <span v-if="selected?.id === r.id" class="check">✓</span>
          </li>
        </ul>

        <div v-if="selected && myNumbers.length > 1" class="number-field">
          <label class="field-label">Send from</label>
          <select v-model="selectedNumberId" class="form-select">
            <option v-for="n in myNumbers" :key="n.id" :value="n.id">
              {{ formatPhone(n.phone_number) }}{{ n.label ? ` · ${n.label}` : '' }}
            </option>
          </select>
        </div>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" @click="$emit('close')">Cancel</button>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="!selected || (!selected.contact_phone && !selected.phone)"
          @click="open"
        >
          Open conversation
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '../../services/api';

const emit = defineEmits(['close', 'open']);

const search = ref('');
const results = ref([]);
const loading = ref(false);
const selected = ref(null);
const activeTab = ref('clients');
const myNumbers = ref([]);
const selectedNumberId = ref(null);
const searchInput = ref(null);

let searchTimer = null;

onMounted(async () => {
  searchInput.value?.focus();
  try {
    const res = await api.get('/messages/my-numbers');
    myNumbers.value = res.data || [];
    if (myNumbers.value.length > 0) selectedNumberId.value = myNumbers.value[0].id;
  } catch {
    myNumbers.value = [];
  }
});

function setTab(tab) {
  activeTab.value = tab;
  search.value = '';
  results.value = [];
  selected.value = null;
  searchInput.value?.focus();
}

function onSearch() {
  clearTimeout(searchTimer);
  selected.value = null;
  if (!search.value.trim()) { results.value = []; return; }
  searchTimer = setTimeout(doSearch, 300);
}

async function doSearch() {
  loading.value = true;
  try {
    if (activeTab.value === 'clients') {
      const res = await api.get('/clients', { params: { search: search.value.trim(), limit: 20 } });
      results.value = Array.isArray(res.data?.clients) ? res.data.clients : (Array.isArray(res.data) ? res.data : []);
    } else {
      // Use the agencyId of the current user for contacts
      const auth = (await import('../../store/auth')).useAuthStore();
      const aid = auth.user?.value?.currentAgencyId || auth.user?.value?.agency_id;
      const res = await api.get(`/contacts/agency/${aid}`, { params: { search: search.value.trim(), limit: 20 } });
      results.value = Array.isArray(res.data) ? res.data : [];
    }
  } catch {
    results.value = [];
  } finally {
    loading.value = false;
  }
}

function select(item) {
  selected.value = selected.value?.id === item.id ? null : item;
}

function open() {
  if (!selected.value) return;
  if (activeTab.value === 'clients') {
    emit('open', { client: selected.value, numberId: selectedNumberId.value });
  } else {
    emit('open', { contact: selected.value, numberId: selectedNumberId.value });
  }
}

function formatPhone(p) {
  if (!p) return '';
  const d = String(p).replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) {
    return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  }
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return p;
}
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: #fff;
  border-radius: 12px;
  width: 100%;
  max-width: 460px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--border, #e6e8ec);
}

.modal-header h3 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.1rem;
  cursor: pointer;
  color: var(--text-secondary, #6c7785);
  padding: 2px 6px;
  border-radius: 4px;
  line-height: 1;
}
.close-btn:hover { background: #f1f3f5; }

.modal-body {
  flex: 1;
  padding: 18px 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.modal-tabs {
  display: flex;
  gap: 16px;
  margin-bottom: 4px;
}

.modal-tab {
  background: none;
  border: none;
  padding: 4px 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-secondary, #6c7785);
  cursor: pointer;
  position: relative;
}

.modal-tab--active {
  color: var(--primary-color, #2563eb);
}

.modal-tab--active::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--primary-color, #2563eb);
}

.field-label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-secondary, #6c7785);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 4px;
}

.form-input, .form-select {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid var(--border, #d4d8de);
  border-radius: 8px;
  font-size: 0.9rem;
  outline: none;
  box-sizing: border-box;
  background: #fff;
}
.form-input:focus, .form-select:focus {
  border-color: #7aa2ff;
  box-shadow: 0 0 0 3px rgba(122, 162, 255, 0.15);
}

.hint {
  font-size: 0.85rem;
  color: var(--text-secondary, #6c7785);
  padding: 4px 0;
}

.client-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--border, #e6e8ec);
  border-radius: 8px;
  overflow: hidden;
  max-height: 260px;
  overflow-y: auto;
}

.client-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  cursor: pointer;
  border-bottom: 1px solid var(--border, #f0f2f4);
  transition: background 0.1s;
}
.client-row:last-child { border-bottom: none; }
.client-row:hover { background: #f8f9fa; }
.client-row--selected { background: #eff6ff; }

.client-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: #dbeafe;
  color: #2563eb;
  font-weight: 700;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.client-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.client-name {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-primary, #1a1a2e);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.client-phone {
  font-size: 0.78rem;
  color: var(--text-secondary, #6c7785);
}

.check {
  color: #2563eb;
  font-weight: 700;
  font-size: 1rem;
}

.number-field { display: flex; flex-direction: column; gap: 4px; }

.modal-footer {
  padding: 14px 20px;
  border-top: 1px solid var(--border, #e6e8ec);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn { padding: 8px 18px; border-radius: 8px; font-size: 0.875rem; font-weight: 500; cursor: pointer; border: 1px solid transparent; }
.btn-primary { background: #2563eb; color: #fff; border-color: #2563eb; }
.btn-primary:hover:not(:disabled) { background: #1d4ed8; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary { background: #fff; color: var(--text-primary, #1a1a2e); border-color: var(--border, #d4d8de); }
.btn-secondary:hover { background: #f1f3f5; }
</style>
