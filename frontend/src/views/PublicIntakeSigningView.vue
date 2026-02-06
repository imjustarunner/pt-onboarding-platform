<template>
  <div class="public-intake container">
    <div v-if="loading" class="loading">Loading intake link...</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <div v-else class="intake-card">
      <h2>{{ link?.title || 'Digital Intake' }}</h2>
      <p v-if="link?.description" class="muted">{{ link.description }}</p>

      <div v-if="step === 0" class="step cover-step">
        <div class="cover-card">
          <div class="cover-logo" v-if="currentIntro?.logoUrl">
            <img :src="currentIntro.logoUrl" :alt="currentIntro.altText" />
          </div>
          <div class="cover-title">{{ currentIntro?.displayName || 'Welcome' }}</div>
          <div v-if="currentIntro?.subtitle" class="cover-subtitle">{{ currentIntro.subtitle }}</div>
          <div class="actions">
            <button class="btn btn-primary" type="button" @click="advanceIntro">
              Next
            </button>
          </div>
        </div>
      </div>

      <div v-else-if="step === 1" class="step">
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

        <div class="clients-block">
          <div class="clients-header">
            <h4>Clients</h4>
            <button class="btn btn-secondary btn-sm" type="button" @click="addClient">Add another child</button>
          </div>
          <div v-for="(c, idx) in clients" :key="idx" class="client-card">
            <div class="client-card-header">
              <strong>Client {{ idx + 1 }}</strong>
              <button v-if="clients.length > 1" class="btn btn-secondary btn-sm" type="button" @click="removeClient(idx)">Remove</button>
            </div>
            <div class="form-grid">
              <div class="form-group">
                <label>Client full name</label>
                <input v-model="c.fullName" type="text" />
              </div>
              <div class="form-group">
                <label>Client initials</label>
                <input v-model="c.initials" type="text" maxlength="6" />
              </div>
              <div class="form-group">
                <label>Client contact phone (optional)</label>
                <input v-model="c.contactPhone" type="tel" />
              </div>
              <div v-if="requiresOrganizationId" class="form-group">
                <label>Organization ID</label>
                <input v-model="organizationId" type="number" />
              </div>
            </div>

            <div v-if="clientFields.length" class="form-grid">
              <div v-for="field in clientFields" :key="`${idx}-${field.key}`" class="form-group">
                <label>{{ field.label }}</label>
                <input
                  v-if="field.type !== 'textarea'"
                  :type="field.type || 'text'"
                  v-model="intakeResponses.clients[idx][field.key]"
                  :required="!!field.required"
                  :placeholder="field.placeholder || ''"
                />
                <textarea
                  v-else
                  v-model="intakeResponses.clients[idx][field.key]"
                  :placeholder="field.placeholder || ''"
                  rows="3"
                />
              </div>
            </div>
          </div>
        </div>

        <div v-if="guardianFields.length" class="custom-fields">
          <h4>Guardian Questions</h4>
          <div class="form-grid">
            <div v-for="field in guardianFields" :key="field.key" class="form-group">
              <label>{{ field.label }}</label>
              <input
                v-if="field.type !== 'textarea'"
                :type="field.type || 'text'"
                v-model="intakeResponses.guardian[field.key]"
                :required="!!field.required"
                :placeholder="field.placeholder || ''"
              />
              <textarea
                v-else
                v-model="intakeResponses.guardian[field.key]"
                :placeholder="field.placeholder || ''"
                rows="3"
              />
            </div>
          </div>
        </div>

        <div v-if="submissionFields.length" class="custom-fields">
          <h4>Additional Intake Questions</h4>
          <div class="form-grid">
            <div v-for="field in submissionFields" :key="field.key" class="form-group">
              <label>{{ field.label }}</label>
              <input
                v-if="field.type !== 'textarea'"
                :type="field.type || 'text'"
                v-model="intakeResponses.submission[field.key]"
                :required="!!field.required"
                :placeholder="field.placeholder || ''"
              />
              <textarea
                v-else
                v-model="intakeResponses.submission[field.key]"
                :placeholder="field.placeholder || ''"
                rows="3"
              />
            </div>
          </div>
        </div>

        <div v-if="recaptchaSiteKey" class="captcha-block">
          <div class="muted">Protected by reCAPTCHA</div>
          <div v-if="captchaError" class="error">{{ captchaError }}</div>
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
        <h3 v-if="currentFlowStep?.type === 'document'">Document</h3>
        <h3 v-else-if="currentFlowStep?.type === 'questions'">Questions</h3>
        <div class="doc-nav" v-if="currentFlowStep?.type === 'document'">
          <button class="btn btn-secondary btn-sm" type="button" :disabled="currentDocIndex === 0" @click="goToPrevious">
            Previous
          </button>
          <div class="doc-meta">
            {{ currentDoc?.name || 'Untitled' }}
            <span v-if="docStatus[currentDoc?.id]" class="badge badge-success" style="margin-left: 8px;">Completed</span>
          </div>
          <button
            class="btn btn-secondary btn-sm"
            type="button"
            :disabled="!docStatus[currentDoc?.id]"
            @click="goToNext"
          >
            Next
          </button>
        </div>

        <div class="doc-preview" v-if="currentFlowStep?.type === 'document'">
          <div v-if="currentDoc?.template_type === 'html'" v-html="currentDoc.html_content" class="html-preview"></div>
          <div v-else-if="pdfUrl" class="pdf-preview-container">
            <PDFPreview
              :pdf-url="pdfUrl"
              @loaded="handlePdfLoaded"
              @page-change="handlePageChange"
            />
            <p v-if="pageNotice" class="page-notice">{{ pageNotice }}</p>
            <p class="note">Please review the document above. You must reach the last page before continuing.</p>
          </div>
          <div v-else class="muted">Document preview not available.</div>
        </div>

        <div v-if="currentFlowStep?.type === 'document' && visibleFieldDefinitions.length" class="field-inputs">
          <h4>Required Fields</h4>
          <div v-for="field in visibleFieldDefinitions" :key="field.id" class="form-group">
            <label>{{ field.label || field.type }}</label>
            <input
              v-if="field.type !== 'date' && field.type !== 'checkbox' && field.type !== 'select' && field.type !== 'radio'"
              v-model="currentFieldValues[field.id]"
              :type="field.type === 'ssn' ? 'password' : 'text'"
              :placeholder="field.type === 'ssn' ? 'Enter SSN' : 'Enter value'"
              :data-field-id="field.id"
            />
            <label v-else-if="field.type === 'checkbox'" class="checkbox-row" :data-field-id="field.id">
              <input v-model="currentFieldValues[field.id]" type="checkbox" />
              <span>{{ field.label || 'I agree' }}</span>
            </label>
            <select
              v-else-if="field.type === 'select'"
              v-model="currentFieldValues[field.id]"
              :data-field-id="field.id"
            >
              <option value="">Select an option</option>
              <option v-for="opt in field.options || []" :key="opt.value || opt.label" :value="opt.value || opt.label">
                {{ opt.label || opt.value }}
              </option>
            </select>
            <div v-else-if="field.type === 'radio'" class="radio-group" :data-field-id="field.id">
              <label v-for="opt in field.options || []" :key="opt.value || opt.label" class="radio-row">
                <input
                  type="radio"
                  :name="`field_${field.id}`"
                  :value="opt.value || opt.label"
                  v-model="currentFieldValues[field.id]"
                />
                <span>{{ opt.label || opt.value }}</span>
              </label>
            </div>
            <input v-else-if="field.autoToday" v-model="currentFieldValues[field.id]" type="text" disabled />
            <input v-else v-model="currentFieldValues[field.id]" type="date" :data-field-id="field.id" />
          </div>
        </div>

        <div v-if="currentFlowStep?.type === 'document' && currentDoc?.document_action_type === 'signature'" class="signature-block">
          <SignaturePad @signed="onSigned" />
        </div>

        <div v-if="currentFlowStep?.type === 'questions'" class="field-inputs">
          <h4>Questions</h4>
          <div v-for="field in currentQuestionFields" :key="field.id" class="form-group">
            <label>{{ field.label || field.key }}</label>
            <input
              v-if="field.type !== 'textarea' && field.type !== 'checkbox' && field.type !== 'select' && field.type !== 'radio' && field.type !== 'date'"
              v-model="questionValues[field.key]"
              type="text"
              :data-field-id="field.id"
            />
            <textarea v-else-if="field.type === 'textarea'" v-model="questionValues[field.key]" rows="4"></textarea>
            <label v-else-if="field.type === 'checkbox'" class="checkbox-row" :data-field-id="field.id">
              <input v-model="questionValues[field.key]" type="checkbox" />
              <span>{{ field.label || field.key }}</span>
            </label>
            <select v-else-if="field.type === 'select'" v-model="questionValues[field.key]">
              <option value="">Select an option</option>
              <option v-for="opt in field.options || []" :key="opt.value || opt.label" :value="opt.value || opt.label">
                {{ opt.label || opt.value }}
              </option>
            </select>
            <div v-else-if="field.type === 'radio'" class="radio-group">
              <label v-for="opt in field.options || []" :key="opt.value || opt.label" class="radio-row">
                <input type="radio" :name="`q_${field.key}`" :value="opt.value || opt.label" v-model="questionValues[field.key]" />
                <span>{{ opt.label || opt.value }}</span>
              </label>
            </div>
            <input v-else v-model="questionValues[field.key]" type="date" />
          </div>
        </div>

        <div class="actions">
          <button v-if="currentFlowStep?.type === 'document' && visibleFieldDefinitions.length" class="btn btn-secondary" type="button" @click="focusNextField">
            Next Field
          </button>
          <button
            class="btn btn-primary"
            type="button"
            :disabled="submitLoading"
            @click="currentFlowStep?.type === 'document' ? completeCurrentDocument() : completeQuestionStep()"
          >
            {{ submitLoading ? 'Submitting...' : (currentFlowStep?.type === 'document' ? (currentDoc?.document_action_type === 'signature' ? 'Sign & Continue' : 'Mark Reviewed & Continue') : 'Continue') }}
          </button>
        </div>
      </div>

      <div v-else-if="step === 3" class="step">
        <h3>All Set</h3>
        <p>Your documents were completed successfully. A copy will be emailed to the guardian.</p>
        <div v-if="downloadUrl" class="actions">
          <a class="btn btn-primary" :href="downloadUrl" target="_blank" rel="noopener">Download Packet PDF</a>
        </div>
        <div v-if="clientBundleLinks.length" class="bundle-list">
          <div class="bundle-title">Download per-child packets</div>
          <div v-for="bundle in clientBundleLinks" :key="bundle.clientId || bundle.filename" class="bundle-item">
            <div class="bundle-name">{{ bundle.clientName || `Client ${bundle.clientId}` }}</div>
            <a class="btn btn-secondary btn-sm" :href="bundle.downloadUrl" target="_blank" rel="noopener">Download</a>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../services/api';
