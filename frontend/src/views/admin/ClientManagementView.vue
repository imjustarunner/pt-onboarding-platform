<template>
  <div class="container">
    <div class="page-header">
      <h1>Client Management</h1>
      <div class="header-actions">
        <button @click="showBulkImportModal = true" class="btn btn-secondary">Bulk Import</button>
        <button @click="showCreateModal = true" class="btn btn-primary">Create Client</button>
      </div>
    </div>

    <!-- Filters and Search -->
    <div class="table-controls" v-if="!loading && clients.length > 0">
      <div class="filter-group">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search by client code..."
          class="search-input"
          @input="applyFilters"
        />
        <select v-model="clientStatusFilter" @change="applyFilters" class="filter-select">
          <option value="">All Client Statuses</option>
          <option v-for="s in clientStatuses" :key="s.id" :value="String(s.id)">
            {{ s.label }}
          </option>
        </select>
        <div v-if="showSchoolSearch" class="school-search">
          <input
            v-model="schoolSearchQuery"
            type="text"
            class="school-search-input"
            placeholder="Search schools..."
            @focus="schoolSearchOpen = true"
            @input="schoolSearchOpen = true"
            @keydown.esc="schoolSearchOpen = false"
          />
          <div v-if="schoolSearchOpen && schoolSearchResults.length" class="school-search-menu">
            <button
              v-for="s in schoolSearchResults"
              :key="s.id"
              type="button"
              class="school-search-item"
              @click="selectSchool(s)"
            >
              <span class="school-search-name">{{ s.name }}</span>
              <span class="school-search-meta">School</span>
            </button>
          </div>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <select v-model="organizationFilter" @change="applyFilters" class="filter-select">
            <option value="">All Affiliations</option>
            <option v-for="org in availableAffiliations" :key="org.id" :value="org.id">
              {{ org.name }}
            </option>
          </select>
          <button
            v-if="selectedAffiliation"
            class="btn btn-secondary btn-sm"
            type="button"
            @click="goToAffiliationDashboard"
          >
            {{ selectedAffiliation.name }} Dashboard
          </button>
        </div>
        <select v-model="providerFilter" @change="applyFilters" class="filter-select">
          <option value="">All Providers</option>
          <option v-for="provider in availableProviders" :key="provider.id" :value="provider.id">
            {{ provider.first_name }} {{ provider.last_name }}
          </option>
        </select>
        <select v-model="sortBy" @change="applyFilters" class="filter-select">
          <option value="submission_date-desc">Sort: Submission Date (Newest)</option>
          <option value="submission_date-asc">Sort: Submission Date (Oldest)</option>
          <option value="initials-asc">Sort: Initials (A-Z)</option>
          <option value="initials-desc">Sort: Initials (Z-A)</option>
          <option value="organization_name-asc">Sort: Organization (A-Z)</option>
          <option value="organization_name-desc">Sort: Organization (Z-A)</option>
          <option value="provider_name-asc">Sort: Provider (A-Z)</option>
          <option value="provider_name-desc">Sort: Provider (Z-A)</option>
          <option value="client_status_label-asc">Sort: Client Status (A-Z)</option>
        </select>
      </div>

      <div class="pagination-bar">
        <div class="pagination-left">
          <span class="pagination-meta">
            Showing {{ pagedClients.length }} of {{ filteredClients.length }}
          </span>
          <select v-model="pageSize" class="filter-select page-size">
            <option :value="25">25 / page</option>
            <option :value="50">50 / page</option>
            <option :value="100">100 / page</option>
          </select>
        </div>
        <div class="pagination-right">
          <button class="btn btn-secondary btn-sm" :disabled="currentPage <= 1" @click="currentPage--">
            Prev
          </button>
          <span class="pagination-meta">Page {{ currentPage }} / {{ totalPages }}</span>
          <button class="btn btn-secondary btn-sm" :disabled="currentPage >= totalPages" @click="currentPage++">
            Next
          </button>
        </div>
      </div>
    </div>

    <div v-if="loading" class="loading">Loading clients...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="filteredClients.length === 0" class="empty-state">
      <p v-if="clients.length === 0">No clients found. Create your first client or import from CSV.</p>
      <p v-else>No clients match your filters.</p>
    </div>

    <div v-else class="clients-table-container">
      <div v-if="selectedIds.size > 0" class="bulk-bar">
        <div class="bulk-left">
          <strong>{{ selectedIds.size }}</strong> selected
          <button class="btn btn-secondary btn-sm" type="button" @click="clearSelection">Clear</button>
        </div>
        <div class="bulk-right">
          <select v-model="bulkPromoteYear" class="filter-select">
            <option value="">Promote to next year…</option>
            <option :value="nextSchoolYear">Next: {{ nextSchoolYear }}</option>
            <option :value="currentSchoolYear">Current: {{ currentSchoolYear }}</option>
          </select>
          <button class="btn btn-secondary btn-sm" type="button" :disabled="!bulkPromoteYear || bulkWorking" @click="bulkPromoteToNextYear">
            Promote
          </button>

          <select v-model="bulkAffiliationId" class="filter-select">
            <option value="">Move to affiliation…</option>
            <option v-for="org in availableAffiliations" :key="org.id" :value="String(org.id)">{{ org.name }}</option>
          </select>
          <button class="btn btn-secondary btn-sm" type="button" :disabled="!bulkAffiliationId || bulkWorking" @click="bulkMoveAffiliation">
            Move
          </button>

          <select v-model="bulkClientStatusId" class="filter-select">
            <option value="">Set client status…</option>
            <option v-for="s in clientStatuses" :key="s.id" :value="String(s.id)">{{ s.label }}</option>
          </select>
          <button class="btn btn-secondary btn-sm" type="button" :disabled="!bulkClientStatusId || bulkWorking" @click="bulkSetClientStatus">
            Set
          </button>

          <select v-model="bulkProviderId" class="filter-select">
            <option value="">Assign provider…</option>
            <option :value="'__unassign__'">Unassign</option>
            <option v-for="p in availableProviders" :key="p.id" :value="String(p.id)">{{ p.first_name }} {{ p.last_name }}</option>
          </select>
          <button class="btn btn-secondary btn-sm" type="button" :disabled="!bulkProviderId || bulkWorking" @click="bulkAssignProvider">
            Assign
          </button>

          <button class="btn btn-danger btn-sm" type="button" :disabled="bulkWorking" @click="bulkArchive">
            Archive
          </button>
        </div>
      </div>
      <table class="clients-table">
        <thead>
          <tr>
            <th style="width: 34px;">
              <input type="checkbox" :checked="allPageSelected" @change.stop="toggleSelectAllPage($event)" />
            </th>
            <th>Initials</th>
            <th>Affiliation</th>
            <th>Client Status</th>
            <th>Provider</th>
            <th>Submission Date</th>
            <th>Paperwork</th>
            <th>Insurance</th>
            <th>Last Activity</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr 
            v-for="client in pagedClients" 
            :key="client.id"
            @click="openClientDetail(client)"
            class="client-row"
          >
            <td class="select-cell" @click.stop>
              <input type="checkbox" :checked="selectedIds.has(client.id)" @change.stop="toggleSelected(client.id)" />
            </td>
            <td>{{ client.initials }}</td>
            <td>
              <button
                v-if="client.organization_slug"
                type="button"
                class="link-button"
                @click.stop="router.push(`/${client.organization_slug}/dashboard`)"
              >
                {{ client.organization_name || '-' }}
              </button>
              <span v-else>{{ client.organization_name || '-' }}</span>
            </td>
            <td>
              {{ client.client_status_label || '-' }}
            </td>
            <td>
              <select
                v-if="editingProviderId === client.id"
                v-model="editingProviderValue"
                @change="saveProvider(client.id, editingProviderValue)"
                @blur="cancelEdit"
                class="inline-select"
                @click.stop
              >
                <option :value="null">Not assigned</option>
                <option v-for="provider in availableProviders" :key="provider.id" :value="provider.id">
                  {{ provider.first_name }} {{ provider.last_name }}
                </option>
              </select>
              <span v-else @click.stop="startEditProvider(client)" class="editable-field">
                {{ client.provider_name || 'Not assigned' }}
              </span>
            </td>
            <td>{{ formatDate(client.submission_date) }}</td>
            <td>
              {{ client.paperwork_status_label || '-' }}
            </td>
            <td>{{ client.insurance_type_label || '-' }}</td>
            <td>{{ formatDate(client.last_activity_at) || '-' }}</td>
            <td class="actions-cell" @click.stop>
              <button @click="openClientDetail(client)" class="btn btn-primary btn-sm">View</button>
              <button
                @click.stop="startEditStatus(client)" 
                class="btn btn-secondary btn-sm"
              >
                Archive
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Client Detail Panel -->
    <ClientDetailPanel
      v-if="selectedClient"
      :client="selectedClient"
      @close="closeClientDetail"
      @updated="handleClientUpdated"
    />

    <!-- Create Client Modal -->
    <div v-if="showCreateModal" class="modal-overlay" @click.self="closeCreateModal">
      <div class="modal-content" @click.stop>
        <h3>Create New Client</h3>
        <form @submit.prevent="createClient">
          <div class="form-group">
            <label>Organization (School / Program / Learning) *</label>
            <select v-model="newClient.organization_id" required>
              <option value="">Select organization...</option>
              <option v-for="org in availableOrganizations" :key="org.id" :value="org.id">
                {{ org.name }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>Initials *</label>
            <input 
              v-model="newClient.initials" 
              type="text" 
              required 
              maxlength="10"
              placeholder="ABC"
              style="text-transform: uppercase;"
            />
            <small>Client initials (max 10 characters)</small>
          </div>
          <div class="form-group">
            <label>Provider</label>
            <select v-model="newClient.provider_id">
              <option :value="null">Not assigned</option>
              <option v-for="provider in availableProviders" :key="provider.id" :value="provider.id">
                {{ provider.first_name }} {{ provider.last_name }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>Client Status</label>
            <select v-model="newClient.client_status_id">
              <option :value="null">—</option>
              <option v-for="s in clientStatuses" :key="s.id" :value="s.id">{{ s.label }}</option>
            </select>
          </div>
          <div class="form-group">
            <label>School Year</label>
            <input v-model="newClient.school_year" type="text" placeholder="2025-2026" />
            <small>Optional. Format: YYYY-YYYY</small>
          </div>
          <div class="form-group">
            <label>Grade</label>
            <input v-model="newClient.grade" type="text" placeholder="5" />
            <small>Optional. Numeric grades will be promoted +1 in bulk.</small>
          </div>
          <div class="form-group">
            <label>Submission Date *</label>
            <input v-model="newClient.submission_date" type="date" required />
          </div>
          <div class="form-group">
            <label>Document Status</label>
            <select v-model="newClient.document_status">
              <option value="NONE">None</option>
              <option value="UPLOADED">Uploaded</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
          <div class="modal-actions">
            <button type="button" @click="closeCreateModal" class="btn btn-secondary">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="creating">
              {{ creating ? 'Creating...' : 'Create Client' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Duplicate initials modal -->
    <div v-if="dupesModalOpen" class="modal-overlay" @click.self="closeDupesModal">
      <div class="modal-content" @click.stop style="max-width: 860px;">
        <h3>Similar client code found</h3>
        <p style="margin-top: 6px; color: var(--text-secondary);">
          We found one or more clients with the same code in the database. If it’s the same student, unarchive instead of creating a duplicate.
        </p>

        <div style="margin-top: 12px; overflow-x: auto;">
          <table class="clients-table" style="min-width: 780px;">
            <thead>
              <tr>
                <th>Agency</th>
                <th>Affiliation</th>
                <th>Prior Provider</th>
                <th>Client Status</th>
                <th>Archived?</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in dupesMatches" :key="m.clientId">
                <td>{{ m.agencyName || '-' }}</td>
                <td>{{ m.organizationName || '-' }}</td>
                <td>{{ m.providerName || '-' }}</td>
                <td>{{ m.clientStatusLabel || '-' }}</td>
                <td>{{ String(m.workflowStatus || '').toUpperCase() === 'ARCHIVED' ? 'Yes' : 'No' }}</td>
                <td>
                  <button
                    class="btn btn-primary btn-sm"
                    type="button"
                    :disabled="String(m.workflowStatus || '').toUpperCase() !== 'ARCHIVED'"
                    @click="unarchiveMatch(m)"
                  >
                    Unarchive
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="modal-actions" style="margin-top: 14px;">
          <button type="button" class="btn btn-secondary" @click="closeDupesModal">Close</button>
        </div>
      </div>
    </div>

    <!-- Bulk Import Modal -->
    <BulkClientImporter
      v-if="showBulkImportModal"
      @close="showBulkImportModal = false"
      @imported="handleBulkImported"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api';
import ClientDetailPanel from '../../components/admin/ClientDetailPanel.vue';
import BulkClientImporter from '../../components/admin/BulkClientImporter.vue';

const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const router = useRouter();

const clients = ref([]);
const loading = ref(false);
const error = ref('');
const searchQuery = ref('');
const clientStatusFilter = ref('');
const organizationFilter = ref('');
const providerFilter = ref('');
const sortBy = ref('submission_date-desc');
const selectedClient = ref(null);
const showCreateModal = ref(false);
const showBulkImportModal = ref(false);
const creating = ref(false);
const linkedOrganizations = ref([]);
const loadingOrganizations = ref(false);
const clientStatuses = ref([]);

const currentPage = ref(1);
const pageSize = ref(50);

// Inline editing state
const editingProviderId = ref(null);
const editingProviderValue = ref(null);

// Bulk selection + actions
const selectedIds = ref(new Set());
const bulkWorking = ref(false);
const bulkAffiliationId = ref('');
const bulkProviderId = ref('');
const bulkClientStatusId = ref('');
const bulkPromoteYear = ref('');

// New client form
const newClient = ref({
  organization_id: null,
  initials: '',
  provider_id: null,
  client_status_id: null,
  school_year: '',
  grade: '',
  submission_date: new Date().toISOString().split('T')[0],
  document_status: 'NONE'
});

const dupesModalOpen = ref(false);
const dupesMatches = ref([]);
const dupesForNewClient = ref(null);

const activeAgencyId = computed(() => {
  const current = agencyStore.currentAgency;
  const currentType = String(current?.organization_type || 'agency').toLowerCase();
  if (current?.id && currentType === 'agency') return current.id;

  // Fallback: pick first agency-type org from the user's list
  const fromStore = authStore.user?.role === 'super_admin' ? agencyStore.agencies : agencyStore.userAgencies;
  const firstAgency = (fromStore || []).find((a) => String(a?.organization_type || 'agency').toLowerCase() === 'agency');
  return firstAgency?.id || null;
});

const fetchLinkedOrganizations = async () => {
  try {
    loadingOrganizations.value = true;
    // Super admins: show all schools platform-wide so the filter always has options.
    if (authStore.user?.role === 'super_admin') {
      const response = await api.get('/agencies');
      const rows = Array.isArray(response.data) ? response.data : [];
      linkedOrganizations.value = rows
        // Affiliations: any non-agency org type (school/program/learning)
        .filter((r) => String(r?.organization_type || '').toLowerCase() !== 'agency')
        .map((r) => ({
          id: r.id,
          name: r.name,
          slug: r.slug || r.portal_url || null,
          organization_type: r.organization_type,
          is_active: r.is_active
        }));
      return;
    }

    const agencyId = activeAgencyId.value;
    if (!agencyId) {
      linkedOrganizations.value = [];
      return;
    }

    // Agency admins: only show orgs linked to the active agency.
    const response = await api.get(`/agencies/${agencyId}/schools`);
    const rows = response.data || [];
    linkedOrganizations.value = rows.map((r) => ({
      id: r.school_organization_id,
      name: r.school_name,
      slug: r.school_slug,
      organization_type: r.school_organization_type,
      is_active: r.school_is_active
    }));
  } catch (err) {
    console.error('Failed to fetch linked organizations:', err);
    linkedOrganizations.value = [];
  } finally {
    loadingOrganizations.value = false;
  }
};

// Get available organizations (school/program/learning only; never agency)
const availableOrganizations = computed(() => {
  // We intentionally show only orgs linked to the active agency, so client creation is valid.
  return linkedOrganizations.value || [];
});

const availableSchools = computed(() => {
  return (availableOrganizations.value || []).filter(
    (o) => String(o?.organization_type || '').toLowerCase() === 'school'
  );
});

const showSchoolSearch = computed(() => {
  // Only show when the user actually has schools in scope (superadmin = platform-wide).
  return (availableSchools.value || []).length > 0;
});

const schoolSearchQuery = ref('');
const schoolSearchOpen = ref(false);

const schoolSearchResults = computed(() => {
  const list = availableSchools.value || [];
  const q = String(schoolSearchQuery.value || '').trim().toLowerCase();
  const ranked = q
    ? list
        .filter((s) => String(s?.name || '').toLowerCase().includes(q))
        .slice(0, 20)
    : list.slice(0, 12);
  return ranked;
});

const selectSchool = (school) => {
  if (!school?.id) return;
  organizationFilter.value = String(school.id);
  // Keep the typed value stable as a “selection”
  schoolSearchQuery.value = school.name || '';
  schoolSearchOpen.value = false;
  applyFilters();
};

const availableAffiliations = computed(() => {
  return (availableOrganizations.value || []).filter(
    (o) => String(o?.organization_type || '').toLowerCase() !== 'agency'
  );
});

const selectedAffiliation = computed(() => {
  const id = Number(organizationFilter.value);
  if (!id) return null;
  return (availableAffiliations.value || []).find((o) => Number(o?.id) === id) || null;
});

const goToAffiliationDashboard = () => {
  if (!selectedAffiliation.value?.slug) return;
  router.push(`/${selectedAffiliation.value.slug}/dashboard`);
};

// Get available providers
const availableProviders = ref([]);

const fetchClients = async () => {
  try {
    loading.value = true;
    error.value = '';
    
    const params = new URLSearchParams();
    if (clientStatusFilter.value) params.append('client_status_id', clientStatusFilter.value);
    if (organizationFilter.value) params.append('organization_id', organizationFilter.value);
    if (providerFilter.value) params.append('provider_id', providerFilter.value);
    if (searchQuery.value) params.append('search', searchQuery.value);

    const response = await api.get(`/clients?${params.toString()}`);
    clients.value = response.data || [];
    currentPage.value = 1;
  } catch (err) {
    console.error('Failed to fetch clients:', err);
    error.value = err.response?.data?.error?.message || 'Failed to load clients';
  } finally {
    loading.value = false;
  }
};

const fetchClientStatuses = async () => {
  try {
    const response = await api.get('/client-settings/client-statuses');
    clientStatuses.value = (response.data || []).filter((s) => s && (s.is_active === undefined || s.is_active === 1 || s.is_active === true));
  } catch (err) {
    clientStatuses.value = [];
  }
};

const fetchProviders = async () => {
  try {
    const response = await api.get('/users');
    const allUsers = response.data || [];
    // Filter to providers/clinicians
    availableProviders.value = allUsers.filter(u => 
      ['provider', 'clinician', 'supervisor', 'admin'].includes(u.role?.toLowerCase())
    );
  } catch (err) {
    console.error('Failed to fetch providers:', err);
  }
};

const filteredClients = computed(() => {
  let filtered = [...clients.value];

  // Apply sort
  const [sortField, sortOrder] = sortBy.value.split('-');
  filtered.sort((a, b) => {
    let aVal = a[sortField];
    let bVal = b[sortField];

    if (sortField === 'submission_date' || sortField === 'last_activity_at') {
      aVal = parseDateForDisplay(aVal);
      bVal = parseDateForDisplay(bVal);
    } else {
      aVal = (aVal || '').toString().toLowerCase();
      bVal = (bVal || '').toString().toLowerCase();
    }

    if (sortOrder === 'asc') {
      return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
    } else {
      return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
    }
  });

  return filtered;
});

const totalPages = computed(() => {
  return Math.max(1, Math.ceil(filteredClients.value.length / pageSize.value));
});

const pagedClients = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredClients.value.slice(start, start + pageSize.value);
});

const allPageSelected = computed(() => {
  const page = pagedClients.value || [];
  if (!page.length) return false;
  for (const c of page) {
    if (!selectedIds.value.has(c.id)) return false;
  }
  return true;
});

const toggleSelected = (id) => {
  const set = new Set(selectedIds.value);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  selectedIds.value = set;
};

const toggleSelectAllPage = (evt) => {
  const checked = !!evt?.target?.checked;
  const set = new Set(selectedIds.value);
  for (const c of pagedClients.value || []) {
    if (checked) set.add(c.id);
    else set.delete(c.id);
  }
  selectedIds.value = set;
};

const clearSelection = () => {
  selectedIds.value = new Set();
  bulkAffiliationId.value = '';
  bulkProviderId.value = '';
  bulkClientStatusId.value = '';
  bulkPromoteYear.value = '';
};

const normalizeSchoolYearLabel = (raw) => {
  const s = String(raw || '').trim();
  if (!s) return '';
  const m = s.match(/^(\d{4})\s*-\s*(\d{4})$/);
  if (m) return `${m[1]}-${m[2]}`;
  const m2 = s.match(/^(\d{4})\s*\/\s*(\d{4})$/);
  if (m2) return `${m2[1]}-${m2[2]}`;
  return s;
};

const currentSchoolYear = computed(() => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const start = m >= 7 ? y : y - 1;
  return `${start}-${start + 1}`;
});

const nextSchoolYear = computed(() => {
  const c = String(currentSchoolYear.value);
  const m = c.match(/^(\d{4})-(\d{4})$/);
  if (!m) return '';
  const a = parseInt(m[1], 10);
  const b = parseInt(m[2], 10);
  return `${a + 1}-${b + 1}`;
});

const bulkPromoteToNextYear = async () => {
  const ids = Array.from(selectedIds.value || []);
  if (!ids.length) return;
  const toSchoolYear = normalizeSchoolYearLabel(bulkPromoteYear.value || nextSchoolYear.value);
  if (!toSchoolYear) return;
  bulkWorking.value = true;
  try {
    await api.post('/clients/bulk/promote-school-year', { clientIds: ids, toSchoolYear });
    await fetchClients();
    clearSelection();
  } catch (e) {
    console.error('Bulk promote failed:', e);
    alert(e.response?.data?.error?.message || e.message || 'Bulk promote failed');
  } finally {
    bulkWorking.value = false;
  }
};

const runBulk = async (fn) => {
  const ids = Array.from(selectedIds.value || []);
  if (!ids.length) return;
  bulkWorking.value = true;
  try {
    // Small concurrency limit to avoid hammering the API.
    const concurrency = 5;
    let i = 0;
    const workers = Array.from({ length: concurrency }).map(async () => {
      while (i < ids.length) {
        const id = ids[i++];
        // eslint-disable-next-line no-await-in-loop
        await fn(id);
      }
    });
    await Promise.all(workers);
    await fetchClients();
    clearSelection();
  } catch (e) {
    console.error('Bulk action failed:', e);
    alert(e.response?.data?.error?.message || e.message || 'Bulk action failed');
  } finally {
    bulkWorking.value = false;
  }
};

const bulkArchive = async () => {
  const ok = window.confirm(`Archive ${selectedIds.value.size} client(s)? This removes them from rosters.`);
  if (!ok) return;
  await runBulk((id) => api.put(`/clients/${id}/status`, { status: 'ARCHIVED' }));
};

const bulkMoveAffiliation = async () => {
  const orgId = bulkAffiliationId.value ? parseInt(String(bulkAffiliationId.value), 10) : null;
  if (!orgId) return;
  await runBulk((id) => api.put(`/clients/${id}`, { organization_id: orgId }));
};

const bulkSetClientStatus = async () => {
  const csId = bulkClientStatusId.value ? parseInt(String(bulkClientStatusId.value), 10) : null;
  if (!csId) return;
  await runBulk((id) => api.put(`/clients/${id}`, { client_status_id: csId }));
};

const bulkAssignProvider = async () => {
  const raw = String(bulkProviderId.value || '');
  if (!raw) return;
  const providerId = raw === '__unassign__' ? null : parseInt(raw, 10);
  await runBulk((id) => api.put(`/clients/${id}/provider`, { provider_id: providerId }));
};

const applyFilters = () => {
  fetchClients();
};

const parseDateForDisplay = (dateValue) => {
  if (!dateValue) return new Date(0);
  const s = String(dateValue);
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) {
    const y = parseInt(ymd[1], 10);
    const m = parseInt(ymd[2], 10) - 1;
    const d = parseInt(ymd[3], 10);
    return new Date(y, m, d);
  }
  return new Date(s);
};

