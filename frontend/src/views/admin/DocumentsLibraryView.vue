<template>
  <div class="container">
    <div class="page-header">
      <div>
        <h1>Documents Library</h1>
        <p class="subtitle">Manage document templates and assign them to users</p>
      </div>
      <div class="header-actions">
        <button 
          @click="viewMode = viewMode === 'table' ? 'grid' : 'table'" 
          class="btn btn-secondary"
        >
          {{ viewMode === 'table' ? '📋 Grid View' : '📊 Table View' }}
        </button>
        <button @click="showUploadModal = true" class="btn btn-primary">
          Upload PDF
        </button>
        <button @click="openCreateEditor" class="btn btn-primary">
          Create HTML Template
        </button>
      </div>
    </div>

    <div class="filters" v-if="!loading">
      <select v-model="filterAgencyId" @change="applyFilters" class="filter-select">
        <option value="all">All Agencies</option>
        <option value="null">Platform Templates</option>
        <option v-for="agency in availableAgencies" :key="agency.id" :value="agency.id">
          {{ agency.name }}
        </option>
      </select>
      <select
        v-if="filterAgencyId !== 'all' && filterAgencyId !== 'null'"
        v-model="filterOrganizationId"
        class="filter-select"
      >
        <option value="all">All Organizations</option>
        <option v-for="org in affiliatedOrganizationOptions" :key="org.id" :value="org.id">
          {{ org.name }}{{ org.organization_type ? ` (${org.organization_type})` : '' }}
        </option>
      </select>
      <input
        v-model="filterQuery"
        class="filter-select"
        type="text"
        placeholder="Search agencies, orgs, titles…"
      />
      <select v-model="filterDocumentType" @change="applyFilters" class="filter-select">
        <option value="all">All Document Types</option>
        <option value="acknowledgment">Acknowledgment</option>
        <option value="authorization">Authorization</option>
        <option value="agreement">Agreement</option>
        <option value="audio_recording_consent">Audio Recording Consent</option>
        <option value="hipaa_security">HIPAA Security</option>
        <option value="compliance">Compliance</option>
        <option value="disclosure">Disclosure</option>
        <option value="consent">Consent</option>
        <option value="administrative">Administrative</option>
      </select>
      <select v-model="filterTemplateType" @change="applyFilters" class="filter-select">
        <option value="all">All Formats</option>
        <option value="pdf">PDF Only</option>
        <option value="html">HTML Only</option>
      </select>
      <select v-model="statusFilter" @change="applyFilters" class="filter-select">
        <option value="active">Active Only</option>
        <option value="inactive">Inactive Only</option>
        <option value="all">All Statuses</option>
      </select>
      <select v-model="sortBy" @change="applyFilters" class="filter-select">
        <option value="name">Sort: Name (A-Z)</option>
        <option value="-name">Sort: Name (Z-A)</option>
        <option value="-created_at">Sort: Date (Newest)</option>
        <option value="created_at">Sort: Date (Oldest)</option>
        <option value="document_type">Sort: Document Type</option>
      </select>
    </div>

    <div v-if="!loading && pagination.total > 0" class="pagination-info">
      Showing {{ ((pagination.currentPage - 1) * pagination.limit) + 1 }} - {{ Math.min(pagination.currentPage * pagination.limit, pagination.total) }} of {{ pagination.total }} documents
    </div>

    <div v-if="loading" class="loading">Loading documents...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="templates.length === 0" class="empty-state">
      <p>No document templates found.</p>
      <p v-if="filterAgencyId !== 'all' || statusFilter !== 'active'" class="empty-state-hint">
        Try selecting <strong>All Agencies</strong> and <strong>Active Only</strong> above, or click Reset Filters.
      </p>
      <div class="empty-state-actions">
        <button @click="resetFiltersAndReload" class="btn btn-secondary">Reset Filters</button>
        <button @click="showUploadModal = true" class="btn btn-primary">Upload Your First Document</button>
      </div>
    </div>
    
    <!-- Grid View -->
    <div v-else-if="viewMode === 'grid'" class="documents-grid">
      <DocumentTemplateCard
        v-for="template in getFilteredTemplates()"
        :key="template.id"
        :template="template"
        :filter-agency-id="filterAgencyId"
        :available-agencies="availableAgencies"
        @assign="handleAssign"
        @edit="handleEdit"
        @delete="handleDelete"
        @view-versions="handleViewVersions"
        @preview="handlePreview"
        @toggle-status="toggleTemplateStatus"
        @upload-version="handleUploadNewVersion"
        @duplicate="handleDuplicate"
      />
    </div>
    
    <!-- Table View -->
    <div v-else class="documents-table-container">
      <table class="documents-table">
        <thead>
          <tr>
            <th>Document</th>
            <th>Action</th>
            <th>Format</th>
            <th>Type</th>
            <th>Agency</th>
            <th>Status</th>
            <th>Version</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr 
            v-for="template in getFilteredTemplates()" 
            :key="template.id"
            :class="getAgencyRowClass(template.agency_id)"
            :style="getTemplateRowStyle(template)"
          >
            <td>
              <div class="table-document-content">
                <img 
                  v-if="getDisplayIconUrl(template)" 
                  :src="getDisplayIconUrl(template)" 
                  :alt="getDisplayIconAlt(template)"
                  class="table-document-icon"
                  @error="(e) => { console.error('Icon failed to load:', e.target.src, 'for template:', template.name); e.target.style.display = 'none'; }"
                  @load="() => console.log('Icon loaded successfully for:', template.name)"
                />
                <div class="table-document-text">
                  <div class="table-document-title">
                    <strong>{{ template.name }}</strong>
                  </div>
                  <div v-if="template.description" class="table-description">
                    {{ template.description }}
                  </div>
                </div>
              </div>
            </td>
            <td>
              <span :class="['badge', getActionBadgeClass(template.document_action_type)]">
                {{ formatActionType(template.document_action_type) }}
              </span>
            </td>
            <td>
              <span :class="['badge', template.template_type === 'pdf' ? 'badge-info' : 'badge-secondary']">
                {{ template.template_type?.toUpperCase() || 'N/A' }}
              </span>
            </td>
            <td>
              <span v-if="template.document_type" class="badge badge-primary">
                {{ formatDocumentType(template.document_type) }}
              </span>
              <span v-else class="text-muted">-</span>
            </td>
            <td>
              <span v-if="template.agency_id">{{ getAgencyName(template.agency_id) }}</span>
              <span v-else-if="template.agency_id === null" class="badge badge-secondary">Platform</span>
              <span v-else class="text-muted">-</span>
            </td>
            <td>
              <span :class="['badge', template.is_active !== false && template.is_active !== 0 ? 'badge-success' : 'badge-secondary']">
                {{ template.is_active !== false && template.is_active !== 0 ? 'Active' : 'Inactive' }}
              </span>
            </td>
            <td>{{ template.version || 1 }}</td>
            <td>{{ formatDate(template.created_at) }}</td>
            <td class="actions-cell">
              <div class="action-buttons">
                <button @click="handleAssign(template)" class="btn btn-success btn-sm">Assign</button>
                <button @click="handlePreview(template)" class="btn btn-secondary btn-sm">Preview</button>
                <button @click="handleDuplicate(template)" class="btn btn-info btn-sm">Duplicate</button>
                <button v-if="canEdit(template)" @click="handleEdit(template)" class="btn btn-primary btn-sm">Edit</button>
                <button
                  v-if="canEdit(template) && template.template_type === 'pdf' && template.document_action_type !== 'review'"
                  @click="handleUploadNewVersion(template)"
                  class="btn btn-secondary btn-sm"
                >
                  New Version
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination Controls -->
    <div v-if="!loading && pagination.totalPages > 1" class="pagination-controls">
      <button 
        @click="goToPage(pagination.currentPage - 1)" 
        :disabled="pagination.currentPage === 1"
        class="btn btn-secondary"
      >
        Previous
      </button>
      <span class="page-info">
        Page {{ pagination.currentPage }} of {{ pagination.totalPages }}
      </span>
      <button 
        @click="goToPage(pagination.currentPage + 1)" 
        :disabled="pagination.currentPage >= pagination.totalPages"
        class="btn btn-secondary"
      >
        Next
      </button>
    </div>

    <!-- Upload PDF Modal -->
    <DocumentUploadDialog
      v-if="showUploadModal"
      @close="showUploadModal = false"
      @uploaded="handleUploaded"
    />


    <!-- Assignment Dialog -->
    <DocumentAssignmentDialog
      v-if="showAssignModal && templateToAssign"
      :template="templateToAssign"
      @close="showAssignModal = false"
      @assigned="handleAssigned"
    />

    <!-- Version History Dialog -->
    <DocumentVersionHistory
      v-if="showVersionModal && templateForVersions"
      :template="templateForVersions"
      @close="showVersionModal = false"
    />

    <!-- Edit Document Modal -->
    <div v-if="showEditModal && editingTemplate" class="modal-overlay" @click.self="showEditModal = false">
      <div class="modal-content large" @click.stop>
        <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h2>Edit Document: {{ editingTemplate.name }}</h2>
          <button @click="showEditModal = false" class="btn btn-secondary" style="padding: 4px 12px;">Close</button>
        </div>
        <form @submit.prevent="saveEdit">
          <div class="form-group">
            <label>Document Name *</label>
            <input v-model="editForm.name" type="text" required />
          </div>
          <div class="form-group">
            <label>Description</label>
            <textarea v-model="editForm.description" rows="3"></textarea>
          </div>
          <div class="form-group">
            <label>Document Type *</label>
            <select v-model="editForm.documentType" required class="form-control">
              <option value="acknowledgment">Acknowledgment</option>
              <option value="authorization">Authorization</option>
              <option value="agreement">Agreement</option>
              <option value="audio_recording_consent">Audio Recording Consent</option>
              <option value="hipaa_security">HIPAA Security</option>
              <option value="compliance">Compliance</option>
              <option value="disclosure">Disclosure</option>
              <option value="consent">Consent</option>
              <option value="school">School</option>
              <option value="administrative">Administrative</option>
            </select>
          </div>
          <div class="form-group">
            <label>Document Action Type *</label>
            <select v-model="editForm.documentActionType" required class="form-control">
              <option value="signature">Require Electronic Signature</option>
              <option value="review">Review/Acknowledgment Only</option>
            </select>
          </div>
          <div class="form-group">
            <label>PDF Document</label>
            <p v-if="editingTemplate.document_action_type !== 'review'" class="info-text">
              To upload a new version of this PDF, use the "Upload New Version" button.
            </p>
            <p class="info-text">Current file: {{ editingTemplate.file_path || 'N/A' }}</p>
            
            <!-- Signature Coordinate Picker -->
            <div
              v-if="editingTemplate.template_type === 'pdf' && editingTemplate.file_path && editingTemplate.document_action_type !== 'review'"
              class="signature-coordinate-section"
            >
              <h4 style="margin-top: 24px; margin-bottom: 12px;">Signature Position</h4>
              <p class="info-text" style="margin-bottom: 16px;">
                Click on the PDF below to set where the signature should be placed. 
                You can also manually adjust the coordinates.
              </p>
              <PDFSignatureCoordinatePicker
                v-if="editPdfUrl"
                :pdf-url="editPdfUrl"
                v-model="editForm.signatureCoordinates"
              />
              <div v-else class="pdf-error">
                <p>PDF preview is not available.</p>
                <p v-if="editingTemplate?.file_path" class="file-info">
                  File: {{ editingTemplate.file_path }}
                </p>
              </div>
            </div>

            <div v-if="editingTemplate.template_type === 'pdf' && editPdfUrl" class="signature-coordinate-section">
              <h4 style="margin-top: 24px; margin-bottom: 12px;">Custom Fields (Optional)</h4>
              <PDFFieldDefinitionBuilder
                :pdf-url="editPdfUrl"
                v-model="editForm.fieldDefinitions"
              />
            </div>
          </div>
          <div class="form-group">
            <label>Icon</label>
            <IconSelector v-model="editForm.iconId" label="Select Document Icon" />
          </div>
          <div class="form-group">
            <label>Agency</label>
            <select v-model="editForm.agencyId" class="form-control">
              <option :value="null">Platform (Available to All)</option>
              <option v-for="agency in availableAgencies" :key="agency.id" :value="agency.id">
                {{ agency.name }}
              </option>
            </select>
            <small>Select an agency to make this document agency-specific, or leave as Platform for all agencies</small>
          </div>
          <div v-if="editingTemplate.document_action_type !== 'review'" class="form-group">
            <label>
              <input v-model="editForm.saveAsNewVersion" type="checkbox" />
              Save as new version
            </label>
            <small>Check this to create a new version instead of updating the current one. This preserves the previous version in history.</small>
          </div>
          <div class="modal-actions" style="display: flex; gap: 12px; justify-content: space-between; margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--border);">
            <div class="modal-actions-left">
              <button 
                v-if="canEdit(editingTemplate)" 
                type="button" 
                @click="toggleTemplateStatus(editingTemplate)" 
                :class="['btn', 'btn-lg', editingTemplate.is_active !== false && editingTemplate.is_active !== 0 ? 'btn-warning' : 'btn-success']"
              >
                {{ editingTemplate.is_active !== false && editingTemplate.is_active !== 0 ? 'Deactivate' : 'Activate' }}
              </button>
              <button 
                v-if="canDelete(editingTemplate)" 
                type="button" 
                @click="handleDelete(editingTemplate)" 
                class="btn btn-danger"
              >
                Archive
              </button>
            </div>
            <div class="modal-actions-right" style="display: flex; gap: 12px;">
              <button type="button" @click="showEditModal = false" class="btn btn-secondary">Cancel</button>
              <button type="submit" class="btn btn-primary" :disabled="saving">
                {{ saving ? 'Saving...' : 'Save Changes' }}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>

    <!-- Upload New Version Modal -->
    <DocumentUploadDialog
      v-if="showUploadNewVersionModal && templateForNewVersion"
      :existingTemplate="templateForNewVersion"
      @close="showUploadNewVersionModal = false; templateForNewVersion = null;"
      @uploaded="handleUploaded"
    />

    <!-- Preview Modal -->
    <div v-if="showPreviewModal && templateToPreview" class="modal-overlay" @click.self="showPreviewModal = false">
      <div class="modal-content large" @click.stop>
        <div class="preview-header">
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <h2 style="margin: 0;">Preview: {{ templateToPreview.name }}</h2>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <span :class="['badge', getActionBadgeClass(templateToPreview.document_action_type)]">
                {{ formatActionType(templateToPreview.document_action_type) }}
              </span>
              <span :class="['badge', templateToPreview.template_type === 'pdf' ? 'badge-info' : 'badge-secondary']">
                {{ templateToPreview.template_type?.toUpperCase() || 'N/A' }}
              </span>
            </div>
          </div>
          <button @click="showPreviewModal = false" class="btn btn-secondary">Close</button>
        </div>
        <div class="preview-content">
          <div v-if="templateToPreview.template_type === 'html'" v-html="templateToPreview.html_content" class="html-preview"></div>
          <div v-else class="pdf-preview">
            <PDFPreview v-if="previewPdfUrl" :pdf-url="previewPdfUrl" />
            <div v-else class="pdf-error">
              <p>PDF preview is not available.</p>
              <p v-if="templateToPreview.file_path" class="file-info">
                File: {{ templateToPreview.file_path }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, onBeforeUnmount } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useDocumentsStore } from '../../store/documents';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import { useBrandingStore } from '../../store/branding';
