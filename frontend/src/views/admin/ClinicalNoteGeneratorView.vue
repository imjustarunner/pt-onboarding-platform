<template>
  <div class="container">
    <div class="page-header">
      <div>
        <router-link :to="orgTo('/admin')" class="back-link">← Back to Admin</router-link>
        <h1>Note Aid</h1>
        <p class="subtitle">Record or paste your session details, then generate a structured note.</p>
      </div>
    </div>

    <div v-if="canUseTool" class="banner warning">
      <strong>Privacy Notice</strong>
      <div class="muted">⚠️ Privacy Notice: This draft will be permanently deleted in 7 days.</div>
    </div>

    <div v-if="!canUseTool" class="content-card">
      <div class="empty-state">
        <strong>Not available</strong>
        <div class="muted" style="margin-top: 6px;">
          This tool is not enabled for your current organization.
          Ask an admin to enable <strong>Clinical Note Generator</strong> in Organization Settings.
        </div>
      </div>
    </div>

    <div v-else class="content-card">
      <div class="row" style="margin-bottom: 16px;">
        <div class="col">
          <label class="label">Your credential</label>
          <div class="muted">
            <div v-if="loadingContext">Loading…</div>
            <div v-else>
              <div><strong>Credential:</strong> {{ providerCredentialText || 'Not set' }}</div>
              <div><strong>Derived tier:</strong> {{ derivedTier }}</div>
              <div v-if="eligibleCodesLabel"><strong>Eligible codes:</strong> {{ eligibleCodesLabel }}</div>
            </div>
          </div>
          <small v-if="contextError" class="error">{{ contextError }}</small>
        </div>

        <div class="col">
          <label class="label">Auto-save</label>
          <div class="muted">
            <div>Auto-saves every 30 seconds.</div>
            <div v-if="lastSavedAt">Last saved: {{ lastSavedAt }}</div>
            <div v-else-if="draftId">Draft created.</div>
          </div>
        </div>
      </div>

      <div class="row">
        <div class="col">
          <label class="label">Service Code</label>
          <select v-model="selectedServiceCode" class="input" :disabled="autoSelectCode || forceAutoSelect">
            <option value="" disabled>Select a service code</option>
            <option v-for="code in serviceCodeOptions" :key="code" :value="code">{{ serviceCodeOptionLabel(code) }}</option>
            <option v-if="canUseOtherCode" value="__other__">Other (enter code)</option>
          </select>
          <small v-if="selectedServiceCode && selectedServiceCode !== '__other__' && serviceCodeDescription(selectedServiceCode)" class="hint" style="display: block; margin-top: 6px;">
            {{ serviceCodeDescription(selectedServiceCode) }}
          </small>

          <div v-if="selectedServiceCode === '__other__'" style="margin-top: 10px;">
            <label class="label sub">Other service code</label>
            <input v-model="otherServiceCode" class="input" placeholder="e.g., 90834" />
          </div>
          <label class="checkbox" style="margin-top: 10px;">
            <input v-model="autoSelectCode" type="checkbox" :disabled="forceAutoSelect" />
            <span>Let AI choose the best code (optional)</span>
          </label>
          <small v-if="forceAutoSelect" class="hint" style="display: block;">
            Credential not on file — Code Decider will choose the best code.
          </small>
        </div>

        <div class="col">
          <label class="label">Program (H2014 only)</label>
          <select v-model="selectedProgramId" class="input" :disabled="!showProgramDropdown">
            <option value="">No program</option>
            <option v-for="p in programs" :key="p.id" :value="String(p.id)">
              {{ formatProgramLabel(p) }}
            </option>
          </select>
          <small class="hint">Only H2014 uses programs.</small>
          <small v-if="showProgramDropdown && programs.length" class="hint" style="display: block;">
            If this visit is part of a program, select it.
          </small>
          <small v-else-if="showProgramDropdown && !programs.length" class="hint" style="display: block;">
            No programs configured for this agency.
          </small>
        </div>
      </div>

      <div class="row" style="margin-top: 16px;">
        <div class="col">
          <label class="label">Date of Service (optional)</label>
          <input v-model="dateOfService" type="date" class="input" />
        </div>
        <div class="col">
          <label class="label">Add Initials (optional)</label>
          <input v-model="initials" type="text" class="input" maxlength="16" placeholder="e.g., MM" />
        </div>
      </div>

      <div style="margin-top: 16px;">
        <label class="label">Input</label>
        <textarea v-model="inputText" class="textarea" rows="10" placeholder="Paste or type your session details here…" />

        <div class="actions">
          <button class="btn btn-secondary" type="button" :disabled="recordingBusy" @click="toggleRecording">
            {{ recording ? 'Stop recording' : 'Record audio' }}
          </button>
          <button class="btn btn-secondary" type="button" :disabled="!audioBlob || recording" @click="clearAudio">
            Clear recording
          </button>
          <button
            class="btn btn-secondary"
            type="button"
            :disabled="!audioBlob || recording || serverTranscribing"
            @click="transcribeAudioServer"
          >
            {{ serverTranscribing ? 'Transcribing…' : 'Transcribe audio (server)' }}
          </button>
          <button class="btn btn-primary" type="button" :disabled="generateDisabled" @click="generateNote">
            {{ generating ? 'Generating…' : 'Generate note' }}
          </button>
        </div>

        <small v-if="recording" class="hint">
          Recording… {{ transcribing ? 'Transcribing live.' : speechSupported ? 'Transcription starting…' : 'Transcription not supported in this browser.' }}
        </small>
        <small v-if="liveTranscript" class="hint">
          Live transcript: {{ liveTranscript }}
        </small>
        <small v-if="audioBlob" class="hint">
          Audio captured ({{ audioMimeType || 'unknown type' }}) — will be uploaded with your request.
        </small>
        <small v-if="serverTranscribeError" class="error">{{ serverTranscribeError }}</small>
        <small v-if="generateError" class="error">{{ generateError }}</small>
      </div>

      <div style="margin-top: 18px;">
        <label class="label">Output</label>
        <div v-if="sectionEntries.length === 0" class="empty-state">
          <strong>No output yet</strong>
          <div class="muted">Generated sections will appear here as separate cards.</div>
        </div>
        <div v-else class="cards">
          <div v-for="[title, text] in sectionEntries" :key="title" class="note-card">
            <div class="note-card-header">
              <div class="note-card-title">{{ title }}</div>
              <button class="icon-btn" type="button" :disabled="!text" @click="copyText(text)">
                Copy
              </button>
            </div>
            <pre class="note-card-body">{{ text }}</pre>
          </div>
        </div>
        <div class="actions">
          <span v-if="copied" class="hint">Copied.</span>
        </div>
      </div>

      <div class="divider" />

      <div>
        <div class="row" style="align-items: center;">
          <div class="col">
            <h3 class="h3" style="margin: 0;">Recent drafts (last 7 days)</h3>
            <p class="muted" style="margin: 6px 0 0 0;">Expandable list of drafts and generated notes.</p>
          </div>
          <div class="col" style="display: flex; justify-content: flex-end;">
            <button class="btn btn-secondary" type="button" @click="toggleRecent">
              {{ showRecent ? 'Hide' : 'Show' }}
            </button>
          </div>
        </div>

        <div v-if="showRecent" style="margin-top: 12px;">
          <div v-if="recentLoading" class="muted">Loading…</div>
          <div v-else-if="recentError" class="error">{{ recentError }}</div>
          <div v-else-if="recentDrafts.length === 0" class="muted">No drafts found.</div>
          <div v-else class="recent-list">
            <div class="actions" style="justify-content: space-between; margin-bottom: 8px;">
              <label class="checkbox">
                <input type="checkbox" :checked="allRecentSelected" @change="toggleSelectAllRecent" />
                <span>Select all</span>
              </label>
              <div class="actions" style="gap: 8px;">
                <button class="btn btn-secondary" type="button" :disabled="!selectedDraftIds.length || deletingDrafts" @click="deleteSelectedDrafts">
                  {{ deletingDrafts ? 'Deleting…' : 'Delete selected' }}
                </button>
                <button class="btn btn-danger" type="button" :disabled="!recentDrafts.length || deletingDrafts" @click="deleteAllRecentDrafts">
                  {{ deletingDrafts ? 'Deleting…' : 'Delete all' }}
                </button>
              </div>
            </div>
            <details v-for="d in recentDrafts" :key="d.id" class="recent-item">
              <summary>
                <label class="checkbox" style="margin-right: 10px;">
                  <input
                    type="checkbox"
                    :checked="selectedDraftIds.includes(String(d.id))"
                    @change="toggleDraftSelection(d.id)"
                    @click.stop
                  />
                  <span>Select</span>
                </label>
                <strong>#{{ d.id }}</strong>
                <span class="muted" style="margin-left: 8px;">
                  {{ formatDateTime(d.created_at) }} — {{ d.service_code || 'No code' }}
                </span>
              </summary>
              <div class="recent-body">
                <div class="muted" style="margin-bottom: 10px;">
                  <strong>Service Code:</strong> {{ d.service_code || '—' }} ·
                  <strong>Program:</strong> {{ programLabel(d.program_id) }} ·
                  <strong>Initials:</strong> {{ d.initials || '—' }} ·
                  <strong>DOS:</strong> {{ d.date_of_service ? String(d.date_of_service).slice(0, 10) : '—' }}
                </div>
                <div v-if="draftSections(d).length" class="cards">
                  <div v-for="[title, text] in draftSections(d)" :key="title" class="note-card">
                    <div class="note-card-header">
                      <div class="note-card-title">{{ title }}</div>
                      <button class="icon-btn" type="button" :disabled="!text" @click="copyText(text)">
                        Copy
                      </button>
                    </div>
                    <pre class="note-card-body">{{ text }}</pre>
                  </div>
                </div>
                <div v-else class="muted">No generated output stored for this draft.</div>
              </div>
            </details>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useAgencyStore } from '../../store/agency';
