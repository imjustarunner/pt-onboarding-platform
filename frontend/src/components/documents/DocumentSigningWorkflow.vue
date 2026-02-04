<template>
  <div class="document-signing-workflow">
    <div v-if="error" class="error-message" style="background: #fee; border: 1px solid #fcc; padding: 12px; border-radius: 4px; margin-bottom: 16px;">
      <strong>Error:</strong> {{ error }}
      <div v-if="errorDetails" style="margin-top: 8px; font-size: 12px; color: #666;">
        <div v-if="errorDetails.sqlMessage">SQL Error: {{ errorDetails.sqlMessage }}</div>
        <div v-if="errorDetails.code">Error Code: {{ errorDetails.code }}</div>
      </div>
    </div>
    <div v-if="currentStep === 1" class="step step-consent">
      <h2>Electronic Signature Consent</h2>
      <div class="consent-content">
        <p><strong>ESIGN Act Disclosure</strong></p>
        <p>
          You are being asked to sign this document electronically. By proceeding, you consent to:
        </p>
        <ul>
          <li>Conduct this transaction electronically</li>
          <li>Receive electronic records instead of paper copies</li>
          <li>Use electronic signatures instead of handwritten signatures</li>
        </ul>
        <p>
          You have the right to receive a paper copy of this document. If you wish to receive a paper copy, 
          please contact your administrator before proceeding.
        </p>
        <p>
          You may withdraw your consent at any time by contacting your administrator. However, 
          withdrawing consent will not affect the legal effectiveness of any electronic signature 
          you have already provided.
        </p>
        <button @click="giveConsent" class="btn btn-primary" :disabled="loading">
          {{ loading ? 'Processing...' : 'I Consent to Electronic Signature' }}
        </button>
      </div>
    </div>

    <div v-else-if="currentStep === 2" class="step step-intent">
      <h2>Review Document</h2>
      <div class="document-preview">
        <!-- Use personalized content if available, otherwise fall back to template -->
        <div v-if="displayContent && displayType === 'html'" v-html="displayContent" class="html-preview"></div>
        <div v-else-if="pdfUrl" class="pdf-preview-container">
          <PDFPreview
            :pdf-url="pdfUrl"
            ref="pdfPreviewRef"
            @loaded="handlePdfLoaded"
            @page-change="handlePageChange"
          />
          <p v-if="pageNotice" class="page-notice">{{ pageNotice }}</p>
          <p class="note">Please review the document above. You must reach the last page before proceeding.</p>
        </div>
        <div v-else class="pdf-preview">
          <p>Document: {{ template?.name || userSpecificDocument?.name || 'Unknown' }}</p>
          <p class="note">Loading document preview...</p>
        </div>
      </div>
      <div class="intent-actions">
        <button @click="recordIntent" class="btn btn-primary" :disabled="loading">
          {{ loading ? 'Processing...' : 'I Intend to Sign This Document' }}
        </button>
      </div>
    </div>

    <div v-else-if="currentStep === 3" class="step step-sign">
      <h2>Sign Document</h2>
      <p class="instruction">Please sign the document using the signature pad below.</p>
      <div v-if="fieldDefinitions.length > 0" class="field-inputs">
        <h3>Required Fields</h3>
        <div v-for="field in fieldDefinitions" :key="field.id" class="field-input">
          <label>{{ field.label || field.type }}</label>
          <input
            v-if="field.type !== 'date' && field.type !== 'checkbox'"
            v-model="fieldValues[field.id]"
            :type="field.type === 'ssn' ? 'password' : 'text'"
            :placeholder="field.type === 'ssn' ? 'Enter SSN' : 'Enter value'"
            :disabled="loading"
          />
          <label v-else-if="field.type === 'checkbox'" class="checkbox-row">
            <input v-model="fieldValues[field.id]" type="checkbox" :disabled="loading" />
            <span>{{ field.label || 'I agree' }}</span>
          </label>
          <input
            v-else-if="field.autoToday"
            v-model="fieldValues[field.id]"
            type="text"
            :disabled="true"
          />
          <input
            v-else
            v-model="fieldValues[field.id]"
            type="date"
            :disabled="loading"
          />
          <small v-if="fieldErrors[field.id]" class="error-text">{{ fieldErrors[field.id] }}</small>
        </div>
      </div>
      <SignaturePad 
        @signed="handleSignature"
        ref="signaturePad"
      />
      <div class="sign-actions">
        <button @click="finalizeSignature" class="btn btn-primary" :disabled="!hasSignature || loading">
          {{ loading ? 'Finalizing...' : 'Finalize Signature' }}
        </button>
      </div>
    </div>

    <div v-else-if="currentStep === 4" class="step step-complete">
      <h2>Document Signed Successfully</h2>
      <div class="success-message">
        <p>✓ Your document has been signed and finalized.</p>
        <p>The signed document includes an audit certificate with all required ESIGN Act compliance information.</p>
      </div>
      <div class="complete-actions">
        <button @click="downloadDocument" class="btn btn-primary" :disabled="loading">
          {{ loading ? 'Downloading...' : 'Download Signed Document' }}
        </button>
        <button @click="router.push(getDashboardRoute())" class="btn btn-secondary">
          Return to Dashboard
        </button>
      </div>

      <div v-if="isAdminUser" class="admin-countersign">
        <div v-if="adminCountersigned" class="success-message" style="margin-top: 16px;">
          <p>✓ Admin counter-signature recorded.</p>
        </div>
        <div v-else>
          <h3>Admin Counter-Signature</h3>
          <p class="instruction">Admins can add a counter-signature to finalize this document.</p>
          <SignaturePad @signed="handleAdminSignature" ref="adminSignaturePad" />
          <div class="sign-actions">
            <button @click="finalizeAdminCountersign" class="btn btn-primary" :disabled="!hasAdminSignature || loading">
              {{ loading ? 'Finalizing...' : 'Finalize Admin Signature' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import SignaturePad from '../SignaturePad.vue';
import PDFPreview from './PDFPreview.vue';
import { useDocumentsStore } from '../../store/documents';
import { useAuthStore } from '../../store/auth';
import { getDashboardRoute } from '../../utils/router';
import { toUploadsUrl } from '../../utils/uploadsUrl';

const route = useRoute();
const router = useRouter();
const documentsStore = useDocumentsStore();
const authStore = useAuthStore();

const taskId = route.params.taskId;
const currentStep = ref(1);
const loading = ref(false);
const error = ref('');
const errorDetails = ref(null);
const template = ref(null);
const userDocument = ref(null);
const userSpecificDocument = ref(null);
const task = ref(null);
const workflow = ref(null);
const signedDocument = ref(null);
const hasSignature = ref(false);
const signatureData = ref('');
const hasAdminSignature = ref(false);
const adminSignatureData = ref('');
const pdfUrl = ref(null);
const displayContent = ref(null);
const displayType = ref(null);
const reviewPage = ref(1);
const reviewTotalPages = ref(0);
const canProceed = ref(true);
const pdfPreviewRef = ref(null);
const pageNotice = ref('');
let pageNoticeTimer = null;
const fieldDefinitions = ref([]);
const fieldValues = ref({});
const fieldErrors = ref({});

const isAdminUser = computed(() => {
  const role = authStore.user?.role;
  return role === 'super_admin' || role === 'admin' || role === 'support';
});

const adminCountersigned = computed(() => {
  const trail = signedDocument.value?.audit_trail || {};
  return !!trail.adminCountersign?.signedAt;
});

const getPdfUrl = (template) => {
  if (!template || !template.file_path) return null;
  let filePath = String(template.file_path);
  if (filePath.startsWith('/')) filePath = filePath.substring(1);

  // Normalize template file paths to live under "templates/" when not already prefixed.
  if (!filePath.startsWith('templates/') && !filePath.startsWith('uploads/') && !filePath.startsWith('signed/') && !filePath.startsWith('fonts/')) {
    filePath = `templates/${filePath}`;
  }

  return toUploadsUrl(filePath);
};

const loadDocumentTask = async () => {
  try {
    loading.value = true;
    const response = await api.get(`/document-signing/${taskId}`);
    task.value = response.data.task;
    template.value = response.data.template;
    userDocument.value = response.data.userDocument;
    userSpecificDocument.value = response.data.userSpecificDocument;
    workflow.value = response.data.workflow;
    signedDocument.value = response.data.signedDocument || null;

    const rawFieldDefs = template.value?.field_definitions || userSpecificDocument.value?.field_definitions || [];
    const parsedDefs = (() => {
      if (!rawFieldDefs) return [];
      try {
        return typeof rawFieldDefs === 'string' ? JSON.parse(rawFieldDefs) : rawFieldDefs;
      } catch {
        return [];
      }
    })();
    fieldDefinitions.value = Array.isArray(parsedDefs) ? parsedDefs : [];
    const nextValues = { ...fieldValues.value };
    fieldDefinitions.value.forEach((f) => {
      if (f.type === 'date' && f.autoToday) {
        nextValues[f.id] = new Date().toISOString().slice(0, 10);
      } else if (f.type === 'checkbox') {
        if (!(f.id in nextValues)) nextValues[f.id] = false;
      } else if (!(f.id in nextValues)) {
        nextValues[f.id] = '';
      }
    });
    fieldValues.value = nextValues;

    // Determine what content to display
    if (userDocument.value) {
      // Use personalized user document
      if (userDocument.value.personalized_content) {
        displayContent.value = userDocument.value.personalized_content;
        displayType.value = 'html';
      } else if (userDocument.value.personalized_file_path) {
        displayType.value = 'pdf';
        try {
          const preview = await api.get(`/user-documents/${userDocument.value.id}/preview`, { responseType: 'blob' });
          pdfUrl.value = URL.createObjectURL(preview.data);
        } catch {
          let filePath = String(userDocument.value.personalized_file_path);
          if (filePath.startsWith('/')) filePath = filePath.substring(1);
          pdfUrl.value = toUploadsUrl(filePath);
        }
      } else if (template.value) {
        // Fallback to template
        if (template.value.template_type === 'html') {
          displayContent.value = template.value.html_content;
          displayType.value = 'html';
        } else if (template.value.template_type === 'pdf') {
          displayType.value = 'pdf';
          try {
            const preview = await api.get(`/document-templates/${template.value.id}/preview`, { responseType: 'blob' });
            pdfUrl.value = URL.createObjectURL(preview.data);
          } catch {
            pdfUrl.value = getPdfUrl(template.value);
          }
        }
      }
    } else if (userSpecificDocument.value) {
      // Use user-specific document
      if (userSpecificDocument.value.html_content) {
        displayContent.value = userSpecificDocument.value.html_content;
        displayType.value = 'html';
      } else if (userSpecificDocument.value.file_path) {
        displayType.value = 'pdf';
        let filePath = String(userSpecificDocument.value.file_path);
        if (filePath.startsWith('/')) filePath = filePath.substring(1);
        pdfUrl.value = toUploadsUrl(filePath);
      }
    } else if (template.value) {
      // Fallback to template
      if (template.value.template_type === 'html') {
        displayContent.value = template.value.html_content;
        displayType.value = 'html';
      } else if (template.value.template_type === 'pdf') {
        displayType.value = 'pdf';
        try {
          const preview = await api.get(`/document-templates/${template.value.id}/preview`, { responseType: 'blob' });
          pdfUrl.value = URL.createObjectURL(preview.data);
        } catch {
          pdfUrl.value = getPdfUrl(template.value);
        }
      }
    }

    if (displayType.value === 'html') {
      canProceed.value = true;
    } else if (displayType.value === 'pdf') {
      canProceed.value = reviewTotalPages.value <= 1;
    }

    // Determine current step based on workflow state
    // Only show step 4 if document is actually finalized (has signed_pdf_path)
    if (response.data.signedDocument && response.data.signedDocument.signed_pdf_path) {
      // Document is finalized and has a PDF
      currentStep.value = 4;
    } else if (workflow.value) {
      // Check workflow state to determine step
      if (workflow.value.finalized_at) {
        currentStep.value = 4;
      } else if (workflow.value.intent_to_sign_at) {
        currentStep.value = 3; // Ready to sign
      } else if (workflow.value.consent_given_at) {
        currentStep.value = 2; // Review document and record intent
      } else {
        currentStep.value = 1; // Need to give consent
      }
    } else {
      // No workflow yet, start at consent
      currentStep.value = 1;
    }
  } catch (err) {
    console.error('loadDocumentTask: Error:', err);
    console.error('loadDocumentTask: Error response:', err.response);
    const errorData = err.response?.data?.error || {};
    error.value = errorData.message || err.message || 'Failed to load document task';
    errorDetails.value = errorData;
    if (errorData.sqlMessage) {
      console.error('SQL Error:', errorData.sqlMessage);
      console.error('Error Code:', errorData.code);
    }
  } finally {
    loading.value = false;
  }
};

const giveConsent = async () => {
  try {
    loading.value = true;
    error.value = '';
    errorDetails.value = null;
    const response = await api.post(`/document-signing/${taskId}/consent`);
    console.log('giveConsent: Success response:', response.data);
    currentStep.value = 2;
    await loadDocumentTask();
  } catch (err) {
    console.error('giveConsent: Full error object:', err);
    console.error('giveConsent: Error response:', err.response);
    console.error('giveConsent: Error response data:', err.response?.data);
    const errorData = err.response?.data?.error || {};
    console.error('giveConsent: Error data object:', JSON.stringify(errorData, null, 2));
    console.error('giveConsent: Error message:', errorData.message);
    console.error('giveConsent: SQL Message:', errorData.sqlMessage);
    console.error('giveConsent: Error Code:', errorData.code);
    console.error('giveConsent: Error State:', errorData.sqlState);
    console.error('giveConsent: Error Number:', errorData.errno);
    error.value = errorData.message || err.message || 'Failed to record consent';
    errorDetails.value = errorData;
    if (errorData.sqlMessage) {
      error.value += ` (SQL: ${errorData.sqlMessage})`;
    }
  } finally {
    loading.value = false;
  }
};

const recordIntent = async () => {
  if (displayType.value === 'pdf' && !canProceed.value) {
    pageNotice.value = 'Please review all pages. Jumping to the next page.';
    if (pageNoticeTimer) clearTimeout(pageNoticeTimer);
    pageNoticeTimer = setTimeout(() => {
      pageNotice.value = '';
    }, 2500);
    if (reviewTotalPages.value > 1 && reviewPage.value < reviewTotalPages.value) {
      pdfPreviewRef.value?.goToNextPage?.();
    }
    return;
  }

  try {
    loading.value = true;
    error.value = '';
    errorDetails.value = null;
    await api.post(`/document-signing/${taskId}/intent`);
    currentStep.value = 3;
    await loadDocumentTask();
  } catch (err) {
    const errorData = err.response?.data?.error || {};
    error.value = errorData.message || 'Failed to record intent';
    errorDetails.value = errorData;
    if (errorData.sqlMessage) {
      console.error('SQL Error:', errorData.sqlMessage);
      console.error('Error Code:', errorData.code);
    }
  } finally {
    loading.value = false;
  }
};

const handlePdfLoaded = ({ totalPages }) => {
  reviewTotalPages.value = totalPages || 0;
  reviewPage.value = 1;
  canProceed.value = reviewTotalPages.value <= 1;
};

const handlePageChange = ({ currentPage, totalPages }) => {
  reviewPage.value = currentPage || 1;
  reviewTotalPages.value = totalPages || reviewTotalPages.value;
  canProceed.value = reviewTotalPages.value > 0 && reviewPage.value >= reviewTotalPages.value;
};

const handleSignature = (sigData) => {
  signatureData.value = sigData;
  hasSignature.value = true;
};

const handleAdminSignature = (sigData) => {
  adminSignatureData.value = sigData;
  hasAdminSignature.value = true;
};

const finalizeSignature = async () => {
  if (!hasSignature.value || !signatureData.value) {
    error.value = 'Please provide a signature';
    errorDetails.value = null;
    return;
  }

  const errors = {};
  fieldDefinitions.value.forEach((f) => {
    if (!f.required) return;
    const value = fieldValues.value[f.id];
    if (f.type === 'date' && f.autoToday) return;
    if (f.type === 'checkbox') {
      if (value !== true) {
        errors[f.id] = 'This field is required';
      }
      return;
    }
    if (value === null || value === undefined || String(value).trim() === '') {
      errors[f.id] = 'This field is required';
    }
  });
  fieldErrors.value = errors;
  if (Object.keys(errors).length > 0) {
    error.value = 'Please complete all required fields before signing.';
    errorDetails.value = null;
    return;
  }

  try {
    loading.value = true;
    error.value = '';
    errorDetails.value = null;
    await documentsStore.signDocument(taskId, signatureData.value, fieldValues.value);
    currentStep.value = 4;
  } catch (err) {
    const errorData = err.response?.data?.error || {};
    error.value = errorData.message || 'Failed to finalize signature';
    errorDetails.value = errorData;
    if (errorData.sqlMessage) {
      console.error('SQL Error:', errorData.sqlMessage);
      console.error('Error Code:', errorData.code);
    }
  } finally {
    loading.value = false;
  }
};

const downloadDocument = async () => {
  try {
    loading.value = true;
    error.value = '';
    errorDetails.value = null;
    const title = safeFilename(task.value?.title || template.value?.name || 'document');
    const assignee = safeFilename(
      `${authStore.user?.first_name || ''} ${authStore.user?.last_name || ''}`.trim() || authStore.user?.email || 'assigned-user'
    );
    const dateLabel = formatDateForFilename(signedDocument.value?.signed_at || workflow.value?.finalized_at);
    const filename = `${title} - ${assignee} - ${dateLabel}.pdf`;
    await documentsStore.downloadSignedDocument(taskId, filename);
  } catch (err) {
    console.error('downloadDocument: Error:', err);
    const errorData = err.response?.data?.error || {};
    error.value = errorData.message || err.message || 'Failed to download document';
    errorDetails.value = errorData;
    
    // Show user-friendly message for not finalized documents
    if (err.response?.status === 400 && errorData.status === 'not_finalized') {
      error.value = 'Document has not been finalized yet. Please complete the signature process (Intent → Sign → Finalize) before downloading.';
    }
  } finally {
    loading.value = false;
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

const finalizeAdminCountersign = async () => {
  if (!hasAdminSignature.value || !adminSignatureData.value) {
    error.value = 'Please provide the admin signature';
    errorDetails.value = null;
    return;
  }
  try {
    loading.value = true;
    error.value = '';
    errorDetails.value = null;
    await documentsStore.counterSignDocument(taskId, adminSignatureData.value);
    await loadDocumentTask();
  } catch (err) {
    const errorData = err.response?.data?.error || {};
    error.value = errorData.message || 'Failed to countersign document';
    errorDetails.value = errorData;
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  loadDocumentTask();
});
</script>

<style scoped>
.document-signing-workflow {
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

.consent-content {
  line-height: 1.8;
}

.consent-content ul {
  margin: 16px 0;
  padding-left: 24px;
}

.consent-content li {
  margin: 8px 0;
}

.document-preview {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  margin: 20px 0;
  min-height: 400px;
  background: #f9f9f9;
}

.html-preview {
  background: white;
  padding: 24px;
  border-radius: 4px;
}

.pdf-preview {
  text-align: center;
  padding: 60px 20px;
}

.pdf-preview-container {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: stretch;
}

.pdf-iframe {
  width: 100%;
  min-height: 600px;
  border: 1px solid var(--border);
  border-radius: 4px;
  margin-bottom: 16px;
}

.note {
  color: var(--text-secondary);
  font-style: italic;
  margin-top: 16px;
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

.instruction {
  margin-bottom: 24px;
  color: var(--text-secondary);
}

.field-inputs {
  margin: 16px 0 24px;
  padding: 16px;
  background: #f8f9fa;
  border: 1px solid var(--border);
  border-radius: 8px;
}

.field-inputs h3 {
  margin: 0 0 12px 0;
}

.field-input {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.field-input input {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
}

.checkbox-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.error-text {
  color: var(--error-color, #dc3545);
  font-size: 12px;
}

.sign-actions,
.intent-actions,
.complete-actions {
  margin-top: 24px;
  display: flex;
  gap: 12px;
}

.admin-countersign {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

.success-message {
  background: #d4edda;
  border: 1px solid #c3e6cb;
  border-radius: 8px;
  padding: 20px;
  margin: 24px 0;
}

.success-message p {
  margin: 8px 0;
  color: #155724;
}
</style>