import DocumentTemplateCard from '../../components/documents/DocumentTemplateCard.vue';
import DocumentUploadDialog from '../../components/documents/DocumentUploadDialog.vue';
import DocumentAssignmentDialog from '../../components/documents/DocumentAssignmentDialog.vue';
import DocumentVersionHistory from '../../components/documents/DocumentVersionHistory.vue';
import PDFSignatureCoordinatePicker from '../../components/documents/PDFSignatureCoordinatePicker.vue';
import PDFFieldDefinitionBuilder from '../../components/documents/PDFFieldDefinitionBuilder.vue';
import PDFPreview from '../../components/documents/PDFPreview.vue';
import IconSelector from '../../components/admin/IconSelector.vue';
import api from '../../services/api';
import { getBackendBaseUrl, toUploadsUrl } from '../../utils/uploadsUrl';

const router = useRouter();
const route = useRoute();

const documentsStore = useDocumentsStore();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const brandingStore = useBrandingStore();

const loading = computed(() => documentsStore.loading);
const error = computed(() => documentsStore.error);
const templates = computed(() => documentsStore.templates);
const pagination = computed(() => documentsStore.pagination);

const filterAgencyId = ref('all');
const filterOrganizationId = ref('all');
const filterQuery = ref('');
const filterDocumentType = ref('all');
const filterTemplateType = ref('all');
const statusFilter = ref('active');
const sortBy = ref('name');
const currentPage = ref(1);
const viewMode = ref('grid'); // 'grid' or 'table'
const showUploadModal = ref(false);
const showAssignModal = ref(false);
const showVersionModal = ref(false);
const showPreviewModal = ref(false);
const templateToAssign = ref(null);
const templateForVersions = ref(null);
const templateToPreview = ref(null);
const previewPdfUrl = ref(null);
const editPdfUrl = ref(null);
const saving = ref(false);
const selectedAgencyId = ref(null);
const availableAgencies = ref([]);

