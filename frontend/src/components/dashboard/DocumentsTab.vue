<template>
  <DocumentsHubPanel
    title="My Documents"
    subtitle="Review, sign, and download documents assigned to you by your organization."
    mode="self"
    allow-category-reorder
    :tasks="documents"
    :loading="loading"
    :error="error"
    :sort-key="sortOption"
    @refresh="fetchDocuments"
    @action="onHubAction"
  >
    <template #header-actions>
      <div class="my-docs-sort">
        <label for="my-docs-sort">Sort by:</label>
        <select id="my-docs-sort" v-model="sortOption">
          <option value="unfinished">Unfinished First</option>
          <option value="alphabetical">Alphabetical (A–Z)</option>
          <option value="due-date">Due Date</option>
          <option value="status">Status</option>
          <option value="recent">Recently Completed</option>
        </select>
      </div>
      <button
        type="button"
        class="doc-hub__btn doc-hub__btn--ghost"
        :disabled="loading"
        @click="fetchDocuments"
      >
        Refresh
      </button>
    </template>
  </DocumentsHubPanel>

  <div v-if="showDetailsModal" class="modal-overlay" @click="closeDetails">
    <div class="modal-content" @click.stop>
      <div class="modal-header">
        <h3>{{ detailsDocument?.title || 'Document' }} — Details</h3>
        <button type="button" class="modal-close" @click="closeDetails">Close</button>
      </div>
      <div v-if="detailsLoading" class="modal-loading">Loading details…</div>
      <div v-else class="details-body">
        <div class="detail-row">
          <strong>Status</strong>
          <span>{{ detailsDocument?.document_action_type === 'review' ? 'Reviewed' : 'Signed' }}</span>
        </div>
        <template v-if="detailsDocument?.document_action_type === 'review'">
          <div class="detail-row">
            <strong>Reviewed at</strong>
            <span>{{ detailsAck?.acknowledged_at ? new Date(detailsAck.acknowledged_at).toLocaleString() : 'N/A' }}</span>
          </div>
          <div class="detail-row">
            <strong>IP address</strong>
            <span>{{ detailsAck?.ip_address || 'N/A' }}</span>
          </div>
        </template>
        <div class="modal-actions">
          <button type="button" class="doc-hub__btn doc-hub__btn--primary" @click="viewDocument(detailsDocument)">View</button>
          <button type="button" class="doc-hub__btn doc-hub__btn--ghost" @click="downloadDocument(detailsDocument)">Download</button>
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
import { useAgencyStore } from '../../store/agency';
import { useDocumentsStore } from '../../store/documents';
import DocumentsHubPanel from '../documents/DocumentsHubPanel.vue';
import { computeDocumentStats } from '../../utils/documentUiHelpers';

const emit = defineEmits(['update-count']);

const router = useRouter();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const documentsStore = useDocumentsStore();
const loading = ref(true);
const error = ref('');
const allDocuments = ref([]);
const sortOption = ref('unfinished');

const fetchDocuments = async () => {
  try {
    loading.value = true;
    error.value = '';
    const userId = authStore.user?.id;
    if (!userId) {
      error.value = 'User not found';
      return;
    }
    const response = await api.get('/tasks', { params: { taskType: 'document' } });
    allDocuments.value = response.data || [];
    updateCount();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load documents';
  } finally {
    loading.value = false;
  }
};

const documents = computed(() => {
  if (!agencyStore.currentAgency) return [];
  return allDocuments.value.filter((doc) => {
    if (doc.assigned_to_user_id === authStore.user?.id) return true;
    return doc.assigned_to_agency_id === agencyStore.currentAgency?.id;
  });
});

const updateCount = () => {
  emit('update-count', computeDocumentStats(documents.value).pending);
};

watch(() => agencyStore.currentAgency, updateCount, { immediate: true });
watch(documents, updateCount);

const onHubAction = ({ type, task }) => {
  if (type === 'sign') handleDocumentAction(task);
  else if (type === 'view') viewDocument(task);
  else if (type === 'download') downloadDocument(task);
  else if (type === 'details') openDetails(task);
};

const handleDocumentAction = (document) => {
  const path =
    document.document_action_type === 'signature'
      ? `/tasks/documents/${document.id}/sign`
      : `/tasks/documents/${document.id}/review`;
  router.push(path);
};

const viewDocument = async (document) => {
  try {
    const endpoint =
      document.document_action_type === 'signature'
        ? `/document-signing/${document.id}/view`
        : `/document-acknowledgment/${document.id}/view`;
    const response = await api.get(endpoint, { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
    window.open(url, '_blank');
    setTimeout(() => window.URL.revokeObjectURL(url), 100);
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to retrieve document');
  }
};

const downloadDocument = async (document) => {
  try {
    const assignee = safeFilename(
      `${authStore.user?.first_name || ''} ${authStore.user?.last_name || ''}`.trim() ||
        authStore.user?.email ||
        'user'
    );
    const dateLabel = formatDateForFilename(document.completed_at || document.updated_at);
    const title = safeFilename(document.title || 'document');
    const filename = `${title} - ${assignee} - ${dateLabel}.pdf`;

    if (document.document_action_type === 'signature') {
      await documentsStore.downloadSignedDocument(document.id, filename);
      return;
    }
    const pdfRes = await api.get(`/document-acknowledgment/${document.id}/download`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([pdfRes.data], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to download document');
  }
};

const safeFilename = (name) =>
  String(name || 'document')
    .replace(/[^\w\s\-().]/g, '')
    .trim()
    .slice(0, 80) || 'document';

const formatDateForFilename = (dateString) => {
  const d = dateString ? new Date(dateString) : new Date();
  return Number.isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
};

const showDetailsModal = ref(false);
const detailsDocument = ref(null);
const detailsAck = ref(null);
const detailsLoading = ref(false);

const openDetails = async (document) => {
  showDetailsModal.value = true;
  detailsDocument.value = document;
  detailsAck.value = null;
  detailsLoading.value = true;
  try {
    if (document.document_action_type === 'review') {
      const res = await api.get(`/document-acknowledgment/${document.id}/summary`);
      detailsAck.value = res.data?.acknowledgment || null;
    }
  } catch {
    detailsAck.value = null;
  } finally {
    detailsLoading.value = false;
  }
};

const closeDetails = () => {
  showDetailsModal.value = false;
  detailsDocument.value = null;
  detailsAck.value = null;
};

onMounted(async () => {
  if (!agencyStore.userAgencies?.length) await agencyStore.fetchUserAgencies();
  await fetchDocuments();
});
</script>

<style scoped>
.my-docs-sort {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.my-docs-sort label {
  color: #6b7280;
  font-weight: 500;
}

.my-docs-sort select {
  padding: 8px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 14px;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}

.modal-content {
  background: #fff;
  padding: 24px;
  border-radius: 12px;
  max-width: 520px;
  width: 100%;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
}

.modal-close {
  padding: 8px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
}

.modal-loading {
  padding: 20px;
  text-align: center;
  color: #6b7280;
}

.details-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 14px;
}

.detail-row {
  display: flex;
  gap: 12px;
}

.detail-row strong {
  min-width: 100px;
}

.modal-actions {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}

/* Re-use hub button classes from child (deep not needed — duplicate minimal) */
:deep(.doc-hub__btn--primary) {
  background: #166534;
  color: #fff;
  border: none;
  padding: 10px 18px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
}

:deep(.doc-hub__btn--ghost) {
  background: #fff;
  border: 1px solid #e5e7eb;
  padding: 10px 18px;
  border-radius: 8px;
  cursor: pointer;
}
</style>
