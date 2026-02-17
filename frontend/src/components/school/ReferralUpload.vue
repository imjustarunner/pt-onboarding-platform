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
              <input v-model="authEmail" type="email" placeholder="you@school.org" autocomplete="off" />
            </div>
            <div class="form-group">
              <label>Password</label>
              <input v-model="authPassword" type="password" placeholder="Password" autocomplete="off" />
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
              <div class="section-header">
                <h4>Preview Packet</h4>
                <a class="btn btn-xs btn-secondary" :href="pdfPreviewUrl" target="_blank" rel="noreferrer">
                  Open in new tab
                </a>
              </div>
              <PDFPreview :pdfUrl="pdfPreviewUrl" />
            </div>

            <div v-if="ocrText" class="ocr-extracted">
              <div class="ocr-extracted-header">
                <h4>Extracted Info (One-time)</h4>
                <button class="btn btn-secondary btn-xs" type="button" :disabled="ocrClearing" @click="clearOcr">
                  {{ ocrClearing ? 'Wiping…' : 'Wipe Text' }}
                </button>
              </div>
              <p class="muted">Copy each section into your EHR. Text is stored for 7 days unless wiped.</p>
              <div class="ocr-toggle">
                <label class="checkbox-row">
                  <input type="checkbox" v-model="showRawOcr" />
                  Show raw OCR
                </label>
              </div>
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
                <div v-if="showRawOcr" class="answer-list">
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

            <div v-if="psc17Answers.length" class="ocr-section">
              <h4>PSC-17 Selections</h4>
              <div class="answer-list">
                <div v-for="(ans, idx) in psc17Answers" :key="`psc-${idx}`" class="answer-row">
                  <span>#{{ idx + 1 }} — {{ ans === 0 ? 'Never' : ans === 1 ? 'Sometimes' : ans === 2 ? 'Often' : 'Unclear' }}</span>
                  <button class="btn btn-xs btn-secondary" type="button" @click="copyText(ans === 0 ? 'Never' : ans === 1 ? 'Sometimes' : ans === 2 ? 'Often' : '')">Copy</button>
                </div>
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
            <button
              type="button"
              class="btn btn-secondary"
              @click="confirmClose() ? $emit('close') : null"
            >
              Cancel
            </button>
            <button
              v-if="!uploadComplete"
              type="submit"
              class="btn btn-primary"
              :disabled="!isAuthenticated || !selectedFile || uploading"
            >
              <span v-if="uploading">Uploading...</span>
              <span v-else>Upload Referral Packet</span>
            </button>
            <button
              v-else
              type="button"
              class="btn btn-primary"
              @click="confirmClose() ? $emit('close') : null"
            >
              Close
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
const showRawOcr = ref(false);
const packetConfig = ref({ questions: [], ignore: [] });
const initialsSet = ref(false);
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
const canUseOcr = computed(() => ['super_admin', 'admin', 'staff', 'support', 'clinical_practice_assistant', 'provider_plus'].includes(roleNorm.value));
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

const defaultNoisePrefixes = [
  'itsco',
  'intake',
  'version',
  'page',
  'colorado',
  'mental health',
  'therapy',
  'consent',
  'acknowledgement'
];
const noiseExact = new Set(['•', '-', '—', '_', '.', '...', '']);
const getIgnoreList = () => {
  const custom = Array.isArray(packetConfig.value?.ignore) ? packetConfig.value.ignore : [];
  return custom.map((l) => String(l || '').trim()).filter(Boolean);
};
const isNoiseLine = (line) => {
  const raw = String(line || '').trim();
  if (!raw) return true;
  if (noiseExact.has(raw)) return true;
  const lower = raw.toLowerCase();
  if (lower.length <= 1) return true;
  if (defaultNoisePrefixes.some((p) => lower.startsWith(p))) return true;
  const ignore = getIgnoreList();
  if (ignore.some((p) => lower.startsWith(String(p).toLowerCase()))) return true;
  if (lower.startsWith('consent to release')) return true;
  if (lower.startsWith('acknowledgement and consent')) return true;
  if (lower.startsWith('please select the answer')) return true;
  return false;
};

