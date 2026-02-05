<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content">
      <div class="modal-header">
        <h2>Upload Referral Packet</h2>
        <button @click="$emit('close')" class="btn-close" aria-label="Close">×</button>
      </div>
      
      <div class="modal-body">
        <form @submit.prevent="handleUpload" class="upload-form">
          <div class="form-group">
            <label for="file-input" class="file-label">
              <div class="file-input-area" :class="{ 'dragover': isDragging }">
                <input
                  id="file-input"
                  type="file"
                  ref="fileInput"
                  @change="handleFileSelect"
                  @dragenter.prevent="isDragging = true"
                  @dragleave.prevent="isDragging = false"
                  @dragover.prevent
                  @drop.prevent="handleFileDrop"
                  accept=".pdf,.jpg,.jpeg,.png"
                  :disabled="!isAuthenticated"
                  required
                />
                <div v-if="!selectedFile" class="file-placeholder">
                  <span class="file-icon">📄</span>
                  <p>Click to select or drag and drop</p>
                  <p class="file-hint">PDF, JPG, PNG (Max 10MB)</p>
                </div>
                <div v-else class="file-selected">
                  <span class="file-icon">📄</span>
                  <p>{{ selectedFile.name }}</p>
                  <p class="file-size">{{ formatFileSize(selectedFile.size) }}</p>
                </div>
              </div>
            </label>
          </div>

          <div v-if="error" class="error-message">
            {{ error }}
          </div>

          <div v-if="success" class="success-message">
            {{ success }}
          </div>

          <div v-if="!isAuthenticated" class="auth-panel">
            <h3>Sign in to upload</h3>
            <p class="muted">Use your school account to submit a referral packet.</p>
            <div v-if="authError" class="error-message">{{ authError }}</div>
            <div class="form-group">
              <label>Email</label>
              <input v-model="authEmail" type="email" placeholder="you@school.org" />
            </div>
            <div class="form-group">
              <label>Password</label>
              <input v-model="authPassword" type="password" placeholder="Password" />
            </div>
            <button class="btn btn-secondary" type="button" :disabled="authLoading" @click="handleLogin">
              {{ authLoading ? 'Signing in...' : 'Sign in to upload' }}
            </button>
          </div>

          <div v-if="canUseOcr && clientId && phiDocumentId" class="ocr-panel">
            <h3>Extract Handwritten Data</h3>
            <p class="muted">Use OCR to extract text and quickly copy details for EHR entry.</p>
            <div class="ocr-actions">
              <button class="btn btn-secondary" type="button" :disabled="ocrLoading || !canRunOcr" @click="runOcr">
                {{ ocrLoading ? 'Extracting...' : 'Extract Text' }}
              </button>
              <button v-if="ocrText" class="btn btn-secondary" type="button" @click="copyText(ocrText)">
                Copy All Text
              </button>
            </div>
            <div v-if="ocrError" class="error-message">{{ ocrError }}</div>
            <div v-if="ocrWipeMessage" class="success-message">{{ ocrWipeMessage }}</div>

            <div v-if="pdfPreviewUrl" class="ocr-section">
              <h4>Preview Packet</h4>
              <PDFPreview :pdfUrl="pdfPreviewUrl" />
            </div>

            <div v-if="ocrText" class="ocr-extracted">
              <div class="ocr-extracted-header">
                <h4>Extracted Info (One-time)</h4>
                <button class="btn btn-secondary btn-xs" type="button" :disabled="ocrClearing" @click="clearOcr">
                  {{ ocrClearing ? 'Wiping…' : 'Wipe Extracted Info' }}
                </button>
              </div>
              <p class="muted">Copy each section into your EHR, then wipe to remove it from this tab.</p>
              <textarea class="ocr-text" readonly :value="ocrText"></textarea>

              <div v-if="pageOneLines.length" class="ocr-section">
                <div class="section-header">
                  <h4>Page 1 Answers</h4>
                  <button class="btn btn-xs btn-secondary" type="button" @click="copyLines(pageOneLines)">Copy Section</button>
                </div>
                <div v-if="pageOneQaPairs.length" class="answer-list qa-list">
                  <div v-for="(pair, idx) in pageOneQaPairs" :key="`p1qa-${idx}`" class="answer-row">
                    <span><strong>{{ pair.question }}</strong> {{ pair.answer ? `— ${pair.answer}` : '' }}</span>
                    <button class="btn btn-xs btn-secondary" type="button" @click="copyText(pair.answer || pair.question)">Copy</button>
                  </div>
                </div>
                <div class="answer-list">
                  <div v-for="(line, idx) in pageOneLines" :key="`p1-${idx}`" class="answer-row">
                    <span>{{ line }}</span>
                    <button class="btn btn-xs btn-secondary" type="button" @click="copyText(line)">Copy</button>
                  </div>
                </div>
              </div>

              <div v-if="psc17Summary" class="ocr-section">
                <h4>PSC-17 Score (Page 2)</h4>
                <div class="psc-summary">
                  <div>Total: {{ psc17Summary.total }} (Cutoff >= 15)</div>
                  <div>Attention: {{ psc17Summary.attention }} (Cutoff >= 7)</div>
                  <div>Internalizing: {{ psc17Summary.internalizing }} (Cutoff >= 5)</div>
                  <div>Externalizing: {{ psc17Summary.externalizing }} (Cutoff >= 7)</div>
                </div>
              </div>

              <div v-if="pageTwoExtras.length" class="ocr-section">
                <div class="section-header">
                  <h4>Page 2 Additional Answers</h4>
                  <button class="btn btn-xs btn-secondary" type="button" @click="copyLines(pageTwoExtras)">Copy Section</button>
                </div>
                <div class="answer-list">
                  <div v-for="(line, idx) in pageTwoExtras" :key="`p2-${idx}`" class="answer-row">
                    <span>{{ line }}</span>
                    <button class="btn btn-xs btn-secondary" type="button" @click="copyText(line)">Copy</button>
                  </div>
                </div>
              </div>

              <div class="profile-builder">
                <div class="form-group">
                  <label>First name (for initials)</label>
                  <input v-model="firstName" type="text" placeholder="First name" />
                </div>
                <div class="form-group">
                  <label>Last name (for initials)</label>
                  <input v-model="lastName" type="text" placeholder="Last name" />
                </div>
                <div class="abbr-row">
                  <div class="abbr-code">{{ abbreviatedName || '---' }}</div>
                  <button class="btn btn-secondary btn-sm" type="button" :disabled="!abbreviatedName" @click="copyText(abbreviatedName)">
                    Copy Code
                  </button>
                  <button class="btn btn-primary btn-sm" type="button" :disabled="!abbreviatedName || ocrLoading" @click="applyInitials">
                    Set Client Initials
                  </button>
                </div>
                <p class="muted">Format: first three of first name + first three of last name (e.g., AbcDef).</p>
              </div>
            </div>
          </div>

          <div class="form-actions">
            <button type="button" @click="$emit('close')" class="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" class="btn btn-primary" :disabled="!isAuthenticated || !selectedFile || uploading">
              <span v-if="uploading">Uploading...</span>
              <span v-else>Upload Referral Packet</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import PDFPreview from '../documents/PDFPreview.vue';

