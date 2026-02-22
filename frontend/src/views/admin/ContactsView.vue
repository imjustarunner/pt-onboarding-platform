<template>
  <div class="container contacts-view">
    <div class="page-header">
      <h1>Contacts</h1>
      <div class="header-actions">
        <button
          v-if="canCreate"
          class="btn btn-primary"
          @click="showAddModal = true"
        >
          Add Contact
        </button>
        <button
          v-if="canSync"
          class="btn btn-secondary"
          @click="runSync"
          :disabled="syncLoading"
        >
          {{ syncLoading ? 'Syncing…' : 'Sync from Guardians/Schools/Clients' }}
        </button>
      </div>
    </div>

    <div v-if="error" class="error-box">{{ error }}</div>

    <!-- Filters -->
    <div class="table-controls" v-show="contacts.length > 0 || loading">
      <div class="filter-group">
        <select v-model="filters.schoolId" @change="fetchContacts" class="filter-select">
          <option value="">All Schools</option>
          <option v-for="s in schools" :key="s.id" :value="String(s.id)">{{ s.name }}</option>
        </select>
        <select v-model="filters.providerId" @change="fetchContacts" class="filter-select">
          <option value="">All Providers</option>
          <option v-for="p in providers" :key="p.id" :value="String(p.id)">
            {{ p.first_name }} {{ p.last_name }}
          </option>
        </select>
        <input
          v-model="filters.clientId"
          type="text"
          placeholder="Client ID (optional)"
          class="search-input"
          @keydown.enter.prevent="fetchContacts"
        />
        <label class="checkbox-label">
          <input type="checkbox" v-model="filters.shareWithAll" @change="fetchContacts" />
          <span>Share with all only</span>
        </label>
        <button class="btn btn-secondary btn-sm" @click="fetchContacts">Apply</button>
      </div>
    </div>

    <div v-if="loading" class="loading">Loading contacts…</div>
    <div v-else-if="contacts.length === 0" class="empty-state">
      <p>No contacts found. Add a contact manually or run sync to pull from guardians, school contacts, and clients.</p>
    </div>

    <div v-else class="contacts-table-container">
      <table class="contacts-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Phone</th>
            <th>Source</th>
            <th>Share</th>
            <th>Client</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in contacts" :key="c.id">
            <td>{{ c.full_name || '—' }}</td>
            <td>{{ c.email || '—' }}</td>
            <td>{{ c.phone || '—' }}</td>
            <td><span class="pill source">{{ formatSource(c.source) }}</span></td>
            <td>{{ c.share_with_all ? 'All' : 'Limited' }}</td>
            <td>
              <router-link v-if="c.client_link" :to="clientLinkTo(c.client_link)">{{ c.client_id }}</router-link>
              <span v-else-if="c.client_id">{{ c.client_id }}</span>
              <span v-else>—</span>
            </td>
            <td>
              <button class="btn btn-secondary btn-sm" @click="openDetail(c)">View</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Add/Edit Contact Modal -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div
          v-if="showAddModal || editingContact"
          class="contact-modal-overlay"
          @click.self="closeModal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="contact-modal-title"
        >
          <div class="contact-modal" @click.stop>
            <div class="contact-modal-header">
              <h3 id="contact-modal-title">{{ editingContact ? 'Edit Contact' : 'Add Contact' }}</h3>
              <button type="button" class="contact-modal-close" @click="closeModal" aria-label="Close">
                <span aria-hidden="true">&times;</span>
              </button>
            </div>
            <form @submit.prevent="saveContact" class="contact-modal-body">
              <div class="contact-form-section">
                <h4 class="contact-form-section-title">Contact information</h4>
                <div class="form-group">
                  <label for="contact-fullname">Full name <span class="required">*</span></label>
                  <input
                    id="contact-fullname"
                    v-model="form.fullName"
                    type="text"
                    placeholder="e.g. Jane Smith"
                    :class="{ 'input-error': submitted && !form.fullName?.trim() }"
                    @blur="submitted = true"
                  />
                  <span v-if="submitted && !form.fullName?.trim()" class="field-error">Please enter a name.</span>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label for="contact-email">Email</label>
                    <input
                      id="contact-email"
                      v-model="form.email"
                      type="email"
                      placeholder="jane@example.com"
                    />
                  </div>
                  <div class="form-group">
                    <label for="contact-phone">Phone</label>
                    <input
                      id="contact-phone"
                      v-model="form.phone"
                      type="tel"
                      placeholder="+1 (555) 123-4567"
                    />
                  </div>
                </div>
              </div>

              <div v-if="canCreate" class="contact-form-section">
                <h4 class="contact-form-section-title">Visibility</h4>
                <label class="contact-checkbox">
                  <input type="checkbox" v-model="form.shareWithAll" />
                  <span>Share with all providers</span>
                </label>
                <p class="contact-hint">When enabled, this contact is visible to every provider in your agency.</p>
              </div>

              <div v-if="canCreate && !form.shareWithAll" class="contact-form-section">
                <h4 class="contact-form-section-title">Limit to specific schools & providers</h4>
                <div class="form-group">
                  <label>Schools</label>
                  <div class="chip-select">
                    <select v-model="schoolPick" class="chip-select-input" @change="addSchool">
                      <option value="">Add a school…</option>
                      <option
                        v-for="s in availableSchools"
                        :key="s.id"
                        :value="s.id"
                      >{{ s.name }}</option>
                    </select>
                    <div v-if="form.schoolIds.length" class="chips">
                      <span
                        v-for="id in form.schoolIds"
                        :key="id"
                        class="chip"
                      >
                        {{ schoolName(id) }}
                        <button type="button" class="chip-x" @click="removeSchool(id)" aria-label="Remove">×</button>
                      </span>
                    </div>
                  </div>
                </div>
                <div class="form-group">
                  <label>Providers</label>
                  <div class="chip-select">
                    <select v-model="providerPick" class="chip-select-input" @change="addProvider">
                      <option value="">Add a provider…</option>
                      <option
                        v-for="p in availableProviders"
                        :key="p.id"
                        :value="p.id"
                      >{{ p.first_name }} {{ p.last_name }}</option>
                    </select>
                    <div v-if="form.providerIds.length" class="chips">
                      <span
                        v-for="id in form.providerIds"
                        :key="id"
                        class="chip"
                      >
                        {{ providerName(id) }}
                        <button type="button" class="chip-x" @click="removeProvider(id)" aria-label="Remove">×</button>
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="error" class="contact-modal-error">{{ error }}</div>

              <div class="contact-modal-actions">
                <button type="button" class="btn btn-secondary" @click="closeModal">Cancel</button>
                <button type="submit" class="btn btn-primary" :disabled="saveLoading">
                  {{ saveLoading ? 'Saving…' : (editingContact ? 'Update' : 'Create') }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Contact Detail / Communications Modal -->
    <div v-if="selectedContact" class="modal-overlay" @click.self="selectedContact = null">
      <div class="modal card modal-wide">
        <div class="modal-header">
          <h3>{{ selectedContact.full_name || 'Contact' }}</h3>
          <button type="button" class="btn-close" @click="selectedContact = null" aria-label="Close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="contact-detail-meta">
            <div><strong>Email:</strong> {{ selectedContact.email || '—' }}</div>
            <div><strong>Phone:</strong> {{ selectedContact.phone || '—' }}</div>
            <div><strong>Source:</strong> {{ formatSource(selectedContact.source) }}</div>
            <div v-if="selectedContact.client_link">
              <strong>Client:</strong>
              <router-link :to="clientLinkTo(selectedContact.client_link)">View client</router-link>
            </div>
          </div>
          <div v-if="canEdit(selectedContact)" class="detail-actions">
            <button class="btn btn-secondary btn-sm" @click="editContact(selectedContact)">Edit</button>
            <button class="btn btn-danger btn-sm" @click="deleteContact(selectedContact)">Delete</button>
          </div>
          <h4>Communication Log</h4>
          <div v-if="commsLoading" class="loading">Loading…</div>
          <div v-else-if="communications.length === 0" class="muted">No communications yet.</div>
          <div v-else class="comms-list">
            <div v-for="log in communications" :key="log.id" class="comm-row" :class="log.direction">
              <span class="comm-channel">{{ log.channel }}</span>
              <span class="comm-direction">{{ log.direction }}</span>
              <span class="comm-body">{{ log.body || '—' }}</span>
              <span class="comm-date">{{ formatDate(log.created_at) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';

const route = useRoute();
const agencyStore = useAgencyStore();
const authStore = useAuthStore();

const agencyId = computed(() => Number(agencyStore.currentAgency?.id || 0) || null);
const role = computed(() => String(authStore.user?.role || '').toLowerCase());
const canCreate = computed(() => ['admin', 'support', 'staff', 'super_admin', 'provider_plus'].includes(role.value));
const canSync = computed(() => ['admin', 'support', 'staff', 'super_admin'].includes(role.value));

const contacts = ref([]);
const schools = ref([]);
const providers = ref([]);
const loading = ref(false);
const error = ref('');
const syncLoading = ref(false);
const saveLoading = ref(false);
const commsLoading = ref(false);

const filters = ref({
  schoolId: '',
  providerId: '',
  clientId: '',
  shareWithAll: false
});

const showAddModal = ref(false);
const editingContact = ref(null);
const selectedContact = ref(null);
const communications = ref([]);
const submitted = ref(false);
const schoolPick = ref('');
const providerPick = ref('');

const form = ref({
  fullName: '',
  email: '',
  phone: '',
  shareWithAll: false,
  schoolIds: [],
  providerIds: []
});

const availableSchools = computed(() => {
  const ids = new Set((form.value.schoolIds || []).map(Number));
  return schools.value.filter((s) => !ids.has(Number(s.id)));
});
const availableProviders = computed(() => {
  const ids = new Set((form.value.providerIds || []).map(Number));
  return providers.value.filter((p) => !ids.has(Number(p.id)));
});
const schoolName = (id) => schools.value.find((s) => Number(s.id) === Number(id))?.name || `School ${id}`;
const providerName = (id) => {
  const p = providers.value.find((pr) => Number(pr.id) === Number(id));
  return p ? `${p.first_name} ${p.last_name}` : `Provider ${id}`;
};
const addSchool = () => {
  const id = schoolPick.value ? Number(schoolPick.value) : null;
  if (id && !form.value.schoolIds.includes(id)) form.value.schoolIds = [...form.value.schoolIds, id];
  schoolPick.value = '';
};
const removeSchool = (id) => {
  form.value.schoolIds = form.value.schoolIds.filter((x) => Number(x) !== Number(id));
};
const addProvider = () => {
  const id = providerPick.value ? Number(providerPick.value) : null;
  if (id && !form.value.providerIds.includes(id)) form.value.providerIds = [...form.value.providerIds, id];
  providerPick.value = '';
};
const removeProvider = (id) => {
  form.value.providerIds = form.value.providerIds.filter((x) => Number(x) !== Number(id));
};

const clientLinkTo = (path) => {
  const slug = route.params?.organizationSlug;
  if (slug && path?.startsWith('/admin/')) return `/${slug}${path}`;
  return path || '#';
};

const formatSource = (s) => {
  const k = String(s || '').toLowerCase();
  if (k === 'manual') return 'Manual';
  if (k === 'auto_guardian') return 'Guardian';
  if (k === 'auto_school') return 'School';
  if (k === 'auto_client') return 'Client';
  return k || '—';
};

const formatDate = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString();
};

const canEdit = (c) => {
  if (['admin', 'support', 'staff', 'super_admin', 'provider_plus'].includes(role.value)) return true;
  return Number(c?.created_by_user_id) === Number(authStore.user?.id);
};

const fetchContacts = async () => {
  if (!agencyId.value) return;
  loading.value = true;
  error.value = '';
  try {
    const params = {};
    if (filters.value.schoolId) params.schoolId = filters.value.schoolId;
    if (filters.value.providerId) params.providerId = filters.value.providerId;
    if (filters.value.clientId) params.clientId = filters.value.clientId;
    if (filters.value.shareWithAll) params.shareWithAll = 'true';
    const res = await api.get(`/contacts/agency/${agencyId.value}`, { params });
    contacts.value = res.data || [];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load contacts.';
    contacts.value = [];
  } finally {
    loading.value = false;
  }
};

const fetchSchools = async () => {
  if (!agencyId.value) return;
  try {
    const res = await api.get(`/agencies/${agencyId.value}/affiliated-organizations`);
    const rows = Array.isArray(res.data) ? res.data : [];
    schools.value = rows
      .filter((o) => String(o?.organization_type || '').toLowerCase() !== 'agency')
      .map((o) => ({ id: o.id, name: o.name || `Org ${o.id}` }));
  } catch {
    schools.value = [];
  }
};

const fetchProviders = async () => {
  if (!agencyId.value) return;
  try {
    const res = await api.get('/provider-scheduling/providers', { params: { agencyId: agencyId.value } });
    providers.value = res.data || [];
  } catch {
    providers.value = [];
  }
};

const runSync = async () => {
  if (!agencyId.value) return;
  syncLoading.value = true;
  error.value = '';
  try {
    await api.post('/contacts/sync', { agencyId: agencyId.value });
    await fetchContacts();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Sync failed.';
  } finally {
    syncLoading.value = false;
  }
};

const openDetail = async (c) => {
  selectedContact.value = c;
  communications.value = [];
  commsLoading.value = true;
  try {
    const res = await api.get(`/contacts/${c.id}/communications`, { params: { limit: 50 } });
    communications.value = res.data?.items || [];
  } catch {
    communications.value = [];
  } finally {
    commsLoading.value = false;
  }
};

const editContact = (c) => {
  selectedContact.value = null;
  editingContact.value = c;
  form.value = {
    fullName: c.full_name || '',
    email: c.email || '',
    phone: c.phone || '',
    shareWithAll: c.share_with_all || false,
    schoolIds: [...(c.school_ids || [])],
    providerIds: [...(c.provider_ids || [])]
  };
};

const closeModal = () => {
  showAddModal.value = false;
  editingContact.value = null;
  submitted.value = false;
  schoolPick.value = '';
  providerPick.value = '';
  error.value = '';
  form.value = { fullName: '', email: '', phone: '', shareWithAll: false, schoolIds: [], providerIds: [] };
};

const saveContact = async () => {
  submitted.value = true;
  if (!form.value.fullName?.trim()) return;
  if (!agencyId.value) return;
  saveLoading.value = true;
  error.value = '';
  try {
    const schoolIds = (form.value.schoolIds || []).map((id) => parseInt(id, 10)).filter(Boolean);
    const providerIds = (form.value.providerIds || []).map((id) => parseInt(id, 10)).filter(Boolean);
    if (editingContact.value) {
      await api.patch(`/contacts/${editingContact.value.id}`, {
        fullName: form.value.fullName,
        email: form.value.email || null,
        phone: form.value.phone || null,
        shareWithAll: form.value.shareWithAll,
        schoolIds,
        providerIds
      });
    } else {
      await api.post('/contacts', {
        agencyId: agencyId.value,
        fullName: form.value.fullName,
        email: form.value.email || null,
        phone: form.value.phone || null,
        shareWithAll: form.value.shareWithAll,
        schoolIds,
        providerIds
      });
    }
    closeModal();
    await fetchContacts();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to save contact.';
  } finally {
    saveLoading.value = false;
  }
};

const deleteContact = async (c) => {
  if (!confirm('Delete this contact?')) return;
  try {
    await api.delete(`/contacts/${c.id}`);
    selectedContact.value = null;
    await fetchContacts();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to delete.';
  }
};

watch(
  () => agencyId.value,
  async (id) => {
    if (!id) return;
    await Promise.all([fetchSchools(), fetchProviders(), fetchContacts()]);
  },
  { immediate: true }
);

onMounted(async () => {
  await agencyStore.fetchUserAgencies();
});

const onKeydown = (e) => {
  if ((e.key === 'Escape' || e.key === 'Esc') && (showAddModal.value || editingContact.value)) {
    closeModal();
  }
};
watch(
  () => !!showAddModal.value || !!editingContact.value,
  (isOpen) => {
    if (isOpen) {
      document.addEventListener('keydown', onKeydown);
    } else {
      document.removeEventListener('keydown', onKeydown);
    }
  }
);
onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown);
});
</script>