const pageOneLines = computed(() => {
  if (!ocrText.value) return [];
  const pages = splitPages(ocrText.value);
  return toLines(pages[0] || '').filter((l) => !isNoiseLine(l));
});

const defaultQuestionLabels = [
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
  'Please explain',
  // Spanish equivalents for packet OCR
  'Nombre del dependiente',
  'Nombre del estudiante',
  'Sexo del dependiente',
  'Fecha de nacimiento',
  'Edad',
  'Grado',
  'Dirección',
  'Ciudad',
  'Código postal',
  'Idioma preferido'
];

const questionLabels = computed(() => {
  const custom = Array.isArray(packetConfig.value?.questions) ? packetConfig.value.questions : [];
  const labels = custom.map((q) => String(q?.label || '').trim()).filter(Boolean);
  return labels.length ? labels : defaultQuestionLabels;
});

const normalizeQuestion = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9?]+/g, ' ')
    .trim();

const findLabelMatches = (line) => {
  const lower = String(line || '').toLowerCase();
  const matches = [];
  questionLabels.value.forEach((label) => {
    const idx = lower.indexOf(label.toLowerCase());
    if (idx >= 0) matches.push({ label, idx });
  });
  return matches.sort((a, b) => a.idx - b.idx);
};

const isQuestionLine = (line) => {
  const raw = String(line || '');
  if (!raw) return false;
  if (raw.includes('?')) return true;
  const normalized = normalizeQuestion(raw);
  return questionLabels.value.some((q) => normalized.startsWith(normalizeQuestion(q)));
};

const parseYesNo = (line) => {
  const raw = String(line || '');
  if (!/yes/i.test(raw) || !/no/i.test(raw)) return '';
  const yesMarked = /yes[^a-z0-9]{0,4}[v✓x]/i.test(raw) || /[v✓x][^a-z0-9]{0,4}yes/i.test(raw);
  const noMarked = /no[^a-z0-9]{0,4}[v✓x]/i.test(raw) || /[v✓x][^a-z0-9]{0,4}no/i.test(raw);
  if (noMarked && !yesMarked) return 'No';
  if (yesMarked && !noMarked) return 'Yes';
  const yesIdx = raw.toLowerCase().indexOf('yes');
  const noIdx = raw.toLowerCase().indexOf('no');
  const markIdx = raw.search(/[v✓x]/i);
  if (markIdx >= 0) {
    const distYes = yesIdx >= 0 ? Math.abs(markIdx - yesIdx) : Number.POSITIVE_INFINITY;
    const distNo = noIdx >= 0 ? Math.abs(markIdx - noIdx) : Number.POSITIVE_INFINITY;
    if (distNo < distYes) return 'No';
    if (distYes < distNo) return 'Yes';
  }
  return '';
};

const cleanAnswer = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const cleaned = raw
    .replace(/^[\s:–—\-_•]+/, '')
    .replace(/[\s:–—\-_•]+$/, '')
    .trim();
  if (!cleaned || cleaned === '.' || cleaned === '—') return '';
  return cleaned;
};

const stripQuestionLabel = (line) => {
  const raw = String(line || '').trim();
  const normalized = normalizeQuestion(raw);
  const match = questionLabels.value.find((q) => normalized.startsWith(normalizeQuestion(q)));
  if (!match) return raw;
  const idx = raw.toLowerCase().indexOf(match.toLowerCase());
  if (idx === -1) return raw;
  const tail = raw.slice(idx + match.length).replace(/^[:\-\s]+/, '');
  return cleanAnswer(tail);
};

