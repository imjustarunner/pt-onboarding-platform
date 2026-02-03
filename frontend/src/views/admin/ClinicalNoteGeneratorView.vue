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
      <div class="muted">⚠️ Privacy Notice: This draft will be permanently deleted in 14 days.</div>
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
          <select v-model="selectedServiceCode" class="input">
            <option value="" disabled>Select a service code</option>
            <option v-for="code in serviceCodeOptions" :key="code" :value="code">{{ code }}</option>
            <option v-if="canUseOtherCode" value="__other__">Other (enter code)</option>
          </select>

          <div v-if="selectedServiceCode === '__other__'" style="margin-top: 10px;">
            <label class="label sub">Other service code</label>
            <input v-model="otherServiceCode" class="input" placeholder="e.g., 90834" />
          </div>
        </div>

        <div class="col">
          <label class="label">Program (H2014 only)</label>
          <select v-model="selectedProgramId" class="input" :disabled="!showProgramDropdown">
            <option value="">No program</option>
            <option v-for="p in programs" :key="p.id" :value="String(p.id)">
              {{ p.name || `Program #${p.id}` }}
            </option>
          </select>
          <small class="hint">Only H2014 uses programs.</small>
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
          <button class="btn btn-primary" type="button" :disabled="generateDisabled" @click="generateNote">
            {{ generating ? 'Generating…' : 'Generate note' }}
          </button>
        </div>

        <small v-if="audioBlob" class="hint">
          Audio captured ({{ audioMimeType || 'unknown type' }}) — will be uploaded with your request.
        </small>
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
            <details v-for="d in recentDrafts" :key="d.id" class="recent-item">
              <summary>
                <strong>#{{ d.id }}</strong>
                <span class="muted" style="margin-left: 8px;">
                  {{ formatDateTime(d.created_at) }} — {{ d.service_code || 'No code' }}
                </span>
              </summary>
              <div class="recent-body">
                <div class="muted" style="margin-bottom: 10px;">
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

// Form state
const selectedServiceCode = ref('');
const otherServiceCode = ref('');
const selectedProgramId = ref('');
const dateOfService = ref('');
const initials = ref('');
const inputText = ref('');

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

// Output state
const generating = ref(false);
const generateError = ref('');
const outputObj = ref(null);
const copied = ref(false);

// Recent drafts
const showRecent = ref(false);
const recentLoading = ref(false);
const recentError = ref('');
const recentDrafts = ref([]);

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

// Allow manual entry if a code isn't listed; backend still enforces eligibility.
const canUseOtherCode = computed(() => true);

const serviceCodeOptions = computed(() => {
  const raw = eligibleServiceCodes.value;
  const list = Array.isArray(raw) ? raw : STATIC_COMMON_CODES;
  return Array.from(new Set(list.map((c) => String(c || '').trim().toUpperCase()).filter(Boolean))).sort();
});

const actualServiceCode = computed(() => {
  if (selectedServiceCode.value === '__other__') return String(otherServiceCode.value || '').trim().toUpperCase();
  return String(selectedServiceCode.value || '').trim().toUpperCase();
});

const showProgramDropdown = computed(() => actualServiceCode.value === 'H2014');

watch(showProgramDropdown, (on) => {
  if (!on) selectedProgramId.value = '';
});

const eligibleCodesLabel = computed(() => {
  if (Array.isArray(eligibleServiceCodes.value)) return `${eligibleServiceCodes.value.length}`;
  if (String(derivedTier.value || '').toLowerCase() === 'intern_plus') return 'All codes (enter manually if not listed)';
  return '';
});

const generateDisabled = computed(() => {
  if (generating.value) return true;
  const sc = actualServiceCode.value;
  if (!sc) return true;
  if (!String(inputText.value || '').trim()) return true;
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

const autosave = async () => {
  if (!canUseTool.value) return;
  // Save only form state (no audio).
  const payload = {
    agencyId: currentAgencyId.value,
    serviceCode: actualServiceCode.value || null,
    programId: showProgramDropdown.value && selectedProgramId.value ? Number(selectedProgramId.value) : null,
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
    };
    mr.start();
    recording.value = true;
    recordingBusy.value = false;
  } catch {
    recording.value = false;
    recordingBusy.value = false;
  }
};

const clearAudio = () => {
  audioBlob.value = null;
  audioMimeType.value = '';
};

const generateNote = async () => {
  if (generateDisabled.value) return;
  if (!canUseTool.value) return;
  try {
    generating.value = true;
    generateError.value = '';

    const fd = new FormData();
    fd.append('agencyId', String(currentAgencyId.value));
    fd.append('serviceCode', actualServiceCode.value);
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
    generateError.value = e.response?.data?.error?.message || 'Failed to generate note';
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
  } catch (e) {
    recentError.value = e.response?.data?.error?.message || 'Failed to load recent drafts';
    recentDrafts.value = [];
  } finally {
    recentLoading.value = false;
  }
};

const toggleRecent = async () => {
  showRecent.value = !showRecent.value;
  if (showRecent.value) await loadRecent();
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

