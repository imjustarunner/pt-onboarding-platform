<template>
  <div class="documents-tab">
    <div v-if="loading" class="loading">Loading documents...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    
    <div v-else>
      <div v-if="sortedDocuments.length === 0" class="empty-state">
        <p>No documents assigned.</p>
      </div>
      
      <div v-else>
        <div class="sort-controls">
          <label for="sort-select">Sort by:</label>
          <select id="sort-select" v-model="sortOption" class="sort-select">
            <option value="unfinished">Unfinished First</option>
            <option value="alphabetical">Alphabetical (A-Z)</option>
            <option value="due-date">Due Date (Earliest First)</option>
            <option value="status">Status</option>
          </select>
        </div>
        
        <div class="documents-list">
        <div
          v-for="document in sortedDocuments"
          :key="document.id"
          class="document-card"
          :class="getStatusClass(document)"
        >
          <div class="document-header">
            <h3>{{ document.title || 'Document' }}</h3>
            <span :class="['status-badge', getStatusBadgeClass(document.status)]">
              {{ getStatusLabel(document.status, document.document_action_type) }}
            </span>
          </div>
          
          <p v-if="document.description" class="document-description">{{ document.description }}</p>
          
          <div class="document-meta">
            <div v-if="document.due_date" class="meta-item">
              <strong>Due Date:</strong> {{ formatDate(document.due_date) }}
              <span v-if="isOverdue(document.due_date)" class="overdue-indicator">Overdue</span>
            </div>
            <div class="meta-item">
              <strong>Type:</strong> {{ document.document_action_type === 'signature' ? 'Signature Required' : 'Review Required' }}
            </div>
          </div>
          
          <div class="document-actions">
            <button
              v-if="document.status !== 'completed'"
              @click="handleDocumentAction(document)"
              class="btn btn-primary"
            >
              {{ document.document_action_type === 'signature' ? 'Sign Document' : 'Review Document' }}
            </button>
            <template v-if="document.status === 'completed'">
              <button
                @click="viewDocument(document)"
                class="btn btn-secondary"
              >
                View Document
              </button>
              <button
                v-if="document.document_action_type === 'signature'"
                @click="downloadDocument(document.id)"
                class="btn btn-secondary"
              >
                Download
              </button>
            </template>
          </div>
        </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useTasksStore } from '../../store/tasks';
import { useAgencyStore } from '../../store/agency';
import { useDocumentsStore } from '../../store/documents';

const emit = defineEmits(['update-count']);

const router = useRouter();
const authStore = useAuthStore();
const tasksStore = useTasksStore();
const agencyStore = useAgencyStore();
const documentsStore = useDocumentsStore();
const loading = ref(true);
const error = ref('');
const allDocuments = ref([]);
const sortOption = ref('unfinished');

const fetchDocuments = async () => {
  try {
    loading.value = true;
    const userId = authStore.user?.id;
    if (!userId) {
      error.value = 'User not found';
      return;
    }
    
    // Fetch document tasks for the current user (all agencies)
    const response = await api.get('/tasks', {
      params: {
        taskType: 'document'
      }
    });
    
    allDocuments.value = response.data || [];
    
    // Include documents that are:
    // 1. Directly assigned to the user (assigned_to_user_id = userId) - these include platform documents
    // 2. Assigned to the user's current agency (assigned_to_agency_id = currentAgency.id)
    // Platform documents assigned directly to users should always be visible
    updateFilteredDocuments();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load documents';
  } finally {
    loading.value = false;
  }
};

const documents = computed(() => {
  if (!agencyStore.currentAgency) return [];
  // Show documents that are:
  // 1. Directly assigned to the user (regardless of agency_id - includes platform documents)
  // 2. Assigned to the user's current agency
  return allDocuments.value.filter(doc => {
    // If document is directly assigned to user, always show it (includes platform documents)
    if (doc.assigned_to_user_id === authStore.user?.id) {
      return true;
    }
    // Otherwise, only show if assigned to current agency
    return doc.assigned_to_agency_id === agencyStore.currentAgency?.id;
  });
});

const sortedDocuments = computed(() => {
  const docs = [...documents.value];
  
  switch (sortOption.value) {
    case 'unfinished':
      // Sort: overdue > pending/in_progress > completed
      return docs.sort((a, b) => {
        const aIsOverdue = a.due_date && new Date(a.due_date) < new Date() && a.status !== 'completed';
        const bIsOverdue = b.due_date && new Date(b.due_date) < new Date() && b.status !== 'completed';
        
        // Overdue items first
        if (aIsOverdue && !bIsOverdue) return -1;
        if (!aIsOverdue && bIsOverdue) return 1;
        
        // Then incomplete items
        const aIsIncomplete = a.status !== 'completed';
        const bIsIncomplete = b.status !== 'completed';
        if (aIsIncomplete && !bIsIncomplete) return -1;
        if (!aIsIncomplete && bIsIncomplete) return 1;
        
        // Within incomplete, sort by due date
        if (aIsIncomplete && bIsIncomplete) {
          if (a.due_date && b.due_date) {
            return new Date(a.due_date) - new Date(b.due_date);
          }
          if (a.due_date) return -1;
          if (b.due_date) return 1;
        }
        
        return 0;
      });
      
    case 'alphabetical':
      return docs.sort((a, b) => {
        const titleA = (a.title || 'Document').toLowerCase();
        const titleB = (b.title || 'Document').toLowerCase();
        return titleA.localeCompare(titleB);
      });
      
    case 'due-date':
      return docs.sort((a, b) => {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date) - new Date(b.due_date);
      });
      
    case 'status':
      const statusOrder = { 'pending': 0, 'in_progress': 1, 'completed': 2, 'overdue': -1 };
      return docs.sort((a, b) => {
        const aStatus = a.due_date && new Date(a.due_date) < new Date() && a.status !== 'completed' ? 'overdue' : a.status;
        const bStatus = b.due_date && new Date(b.due_date) < new Date() && b.status !== 'completed' ? 'overdue' : b.status;
        return (statusOrder[aStatus] ?? 3) - (statusOrder[bStatus] ?? 3);
      });
      
    default:
      return docs;
  }
});

