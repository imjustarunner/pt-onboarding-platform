<template>
  <div class="sbep-clinical">
    <h3 class="sbep-clinical-title">Clinical (H2014 group)</h3>
    <p class="muted small sbep-clinical-lead">
      Provider-only session notes. Note Aid uses the <strong>extracted text</strong> from the session PDF you upload under
      <strong>Materials</strong> (plus what you type, record, or paste below).
    </p>

    <label class="sbep-label">Session</label>
    <select v-model.number="sessionIdModel" class="input sbep-kiosk-field">
      <option v-for="s in sessions" :key="`cl-s-${s.id}`" :value="s.id">
        {{ formatSessionLabel(s) }}
      </option>
    </select>

    <div v-if="!sessionId" class="muted small">Select a session for clinical notes.</div>

    <template v-else>
      <div class="sbep-clinical-curr">
        <p class="sbep-subh">Curriculum for this session</p>
        <p v-if="hasCurriculum" class="muted small">
          {{ currentSession?.curriculumFileName || 'PDF on file' }}
          <span v-if="extractStatus"> · Extract: {{ extractStatus }}</span>
        </p>
        <p v-else class="muted small">No PDF uploaded for this session yet — add one under Materials, or paste an excerpt below.</p>
        <div class="sbep-clinical-curr-actions">
          <button type="button" class="btn btn-secondary btn-sm" @click="goToMaterials">Upload PDF (Materials)</button>
          <button v-if="hasCurriculum" type="button" class="btn btn-link btn-sm" @click="openCurriculumPdf">Open PDF</button>
        </div>
      </div>

      <label class="sbep-label">Client</label>
      <select v-model.number="clinicalClientId" class="input sbep-kiosk-field">
        <option v-for="c in clients" :key="`cl-c-${c.id}`" :value="Number(c.id)">
          {{ clientLabelForRow(c) }}{{ noteByClientId[Number(c.id)] ? ' · note saved' : '' }}
        </option>
      </select>

      <div class="sbep-clinical-client-actions">
        <button type="button" class="btn btn-secondary btn-sm" @click="openNoteModal(clinicalClientId)">
          View / copy note
        </button>
        <button
          v-if="canDeleteAllNotes"
          type="button"
          class="btn btn-link btn-sm sbep-clinical-danger"
          @click="deleteConfirmOpen = true"
        >
          Delete all notes for this session…
        </button>
      </div>

      <p class="sbep-subh">Note Aid writer</p>
      <label class="sbep-label">Clinician summary (type or transcribe)</label>
      <textarea
        v-model="clinicianSummary"
        class="input"
        rows="5"
        placeholder="What happened in session, interventions, goals, group dynamics…"
      />
      <div class="sbep-clinical-audio">
        <input
          ref="audioInputRef"
          type="file"
          accept="audio/*"
          class="sbep-hidden-file"
          @change="transcribeAudio"
        />
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          :disabled="transcribing"
          @click="audioInputRef?.click()"
        >
          {{ transcribing ? 'Transcribing…' : 'Record / upload audio' }}
        </button>
      </div>

      <label class="sbep-label">Curriculum excerpt (optional paste if extraction failed)</label>
      <textarea v-model="curriculumPaste" class="input" rows="3" placeholder="Paste key text from the PDF when needed." />

      <label class="sbep-label">Revision for regenerate (optional)</label>
      <input v-model="revisionInstruction" class="input sbep-kiosk-field" placeholder="e.g. shorter, add parent contact" />

      <div class="sbep-inline-actions sbep-clinical-gen-actions">
        <button type="button" class="btn btn-primary btn-sm" :disabled="generating" @click="generateNote">
          {{ generating ? 'Generating…' : 'Generate H2014 note' }}
        </button>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          :disabled="!generatedText.trim()"
          @click="saveManualEdits"
        >
          Save edits to note
        </button>
        <button type="button" class="btn btn-secondary btn-sm" @click="acceptAndNext">Accept &amp; next without note</button>
      </div>

      <label class="sbep-label">Generated note</label>
      <textarea v-model="generatedText" class="input sbep-clinical-output" rows="10" />
      <p v-if="notesLoading" class="muted small">Syncing notes…</p>
    </template>

    <div v-if="noteModalOpen" class="sbep-modal-backdrop" role="dialog" aria-modal="true" @click.self="noteModalOpen = false">
      <div class="sbep-modal">
        <h4 class="sbep-modal-title">Clinical note</h4>
        <textarea v-model="noteModalText" class="input sbep-clinical-output" rows="14" readonly />
        <div class="sbep-inline-actions">
          <button type="button" class="btn btn-primary btn-sm" @click="copyNote">Copy</button>
          <button type="button" class="btn btn-secondary btn-sm" @click="noteModalOpen = false">Close</button>
        </div>
      </div>
    </div>

    <div v-if="deleteConfirmOpen" class="sbep-modal-backdrop" role="dialog" aria-modal="true" @click.self="deleteConfirmOpen = false">
      <div class="sbep-modal">
        <h4 class="sbep-modal-title">Delete all clinical notes?</h4>
        <p class="muted small sbep-modal-hint">
          This cannot be undone. Type <strong>DELETE_ALL_CLINICAL_NOTES</strong> to confirm.
        </p>
        <input v-model="deleteConfirmInput" class="input sbep-kiosk-field" autocomplete="off" />
        <div class="sbep-inline-actions">
          <button
            type="button"
            class="btn btn-primary btn-sm sbep-clinical-danger"
            :disabled="deleteConfirmInput !== 'DELETE_ALL_CLINICAL_NOTES'"
            @click="deleteAllNotes"
          >
            Delete all
          </button>
          <button type="button" class="btn btn-secondary btn-sm" @click="deleteConfirmOpen = false">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import api from '../../services/api';

