<template>
  <div class="sr-page">
    <header class="sr-header">
      <div>
        <h1>{{ phase === 'live' ? 'Live Session Recording' : 'Session Recording Setup' }}</h1>
        <p class="sr-sub">
          {{
            phase === 'live'
              ? 'Capture the session, monitor transcription, and generate structured documentation in real time.'
              : 'Review details and confirm settings before you begin recording.'
          }}
        </p>
      </div>
      <div class="sr-status-pill" :class="{ live: phase === 'live' && recording }">
        <span class="dot" />
        {{ phase === 'live' && recording ? `Recording ${timerLabel}` : phase === 'live' ? 'Paused' : 'Ready to Record' }}
      </div>
    </header>

    <p v-if="accessError" class="sr-error">{{ accessError }}</p>
    <p v-if="busyError" class="sr-error">{{ busyError }}</p>

    <!-- SETUP -->
    <div v-if="phase === 'setup' && !accessError" class="sr-grid">
      <section class="sr-card">
        <div class="sr-card-head">
          <h2>Session Overview</h2>
          <button type="button" class="linkish" @click="editingOverview = !editingOverview">
            {{ editingOverview ? 'Done' : 'Edit' }}
          </button>
        </div>
        <div class="sr-fields">
          <label>
            Client
            <select v-model="form.clientId" :disabled="!editingOverview && !!queryClientId">
              <option value="">— Select or create via consent —</option>
              <option v-for="c in clients" :key="c.id" :value="String(c.id)">
                {{ c.fullName }}{{ c.dateOfBirth ? ` (${c.dateOfBirth})` : '' }}
              </option>
            </select>
          </label>
          <label>
            Search clients
            <input v-model="clientQuery" type="search" placeholder="Type to search…" @input="debouncedLoadClients" />
          </label>
          <label>
            Location / modality
            <input v-model="form.modalityLabel" :readonly="!editingOverview" />
          </label>
          <label>
            Date of service
            <input v-model="form.dateOfService" type="date" :readonly="!editingOverview" />
          </label>
          <label v-if="!isTutoringTenant">
            Note Aid template
            <select v-model="form.noteAidId">
              <option value="">— None (summary only) —</option>
              <option v-for="a in noteAids" :key="a.id" :value="a.id">{{ a.label }}</option>
            </select>
          </label>
        </div>
      </section>

      <section class="sr-card">
        <div class="sr-card-head">
          <h2>Audio Setup &amp; Recording Options</h2>
          <button type="button" class="btn-sm" @click="testMic" :disabled="micTesting">
            {{ micTesting ? 'Listening…' : 'Input Test' }}
          </button>
        </div>
        <label>
          Input device
          <select v-model="selectedDeviceId">
            <option v-for="d in audioDevices" :key="d.deviceId" :value="d.deviceId">{{ d.label || 'Microphone' }}</option>
          </select>
        </label>
        <div class="level-meter" aria-label="Input level">
          <div class="level-fill" :style="{ width: `${Math.round(inputLevel * 100)}%` }" />
        </div>
        <div class="toggles">
          <p class="hint setup-hint">
            Voices are separated automatically from the session audio when you end recording. No live transcript or manual speaker tagging is needed.
          </p>
          <label v-if="!isTutoringTenant" class="toggle">
            <input v-model="form.generateStructuredNote" type="checkbox" /> Generate structured note draft
          </label>
          <label class="toggle"><input v-model="form.highlightInterventions" type="checkbox" /> Highlight interventions / techniques</label>
        </div>
      </section>

      <section class="sr-card">
        <h2>Session Focus / Goals</h2>
        <textarea v-model="form.sessionFocus" rows="4" placeholder="Optional focus points for this session…" />
      </section>

      <section class="sr-card">
        <h2>Recording Checklist</h2>
        <ul class="checklist">
          <li :class="{ ok: consentOnFile || consentSignedThisSession || isSuperAdmin }">
            Consent confirmed and documented
            <button
              v-if="!consentOnFile && !consentSignedThisSession && !isSuperAdmin"
              type="button"
              class="btn-sm"
              @click="openConsentPanel"
            >
              Capture consent
            </button>
            <span v-else-if="consentOnFile || consentSignedThisSession" class="ok-tag">Done</span>
            <span v-else class="ok-tag">Skipped (test)</span>
          </li>
          <li :class="{ ok: !!form.clientId || isSuperAdmin }">
            Client on file
            <span v-if="!form.clientId && isSuperAdmin" class="hint">Optional for super admin test recordings.</span>
            <span v-else-if="!form.clientId" class="hint">Select a client, or capture consent with name and birthdate to create one.</span>
          </li>
          <li :class="{ ok: micReady }">Microphone connected and working</li>
          <li class="ok">Environment is quiet and private</li>
          <li v-if="!isTutoringTenant" :class="{ ok: !!form.noteAidId || !form.generateStructuredNote }">
            Note Aid template selected (or structured note off)
          </li>
        </ul>

        <div v-if="showConsentPanel" class="consent-panel">
          <h3>Audio recording consent</h3>
          <p class="hint">Enter the participant’s name and birthdate, then sign. If they match a client, the waiver is linked. If they are new, a client record is created so this consent stays on their file.</p>
          <label>
            Full name
            <input v-model="consentForm.fullName" />
          </label>
          <label>
            Date of birth
            <input v-model="consentForm.dateOfBirth" type="date" />
          </label>
          <label>
            Consent template
            <select v-model="consentForm.templateId">
              <option value="">Select template</option>
              <option v-for="t in audioAgreementTemplates" :key="t.id" :value="String(t.id)">{{ t.name }}</option>
            </select>
          </label>
          <div class="row-actions">
            <button type="button" class="btn-secondary" @click="showConsentPanel = false">Cancel</button>
            <button type="button" class="btn-primary" :disabled="consentBusy" @click="launchConsent">
              {{ consentBusy ? 'Opening…' : 'Open signing' }}
            </button>
          </div>
          <p v-if="consentError" class="sr-error">{{ consentError }}</p>
          <div v-if="consentTaskId" class="embed-sign">
            <DocumentSigningWorkflow :task-id="consentTaskId" @signed="onConsentSigned" />
          </div>
        </div>
      </section>

      <section v-if="!isTutoringTenant && selectedNoteAid" class="sr-card">
        <h2>Selected Note Aid</h2>
        <p><strong>{{ selectedNoteAid.label }}</strong></p>
        <p class="hint">{{ selectedNoteAid.guidance || 'Structured progress note from the session summary.' }}</p>
      </section>

      <section class="sr-card privacy">
        <h2>Privacy &amp; Compliance</h2>
        <p>
          Session audio is HIPAA-protected: it is transcribed, then deleted immediately. Nothing is retained in the browser
          after you leave this page. Transcript and summary text are stored encrypted at rest. We do not keep long-term
          audio recordings.
        </p>
      </section>

      <section class="sr-card sr-actions-card">
        <h2>Ready to record</h2>
        <p v-if="isSuperAdmin" class="hint">
          Super admin test mode: you can start without a client or consent to verify the recording flow.
        </p>
        <p v-else class="hint">Recording begins as soon as you click Start recording session.</p>
        <div class="action-buttons">
          <button type="button" class="btn-secondary" @click="cancelSetup">Cancel</button>
          <button type="button" class="btn-secondary" :disabled="busy" @click="saveSetup">Save setup</button>
          <button type="button" class="btn-primary" :disabled="!canStart || busy" @click="startSession">
            Start recording session
          </button>
        </div>
      </section>
    </div>

    <!-- LIVE -->
    <div v-else-if="phase === 'live'" class="sr-live">
      <div class="sr-live-main">
        <section class="sr-card">
          <div class="sr-card-head">
            <h2>Session Overview</h2>
            <span class="meta">{{ selectedClientLabel || 'Unlinked session' }}</span>
          </div>
          <div class="meta-row">
            <span>{{ form.modalityLabel || '—' }}</span>
            <span>{{ form.dateOfService || '—' }}</span>
          </div>
          <p v-if="selectedNoteAid" class="hint">Note Aid: {{ selectedNoteAid.label }}</p>
        </section>

        <section class="sr-card waveform">
          <div class="wave-bar" :style="{ transform: `scaleX(${0.2 + inputLevel * 0.8})` }" />
          <span class="live-tag"><span class="dot" /> Live {{ timerLabel }}</span>
        </section>

        <section class="sr-card recording-status">
          <h2>Recording in progress</h2>
          <p class="hint">
            Focus on the session. Audio is being captured; a speaker-labeled transcript and summary are generated automatically when you end recording.
          </p>
        </section>

        <section class="sr-card">
          <h2>Key Moments / Intervention Markers</h2>
          <div class="markers">
            <div v-for="(m, i) in markers" :key="i" class="marker">
              <strong>{{ m.time }}</strong> — {{ m.label }}
            </div>
            <button type="button" class="btn-sm" @click="addMarker">Add marker</button>
          </div>
        </section>

        <section class="sr-card sr-actions-card">
          <h2>Recording controls</h2>
          <div class="action-buttons">
            <button type="button" class="btn-secondary" @click="togglePause">
              {{ recording ? 'Pause recording' : 'Resume recording' }}
            </button>
            <button type="button" class="btn-secondary" @click="addMarker">Add marker</button>
            <button type="button" class="btn-danger" :disabled="ending" @click="endSession">
              {{ ending ? 'Processing…' : 'End recording' }}
            </button>
          </div>
          <div class="footer-status">
            <span>{{ recording ? 'Capturing audio' : 'Paused' }}</span>
            <span>{{ form.generateStructuredNote ? 'Summary + note on end' : 'Summary on end' }}</span>
          </div>
        </section>
      </div>

      <aside class="sr-live-side sr-card">
        <h2>Structured Note Draft</h2>
        <p class="hint">{{ isTutoringTenant ? 'Summary updates when recording ends.' : 'Draft updates when recording ends (and periodically if auto-draft is on).' }}</p>
        <p v-if="selectedNoteAid" class="meta">{{ selectedNoteAid.label }}</p>
        <div v-if="summaryResult" class="draft-body">
          <h3>Summary</h3>
          <p>{{ summaryResult.narrative }}</p>
          <h3 v-if="summaryResult.topics?.length">Topics</h3>
          <ul>
            <li v-for="t in summaryResult.topics || []" :key="t">{{ t }}</li>
          </ul>
          <h3 v-if="summaryResult.techniques?.length">Techniques</h3>
          <ul>
            <li v-for="t in summaryResult.techniques || []" :key="t">{{ t }}</li>
          </ul>
          <p v-if="summaryResult.speakerNotes" class="hint speaker-notes">
            <strong>Speaker notes:</strong> {{ summaryResult.speakerNotes }}
          </p>
          <div v-if="noteResult?.output?.text" class="note-out">
            <h3>Structured note</h3>
            <pre>{{ noteResult.output.text }}</pre>
          </div>
        </div>
        <p v-else class="hint">End recording to generate the Gemini Pro summary{{ form.generateStructuredNote ? ' and note' : '' }}.</p>
      </aside>
    </div>

    <!-- Results / shelf after complete -->
    <section v-if="phase === 'done'" class="sr-card done-card">
      <h2>Session complete</h2>
      <p class="hint">Audio was discarded. Encrypted summary is saved on your recording shelf.</p>
      <div v-if="summaryResult" class="draft-body">
        <h3>Summary</h3>
        <p>{{ summaryResult.narrative }}</p>
        <h3 v-if="summaryResult.topics?.length">Topics</h3>
        <div class="topics">
          <span v-for="t in summaryResult.topics" :key="t" class="pill">{{ t }}</span>
        </div>
        <h3 v-if="summaryResult.techniques?.length">Techniques</h3>
        <div class="topics">
          <span v-for="t in summaryResult.techniques" :key="t" class="pill">{{ t }}</span>
        </div>
        <p v-if="summaryResult.speakerNotes" class="hint speaker-notes">
          <strong>Speaker notes:</strong> {{ summaryResult.speakerNotes }}
        </p>
        <div v-if="noteResult?.output?.text">
          <h3>Structured note</h3>
          <pre>{{ noteResult.output.text }}</pre>
        </div>
        <div v-if="finalTranscriptLines.length" class="final-transcript">
          <h3>Speaker-labeled transcript</h3>
          <p class="hint">Voices were separated automatically from the session audio.</p>
          <div class="transcript-body compact">
            <div
              v-for="(line, idx) in finalTranscriptLines"
              :key="`final-${idx}`"
              class="t-line"
              :class="line.role"
            >
              <span class="t-speaker">{{ line.speaker }}</span>
              <span class="t-text">{{ line.text }}</span>
            </div>
          </div>
        </div>
      </div>
      <div class="row-actions">
        <button type="button" class="btn-secondary" @click="resetToSetup">New recording</button>
        <button type="button" class="btn-primary" @click="loadShelf">Refresh shelf</button>
      </div>
    </section>

    <section v-if="shelfNotes.length || shelfRecordings.length" class="sr-card shelf">
      <h2>Recording shelf</h2>
      <ul>
        <li v-for="r in shelfRecordings" :key="`r-${r.id}`">
          #{{ r.id }} · {{ r.sessionKind }} · {{ r.status }} · {{ r.dateOfService || r.createdAt }}
          <span v-if="r.summaryText" class="hint"> — has summary</span>
        </li>
        <li v-for="n in shelfNotes" :key="`n-${n.id}`">
          Note #{{ n.id }} · {{ n.toolId }} · {{ n.serviceCode || '—' }}
        </li>
      </ul>
    </section>

  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import api from '../../services/api';