const formatDate = (dateString) => {
  if (!dateString) return '-';
  const date = parseDateForDisplay(dateString);
  return date.toLocaleDateString();
};

const formatDocumentStatus = (status) => {
  const statusMap = {
    'NONE': 'None',
    'UPLOADED': 'Uploaded',
    'APPROVED': 'Approved',
    'REJECTED': 'Rejected'
  };
  return statusMap[status] || status;
};

const startEditStatus = async (client) => {
  const ok = window.confirm('Archive this client? This will remove them from all school rosters.');
  if (!ok) return;
  try {
    await api.put(`/clients/${client.id}/status`, { status: 'ARCHIVED' });
    await fetchClients();
  } catch (err) {
    console.error('Failed to archive client:', err);
    alert(err.response?.data?.error?.message || 'Failed to archive client');
  } finally {
    cancelEdit();
  }
};

const startEditProvider = (client) => {
  editingProviderId.value = client.id;
  editingProviderValue.value = client.provider_id;
};

const cancelEdit = () => {
  editingProviderId.value = null;
  editingProviderValue.value = null;
};

// Workflow editing removed; "status" is now treated as an internal archive flag.

const saveProvider = async (clientId, providerId) => {
  try {
    await api.put(`/clients/${clientId}/provider`, { provider_id: providerId });
    await fetchClients();
    cancelEdit();
  } catch (err) {
    console.error('Failed to assign provider:', err);
    alert(err.response?.data?.error?.message || 'Failed to assign provider');
    cancelEdit();
  }
};

