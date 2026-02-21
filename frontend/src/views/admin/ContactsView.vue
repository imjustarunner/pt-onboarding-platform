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
    <div v-if="showAddModal || editingContact" class="modal-overlay" @click.self="closeModal">
      <div class="modal card">
        <div class="modal-header">
          <h3>{{ editingContact ? 'Edit Contact' : 'Add Contact' }}</h3>
          <button type="button" class="btn-close" @click="closeModal" aria-label="Close">&times;</button>
        </div>
        <form @submit.prevent="saveContact" class="modal-body">
          <div class="field">
            <label>Full name</label>
            <input v-model="form.fullName" type="text" required />
          </div>
          <div class="field">
            <label>Email</label>
            <input v-model="form.email" type="email" />
          </div>
          <div class="field">
            <label>Phone</label>
            <input v-model="form.phone" type="tel" placeholder="+1..." />
          </div>
          <div class="field" v-if="canCreate">
            <label class="checkbox-label">
              <input type="checkbox" v-model="form.shareWithAll" />
              <span>Share with all providers</span>
            </label>
          </div>
          <div class="field" v-if="canCreate">
            <label>Schools (optional)</label>
            <select v-model="form.schoolIds" multiple class="filter-select" style="min-height: 80px;">
              <option v-for="s in schools" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
          </div>
          <div class="field" v-if="canCreate">
            <label>Providers (optional)</label>
            <select v-model="form.providerIds" multiple class="filter-select" style="min-height: 80px;">
              <option v-for="p in providers" :key="p.id" :value="p.id">{{ p.first_name }} {{ p.last_name }}</option>
            </select>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" @click="closeModal">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="saveLoading">
              {{ saveLoading ? 'Saving…' : (editingContact ? 'Update' : 'Create') }}
            </button>
          </div>
        </form>
      </div>
    </div>

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
import { computed, onMounted, ref, watch } from 'vue';
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

const form = ref({
  fullName: '',
  email: '',
  phone: '',
  shareWithAll: false,
  schoolIds: [],
  providerIds: []
});

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
  form.value = { fullName: '', email: '', phone: '', shareWithAll: false, schoolIds: [], providerIds: [] };
};

const saveContact = async () => {
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