<style scoped>
.contacts-view {
  padding: 24px 0;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.table-controls {
  margin-bottom: 16px;
}

.filter-group {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.filter-select,
.search-input {
  padding: 8px 12px;
  border: 1px solid #ccc;
  border-radius: 6px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
}

.error-box {
  background: #fee;
  color: #c00;
  padding: 12px;
  border-radius: 6px;
  margin-bottom: 16px;
}

.empty-state {
  padding: 48px;
  text-align: center;
  color: #666;
}

.contacts-table-container {
  overflow-x: auto;
}

.contacts-table {
  width: 100%;
  border-collapse: collapse;
}

.contacts-table th,
.contacts-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #eee;
}

.contacts-table th {
  font-weight: 600;
  background: #f8f9fa;
}

.pill.source {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  background: #e9ecef;
}

/* Add/Edit Contact Modal */
.contact-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(29, 38, 51, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 24px;
}

.contact-modal {
  background: var(--bg);
  border-radius: 16px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  max-width: 520px;
  width: 100%;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
}

.contact-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
  background: linear-gradient(to bottom, color-mix(in srgb, var(--primary) 8%, var(--bg)), var(--bg));
}

.contact-modal-header h3 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}

.contact-modal-close {
  background: none;
  border: none;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
  color: var(--text-secondary);
  padding: 4px;
  border-radius: 8px;
  transition: color 0.2s, background 0.2s;
}