import DocumentSigningWorkflow from '../../components/documents/DocumentSigningWorkflow.vue';
import { parseAgencyFeatureFlags } from '../../config/medicalBillingAccess.js';
import {
  SESSION_RECORDING_NOTE_AIDS,
  canUseSessionRecordingRole,
  isSessionRecordingEnabledForAgencyFlags
} from '../../config/sessionRecordingAccess.js';

const route = useRoute();
const router = useRouter();
const agencyStore = useAgencyStore();
const authStore = useAuthStore();

const agencyId = computed(() => Number(agencyStore.currentAgency?.id || 0) || null);
const role = computed(() => String(authStore.user?.role || '').toLowerCase());
const flags = computed(() => parseAgencyFeatureFlags(agencyStore.currentAgency?.feature_flags));

const accessError = ref('');
const busyError = ref('');
const busy = ref(false);
const phase = ref('setup');
const editingOverview = ref(true);
const isTutoringTenant = ref(false);
const noteAids = ref([...SESSION_RECORDING_NOTE_AIDS]);
const audioAgreementTemplates = ref([]);
const clients = ref([]);
const clientQuery = ref('');

const queryClientId = computed(() => String(route.query.clientId || route.query.client_id || ''));
const queryOfficeEventId = computed(() => String(route.query.officeEventId || route.query.office_event_id || ''));
const queryLearningSessionId = computed(() =>
  String(route.query.learningClassSessionId || route.query.learning_class_session_id || '')
);