const extractQaPairs = (lines) => {
  const pairs = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!isQuestionLine(line)) continue;
    const labelMatches = findLabelMatches(line);
    if (labelMatches.length > 1) {
      for (let m = 0; m < labelMatches.length; m += 1) {
        const current = labelMatches[m];
        const next = labelMatches[m + 1];
        const segment = line.slice(current.idx + current.label.length, next ? next.idx : line.length);
        const answer = cleanAnswer(segment);
        pairs.push({ question: current.label.trim(), answer });
      }
      continue;
    }
    const question = labelMatches[0]?.label || line.trim();
    let answer = '';
    const yesNo = parseYesNo(line);
    if (yesNo) {
      answer = yesNo;
    } else {
      const inline = stripQuestionLabel(line);
      if (inline && inline !== line.trim()) {
        answer = inline;
      } else if (lines[i + 1] && !isQuestionLine(lines[i + 1])) {
        answer = cleanAnswer(lines[i + 1]);
        i += 1;
      }
    }
    const cleanedAnswer = cleanAnswer(answer);
    if (!cleanedAnswer) {
      // Try one more line ahead for OCR that splits labels and values.
      if (lines[i + 1] && !isQuestionLine(lines[i + 1])) {
        const nextAnswer = cleanAnswer(lines[i + 1]);
        if (nextAnswer) {
          pairs.push({ question, answer: nextAnswer });
          i += 1;
          continue;
        }
      }
    }
    pairs.push({ question, answer: cleanedAnswer });
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
  const markers = ['[', ']', '(', ')', '{', '}', '✓', 'v', 'V', 'x', 'X', '*', '•'];
  const normalize = (s) => String(s || '').toLowerCase();
  const isMarked = (line, word) => {
    const lower = normalize(line);
    const target = word.toLowerCase();
    let idx = lower.indexOf(target);
    while (idx !== -1) {
      const start = Math.max(0, idx - 3);
      const end = Math.min(lower.length, idx + target.length + 3);
      const window = lower.slice(start, end);
      if (markers.some((m) => window.includes(m))) return true;
      idx = lower.indexOf(target, idx + target.length);
    }
    return false;
  };
  const detectAnswer = (line) => {
    const lower = normalize(line);
    const hasNever = lower.includes('never') || lower.includes('nunca');
    const hasSometimes = lower.includes('sometimes') || lower.includes('a veces') || lower.includes('aveces');
    const hasOften = lower.includes('often') || lower.includes('a menudo') || lower.includes('amenudo');
    if (!(hasNever || hasSometimes || hasOften)) return null;
    if (hasNever && (isMarked(line, 'never') || isMarked(line, 'nunca'))) return 0;
    if (hasSometimes && (isMarked(line, 'sometimes') || isMarked(line, 'a veces') || isMarked(line, 'aveces'))) return 1;
    if (hasOften && (isMarked(line, 'often') || isMarked(line, 'a menudo') || isMarked(line, 'amenudo'))) return 2;
    return null;
  };
  const assign = (idx, value) => {
    if (idx < 1 || idx > 17) return;
    if (answers[idx - 1] === null && value !== null) answers[idx - 1] = value;
  };

  lines.forEach((line) => {
    const m = line.match(/^\s*(\d{1,2})[\).:\-]/);
    if (!m) return;
    const idx = Number(m[1]);
    const value = detectAnswer(line);
    assign(idx, value);
  });

  if (answers.filter((v) => v !== null).length < 17) {
    const stitched = lines.join(' ');
    const tokenMatch = stitched.match(/(never|sometimes|often|nunca|a veces|aveces|a menudo|amenudo)/gi);
    if (tokenMatch && tokenMatch.length >= 17) {
      tokenMatch.slice(0, 17).forEach((t, i) => {
        if (answers[i] === null) {
          const tok = t.toLowerCase();
          if (tok === 'never' || tok === 'nunca') answers[i] = 0;
          if (tok === 'sometimes' || tok === 'a veces' || tok === 'aveces') answers[i] = 1;
          if (tok === 'often' || tok === 'a menudo' || tok === 'amenudo') answers[i] = 2;
        }
      });
    }
  }

  const attentionIdx = [0, 1, 2, 3, 6];
  const internalIdx = [4, 5, 8, 9, 10];
  const externalIdx = [7, 11, 12, 13, 14, 15, 16];
  const sum = (idxs) => idxs.reduce((acc, i) => acc + (answers[i] || 0), 0);
  if (answers.some((v) => v === null)) {
    return { answers, summary: null };
  }
  return {
    answers,
    summary: {
      total: answers.reduce((a, b) => a + (b || 0), 0),
      attention: sum(attentionIdx),
      internalizing: sum(internalIdx),
      externalizing: sum(externalIdx)
    }
  };
};