.contact-modal-close:hover {
  color: var(--text-primary);
  background: color-mix(in srgb, var(--primary) 12%, transparent);
}

.contact-modal-body {
  padding: 24px;
  overflow-y: auto;
}

.contact-form-section {
  margin-bottom: 24px;
}

.contact-form-section:last-of-type {
  margin-bottom: 0;
}

.contact-form-section-title {
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
  margin: 0 0 16px 0;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}

.contact-form-section .form-group {
  margin-bottom: 16px;
}

.contact-form-section .form-group:last-child {
  margin-bottom: 0;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

@media (max-width: 480px) {
  .form-row {
    grid-template-columns: 1fr;
  }
}

.required {
  color: var(--error);
}

.input-error {
  border-color: var(--error) !important;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--error) 25%, transparent) !important;
}

.field-error {
  display: block;
  font-size: 13px;
  color: var(--error);
  margin-top: 6px;
}

.contact-checkbox {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 500;
  cursor: pointer;
  margin-bottom: 8px;
}

.contact-checkbox input {
  width: 18px;
  height: 18px;
  accent-color: var(--primary);
}

.contact-hint {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0 0 0 28px;
  line-height: 1.5;
}

.chip-select {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.chip-select-input {
  width: 100%;
  padding: 10px 14px;
  border: 2px solid var(--border);
  border-radius: 10px;
  font-size: 14px;
  background: var(--bg);
  color: var(--text-primary);
  transition: border-color 0.2s, box-shadow 0.2s;
}

.chip-select-input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 20%, transparent);
}