const form = reactive({
  clientId: queryClientId.value || '',
  modalityLabel: String(route.query.modality || 'In person / Telehealth'),
  dateOfService: new Date().toISOString().slice(0, 10),
  noteAidId: '',
  sessionFocus: '',
  generateStructuredNote: true,
  highlightInterventions: true
});

const isSuperAdmin = computed(() => role.value === 'super_admin');

const selectedNoteAid = computed(() => {
  if (!form.noteAidId) return null;
  return noteAids.value.find((a) => a.id === form.noteAidId) || null;
});

const selectedClientLabel = computed(() => {
  const c = clients.value.find((x) => String(x.id) === String(form.clientId));
  return c?.fullName || '';
});

function selectedClientRow() {
  return clients.value.find((x) => String(x.id) === String(form.clientId)) || null;
}

async function applyClientId(clientId) {
  if (!clientId) return;
  form.clientId = String(clientId);
  if (consentForm.fullName) clientQuery.value = consentForm.fullName;
  await loadClients();
  if (!clients.value.some((c) => String(c.id) === String(clientId))) {
    clients.value = [
      {
        id: Number(clientId),
        fullName: consentForm.fullName || `Client ${clientId}`,
        dateOfBirth: consentForm.dateOfBirth || null
      },
      ...clients.value
    ];
  }
}