const affiliatedOrganizationOptions = ref([]);
const organizationLookup = ref(new Map());
const organizationsByAgency = ref({});

const filtersStorageKey = 'documents-library-filters';
const loadFiltersFromStorage = () => {
  try {
    const raw = localStorage.getItem(filtersStorageKey);
    if (!raw) return;
    const stored = JSON.parse(raw);
    if (stored?.filterAgencyId) filterAgencyId.value = stored.filterAgencyId;
    if (stored?.filterOrganizationId) filterOrganizationId.value = stored.filterOrganizationId;
    if (stored?.filterQuery !== undefined) filterQuery.value = stored.filterQuery;
    if (stored?.filterDocumentType) filterDocumentType.value = stored.filterDocumentType;
    if (stored?.filterTemplateType) filterTemplateType.value = stored.filterTemplateType;
    if (stored?.statusFilter) statusFilter.value = stored.statusFilter;
    if (stored?.sortBy) sortBy.value = stored.sortBy;
    if (stored?.viewMode) viewMode.value = stored.viewMode;
  } catch {
    // ignore storage errors
  }
};

const persistFilters = () => {
  try {
    localStorage.setItem(
      filtersStorageKey,
      JSON.stringify({
        filterAgencyId: filterAgencyId.value,
        filterOrganizationId: filterOrganizationId.value,
        filterQuery: filterQuery.value,
        filterDocumentType: filterDocumentType.value,
        filterTemplateType: filterTemplateType.value,
        statusFilter: statusFilter.value,
        sortBy: sortBy.value,
        viewMode: viewMode.value
      })
    );
  } catch {
    // ignore storage errors
  }
};

watch(
  [filterAgencyId, filterDocumentType, filterTemplateType, statusFilter, sortBy, viewMode],
  () => {
    persistFilters();
  }
);

watch(filterAgencyId, async (next) => {
  filterOrganizationId.value = 'all';
  affiliatedOrganizationOptions.value = [];
  const id = Number(next);
  if (!id) return;
  const orgs = await fetchAffiliatedOrganizationsForAgency(id);
  affiliatedOrganizationOptions.value = orgs;
});

const applyFilters = async () => {
  currentPage.value = 1; // Reset to first page when filters change
  await loadTemplates();
};

const resetFiltersAndReload = async () => {
  filterAgencyId.value = 'all';
  filterOrganizationId.value = 'all';
  filterQuery.value = '';
  filterDocumentType.value = 'all';
  filterTemplateType.value = 'all';
  statusFilter.value = 'active';
  sortBy.value = 'name';
  currentPage.value = 1;
  persistFilters();
  await loadTemplates();
};

const goToPage = async (page) => {
  if (page < 1 || page > pagination.value.totalPages) return;
  currentPage.value = page;
  await loadTemplates();
};

const loadTemplates = async () => {
  const filters = {
    page: currentPage.value,
    limit: 20,
    isUserSpecific: false // Only show library documents
  };

  // Agency filter
  console.log('DocumentsLibraryView - loadTemplates - filterAgencyId.value:', filterAgencyId.value, 'type:', typeof filterAgencyId.value);
  if (filterAgencyId.value && filterAgencyId.value !== 'all') {
    if (filterAgencyId.value === 'null') {
      filters.agencyId = null;
      console.log('DocumentsLibraryView - Setting filters.agencyId = null (platform only)');
    } else {
      filters.agencyId = parseInt(filterAgencyId.value);
      console.log('DocumentsLibraryView - Setting filters.agencyId =', filters.agencyId);
    }
  } else {
    console.log('DocumentsLibraryView - No agency filter (showing all)');
  }
  console.log('DocumentsLibraryView - Final filters object:', JSON.stringify(filters, null, 2));

  // Document type filter
  if (filterDocumentType.value && filterDocumentType.value !== 'all') {
    filters.documentType = filterDocumentType.value;
  }

  // Status filter
  if (statusFilter.value === 'active') {
    filters.isActive = true;
  } else if (statusFilter.value === 'inactive') {
    filters.isActive = false;
  }
  // 'all' means no filter

  // Template type filter (client-side for now, or add to backend)
  // We'll filter client-side for template_type since it's already in the data

  // Sorting
  if (sortBy.value) {
    if (sortBy.value.startsWith('-')) {
      filters.sortBy = sortBy.value.substring(1);
      filters.sortOrder = 'desc';
    } else {
      filters.sortBy = sortBy.value;
      filters.sortOrder = 'asc';
    }
  }

  await documentsStore.fetchTemplates(filters);
  const agencyIds = (documentsStore.templates || [])
    .map((t) => t?.agency_id)
    .filter((id) => id !== null && id !== undefined);
  await refreshOrganizationLookup(agencyIds);
};

