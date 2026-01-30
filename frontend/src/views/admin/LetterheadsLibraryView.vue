<template>
  <div class="container">
    <div class="page-header">
      <div>
        <h1>Letterheads</h1>
        <p class="subtitle">Reusable print-safe letterhead templates (header/footer + CSS)</p>
      </div>
      <div class="header-actions">
        <button @click="showCreateModal = true" class="btn btn-primary">Create / Upload Letterhead</button>
      </div>
    </div>

    <div class="filters">
      <select v-model="filterAgencyId" @change="handleAgencyChange" class="filter-select">
        <option value="null">Platform Letterheads</option>
        <option v-for="agency in availableAgencies" :key="agency.id" :value="String(agency.id)">
          {{ agency.name }}
        </option>
      </select>

      <select v-model="filterOrganizationId" @change="loadLetterheads" class="filter-select" :disabled="!filterAgencyId || filterAgencyId === 'null'">
        <option value="">All Organizations</option>
        <option v-for="org in affiliatedOrganizations" :key="org.id" :value="String(org.id)">
          {{ org.name }}{{ org.organization_type ? ` (${org.organization_type})` : '' }}
        </option>
      </select>

      <label class="checkbox">
        <input type="checkbox" v-model="includePlatform" @change="loadLetterheads" />
        Include platform
      </label>
    </div>

    <div v-if="loading" class="loading">Loading…</div>

    <div v-else class="grid">
      <div v-for="lh in letterheads" :key="lh.id" class="card">
        <div class="card-title">
          <strong>{{ lh.name }}</strong>
          <span :class="['badge', lh.is_active ? 'badge-success' : 'badge-secondary']">
            {{ lh.is_active ? 'Active' : 'Inactive' }}
          </span>
        </div>

        <div class="meta">
          <div><strong>Scope:</strong> {{ lh.agency_id ? `Agency #${lh.agency_id}` : 'Platform' }}</div>
          <div v-if="lh.organization_id"><strong>Org:</strong> #{{ lh.organization_id }}</div>
          <div><strong>Type:</strong> {{ (lh.template_type || 'html').toUpperCase() }}</div>
          <div><strong>Page:</strong> {{ (lh.page_size || 'letter').toUpperCase() }} / {{ (lh.orientation || 'portrait') }}</div>
        </div>

        <div class="actions">
          <button class="btn btn-secondary btn-sm" @click="openEdit(lh)">Edit</button>
          <button
            v-if="lh.is_active"
            class="btn btn-warning btn-sm"
            @click="toggleActive(lh, false)"
          >
            Deactivate
          </button>
          <button
            v-else
            class="btn btn-success btn-sm"
            @click="toggleActive(lh, true)"
          >
            Activate
          </button>
        </div>
      </div>

      <div v-if="letterheads.length === 0" class="empty">
        No letterheads found for this scope.
      </div>
    </div>

    <!-- Create modal -->
    <div v-if="showCreateModal" class="modal-overlay" @click="closeCreate">
      <div class="modal-content large" @click.stop>
        <h2>Create / Upload Letterhead</h2>

        <div class="form-group">
          <label>Letterhead Name *</label>
          <input v-model="createForm.name" type="text" required />
        </div>

        <div class="form-group">
          <label>Scope *</label>
          <div class="scope-toggle">
            <button type="button" class="scope-btn" :class="{ active: createForm.scope === 'agency' }" @click="setCreateScope('agency')">
              Agency
            </button>
            <button
              type="button"
              class="scope-btn"
              :class="{ active: createForm.scope === 'platform', disabled: !canUsePlatformScope }"
              :disabled="!canUsePlatformScope"
              @click="setCreateScope('platform')"
            >
              Platform
            </button>
          </div>

          <div v-if="createForm.scope === 'agency'" class="scope-org-select">
            <label class="sub-label">Agency *</label>
            <select v-model="createForm.agencyId" @change="onCreateAgencyChanged" required>
              <option value="">Select an agency</option>
              <option v-for="agency in availableAgencies" :key="agency.id" :value="String(agency.id)">
                {{ agency.name }}
              </option>
            </select>

            <label class="sub-label" style="margin-top: 12px;">Associated Organization (Optional)</label>
            <select v-model="createForm.organizationId" :disabled="loadingAffiliatedOrganizations || affiliatedOrganizations.length === 0">
              <option value="">None</option>
              <option v-for="org in affiliatedOrganizations" :key="org.id" :value="String(org.id)">
                {{ org.name }}{{ org.organization_type ? ` (${org.organization_type})` : '' }}
              </option>
            </select>
            <small v-if="loadingAffiliatedOrganizations">Loading affiliated organizations…</small>
            <small v-else-if="affiliatedOrganizations.length === 0">No affiliated organizations found for this agency.</small>
          </div>
        </div>

        <div class="form-group">
          <label>Letterhead Type *</label>
          <select v-model="createForm.templateType">
            <option value="html">HTML/CSS (recommended)</option>
            <option value="svg">SVG upload</option>
            <option value="png">PNG upload</option>
          </select>
        </div>

        <div class="form-group">
          <label>Page Settings</label>
          <div class="two-col">
            <div>
              <label class="sub-label">Page size</label>
              <select v-model="createForm.pageSize">
                <option value="letter">Letter</option>
                <option value="a4">A4</option>
              </select>
            </div>
            <div>
              <label class="sub-label">Orientation</label>
              <select v-model="createForm.orientation">
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </div>
          </div>
          <div class="two-col" style="margin-top: 10px;">
            <div>
              <label class="sub-label">Header height (pt)</label>
              <input v-model.number="createForm.headerHeight" type="number" min="0" />
            </div>
            <div>
              <label class="sub-label">Footer height (pt)</label>
              <input v-model.number="createForm.footerHeight" type="number" min="0" />
            </div>
          </div>
          <div class="two-col" style="margin-top: 10px;">
            <div>
              <label class="sub-label">Margins (pt) — Top / Right</label>
              <div class="two-col">
                <input v-model.number="createForm.marginTop" type="number" min="0" />
                <input v-model.number="createForm.marginRight" type="number" min="0" />
              </div>
            </div>
            <div>
              <label class="sub-label">Margins (pt) — Bottom / Left</label>
              <div class="two-col">
                <input v-model.number="createForm.marginBottom" type="number" min="0" />
                <input v-model.number="createForm.marginLeft" type="number" min="0" />
              </div>
            </div>
          </div>
        </div>

        <div v-if="createForm.templateType === 'html'" class="form-group">
          <label>Header HTML</label>
          <HtmlDocumentBuilder v-model="createForm.headerHtml" />
        </div>
        <div v-if="createForm.templateType === 'html'" class="form-group">
          <label>Footer HTML</label>
          <HtmlDocumentBuilder v-model="createForm.footerHtml" />
        </div>
        <div v-if="createForm.templateType === 'html'" class="form-group">
          <label>CSS</label>
          <textarea v-model="createForm.cssContent" rows="8" placeholder="Print-safe CSS (optional)" />
        </div>

        <div v-else class="form-group">
          <label>Upload {{ createForm.templateType.toUpperCase() }} *</label>
          <input type="file" :accept="createForm.templateType === 'svg' ? '.svg' : '.png'" @change="onAssetSelected" />
          <small v-if="selectedAsset">Selected: {{ selectedAsset.name }}</small>
        </div>

        <div v-if="error" class="error">{{ error }}</div>

        <div class="form-actions">
          <button class="btn btn-secondary" type="button" @click="closeCreate">Cancel</button>
          <button class="btn btn-primary" type="button" :disabled="saving" @click="saveCreate">
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Edit modal (minimal) -->
    <div v-if="showEditModal && editing" class="modal-overlay" @click="closeEdit">
      <div class="modal-content large" @click.stop>
        <h2>Edit Letterhead: {{ editing.name }}</h2>

        <div class="form-group">
          <label>Name</label>
          <input v-model="editForm.name" type="text" />
        </div>

        <div v-if="editing.template_type === 'html'" class="form-group">
          <label>Header HTML</label>
          <HtmlDocumentBuilder v-model="editForm.headerHtml" />
        </div>
        <div v-if="editing.template_type === 'html'" class="form-group">
          <label>Footer HTML</label>
          <HtmlDocumentBuilder v-model="editForm.footerHtml" />
        </div>
        <div v-if="editing.template_type === 'html'" class="form-group">
          <label>CSS</label>
          <textarea v-model="editForm.cssContent" rows="8" />
        </div>

        <div class="form-actions">
          <button class="btn btn-secondary" type="button" @click="closeEdit">Cancel</button>
          <button class="btn btn-primary" type="button" :disabled="saving" @click="saveEdit">
            {{ saving ? 'Saving…' : 'Save Changes' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import HtmlDocumentBuilder from '../../components/documents/HtmlDocumentBuilder.vue';

const authStore = useAuthStore();
const agencyStore = useAgencyStore();

const canUsePlatformScope = computed(() => authStore.user?.role === 'super_admin');

const loading = ref(false);
const saving = ref(false);
const error = ref('');

const availableAgencies = ref([]);
const affiliatedOrganizations = ref([]);
const loadingAffiliatedOrganizations = ref(false);

const filterAgencyId = ref('null'); // string: 'null' or agency id
const filterOrganizationId = ref('');
const includePlatform = ref(true);

const letterheads = ref([]);

const showCreateModal = ref(false);
const selectedAsset = ref(null);

const createForm = ref({
  name: '',
  scope: canUsePlatformScope.value ? 'platform' : 'agency',
  agencyId: '',
  organizationId: '',
  templateType: 'html',
  headerHtml: '',
  footerHtml: '',
  cssContent: '',
  pageSize: 'letter',
  orientation: 'portrait',
  marginTop: 72,
  marginRight: 72,
  marginBottom: 72,
  marginLeft: 72,
  headerHeight: 96,
  footerHeight: 72
});

const showEditModal = ref(false);
const editing = ref(null);
const editForm = ref({
  name: '',
  headerHtml: '',
  footerHtml: '',
  cssContent: ''
});

const fetchAgencies = async () => {
  // mirror DocumentsLibrary permissions
  if (authStore.user?.role === 'super_admin') {
    const res = await api.get('/agencies', { skipGlobalLoading: true });
    availableAgencies.value = res.data || [];
  } else {
    await agencyStore.fetchUserAgencies();
    availableAgencies.value = agencyStore.userAgencies || [];
  }
};

const fetchAffiliatedOrganizations = async (agencyId) => {
  if (!agencyId) {
    affiliatedOrganizations.value = [];
    return;
  }
  try {
    loadingAffiliatedOrganizations.value = true;
    const res = await api.get(`/agencies/${agencyId}/affiliated-organizations`, { skipGlobalLoading: true });
    affiliatedOrganizations.value = Array.isArray(res.data) ? res.data : [];
  } catch (e) {
    affiliatedOrganizations.value = [];
  } finally {
    loadingAffiliatedOrganizations.value = false;
  }
};

const loadLetterheads = async () => {
  try {
    loading.value = true;
    error.value = '';

    const agencyId = filterAgencyId.value === 'null' ? null : filterAgencyId.value;
    const params = {
      agencyId,
      organizationId: filterOrganizationId.value || null,
      includePlatform: includePlatform.value
    };

    const res = await api.get('/letterhead-templates', { params });
    letterheads.value = res.data || [];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load letterheads';
    letterheads.value = [];
  } finally {
    loading.value = false;
  }
};

const handleAgencyChange = async () => {
  if (filterAgencyId.value === 'null') {
    filterOrganizationId.value = '';
    affiliatedOrganizations.value = [];
  } else {
    await fetchAffiliatedOrganizations(filterAgencyId.value);
  }
  await loadLetterheads();
};

const setCreateScope = (scope) => {
  if (scope === 'platform' && !canUsePlatformScope.value) return;
  createForm.value.scope = scope;
  if (scope === 'platform') {
    createForm.value.agencyId = '';
    createForm.value.organizationId = '';
    affiliatedOrganizations.value = [];
  }
};

const onCreateAgencyChanged = async () => {
  createForm.value.organizationId = '';
  await fetchAffiliatedOrganizations(createForm.value.agencyId);
};

const closeCreate = () => {
  showCreateModal.value = false;
  selectedAsset.value = null;
  error.value = '';
};

const onAssetSelected = (e) => {
  selectedAsset.value = e?.target?.files?.[0] || null;
};

const saveCreate = async () => {
  try {
    saving.value = true;
    error.value = '';

    const scope = createForm.value.scope;
    const agencyId = scope === 'platform' ? null : (createForm.value.agencyId || null);
    const organizationId =
      scope === 'platform'
        ? null
        : (createForm.value.organizationId && String(createForm.value.organizationId) !== String(createForm.value.agencyId)
            ? createForm.value.organizationId
            : null);

    if (!createForm.value.name?.trim()) {
      error.value = 'Name is required';
      return;
    }

    if (scope === 'agency' && !agencyId) {
      error.value = 'Agency is required';
      return;
    }

    if (createForm.value.templateType === 'html') {
      await api.post('/letterhead-templates', {
        name: createForm.value.name,
        agencyId,
        organizationId,
        templateType: 'html',
        headerHtml: createForm.value.headerHtml,
        footerHtml: createForm.value.footerHtml,
        cssContent: createForm.value.cssContent,
        pageSize: createForm.value.pageSize,
        orientation: createForm.value.orientation,
        marginTop: createForm.value.marginTop,
        marginRight: createForm.value.marginRight,
        marginBottom: createForm.value.marginBottom,
        marginLeft: createForm.value.marginLeft,
        headerHeight: createForm.value.headerHeight,
        footerHeight: createForm.value.footerHeight
      });
    } else {
      if (!selectedAsset.value) {
        error.value = 'Please select a file to upload';
        return;
      }
      const fd = new FormData();
      fd.append('file', selectedAsset.value);
      fd.append('name', createForm.value.name);
      fd.append('templateType', createForm.value.templateType);
      if (agencyId) fd.append('agencyId', String(agencyId));
      if (organizationId) fd.append('organizationId', String(organizationId));
      fd.append('pageSize', createForm.value.pageSize);
      fd.append('orientation', createForm.value.orientation);
      fd.append('marginTop', String(createForm.value.marginTop));
      fd.append('marginRight', String(createForm.value.marginRight));
      fd.append('marginBottom', String(createForm.value.marginBottom));
      fd.append('marginLeft', String(createForm.value.marginLeft));
      fd.append('headerHeight', String(createForm.value.headerHeight));
      fd.append('footerHeight', String(createForm.value.footerHeight));

      await api.post('/letterhead-templates/upload', fd);
    }

    closeCreate();
    await loadLetterheads();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to save letterhead';
  } finally {
    saving.value = false;
  }
};

const openEdit = (lh) => {
  editing.value = lh;
  editForm.value = {
    name: lh.name || '',
    headerHtml: lh.header_html || '',
    footerHtml: lh.footer_html || '',
    cssContent: lh.css_content || ''
  };
  showEditModal.value = true;
};

const closeEdit = () => {
  showEditModal.value = false;
  editing.value = null;
  error.value = '';
};

const saveEdit = async () => {
  if (!editing.value) return;
  try {
    saving.value = true;
    await api.put(`/letterhead-templates/${editing.value.id}`, {
      name: editForm.value.name,
      headerHtml: editForm.value.headerHtml,
      footerHtml: editForm.value.footerHtml,
      cssContent: editForm.value.cssContent
    });
    closeEdit();
    await loadLetterheads();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to save changes';
  } finally {
    saving.value = false;
  }
};

const toggleActive = async (lh, active) => {
  try {
    if (active) await api.post(`/letterhead-templates/${lh.id}/restore`);
    else await api.post(`/letterhead-templates/${lh.id}/archive`);
    await loadLetterheads();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to update status';
  }
};

onMounted(async () => {
  await fetchAgencies();
  if (!canUsePlatformScope.value) {
    // default to first agency for non-super admins
    if (availableAgencies.value?.[0]?.id) {
      filterAgencyId.value = String(availableAgencies.value[0].id);
      createForm.value.scope = 'agency';
      createForm.value.agencyId = String(availableAgencies.value[0].id);
      await fetchAffiliatedOrganizations(filterAgencyId.value);
    }
  }
  await handleAgencyChange();
});
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}
.subtitle {
  color: var(--text-secondary);
  margin: 0;
}
.filters {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 18px;
}
.filter-select {
  padding: 10px 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: white;
  font-size: 14px;
}
.checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--text-primary);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 14px;
}
.card {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px;
  background: white;
}
.card-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.meta {
  font-size: 13px;
  color: var(--text-secondary);
  display: grid;
  gap: 4px;
  margin-bottom: 12px;
}
.actions {
  display: flex;
  gap: 10px;
}
.loading {
  padding: 20px;
  color: var(--text-secondary);
}
.empty {
  padding: 18px;
  color: var(--text-secondary);
}
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}
.modal-content {
  background: white;
  padding: 26px;
  border-radius: 12px;
  width: 92%;
  max-width: 860px;
  max-height: 90vh;
  overflow-y: auto;
}
.modal-content.large {
  max-width: 980px;
}
.form-group {
  margin-bottom: 16px;
}
.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
}
.form-group input[type="text"],
.form-group input[type="number"],
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
}
.form-group small {
  display: block;
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 12px;
}
.form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 18px;
}
.error {
  background: #f8d7da;
  color: #842029;
  padding: 10px 12px;
  border-radius: 8px;
  margin-top: 8px;
}
.two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.scope-toggle {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 10px;
}
.scope-btn {
  padding: 12px 14px;
  border: 2px solid var(--border, #ddd);
  border-radius: 10px;
  background: white;
  color: var(--text-primary, #333);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.scope-btn.active {
  border-color: var(--primary-color, #007bff);
  background: var(--primary-color, #007bff);
  color: white;
}
.scope-btn:disabled,
.scope-btn.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.scope-org-select .sub-label {
  margin-top: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}
</style>

