<template>
  <div class="document-review-workflow">
    <div v-if="loading" class="loading">Loading document...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="acknowledged" class="step step-complete">
      <h2>Document Acknowledged</h2>
      <div class="success-message">
        <p>✓ You have successfully reviewed and acknowledged this document.</p>
        <p>Acknowledged at: {{ formatDate(acknowledgment?.acknowledged_at) }}</p>
      </div>
      <div class="complete-actions">
        <button @click="router.push(getDashboardRoute())" class="btn btn-primary">
          Return to Dashboard
        </button>
      </div>
    </div>
    <div v-else class="step step-review">
      <h2>Review Document: {{ task?.title }}</h2>
      
      <div class="document-preview">
        <div v-if="template?.template_type === 'html'" v-html="template?.html_content" class="html-preview"></div>
        <div v-else-if="pdfUrl" class="pdf-preview-container">
          <PDFPreview
            :pdf-url="pdfUrl"
            ref="pdfPreviewRef"
            @loaded="handlePdfLoaded"
            @page-change="handlePageChange"
          />
          <p v-if="pageNotice" class="page-notice">{{ pageNotice }}</p>
          <p class="note">Please review the document above. You must reach the last page before acknowledging.</p>
        </div>
        <div v-else class="pdf-preview">
          <p><strong>PDF Document:</strong> {{ template?.name || 'Document' }}</p>
          <p class="note">Loading document preview...</p>
        </div>
      </div>

      <div class="review-section">
        <h3>Acknowledgment</h3>
        <div class="acknowledgment-checkbox">
          <label>
            <input
              type="checkbox"
              v-model="hasAcknowledged"
              :disabled="submitting"
            />
            <span>I have reviewed and acknowledge this document</span>
          </label>
        </div>
        <p class="acknowledgment-note">
          By checking this box and submitting, you confirm that you have read and understood the contents of this document.
        </p>
      </div>

      <div class="review-actions">
        <button
          @click="submitAcknowledgment"
          class="btn btn-primary"
          :disabled="!hasAcknowledged || submitting"
        >
          {{ submitting ? 'Submitting...' : 'Mark as Reviewed' }}
        </button>
        <button @click="router.push(getDashboardRoute())" class="btn btn-secondary">
          Cancel
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { getDashboardRoute } from '../../utils/router';
import PDFPreview from './PDFPreview.vue';

const route = useRoute();
const router = useRouter();

const taskId = route.params.taskId;
const loading = ref(true);
const error = ref('');
const task = ref(null);
const template = ref(null);
const pdfUrl = ref(null);
const totalPages = ref(0);
const currentPage = ref(1);
const canAcknowledge = ref(false);
const hasAcknowledged = ref(false);
const submitting = ref(false);
const acknowledged = ref(false);
const acknowledgment = ref(null);
const pdfPreviewRef = ref(null);
const pageNotice = ref('');
let pageNoticeTimer = null;

const loadDocumentTask = async () => {
  try {
    loading.value = true;
    error.value = '';

    // Get task
    const taskRes = await api.get(`/tasks/${taskId}`);
    task.value = taskRes.data;

    // Check if already acknowledged
    try {
      const summaryRes = await api.get(`/document-acknowledgment/${taskId}/summary`);
      if (summaryRes.data?.acknowledged) {
        acknowledgment.value = summaryRes.data.acknowledgment;
        acknowledged.value = true;
        loading.value = false;
        return;
      }
    } catch (err) {
      console.warn('Error checking acknowledgment status:', err);
    }

    // Get template (use task endpoint for regular users)
    try {
      const templateRes = await api.get(`/document-templates/${task.value.reference_id}/task`);
      template.value = templateRes.data;
    } catch (err) {
      // Fallback to admin endpoint if user is admin
      if (err.response?.status === 403) {
        const templateRes = await api.get(`/document-templates/${task.value.reference_id}`);
        template.value = templateRes.data;
      } else {
        throw err;
      }
    }

    // Verify it's a review document
    if (task.value.document_action_type !== 'review') {
      error.value = 'This document requires a signature, not a review. Please use the signature workflow.';
    }

    // Build PDF URL if needed
    if (template.value?.template_type === 'pdf') {
      try {
        const resp = await api.get(`/document-templates/${template.value.id}/preview`, { responseType: 'blob' });
        const blobUrl = URL.createObjectURL(resp.data);
        pdfUrl.value = blobUrl;
      } catch (e) {
        pdfUrl.value = null;
        throw e;
      }
    } else {
      pdfUrl.value = null;
    }
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load document task';
  } finally {
    loading.value = false;
  }
};