import { useRoute } from 'vue-router';
import api from '../../services/api';

const agencyStore = useAgencyStore();
const route = useRoute();

const orgTo = (path) => {
  const slug = route.params.organizationSlug;
  if (typeof slug === 'string' && slug) return `/${slug}${path}`;
  return path;
};

const currentAgencyId = computed(() => agencyStore.currentAgency?.id || null);

const parseFeatureFlags = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'object') return raw || {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) || {}; } catch { return {}; }
  }
  return {};
};
const isTruthyFlag = (v) => {
  if (v === true || v === 1) return true;
  const s = String(v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
};
const clinicalNoteGeneratorEnabled = computed(() => {
  const flags = parseFeatureFlags(agencyStore.currentAgency?.feature_flags);
  // Back-compat: paid toggle may be stored as noteAidEnabled or clinicalNoteGeneratorEnabled.
  return isTruthyFlag(flags?.noteAidEnabled) || isTruthyFlag(flags?.clinicalNoteGeneratorEnabled);
});
const canUseTool = computed(() => !!currentAgencyId.value && clinicalNoteGeneratorEnabled.value);

// Context (credential + eligible codes)
const loadingContext = ref(false);
const contextError = ref('');
const providerCredentialText = ref('');
const derivedTier = ref('unknown');
const eligibleServiceCodes = ref(null); // array|null

// Programs (for H2014)
const programs = ref([]);
const selectedProgram = computed(() => {
  const id = String(selectedProgramId.value || '');
  return programs.value.find((p) => String(p?.id) === id) || null;
});
const isH2014ProgramName = (name) => {
  const s = String(name || '').toLowerCase();
  if (!s) return false;
  return s.includes('pcp') || s.includes('tpt') || s.includes('skill builder') || s.includes('skillbuilder') || s.includes('h2014');
};
const formatProgramLabel = (program) => {
  const name = program?.name || `Program #${program?.id}`;
  return isH2014ProgramName(name) ? `${name} (H2014)` : name;
};

// Form state
const selectedServiceCode = ref('');
const otherServiceCode = ref('');
const selectedProgramId = ref('');
const dateOfService = ref('');
const initials = ref('');
const inputText = ref('');
const autoSelectCode = ref(false);
const forceAutoSelect = computed(() => String(derivedTier.value || '') === 'unknown');

// Draft state
const draftId = ref(null);
const lastSavedAt = ref('');
let autosaveTimer = null;

// Recording state
const recording = ref(false);
const recordingBusy = ref(false);
const audioBlob = ref(null);
const audioMimeType = ref('');
let mediaRecorder = null;
let mediaStream = null;
let audioChunks = [];
let speechRecognition = null;
const speechSupported = ref(false);
const transcribing = ref(false);
const liveTranscript = ref('');

// Output state
const generating = ref(false);
const generateError = ref('');
const outputObj = ref(null);
const copied = ref(false);
const serverTranscribing = ref(false);
const serverTranscribeError = ref('');

// Recent drafts
const showRecent = ref(false);
const recentLoading = ref(false);
const recentError = ref('');
const recentDrafts = ref([]);
const selectedDraftIds = ref([]);
const deletingDrafts = ref(false);

const STATIC_COMMON_CODES = [
  // QBHA
  'H0023',
  'H0025',
  'H2014',
  'H2015',
  'H2016',
  'H2017',
  'H2018',
  'H2021',
  'H2022',
  'S9454',
  '97535',
  // Bachelor+
  'H0004',
  'H0031',
  'H0032',
  'H2033',
  'T1017',
  // Common psychotherapy/intake codes in your agent set
  'H0002',
  '90791',
  '90832',
  '90834',
  '90837',
  '90846',
  '90847',
  // Supervision accrual codes used elsewhere in the system
  '99414',
  '99416'
];

const SERVICE_CODE_DESCRIPTIONS = {
  '90791': 'Psychiatric diagnostic intake/assessment.',
  '90832': 'Individual therapy, 16-37 minutes.',
  '90834': 'Individual therapy, 38-52 minutes.',
  '90837': 'Individual therapy, 53+ minutes.',
  '90846': 'Family therapy without client present.',
  '90847': 'Family/couples therapy with client present.',
  'H0002': 'Behavioral health screening/intake-type support.',
  'H0004': 'Individual counseling/therapy tied to plan goals.',
  'H0023': 'Behavioral health outreach and engagement.',
  'H0025': 'Behavioral health prevention education.',
  'H0031': 'Clinical assessment and treatment recommendations.',
  'H0032': 'Treatment/service plan development and updates.',
  'H2014': 'Skills training/development and community support.',
  'H2015': 'Comprehensive community support (children/adolescents).',
  'H2016': 'H2015 extended/day-format variant.',
  'H2017': 'Psychosocial rehab/add-on support (per policy/catalog).',
  'H2018': 'Psychosocial rehab extended support (per policy/catalog).',
  'H2021': 'Wrap-around/community-based support services.',
  'H2022': 'H2021 extended/day-format variant.',
  'H2033': 'Intensive home/family/community treatment.',
  'T1017': 'Case management and care coordination.',
  'S9454': 'Stress management education class.',
  '97535': 'Self-care/home-management training.',
  '99414': 'Supervision accrual/support code.',
  '99416': 'Supervision accrual/support code (extended).'
};

// Allow manual entry if a code isn't listed; backend still enforces eligibility.
const canUseOtherCode = computed(() => true);

const serviceCodeOptions = computed(() => {
  const raw = eligibleServiceCodes.value;
  const list = Array.isArray(raw) ? raw : STATIC_COMMON_CODES;
  return Array.from(new Set(list.map((c) => String(c || '').trim().toUpperCase()).filter(Boolean))).sort();
});

const serviceCodeDescription = (code) => SERVICE_CODE_DESCRIPTIONS[String(code || '').trim().toUpperCase()] || '';
const serviceCodeOptionLabel = (code) => {
  const normalized = String(code || '').trim().toUpperCase();
  const desc = serviceCodeDescription(normalized);
  return desc ? `${normalized} — ${desc}` : normalized;
};

const actualServiceCode = computed(() => {
  if (selectedServiceCode.value === '__other__') return String(otherServiceCode.value || '').trim().toUpperCase();
  return String(selectedServiceCode.value || '').trim().toUpperCase();
});

const showProgramDropdown = computed(() => actualServiceCode.value === 'H2014');

watch(showProgramDropdown, (on) => {
  if (!on) selectedProgramId.value = '';
});
watch(autoSelectCode, (on) => {
  if (on) {
    selectedServiceCode.value = '';
    otherServiceCode.value = '';
    selectedProgramId.value = '';
  }
});
watch(forceAutoSelect, (on) => {
  if (on) {
    autoSelectCode.value = true;
    selectedServiceCode.value = '';
    otherServiceCode.value = '';
    selectedProgramId.value = '';
  }
});

const eligibleCodesLabel = computed(() => {
  if (Array.isArray(eligibleServiceCodes.value)) return `${eligibleServiceCodes.value.length}`;
  if (String(derivedTier.value || '').toLowerCase() === 'intern_plus') return 'All codes (enter manually if not listed)';
  return '';
});

const generateDisabled = computed(() => {
  if (generating.value) return true;
  if (recording.value || recordingBusy.value) return true;
  const sc = actualServiceCode.value;
  if (!autoSelectCode.value && !forceAutoSelect.value && !sc) return true;
  const hasText = !!String(inputText.value || '').trim();
  const hasAudio = !!audioBlob.value;
  if (!hasText && !hasAudio) return true;
  return false;
});

function extractSections(obj) {
  if (!obj || typeof obj !== 'object') return {};
  if (obj.sections && typeof obj.sections === 'object' && !Array.isArray(obj.sections)) return obj.sections;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = String(k || '').trim();
    if (!key) continue;
    if (key.toLowerCase() === 'meta' || key.toLowerCase() === 'metadata') continue;
    if (typeof v === 'string') out[key] = v;
  }
  return out;
}