import SignaturePad from '../components/SignaturePad.vue';
import PDFPreview from '../components/documents/PDFPreview.vue';
import { toUploadsUrl } from '../utils/uploadsUrl';

const route = useRoute();
const publicKey = route.params.publicKey;

const loading = ref(true);
const error = ref('');
const link = ref(null);
const templates = ref([]);
const agencyInfo = ref(null);
const organizationInfo = ref(null);
const introIndex = ref(0);
const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY || '';
const captchaToken = ref('');
const captchaError = ref('');
const intakeSteps = computed(() =>
  Array.isArray(link.value?.intake_steps) ? link.value.intake_steps : []
);
const flowSteps = computed(() => {
  if (intakeSteps.value.length) {
    return intakeSteps.value.map((s) => {
      if (s.type === 'document') {
        const template = templates.value.find((t) => Number(t.id) === Number(s.templateId));
        return { ...s, template };
      }
      return s;
    });
  }
  return templates.value.map((t) => ({ id: `doc_${t.id}`, type: 'document', template: t }));
});
const currentFlowIndex = ref(0);
const currentFlowStep = computed(() => flowSteps.value[currentFlowIndex.value] || null);
const step = ref(1);
const submissionId = ref(null);
const consentLoading = ref(false);
const submitLoading = ref(false);
const currentDocIndex = ref(0);
const signatureData = ref('');
const pdfUrl = ref(null);
const reviewPage = ref(1);
const reviewTotalPages = ref(0);
const canProceed = ref(true);
const pageNotice = ref('');
let pageNoticeTimer = null;
const docStatus = reactive({});
const fieldValuesByTemplate = reactive({});
const submissionStorageKey = `public_intake_submission_${publicKey}`;