const props = defineProps({
  organizationSlug: {
    type: String,
    required: true
  }
});

const emit = defineEmits(['close', 'uploaded']);

const authStore = useAuthStore();
const roleNorm = computed(() => String(authStore.user?.role || '').toLowerCase());
const fileInput = ref(null);
const selectedFile = ref(null);
const isDragging = ref(false);
const uploading = ref(false);
const error = ref('');
const success = ref('');
const authEmail = ref('');
const authPassword = ref('');
const authLoading = ref(false);
const authError = ref('');
const clientId = ref(null);
const phiDocumentId = ref(null);
const ocrLoading = ref(false);
const ocrError = ref('');
const ocrText = ref('');
const ocrRequestId = ref(null);
const ocrClearing = ref(false);
const ocrWipeMessage = ref('');
const firstName = ref('');
const lastName = ref('');

const abbreviatedName = computed(() => {
  const clean = (value) => String(value || '').replace(/[^A-Za-z]/g, '');
  const part = (value) => {
    const raw = clean(value);
    if (!raw) return '';
    const slice = raw.slice(0, 3);
    return slice.charAt(0).toUpperCase() + slice.slice(1).toLowerCase();
  };
  const code = `${part(firstName.value)}${part(lastName.value)}`.trim();
  return code || '';
});