const consentOnFile = ref(false);
const consentSignedThisSession = ref(false);
const showConsentPanel = ref(false);
const consentBusy = ref(false);
const consentError = ref('');
const consentTaskId = ref(null);
const consentId = ref(null);
const consentForm = reactive({ fullName: '', dateOfBirth: '', templateId: '' });

const recordingId = ref(null);
const recording = ref(false);
const ending = ref(false);
const timerSeconds = ref(0);
const timerLabel = computed(() => {
  const m = Math.floor(timerSeconds.value / 60);
  const s = timerSeconds.value % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
});
let timerHandle = null;

const audioDevices = ref([]);
const selectedDeviceId = ref('');
const micReady = ref(false);
const micTesting = ref(false);
const inputLevel = ref(0);
let mediaStream = null;
let mediaRecorder = null;
let audioChunks = [];
let audioContext = null;
let analyser = null;
let levelRaf = null;

const markers = ref([]);
const summaryResult = ref(null);
const noteResult = ref(null);
const shelfRecordings = ref([]);
const shelfNotes = ref([]);
const finalTranscriptLines = ref([]);
const transcriptSource = ref('');

function speakerRoleFromLabel(label) {
  const normalized = String(label || '').trim().toLowerCase();
  if (['therapist', 'tutor', 'provider', 'clinician', 'counselor'].includes(normalized)) {
    return 'provider';
  }
  if (['client', 'student', 'patient', 'participant'].includes(normalized)) {
    return 'client';
  }
  return 'unknown';
}