/**
 * Fuzzy score: matches letters even out of order, with most relevant first.
 * - Exact substring match: highest score
 * - Letters in order: high score
 * - All letters present (any order): lower score
 */
function fuzzyScore(text, query) {
  const t = String(text || '').toLowerCase();
  const q = String(query || '').trim().toLowerCase();
  if (!q) return { score: 1, inOrder: true };
  const chars = q.split('').filter(Boolean);
  if (!chars.length) return { score: 1, inOrder: true };
  const allPresent = chars.every((c) => t.includes(c));
  if (!allPresent) return { score: 0, inOrder: false };
  const matched = [];
  let cursor = 0;
  for (const c of chars) {
    const idx = t.indexOf(c, cursor);
    if (idx === -1) {
      const fallback = t.indexOf(c);
      if (fallback === -1) return { score: 0, inOrder: false };
      matched.push(fallback);
      cursor = fallback + 1;
    } else {
      matched.push(idx);
      cursor = idx + 1;
    }
  }
  const inOrder = matched.every((idx, i) => i === 0 || idx > matched[i - 1]);
  const contiguousBonus = inOrder && chars.length > 1
    ? (t.includes(q) ? 2 : 1)
    : 0;
  return {
    score: (inOrder ? 3 : 2) + contiguousBonus,
    inOrder
  };
}

const getFilteredTemplates = () => {
  let filtered = templates.value;

  // Filter by template type (client-side since backend doesn't support it yet)
  if (filterTemplateType.value !== 'all') {
    filtered = filtered.filter(t => t.template_type === filterTemplateType.value);
  }

  if (filterOrganizationId.value !== 'all') {
    const target = Number(filterOrganizationId.value);
    filtered = filtered.filter((t) => Number(t.organization_id) === target);
  }

  const query = String(filterQuery.value || '').trim().toLowerCase();
  if (query) {
    const scored = filtered.map((t) => {
      const agencyName = t?.agency_id !== null && t?.agency_id !== undefined ? getAgencyName(t.agency_id) : 'platform';
      const orgName = t?.organization_id ? getOrganizationName(t.organization_id) : '';
      const haystack = [
        t?.name,
        t?.description,
        t?.document_type,
        t?.template_type,
        agencyName,
        orgName
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const s1 = fuzzyScore(haystack, query);
      const s2 = fuzzyScore(t?.name || '', query);
      const score = Math.max(s1.score, s2.score);
      return { template: t, score };
    }).filter((x) => x.score > 0);

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.template?.name || '').localeCompare(String(b.template?.name || ''));
    });
    filtered = scored.map((x) => x.template);
  }

  // Status filter is handled by backend, so we don't need to filter client-side
  // The backend will return the correct filtered results based on statusFilter

  return filtered;
};

const handleAssign = (template) => {
  templateToAssign.value = template;
  showAssignModal.value = true;
};

const editingTemplate = ref(null);
const showEditModal = ref(false);
const editLetterheads = ref([]);
const loadingEditLetterheads = ref(false);
const editForm = ref({
  name: '',
  description: '',
  documentType: 'administrative',
  documentActionType: 'signature',
  htmlContent: '',
  layoutType: 'standard',
  letterheadTemplateId: null,
  letterHeaderHtml: '',
  letterFooterHtml: '',
  isActive: true,
  iconId: null,
  agencyId: null,
  organizationId: null,
  saveAsNewVersion: false,
  fieldDefinitions: [],
  signatureCoordinates: {
    x: null,
    y: null,
    width: 200,
    height: 60,
    page: null
  }
});
const showUploadNewVersionModal = ref(false);
const templateForNewVersion = ref(null);

async function fetchEditLetterheads() {
  try {
    const currentSelection = editForm.value.letterheadTemplateId;
    editLetterheads.value = [];
    if (String(editForm.value.layoutType || 'standard') !== 'letter') return;

    loadingEditLetterheads.value = true;

    const agencyId = editForm.value.agencyId || null;
    const organizationId = editForm.value.organizationId || null;
    const res = await api.get('/letterhead-templates', {
      params: { agencyId, organizationId, includePlatform: true }
    });
    editLetterheads.value = Array.isArray(res.data) ? res.data : [];

    const stillValid =
      currentSelection && editLetterheads.value.some((lh) => String(lh.id) === String(currentSelection));
    if (stillValid) {
      editForm.value.letterheadTemplateId = currentSelection;
    } else if (editLetterheads.value?.[0]?.id) {
      editForm.value.letterheadTemplateId = editLetterheads.value[0].id;
    } else {
      editForm.value.letterheadTemplateId = null;
    }
  } catch (e) {
    console.error('Failed to load edit letterheads:', e);
    editLetterheads.value = [];
    editForm.value.letterheadTemplateId = null;
  } finally {
    loadingEditLetterheads.value = false;
  }
}

const openTemplateEditor = (templateId) => {
  const isOrgContext = Boolean(route.params.organizationSlug);
  const href = router.resolve({
    name: isOrgContext ? 'OrganizationDocumentTemplateEdit' : 'DocumentTemplateEdit',
    params: isOrgContext
      ? { organizationSlug: route.params.organizationSlug, templateId }
      : { templateId }
  }).href;
  window.open(href, '_blank', 'noopener');
};

const openCreateEditor = () => {
  const isOrgContext = Boolean(route.params.organizationSlug);
  const href = router.resolve({
    name: isOrgContext ? 'OrganizationDocumentTemplateCreate' : 'DocumentTemplateCreate',
    params: isOrgContext ? { organizationSlug: route.params.organizationSlug } : {}
  }).href;
  window.open(href, '_blank', 'noopener');
};