const showPageNotice = (message) => {
  pageNotice.value = message;
  if (pageNoticeTimer) clearTimeout(pageNoticeTimer);
  pageNoticeTimer = setTimeout(() => {
    pageNotice.value = '';
  }, 2500);
};

const nudgeToNextPage = () => {
  if (totalPages.value > 1 && currentPage.value < totalPages.value) {
    pdfPreviewRef.value?.goToNextPage?.();
  }
};

const submitAcknowledgment = async () => {
  if (!hasAcknowledged.value) {
    error.value = 'Please acknowledge that you have reviewed the document';
    return;
  }
  if (!canAcknowledge.value) {
    showPageNotice('Please review all pages. Jumping to the next page.');
    nudgeToNextPage();
    return;
  }

  try {
    submitting.value = true;
    error.value = '';

    const response = await api.post(`/document-acknowledgment/${taskId}`);
    acknowledgment.value = response.data.acknowledgment;
    acknowledged.value = true;
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to acknowledge document';
  } finally {
    submitting.value = false;
  }
};

const formatDate = (dateString) => {
  return new Date(dateString).toLocaleString();
};

const handlePdfLoaded = ({ totalPages: tp }) => {
  totalPages.value = tp || 0;
  currentPage.value = 1;
  canAcknowledge.value = totalPages.value <= 1;
};

const handlePageChange = ({ currentPage: cp, totalPages: tp }) => {
  currentPage.value = cp || 1;
  totalPages.value = tp || totalPages.value;
  canAcknowledge.value = totalPages.value > 0 && currentPage.value >= totalPages.value;
};

onMounted(() => {
  loadDocumentTask();
});
</script>

<style scoped>
.document-review-workflow {
  max-width: 1200px;
  width: 100%;
  margin: 0 auto;
  padding: 32px;
}

.step {
  background: white;
  border-radius: 12px;
  padding: 32px;
  box-shadow: var(--shadow);
}

.step h2 {
  margin-top: 0;
  color: var(--text-primary);
}

.document-preview {
  margin: 20px 0;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid var(--border);
}

.html-preview {
  line-height: 1.6;
}

.html-preview h1,
.html-preview h2 {
  color: var(--text-primary);
  margin-top: 24px;
  margin-bottom: 12px;
}

.html-preview p {
  margin-bottom: 12px;
}

.pdf-preview {
  text-align: center;
  padding: 40px;
}

.pdf-preview-container {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: stretch;
}

.page-notice {
  margin: 12px 0 4px;
  padding: 8px 12px;
  border-radius: 6px;
  background: #fff4e5;
  border: 1px solid #f5c27a;
  color: #7a4b00;
  font-size: 13px;
}

.pdf-iframe {
  width: 100%;
  min-height: 600px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: white;
  margin-bottom: 16px;
}

.pdf-preview .note {
  color: var(--text-secondary);
  font-style: italic;
  margin-top: 16px;
}

.review-section {
  margin: 32px 0;
  padding: 24px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid var(--border);
}

.review-section h3 {
  margin-top: 0;
  color: var(--text-primary);
}

.acknowledgment-checkbox {
  margin: 16px 0;
}

.acknowledgment-checkbox label {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
}

.acknowledgment-checkbox input[type="checkbox"] {
  width: 20px;
  height: 20px;
  cursor: pointer;
}

.acknowledgment-note {
  color: var(--text-secondary);
  font-size: 14px;
  margin-top: 12px;
  font-style: italic;
}

.review-actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}

.success-message {
  padding: 24px;
  background: #d4edda;
  border-radius: 8px;
  border: 1px solid #c3e6cb;
  margin: 24px 0;
}

.success-message p {
  margin: 8px 0;
  color: #155724;
}

.complete-actions {
  margin-top: 24px;
}
</style>