const canRunOcr = computed(() => true);
const isAuthenticated = computed(() => authStore.isAuthenticated);
const canUseOcr = computed(() => ['super_admin', 'admin', 'staff', 'support'].includes(roleNorm.value));
const pdfPreviewUrl = computed(() => {
  if (!phiDocumentId.value) return '';
  const base = String(api.defaults?.baseURL || '').replace(/\/+$/, '');
  return `${base}/phi-documents/${phiDocumentId.value}/view`;
});

const splitPages = (text) => {
  if (!text) return [];
  const pages = String(text).split(/\f/);
  if (pages.length > 1) return pages;
  return [text];
};

const toLines = (text) =>
  String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

const pageOneLines = computed(() => {
  if (!ocrText.value) return [];
  const pages = splitPages(ocrText.value);
  return toLines(pages[0] || '');
});

const questionLabels = [
  "Dependent's Name",
  'Dependent’s Name',
  "Dependent's Sex",
  'Dependent’s Sex',
  "Dependent's Date of Birth",
  'Dependent’s Date of Birth',
  "Dependent's Age",
  'Dependent’s Age',
  "Dependent's Grade",
  'Dependent’s Grade',
  "Dependent's Address",
  'Dependent’s Address',
  "Dependent's City",
  'Dependent’s City',
  'State',
  'Zip Code',
  'Preferred language for Dependent',
  'Preferred language for Parent/Guardian',
  'Are you the legal parent or custodian of the above-named minor',
  'I have a legal right to obtain treatment for the above-named minor',
  'Are you willing to provide documentation',
  'Your name',
  'Your phone number',
  'Your email address',
  'List any other parent/guardian name',
  'Primary Insurance',
  'Secondary Insurance',
  'Policy Holder',
  'Secondary Holder',
  'Member ID',
  'Secondary ID',
  'Policy Group',
  'Secondary Group',
  'History of physical abuse',
  'History of neglect',
  'History of Emotional/Mental Abuse',
  'Please explain'
];

const normalizeQuestion = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9?]+/g, ' ')
    .trim();

const isQuestionLine = (line) => {
  const raw = String(line || '');
  if (!raw) return false;
  if (raw.includes('?')) return true;
  const normalized = normalizeQuestion(raw);
  return questionLabels.some((q) => normalized.startsWith(normalizeQuestion(q)));
};

const parseYesNo = (line) => {
  const raw = String(line || '');
  if (!/yes/i.test(raw) || !/no/i.test(raw)) return '';
  const yesMarked = /yes[^a-z0-9]{0,3}[v✓x]/i.test(raw) || /[v✓x][^a-z0-9]{0,3}yes/i.test(raw);
  const noMarked = /no[^a-z0-9]{0,3}[v✓x]/i.test(raw) || /[v✓x][^a-z0-9]{0,3}no/i.test(raw);
  if (yesMarked && !noMarked) return 'Yes';
  if (noMarked && !yesMarked) return 'No';
  return '';
};

const stripQuestionLabel = (line) => {
  const raw = String(line || '').trim();
  const normalized = normalizeQuestion(raw);
  const match = questionLabels.find((q) => normalized.startsWith(normalizeQuestion(q)));
  if (!match) return raw;
  const idx = raw.toLowerCase().indexOf(match.toLowerCase());
  if (idx === -1) return raw;
  const tail = raw.slice(idx + match.length).replace(/^[:\-\s]+/, '');
  return tail.trim();
};