const handleEdit = (template) => {
  if (String(template.template_type) === 'html') {
    openTemplateEditor(template.id);
    return;
  }
  console.log('Opening edit for template:', template.name, 'icon_id:', template.icon_id, 'icon_file_path:', template.icon_file_path);
  const parsedFieldDefinitions = (() => {
    const raw = template.field_definitions;
    if (!raw) return [];
    try {
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      return [];
    }
  })();
  editingTemplate.value = template;
  editForm.value = {
    name: template.name || '',
    description: template.description !== undefined && template.description !== null ? template.description : '',
    documentType: template.document_type || 'administrative',
    documentActionType: template.document_action_type || 'signature',
    htmlContent: template.html_content !== undefined && template.html_content !== null ? template.html_content : '',
    layoutType: template.layout_type || 'standard',
    letterheadTemplateId: template.letterhead_template_id ?? null,
    letterHeaderHtml: template.letter_header_html || '',
    letterFooterHtml: template.letter_footer_html || '',
    isActive: template.is_active !== false && template.is_active !== 0,
    iconId: template.icon_id !== undefined && template.icon_id !== null ? template.icon_id : null,
    agencyId: template.agency_id !== undefined && template.agency_id !== null ? template.agency_id : null,
    organizationId: template.organization_id !== undefined && template.organization_id !== null ? template.organization_id : null,
    saveAsNewVersion: false,
    fieldDefinitions: parsedFieldDefinitions,
    signatureCoordinates: {
      x: template.signature_x !== undefined && template.signature_x !== null ? template.signature_x : null,
      y: template.signature_y !== undefined && template.signature_y !== null ? template.signature_y : null,
      width: template.signature_width !== undefined && template.signature_width !== null ? template.signature_width : 200,
      height: template.signature_height !== undefined && template.signature_height !== null ? template.signature_height : 60,
      page: template.signature_page !== undefined && template.signature_page !== null ? template.signature_page : null
    }
  };
  console.log('Edit form iconId set to:', editForm.value.iconId);
  showEditModal.value = true;
  // Preload letterheads for letter layout templates
  fetchEditLetterheads();
  loadEditPdfPreview(template);
};

const handleDuplicate = async (template) => {
  try {
    saving.value = true;
    const response = await api.post(`/document-templates/${template.id}/duplicate`);
    const newTemplate = response.data;
    
    if (String(newTemplate.template_type) === 'html') {
      openTemplateEditor(newTemplate.id);
    } else {
      // Open edit modal with the new template
      editingTemplate.value = newTemplate;
      editForm.value = {
        name: newTemplate.name,
        description: newTemplate.description || '',
        documentType: newTemplate.document_type || 'administrative',
        documentActionType: newTemplate.document_action_type || 'signature',
        htmlContent: newTemplate.html_content || '',
        layoutType: newTemplate.layout_type || 'standard',
        letterheadTemplateId: newTemplate.letterhead_template_id ?? null,
        letterHeaderHtml: newTemplate.letter_header_html || '',
        letterFooterHtml: newTemplate.letter_footer_html || '',
        isActive: newTemplate.is_active !== false && newTemplate.is_active !== 0,
        iconId: newTemplate.icon_id !== undefined && newTemplate.icon_id !== null ? newTemplate.icon_id : null,
        agencyId: newTemplate.agency_id !== undefined && newTemplate.agency_id !== null ? newTemplate.agency_id : null,
        organizationId: newTemplate.organization_id !== undefined && newTemplate.organization_id !== null ? newTemplate.organization_id : null,
        saveAsNewVersion: false,
        fieldDefinitions: (() => {
        const raw = newTemplate.field_definitions;
        if (!raw) return [];
        try {
          return typeof raw === 'string' ? JSON.parse(raw) : raw;
        } catch {
          return [];
        }
      })(),
        signatureCoordinates: {
          x: newTemplate.signature_x !== undefined && newTemplate.signature_x !== null ? newTemplate.signature_x : null,
          y: newTemplate.signature_y !== undefined && newTemplate.signature_y !== null ? newTemplate.signature_y : null,
          width: newTemplate.signature_width !== undefined && newTemplate.signature_width !== null ? newTemplate.signature_width : 200,
          height: newTemplate.signature_height !== undefined && newTemplate.signature_height !== null ? newTemplate.signature_height : 60,
          page: newTemplate.signature_page !== undefined && newTemplate.signature_page !== null ? newTemplate.signature_page : null
        }
      };
      showEditModal.value = true;
      fetchEditLetterheads();
      loadEditPdfPreview(newTemplate);
    }
    
    // Reload templates to include the new one
    await loadTemplates();
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to duplicate template');
  } finally {
    saving.value = false;
  }
};

const handleUploadNewVersion = (template) => {
  templateForNewVersion.value = template;
  showUploadNewVersionModal.value = true;
};