const sectionEntries = computed(() => {
  const sections = extractSections(outputObj.value);
  return Object.entries(sections);
});

const copyText = async (text) => {
  try {
    const t = String(text || '');
    if (!t) return;
    copied.value = false;
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(t);
    } else {
      const ta = document.createElement('textarea');
      ta.value = t;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    copied.value = true;
    window.setTimeout(() => (copied.value = false), 1500);
  } catch {
    // ignore
  }
};

const loadContext = async () => {
  try {
    if (!canUseTool.value) return;
    loadingContext.value = true;
    contextError.value = '';
    const res = await api.get('/clinical-notes/context', { params: { agencyId: currentAgencyId.value } });
    providerCredentialText.value = String(res?.data?.providerCredentialText || '');
    derivedTier.value = String(res?.data?.derivedTier || 'unknown');
    eligibleServiceCodes.value = res?.data?.eligibleServiceCodes ?? null;
  } catch (e) {
    contextError.value = e.response?.data?.error?.message || 'Failed to load user context';
    providerCredentialText.value = '';
    derivedTier.value = 'unknown';
    eligibleServiceCodes.value = null;
  } finally {
    loadingContext.value = false;
  }
};

const loadPrograms = async () => {
  try {
    if (!canUseTool.value) return;
    const res = await api.get('/clinical-notes/programs', { params: { agencyId: currentAgencyId.value } });
    programs.value = Array.isArray(res?.data?.programs) ? res.data.programs : [];
  } catch {
    programs.value = [];
  }
};

