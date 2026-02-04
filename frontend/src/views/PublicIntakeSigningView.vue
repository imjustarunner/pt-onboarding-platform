<template>
  <div class="public-intake container">
    <div v-if="loading" class="loading">Loading intake link...</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <div v-else class="intake-card">
      <h2>{{ link?.title || 'Digital Intake' }}</h2>
      <p v-if="link?.description" class="muted">{{ link.description }}</p>

      <div v-if="step === 1" class="step">
        <h3>Guardian + Client Information</h3>
        <div class="form-grid">
          <div class="form-group">
            <label>Guardian first name</label>
            <input v-model="guardianFirstName" type="text" />
          </div>
          <div class="form-group">
            <label>Guardian last name</label>
            <input v-model="guardianLastName" type="text" />
          </div>
          <div class="form-group">
            <label>Guardian email</label>
            <input v-model="guardianEmail" type="email" />
          </div>
          <div class="form-group">
            <label>Guardian phone (optional)</label>
            <input v-model="guardianPhone" type="tel" />
          </div>
          <div class="form-group">
            <label>Guardian initials</label>
            <input v-model="signerInitials" type="text" maxlength="6" />
          </div>
          <div class="form-group">
            <label>Relationship</label>
            <input v-model="guardianRelationship" type="text" placeholder="e.g., Parent" />
          </div>
        </div>

        <div class="form-grid">
          <div class="form-group">
            <label>Client full name</label>
            <input v-model="clientFullName" type="text" />
          </div>
          <div class="form-group">
            <label>Client initials</label>
            <input v-model="clientInitials" type="text" maxlength="6" />
          </div>
          <div class="form-group">
            <label>Client contact phone (optional)</label>
            <input v-model="clientPhone" type="tel" />
          </div>
          <div v-if="requiresOrganizationId" class="form-group">
            <label>Organization ID</label>
            <input v-model="organizationId" type="number" />
          </div>
        </div>

        <div v-if="intakeFields.length" class="custom-fields">
          <h4>Additional Intake Questions</h4>
          <div class="form-grid">
            <div v-for="field in intakeFields" :key="field.key" class="form-group">
              <label>{{ field.label }}</label>
              <input
                v-if="field.type !== 'textarea'"
                :type="field.type || 'text'"
                v-model="intakeResponses[field.key]"
                :required="!!field.required"
                :placeholder="field.placeholder || ''"
              />
              <textarea
                v-else
                v-model="intakeResponses[field.key]"
                :placeholder="field.placeholder || ''"
                rows="3"
              />
            </div>
          </div>
        </div>

        <div class="consent-box">
          <strong>ESIGN Act Disclosure</strong>
          <p>
            By continuing, you consent to electronically sign these documents and receive electronic records.
            You may request paper copies from the organization.
          </p>
        </div>

        <div class="actions">
          <button class="btn btn-primary" type="button" :disabled="consentLoading" @click="submitConsent">
            {{ consentLoading ? 'Saving...' : 'I Consent and Continue' }}
          </button>
        </div>
      </div>

      <div v-else-if="step === 2" class="step">
        <h3>Review Documents</h3>
        <div class="doc-nav">
          <button class="btn btn-secondary btn-sm" type="button" :disabled="currentDocIndex === 0" @click="currentDocIndex--">
            Previous
          </button>
          <div class="doc-meta">
            Document {{ currentDocIndex + 1 }} of {{ templates.length }} — {{ currentDoc?.name || 'Untitled' }}
          </div>
          <button class="btn btn-secondary btn-sm" type="button" :disabled="currentDocIndex >= templates.length - 1" @click="currentDocIndex++">
            Next
          </button>
        </div>

        <div class="doc-preview">
          <div v-if="currentDoc?.template_type === 'html'" v-html="currentDoc.html_content" class="html-preview"></div>
          <iframe v-else-if="currentDoc?.template_type === 'pdf'" :src="getPdfUrl(currentDoc)" class="pdf-iframe"></iframe>
          <div v-else class="muted">Document preview not available.</div>
        </div>

        <div class="actions">
          <button class="btn btn-primary" type="button" @click="step = 3">I Reviewed All Documents</button>
        </div>
      </div>

      <div v-else-if="step === 3" class="step">
        <h3>Sign Documents</h3>
        <p class="muted">Use the signature pad below. This signature will apply to all documents in this packet.</p>
        <SignaturePad @signed="onSigned" />
        <div class="actions">
          <button class="btn btn-primary" type="button" :disabled="!signatureData || submitLoading" @click="submitPacket">
            {{ submitLoading ? 'Submitting...' : 'Submit Signed Packet' }}
          </button>
        </div>
      </div>

      <div v-else-if="step === 4" class="step">
        <h3>All Set</h3>
        <p>Your documents were signed successfully. A copy will be emailed to the guardian.</p>
        <div v-if="downloadUrl" class="actions">
          <a class="btn btn-primary" :href="downloadUrl" target="_blank" rel="noopener">Download Packet PDF</a>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import api from '../services/api';