const openClientDetail = (client) => {
  selectedClient.value = client;
};

const closeClientDetail = () => {
  selectedClient.value = null;
};

const handleClientUpdated = () => {
  fetchClients();
  closeClientDetail();
};

const createClient = async () => {
  try {
    creating.value = true;
    error.value = '';

    // The agency_id should be the agency organization that owns/manages the selected org
    const agencyId = activeAgencyId.value;

    if (!agencyId) {
      error.value = 'Unable to determine agency. Please ensure you are associated with an agency.';
      creating.value = false;
      return;
    }

    // Normalize optional fields
    const payload = {
      ...newClient.value,
      school_year: normalizeSchoolYearLabel(newClient.value.school_year) || null,
      grade: String(newClient.value.grade || '').trim() || null,
      agency_id: agencyId,
      source: 'ADMIN_CREATED'
    };

    await api.post('/clients', payload);

    await fetchClients();
    closeCreateModal();
  } catch (err) {
    console.error('Failed to create client:', err);
    const status = err.response?.status;
    const meta = err.response?.data?.error?.errorMeta || null;
    if (status === 409 && meta?.matches && Array.isArray(meta.matches)) {
      dupesMatches.value = meta.matches;
      dupesForNewClient.value = { ...newClient.value };
      dupesModalOpen.value = true;
      return;
    }
    error.value = err.response?.data?.error?.message || 'Failed to create client';
  } finally {
    creating.value = false;
  }
};