const router = useRouter();
const route = useRoute();

const props = defineProps({
  agencyId: { type: Number, required: true },
  eventId: { type: Number, required: true },
  sessions: { type: Array, default: () => [] },
  sessionId: { type: Number, default: 0 },
  clients: { type: Array, default: () => [] },
  viewerCaps: { type: Object, default: () => ({}) },
  formatSessionLabel: { type: Function, required: true },
  clientLabelForRow: { type: Function, required: true }
});

const emit = defineEmits(['update:sessionId', 'refresh-sessions']);

const audioInputRef = ref(null);
const clinicalClientId = ref(0);
const notesList = ref([]);
const notesLoading = ref(false);
const transcribing = ref(false);
const generating = ref(false);
const clinicianSummary = ref('');
const curriculumPaste = ref('');
const generatedText = ref('');
const revisionInstruction = ref('');
const noteModalOpen = ref(false);
const noteModalText = ref('');
const deleteConfirmOpen = ref(false);
const deleteConfirmInput = ref('');

const sessionIdModel = computed({
  get: () => props.sessionId,
  set: (v) => emit('update:sessionId', v)
});

const currentSession = computed(() => props.sessions.find((s) => Number(s.id) === Number(props.sessionId)));

const hasCurriculum = computed(() => {
  const s = currentSession.value;
  return !!(s?.hasCurriculum || s?.curriculumFileName);
});

const extractStatus = computed(() => currentSession.value?.curriculumExtractStatus || '');

const canDeleteAllNotes = computed(() => {
  const v = props.viewerCaps;
  return !!(v?.canManageTeamSchedules || v?.canManageCompanyEvent);
});

const noteByClientId = computed(() => {
  const m = {};
  for (const n of notesList.value) {
    m[Number(n.clientId)] = n;
  }
  return m;
});

async function loadNotesMeta() {
  if (!props.agencyId || !props.eventId || !props.sessionId) {
    notesList.value = [];
    return;
  }
  notesLoading.value = true;
  try {
    const res = await api.get(
      `/skill-builders/events/${props.eventId}/sessions/${props.sessionId}/clinical-notes`,
      { params: { agencyId: props.agencyId }, skipGlobalLoading: true }
    );
    notesList.value = Array.isArray(res.data?.notes) ? res.data.notes : [];
  } catch {
    notesList.value = [];
  } finally {
    notesLoading.value = false;
  }
}

watch(
  () => [props.agencyId, props.eventId, props.sessionId],
  () => {
    loadNotesMeta();
    generatedText.value = '';
    revisionInstruction.value = '';
  },
  { immediate: true }
);

watch(
  () => props.clients,
  (list) => {
    if (!Array.isArray(list) || !list.length) {
      clinicalClientId.value = 0;
      return;
    }
    if (!clinicalClientId.value || !list.some((c) => Number(c.id) === Number(clinicalClientId.value))) {
      clinicalClientId.value = Number(list[0].id);
    }
  },
  { immediate: true }
);

function curriculumUrl() {
  const base = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
  return `${base}/skill-builders/events/${props.eventId}/sessions/${props.sessionId}/curriculum?agencyId=${props.agencyId}`;
}

function goToMaterials() {
  router.replace({ query: { ...route.query, section: 'materials' } });
}

function openCurriculumPdf() {
  window.open(curriculumUrl(), '_blank', 'noopener,noreferrer');
}

async function transcribeAudio(ev) {
  const f = ev.target.files?.[0];
  if (!f || !props.agencyId) return;
  transcribing.value = true;
  try {
    const fd = new FormData();
    fd.append('audio', f);
    fd.append('agencyId', String(props.agencyId));
    const res = await api.post('/clinical-notes/transcribe', fd, { skipGlobalLoading: true });
    const text = String(res.data?.transcriptText || '').trim();
    if (text) {
      clinicianSummary.value = clinicianSummary.value
        ? `${clinicianSummary.value.trim()}\n\n${text}`
        : text;
    }
  } catch (e) {
    window.alert(e.response?.data?.error?.message || e.message || 'Transcription failed');
  } finally {
    transcribing.value = false;
    ev.target.value = '';
  }
}

