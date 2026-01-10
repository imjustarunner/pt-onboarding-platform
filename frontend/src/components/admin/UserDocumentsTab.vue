<template>
  <div class="user-documents-tab">
    <div class="header-section">
      <h2>Document Assignments</h2>
      <div class="header-actions">
        <button @click="fetchDocumentTasks()" class="btn btn-secondary btn-sm" :disabled="loading" title="Refresh document list">
          {{ loading ? 'Refreshing...' : '🔄 Refresh' }}
        </button>
        <template v-if="!viewOnly">
          <button @click="downloadAllCompleted" class="btn btn-secondary btn-sm" :disabled="downloadingAll || completedDocumentsCount === 0">
            {{ downloadingAll ? 'Downloading...' : `Download All (${completedDocumentsCount})` }}
          </button>
          <button @click="showUploadDialog = true" class="btn btn-primary btn-sm">
            Upload & Assign
          </button>
          <button @click="showAssignDialog = true" class="btn btn-secondary btn-sm">
            Assign from Library
          </button>
        </template>
      </div>
    </div>

    
    <div v-if="loading" class="loading">Loading documents...</div>
    <div v-if="error && !loading" class="error" style="margin-bottom: 16px; padding: 12px; background: #fee; border: 1px solid #fcc; border-radius: 4px;">
      <strong>Error:</strong> {{ error }}
    </div>
    <div v-if="!loading && !error && documentTasks.length === 0" class="empty-state" style="padding: 40px; text-align: center; color: #666;">
      <p style="font-size: 16px;">No documents assigned to this user.</p>
      <p style="font-size: 14px; color: #999; margin-top: 8px;">User ID: {{ userId }}</p>
    </div>
    <div v-if="!loading && documentTasks.length > 0" class="documents-list">
      <table class="documents-table">
        <thead>
          <tr>
            <th>Document</th>
            <th>Status</th>
            <th>Due Date</th>
            <th>Signed At</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr 
            v-for="task in documentTasks" 
            :key="task.id"
            :class="{ 'highlighted-task': highlightTaskId === task.id }"
            :ref="highlightTaskId === task.id ? 'highlightedTaskRow' : null"
          >
            <td>
              <strong>{{ task.title }}</strong>
              <br>
              <small class="text-muted">{{ task.description || 'No description' }}</small>
              <br>
              <span v-if="task.document_action_type" :class="['badge', task.document_action_type === 'signature' ? 'badge-info' : 'badge-secondary']" style="margin-top: 4px; font-size: 11px;">
                {{ task.document_action_type === 'signature' ? 'Signature Required' : 'Review Only' }}
              </span>
            </td>
            <td>
              <span :class="['badge', getStatusBadgeClass(task)]">
                {{ getStatusLabel(task) }}
              </span>
            </td>
            <td>
              <span v-if="task.due_date">{{ formatDate(task.due_date) }}</span>
              <span v-else class="text-muted">No due date</span>
            </td>
            <td>
              <span v-if="task.completed_at">{{ formatDate(task.completed_at) }}</span>
              <span v-else class="text-muted">Not signed</span>
            </td>
            <td>
              <div v-if="!viewOnly" class="action-buttons">
                <button
                  v-if="task.status !== 'completed'"
                  @click="viewDocument(task.id)"
                  class="btn btn-sm btn-primary"
                >
                  {{ task.document_action_type === 'review' ? 'View & Review' : 'View & Sign' }}
                </button>
                <button
                  v-if="task.status === 'completed' && task.document_action_type === 'signature'"
                  @click="viewSignedDocument(task.id)"
                  class="btn btn-sm btn-primary"
                >
                  View
                </button>
                <button
                  v-if="signedDocument(task.id) && task.document_action_type === 'signature'"
                  @click="downloadSigned(task.id)"
                  class="btn btn-sm btn-secondary"
                >
                  Download
                </button>
                <button
                  v-if="signedDocument(task.id) && task.document_action_type === 'signature'"
                  @click="viewAuditTrail(task.id)"
                  class="btn btn-sm btn-secondary"
                >
                  Audit Trail
                </button>
                <button
                  v-if="task.status === 'completed' && task.document_action_type === 'review'"
                  @click="viewAcknowledgment(task.id)"
                  class="btn btn-sm btn-secondary"
                >
                  View Acknowledgment
                </button>
                <button
                  @click="editDueDate(task)"
                  class="btn btn-sm btn-secondary"
                  title="Edit due date"
                >
                  Edit Due Date
                </button>
                <button
                  @click="resetDocument(task.id)"
                  class="btn btn-sm btn-danger"
                >
                  Reset
                </button>
                <button
                  v-if="task.status !== 'completed'"
                  @click="markComplete(task.id)"
                  class="btn btn-sm btn-primary"
                >
                  Mark Complete
                </button>
              </div>
              <span v-else class="text-muted" style="font-size: 12px;">View Only</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

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
              <option value="compliance">Compliance</option>
              <option value="disclosure">Disclosure</option>
              <option value="consent">Consent</option>
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
  }
});

