<template>
  <div class="modal-overlay" @click="$emit('close')">
    <div class="modal-content" @click.stop>
      <h2>Document Audit Trail</h2>
      
      <div v-if="loading" class="loading">Loading audit trail...</div>
      <div v-else-if="error" class="error">{{ error }}</div>
      <div v-else-if="workflow && signedDocument" class="audit-trail">
        <div class="audit-section">
          <h3>ESIGN Act Compliance</h3>
          <p class="compliance-statement">
            This document was electronically signed in compliance with the Electronic Signatures 
            in Global and National Commerce Act (ESIGN Act), 15 U.S.C. § 7001 et seq.
          </p>
        </div>

        <div class="audit-section">
          <h3>Signer Information</h3>
          <div class="info-grid">
            <div class="info-item">
              <label>Name:</label>
              <span>{{ userInfo.firstName }} {{ userInfo.lastName }}</span>
            </div>
            <div class="info-item">
              <label>Email:</label>
              <span>{{ userInfo.email }}</span>
            </div>
            <div class="info-item">
              <label>User ID:</label>
              <span>{{ userInfo.userId }}</span>
            </div>
          </div>
        </div>

        <div class="audit-section">
          <h3>Signature Timeline</h3>
          <div class="timeline">
            <div v-if="workflow.consent_given_at" class="timeline-item">
              <strong>Consent Given:</strong>
              <span>{{ formatDate(workflow.consent_given_at) }}</span>
              <small v-if="workflow.consent_ip">IP: {{ workflow.consent_ip }}</small>
            </div>
            <div v-if="workflow.intent_to_sign_at" class="timeline-item">
              <strong>Intent to Sign:</strong>
              <span>{{ formatDate(workflow.intent_to_sign_at) }}</span>
              <small v-if="workflow.intent_ip">IP: {{ workflow.intent_ip }}</small>
            </div>
            <div v-if="workflow.identity_verified_at" class="timeline-item">
              <strong>Identity Verified:</strong>
              <span>{{ formatDate(workflow.identity_verified_at) }}</span>
            </div>
            <div v-if="workflow.finalized_at" class="timeline-item">
              <strong>Document Finalized:</strong>
              <span>{{ formatDate(workflow.finalized_at) }}</span>
            </div>
            <div v-if="signedDocument.signed_at" class="timeline-item">
              <strong>Signed At:</strong>
              <span>{{ formatDate(signedDocument.signed_at) }}</span>
            </div>
          </div>
        </div>

        <div class="audit-section" v-if="workflow.consent_user_agent || workflow.intent_user_agent">
          <h3>Technical Information</h3>
          <div class="info-grid">
            <div v-if="workflow.consent_user_agent" class="info-item">
              <label>Consent User Agent:</label>
              <span>{{ workflow.consent_user_agent }}</span>
            </div>
            <div v-if="workflow.intent_user_agent" class="info-item">
              <label>Intent User Agent:</label>
              <span>{{ workflow.intent_user_agent }}</span>
            </div>
            <div v-if="signedDocument.ip_address" class="info-item">
              <label>IP Address:</label>
              <span>{{ signedDocument.ip_address }}</span>
            </div>
          </div>
        </div>

        <div class="audit-section" v-if="signedDocument.pdf_hash">
          <h3>Document Integrity</h3>
          <div class="info-item">
            <label>PDF Hash (SHA-256):</label>
            <code class="hash">{{ signedDocument.pdf_hash }}</code>
          </div>
          <button @click="verifyIntegrity" class="btn btn-secondary">Verify Integrity</button>
        </div>

        <div class="modal-actions">
          <button @click="$emit('close')" class="btn btn-secondary">Close</button>
          <button @click="downloadDocument" class="btn btn-primary">Download Signed PDF</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '../../services/api';
import { useDocumentsStore } from '../../store/documents';

const props = defineProps({
  taskId: {
    type: Number,
    required: true
  }
});

const emit = defineEmits(['close']);

const documentsStore = useDocumentsStore();

const loading = ref(true);
const error = ref('');
const workflow = ref(null);
const signedDocument = ref(null);
const userInfo = ref({});

const fetchAuditTrail = async () => {
  try {
    loading.value = true;
    const response = await api.get(`/document-signing/${props.taskId}`);
    workflow.value = response.data.workflow;
    signedDocument.value = response.data.signedDocument;
    
    // Get user info
    if (signedDocument.value) {
      const userRes = await api.get(`/users/${signedDocument.value.user_id}`);
      userInfo.value = {
        firstName: userRes.data.first_name,
        lastName: userRes.data.last_name,
        email: userRes.data.email,
        userId: userRes.data.id
      };
    }
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load audit trail';
  } finally {
    loading.value = false;
  }
};

const formatDate = (dateString) => {
  return new Date(dateString).toLocaleString();
};

const verifyIntegrity = async () => {
  try {
    const response = await api.get(`/document-signing/${props.taskId}/verify`);
    if (response.data.isValid) {
      alert('✓ Document integrity verified. The PDF has not been tampered with.');
    } else {
      alert('⚠ Warning: Document integrity check failed. The PDF may have been modified.');
    }
  } catch (err) {
    alert('Failed to verify document integrity');
  }
};

const downloadDocument = async () => {
  try {
    await documentsStore.downloadSignedDocument(props.taskId);
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to download document');
  }
};

onMounted(() => {
  fetchAuditTrail();
});
</script>

<style scoped>
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
  max-width: 800px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
}

.audit-trail {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.audit-section {
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid var(--border);
}

.audit-section h3 {
  margin-top: 0;
  margin-bottom: 16px;
  color: var(--text-primary);
}

.compliance-statement {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 12px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-item label {
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.info-item span {
  color: var(--text-primary);
}

.timeline {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.timeline-item {
  padding: 12px;
  background: white;
  border-radius: 6px;
  border-left: 3px solid var(--primary);
}

.timeline-item strong {
  display: block;
  margin-bottom: 4px;
  color: var(--text-primary);
}

.timeline-item span {
  display: block;
  color: var(--text-secondary);
  font-size: 14px;
}

.timeline-item small {
  display: block;
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 12px;
}

.hash {
  display: block;
  padding: 8px;
  background: white;
  border-radius: 4px;
  font-family: monospace;
  font-size: 11px;
  word-break: break-all;
  margin-top: 8px;
}

.modal-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
}
</style>