const extractNameFromOcr = (text) => {
  const raw = String(text || '');
  if (!raw) return null;
  const patterns = [
    /dependent(?:'s)?\s+name\s*[:\-]?\s*([A-Za-z'`.-]+)\s+([A-Za-z'`.-]+)/i,
    /student\s+name\s*[:\-]?\s*([A-Za-z'`.-]+)\s+([A-Za-z'`.-]+)/i,
    /nombre\s+del\s+(?:dependiente|estudiante)\s*[:\-]?\s*([A-Za-záéíóúñ'`.-]+)\s+([A-Za-záéíóúñ'`.-]+)/i
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
    /dependent(?:'s)?\s+name|nombre\s+del\s+(?:dependiente|estudiante)/i.test(p.question)
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

const loadPacketConfig = async (agencyId) => {
  if (!agencyId) return;
  try {
    const resp = await api.get('/client-settings/packet-ocr-config', { params: { agencyId } });
    packetConfig.value = {
      questions: Array.isArray(resp.data?.questions) ? resp.data.questions : [],
      ignore: Array.isArray(resp.data?.ignore) ? resp.data.ignore : []
    };
  } catch {
    packetConfig.value = { questions: [], ignore: [] };
  }
};

const psc17Data = computed(() => parsePsc17(pageTwoLines.value));
const psc17Summary = computed(() => psc17Data.value?.summary || null);
const psc17Answers = computed(() => psc17Data.value?.answers || []);

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

const uploadComplete = computed(() => !!clientId.value);

const confirmClose = () => {
  if (canUseOcr.value && uploadComplete.value && !initialsSet.value) {
    return window.confirm('Initials were not set. Close anyway?');
  }
  return true;
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
    // Send user's local date so submission_date matches what they see (avoids timezone drift)
    const d = new Date();
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    formData.append('submissionDate', ymd);

    const response = await api.post(`/organizations/${props.organizationSlug}/upload-referral`, formData);

    success.value = 'Referral packet uploaded successfully!';
    clientId.value = response.data?.clientId || null;
    phiDocumentId.value = response.data?.phiDocumentId || null;
    const agencyId = response.data?.agencyId || null;
    if (agencyId) {
      await loadPacketConfig(agencyId);
    }
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
    const existing = await api.get(`/referrals/${clientId.value}/ocr`);
    const requests = existing.data?.requests || [];
    const latest = requests.find((r) => Number(r.phi_document_id) === Number(phiDocumentId.value)) || requests[0];
    if (latest?.status === 'completed' && latest?.result_text) {
      ocrRequestId.value = latest.id;
      ocrText.value = latest.result_text || '';
      if (ocrText.value) {
        maybeAutofillName(ocrText.value);
      }
      return;
    }
    if (latest?.status && latest.status !== 'completed') {
      ocrError.value = latest.error_message || 'OCR already queued. Please wait a moment.';
      return;
    }
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
    showRawOcr.value = false;
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
    initialsSet.value = true;
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

.ocr-toggle {
  margin: 8px 0 12px;
}

.checkbox-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
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