const saveEdit = async () => {
  try {
    saving.value = true;
    if (
      editingTemplate.value?.template_type === 'html' &&
      String(editForm.value.layoutType || 'standard') === 'letter' &&
      !editForm.value.letterheadTemplateId
    ) {
      alert('Please select a letterhead for letter layout templates.');
      return;
    }
    // Ensure no undefined values are sent - convert to null or omit
    // Build updateData object with explicit null checks
    const updateData = {};
    
    // Always include name
    updateData.name = editForm.value.name !== undefined && editForm.value.name !== null ? editForm.value.name : null;
    
    // Always include description (can be empty string or null)
    updateData.description = editForm.value.description !== undefined ? (editForm.value.description || null) : null;
    
    // Always include documentType and documentActionType
    updateData.documentType = editForm.value.documentType || 'administrative';
    updateData.documentActionType = editForm.value.documentActionType || 'signature';
    
    // Always include isActive (boolean)
    updateData.isActive = editForm.value.isActive !== undefined ? (editForm.value.isActive === true || editForm.value.isActive === 1) : true;
    
    // Always include htmlContent (for HTML templates, can be null for PDFs)
    updateData.htmlContent = editForm.value.htmlContent !== undefined ? (editForm.value.htmlContent || null) : null;

    // Letter layout fields (HTML templates)
    if (editingTemplate.value?.template_type === 'html') {
      updateData.layoutType = editForm.value.layoutType || 'standard';
      updateData.letterheadTemplateId =
        editForm.value.layoutType === 'letter' ? (editForm.value.letterheadTemplateId || null) : null;
      updateData.letterHeaderHtml =
        editForm.value.layoutType === 'letter' ? (editForm.value.letterHeaderHtml || null) : null;
      updateData.letterFooterHtml =
        editForm.value.layoutType === 'letter' ? (editForm.value.letterFooterHtml || null) : null;
    }
    
    // Always include iconId (can be null to remove icon, or a number to set it)
    updateData.iconId = editForm.value.iconId !== undefined ? (editForm.value.iconId !== null && editForm.value.iconId !== '' ? editForm.value.iconId : null) : null;
    
    // Always include agencyId (can be null for platform)
    updateData.agencyId = editForm.value.agencyId !== undefined ? (editForm.value.agencyId !== null && editForm.value.agencyId !== '' ? editForm.value.agencyId : null) : null;
    
    // Always include signature coordinates if signatureCoordinates exists in the form
    // This allows updating or clearing coordinates
    // Ensure they are numbers, not strings, and handle null/undefined properly
    if (editForm.value.signatureCoordinates !== undefined && editForm.value.signatureCoordinates !== null) {
      // Only include coordinates if at least one coordinate is set, or if we want to clear them
      // If all coordinates are null/undefined, we might want to preserve existing, but for now let's always send them
      const coords = editForm.value.signatureCoordinates;
      
      // Helper function to parse and validate numbers
      const parseCoord = (value, isInt = false) => {
        if (value === null || value === undefined || value === '' || value === 'null') {
          return null;
        }
        if (typeof value === 'string') {
          const parsed = isInt ? parseInt(value) : parseFloat(value);
          return isNaN(parsed) ? null : parsed;
        }
        return typeof value === 'number' ? value : null;
      };
      
      updateData.signatureX = parseCoord(coords.x);
      updateData.signatureY = parseCoord(coords.y);
      updateData.signatureWidth = parseCoord(coords.width);
      updateData.signatureHeight = parseCoord(coords.height);
      updateData.signaturePage = parseCoord(coords.page, true);
      
      console.log('📝 Parsed signature coordinates:', {
        x: updateData.signatureX,
        y: updateData.signatureY,
        width: updateData.signatureWidth,
        height: updateData.signatureHeight,
        page: updateData.signaturePage
      });
    }

    if (editForm.value.fieldDefinitions !== undefined) {
      updateData.fieldDefinitions = editForm.value.fieldDefinitions || [];
    }
    
    // If saveAsNewVersion is true, add flag to force new version creation
    if (editForm.value.saveAsNewVersion) {
      updateData.createNewVersion = true;
    }
    
    // Sanitize: remove any undefined values (shouldn't happen, but safety check)
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        console.warn(`⚠️ Found undefined in updateData.${key}, converting to null`);
        updateData[key] = null;
      }
    });
    
    console.log('💾 Saving template with iconId:', updateData.iconId, 'editForm.iconId:', editForm.value.iconId, 'saveAsNewVersion:', editForm.value.saveAsNewVersion, 'full updateData:', updateData);
    console.log('💾 UpdateData signature coordinates:', {
      signatureX: updateData.signatureX,
      signatureY: updateData.signatureY,
      signatureWidth: updateData.signatureWidth,
      signatureHeight: updateData.signatureHeight,
      signaturePage: updateData.signaturePage
    });
    console.log('💾 Full updateData (stringified):', JSON.stringify(updateData, null, 2));
    try {
      const response = await api.put(`/document-templates/${editingTemplate.value.id}`, updateData);
      console.log('✅ Update response received:', response);
      console.log('✅ Update response.data:', response.data);
      console.log('✅ Update response icon data:', {
        icon_id: response.data?.icon_id,
        icon_file_path: response.data?.icon_file_path,
        icon_name: response.data?.icon_name,
        hasIconData: !!(response.data?.icon_id || response.data?.icon_file_path)
      });
    } catch (saveError) {
      console.error('❌ Error saving template:', saveError);
      console.error('❌ Error response:', saveError.response);
      console.error('❌ Error response data:', saveError.response?.data);
      console.error('❌ Full error response data (stringified):', JSON.stringify(saveError.response?.data, null, 2));
      console.error('❌ Error message:', saveError.response?.data?.error?.message);
      console.error('❌ Error errors array:', saveError.response?.data?.error?.errors);
      console.error('❌ Error details:', saveError.response?.data?.error?.details);
      const errorMessage = saveError.response?.data?.error?.message || 'Failed to update template';
      const errorDetails = saveError.response?.data?.error?.errors || saveError.response?.data?.error?.details;
      console.error('❌ Extracted error details:', errorDetails);
      if (errorDetails && Array.isArray(errorDetails) && errorDetails.length > 0) {
        const detailedMessage = errorDetails.map(e => {
          const field = e.param || e.path || 'unknown';
          const msg = e.msg || e.message || JSON.stringify(e);
          return `${field}: ${msg}`;
        }).join('\n');
        alert(`${errorMessage}\n\nValidation Errors:\n${detailedMessage}`);
      } else {
        alert(`${errorMessage}\n\nPlease check the browser console for more details.`);
      }
      throw saveError;
    }
    showEditModal.value = false;
    editingTemplate.value = null;
    // Reload templates to get fresh data with icon joins
    await loadTemplates();
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to update template');
  } finally {
    saving.value = false;
  }
};

const toggleTemplateStatus = async (template) => {
  try {
    const newStatus = !(template.is_active !== false && template.is_active !== 0);
    const updateData = {
      name: template.name || null,
      description: template.description || null,
      isActive: newStatus
    };
    
    // Only include htmlContent if it exists (for HTML templates)
    if (template.html_content !== undefined) {
      updateData.htmlContent = template.html_content || null;
    }
    
    // Only include iconId if it exists
    if (template.icon_id !== undefined && template.icon_id !== null) {
      updateData.iconId = template.icon_id;
    }
    
    await api.put(`/document-templates/${template.id}`, updateData);
    // Update local template status immediately
    template.is_active = newStatus;
    await loadTemplates();
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to update template status');
  }
};

const handleDelete = async (template) => {
  if (confirm(`Are you sure you want to archive "${template.name}"? You can restore it from the Archive section in Settings.`)) {
    try {
      await api.post(`/document-templates/${template.id}/archive`);
      await documentsStore.fetchTemplates();
      
      // Close the edit modal if it's open
      if (showEditModal.value && editingTemplate.value?.id === template.id) {
        showEditModal.value = false;
        editingTemplate.value = null;
      }
      
      alert('Document archived successfully');
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to archive template');
    }
  }
};

const handleViewVersions = (template) => {
  templateForVersions.value = template;
  showVersionModal.value = true;
};

const handlePreview = async (template) => {
  try {
    // Fetch full template details if needed
    const response = await api.get(`/document-templates/${template.id}`);
    templateToPreview.value = response.data;
    showPreviewModal.value = true;
    await loadPreviewPdf(response.data);
  } catch (err) {
    alert('Failed to load template for preview');
    console.error('Preview error:', err);
  }
};

const revokeObjectUrl = (url) => {
  if (url) {
    try {
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn('Failed to revoke object URL:', e);
    }
  }
};

const loadPreviewPdf = async (template) => {
  revokeObjectUrl(previewPdfUrl.value);
  previewPdfUrl.value = null;
  if (!template || template.template_type !== 'pdf') return;
  try {
    const resp = await api.get(`/document-templates/${template.id}/preview`, { responseType: 'blob' });
    previewPdfUrl.value = URL.createObjectURL(resp.data);
  } catch (err) {
    console.error('Failed to load preview PDF:', err);
    previewPdfUrl.value = null;
  }
};

const loadEditPdfPreview = async (template) => {
  revokeObjectUrl(editPdfUrl.value);
  editPdfUrl.value = null;
  if (!template || template.template_type !== 'pdf' || !template.file_path) return;
  try {
    const resp = await api.get(`/document-templates/${template.id}/preview`, { responseType: 'blob' });
    editPdfUrl.value = URL.createObjectURL(resp.data);
  } catch (err) {
    console.error('Failed to load edit PDF preview:', err);
    editPdfUrl.value = null;
  }
};

watch(showPreviewModal, (open) => {
  if (!open) {
    revokeObjectUrl(previewPdfUrl.value);
    previewPdfUrl.value = null;
  }
});

watch(showEditModal, (open) => {
  if (!open) {
    revokeObjectUrl(editPdfUrl.value);
    editPdfUrl.value = null;
  }
});

onBeforeUnmount(() => {
  revokeObjectUrl(previewPdfUrl.value);
  revokeObjectUrl(editPdfUrl.value);
});