import SignaturePad from '../components/SignaturePad.vue';
import { toUploadsUrl } from '../utils/uploadsUrl';

const route = useRoute();
const publicKey = route.params.publicKey;

const loading = ref(true);
const error = ref('');
const link = ref(null);
const templates = ref([]);
const step = ref(1);
const submissionId = ref(null);
const consentLoading = ref(false);
const submitLoading = ref(false);
const currentDocIndex = ref(0);
const signatureData = ref('');

const signerInitials = ref('');
const clientFullName = ref('');
const clientInitials = ref('');
const clientPhone = ref('');
const organizationId = ref('');

const guardianFirstName = ref('');
const guardianLastName = ref('');
const guardianEmail = ref('');
const guardianPhone = ref('');
const guardianRelationship = ref('');
const intakeResponses = reactive({});
const downloadUrl = ref('');

const currentDoc = computed(() => templates.value[currentDocIndex.value] || null);
const requiresOrganizationId = computed(() => String(link.value?.scope_type || '') === 'agency');
const intakeFields = computed(() => Array.isArray(link.value?.intake_fields) ? link.value.intake_fields : []);

const getPdfUrl = (doc) => {
  if (!doc?.file_path) return '';
  let filePath = String(doc.file_path);
  if (filePath.startsWith('/')) filePath = filePath.substring(1);
  if (!filePath.startsWith('templates/') && !filePath.startsWith('uploads/')) {
    filePath = `templates/${filePath}`;
  }
  return toUploadsUrl(filePath);
};

const loadLink = async () => {
  try {
    loading.value = true;
    const resp = await api.get(`/public-intake/${publicKey}`);
    link.value = resp.data?.link || null;
    templates.value = resp.data?.templates || [];
    if (!templates.value.length) {
      error.value = 'No documents configured for this intake link.';
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load intake link';
  } finally {
    loading.value = false;
  }
};

const submitConsent = async () => {
  if (!guardianFirstName.value || !guardianEmail.value || !clientFullName.value || !signerInitials.value) {
    error.value = 'Guardian name, guardian email, client name, and guardian initials are required.';
    return;
  }
  try {
    consentLoading.value = true;
    error.value = '';
    const resp = await api.post(`/public-intake/${publicKey}/consent`, {
      signerName: `${guardianFirstName.value} ${guardianLastName.value}`.trim(),
      signerInitials: signerInitials.value,
      signerEmail: guardianEmail.value,
      signerPhone: guardianPhone.value
    });
    submissionId.value = resp.data?.submission?.id || null;
    step.value = 2;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to capture consent';
  } finally {
    consentLoading.value = false;
  }
};

const onSigned = (dataUrl) => {
  signatureData.value = dataUrl;
};

const submitPacket = async () => {
  try {
    submitLoading.value = true;
    error.value = '';
    const resp = await api.post(`/public-intake/${publicKey}/submit`, {
      submissionId: submissionId.value,
      signatureData: signatureData.value,
      organizationId: organizationId.value,
      client: {
        fullName: clientFullName.value,
        initials: clientInitials.value,
        contactPhone: clientPhone.value
      },
      guardian: {
        firstName: guardianFirstName.value,
        lastName: guardianLastName.value,
        email: guardianEmail.value,
        phone: guardianPhone.value,
        relationship: guardianRelationship.value
      },
      intakeData: {
        responses: intakeResponses || {},
        client: {
          fullName: clientFullName.value,
          initials: clientInitials.value,
          contactPhone: clientPhone.value
        },
        guardian: {
          firstName: guardianFirstName.value,
          lastName: guardianLastName.value,
          email: guardianEmail.value,
          phone: guardianPhone.value,
          relationship: guardianRelationship.value
        }
      }
    });
    downloadUrl.value = resp.data?.downloadUrl || '';
    step.value = 4;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to submit signed packet';
  } finally {
    submitLoading.value = false;
  }
};

onMounted(loadLink);
</script>

<style scoped>
.intake-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}
.form-group label {
  display: block;
  font-weight: 600;
  margin-bottom: 4px;
}
.consent-box {
  background: var(--bg-alt);
  border: 1px solid var(--border);
  padding: 12px;
  border-radius: 10px;
  margin: 12px 0;
}
.actions {
  margin-top: 12px;
  display: flex;
  gap: 10px;
}
.doc-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 12px 0;
}
.doc-preview {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px;
  background: var(--bg);
  min-height: 320px;
}
.html-preview {
  max-height: 480px;
  overflow: auto;
}
.pdf-iframe {
  width: 100%;
  min-height: 480px;
  border: none;
}
.muted {
  color: var(--text-secondary);
}
</style>