const closeCreateModal = () => {
  showCreateModal.value = false;
  newClient.value = {
    organization_id: null,
    initials: '',
    provider_id: null,
    client_status_id: null,
    school_year: '',
    grade: '',
    submission_date: new Date().toISOString().split('T')[0],
    document_status: 'NONE'
  };
};

const closeDupesModal = () => {
  dupesModalOpen.value = false;
  dupesMatches.value = [];
  dupesForNewClient.value = null;
};

const unarchiveMatch = async (m) => {
  if (!m?.clientId) return;
  const payload = {
    organization_id: dupesForNewClient.value?.organization_id || undefined,
    provider_id: dupesForNewClient.value?.provider_id ?? undefined
  };
  try {
    await api.post(`/clients/${m.clientId}/unarchive`, payload);
    await fetchClients();
    closeDupesModal();
    closeCreateModal();
  } catch (e) {
    alert(e.response?.data?.error?.message || e.message || 'Failed to unarchive client');
  }
};

const handleBulkImported = () => {
  fetchClients();
};

onMounted(async () => {
  await agencyStore.fetchUserAgencies();
  await fetchLinkedOrganizations();
  await fetchClientStatuses();
  await fetchProviders();
  await fetchClients();

  // Default school year for new clients (best-effort; user can override).
  if (!newClient.value.school_year) {
    newClient.value.school_year = currentSchoolYear.value;
  }
});
</script>

