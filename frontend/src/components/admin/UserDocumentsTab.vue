<template>
  <div class="user-documents-tab">
    <DocumentsHubPanel
      title="User Documents"
      subtitle="Manage document assignments, signatures, and compliance records for this user."
      mode="admin"
      :tasks="documentTasks"
      :loading="loading"
      :error="error"
      :view-only="viewOnly"
      :highlight-task-id="highlightTaskId"
      :user-display-name="displayUserName"
      :user-role-label="userRoleLabel"
      @refresh="fetchDocumentTasks"
      @action="onHubAction"
      @menu-action="onHubMenuAction"
    >
      <template #header-actions>
        <button type="button" class="doc-hub__btn doc-hub__btn--ghost" :disabled="loading" @click="fetchDocumentTasks()">Refresh</button>
        <template v-if="!viewOnly">
          <button type="button" class="doc-hub__btn doc-hub__btn--ghost" :disabled="downloadingAll || completedDocumentsCount === 0" @click="downloadAllCompleted">Download All ({{ completedDocumentsCount }})</button>
          <button type="button" class="doc-hub__btn doc-hub__btn--primary" @click="showUploadDialog = true">Upload Document</button>
          <button type="button" class="doc-hub__btn doc-hub__btn--ghost" @click="showAssignDialog = true">Assign from Library</button>
        </template>
      </template>
      <template #empty>
        <h3>No documents assigned</h3>
        <p>This user does not have any document assignments yet.</p>
        <div v-if="!viewOnly" class="ud-empty-actions">
          <button type="button" class="doc-hub__btn doc-hub__btn--primary" @click="showUploadDialog = true">Upload Document</button>
          <button type="button" class="doc-hub__btn doc-hub__btn--ghost" @click="showAssignDialog = true">Assign from Library</button>
        </div>
      </template>
    </DocumentsHubPanel>

    <!-- Audit Trail Modal -->
    <DocumentAuditTrailViewer
      v-if="showAuditModal && selectedTaskId"
      :taskId="selectedTaskId"
      @close="showAuditModal = false"
    />

    <!-- User-Specific Document Upload Dialog -->
    <UserSpecificDocumentUploadDialog
      v-if="showUploadDialog"
      :userId="userId"
      @close="showUploadDialog = false"
      @uploaded="handleDocumentUploaded"
    />

    <!-- Document Assignment Dialog -->
    <DocumentAssignmentDialog
      v-if="showAssignDialog && selectedTemplate"
      :template="selectedTemplate"
      :preSelectedUserId="userId"
      @close="showAssignDialog = false; selectedTemplate = null"
      @assigned="handleDocumentAssigned"
    />

    <!-- Edit Due Date Modal -->
    <div v-if="showEditDueDateModal && editingTask" class="modal-overlay" @click="closeEditDueDateModal">
      <div class="modal-content" @click.stop>
        <h2>Edit Due Date</h2>
        <form @submit.prevent="saveDueDate">
          <div class="form-group">
            <label>Document</label>
            <input type="text" :value="editingTask.title" readonly class="form-input" />
          </div>
          <div class="form-group">
            <label>Current Due Date</label>
            <input 
              type="text" 
              :value="editingTask.due_date ? formatDate(editingTask.due_date) : 'No due date'" 
              readonly 
              class="form-input" 
            />
          </div>
          <div class="form-group">
            <label>New Due Date *</label>
            <input 
              v-model="newDueDate" 
              type="datetime-local" 
              required 
              class="form-input"
              :min="new Date().toISOString().slice(0, 16)"
            />
          </div>
          <div class="form-actions">
            <button type="button" @click="closeEditDueDateModal" class="btn btn-secondary">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="savingDueDate">
              {{ savingDueDate ? 'Saving...' : 'Save' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Template Selection Dialog -->
    <div v-if="showAssignDialog && !selectedTemplate" class="modal-overlay" @click="showAssignDialog = false">
      <div class="modal-content large" @click.stop>
        <h2>Select Document to Assign</h2>
        
        <!-- Sorting and Filtering Controls -->
        <div v-if="!loadingTemplates && availableTemplates.length > 0" class="template-filters" style="margin-bottom: 20px; display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
          <div style="flex: 1; min-width: 200px;">
            <label style="display: block; margin-bottom: 4px; font-size: 12px; font-weight: 500;">Search</label>
            <input 
              v-model="templateSearchQuery" 
              @input="applyTemplateFilters" 
              type="text" 
              placeholder="Search documents..." 
              style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 6px; font-size: 14px;"
            />
          </div>
          <div style="flex: 1; min-width: 180px;">
            <label style="display: block; margin-bottom: 4px; font-size: 12px; font-weight: 500;">Sort By</label>
            <select v-model="templateSortBy" @change="applyTemplateFilters" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 6px; font-size: 14px;">
              <option value="name">Name (A-Z)</option>
              <option value="-name">Name (Z-A)</option>
              <option value="document_type">Document Type</option>
              <option value="-created_at">Date (Newest)</option>
              <option value="created_at">Date (Oldest)</option>
            </select>
          </div>
          <div style="flex: 1; min-width: 180px;">
            <label style="display: block; margin-bottom: 4px; font-size: 12px; font-weight: 500;">Filter by Type</label>
            <select v-model="templateFilterType" @change="applyTemplateFilters" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 6px; font-size: 14px;">
              <option value="all">All Types</option>
              <option value="acknowledgment">Acknowledgment</option>
              <option value="authorization">Authorization</option>
              <option value="agreement">Agreement</option>
              <option value="audio_recording_consent">Audio Recording Consent</option>
              <option value="hipaa_security">HIPAA Security</option>
              <option value="compliance">Compliance</option>
              <option value="disclosure">Disclosure</option>
              <option value="consent">Consent</option>
              <option value="school">School</option>
              <option value="school_roi">School ROI</option>
              <option value="administrative">Administrative</option>
            </select>
          </div>
          <div style="flex: 1; min-width: 180px;">
            <label style="display: block; margin-bottom: 4px; font-size: 12px; font-weight: 500;">Filter by Agency</label>
            <select v-model="templateFilterAgency" @change="applyTemplateFilters" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 6px; font-size: 14px;">
              <option value="all">All Agencies</option>
              <option value="null">Platform Templates</option>
              <option v-for="agency in availableAgenciesForFilter" :key="agency.id" :value="agency.id">
                {{ agency.name }}
              </option>
            </select>
          </div>
        </div>
        
        <div v-if="loadingTemplates" class="loading">Loading templates...</div>
        <div v-else-if="error && filteredTemplates.length === 0 && availableTemplates.length === 0" class="error-message" style="margin: 16px 0; padding: 12px; background: #f8d7da; border-radius: 8px; color: #721c24;">
          {{ error }}
        </div>
        <div v-else-if="filteredTemplates.length === 0" class="empty-state">
          <p v-if="availableTemplates.length === 0">No document templates available.</p>
          <p v-else>No documents match your filters.</p>
          <p style="font-size: 12px; color: var(--text-secondary); margin-top: 8px;">
            Make sure you have created document templates in the Documents Library.
          </p>
        </div>
        <div v-else class="template-list" style="max-height: 400px; overflow-y: auto;">
          <div
            v-for="template in filteredTemplates"
            :key="template.id"
            class="template-item"
            @click="selectTemplate(template)"
            style="cursor: pointer; padding: 12px; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 8px; transition: all 0.2s;"
            @mouseenter="$event.currentTarget.style.backgroundColor = 'var(--bg-secondary)'"
            @mouseleave="$event.currentTarget.style.backgroundColor = 'transparent'"
          >
            <h3 style="margin: 0 0 4px 0; font-size: 16px; font-weight: 600;">{{ template.name }}</h3>
            <p style="margin: 0 0 8px 0; font-size: 13px; color: var(--text-secondary);">{{ template.description || 'No description' }}</p>
            <div class="template-badges" style="display: flex; gap: 6px; flex-wrap: wrap;">
              <span class="badge" style="padding: 4px 8px; border-radius: 4px; font-size: 11px; background: var(--bg-secondary);">{{ template.template_type.toUpperCase() }}</span>
              <span v-if="template.document_type" class="badge badge-primary" style="padding: 4px 8px; border-radius: 4px; font-size: 11px; background: var(--primary); color: white;">
                {{ formatDocumentType(template.document_type) }}
              </span>
              <span v-if="template.agency_id === null" class="badge" style="padding: 4px 8px; border-radius: 4px; font-size: 11px; background: var(--bg-secondary);">Platform</span>
            </div>
          </div>
        </div>
        <div class="form-actions" style="margin-top: 20px; display: flex; justify-content: flex-end; gap: 12px;">
          <button @click="showAssignDialog = false" class="btn btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../services/api';
import { useDocumentsStore } from '../../store/documents';
import DocumentAuditTrailViewer from '../documents/DocumentAuditTrailViewer.vue';
import DocumentAssignmentDialog from '../documents/DocumentAssignmentDialog.vue';
import UserSpecificDocumentUploadDialog from '../documents/UserSpecificDocumentUploadDialog.vue';
import DocumentsHubPanel from '../documents/DocumentsHubPanel.vue';
import { computeDocumentStats } from '../../utils/documentUiHelpers';

const props = defineProps({
  userId: {
    type: Number,
    required: true
  },
  highlightTaskId: {
    type: Number,
    default: null
  },
  viewOnly: {
    type: Boolean,
    default: false
  },
  userDisplayName: {
    type: String,
    default: ''
  },
  userRoleLabel: {
    type: String,
    default: ''
  }
});

const router = useRouter();
const documentsStore = useDocumentsStore();

const loading = ref(true);
const error = ref('');
const documentTasks = ref([]);
const signedDocuments = ref([]);
const assignedUserName = ref('');
const showAuditModal = ref(false);
const selectedTaskId = ref(null);
const showAssignDialog = ref(false);
const showUploadDialog = ref(false);
const selectedTemplate = ref(null);
const availableTemplates = ref([]);
const loadingTemplates = ref(false);
const templateSearchQuery = ref('');
const templateSortBy = ref('name');
const templateFilterType = ref('all');
const templateFilterAgency = ref('all');
const availableAgenciesForFilter = ref([]);
const downloadingAll = ref(false);
const showEditDueDateModal = ref(false);
const editingTask = ref(null);
const newDueDate = ref('');
const savingDueDate = ref(false);
const displayUserName = computed(
  () => props.userDisplayName?.trim() || assignedUserName.value || ''
);

const completedDocumentsCount = computed(() => computeDocumentStats(documentTasks.value).completed);

const onHubAction = ({ type, task }) => {
  const id = task.id;
  if (type === 'sign') viewDocument(id);
  else if (type === 'view') {
    if (task.status === 'completed' && task.document_action_type === 'signature') viewSignedDocument(id);
    else if (task.status === 'completed') viewAcknowledgment(id);
    else viewDocument(id);
  } else if (type === 'download') {
    if (task.document_action_type === 'signature') downloadSigned(id);
    else downloadReviewDocument(id);
  }
};

const onHubMenuAction = ({ type, task }) => {
  const id = task.id;
  if (type === 'edit-due') editDueDate(task);
  else if (type === 'audit') viewAuditTrail(id);
  else if (type === 'mark-complete') markComplete(id);
  else if (type === 'reset') resetDocument(id);
  else if (type === 'remove') removeTask(id);
};

// Computed property for filtered and sorted templates
const filteredTemplates = computed(() => {
  let filtered = [...availableTemplates.value];
  
  // Filter by search query
  if (templateSearchQuery.value) {
    const query = templateSearchQuery.value.toLowerCase();
    filtered = filtered.filter(t => 
      t.name.toLowerCase().includes(query) || 
      (t.description && t.description.toLowerCase().includes(query))
    );
  }
  
  // Filter by document type
  if (templateFilterType.value !== 'all') {
    filtered = filtered.filter(t => t.document_type === templateFilterType.value);
  }
  
  // Filter by agency
  if (templateFilterAgency.value !== 'all') {
    if (templateFilterAgency.value === 'null') {
      filtered = filtered.filter(t => t.agency_id === null);
    } else {
      const agencyId = parseInt(templateFilterAgency.value);
      filtered = filtered.filter(t => t.agency_id === agencyId);
    }
  }
  
  // Sort
  filtered.sort((a, b) => {
    const sortField = templateSortBy.value.startsWith('-') 
      ? templateSortBy.value.substring(1) 
      : templateSortBy.value;
    const isDesc = templateSortBy.value.startsWith('-');
    
    let aVal, bVal;
    
    if (sortField === 'name') {
      aVal = a.name.toLowerCase();
      bVal = b.name.toLowerCase();
    } else if (sortField === 'document_type') {
      aVal = a.document_type || '';
      bVal = b.document_type || '';
    } else if (sortField === 'created_at') {
      aVal = new Date(a.created_at || 0);
      bVal = new Date(b.created_at || 0);
    } else {
      aVal = a[sortField];
      bVal = b[sortField];
    }
    
    if (aVal < bVal) return isDesc ? 1 : -1;
    if (aVal > bVal) return isDesc ? -1 : 1;
    return 0;
  });
  
  return filtered;
});

const applyTemplateFilters = () => {
  // Filters are applied reactively via computed property
  // This function is called on filter changes but doesn't need to do anything
  // as the computed property handles it automatically
};

const loadAgenciesForFilter = async () => {
  try {
    const response = await api.get('/agencies');
    availableAgenciesForFilter.value = response.data || [];
  } catch (err) {
    console.error('Failed to load agencies for filter:', err);
    availableAgenciesForFilter.value = [];
  }
};

const fetchDocumentTasks = async () => {
  try {
    loading.value = true;
    error.value = '';
    
    if (!props.userId) {
      console.error('fetchDocumentTasks: userId is not provided');
      error.value = 'User ID is required';
      loading.value = false;
      return;
    }
    
    // Use admin endpoint to get tasks for the specific user
    const userIdNum = parseInt(props.userId);
    if (isNaN(userIdNum)) {
      console.error('fetchDocumentTasks: Invalid userId', props.userId);
      error.value = 'Invalid user ID';
      loading.value = false;
      return;
    }
    
    console.log('fetchDocumentTasks: Fetching tasks for user', userIdNum);
    console.log('fetchDocumentTasks: API endpoint will be /tasks/all?taskType=document&assignedToUserId=' + userIdNum);
    
    let response;
    try {
      const url = `/tasks/all?taskType=document&assignedToUserId=${userIdNum}`;
      console.log('fetchDocumentTasks: Making API call to:', url);
      response = await api.get('/tasks/all', {
        params: {
          taskType: 'document',
          assignedToUserId: userIdNum
        }
      });
      console.log('✅ fetchDocumentTasks: API call completed, status:', response.status);
      console.log('fetchDocumentTasks: Response object keys:', Object.keys(response));
    } catch (apiError) {
      console.error('❌ fetchDocumentTasks: API call failed:', apiError);
      console.error('fetchDocumentTasks: Error response:', apiError.response?.data);
      console.error('fetchDocumentTasks: Error status:', apiError.response?.status);
      console.error('fetchDocumentTasks: Error message:', apiError.message);
      if (apiError.response?.status === 403) {
        error.value = 'Access denied. You may not have permission to view tasks for this user.';
      } else if (apiError.response?.status === 401) {
        error.value = 'Authentication failed. Please log in again.';
      }
      throw apiError; // Re-throw to be caught by outer catch
    }
    
    console.log('fetchDocumentTasks: Response received', response);
    console.log('fetchDocumentTasks: Response status:', response.status);
    console.log('fetchDocumentTasks: Response headers:', response.headers);
    console.log('fetchDocumentTasks: Response data type', typeof response.data, 'Is array?', Array.isArray(response.data));
    console.log('fetchDocumentTasks: Response data', JSON.stringify(response.data, null, 2));
    
    // Handle array response
    let tasks = [];
    if (Array.isArray(response.data)) {
      tasks = response.data;
      console.log(`✅ fetchDocumentTasks: Found ${tasks.length} tasks in array`);
    } else if (response.data && Array.isArray(response.data.data)) {
      tasks = response.data.data;
      console.log(`✅ fetchDocumentTasks: Found ${tasks.length} tasks in response.data.data`);
    } else if (response.data && response.data.tasks && Array.isArray(response.data.tasks)) {
      tasks = response.data.tasks;
      console.log(`✅ fetchDocumentTasks: Found ${tasks.length} tasks in response.data.tasks`);
    } else if (response.data && typeof response.data === 'object') {
      // Maybe it's a single task object? Convert to array
      console.warn('fetchDocumentTasks: Response is an object, not an array:', response.data);
      tasks = [];
    } else {
      console.warn('❌ fetchDocumentTasks: Unexpected response format', response.data);
      console.warn('fetchDocumentTasks: Response data type:', typeof response.data);
      tasks = [];
    }
    
    documentTasks.value = tasks;
    console.log(`fetchDocumentTasks: Set documentTasks.value to ${tasks.length} tasks`);
    
    if (tasks.length === 0) {
      console.warn('⚠️ fetchDocumentTasks: No tasks found! This might indicate:');
      console.warn('   1. No tasks exist for this user');
      console.warn('   2. API query is not working correctly');
      console.warn('   3. Authentication/permission issue');
      console.warn('   4. Response format issue');
    }
    
    // Clear signed documents array before repopulating
    signedDocuments.value = [];
    
    // Fetch signed documents/acknowledgments for completed tasks
    // Do this in parallel and don't let errors prevent tasks from showing
    const signedDocPromises = documentTasks.value
      .filter(task => task.status === 'completed')
      .map(async (task) => {
        try {
          if (task.document_action_type === 'signature') {
            const signedRes = await api.get(`/document-signing/${task.id}`);
            if (signedRes.data?.signedDocument) {
              signedDocuments.value.push({
                taskId: task.id,
                signedDocument: signedRes.data.signedDocument
              });
            }
          } else if (task.document_action_type === 'review') {
            const ackSummaryRes = await api.get(`/document-acknowledgment/${task.id}/summary`);
            if (ackSummaryRes.data?.acknowledged && ackSummaryRes.data?.acknowledgment) {
              signedDocuments.value.push({
                taskId: task.id,
                acknowledgment: ackSummaryRes.data.acknowledgment
              });
            }
          }
        } catch (err) {
          // Silently ignore - task might not have signed document/acknowledgment yet
          // This is normal for newly assigned tasks
          console.log(`No signed document/acknowledgment found for task ${task.id} (this is normal for new tasks)`);
        }
      });
    
    // Wait for all promises but don't fail if some error
    await Promise.allSettled(signedDocPromises);
    
    console.log(`fetchDocumentTasks: Completed successfully. Total tasks: ${documentTasks.value.length}`);
  } catch (err) {
    console.error('fetchDocumentTasks: Error fetching tasks', err);
    console.error('fetchDocumentTasks: Error details', {
      message: err.message,
      response: err.response?.data,
      status: err.response?.status,
      stack: err.stack
    });
    
    const errorMessage = err.response?.data?.error?.message || err.message || 'Failed to load document tasks';
    
    // Only set error if it's not a "not found" type error (which is normal for empty lists)
    if (!errorMessage.toLowerCase().includes('not found') && err.response?.status !== 404) {
      error.value = errorMessage;
      console.error('fetchDocumentTasks: Setting error message', errorMessage);
    } else {
      // Clear error and show empty state instead
      error.value = '';
      documentTasks.value = [];
      console.log('fetchDocumentTasks: No tasks found (404 or not found) - showing empty state');
    }
  } finally {
    loading.value = false;
    console.log('fetchDocumentTasks: Loading set to false. Final state:', {
      tasksCount: documentTasks.value.length,
      hasError: !!error.value,
      errorMessage: error.value
    });
  }
};

const removeTask = async (taskId) => {
  if (!taskId) return;
  const ok = confirm('Remove this document assignment from the user? This deletes the task and any generated document copies tied to it.');
  if (!ok) return;
  try {
    await api.delete(`/tasks/${taskId}`);
    await fetchDocumentTasks();
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to remove document task');
  }
};

const signedDocument = (taskId) => {
  return signedDocuments.value.find(sd => sd.taskId === taskId && sd.signedDocument);
};

const acknowledgment = (taskId) => {
  return signedDocuments.value.find(sd => sd.taskId === taskId && sd.acknowledgment);
};

const getStatusLabel = (task) => {
  if (task.status === 'completed') {
    return task.document_action_type === 'review' ? 'Acknowledged' : 'Signed';
  }
  if (task.status === 'overridden') return 'Overridden';
  if (task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed') {
    return 'Overdue';
  }
  if (task.status === 'in_progress') return 'In Progress';
  return 'Pending';
};

const getStatusBadgeClass = (task) => {
  if (task.status === 'completed') return 'badge-success';
  if (task.status === 'overridden') return 'badge-warning';
  if (task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed') {
    return 'badge-danger';
  }
  if (task.status === 'in_progress') return 'badge-info';
  return 'badge-secondary';
};

const formatDate = (dateString) => {
  return new Date(dateString).toLocaleString();
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
    school: 'School',
    school_roi: 'School ROI',
    administrative: 'Administrative'
  };
  return types[type] || type;
};

const getDocumentType = (task) => {
  // Get document type from task metadata (populated in fetchDocumentTasks)
  if (task.metadata && task.metadata.documentType) {
    return task.metadata.documentType;
  }
  return null;
};

const viewDocument = async (taskId) => {
  // Navigate to signing workflow for incomplete documents
  router.push(`/tasks/documents/${taskId}/sign`);
};

const viewSignedDocument = async (taskId) => {
  // Fetch and open signed document in new tab for viewing
  try {
    const response = await api.get(`/document-signing/${taskId}/view`, {
      responseType: 'blob'
    });
    const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
    window.open(url, '_blank');
    // Clean up the URL after a delay
    setTimeout(() => window.URL.revokeObjectURL(url), 100);
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to retrieve document');
  }
};

const downloadReviewDocument = async (taskId) => {
  try {
    const task = documentTasks.value.find((t) => t.id === taskId);
    const title = safeFilename(task?.title || 'document');
    const assignee = safeFilename(assignedUserName.value || `user-${props.userId}`);
    const dateLabel = formatDateForFilename(task?.completed_at || task?.updated_at);
    const filename = `${title} - ${assignee} - ${dateLabel}.pdf`;
    const response = await api.get(`/document-acknowledgment/${taskId}/view`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to download document');
  }
};

const downloadSigned = async (taskId) => {
  try {
    const task = documentTasks.value.find((t) => t.id === taskId);
    const title = safeFilename(task?.title || task?.name || 'document');
    const assignee = safeFilename(assignedUserName.value || `user-${props.userId}`);
    const dateLabel = formatDateForFilename(task?.completed_at || task?.updated_at || task?.created_at);
    const filename = `${title} - ${assignee} - ${dateLabel}.pdf`;
    await documentsStore.downloadSignedDocument(taskId, filename);
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to download document');
  }
};

const formatDateForFilename = (dateString) => {
  const d = dateString ? new Date(dateString) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
};

const safeFilename = (name) => {
  const base = String(name || 'document')
    .replace(/[^\w\s\-().]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return base || 'document';
};

const fetchAssignedUserName = async () => {
  try {
    const res = await api.get(`/users/${props.userId}`);
    const first = res.data?.first_name || '';
    const last = res.data?.last_name || '';
    const email = res.data?.email || '';
    const full = `${first} ${last}`.trim();
    assignedUserName.value = full || email || `user-${props.userId}`;
  } catch (err) {
    assignedUserName.value = `user-${props.userId}`;
  }
};

const viewAuditTrail = (taskId) => {
  selectedTaskId.value = taskId;
  showAuditModal.value = true;
};

const viewAcknowledgment = async (taskId) => {
  try {
    // First, get the acknowledgment details
    const ackResponse = await api.get(`/document-acknowledgment/${taskId}`);
    const ack = ackResponse.data;
    
    // Then, view the document PDF
    try {
      const docResponse = await api.get(`/document-acknowledgment/${taskId}/view`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([docResponse.data], { type: 'application/pdf' }));
      window.open(url, '_blank');
      // Clean up the URL after a delay
      setTimeout(() => window.URL.revokeObjectURL(url), 100);
      
      // Show acknowledgment details in a brief message
      alert(`Document Acknowledged\n\nAcknowledged: ${new Date(ack.acknowledged_at).toLocaleString()}\nIP: ${ack.ip_address || 'N/A'}`);
    } catch (docErr) {
      // If document view fails, still show acknowledgment details
      alert(`Acknowledged: ${new Date(ack.acknowledged_at).toLocaleString()}\nIP: ${ack.ip_address || 'N/A'}\n\nNote: Could not load document PDF.`);
    }
  } catch (err) {
    alert('Failed to load acknowledgment details');
  }
};

const resetDocument = async (taskId) => {
  if (!confirm('Are you sure you want to reset this document task? This will clear the signature.')) {
    return;
  }
  try {
    await api.put(`/tasks/${taskId}/override`);
    await fetchDocumentTasks();
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to reset document');
  }
};

const markComplete = async (taskId) => {
  try {
    await api.put(`/tasks/${taskId}/override`);
    await fetchDocumentTasks();
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to mark complete');
  }
};

const editDueDate = (task) => {
  editingTask.value = task;
  // Convert due_date to datetime-local format (YYYY-MM-DDTHH:mm)
  if (task.due_date) {
    const date = new Date(task.due_date);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    newDueDate.value = `${year}-${month}-${day}T${hours}:${minutes}`;
  } else {
    // Default to 7 days from now if no due date
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 7);
    const year = defaultDate.getFullYear();
    const month = String(defaultDate.getMonth() + 1).padStart(2, '0');
    const day = String(defaultDate.getDate()).padStart(2, '0');
    const hours = String(defaultDate.getHours()).padStart(2, '0');
    const minutes = String(defaultDate.getMinutes()).padStart(2, '0');
    newDueDate.value = `${year}-${month}-${day}T${hours}:${minutes}`;
  }
  showEditDueDateModal.value = true;
};

const closeEditDueDateModal = () => {
  showEditDueDateModal.value = false;
  editingTask.value = null;
  newDueDate.value = '';
};

const saveDueDate = async () => {
  if (!editingTask.value || !newDueDate.value) {
    return;
  }
  
  try {
    savingDueDate.value = true;
    
    // Convert datetime-local to ISO string
    const date = new Date(newDueDate.value);
    const isoString = date.toISOString();
    
    await api.put(`/tasks/${editingTask.value.id}/due-date`, {
      dueDate: isoString
    });
    
    await fetchDocumentTasks();
    closeEditDueDateModal();
    alert('Due date updated successfully');
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to update due date');
  } finally {
    savingDueDate.value = false;
  }
};

const loadTemplates = async () => {
  try {
    loadingTemplates.value = true;
    error.value = '';
    const response = await api.get('/document-templates', {
      params: {
        isUserSpecific: false, // Only show library documents, not user-specific
        limit: 100, // Get more templates for selection
        isActive: true
      }
    });
    
    // Handle paginated response
    let templates = [];
    if (response.data && response.data.data) {
      // Paginated response
      templates = response.data.data;
    } else if (Array.isArray(response.data)) {
      // Array response
      templates = response.data;
    } else {
      templates = [];
    }
    
    // Filter: active and not user-specific
    availableTemplates.value = templates.filter(t => {
      return t.is_active !== false && !t.is_user_specific;
    });
    
    if (availableTemplates.value.length === 0 && templates.length > 0) {
      console.warn('All templates were filtered out. Available templates:', templates);
    }
  } catch (err) {
    console.error('Failed to load templates:', err);
    error.value = err.response?.data?.error?.message || 'Failed to load document templates';
    availableTemplates.value = [];
  } finally {
    loadingTemplates.value = false;
  }
};

const selectTemplate = async (template) => {
  if (!template || !template.id) {
    error.value = 'Invalid template selected';
    return;
  }
  
  // Verify template exists and is active
  try {
    error.value = '';
    const response = await api.get(`/document-templates/${template.id}`);
    if (!response.data) {
      error.value = 'Template not found';
      return;
    }
    if (response.data.is_active === false) {
      error.value = 'Template is inactive';
      return;
    }
    selectedTemplate.value = response.data;
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load template details';
    console.error('Error loading template:', err);
  }
};

const handleDocumentAssigned = async () => {
  console.log('handleDocumentAssigned: Document assignment completed, refreshing...');
  showAssignDialog.value = false;
  selectedTemplate.value = null;
  // Clear any previous errors
  error.value = '';
  loading.value = true;
  
  // Add a delay to ensure database transaction is committed
  console.log('handleDocumentAssigned: Waiting 2 seconds for database commit...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Force refresh with retry logic
  let retries = 5;
  let lastError = null;
  while (retries > 0) {
    try {
      console.log(`handleDocumentAssigned: Attempting to fetch tasks (${6 - retries}/5)...`);
      await fetchDocumentTasks();
      // If we got here, the fetch succeeded
      console.log(`handleDocumentAssigned: Successfully fetched ${documentTasks.value.length} tasks`);
      // Check if we got tasks
      if (documentTasks.value.length > 0) {
        console.log(`handleDocumentAssigned: Found ${documentTasks.value.length} tasks!`);
        break;
      }
      
      // If no tasks found and we have retries left, wait and retry
      if (retries > 1) {
        console.log('handleDocumentAssigned: No tasks found yet, waiting longer and retrying...');
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait longer
        retries--;
        continue;
      } else {
        // Last retry failed, break and show error
        console.warn('handleDocumentAssigned: No tasks found after all retries');
        break;
      }
    } catch (err) {
      lastError = err;
      retries--;
      console.error(`handleDocumentAssigned: Error fetching tasks (${retries} retries left):`, err);
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  
  // Clear loading state
  loading.value = false;
  
  if (documentTasks.value.length === 0) {
    if (lastError) {
      console.error('handleDocumentAssigned: Failed to fetch tasks after all retries:', lastError);
      error.value = `Document assigned but failed to refresh list: ${lastError.message || 'Unknown error'}. Please refresh the page manually.`;
    } else {
      console.warn('handleDocumentAssigned: No tasks found after assignment. This might be a query issue.');
      error.value = 'Document assignment succeeded, but tasks are not showing. This may be a query issue. Please refresh the page or check the console for details.';
    }
  } else {
    // Success! Clear any previous errors
    error.value = '';
    console.log(`handleDocumentAssigned: Successfully refreshed! Found ${documentTasks.value.length} tasks.`);
  }
};

const handleDocumentUploaded = async () => {
  showUploadDialog.value = false;
  // Refresh the document tasks list
  await fetchDocumentTasks();
};

const downloadAllCompleted = async () => {
  if (completedDocumentsCount.value === 0) {
    alert('No completed documents to download');
    return;
  }
  
  try {
    downloadingAll.value = true;
    
    // Get all completed document tasks
    const completedTasks = documentTasks.value.filter(task => task.status === 'completed');
    
    // For each completed task, download the document
    const downloadPromises = completedTasks.map(async (task) => {
      try {
        if (task.document_action_type === 'signature') {
          // Download signed document
          const response = await api.get(`/document-signing/${task.id}/download`, {
            responseType: 'blob'
          });
          const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
          const link = document.createElement('a');
          link.href = url;
          link.download = `${task.title || 'document'}-${task.id}.pdf`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
        } else if (task.document_action_type === 'review') {
          // Download acknowledged document template
          const response = await api.get(`/document-acknowledgment/${task.id}/view`, {
            responseType: 'blob'
          });
          const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
          const link = document.createElement('a');
          link.href = url;
          link.download = `${task.title || 'document'}-${task.id}.pdf`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
        }
      } catch (err) {
        console.error(`Failed to download document for task ${task.id}:`, err);
      }
    });
    
    // Wait a bit between downloads to avoid browser blocking
    for (let i = 0; i < downloadPromises.length; i++) {
      await downloadPromises[i];
      if (i < downloadPromises.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay between downloads
      }
    }
    
    alert(`Downloaded ${completedTasks.length} completed document(s)`);
  } catch (err) {
    alert('Failed to download all documents. Some documents may have been downloaded.');
    console.error('Error downloading all documents:', err);
  } finally {
    downloadingAll.value = false;
  }
};

onMounted(() => {
  console.log('UserDocumentsTab: Component mounted, userId:', props.userId);
  fetchAssignedUserName();
  fetchDocumentTasks().then(() => {
    // If highlightTaskId is provided, scroll to it after tasks are loaded
    if (props.highlightTaskId) {
      setTimeout(() => {
        const row = document.querySelector('.doc-hub__row--highlight');
        if (row) {
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);
    }
  });
  loadTemplates();
  loadAgenciesForFilter();
});

// Watch for changes to highlightTaskId
watch(() => props.highlightTaskId, (newTaskId) => {
  if (newTaskId && documentTasks.value.length > 0) {
    setTimeout(() => {
      const row = document.querySelector('.doc-hub__row--highlight');
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  }
});

// Watch for userId changes and refetch
watch(() => props.userId, (newUserId, oldUserId) => {
  console.log('UserDocumentsTab: userId changed from', oldUserId, 'to', newUserId);
  if (newUserId && newUserId !== oldUserId) {
    fetchAssignedUserName();
    fetchDocumentTasks();
  }
});
</script>

<style scoped>
.user-documents-tab {
  margin: 0;
  padding: 0;
}
.ud-empty-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 16px;
  flex-wrap: wrap;
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
  padding: 32px;
  border-radius: 12px;
  max-width: 600px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
}
.modal-content.large {
  max-width: 800px;
}
.form-group { margin-bottom: 16px; }
.form-group label { display: block; margin-bottom: 6px; font-weight: 500; font-size: 14px; }
.form-input { width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px; box-sizing: border-box; }
.form-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px; }
</style>