const handleUploaded = async () => {
  await loadTemplates();
};

const fetchAgencies = async () => {
  try {
    const response = await api.get('/agencies');
    const list = response.data || [];
    availableAgencies.value = list.filter(
      (a) => String(a?.organization_type || 'agency').toLowerCase() === 'agency'
    );
  } catch (err) {
    console.error('Failed to fetch agencies:', err);
  }
};

const fetchAffiliatedOrganizationsForAgency = async (agencyId) => {
  const id = Number(agencyId);
  if (!id) return [];
  if (organizationsByAgency.value[id]) return organizationsByAgency.value[id];
  try {
    const res = await api.get(`/agencies/${id}/affiliated-organizations`);
    const list = Array.isArray(res.data) ? res.data : [];
    organizationsByAgency.value = { ...organizationsByAgency.value, [id]: list };
    return list;
  } catch (err) {
    console.error('Failed to fetch affiliated organizations for filter:', err);
    return [];
  }
};

const refreshOrganizationLookup = async (agencyIds) => {
  const ids = Array.from(new Set((agencyIds || []).map((v) => Number(v)).filter(Boolean)));
  if (!ids.length) return;
  const results = await Promise.all(ids.map((id) => fetchAffiliatedOrganizationsForAgency(id)));
  const nextMap = new Map(organizationLookup.value);
  results.flat().forEach((org) => {
    if (org?.id) nextMap.set(Number(org.id), org);
  });
  organizationLookup.value = nextMap;
};

const getOrganizationName = (orgId) => {
  const org = organizationLookup.value.get(Number(orgId));
  return org?.name || null;
};

const handleAssigned = () => {
  showAssignModal.value = false;
  templateToAssign.value = null;
};

const getAgencyName = (agencyId) => {
  const agency = availableAgencies.value.find(a => a.id === agencyId);
  return agency ? agency.name : 'Unknown';
};

// Get CSS class for agency row styling
const getAgencyRowClass = (agencyId) => {
  if (agencyId === null || agencyId === undefined) {
    return 'agency-row-platform';
  }
  return `agency-row-${agencyId}`;
};

// Get inline style for agency row color distinction
const getAgencyRowStyle = (agencyId) => {
  if (agencyId === null || agencyId === undefined) {
    // Platform - light gray
    return {
      '--agency-row-color': '#6c757d',
      '--agency-row-bg': '#f8f9fa'
    };
  }
  
  // Generate a consistent color based on agency ID
  const colors = [
    '#007bff', // Blue
    '#28a745', // Green
    '#ffc107', // Yellow/Amber
    '#dc3545', // Red
    '#17a2b8', // Cyan
    '#6f42c1', // Purple
    '#fd7e14', // Orange
    '#20c997', // Teal
    '#e83e8c', // Pink
    '#6610f2', // Indigo
  ];
  
  const colorIndex = agencyId % colors.length;
  const borderColor = colors[colorIndex];
  const bgColor = `${borderColor}08`; // ~3% opacity
  
  return {
    '--agency-row-color': borderColor,
    '--agency-row-bg': bgColor
  };
};

const getDocumentTypeRowStyle = (documentType) => {
  const palette = {
    acknowledgment: '#0ea5e9',
    authorization: '#8b5cf6',
    agreement: '#14b8a6',
    audio_recording_consent: '#f97316',
    hipaa_security: '#334155',
    compliance: '#ef4444',
    disclosure: '#06b6d4',
    consent: '#10b981',
    administrative: '#6b7280'
  };
  const key = String(documentType || '').trim().toLowerCase();
  const color = palette[key] || palette.administrative;
  return {
    '--template-row-color': color,
    '--template-row-bg': `${color}10`
  };
};

const getTemplateRowStyle = (template) => ({
  ...getAgencyRowStyle(template?.agency_id),
  ...getDocumentTypeRowStyle(template?.document_type)
});

const formatDate = (dateString) => {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString();
};

const formatDocumentType = (type) => {
  const types = {
    acknowledgment: 'Acknowledgment',
    authorization: 'Authorization',
    agreement: 'Agreement',
    audio_recording_consent: 'Audio Recording Consent',
    hipaa_security: 'HIPAA Security',
    compliance: 'Compliance',
    disclosure: 'Disclosure',
    consent: 'Consent',
    administrative: 'Administrative'
  };
  return types[type] || type;
};

const formatActionType = (actionType) => {
  const t = String(actionType || '').toLowerCase();
  if (t === 'signature') return 'Signature';
  if (t === 'review') return 'Review';
  return 'Unknown';
};

const getActionBadgeClass = (actionType) => {
  const t = String(actionType || '').toLowerCase();
  if (t === 'signature') return 'badge-info';
  if (t === 'review') return 'badge-secondary';
  return 'badge-secondary';
};

const getDocumentIconUrl = (template) => {
  if (!template) {
    return null;
  }
  
  // Debug logging
  if (template.icon_id) {
    console.log('Document has icon_id:', {
      template_id: template.id,
      template_name: template.name,
      icon_id: template.icon_id,
      icon_file_path: template.icon_file_path,
      icon_name: template.icon_name,
      fullTemplate: template
    });
  }
  
  if (!template.icon_id) {
    return null;
  }
  
  let iconPath = template.icon_file_path;
  
  if (!iconPath && template.icon_id) {
    console.warn('⚠️ Template has icon_id but no icon_file_path:', {
      template_id: template.id,
      template_name: template.name,
      icon_id: template.icon_id
    });
    return null;
  }
  
  if (!iconPath) {
    return null;
  }
  
  const fullUrl = toUploadsUrl(iconPath);
  console.log('✅ Constructed document icon URL:', fullUrl, 'from path:', iconPath);
  return fullUrl;
};

// Check if we should show branding icons (master brand or agency master icon)
const shouldShowBrandingIcon = (template) => {
  return filterAgencyId.value === 'all';
};

// Check if template is a platform document
const isPlatformDocument = (template) => {
  return template.agency_id === null || template.agency_id === undefined;
};

// Get master brand icon URL from platform branding
const getMasterBrandIconUrl = () => {
  const platformBranding = brandingStore.platformBranding;
  
  if (!platformBranding) {
    return null;
  }
  
  if (!platformBranding.master_brand_icon_id || !platformBranding.master_brand_icon_path) {
    return null;
  }
  
  return toUploadsUrl(platformBranding.master_brand_icon_path);
};

// Get agency master icon URL (used when viewing "All Agencies" for agency documents)
const getAgencyMasterIconUrl = (template) => {
  // Only show agency master icon when viewing "All Agencies" and document belongs to an agency
  if (!shouldShowBrandingIcon(template) || isPlatformDocument(template)) return null;
  
  const agency = availableAgencies.value.find(a => a.id === template.agency_id);
  if (!agency) return null;
  
  // Priority 1: Use agency master icon (icon_id) - this is the unified master icon
  if (agency.icon_id && agency.icon_file_path) {
    return toUploadsUrl(agency.icon_file_path);
  }
  
  // Priority 2: Fall back to logo_url if master icon is not available
  if (agency.logo_url) {
    // logo_url might be a full URL or a relative path
    if (agency.logo_url.startsWith('http://') || agency.logo_url.startsWith('https://')) {
      return agency.logo_url;
    }
    // If it's a relative path, construct the full URL
    const apiBase = getBackendBaseUrl();
    return `${apiBase}${agency.logo_url.startsWith('/') ? '' : '/'}${agency.logo_url}`;
  }
  
  // No master icon or logo available
  return null;
};

