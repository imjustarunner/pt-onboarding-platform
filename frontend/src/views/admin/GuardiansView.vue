<template>
  <div class="container">
    <div class="page-header">
      <h1>Guardians</h1>
      <button class="btn btn-primary" type="button" @click="openCreateModal">Add Guardian</button>
    </div>

    <div class="filters-row">
      <div class="filter-group">
        <label>Search</label>
        <input
          v-model.trim="search"
          type="text"
          placeholder="Name or email"
        />
      </div>
      <div class="filter-group">
        <label>Status</label>
        <select v-model="statusFilter">
          <option value="">All</option>
          <option value="ACTIVE_EMPLOYEE">Active</option>
          <option value="ARCHIVED">Archived</option>
          <option value="PENDING_SETUP">Pending Setup</option>
        </select>
      </div>
      <div class="filter-group">
        <label>Agency</label>
        <select v-model="agencyFilter">
          <option value="">All agencies</option>
          <option v-for="a in agencyOptions" :key="a.id" :value="String(a.id)">
            {{ a.name }}
          </option>
        </select>
      </div>
      <div class="filter-group filter-group-actions">
        <button class="btn btn-secondary btn-sm" type="button" @click="resetFilters">Reset filters</button>
      </div>
    </div>

    <div v-if="loading" class="loading">Loading guardians...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Status</th>
            <th>Agencies</th>
            <th>Linked Clients</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="g in filteredGuardians"
            :key="g.id"
            class="clickable-row"
            @click="openGuardianProfile(g.id)"
          >
            <td>{{ guardianName(g) }}</td>
            <td>{{ g.email || '—' }}</td>
            <td>
              <span :class="['badge', statusBadgeClass(g.status)]">{{ statusLabel(g.status) }}</span>
            </td>
            <td>{{ g.agencies || '—' }}</td>
            <td>{{ Number(g.linked_clients_count || 0) }}</td>
            <td>{{ formatDate(g.created_at) }}</td>
          </tr>
          <tr v-if="filteredGuardians.length === 0">
            <td colspan="6" class="empty-row">No guardians found.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="showCreateModal" class="modal-overlay" @click.self="closeCreateModal">
      <div class="modal-content" style="max-width: 680px;">
        <div class="modal-header">
          <h3 style="margin: 0;">Create Guardian</h3>
          <button class="btn-close" @click="closeCreateModal">×</button>
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <div class="form-group">
              <label>First Name *</label>
              <input v-model.trim="createForm.firstName" type="text" />
            </div>
            <div class="form-group">
              <label>Last Name *</label>
              <input v-model.trim="createForm.lastName" type="text" />
            </div>
            <div class="form-group form-group-full">
              <label>Email *</label>
              <input v-model.trim="createForm.email" type="email" />
            </div>
            <div class="form-group form-group-full">
              <label>Agency *</label>
              <select v-model="createForm.primaryAgencyId">
                <option value="" disabled>Select an agency</option>
                <option v-for="a in agencyOptions" :key="a.id" :value="String(a.id)">{{ a.name }}</option>
              </select>
            </div>
            <div class="form-group form-group-full">
              <label>Organization(s) *</label>
              <div v-if="!createForm.primaryAgencyId" class="muted">Select an agency first.</div>
              <div v-else-if="createOrganizationsLoading" class="muted">Loading organizations...</div>
              <div v-else-if="createOrganizations.length === 0" class="muted">No organizations found for this agency.</div>
              <div v-else class="org-list-wrap">
                <label v-for="org in createOrganizations" :key="org.id" class="org-option">
                  <input v-model="createForm.organizationIds" type="checkbox" :value="String(org.id)" />
                  <span>{{ org.name }}</span>
                  <small v-if="org.organization_type">({{ org.organization_type }})</small>
                </label>
              </div>
            </div>
          </div>
          <div v-if="createError" class="error" style="margin-top: 10px;">{{ createError }}</div>
          <div v-if="lastInviteLink" class="phi-warning" style="margin-top: 10px;">
            <strong>Invite link generated</strong>
            <div class="hint">Send this link to the guardian to complete setup.</div>
            <input
              :value="lastInviteLink"
              readonly
              style="width: 100%; margin-top: 8px; font-family: monospace; font-size: 12px;"
              @click="$event.target.select()"
            />
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" :disabled="savingCreate" @click="closeCreateModal">Cancel</button>
          <button class="btn btn-primary" :disabled="savingCreate" @click="createGuardian">
            {{ savingCreate ? 'Creating...' : 'Create Guardian' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { getStatusBadgeClass, getStatusLabel } from '../../utils/statusUtils.js';

const router = useRouter();
const route = useRoute();

const loading = ref(false);
const error = ref('');
const guardians = ref([]);
const agencies = ref([]);

const search = ref('');
const statusFilter = ref('');
const agencyFilter = ref('');

const showCreateModal = ref(false);
const savingCreate = ref(false);
const createError = ref('');
const createOrganizationsLoading = ref(false);
const createOrganizations = ref([]);
const lastInviteLink = ref('');
const createForm = ref({
  firstName: '',
  lastName: '',
  email: '',
  primaryAgencyId: '',
  organizationIds: []
});

const agencyOptions = computed(() => {
  return (agencies.value || [])
    .filter((a) => String(a?.organization_type || 'agency').toLowerCase() === 'agency')
    .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
});

const filteredGuardians = computed(() => {
  const q = String(search.value || '').trim().toLowerCase();
  return (guardians.value || []).filter((g) => {
    const name = guardianName(g).toLowerCase();
    const email = String(g?.email || '').toLowerCase();
    const status = String(g?.status || '').toUpperCase();
    const agencyIds = String(g?.agency_ids || '')
      .split(',')
      .map((v) => String(v).trim())
      .filter(Boolean);

    if (q && !name.includes(q) && !email.includes(q)) return false;
    if (statusFilter.value && status !== String(statusFilter.value).toUpperCase()) return false;
    if (agencyFilter.value && !agencyIds.includes(String(agencyFilter.value))) return false;
    return true;
  });
});

const guardianName = (g) => {
  const first = String(g?.first_name || '').trim();
  const last = String(g?.last_name || '').trim();
  const full = `${first} ${last}`.trim();
  return full || 'Unnamed guardian';
};

const statusLabel = (status) => getStatusLabel(status);
const statusBadgeClass = (status) => getStatusBadgeClass(status, true);

const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleDateString();
};

const fetchAgencies = async () => {
  const response = await api.get('/agencies');
  agencies.value = Array.isArray(response?.data) ? response.data : [];
};

const fetchGuardians = async () => {
  loading.value = true;
  error.value = '';
  try {
    const response = await api.get('/users/guardians');
    guardians.value = Array.isArray(response?.data) ? response.data : [];
  } catch (err) {
    error.value = err?.response?.data?.error?.message || 'Failed to load guardians';
  } finally {
    loading.value = false;
  }
};

const openGuardianProfile = (userId) => {
  const orgSlug = String(route.params.organizationSlug || '').trim();
  if (orgSlug) {
    router.push(`/${orgSlug}/admin/users/${userId}`);
    return;
  }
  router.push(`/admin/users/${userId}`);
};

const resetFilters = () => {
  search.value = '';
  statusFilter.value = '';
  agencyFilter.value = '';
};

const resetCreateForm = () => {
  createForm.value = {
    firstName: '',
    lastName: '',
    email: '',
    primaryAgencyId: '',
    organizationIds: []
  };
  createOrganizations.value = [];
  createError.value = '';
  lastInviteLink.value = '';
};

const openCreateModal = () => {
  resetCreateForm();
  showCreateModal.value = true;
};

const closeCreateModal = () => {
  showCreateModal.value = false;
};

const createGuardian = async () => {
  createError.value = '';
  const firstName = String(createForm.value.firstName || '').trim();
  const lastName = String(createForm.value.lastName || '').trim();
  const email = String(createForm.value.email || '').trim();
  const agencyId = parseInt(String(createForm.value.primaryAgencyId || ''), 10);
  const orgIds = (createForm.value.organizationIds || [])
    .map((v) => parseInt(String(v), 10))
    .filter((id) => Number.isFinite(id) && id > 0);

  if (!firstName || !lastName || !email) {
    createError.value = 'First name, last name, and email are required.';
    return;
  }
  if (!agencyId) {
    createError.value = 'Please select an agency.';
    return;
  }
  if (orgIds.length === 0) {
    createError.value = 'Please select at least one organization.';
    return;
  }

  savingCreate.value = true;
  try {
    const payload = {
      firstName,
      lastName,
      email,
      personalEmail: email,
      role: 'client_guardian',
      agencyIds: [agencyId],
      organizationIds: orgIds
    };
    const response = await api.post('/auth/register', payload);
    lastInviteLink.value = String(response?.data?.passwordlessTokenLink || '').trim();
    await fetchGuardians();
    if (!lastInviteLink.value) {
      closeCreateModal();
    }
  } catch (err) {
    createError.value = err?.response?.data?.error?.message || 'Failed to create guardian';
  } finally {
    savingCreate.value = false;
  }
};

watch(
  () => createForm.value.primaryAgencyId,
  async (rawAgencyId) => {
    const agencyId = parseInt(String(rawAgencyId || ''), 10);
    createForm.value.organizationIds = [];
    createOrganizations.value = [];
    if (!agencyId) return;
    createOrganizationsLoading.value = true;
    try {
      const response = await api.get(`/agencies/${agencyId}/affiliated-organizations`);
      const rows = Array.isArray(response?.data) ? response.data : [];
      createOrganizations.value = rows.filter((o) => {
        const t = String(o?.organization_type || '').toLowerCase();
        return t === 'school' || t === 'program' || t === 'learning' || t === 'clinical';
      });
    } catch {
      createOrganizations.value = [];
    } finally {
      createOrganizationsLoading.value = false;
    }
  }
);

onMounted(async () => {
  await Promise.all([fetchAgencies(), fetchGuardians()]);
});
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.filters-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.filter-group-actions {
  justify-content: flex-end;
}

.clickable-row {
  cursor: pointer;
}

.empty-row {
  text-align: center;
  color: var(--text-secondary);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group-full {
  grid-column: 1 / -1;
}

.org-list-wrap {
  border: 1px solid var(--border);
  border-radius: 8px;
  max-height: 180px;
  overflow: auto;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.org-option {
  display: flex;
  align-items: center;
  gap: 8px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 12px;
}

@media (max-width: 960px) {
  .filters-row {
    grid-template-columns: 1fr;
  }
}
</style>
