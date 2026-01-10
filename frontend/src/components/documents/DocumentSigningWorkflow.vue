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
          <iframe 
            :src="pdfUrl" 
            class="pdf-iframe"
            type="application/pdf"
          ></iframe>
          <p class="note">Please review the document above. Click "I Intend to Sign" to proceed.</p>
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
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import SignaturePad from '../SignaturePad.vue';
import { useDocumentsStore } from '../../store/documents';
import { getDashboardRoute } from '../../utils/router';

const route = useRoute();
const router = useRouter();
const documentsStore = useDocumentsStore();

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
const hasSignature = ref(false);
const signatureData = ref('');
const pdfUrl = ref(null);
const displayContent = ref(null);
const displayType = ref(null);

const getPdfUrl = (template) => {
  if (!template || !template.file_path) return null;
  const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const apiBase = baseURL.replace('/api', '') || 'http://localhost:3000';
  let filePath = template.file_path;
  // Remove leading slash if present
  if (filePath.startsWith('/')) {
    filePath = filePath.substring(1);
  }
  // Ensure it starts with uploads/templates/ or uploads/
  if (!filePath.startsWith('uploads/')) {
    filePath = `uploads/templates/${filePath}`;
  }
  return `${apiBase}/${filePath}`;
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

    // Determine what content to display
    if (userDocument.value) {
      // Use personalized user document
      if (userDocument.value.personalized_content) {
        displayContent.value = userDocument.value.personalized_content;
        displayType.value = 'html';
      } else if (userDocument.value.personalized_file_path) {
        displayType.value = 'pdf';
        const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
        const apiBase = baseURL.replace('/api', '') || 'http://localhost:3000';
        let filePath = userDocument.value.personalized_file_path;
        if (filePath.startsWith('/')) {
          filePath = filePath.substring(1);
        }
        if (!filePath.startsWith('uploads/')) {
          filePath = `uploads/${filePath}`;
        }
        pdfUrl.value = `${apiBase}/${filePath}`;
      } else if (template.value) {
        // Fallback to template
        if (template.value.template_type === 'html') {
          displayContent.value = template.value.html_content;
          displayType.value = 'html';
        } else if (template.value.template_type === 'pdf') {
          displayType.value = 'pdf';
          pdfUrl.value = getPdfUrl(template.value);
        }
      }
    } else if (userSpecificDocument.value) {
      // Use user-specific document
      if (userSpecificDocument.value.html_content) {
        displayContent.value = userSpecificDocument.value.html_content;
        displayType.value = 'html';
      } else if (userSpecificDocument.value.file_path) {
        displayType.value = 'pdf';
        const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
        const apiBase = baseURL.replace('/api', '') || 'http://localhost:3000';
        let filePath = userSpecificDocument.value.file_path;
        if (filePath.startsWith('/')) {
          filePath = filePath.substring(1);
        }
        if (!filePath.startsWith('uploads/')) {
          filePath = `uploads/${filePath}`;
        }
        pdfUrl.value = `${apiBase}/${filePath}`;
      }
    } else if (template.value) {
      // Fallback to template
      if (template.value.template_type === 'html') {
        displayContent.value = template.value.html_content;
        displayType.value = 'html';
      } else if (template.value.template_type === 'pdf') {
        displayType.value = 'pdf';
        pdfUrl.value = getPdfUrl(template.value);
      }
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

const handleSignature = (sigData) => {
  signatureData.value = sigData;
  hasSignature.value = true;
};

const finalizeSignature = async () => {
  if (!hasSignature.value || !signatureData.value) {
    error.value = 'Please provide a signature';
    errorDetails.value = null;
    return;
  }

  try {
    loading.value = true;
    error.value = '';
    errorDetails.value = null;
    await documentsStore.signDocument(taskId, signatureData.value);
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
    await documentsStore.downloadSignedDocument(taskId);
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

onMounted(() => {
  loadDocumentTask();
});
</script>

<style scoped>
.document-signing-workflow {
  max-width: 800px;
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
  padding: 24px;
  margin: 24px 0;
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
  align-items: center;
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

.instruction {
  margin-bottom: 24px;
  color: var(--text-secondary);
}

.sign-actions,
.intent-actions,
.complete-actions {
  margin-top: 24px;
  display: flex;
  gap: 12px;
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