async function generateNote() {
  const cid = clinicalClientId.value;
  if (!cid || !props.sessionId) return;
  const summary = clinicianSummary.value.trim();
  if (!summary) {
    window.alert('Enter a session summary or transcribe audio first.');
    return;
  }
  generating.value = true;
  try {
    const body = {
      agencyId: props.agencyId,
      clinicianSummaryText: summary,
      curriculumPaste: curriculumPaste.value.trim() || undefined,
      revisionInstruction: revisionInstruction.value.trim() || undefined
    };
    const res = await api.post(
      `/skill-builders/events/${props.eventId}/sessions/${props.sessionId}/clinical-notes/clients/${cid}/generate`,
      body,
      { skipGlobalLoading: true }
    );
    generatedText.value = String(res.data?.note?.plainText || '').trim();
    await loadNotesMeta();
  } catch (e) {
    window.alert(e.response?.data?.error?.message || e.message || 'Generation failed');
  } finally {
    generating.value = false;
  }
}

async function saveManualEdits() {
  const cid = clinicalClientId.value;
  const t = generatedText.value.trim();
  if (!cid || !t) return;
  try {
    await api.put(
      `/skill-builders/events/${props.eventId}/sessions/${props.sessionId}/clinical-notes/clients/${cid}`,
      { agencyId: props.agencyId, plainText: t },
      { skipGlobalLoading: true }
    );
    await loadNotesMeta();
  } catch (e) {
    window.alert(e.response?.data?.error?.message || e.message || 'Save failed');
  }
}

async function openNoteModal(clientId) {
  if (!clientId) return;
  noteModalOpen.value = true;
  noteModalText.value = '';
  try {
    const res = await api.get(
      `/skill-builders/events/${props.eventId}/sessions/${props.sessionId}/clinical-notes/clients/${clientId}`,
      { params: { agencyId: props.agencyId }, skipGlobalLoading: true }
    );
    noteModalText.value = res.data?.note?.plainText || '';
  } catch (e) {
    noteModalText.value = '';
    if (e.response?.status === 404) {
      noteModalText.value = '';
    } else {
      window.alert(e.response?.data?.error?.message || e.message || 'Could not load note');
    }
  }
}

async function copyNote() {
  try {
    await navigator.clipboard.writeText(noteModalText.value);
  } catch {
    window.alert('Copy failed');
  }
}

function acceptAndNext() {
  const list = props.clients || [];
  const ids = list.map((c) => Number(c.id));
  const cur = clinicalClientId.value;
  const idx = ids.indexOf(Number(cur));
  for (let i = idx + 1; i < ids.length; i++) {
    if (!noteByClientId.value[ids[i]]) {
      clinicalClientId.value = ids[i];
      generatedText.value = '';
      revisionInstruction.value = '';
      return;
    }
  }
  for (let i = 0; i < ids.length; i++) {
    if (i === idx) continue;
    if (!noteByClientId.value[ids[i]]) {
      clinicalClientId.value = ids[i];
      generatedText.value = '';
      revisionInstruction.value = '';
      return;
    }
  }
  window.alert('Every client already has a note.');
}

async function deleteAllNotes() {
  if (deleteConfirmInput.value !== 'DELETE_ALL_CLINICAL_NOTES') return;
  try {
    await api.delete(`/skill-builders/events/${props.eventId}/sessions/${props.sessionId}/clinical-notes`, {
      data: { agencyId: props.agencyId, confirm: 'DELETE_ALL_CLINICAL_NOTES' },
      skipGlobalLoading: true
    });
    deleteConfirmOpen.value = false;
    deleteConfirmInput.value = '';
    await loadNotesMeta();
  } catch (e) {
    window.alert(e.response?.data?.error?.message || e.message || 'Failed');
  }
}
</script>

<style scoped>
.sbep-clinical {
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  padding: 14px;
  background: #fafafa;
}
.sbep-clinical-title {
  margin: 0 0 8px;
  font-size: 1rem;
  font-weight: 800;
  color: var(--primary, #0f766e);
}
.sbep-clinical-lead {
  margin: 0 0 12px;
}
.sbep-subh {
  margin: 14px 0 0;
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--text-secondary, #64748b);
}
.sbep-hidden-file {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}
.sbep-clinical-curr-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin: 0 0 6px;
}
.sbep-clinical-client-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin: 8px 0 16px;
}
.sbep-clinical-audio {
  margin: 8px 0 12px;
}
.sbep-clinical-gen-actions {
  margin: 10px 0 12px;
}
.sbep-clinical-output {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.82rem;
}
.sbep-clinical-danger {
  color: #b91c1c;
}
.sbep-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.sbep-modal {
  background: #fff;
  border-radius: 14px;
  padding: 18px;
  max-width: 560px;
  width: 100%;
  max-height: 90vh;
  overflow: auto;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.2);
}
.sbep-modal-title {
  margin: 0 0 10px;
  font-size: 1rem;
  font-weight: 800;
}
.sbep-modal-hint {
  margin: 0 0 10px;
}
</style>