const programLabel = (programId) => {
  if (!programId) return '—';
  const match = programs.value.find((p) => String(p?.id) === String(programId));
  return match?.name ? `${match.name} (#${match.id})` : `#${programId}`;
};

const autosave = async () => {
  if (!canUseTool.value) return;
  // Save only form state (no audio).
  const payload = {
    agencyId: currentAgencyId.value,
    serviceCode: autoSelectCode.value ? null : actualServiceCode.value || null,
    programId:
      showProgramDropdown.value && selectedProgram.value && !selectedProgram.value?.isCustom
        ? Number(selectedProgramId.value)
        : null,
    programLabel:
      showProgramDropdown.value && selectedProgram.value?.isCustom
        ? String(selectedProgram.value?.name || '').trim()
        : null,
    dateOfService: dateOfService.value ? String(dateOfService.value) : null,
    initials: initials.value ? String(initials.value) : null,
    inputText: String(inputText.value || '')
  };

  // If nothing meaningful yet, skip.
  const hasAny =
    !!String(payload.serviceCode || '').trim() ||
    !!String(payload.programId || '').trim() ||
    !!String(payload.dateOfService || '').trim() ||
    !!String(payload.initials || '').trim() ||
    !!String(payload.inputText || '').trim();
  if (!hasAny) return;

  try {
    if (!draftId.value) {
      const res = await api.post('/clinical-notes/drafts', payload, { skipGlobalLoading: true });
      draftId.value = res?.data?.draft?.id || null;
    } else {
      await api.patch(`/clinical-notes/drafts/${draftId.value}`, payload, { skipGlobalLoading: true });
    }
    lastSavedAt.value = new Date().toLocaleString();
  } catch {
    // best-effort: do not block the user
  }
};