const extractQaPairs = (lines) => {
  const pairs = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!isQuestionLine(line)) continue;
    const question = stripQuestionLabel(line).length ? line : line.trim();
    let answer = '';
    const yesNo = parseYesNo(line);
    if (yesNo) {
      answer = yesNo;
    } else {
      const inline = stripQuestionLabel(line);
      if (inline && inline !== line.trim()) {
        answer = inline;
      } else if (lines[i + 1] && !isQuestionLine(lines[i + 1])) {
        answer = lines[i + 1];
        i += 1;
      }
    }
    pairs.push({ question: line.trim(), answer: answer.trim() });
  }
  return pairs.filter((p) => p.question);
};

const pageOneQaPairs = computed(() => extractQaPairs(pageOneLines.value));

const pageTwoLines = computed(() => {
  if (!ocrText.value) return [];
  const pages = splitPages(ocrText.value);
  return toLines(pages[1] || '');
});

const parsePsc17 = (lines) => {
  const answers = Array(17).fill(null);
  const mapWord = (v) => {
    const s = String(v || '').toLowerCase();
    if (s.includes('never')) return 0;
    if (s.includes('sometimes')) return 1;
    if (s.includes('often')) return 2;
    if (s === '0' || s === '1' || s === '2') return Number(s);
    return null;
  };
  lines.forEach((line) => {
    const m = line.match(/^\s*(\d{1,2})[\).:\-]/);
    if (!m) return;
    const idx = Number(m[1]);
    if (idx < 1 || idx > 17) return;
    const token = line.match(/(never|sometimes|often|\b0\b|\b1\b|\b2\b)/i);
    if (!token) return;
    answers[idx - 1] = mapWord(token[1]);
  });

  if (answers.filter((v) => v !== null).length < 17) {
    const tokens = lines
      .join(' ')
      .match(/(never|sometimes|often|\b0\b|\b1\b|\b2\b)/gi);
    if (tokens && tokens.length >= 17) {
      tokens.slice(0, 17).forEach((t, i) => {
        if (answers[i] === null) answers[i] = mapWord(t);
      });
    }
  }

  if (answers.some((v) => v === null)) return null;
  const attentionIdx = [0, 1, 2, 3, 6];
  const internalIdx = [4, 5, 8, 9, 10];
  const externalIdx = [7, 11, 12, 13, 14, 15, 16];
  const sum = (idxs) => idxs.reduce((acc, i) => acc + (answers[i] || 0), 0);
  return {
    total: answers.reduce((a, b) => a + (b || 0), 0),
    attention: sum(attentionIdx),
    internalizing: sum(internalIdx),
    externalizing: sum(externalIdx)
  };
};