function parseLabeledTranscript(text) {
  const lines = [];
  const raw = String(text || '').trim();
  if (!raw) return lines;
  for (const chunk of raw.split('\n')) {
    const line = chunk.trim();
    if (!line) continue;
    const match = line.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (match) {
      const speaker = match[1].trim();
      lines.push({
        time: '',
        speaker,
        role: speakerRoleFromLabel(speaker),
        text: match[2].trim()
      });
    } else {
      lines.push({ time: '', speaker: 'Transcript', role: 'unknown', text: line });
    }
  }
  return lines;
}

function applyFinalTranscript(text, source = '') {
  transcriptSource.value = source || '';
  finalTranscriptLines.value = parseLabeledTranscript(text);
}

const canStart = computed(() => {
  if (!agencyId.value || !micReady.value) return false;
  if (isSuperAdmin.value) return true;
  return !!form.clientId && (consentOnFile.value || consentSignedThisSession.value);
});

function assertAccess() {
  if (!agencyId.value) {
    accessError.value = 'Select an organization first.';
    return false;
  }
  if (!isSessionRecordingEnabledForAgencyFlags(flags.value)) {
    accessError.value = 'Session Recording is not enabled for this organization.';
    return false;
  }
  if (!canUseSessionRecordingRole({ role: role.value, agencyId: agencyId.value })) {
    accessError.value = 'Your role cannot use Session Recording for this organization.';
    return false;
  }
  accessError.value = '';
  return true;
}

async function loadContext() {
  if (!assertAccess()) return;
  const res = await api.get('/session-recordings/context', { params: { agencyId: agencyId.value } });
  isTutoringTenant.value = !!res.data?.isTutoringTenant;
  if (isTutoringTenant.value) {
    form.generateStructuredNote = false;
  }
  audioAgreementTemplates.value = res.data?.audioAgreementTemplates || [];
  if (res.data?.noteAids?.length) noteAids.value = res.data.noteAids;
}

async function loadClients() {
  if (!agencyId.value) return;
  const res = await api.get('/session-recordings/clients', {
    params: { agencyId: agencyId.value, q: clientQuery.value || undefined }
  });
  clients.value = res.data?.clients || [];
}

let clientSearchTimer = null;
function debouncedLoadClients() {
  clearTimeout(clientSearchTimer);
  clientSearchTimer = setTimeout(loadClients, 250);
}

async function checkConsent() {
  if (!agencyId.value) return;
  const params = { agencyId: agencyId.value };
  if (form.clientId) params.clientId = form.clientId;
  const row = selectedClientRow();
  const fullName = consentForm.fullName || row?.fullName;
  const dateOfBirth = consentForm.dateOfBirth || (row?.dateOfBirth ? String(row.dateOfBirth).slice(0, 10) : '');
  if (fullName) params.fullName = fullName;
  if (dateOfBirth) params.dateOfBirth = dateOfBirth;
  const res = await api.get('/session-recordings/consent/on-file', { params });
  consentOnFile.value = !!res.data?.onFile;
  const linkedId = res.data?.clientId || res.data?.consent?.client_id;
  if (linkedId && !form.clientId) {
    await applyClientId(linkedId);
  }
}

function openConsentPanel() {
  const row = selectedClientRow();
  if (row) {
    if (!consentForm.fullName) consentForm.fullName = row.fullName || '';
    if (!consentForm.dateOfBirth && row.dateOfBirth) {
      consentForm.dateOfBirth = String(row.dateOfBirth).slice(0, 10);
    }
  }
  showConsentPanel.value = true;
}