const signerInitials = ref('');
const clients = ref([
  { fullName: '', initials: '', contactPhone: '' }
]);
const organizationId = ref('');

const guardianFirstName = ref('');
const guardianLastName = ref('');
const guardianEmail = ref('');
const guardianPhone = ref('');
const guardianRelationship = ref('');
const intakeResponses = reactive({
  guardian: {},
  submission: {},
  clients: [{}]
});
const downloadUrl = ref('');
const clientBundleLinks = ref([]);

const resolveLogoUrl = (org) => {
  if (!org) return null;
  if (org.logo_path) return toUploadsUrl(org.logo_path);
  if (org.logo_url) return org.logo_url;
  return null;
};

const getDisplayName = (org) => {
  if (!org) return null;
  return org.official_name || org.name || null;
};

const introScreens = computed(() => {
  const screens = [];
  const agencyName = getDisplayName(agencyInfo.value);
  if (agencyName) {
    screens.push({
      key: 'agency',
      displayName: agencyName,
      logoUrl: resolveLogoUrl(agencyInfo.value),
      altText: `${agencyName} logo`,
      subtitle: 'Tap Next to continue'
    });
  }

  const orgName = getDisplayName(organizationInfo.value);
  if (orgName && organizationInfo.value?.id !== agencyInfo.value?.id) {
    screens.push({
      key: 'organization',
      displayName: orgName,
      logoUrl: resolveLogoUrl(organizationInfo.value),
      altText: `${orgName} logo`,
      subtitle: 'Tap Next to continue'
    });
  }

  return screens;
});