// Get the icon URL to display (prioritizes branding icons when viewing "All Agencies")
const getDisplayIconUrl = (template) => {
  if (!template) return null;
  
  // When viewing "All Agencies", show branding icons
  if (shouldShowBrandingIcon(template)) {
    if (isPlatformDocument(template)) {
      // Platform document: show master brand icon
      return getMasterBrandIconUrl();
    } else {
      // Agency document: show agency master icon
      return getAgencyMasterIconUrl(template);
    }
  }
  
  // Otherwise: show document's assigned icon
  return getDocumentIconUrl(template);
};

// Get alt text for the displayed icon
const getDisplayIconAlt = (template) => {
  if (!template) return 'Document icon';
  
  if (shouldShowBrandingIcon(template)) {
    if (isPlatformDocument(template)) {
      return 'Master brand icon';
    } else {
      const agency = availableAgencies.value.find(a => a.id === template.agency_id);
      return agency ? `${agency.name} master icon` : 'Agency master icon';
    }
  }
  return template.icon_name || 'Document icon';
};


const canEdit = (template) => {
  if (authStore.user?.role === 'super_admin') return true;
  if (authStore.user?.role === 'support') {
    // Support can only edit documents they created
    return template.created_by_user_id === authStore.user?.id;
  }
  if (authStore.user?.role === 'admin') {
    if (template.agency_id === null) return true;
    const userAgencies = agencyStore.userAgencies || [];
    return userAgencies.some(a => a.id === template.agency_id);
  }
  return false;
};

const canDelete = (template) => {
  if (authStore.user?.role === 'super_admin') return true;
  if (authStore.user?.role === 'support') {
    // Support can only delete documents they created
    return template.created_by_user_id === authStore.user?.id;
  }
  if (authStore.user?.role === 'admin') {
    if (template.agency_id === null) return true;
    const userAgencies = agencyStore.userAgencies || [];
    return userAgencies.some(a => a.id === template.agency_id);
  }
  return false;
};

onMounted(async () => {
  if (authStore.user?.role === 'admin') {
    await agencyStore.fetchUserAgencies();
    if (agencyStore.userAgencies?.length > 0) {
      selectedAgencyId.value = agencyStore.userAgencies[0].id;
    }
  }
  // Fetch platform branding to ensure master brand icon is available
  await brandingStore.fetchPlatformBranding();
  await fetchAgencies();
  loadFiltersFromStorage();
  await loadTemplates();
});
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 32px;
}

.page-header h1 {
  margin: 0 0 8px 0;
  color: var(--text-primary);
}

.subtitle {
  color: var(--text-secondary);
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.filters {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}

.filter-select {
  padding: 10px 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
  background: white;
  color: var(--text-primary);
  min-width: 180px;
}

.filter-select option {
  color: var(--text-primary);
  background: white;
}

.pagination-info {
  margin-bottom: 16px;
  color: var(--text-secondary);
  font-size: 14px;
}

.pagination-controls {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  margin-top: 32px;
  padding: 20px;
}

.page-info {
  color: var(--text-primary);
  font-weight: 500;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}

.preview-header h2 {
  margin: 0;
}

.preview-content {
  max-height: 70vh;
  overflow-y: auto;
}

.pdf-preview {
  width: 100%;
  height: 70vh;
  display: flex;
  flex-direction: column;
}

.pdf-iframe {
  width: 100%;
  height: 100%;
  border: 1px solid var(--border, #ddd);
  border-radius: 4px;
}

.pdf-error {
  padding: 40px;
  text-align: center;
  color: var(--text-secondary, #666);
}

.html-preview {
  padding: 24px;
  background: #f8f9fa;
  border-radius: 8px;
  line-height: 1.6;
}

.html-preview h1,
.html-preview h2,
.html-preview h3 {
  margin-top: 24px;
  margin-bottom: 12px;
  color: var(--text-primary);
}

.html-preview p {
  margin-bottom: 12px;
}

.documents-table-container {
  overflow-x: auto;
  margin-top: 24px;
}

.documents-table {
  width: 100%;
  border-collapse: collapse;
  background: white;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: var(--shadow);
}

.documents-table thead {
  background: var(--bg-alt);
}

.documents-table th {
  padding: 10px 6px;
  text-align: left;
  font-weight: 600;
  color: var(--text-primary);
  border-bottom: 2px solid var(--border);
  font-size: 14px;
}

.documents-table td {
  padding: 10px 6px;
  border-bottom: 1px solid var(--border);
  color: var(--text-primary);
  font-size: 14px;
  vertical-align: middle;
}

.documents-table tbody tr {
  background: var(--template-row-bg, var(--agency-row-bg, white));
  border-left: 3px solid var(--template-row-color, var(--agency-row-color, transparent));
}

.documents-table tbody tr:hover {
  background: var(--bg-alt);
  opacity: 0.9;
}

.table-document-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.table-document-icon {
  width: auto;
  height: 48px;
  max-width: 48px;
  object-fit: contain;
  flex-shrink: 0;
  align-self: center;
}

.table-document-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.table-document-title {
  display: flex;
  align-items: center;
}

.table-description {
  font-size: 12px;
  color: var(--text-secondary);
  max-width: 400px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.actions-cell {
  white-space: nowrap;
  width: 1%;
  padding: 8px 4px !important;
}

.action-buttons {
  display: flex;
  gap: 4px;
  flex-wrap: nowrap;
  align-items: center;
}

.action-buttons .btn-sm {
  padding: 4px 8px;
  font-size: 11px;
  white-space: nowrap;
  flex-shrink: 0;
  width: auto;
  min-width: auto;
}

.text-muted {
  color: var(--text-secondary);
  font-style: italic;
}

.file-info {
  font-size: 12px;
  color: var(--text-secondary);
  font-style: italic;
}

.modal-content.large {
  max-width: 900px;
  width: 95%;
}

.documents-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 24px;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-secondary);
}

.empty-state p {
  margin-bottom: 20px;
  font-size: 16px;
}

.empty-state-hint {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 16px;
}

.empty-state-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
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
.form-group textarea,
.form-group select {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
}

.form-control {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
  background: white;
  color: var(--text-primary);
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
  margin-top: 24px;
}

.action-type-buttons {
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
}

.action-btn {
  flex: 1;
  padding: 12px 16px;
  border: 2px solid var(--border, #ddd);
  border-radius: 8px;
  background: white;
  color: var(--text-primary, #333);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover {
  border-color: var(--primary-color, #007bff);
  background: #f8f9fa;
}

.action-btn.active {
  border-color: var(--primary-color, #007bff);
  background: var(--primary-color, #007bff);
  color: white;
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

.scope-btn:hover:not(:disabled) {
  border-color: var(--primary-color, #007bff);
  background: #f8f9fa;
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