.chip-select .chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip-select .chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary) 14%, var(--bg-alt));
  border: 1px solid color-mix(in srgb, var(--primary) 35%, var(--border));
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.chip-x {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  color: var(--text-secondary);
  padding: 0;
  margin-left: 2px;
  border-radius: 4px;
  transition: color 0.2s, background 0.2s;
}

.chip-x:hover {
  color: var(--error);
  background: color-mix(in srgb, var(--error) 15%, transparent);
}

.contact-modal-error {
  margin-top: 16px;
  padding: 12px 16px;
  background: color-mix(in srgb, var(--error) 12%, var(--bg));
  color: var(--error);
  border-radius: 10px;
  font-size: 14px;
  border-left: 4px solid var(--error);
}

.contact-modal-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--border);
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-active .contact-modal,
.modal-fade-leave-active .contact-modal {
  transition: transform 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-from .contact-modal,
.modal-fade-leave-to .contact-modal {
  transform: scale(0.96) translateY(-8px);
}

/* Contact detail modal (keeps original modal classes) */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  max-width: 480px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-wide {
  max-width: 640px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid #eee;
}

.modal-header h3 {
  margin: 0;
}

.btn-close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #666;
}

.modal-body {
  padding: 16px;
}

.field {
  margin-bottom: 16px;
}

.field label {
  display: block;
  margin-bottom: 4px;
  font-weight: 500;
}

.modal-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
}

.contact-detail-meta {
  margin-bottom: 16px;
}

.contact-detail-meta > div {
  margin-bottom: 8px;
}

.detail-actions {
  margin-bottom: 24px;
}

.comms-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.comm-row {
  padding: 12px;
  border-radius: 6px;
  background: #f8f9fa;
}

.comm-row.inbound {
  background: #e7f3ff;
}

.comm-row.outbound {
  background: #e8f5e9;
}

.comm-channel,
.comm-direction {
  font-size: 12px;
  color: #666;
  margin-right: 8px;
}

.comm-body {
  display: block;
  margin-top: 4px;
}

.comm-date {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
  display: block;
}
</style>