const router = useRouter();
const documentsStore = useDocumentsStore();

const loading = ref(true);
const error = ref('');
const documentTasks = ref([]);
const signedDocuments = ref([]);
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

const completedDocumentsCount = computed(() => {
  return documentTasks.value.filter(task => task.status === 'completed').length;
});

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
            const ackRes = await api.get(`/document-acknowledgment/${task.id}`);
            if (ackRes.data) {
              signedDocuments.value.push({
                taskId: task.id,
                acknowledgment: ackRes.data
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
    compliance: 'Compliance',
    disclosure: 'Disclosure',
    consent: 'Consent',
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

const downloadSigned = async (taskId) => {
  try {
    await documentsStore.downloadSignedDocument(taskId);
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to download document');
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
  fetchDocumentTasks().then(() => {
    // If highlightTaskId is provided, scroll to it after tasks are loaded
    if (props.highlightTaskId) {
      setTimeout(() => {
        const row = document.querySelector(`tr.highlighted-task`);
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
      const row = document.querySelector(`tr.highlighted-task`);
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
    fetchDocumentTasks();
  }
});
</script>

<style scoped>
.highlighted-task {
  background-color: #fff3cd !important;
  border: 2px solid #ffc107 !important;
  animation: highlight-pulse 2s ease-in-out;
}

@keyframes highlight-pulse {
  0%, 100% {
    background-color: #fff3cd;
  }
  50% {
    background-color: #ffe69c;
  }
}
.documents-table {
  width: 100%;
  border-collapse: collapse;
  background: white;
  border-radius: 8px;
  overflow: hidden;
}

.documents-table th,
.documents-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid var(--border);
}

.documents-table th {
  background: #f8f9fa;
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
}

.action-buttons {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
}

.action-buttons .btn-sm {
  padding: 4px 10px;
  font-size: 12px;
  white-space: nowrap;
  width: auto;
  min-width: auto;
  flex-shrink: 0;
}

.btn-danger {
  background-color: #dc3545;
  color: white;
  border: none;
}

.btn-danger:hover {
  background-color: #c82333;
}

.text-muted {
  color: var(--text-secondary);
  font-size: 12px;
}

.badge-danger {
  background-color: #dc3545;
  color: white;
}

.header-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.header-section h2 {
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.header-actions .btn-sm {
  padding: 4px 10px;
  font-size: 12px;
  white-space: nowrap;
  width: auto;
  min-width: auto;
  flex-shrink: 0;
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
  max-height: 80vh;
  overflow-y: auto;
}

.template-list {
  max-height: 400px;
  overflow-y: auto;
  margin: 16px 0;
}

.template-item {
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 12px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.template-item:hover {
  background-color: #f8f9fa;
}

.template-item h3 {
  margin: 0 0 8px 0;
  color: var(--text-primary);
}

.template-item p {
  margin: 0 0 8px 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.template-badges {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.template-item .badge {
  display: inline-block;
  padding: 4px 8px;
  background-color: var(--primary);
  color: white;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.badge-primary {
  background-color: #007bff;
  color: white;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
  font-size: 14px;
  color: var(--text-primary);
}

.form-group input[readonly] {
  background-color: #f5f5f5;
  cursor: not-allowed;
}

.form-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
  box-sizing: border-box;
}

.form-input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.1);
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}
</style>