async function launchConsent() {
  consentError.value = '';
  if (!consentForm.fullName || !consentForm.dateOfBirth || !consentForm.templateId) {
    consentError.value = 'Name, birthdate, and template are required.';
    return;
  }
  try {
    consentBusy.value = true;
    const res = await api.post('/session-recordings/consent', {
      agencyId: agencyId.value,
      templateId: Number(consentForm.templateId),
      fullName: consentForm.fullName,
      dateOfBirth: consentForm.dateOfBirth,
      clientId: form.clientId ? Number(form.clientId) : null,
      sessionRecordingId: recordingId.value
    });
    const linkedId = res.data?.matchedClientId || res.data?.consent?.client_id;
    if (linkedId) await applyClientId(linkedId);
    if (res.data?.onFile) {
      consentOnFile.value = true;
      showConsentPanel.value = false;
      return;
    }
    consentId.value = res.data?.consent?.id || null;
    consentTaskId.value = res.data?.taskId || null;
  } catch (e) {
    consentError.value = e.response?.data?.error?.message || e.message || 'Failed to start consent';
  } finally {
    consentBusy.value = false;
  }
}

async function onConsentSigned() {
  try {
    if (consentId.value) {
      const res = await api.post(`/session-recordings/consent/${consentId.value}/finalize`, {
        agencyId: agencyId.value
      });
      if (res.data?.clientId) await applyClientId(res.data.clientId);
    }
  } catch {
    // still mark local signed if workflow completed
  }
  consentSignedThisSession.value = true;
  consentOnFile.value = true;
  showConsentPanel.value = false;
}

async function enumerateMics() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    audioDevices.value = devices.filter((d) => d.kind === 'audioinput');
    if (!selectedDeviceId.value && audioDevices.value[0]) {
      selectedDeviceId.value = audioDevices.value[0].deviceId;
    }
  } catch {
    audioDevices.value = [];
  }
}

function stopLevelMeter() {
  if (levelRaf) cancelAnimationFrame(levelRaf);
  levelRaf = null;
  if (audioContext) {
    try {
      audioContext.close();
    } catch {
      /* ignore */
    }
  }
  audioContext = null;
  analyser = null;
  inputLevel.value = 0;
}

function startLevelMeter(stream) {
  stopLevelMeter();
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      inputLevel.value = Math.min(1, sum / (data.length * 180));
      levelRaf = requestAnimationFrame(tick);
    };
    tick();
  } catch {
    /* ignore */
  }
}

async function acquireMic() {
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: selectedDeviceId.value ? { deviceId: { exact: selectedDeviceId.value } } : true
  });
  micReady.value = true;
  startLevelMeter(mediaStream);
  await enumerateMics();
}

async function testMic() {
  micTesting.value = true;
  try {
    await acquireMic();
    setTimeout(() => {
      micTesting.value = false;
    }, 1500);
  } catch (e) {
    micReady.value = false;
    busyError.value = e.message || 'Microphone unavailable';
    micTesting.value = false;
  }
}

async function saveSetup() {
  if (!assertAccess()) return;
  busy.value = true;
  busyError.value = '';
  try {
    const payload = {
      agencyId: agencyId.value,
      sessionKind: isTutoringTenant.value ? 'tutoring' : form.noteAidId ? 'clinical' : 'standalone',
      clientId: form.clientId ? Number(form.clientId) : null,
      officeEventId: queryOfficeEventId.value ? Number(queryOfficeEventId.value) : null,
      learningClassSessionId: queryLearningSessionId.value ? Number(queryLearningSessionId.value) : null,
      serviceCode: selectedNoteAid.value?.serviceCode || null,
      noteAidId: form.noteAidId || null,
      sessionTypeLabel: isTutoringTenant.value ? 'Tutoring session' : 'Session',
      modalityLabel: form.modalityLabel,
      dateOfService: form.dateOfService,
      sessionFocus: form.sessionFocus,
      autoTranscribe: false,
      speakerIdentification: true,
      generateStructuredNote: isTutoringTenant.value ? false : form.generateStructuredNote,
      highlightInterventions: form.highlightInterventions,
      consentId: consentId.value
    };
    if (recordingId.value) {
      await api.patch(`/session-recordings/${recordingId.value}`, payload);
    } else {
      const res = await api.post('/session-recordings', payload);
      recordingId.value = res.data?.recording?.id || null;
    }
  } catch (e) {
    busyError.value = e.response?.data?.error?.message || e.message || 'Failed to save setup';
  } finally {
    busy.value = false;
  }
}

async function startSession() {
  if (!canStart.value) return;
  await saveSetup();
  if (!recordingId.value) return;
  try {
    await acquireMic();
    await api.post(`/session-recordings/${recordingId.value}/start`, { agencyId: agencyId.value });
    audioChunks = [];
    mediaRecorder = new MediaRecorder(mediaStream);
    mediaRecorder.ondataavailable = (ev) => {
      if (ev.data?.size) audioChunks.push(ev.data);
    };
    mediaRecorder.start(1000);
    recording.value = true;
    phase.value = 'live';
    timerSeconds.value = 0;
    timerHandle = setInterval(() => {
      timerSeconds.value += 1;
    }, 1000);
  } catch (e) {
    busyError.value = e.response?.data?.error?.message || e.message || 'Failed to start recording';
  }
}