const currentIntro = computed(() => introScreens.value[introIndex.value] || null);

const currentDoc = computed(() => {
  if (currentFlowStep.value?.type === 'document') {
    return currentFlowStep.value.template || null;
  }
  return templates.value[currentDocIndex.value] || null;
});
const currentFieldDefinitions = computed(() => {
  const raw = currentDoc.value?.field_definitions || [];
  try {
    return Array.isArray(raw) ? raw : (typeof raw === 'string' ? JSON.parse(raw) : []);
  } catch {
    return [];
  }
});
const isFieldVisible = (def, values) => {
  const showIf = def?.showIf;
  if (!showIf || !showIf.fieldId) return true;
  const actual = values[showIf.fieldId];
  const expected = showIf.equals;
  if (Array.isArray(expected)) {
    return expected.map(String).includes(String(actual));
  }
  if (expected === '' || expected === null || expected === undefined) {
    return Boolean(actual);
  }
  return String(actual ?? '') === String(expected ?? '');
};
const visibleFieldDefinitions = computed(() =>
  currentFieldDefinitions.value.filter((def) => isFieldVisible(def, currentFieldValues.value))
);
const currentFieldValues = computed(() => {
  const id = currentDoc.value?.id;
  if (!id) return {};
  if (!fieldValuesByTemplate[id]) {
    fieldValuesByTemplate[id] = {};
  }
  return fieldValuesByTemplate[id];
});
const requiresOrganizationId = computed(() => String(link.value?.scope_type || '') === 'agency');
const intakeFields = computed(() => Array.isArray(link.value?.intake_fields) ? link.value.intake_fields : []);
const guardianFields = computed(() => intakeFields.value.filter((f) => (f.scope || 'client') === 'guardian'));
const submissionFields = computed(() => intakeFields.value.filter((f) => (f.scope || 'client') === 'submission'));
const clientFields = computed(() => intakeFields.value.filter((f) => (f.scope || 'client') === 'client'));

const loadPdfPreview = async () => {
  if (!currentDoc.value || currentDoc.value.template_type !== 'pdf') {
    pdfUrl.value = null;
    return;
  }
  try {
    if (pdfUrl.value) {
      URL.revokeObjectURL(pdfUrl.value);
      pdfUrl.value = null;
    }
    const resp = await api.get(
      `/public-intake/${publicKey}/document/${currentDoc.value.id}/preview`,
      { responseType: 'blob' }
    );
    pdfUrl.value = URL.createObjectURL(resp.data);
  } catch (e) {
    pdfUrl.value = null;
    error.value = 'Failed to load document preview';
  }
};