const toggleRecording = async () => {
  if (recordingBusy.value) return;
  if (recording.value) {
    try {
      recordingBusy.value = true;
      mediaRecorder?.stop?.();
      stopTranscription();
    } catch {
      recording.value = false;
      recordingBusy.value = false;
    }
    return;
  }

  try {
    recordingBusy.value = true;
    audioChunks = [];
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new MediaRecorder(mediaStream);
    mediaRecorder = mr;
    audioMimeType.value = mr.mimeType || '';
    mr.ondataavailable = (e) => {
      if (e?.data && e.data.size > 0) audioChunks.push(e.data);
    };
    mr.onstop = () => {
      try {
        const blob = new Blob(audioChunks, { type: mr.mimeType || 'audio/webm' });
        audioBlob.value = blob.size > 0 ? blob : null;
      } catch {
        audioBlob.value = null;
      }
      try {
        mediaStream?.getTracks?.().forEach((t) => t.stop());
      } catch {
        // ignore
      }
      mediaStream = null;
      mediaRecorder = null;
      audioChunks = [];
      recording.value = false;
      recordingBusy.value = false;
      stopTranscription();
    };
    mr.onerror = () => {
      try {
        mediaStream?.getTracks?.().forEach((t) => t.stop());
      } catch {
        // ignore
      }
      mediaStream = null;
      mediaRecorder = null;
      audioChunks = [];
      recording.value = false;
      recordingBusy.value = false;
      stopTranscription();
    };
    mr.start();
    startTranscription();
    recording.value = true;
    recordingBusy.value = false;
  } catch {
    recording.value = false;
    recordingBusy.value = false;
    stopTranscription();
  }
};