function togglePause() {
  if (!mediaRecorder) return;
  if (recording.value) {
    try {
      mediaRecorder.pause();
    } catch {
      /* ignore */
    }
    recording.value = false;
    if (timerHandle) clearInterval(timerHandle);
  } else {
    try {
      mediaRecorder.resume();
    } catch {
      /* ignore */
    }
    recording.value = true;
    timerHandle = setInterval(() => {
      timerSeconds.value += 1;
    }, 1000);
  }
}

function addMarker() {
  const label = window.prompt('Marker label', 'Key moment');
  if (!label) return;
  markers.value.push({ time: timerLabel.value, label });
}

function discardAudio() {
  audioChunks = [];
  if (mediaRecorder) {
    try {
      mediaRecorder.ondataavailable = null;
      if (mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    } catch {
      /* ignore */
    }
  }
  mediaRecorder = null;
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
  stopLevelMeter();
  if (timerHandle) clearInterval(timerHandle);
  recording.value = false;
}

async function endSession() {
  ending.value = true;
  busyError.value = '';
  try {
    const blob =
      audioChunks.length > 0
        ? new Blob(audioChunks, { type: mediaRecorder?.mimeType || 'audio/webm' })
        : null;
    discardAudio();

    if (!blob || blob.size === 0) {
      busyError.value = 'No session audio was captured. Record for at least a few seconds before ending.';
      phase.value = 'live';
      return;
    }

    const fd = new FormData();
    fd.append('agencyId', String(agencyId.value));
    fd.append('durationSeconds', String(timerSeconds.value));
    fd.append('audio', blob, 'session.webm');

    const res = await api.post(`/session-recordings/${recordingId.value}/end`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    summaryResult.value = res.data?.summary || null;
    noteResult.value = res.data?.note || null;
    applyFinalTranscript(
      res.data?.recording?.transcriptText || '',
      res.data?.transcriptSource || ''
    );
    if (summaryResult.value?.keyMoments?.length) {
      markers.value = summaryResult.value.keyMoments.map((m) => ({
        time: '—',
        label: m.label || m.detail || 'Moment'
      }));
    }
    phase.value = 'done';
    await loadShelf();
  } catch (e) {
    busyError.value = e.response?.data?.error?.message || e.message || 'Failed to end recording';
    phase.value = 'live';
  } finally {
    ending.value = false;
  }
}

async function loadShelf() {
  if (!agencyId.value) return;
  try {
    const res = await api.get('/session-recordings', { params: { agencyId: agencyId.value } });
    shelfRecordings.value = res.data?.recordings || [];
    shelfNotes.value = res.data?.notes || [];
  } catch {
    /* ignore */
  }
}

function resetToSetup() {
  discardAudio();
  recordingId.value = null;
  summaryResult.value = null;
  noteResult.value = null;
  markers.value = [];
  finalTranscriptLines.value = [];
  transcriptSource.value = '';
  phase.value = 'setup';
  timerSeconds.value = 0;
}

function cancelSetup() {
  router.back();
}

watch(
  () => form.clientId,
  () => {
    const row = selectedClientRow();
    if (row) {
      consentForm.fullName = row.fullName || '';
      consentForm.dateOfBirth = row.dateOfBirth ? String(row.dateOfBirth).slice(0, 10) : '';
    }
    checkConsent();
  }
);

onMounted(async () => {
  if (!assertAccess()) return;
  editingOverview.value = !queryClientId.value;
  try {
    await loadContext();
    await loadClients();
    await enumerateMics();
    await testMic();
    await checkConsent();
    await loadShelf();
  } catch (e) {
    busyError.value = e.response?.data?.error?.message || e.message || 'Failed to load Session Recording';
  }
});

onBeforeUnmount(() => {
  discardAudio();
});
</script>

<style scoped>
.sr-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}
.sr-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 18px;
}
.sr-header h1 {
  margin: 0;
  color: #1d4ed8;
  font-size: 1.75rem;
}
.sr-sub {
  margin: 6px 0 0;
  color: #64748b;
}
.sr-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  background: #ecfdf5;
  color: #065f46;
  font-weight: 600;
  white-space: nowrap;
}
.sr-status-pill.live {
  background: #fef2f2;
  color: #991b1b;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  display: inline-block;
}
.sr-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.sr-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}
.sr-card h2 {
  margin: 0 0 10px;
  font-size: 1.05rem;
}
.sr-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.sr-fields,
.consent-panel {
  display: grid;
  gap: 10px;
}
label {
  display: grid;
  gap: 4px;
  font-size: 0.85rem;
  color: #334155;
}
input,
select,
textarea {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
}
.level-meter {
  height: 10px;
  background: #e2e8f0;
  border-radius: 999px;
  overflow: hidden;
  margin: 10px 0;
}
.level-fill {
  height: 100%;
  background: #22c55e;
  width: 0;
  transition: width 0.08s linear;
}
.toggles {
  display: grid;
  gap: 8px;
}
.toggle,
.inline-check {
  display: flex;
  align-items: center;
  gap: 8px;
}
.checklist {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 10px;
}
.checklist li {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  border-radius: 8px;
  background: #f8fafc;
}
.checklist li.ok {
  background: #ecfdf5;
}
.ok-tag {
  color: #047857;
  font-weight: 600;
}
.privacy,
.sr-actions-card {
  grid-column: 1 / -1;
}
.action-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-top: 12px;
}
.sr-actions-card .footer-status {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 10px;
  color: #64748b;
  font-size: 0.85rem;
}
.btn-primary,
.btn-secondary,
.btn-danger,
.btn-sm,
.linkish {
  border-radius: 8px;
  border: 1px solid transparent;
  padding: 8px 14px;
  font: inherit;
  cursor: pointer;
}
.btn-primary {
  background: #2563eb;
  color: #fff;
}
.btn-primary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.btn-secondary {
  background: #fff;
  border-color: #cbd5e1;
  color: #0f172a;
}
.btn-danger {
  background: #dc2626;
  color: #fff;
  padding: 10px 22px;
  font-weight: 700;
}
.btn-sm {
  background: #f1f5f9;
  border-color: #cbd5e1;
  padding: 4px 10px;
  font-size: 0.85rem;
}
.linkish {
  background: none;
  color: #2563eb;
  padding: 0;
}
.sr-error {
  color: #b91c1c;
  background: #fef2f2;
  border: 1px solid #fecaca;
  padding: 8px 10px;
  border-radius: 8px;
}
.hint,
.meta {
  color: #64748b;
  font-size: 0.9rem;
}
.sr-live {
  display: grid;
  grid-template-columns: 1.4fr 0.9fr;
  gap: 16px;
}
.sr-live-main {
  display: grid;
  gap: 16px;
}
.waveform {
  display: flex;
  align-items: center;
  gap: 12px;
}
.wave-bar {
  flex: 1;
  height: 18px;
  border-radius: 999px;
  background: linear-gradient(90deg, #86efac, #22c55e);
  transform-origin: left center;
}
.live-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #166534;
  font-weight: 600;
}
.transcript-body {
  max-height: 320px;
  overflow: auto;
  display: grid;
  gap: 10px;
  padding: 8px 0;
}
.t-line {
  display: grid;
  grid-template-columns: 64px 90px 1fr;
  gap: 8px;
  font-size: 0.92rem;
}
.t-speaker {
  font-weight: 700;
}
.t-line.provider .t-speaker {
  color: #7c3aed;
}
.t-line.client .t-speaker {
  color: #0284c7;
}
.topics {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}
.pill {
  background: #eff6ff;
  color: #1d4ed8;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 0.85rem;
}
.speaker-toggle {
  display: inline-flex;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  overflow: hidden;
}
.speaker-toggle button {
  border: 0;
  background: #fff;
  padding: 4px 10px;
  cursor: pointer;
}
.speaker-toggle button.active {
  background: #2563eb;
  color: #fff;
}
.markers {
  display: grid;
  gap: 8px;
}
.draft-body pre {
  white-space: pre-wrap;
  background: #f8fafc;
  padding: 10px;
  border-radius: 8px;
}
.row-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  color: #475569;
  font-size: 0.9rem;
}
.shelf ul {
  margin: 0;
  padding-left: 18px;
}
.embed-sign {
  margin-top: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px;
  max-height: 480px;
  overflow: auto;
}
@media (max-width: 900px) {
  .sr-grid,
  .sr-live {
    grid-template-columns: 1fr;
  }
}
</style>