const extractNameFromOcr = (text) => {
  const raw = String(text || '');
  if (!raw) return null;
  const patterns = [
    /dependent(?:'s)?\s+name\s*[:\-]?\s*([A-Za-z'`.-]+)\s+([A-Za-z'`.-]+)/i,
    /student\s+name\s*[:\-]?\s*([A-Za-z'`.-]+)\s+([A-Za-z'`.-]+)/i
  ];
  for (const re of patterns) {
    const match = raw.match(re);
    if (match) {
      return { firstName: match[1], lastName: match[2] };
    }
  }
  return null;
};

const maybeAutofillName = (text) => {
  if (firstName.value || lastName.value) return;
  const qaName = pageOneQaPairs.value.find((p) =>
    /dependent(?:'s)?\s+name/i.test(p.question)
  );
  if (qaName && qaName.answer) {
    const parts = qaName.answer.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      firstName.value = parts[0];
      lastName.value = parts.slice(1).join(' ');
      return;
    }
  }
  const extracted = extractNameFromOcr(text);
  if (!extracted) return;
  firstName.value = extracted.firstName || '';
  lastName.value = extracted.lastName || '';
};

const psc17Summary = computed(() => parsePsc17(pageTwoLines.value));

const pageTwoExtras = computed(() => {
  if (!pageTwoLines.value.length) return [];
  const questionLines = pageTwoLines.value.filter((l) => l.includes('?'));
  return questionLines.slice(0, 4);
});

const handleFileSelect = (event) => {
  const file = event.target.files[0];
  if (file) {
    validateAndSetFile(file);
  }
};

const handleFileDrop = (event) => {
  isDragging.value = false;
  const file = event.dataTransfer.files[0];
  if (file) {
    validateAndSetFile(file);
  }
};

const validateAndSetFile = (file) => {
  // Validate file type
  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
  if (!allowedTypes.includes(file.type)) {
    error.value = 'Please upload a PDF, JPG, or PNG file';
    return;
  }

  // Validate file size (10MB max)
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    error.value = 'File size must be less than 10MB';
    return;
  }

  selectedFile.value = file;
  error.value = '';
};

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

const handleLogin = async () => {
  authError.value = '';
  if (!authEmail.value || !authPassword.value) {
    authError.value = 'Email and password are required.';
    return;
  }
  authLoading.value = true;
  try {
    const result = await authStore.login(authEmail.value, authPassword.value, props.organizationSlug);
    if (!result?.success) {
      authError.value = result?.error || 'Login failed. Please check your credentials.';
    }
  } catch (e) {
    authError.value = e?.response?.data?.error?.message || 'Login failed. Please try again.';
  } finally {
    authLoading.value = false;
  }
};

const handleUpload = async () => {
  if (!isAuthenticated.value) {
    error.value = 'Please sign in before uploading a referral packet.';
    return;
  }
  if (!selectedFile.value) {
    error.value = 'Please select a file';
    return;
  }

  uploading.value = true;
  error.value = '';
  success.value = '';

  try {
    const formData = new FormData();
    formData.append('file', selectedFile.value);

    const response = await api.post(`/organizations/${props.organizationSlug}/upload-referral`, formData);

    success.value = 'Referral packet uploaded successfully!';
    clientId.value = response.data?.clientId || null;
    phiDocumentId.value = response.data?.phiDocumentId || null;
    if (clientId.value && phiDocumentId.value) {
      // OCR can be run immediately after upload.
    }
    
    emit('uploaded', response.data);
  } catch (err) {
    console.error('Upload error:', err);
    error.value = err.response?.data?.error?.message || 'Failed to upload referral packet. Please try again.';
  } finally {
    uploading.value = false;
  }
};

const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(String(text || ''));
  } catch (e) {
    error.value = 'Copy failed. Please try again.';
  }
};

const copyLines = (lines) => copyText((lines || []).join('\n'));

const runOcr = async () => {
  if (!clientId.value) return;
  ocrLoading.value = true;
  ocrError.value = '';
  ocrText.value = '';
  ocrWipeMessage.value = '';
  try {
    const req = await api.post(`/referrals/${clientId.value}/ocr`, {
      phiDocumentId: phiDocumentId.value || null
    });
    ocrRequestId.value = req.data?.request?.id || null;
    const result = await api.post(`/referrals/${clientId.value}/ocr/${ocrRequestId.value}/process`);
    const request = result.data?.request || {};
    if (request.status && request.status !== 'completed') {
      ocrError.value = request.error_message || 'OCR failed. Please try again later.';
      ocrText.value = '';
      return;
    }
    ocrText.value = request.result_text || '';
    if (ocrText.value) {
      maybeAutofillName(ocrText.value);
    }
  } catch (e) {
    ocrError.value = e.response?.data?.error?.message || 'OCR failed. Please try again later.';
  } finally {
    ocrLoading.value = false;
  }
};

const clearOcr = async () => {
  if (!clientId.value || !ocrRequestId.value) return;
  if (!window.confirm('Wipe extracted info for this packet? This cannot be undone.')) return;
  ocrClearing.value = true;
  ocrError.value = '';
  ocrWipeMessage.value = '';
  try {
    await api.post(`/referrals/${clientId.value}/ocr/${ocrRequestId.value}/clear`);
    ocrText.value = '';
    ocrWipeMessage.value = 'Extracted info wiped.';
  } catch (e) {
    ocrError.value = e.response?.data?.error?.message || 'Failed to wipe extracted info.';
  } finally {
    ocrClearing.value = false;
  }
};


const applyInitials = async () => {
  if (!clientId.value || !ocrRequestId.value || !abbreviatedName.value) return;
  ocrLoading.value = true;
  ocrError.value = '';
  try {
    await api.post(`/referrals/${clientId.value}/ocr/${ocrRequestId.value}/identify`, {
      firstName: firstName.value,
      lastName: lastName.value
    });
  } catch (e) {
    ocrError.value = e.response?.data?.error?.message || 'Failed to set initials.';
  } finally {
    ocrLoading.value = false;
  }
};
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
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  border-radius: 12px;
  padding: 0;
  max-width: 600px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px 32px;
  border-bottom: 2px solid var(--border);
}

.modal-header h2 {
  margin: 0;
  color: var(--text-primary);
}

.btn-close {
  background: none;
  border: none;
  font-size: 32px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  transition: all 0.2s;
}

.btn-close:hover {
  background: var(--bg-alt);
  color: var(--text-primary);
}

.modal-body {
  padding: 32px;
}

.upload-form {
  width: 100%;
}

.auth-panel {
  margin-top: 20px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #f9fafb;
}

.ocr-panel {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--border);
}

.ocr-extracted {
  margin-top: 12px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #fafafa;
}

.ocr-extracted-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}


.ocr-actions {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
}

.ocr-text {
  width: 100%;
  min-height: 180px;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px;
  font-size: 13px;
  margin-bottom: 12px;
}

.profile-builder {
  margin-top: 12px;
  display: grid;
  gap: 10px;
}

.ocr-section {
  margin-top: 14px;
}

.answer-list {
  display: grid;
  gap: 6px;
}

.answer-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: #fff;
}

.qa-list .answer-row {
  background: #f8fafc;
}

.psc-summary {
  display: grid;
  gap: 4px;
  font-size: 13px;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px;
}

.btn-xs {
  padding: 2px 6px;
  font-size: 11px;
  line-height: 1.2;
}

.abbr-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.abbr-code {
  font-weight: 700;
  letter-spacing: 1px;
  background: var(--bg-alt);
  border: 1px solid var(--border);
  padding: 6px 10px;
  border-radius: 6px;
}

.muted {
  color: var(--text-secondary);
}
.form-group {
  margin-bottom: 24px;
}

.file-label {
  display: block;
  width: 100%;
}

.file-input-area {
  border: 2px dashed var(--border);
  border-radius: 12px;
  padding: 60px 40px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s;
  background: var(--bg-alt);
}

.file-input-area:hover {
  border-color: var(--primary);
  background: white;
}

.file-input-area.dragover {
  border-color: var(--primary);
  background: rgba(var(--primary-rgb, 198, 154, 43), 0.1);
}

.file-input-area input[type="file"] {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  overflow: hidden;
  z-index: -1;
}

.file-placeholder,
.file-selected {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.file-icon {
  font-size: 48px;
  line-height: 1;
}

.file-placeholder p,
.file-selected p {
  margin: 0;
  color: var(--text-primary);
  font-size: 16px;
}

.file-hint {
  font-size: 14px;
  color: var(--text-secondary);
}

.file-size {
  font-size: 14px;
  color: var(--text-secondary);
}

.error-message {
  background: #fee;
  color: #c33;
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 16px;
  border: 1px solid #fcc;
}

.success-message {
  background: #efe;
  color: #3c3;
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 16px;
  border: 1px solid #cfc;
}

.form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
}

.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: var(--primary);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: var(--primary-dark, var(--primary));
  transform: translateY(-1px);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--bg-alt);
  color: var(--text-primary);
}

.btn-secondary:hover {
  background: var(--border);
}
</style>