const clearAudio = () => {
  audioBlob.value = null;
  audioMimeType.value = '';
};

const transcribeAudioServer = async () => {
  if (!audioBlob.value || serverTranscribing.value) return;
  if (!currentAgencyId.value) return;
  try {
    serverTranscribing.value = true;
    serverTranscribeError.value = '';
    const fd = new FormData();
    fd.append('agencyId', String(currentAgencyId.value));
    const name = `audio.${(audioBlob.value.type || '').includes('webm') ? 'webm' : 'blob'}`;
    fd.append('audio', audioBlob.value, name);
    const res = await api.post('/clinical-notes/transcribe', fd);
    const transcript = String(res?.data?.transcriptText || '').trim();
    if (transcript) {
      appendTranscript(transcript);
      transcriptSource.value = 'audio';
    } else {
      serverTranscribeError.value = 'No transcript returned.';
    }
  } catch (e) {
    serverTranscribeError.value = e.response?.data?.error?.message || 'Failed to transcribe audio';
  } finally {
    serverTranscribing.value = false;
  }
};

const transcriptSource = ref('');

const appendTranscript = (text) => {
  const trimmed = String(text || '').trim();
  if (!trimmed) return;
  const current = String(inputText.value || '');
  const combined = `${current}${current && !current.endsWith(' ') ? ' ' : ''}${trimmed}`.trim();
  inputText.value = combined.slice(0, 12000);
};

const startTranscription = () => {
  liveTranscript.value = '';
  transcribing.value = false;
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) return;
  try {
    speechRecognition = new SpeechRec();
    speechRecognition.continuous = true;
    speechRecognition.interimResults = true;
    speechRecognition.lang = navigator?.language || 'en-US';
    speechRecognition.onresult = (event) => {
      let interim = '';
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const res = event.results[i];
        const transcript = String(res?.[0]?.transcript || '').trim();
        if (!transcript) continue;
        if (res.isFinal) finalText += `${transcript} `;
        else interim += `${transcript} `;
      }
      liveTranscript.value = interim.trim();
      if (finalText.trim()) {
        appendTranscript(finalText);
        liveTranscript.value = '';
      }
      if (String(inputText.value || '').length >= 11800) {
        stopTranscription();
      }
    };
    speechRecognition.onerror = () => {
      stopTranscription();
    };
    speechRecognition.onend = () => {
      transcribing.value = false;
    };
    speechRecognition.start();
    transcribing.value = true;
  } catch {
    stopTranscription();
  }
};