<style scoped>
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
  margin-bottom: 20px;
  padding: 16px;
  background: var(--bg-alt);
  border-radius: 8px;
}

.filter-group {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
}

.search-input {
  flex: 1;
  min-width: 200px;
  padding: 8px 12px;
  border: 2px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
}

.filter-select {
  padding: 8px 12px;
  border: 2px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
  min-width: 150px;
}

.school-search {
  position: relative;
  min-width: 220px;
}

.school-search-input {
  width: 100%;
  padding: 8px 12px;
  border: 2px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
}

.school-search-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 20;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow);
  max-height: 280px;
  overflow: auto;
  padding: 6px;
}

.school-search-item {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 10px 10px;
  border: 0;
  background: transparent;
  cursor: pointer;
  border-radius: 8px;
  text-align: left;
  font: inherit;
}

.school-search-item:hover {
  background: var(--bg-alt);
}

.school-search-name {
  font-weight: 600;
}

.school-search-meta {
  color: var(--text-secondary);
  font-size: 12px;
}

.link-button {
  padding: 0;
  border: none;
  background: transparent;
  color: var(--primary);
  cursor: pointer;
  text-decoration: underline;
  font: inherit;
}

.link-button:hover {
  opacity: 0.85;
}

.bulk-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: var(--bg-alt);
  border: 1px solid var(--border);
  border-radius: 10px;
  margin-bottom: 10px;
}