const loadLink = async () => {
  try {
    loading.value = true;
    const resp = await api.get(`/public-intake/${publicKey}`);
    link.value = resp.data?.link || null;
    templates.value = resp.data?.templates || [];
    agencyInfo.value = resp.data?.agency || null;
    organizationInfo.value = resp.data?.organization || null;
    if (!templates.value.length) {
      error.value = 'No documents configured for this intake link.';
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load intake link';
  } finally {
    loading.value = false;
  }
};

const loadRecaptchaScript = () => {
  if (window.grecaptcha) return Promise.resolve(window.grecaptcha);
  if (document.querySelector('script[data-recaptcha]')) {
    return new Promise((resolve) => {
      const existing = document.querySelector('script[data-recaptcha]');
      existing?.addEventListener?.('load', () => resolve(window.grecaptcha));
      setTimeout(() => resolve(window.grecaptcha), 2000);
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(recaptchaSiteKey)}`;
    script.async = true;
    script.defer = true;
    script.setAttribute('data-recaptcha', 'true');
    script.onload = () => resolve(window.grecaptcha);
    script.onerror = () => reject(new Error('Failed to load captcha'));
    document.head.appendChild(script);
  });
};

const getRecaptchaToken = async () => {
  if (!recaptchaSiteKey) return '';
  try {
    const grecaptcha = await loadRecaptchaScript();
    if (!grecaptcha?.execute) return '';
    return await grecaptcha.execute(recaptchaSiteKey, { action: 'public_intake_consent' });
  } catch {
    return '';
  }
};

const submitConsent = async () => {
  if (!guardianFirstName.value || !guardianEmail.value || !signerInitials.value) {
    error.value = 'Guardian name, guardian email, and guardian initials are required.';
    return;
  }
  if (!clients.value.length || !clients.value[0].fullName) {
    error.value = 'At least one client full name is required.';
    return;
  }
  if (recaptchaSiteKey) {
    const token = await getRecaptchaToken();
    captchaToken.value = token;
    if (!token) {
      error.value = 'Captcha verification failed. Please try again.';
      captchaError.value = error.value;
      return;
    }
  }
  try {
    consentLoading.value = true;
    error.value = '';
    const resp = await api.post(`/public-intake/${publicKey}/consent`, {
      signerName: `${guardianFirstName.value} ${guardianLastName.value}`.trim(),
      signerInitials: signerInitials.value,
      signerEmail: guardianEmail.value,
      signerPhone: guardianPhone.value,
      captchaToken: captchaToken.value || null
    });
    submissionId.value = resp.data?.submission?.id || null;
    if (submissionId.value) {
      localStorage.setItem(submissionStorageKey, String(submissionId.value));
    }
    step.value = 2;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to capture consent';
    captchaToken.value = '';
  } finally {
    consentLoading.value = false;
  }
};

const onSigned = (dataUrl) => {
  signatureData.value = dataUrl;
};

const completeCurrentDocument = async () => {
  try {
    submitLoading.value = true;
    error.value = '';
    if (!currentDoc.value) {
      error.value = 'No document selected.';
      return;
    }
    if (currentDoc.value.template_type === 'pdf' && !canProceed.value) {
      pageNotice.value = 'Please review all pages before continuing.';
      if (pageNoticeTimer) clearTimeout(pageNoticeTimer);
      pageNoticeTimer = setTimeout(() => {
        pageNotice.value = '';
      }, 2500);
      return;
    }
    if (currentDoc.value.document_action_type === 'signature' && !signatureData.value) {
      error.value = 'Signature is required.';
      return;
    }

    const missingFields = visibleFieldDefinitions.value.filter((f) => {
      if (!f.required) return false;
      if (f.type === 'date' && f.autoToday) return false;
      if (f.type === 'checkbox') {
        return currentFieldValues.value[f.id] !== true;
      }
      if (f.type === 'select' || f.type === 'radio') {
        const options = Array.isArray(f.options) ? f.options : [];
        const optionValues = options.map((opt) => String(opt.value ?? opt.label ?? '')).filter(Boolean);
        const selected = currentFieldValues.value[f.id];
        return !selected || (optionValues.length > 0 && !optionValues.includes(String(selected)));
      }
      const val = currentFieldValues.value[f.id];
      return val === null || val === undefined || String(val).trim() === '';
    });
    if (missingFields.length > 0) {
      error.value = 'Please complete all required fields before continuing.';
      return;
    }

    const resp = await api.post(
      `/public-intake/${publicKey}/${submissionId.value}/document/${currentDoc.value.id}/sign`,
      {
        signatureData: signatureData.value || '',
        fieldValues: currentFieldValues.value || {}
      }
    );

    docStatus[currentDoc.value.id] = true;
    signatureData.value = '';

    await nextFlowStep();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to submit document';
  } finally {
    submitLoading.value = false;
  }
};

const completeQuestionStep = async () => {
  const missing = currentQuestionFields.value.filter((f) => f.required).filter((f) => {
    const val = questionValues.value[f.key];
    if (f.type === 'checkbox') return val !== true;
    return val === null || val === undefined || String(val).trim() === '';
  });
  if (missing.length) {
    error.value = 'Please complete all required fields before continuing.';
    return;
  }
  await nextFlowStep();
};

const finalizePacket = async () => {
  try {
    submitLoading.value = true;
    error.value = '';
    const resp = await api.post(`/public-intake/${publicKey}/${submissionId.value}/finalize`, {
      submissionId: submissionId.value,
      organizationId: organizationId.value,
      clients: clients.value,
      guardian: {
        firstName: guardianFirstName.value,
        lastName: guardianLastName.value,
        email: guardianEmail.value,
        phone: guardianPhone.value,
        relationship: guardianRelationship.value
      },
      intakeData: {
        responses: intakeResponses || {},
        clients: clients.value,
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
    clientBundleLinks.value = resp.data?.clientBundles || [];
    step.value = 3;
    localStorage.removeItem(submissionStorageKey);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to finalize packet';
  } finally {
    submitLoading.value = false;
  }
};

const focusNextField = () => {
  const fields = visibleFieldDefinitions.value;
  if (!fields.length) return;
  let targetId = null;
  for (const field of fields) {
    if (!field.required) continue;
    if (field.type === 'date' && field.autoToday) continue;
    if (field.type === 'checkbox') {
      if (currentFieldValues.value[field.id] !== true) {
        targetId = field.id;
        break;
      }
      continue;
    }
    if (field.type === 'select' || field.type === 'radio') {
      const options = Array.isArray(field.options) ? field.options : [];
      const optionValues = options.map((opt) => String(opt.value ?? opt.label ?? '')).filter(Boolean);
      const selected = currentFieldValues.value[field.id];
      if (!selected || (optionValues.length > 0 && !optionValues.includes(String(selected)))) {
        targetId = field.id;
        break;
      }
      continue;
    }
    const val = currentFieldValues.value[field.id];
    if (val === null || val === undefined || String(val).trim() === '') {
      targetId = field.id;
      break;
    }
  }
  if (!targetId) return;
  const el = document.querySelector(`[data-field-id="${targetId}"]`);
  if (el) {
    const focusEl = el.querySelector?.('input, select, textarea') || el;
    if (typeof focusEl.focus === 'function') {
      focusEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      focusEl.focus();
    }
  }
};

const loadResumeStatus = async () => {
  if (!submissionId.value) return;
  try {
    const resp = await api.get(`/public-intake/${publicKey}/status/${submissionId.value}`);
    const signedIds = new Set(resp.data?.signedTemplateIds || []);
    templates.value.forEach((t) => {
      docStatus[t.id] = signedIds.has(t.id);
    });
    const nextIndex = templates.value.findIndex((t) => !signedIds.has(t.id));
    currentDocIndex.value = nextIndex === -1 ? templates.value.length - 1 : nextIndex;

    if (flowSteps.value.length) {
      const firstIncomplete = flowSteps.value.findIndex((step) => {
        if (step.type === 'document') {
          return !signedIds.has(step.template?.id);
        }
        if (step.type === 'questions') {
          return (step.fields || []).some((f) => f.required && !questionValues.value[f.key]);
        }
        return false;
      });
      currentFlowIndex.value = firstIncomplete === -1 ? flowSteps.value.length - 1 : firstIncomplete;
    }

    if (resp.data?.downloadUrl) {
      downloadUrl.value = resp.data.downloadUrl;
      step.value = 3;
      return;
    }
    step.value = 2;
  } catch (e) {
    // ignore resume errors
  }
};

const goToPrevious = () => {
  if (currentDocIndex.value > 0) currentDocIndex.value -= 1;
};

const goToNext = () => {
  if (currentDocIndex.value < templates.value.length - 1) currentDocIndex.value += 1;
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

const addClient = () => {
  clients.value.push({ fullName: '', initials: '', contactPhone: '' });
  intakeResponses.clients.push({});
};

const removeClient = (idx) => {
  clients.value.splice(idx, 1);
  intakeResponses.clients.splice(idx, 1);
};

const initializeFieldValues = () => {
  if (!currentDoc.value) return;
  const values = currentFieldValues.value;
  currentFieldDefinitions.value.forEach((field) => {
    if (field.type === 'date' && field.autoToday) {
      values[field.id] = new Date().toISOString().slice(0, 10);
    } else if (field.type === 'checkbox') {
      if (!(field.id in values)) values[field.id] = false;
    } else if (field.type === 'select' || field.type === 'radio') {
      if (!(field.id in values)) values[field.id] = '';
    } else if (!(field.id in values)) {
      values[field.id] = '';
    }
  });
};

const currentQuestionFields = computed(() => {
  if (currentFlowStep.value?.type !== 'questions') return [];
  return Array.isArray(currentFlowStep.value.fields) ? currentFlowStep.value.fields : [];
});

const questionValues = computed(() => intakeResponses.submission);

const advanceIntro = () => {
  if (introIndex.value < introScreens.value.length - 1) {
    introIndex.value += 1;
    return;
  }
  step.value = 1;
};

const nextFlowStep = async () => {
  if (currentFlowIndex.value < flowSteps.value.length - 1) {
    currentFlowIndex.value += 1;
  } else {
    await finalizePacket();
  }
};

watch(currentDoc, async () => {
  reviewPage.value = 1;
  reviewTotalPages.value = 0;
  canProceed.value = currentDoc.value?.template_type !== 'pdf';
  signatureData.value = '';
  pageNotice.value = '';
  initializeFieldValues();
  await loadPdfPreview();
});

onMounted(async () => {
  await loadLink();
  const stored = localStorage.getItem(submissionStorageKey);
  if (stored) {
    submissionId.value = parseInt(stored, 10) || null;
    await loadResumeStatus();
  } else if (introScreens.value.length) {
    step.value = 0;
    introIndex.value = 0;
  }
  initializeFieldValues();
  await loadPdfPreview();
  if (recaptchaSiteKey) {
    await nextTick();
  }
});
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
.clients-block {
  display: grid;
  gap: 12px;
  margin-bottom: 12px;
}
.clients-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.client-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  background: var(--bg-alt);
  display: grid;
  gap: 10px;
}
.client-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.consent-box {
  background: var(--bg-alt);
  border: 1px solid var(--border);
  padding: 12px;
  border-radius: 10px;
  margin: 12px 0;
}
.captcha-block {
  margin: 12px 0;
}
.bundle-list {
  margin-top: 12px;
  display: grid;
  gap: 8px;
}
.bundle-title {
  font-weight: 600;
}
.bundle-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-alt);
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
.pdf-preview-container {
  width: 100%;
  display: flex;
  flex-direction: column;
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
.note {
  color: var(--text-secondary);
  font-style: italic;
  margin-top: 12px;
}
.field-inputs {
  margin: 16px 0;
  padding: 16px;
  background: #f8f9fa;
  border: 1px solid var(--border);
  border-radius: 8px;
}

.field-inputs select {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
}

.radio-group {
  display: grid;
  gap: 6px;
}

.radio-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}
.checkbox-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}
.signature-block {
  margin-top: 16px;
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

.cover-step {
  display: flex;
  align-items: center;
  justify-content: center;
}

.cover-card {
  width: 100%;
  padding: 24px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-alt);
  text-align: center;
  display: grid;
  gap: 12px;
  justify-items: center;
}

.cover-logo img {
  max-width: 240px;
  max-height: 140px;
  object-fit: contain;
}

.cover-title {
  font-size: 22px;
  font-weight: 700;
}

.cover-subtitle {
  color: var(--text-secondary);
}

@media (max-width: 720px) {
  .public-intake.container {
    padding: 12px;
  }
  .intake-card {
    padding: 16px;
  }
  .form-grid {
    grid-template-columns: 1fr;
  }
  .clients-header,
  .client-card-header {
    flex-direction: column;
    align-items: flex-start;
  }
  .doc-nav {
    flex-direction: column;
    align-items: stretch;
  }
  .doc-meta {
    text-align: center;
  }
  .doc-preview {
    padding: 8px;
    min-height: 240px;
  }
  .html-preview {
    max-height: 60vh;
  }
  .actions {
    flex-direction: column;
  }
  .actions .btn,
  .actions a.btn {
    width: 100%;
  }
}
</style>