const stopTranscription = () => {
  try {
    speechRecognition?.stop?.();
  } catch {
    // ignore
  }
  speechRecognition = null;
  transcribing.value = false;
  liveTranscript.value = '';
};

const generateNote = async () => {
  if (generateDisabled.value) return;
  if (!canUseTool.value) return;
  try {
    generating.value = true;
    generateError.value = '';

    const fd = new FormData();
    fd.append('agencyId', String(currentAgencyId.value));
    if (!autoSelectCode.value && !forceAutoSelect.value && actualServiceCode.value) {
      fd.append('serviceCode', actualServiceCode.value);
    }
    fd.append('autoSelectCode', String(autoSelectCode.value || forceAutoSelect.value));
    if (selectedProgram.value?.isCustom && selectedProgram.value?.name) {
      fd.append('programLabel', String(selectedProgram.value.name));
    } else if (showProgramDropdown.value && selectedProgramId.value) {
      fd.append('programId', String(selectedProgramId.value));
    }
    if (transcriptSource.value) fd.append('transcriptSource', transcriptSource.value);
    if (showProgramDropdown.value && selectedProgramId.value) fd.append('programId', String(selectedProgramId.value));
    if (dateOfService.value) fd.append('dateOfService', String(dateOfService.value));
    if (initials.value) fd.append('initials', String(initials.value));
    fd.append('inputText', String(inputText.value || ''));
    if (draftId.value) fd.append('draftId', String(draftId.value));
    if (audioBlob.value) {
      const name = `audio.${(audioBlob.value.type || '').includes('webm') ? 'webm' : 'blob'}`;
      fd.append('audio', audioBlob.value, name);
    }

    const res = await api.post('/clinical-notes/generate', fd);
    outputObj.value = res?.data?.outputJson || null;
    if (res?.data?.draftId) draftId.value = res.data.draftId;

    // Refresh recent list if open.
    if (showRecent.value) await loadRecent();
  } catch (e) {
    const base = e.response?.data?.error?.message || 'Failed to generate note';
    const details = e.response?.data?.error?.details;
    generateError.value = details ? `${base} (${details})` : base;
  } finally {
    generating.value = false;
  }
};

const formatDateTime = (raw) => {
  try {
    if (!raw) return '';
    return new Date(raw).toLocaleString();
  } catch {
    return String(raw || '');
  }
};

const loadRecent = async () => {
  if (!canUseTool.value) return;
  try {
    recentLoading.value = true;
    recentError.value = '';
    const res = await api.get('/clinical-notes/recent', { params: { agencyId: currentAgencyId.value, days: 7 } });
    recentDrafts.value = Array.isArray(res?.data?.drafts) ? res.data.drafts : [];
    selectedDraftIds.value = selectedDraftIds.value.filter((id) =>
      recentDrafts.value.some((d) => String(d.id) === String(id))
    );
  } catch (e) {
    recentError.value = e.response?.data?.error?.message || 'Failed to load recent drafts';
    recentDrafts.value = [];
    selectedDraftIds.value = [];
  } finally {
    recentLoading.value = false;
  }
};

const toggleRecent = async () => {
  showRecent.value = !showRecent.value;
  if (showRecent.value) await loadRecent();
};

const allRecentSelected = computed(() => {
  if (!recentDrafts.value.length) return false;
  return recentDrafts.value.every((d) => selectedDraftIds.value.includes(String(d.id)));
});

const toggleDraftSelection = (draftId) => {
  const id = String(draftId);
  if (selectedDraftIds.value.includes(id)) {
    selectedDraftIds.value = selectedDraftIds.value.filter((v) => v !== id);
  } else {
    selectedDraftIds.value = [...selectedDraftIds.value, id];
  }
};

const toggleSelectAllRecent = () => {
  if (allRecentSelected.value) {
    selectedDraftIds.value = [];
  } else {
    selectedDraftIds.value = recentDrafts.value.map((d) => String(d.id));
  }
};