.bulk-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.bulk-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.select-cell {
  width: 34px;
}

.btn-danger {
  background: var(--danger, #d92d20);
  color: #fff;
  border: 1px solid rgba(0, 0, 0, 0.08);
}

.btn-danger:hover {
  opacity: 0.92;
}

.pagination-bar {
  margin-top: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.pagination-left,
.pagination-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.pagination-meta {
  color: var(--text-secondary);
  font-size: 13px;
}

.page-size {
  min-width: 140px;
}

.clients-table-container {
  overflow-x: auto;
  background: white;
  border-radius: 8px;
  border: 1px solid var(--border);
}

.clients-table {
  width: 100%;
  border-collapse: collapse;
}

.clients-table thead {
  background: var(--bg-alt);
}

.clients-table th {
  padding: 12px 16px;
  text-align: left;
  font-weight: 600;
  color: var(--text-primary);
  border-bottom: 2px solid var(--border);
  white-space: nowrap;
}

.clients-table td {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  color: var(--text-primary);
}

.client-row {
  cursor: pointer;
  transition: background 0.2s;
}

.client-row:hover {
  background: var(--bg-alt);
}

.actions-cell {
  white-space: nowrap;
}

.inline-select {
  padding: 4px 8px;
  border: 2px solid var(--primary);
  border-radius: 4px;
  font-size: 13px;
  background: white;
}

.editable-field {
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background 0.2s;
}

.editable-field:hover {
  background: var(--bg-alt);
}

.doc-status-badge {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
}

.doc-none {
  background: #e2e3e5;
  color: #383d41;
}

.doc-uploaded {
  background: #fff3cd;
  color: #856404;
}

.doc-approved {
  background: #d4edda;
  color: #155724;
}

.doc-rejected {
  background: #f8d7da;
  color: #721c24;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-secondary);
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  padding: 32px;
  border-radius: 12px;
  max-width: 600px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
  padding-top: 24px;
  border-top: 2px solid var(--border);
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: var(--text-primary);
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 10px 12px;
  border: 2px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
}

.form-group small {
  display: block;
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 12px;
}
</style>