const updateFilteredDocuments = () => {
  // Calculate incomplete count for current agency only
  const incompleteCount = documents.value.filter(doc => {
    if (doc.status === 'completed') return false;
    if (doc.due_date && new Date(doc.due_date) < new Date() && doc.status !== 'completed') {
      return true; // Overdue
    }
    return doc.status === 'pending' || doc.status === 'in_progress';
  }).length;
  
  emit('update-count', incompleteCount);
};

// Watch for agency changes and update counts
watch(() => agencyStore.currentAgency, () => {
  updateFilteredDocuments();
}, { immediate: true });

const handleDocumentAction = (document) => {
  if (document.document_action_type === 'signature') {
    router.push(`/tasks/documents/${document.id}/sign`);
  } else {
    router.push(`/tasks/documents/${document.id}/review`);
  }
};

const viewDocument = async (document) => {
  // For completed documents, view or download based on type
  try {
    if (document.document_action_type === 'signature') {
      // Open signed document in new tab for viewing
      // Use the API base URL from the api service
      const baseURL = api.defaults.baseURL || '';
      const viewUrl = `${baseURL}/document-signing/${document.id}/view`;
      // Include auth token in URL or use a data URL approach
      // Better: fetch and display in iframe/modal
      try {
        const response = await api.get(`/document-signing/${document.id}/view`, {
          responseType: 'blob'
        });
        const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
        window.open(url, '_blank');
        // Clean up the URL after a delay
        setTimeout(() => window.URL.revokeObjectURL(url), 100);
      } catch (err) {
        alert(err.response?.data?.error?.message || 'Failed to retrieve document');
      }
    } else {
      // For review documents, show acknowledgment info
      try {
        const ackResponse = await api.get(`/document-acknowledgment/${document.id}`);
        const ack = ackResponse.data;
        alert(`Document Reviewed\n\nReviewed: ${new Date(ack.acknowledged_at).toLocaleString()}\nIP: ${ack.ip_address || 'N/A'}`);
      } catch (err) {
        alert('Document has been reviewed, but acknowledgment details are not available.');
      }
    }
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to retrieve document');
  }
};

const downloadDocument = async (taskId) => {
  try {
    await documentsStore.downloadSignedDocument(taskId);
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to download document');
  }
};

const getStatusLabel = (status, documentActionType) => {
  if (status === 'completed') {
    return documentActionType === 'review' ? 'Reviewed' : 'Signed';
  }
  const labels = {
    'pending': 'Not Viewed',
    'in_progress': 'In Progress',
    'overdue': 'Overdue'
  };
  return labels[status] || 'Unknown';
};

const getStatusBadgeClass = (status) => {
  const classes = {
    'pending': 'badge-warning',
    'in_progress': 'badge-info',
    'completed': 'badge-success',
    'overdue': 'badge-danger'
  };
  return classes[status] || 'badge-secondary';
};

const getStatusClass = (status) => {
  return {
    'status-pending': status === 'pending',
    'status-in-progress': status === 'in_progress',
    'status-completed': status === 'completed',
    'status-overdue': status === 'overdue' || (documents.value.find(d => d.id === status)?.due_date && new Date(documents.value.find(d => d.id === status).due_date) < new Date())
  };
};

const isOverdue = (dueDate) => {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
};

const formatDate = (dateString) => {
  if (!dateString) return '';
  return new Date(dateString).toLocaleDateString();
};

onMounted(async () => {
  await agencyStore.fetchUserAgencies();
  await fetchDocuments();
});
</script>

<style scoped>
.documents-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.document-card {
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid var(--border);
  transition: all 0.2s;
}

.document-card:hover {
  border-color: var(--primary);
  box-shadow: var(--shadow);
}

.document-card.status-overdue {
  border-color: #dc2626;
  background: #fef2f2;
}

.document-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.document-header h3 {
  margin: 0;
  color: var(--text-primary);
  font-size: 18px;
  flex: 1;
}

.status-badge {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.badge-warning {
  background: #fef3c7;
  color: #92400e;
}

.badge-info {
  background: #dbeafe;
  color: #1e40af;
}

.badge-success {
  background: #d1fae5;
  color: #065f46;
}

.badge-danger {
  background: #fee2e2;
  color: #991b1b;
}

.document-description {
  margin: 0 0 12px 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.document-meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
  font-size: 14px;
}

.meta-item {
  color: var(--text-secondary);
}

.meta-item strong {
  color: var(--text-primary);
  margin-right: 8px;
}

.overdue-indicator {
  margin-left: 8px;
  color: #dc2626;
  font-weight: 600;
}

.document-actions {
  display: flex;
  gap: 8px;
}

.empty-state {
  padding: 40px;
  text-align: center;
  color: var(--text-secondary);
}

.sort-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid var(--border);
}

.sort-controls label {
  font-weight: 500;
  color: var(--text-primary);
  font-size: 14px;
}

.sort-select {
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: white;
  font-size: 14px;
  cursor: pointer;
  color: var(--text-primary);
}

.sort-select option {
  color: var(--text-primary);
  background: white;
}

.sort-select:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
}
</style>