const deleteSelectedDrafts = async () => {
  if (!currentAgencyId.value || deletingDrafts.value) return;
  if (!selectedDraftIds.value.length) return;
  if (!window.confirm(`Delete ${selectedDraftIds.value.length} draft(s)? This cannot be undone.`)) return;
  try {
    deletingDrafts.value = true;
    await api.post('/clinical-notes/drafts/delete', {
      agencyId: currentAgencyId.value,
      draftIds: selectedDraftIds.value.map((id) => parseInt(id, 10))
    });
    await loadRecent();
    selectedDraftIds.value = [];
  } catch (e) {
    recentError.value = e.response?.data?.error?.message || 'Failed to delete drafts';
  } finally {
    deletingDrafts.value = false;
  }
};

const deleteAllRecentDrafts = async () => {
  if (!recentDrafts.value.length) return;
  selectedDraftIds.value = recentDrafts.value.map((d) => String(d.id));
  await deleteSelectedDrafts();
};

const draftSections = (draftRow) => {
  try {
    const raw = draftRow?.output_json;
    if (!raw) return [];
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Object.entries(extractSections(obj));
  } catch {
    return [];
  }
};

onMounted(async () => {
  speechSupported.value = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  if (canUseTool.value) {
    await loadContext();
    await loadPrograms();
  }

  autosaveTimer = window.setInterval(() => {
    autosave();
  }, 30_000);
});

watch([currentAgencyId, clinicalNoteGeneratorEnabled], async () => {
  // Reset state when switching orgs (or when enabled toggles).
  providerCredentialText.value = '';
  derivedTier.value = 'unknown';
  eligibleServiceCodes.value = null;
  programs.value = [];
  draftId.value = null;
  lastSavedAt.value = '';
  recentDrafts.value = [];
  recentError.value = '';
  contextError.value = '';
  generateError.value = '';
  outputObj.value = null;
  if (canUseTool.value) {
    await loadContext();
    await loadPrograms();
    if (showRecent.value) await loadRecent();
  }
});

onBeforeUnmount(() => {
  if (autosaveTimer) {
    window.clearInterval(autosaveTimer);
    autosaveTimer = null;
  }
  stopTranscription();
  try {
    mediaRecorder?.stop?.();
  } catch {
    // ignore
  }
  try {
    mediaStream?.getTracks?.().forEach((t) => t.stop());
  } catch {
    // ignore
  }
});
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
}

.back-link {
  display: inline-block;
  margin-bottom: 10px;
  color: var(--text-secondary);
  text-decoration: none;
}

.back-link:hover {
  text-decoration: underline;
}

.subtitle {
  margin: 6px 0 0 0;
  color: var(--text-secondary);
}

.content-card {
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
}

.banner {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px 16px;
  margin-bottom: 14px;
  background: var(--bg-alt);
}

.banner.warning {
  border-color: var(--border);
}

.row {
  display: flex;
  gap: 18px;
  align-items: flex-start;
  flex-wrap: wrap;
}

.col {
  flex: 1;
  min-width: 320px;
}

.label {
  display: block;
  font-weight: 700;
  margin-bottom: 8px;
  color: var(--text-primary);
}

.label.sub {
  font-weight: 600;
  margin-bottom: 6px;
}

.input,
.textarea,
select {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 14px;
  background: var(--bg);
  color: var(--text-primary);
}

.textarea {
  resize: vertical;
}

.hint {
  display: block;
  margin-top: 8px;
  color: var(--text-secondary);
}

.muted {
  color: var(--text-secondary);
}

.error {
  display: block;
  margin-top: 10px;
  color: #b42318;
}

.actions {
  display: flex;
  gap: 10px;
  margin-top: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.divider {
  height: 1px;
  background: var(--border);
  margin: 18px 0;
}

.h3 {
  margin: 0 0 6px 0;
}

.empty-state {
  padding: 16px;
  border: 1px dashed var(--border);
  border-radius: 12px;
  background: var(--bg-alt);
}

.cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.note-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: white;
  overflow: hidden;
}

.note-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-alt);
}

.note-card-title {
  font-weight: 800;
  color: var(--text-primary);
}

.icon-btn {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 6px 10px;
  background: white;
  cursor: pointer;
  font-weight: 700;
}

.icon-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.note-card-body {
  margin: 0;
  padding: 12px;
  white-space: pre-wrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 13px;
  line-height: 1.4;
  color: var(--text-primary);
}

.recent-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.recent-item {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px 12px;
  background: white;
}

.recent-item summary {
  cursor: pointer;
}

.recent-body {
  margin-top: 12px;
}
</style>

