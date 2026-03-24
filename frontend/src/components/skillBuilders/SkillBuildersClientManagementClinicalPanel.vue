<template>
  <div class="sbep-clinical" :class="{ 'sbep-clinical--modal': modalMode }">
    <template v-if="modalMode">
      <p class="sbep-modal-mini-lead muted small">
        Select activities, add a summary or audio, generate the H2014 note, then copy or edit sections.
      </p>
    </template>
    <template v-else>
      <h3 class="sbep-clinical-title">Clinical (H2014 group)</h3>
      <p class="muted small sbep-clinical-lead">
        Provider-only session notes. Note Aid uses the <strong>extracted text</strong> from the session PDF you upload under
        <strong>Materials</strong>, plus your clinical summary below.
      </p>
    </template>

    <template v-if="!sessionSelectAtParent">
      <label class="sbep-label">Session</label>
      <select v-model.number="sessionIdModel" class="input sbep-kiosk-field">
        <option v-for="s in sessions" :key="`cl-s-${s.id}`" :value="s.id">
          {{ formatSessionLabel(s) }}
        </option>
      </select>
    </template>

    <div v-if="!sessionId" class="muted small">
      {{ sessionSelectAtParent ? 'Select a session above for clinical notes.' : 'Select a session for clinical notes.' }}
    </div>

    <template v-else>
      <div v-if="activityOptions.length" class="sbep-clinical-activities">
        <p class="sbep-subh">Activities completed</p>
        <p v-if="modalMode" class="muted small sbep-act-desc-modal">
          Choose activities completed in today's session.
        </p>
        <p v-else class="muted small">
          Select what you ran in session (configured per session under Program documents or Materials → Activities). Required
          when options exist.
        </p>
        <div class="sbep-act-chips">
          <label v-for="opt in activityOptions" :key="opt.id" class="sbep-act-chip">
            <input v-model="selectedActivityIds" type="checkbox" :value="Number(opt.id)" />
            <span>{{ opt.label }}</span>
          </label>
        </div>
      </div>

      <div v-if="sessionId">
        <div class="sbep-clinical-event-compact">
          <div class="sbep-clinical-event-compact-row">
            <p class="sbep-clinical-event-compact-main">
              <span class="sbep-clinical-event-compact-label">Event</span>
              {{ companyEventTitleDisplay || '—' }}<span class="sbep-clinical-event-compact-meta">{{ curriculumAttachHint }}</span>
            </p>
            <button type="button" class="btn btn-link btn-sm sbep-event-details-btn" @click="eventDetailsOpen = !eventDetailsOpen">
              {{ eventDetailsOpen ? 'Hide details' : 'Event details' }}
            </button>
          </div>
        </div>

        <div
          v-show="eventDetailsOpen"
          class="sbep-clinical-curr"
          :class="{ 'sbep-clinical-curr--modal-expanded': modalMode }"
        >
          <p class="sbep-curr-expanded-lead muted small">
            Upload or open the session PDF when you need to change materials — otherwise the attached file is used automatically.
          </p>
          <p class="sbep-subh sbep-subh-curr-first">Curriculum for this session</p>
          <p v-if="hasCurriculum" class="muted small">
            {{ currentSession?.curriculumFileName || 'PDF on file' }}
            <span v-if="extractStatus"> · Extract: {{ extractStatus }}</span>
          </p>
          <p v-else class="muted small">No PDF uploaded for this session yet — add one under Materials.</p>
          <div class="sbep-clinical-curr-actions">
            <button type="button" class="btn btn-secondary btn-sm" @click="goToMaterials">Upload PDF (Materials)</button>
            <button v-if="hasCurriculum" type="button" class="btn btn-link btn-sm" @click="openCurriculumPdf">Open PDF</button>
          </div>
        </div>
      </div>

      <template v-if="!modalMode">
        <label class="sbep-label">Client</label>
        <select v-model.number="clinicalClientId" class="input sbep-kiosk-field">
          <option v-for="c in clients" :key="`cl-c-${c.id}`" :value="Number(c.id)">
            {{ clientLabelForRow(c) }}{{ noteByClientId[Number(c.id)] ? ' · note saved' : '' }}
          </option>
        </select>
      </template>

      <div v-if="canDeleteAllNotes && !modalMode" class="sbep-clinical-client-actions">
        <button type="button" class="btn btn-link btn-sm sbep-clinical-danger" @click="deleteConfirmOpen = true">
          Delete all notes for this session…
        </button>
      </div>

      <!-- Saved / generated structured note -->
      <div v-if="hasStructuredNote" class="sbep-clinical-note-out">
        <div class="sbep-clinical-note-out-head">
          <p class="sbep-subh sbep-subh-tight">Generated note</p>
          <div class="sbep-note-out-actions">
            <button
              v-if="hasStructuredNote"
              type="button"
              class="btn btn-link btn-sm"
              title="Copy the note text into the clinical summary field (for regenerate or edits after delete)"
              @click="fillSummaryFromNote"
            >
              Use note as summary
            </button>
            <button
              v-if="isSuperAdmin && hasStructuredNote"
              type="button"
              class="btn btn-secondary btn-sm"
              :disabled="generating || !effectiveSummaryForGenerate"
              title="Re-run H2014 generation using the clinical summary (typed, stored, or rebuilt from this note)"
              @click="regenerateFullNoteSuperadmin"
            >
              Regenerate from summary
            </button>
            <button type="button" class="btn btn-secondary btn-sm sbep-clinical-danger" @click="deleteAndRestart">
              Delete and restart
            </button>
          </div>
        </div>
        <div v-for="entry in sectionEntries" :key="entry[0]" class="sbep-sec-card">
          <div class="sbep-sec-card-head">
            <span class="sbep-sec-title">{{ entry[0] }}</span>
            <div class="sbep-sec-actions">
              <button type="button" class="btn btn-secondary btn-sm" :disabled="!entry[1]" @click="copySection(entry[1])">
                Copy
              </button>
              <button
                v-if="isSuperAdmin"
                type="button"
                class="btn btn-link btn-sm sbep-sec-regen"
                :disabled="generating || !effectiveSummaryForGenerate"
                title="Re-run H2014 generation using the clinical summary (superadmin)"
                @click="regenerateFullNoteSuperadmin"
              >
                Regenerate
              </button>
              <button
                v-if="editingSectionKey !== entry[0]"
                type="button"
                class="btn btn-link btn-sm"
                @click="startSectionEdit(entry[0], entry[1])"
              >
                Edit
              </button>
              <template v-else>
                <button type="button" class="btn btn-primary btn-sm" @click="saveSectionEdit(entry[0])">Save</button>
                <button type="button" class="btn btn-secondary btn-sm" @click="cancelSectionEdit">Cancel</button>
              </template>
            </div>
          </div>
          <pre v-if="editingSectionKey !== entry[0]" class="sbep-sec-card-body">{{ entry[1] }}</pre>
          <textarea v-else v-model="sectionEditBuffer" class="input sbep-clinical-textarea sbep-sec-card-edit" rows="8" />
        </div>
        <p v-if="notesLoading" class="muted small">Syncing notes…</p>
      </div>

      <!-- Draft composer: audio → clinical summary → generate (no saved structured note yet) -->
      <template v-else>
        <div class="sbep-composer">
          <div class="sbep-composer-head">
            <p class="sbep-composer-title">Note Aid writer</p>
            <p class="sbep-composer-hint muted small">Optional audio transcription, then your clinical summary.</p>
          </div>

          <p v-if="activitiesBlockComposer" class="sbep-composer-block-hint">
            Select your activities first — then you can add audio or your clinical summary.
          </p>

          <div class="sbep-field sbep-field-audio">
            <span class="sbep-label">Audio</span>
            <div class="sbep-audio-row">
              <input
                ref="audioInputRef"
                type="file"
                accept="audio/*"
                class="sbep-hidden-file"
                :disabled="activitiesBlockComposer"
                @change="transcribeAudio"
              />
              <button
                type="button"
                class="btn btn-secondary btn-sm sbep-audio-btn"
                :disabled="transcribing || activitiesBlockComposer"
                @click="audioInputRef?.click()"
              >
                {{ transcribing ? 'Transcribing…' : 'Record / upload audio' }}
              </button>
            </div>
          </div>

          <div class="sbep-field">
            <label class="sbep-label" for="sbep-clinical-summary">Clinical summary</label>
            <textarea
              id="sbep-clinical-summary"
              v-model="clinicianSummary"
              class="input sbep-clinical-textarea"
              rows="6"
              :disabled="activitiesBlockComposer"
              placeholder="What happened in session, interventions, goals, group dynamics…"
            />
          </div>

          <div v-if="plainNoteWithoutSections" class="sbep-field sbep-plain-fallback">
            <label class="sbep-label" for="sbep-plain-note">Current note (plain text)</label>
            <textarea
              id="sbep-plain-note"
              v-model="generatedText"
              class="input sbep-clinical-textarea sbep-clinical-textarea-mono"
              rows="6"
              :disabled="activitiesBlockComposer"
            />
            <div class="sbep-field-actions">
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                :disabled="!generatedText.trim()"
                @click="savePlainNote"
              >
                Save note text
              </button>
            </div>
          </div>
        </div>

        <div class="sbep-inline-actions sbep-clinical-gen-actions">
          <button
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="generating || activitiesBlockComposer"
            @click="generateNote"
          >
            {{ generating ? 'Generating…' : 'Generate H2014 note' }}
          </button>
          <button type="button" class="btn btn-secondary btn-sm" @click="acceptAndNext">Accept &amp; next without note</button>
        </div>
        <p v-if="notesLoading" class="muted small">Syncing notes…</p>
      </template>
    </template>

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
  <Teleport to="body">
    <div
      v-if="copyToastVisible"
      class="sbep-copy-toast"
      role="status"
      aria-live="polite"
    >
      Copied
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import api from '../../services/api';
import { splitH2014GroupOutputToSections, sectionsObjectToPlainText } from '../../utils/h2014GroupNoteSplit.js';

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
  clientLabelForRow: { type: Function, required: true },
  /** When true, parent renders the session dropdown; hide duplicate here (e.g. event portal Client Management). */
  sessionSelectAtParent: { type: Boolean, default: false },
  /** When set and present on the roster, selects this client in the dropdown (e.g. Clinical Aid deep link). */
  preferredClientId: { type: Number, default: 0 },
  /** Compact UI for hub modal: fixed session/client, minimal chrome. */
  modalMode: { type: Boolean, default: false },
  /** Company event / program title (shown above curriculum block). */
  companyEventTitle: { type: String, default: '' }
});

const emit = defineEmits(['update:sessionId', 'refresh-sessions', 'clinical-note-completed']);

const audioInputRef = ref(null);
const clinicalClientId = ref(0);
const notesList = ref([]);
const notesLoading = ref(false);
const transcribing = ref(false);
const generating = ref(false);
const copyToastVisible = ref(false);
let copyToastHideTimer = null;
const clinicianSummary = ref('');
const generatedText = ref('');
const lastOutputSections = ref({});
const activityOptions = ref([]);
const selectedActivityIds = ref([]);
const deleteConfirmOpen = ref(false);
const deleteConfirmInput = ref('');
const editingSectionKey = ref(null);
const sectionEditBuffer = ref('');

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

/** Stable order for H2014 group notes (matches generator); extra keys follow. */
const H2014_GROUP_SECTION_ORDER = [
  'Symptom Description and Subjective Report',
  'Objective Content',
  'Interventions Used',
  'Plan'
];

/** When meta.clinicianSummaryText is missing, rebuild text for regenerate / "Use note as summary". */
function reverseEngineerSummaryFromNote(sections, plainText) {
  const pt = String(plainText || '').trim();
  if (pt) return pt;
  if (!sections || typeof sections !== 'object') return '';
  const parts = [];
  for (const key of H2014_GROUP_SECTION_ORDER) {
    const v = sections[key];
    if (v && String(v).trim()) parts.push(`${key}:\n${String(v).trim()}`);
  }
  for (const [k, v] of Object.entries(sections)) {
    if (String(k).toLowerCase() === 'meta') continue;
    if (H2014_GROUP_SECTION_ORDER.includes(k)) continue;
    if (v && String(v).trim()) parts.push(`${k}:\n${String(v).trim()}`);
  }
  return parts.join('\n\n').trim();
}

const sectionEntries = computed(() => {
  const o = lastOutputSections.value;
  if (!o || typeof o !== 'object') return [];
  const raw = Object.entries(o).filter(([k, v]) => k && typeof v === 'string' && String(k).toLowerCase() !== 'meta');
  const map = new Map(raw);
  const ordered = [];
  for (const key of H2014_GROUP_SECTION_ORDER) {
    if (map.has(key)) {
      ordered.push([key, map.get(key)]);
      map.delete(key);
    }
  }
  for (const [k, v] of map) ordered.push([k, v]);
  return ordered;
});

const hasStructuredNote = computed(() => sectionEntries.value.length > 0);

/** Typed summary, or rebuilt from saved note (plain text or section bodies) for generate/regenerate. */
const effectiveSummaryForGenerate = computed(() => {
  const direct = String(clinicianSummary.value || '').trim();
  if (direct) return direct;
  return reverseEngineerSummaryFromNote(lastOutputSections.value, generatedText.value);
});

const companyEventTitleDisplay = computed(() => String(props.companyEventTitle || '').trim());

const eventDetailsOpen = ref(false);

const curriculumAttachHint = computed(() => {
  if (!props.sessionId) return '';
  if (!hasCurriculum.value) return ' · No PDF yet';
  const fn = String(currentSession.value?.curriculumFileName || 'PDF').trim();
  const short = fn.length > 28 ? `${fn.slice(0, 26)}…` : fn;
  const ex = extractStatus.value ? ` · ${extractStatus.value}` : '';
  return ` · ${short}${ex}`;
});

watch(
  () => props.modalMode,
  (m) => {
    if (!m) eventDetailsOpen.value = false;
  }
);

watch(
  () => props.sessionId,
  () => {
    eventDetailsOpen.value = false;
  }
);

/** Session has activity options but none selected — block summary/audio until user picks at least one (or already has generated plain text). */
const activitiesBlockComposer = computed(() => {
  const activeOpts = activityOptions.value.filter((o) => o.isActive !== false);
  if (activeOpts.length === 0) return false;
  if (selectedActivityIds.value.length > 0) return false;
  if (String(generatedText.value || '').trim()) return false;
  return true;
});

/** Plain-only note (no section keys) — allow editing as a blob until user regenerates. */
const plainNoteWithoutSections = computed(() => {
  return !hasStructuredNote.value && !!String(generatedText.value || '').trim();
});

async function loadActivityOptions() {
  if (!props.agencyId || !props.eventId || !props.sessionId) {
    activityOptions.value = [];
    selectedActivityIds.value = [];
    return;
  }
  try {
    const res = await api.get(`/skill-builders/events/${props.eventId}/activity-options`, {
      params: { agencyId: props.agencyId, sessionId: props.sessionId },
      skipGlobalLoading: true
    });
    const raw = Array.isArray(res.data?.options) ? res.data.options : [];
    activityOptions.value = raw.filter((o) => o.isActive !== false);
    const allowed = new Set(activityOptions.value.map((o) => Number(o.id)));
    selectedActivityIds.value = (selectedActivityIds.value || []).filter((id) => allowed.has(Number(id)));
  } catch {
    activityOptions.value = [];
  }
}

async function copySection(text) {
  try {
    const t = String(text || '');
    if (!t) return;
    await navigator.clipboard.writeText(t);
    if (copyToastHideTimer) {
      clearTimeout(copyToastHideTimer);
      copyToastHideTimer = null;
    }
    copyToastVisible.value = true;
    copyToastHideTimer = setTimeout(() => {
      copyToastVisible.value = false;
      copyToastHideTimer = null;
    }, 1600);
  } catch {
    window.alert('Copy failed');
  }
}

async function persistNormalizedSectionsIfNeeded(before, after, plain) {
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  const plainText = String(plain || '').trim() || sectionsObjectToPlainText(after);
  if (!clinicalClientId.value) return;
  try {
    await api.put(
      `/skill-builders/events/${props.eventId}/sessions/${props.sessionId}/clinical-notes/clients/${clinicalClientId.value}`,
      { agencyId: props.agencyId, sections: after, plainText },
      { skipGlobalLoading: true }
    );
    await loadNotesMeta();
  } catch {
    /* non-fatal: UI still shows split sections in memory */
  }
}

function fillSummaryFromNote() {
  const t = reverseEngineerSummaryFromNote(lastOutputSections.value, generatedText.value);
  if (!t) {
    window.alert('No content available to copy into the summary.');
    return;
  }
  clinicianSummary.value = t;
}

function startSectionEdit(title, text) {
  editingSectionKey.value = title;
  sectionEditBuffer.value = String(text || '');
}

function cancelSectionEdit() {
  editingSectionKey.value = null;
  sectionEditBuffer.value = '';
}

async function saveSectionEdit(title) {
  const next = { ...lastOutputSections.value };
  next[title] = String(sectionEditBuffer.value || '').trim();
  lastOutputSections.value = next;
  editingSectionKey.value = null;
  sectionEditBuffer.value = '';
  try {
    await api.put(
      `/skill-builders/events/${props.eventId}/sessions/${props.sessionId}/clinical-notes/clients/${clinicalClientId.value}`,
      { agencyId: props.agencyId, sections: next },
      { skipGlobalLoading: true }
    );
    await loadNotesMeta();
  } catch (e) {
    window.alert(e.response?.data?.error?.message || e.message || 'Save failed');
  }
}

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

async function loadNoteDetail() {
  editingSectionKey.value = null;
  if (!props.agencyId || !props.eventId || !props.sessionId || !clinicalClientId.value) {
    lastOutputSections.value = {};
    generatedText.value = '';
    return;
  }
  try {
    const res = await api.get(
      `/skill-builders/events/${props.eventId}/sessions/${props.sessionId}/clinical-notes/clients/${clinicalClientId.value}`,
      { params: { agencyId: props.agencyId }, skipGlobalLoading: true }
    );
    const note = res.data?.note;
    const plain = String(note?.plainText || '');
    const meta = note?.outputJson?.meta;
    let sec = note?.outputJson?.sections;
    let sectionsForState = sec && typeof sec === 'object' ? { ...sec } : {};
    const metaKeys = Object.keys(sectionsForState).filter((k) => String(k).toLowerCase() !== 'meta');

    if (metaKeys.length === 0 && plain.trim()) {
      const splitOnly = splitH2014GroupOutputToSections(plain);
      const sk = Object.keys(splitOnly).filter((k) => String(k).toLowerCase() !== 'meta');
      if (sk.length > 1) {
        const before = { ...sectionsForState };
        sectionsForState = splitOnly;
        void persistNormalizedSectionsIfNeeded(before, sectionsForState, plain);
      }
    } else if (metaKeys.length === 1 && metaKeys[0] === 'Output') {
      const blob = String(sectionsForState.Output || '').trim() || plain.trim();
      const split = splitH2014GroupOutputToSections(blob);
      const splitKeys = Object.keys(split).filter((k) => String(k).toLowerCase() !== 'meta');
      if (splitKeys.length > 1) {
        const before = { ...sectionsForState };
        sectionsForState = split;
        void persistNormalizedSectionsIfNeeded(before, sectionsForState, plain);
      }
    }

    lastOutputSections.value = sectionsForState;
    generatedText.value = plain;

    if (meta && typeof meta === 'object' && meta.clinicianSummaryText) {
      clinicianSummary.value = String(meta.clinicianSummaryText);
    } else {
      clinicianSummary.value = reverseEngineerSummaryFromNote(sectionsForState, plain);
    }
    const ids = note?.selectedActivityIds;
    if (Array.isArray(ids) && ids.length) {
      selectedActivityIds.value = ids.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0);
    } else {
      selectedActivityIds.value = [];
    }
  } catch (e) {
    if (e.response?.status === 404) {
      lastOutputSections.value = {};
      generatedText.value = '';
      clinicianSummary.value = '';
      selectedActivityIds.value = [];
    } else {
      lastOutputSections.value = {};
      generatedText.value = '';
    }
  }
}

watch(
  () => [props.agencyId, props.eventId, props.sessionId, clinicalClientId.value],
  async () => {
    await loadActivityOptions();
    await loadNotesMeta();
    await loadNoteDetail();
  },
  { immediate: true }
);

watch(
  () => [props.clients, props.preferredClientId],
  () => {
    const list = props.clients;
    if (!Array.isArray(list) || !list.length) {
      clinicalClientId.value = 0;
      return;
    }
    const pref = Number(props.preferredClientId);
    if (pref && list.some((c) => Number(c.id) === pref)) {
      clinicalClientId.value = pref;
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
  if (activitiesBlockComposer.value) return;
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

async function runH2014Generate({ revisionInstruction = '' } = {}) {
  const cid = clinicalClientId.value;
  if (!cid || !props.sessionId) return;
  const activeOpts = activityOptions.value.filter((o) => o.isActive !== false);
  if (activeOpts.length && !selectedActivityIds.value.length) {
    window.alert('Select the activities you completed.');
    return;
  }
  const summary = effectiveSummaryForGenerate.value;
  if (!summary) {
    window.alert(
      'Enter a clinical summary, transcribe audio, or use “Use note as summary” when you have a saved generated note.'
    );
    return;
  }
  generating.value = true;
  try {
    const body = {
      agencyId: props.agencyId,
      clinicianSummaryText: summary,
      activityIds: selectedActivityIds.value.length ? selectedActivityIds.value.map((x) => Number(x)) : undefined
    };
    const ri = String(revisionInstruction || '').trim();
    if (ri) body.revisionInstruction = ri;
    const res = await api.post(
      `/skill-builders/events/${props.eventId}/sessions/${props.sessionId}/clinical-notes/clients/${cid}/generate`,
      body,
      { skipGlobalLoading: true }
    );
    const note = res.data?.note;
    generatedText.value = String(note?.plainText || '').trim();
    const sec = note?.outputJson?.sections;
    lastOutputSections.value = sec && typeof sec === 'object' ? { ...sec } : {};
    const meta = note?.outputJson?.meta;
    if (meta && typeof meta === 'object' && meta.clinicianSummaryText) {
      clinicianSummary.value = String(meta.clinicianSummaryText);
    }
    await loadNotesMeta();
    await loadNoteDetail();
    emit('clinical-note-completed');
  } catch (e) {
    window.alert(e.response?.data?.error?.message || e.message || 'Generation failed');
  } finally {
    generating.value = false;
  }
}

function generateNote() {
  return runH2014Generate();
}

async function regenerateFullNoteSuperadmin() {
  if (!isSuperAdmin.value) return;
  if (!window.confirm('Regenerate the full H2014 note from the same clinical summary and activities? This replaces the current note.')) {
    return;
  }
  await runH2014Generate({
    revisionInstruction:
      'Regenerate the full progress note: same inputs and compliance rules; produce a fresh version with the required four sections (subjective, objective, interventions, plan).'
  });
}

async function savePlainNote() {
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
    await loadNoteDetail();
  } catch (e) {
    window.alert(e.response?.data?.error?.message || e.message || 'Save failed');
  }
}

async function deleteAndRestart() {
  const cid = clinicalClientId.value;
  if (!cid || !props.sessionId) return;
  if (!window.confirm('Delete this generated note and start over?')) return;
  try {
    await api.delete(
      `/skill-builders/events/${props.eventId}/sessions/${props.sessionId}/clinical-notes/clients/${cid}`,
      { params: { agencyId: props.agencyId }, skipGlobalLoading: true }
    );
    lastOutputSections.value = {};
    generatedText.value = '';
    clinicianSummary.value = '';
    selectedActivityIds.value = [];
    await loadNotesMeta();
  } catch (e) {
    window.alert(e.response?.data?.error?.message || e.message || 'Could not delete note');
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
      lastOutputSections.value = {};
      return;
    }
  }
  for (let i = 0; i < ids.length; i++) {
    if (i === idx) continue;
    if (!noteByClientId.value[ids[i]]) {
      clinicalClientId.value = ids[i];
      generatedText.value = '';
      lastOutputSections.value = {};
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
    lastOutputSections.value = {};
    generatedText.value = '';
    await loadNotesMeta();
    await loadNoteDetail();
  } catch (e) {
    window.alert(e.response?.data?.error?.message || e.message || 'Failed');
  }
}

onUnmounted(() => {
  if (copyToastHideTimer) clearTimeout(copyToastHideTimer);
});
</script>

<style scoped>
.sbep-clinical {
  width: 100%;
  box-sizing: border-box;
  text-align: left;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 16px;
  padding: 1.1rem 1.15rem 1.25rem;
  background: linear-gradient(165deg, #ffffff 0%, #f8fafc 100%);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px rgba(15, 23, 42, 0.06);
}
.sbep-clinical--modal {
  border: none;
  border-radius: 0;
  padding: 0;
  background: transparent;
  box-shadow: none;
}
.sbep-modal-mini-lead {
  margin: 0 0 12px;
  line-height: 1.45;
}
.sbep-act-desc-modal {
  margin-top: 4px;
  font-size: 0.8rem;
  line-height: 1.35;
}
.sbep-clinical-event-compact {
  margin: 0 0 8px;
}
.sbep-clinical-event-compact-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px 12px;
}
.sbep-clinical-event-compact-main {
  margin: 0;
  flex: 1;
  min-width: 0;
  font-size: 0.88rem;
  line-height: 1.4;
  color: var(--text-primary, #0f172a);
}
.sbep-clinical-event-compact-label {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-secondary, #64748b);
  margin-right: 6px;
}
.sbep-clinical-event-compact-meta {
  color: var(--text-secondary, #64748b);
  font-weight: 400;
}
.sbep-event-details-btn {
  flex-shrink: 0;
  padding: 2px 6px !important;
  font-size: 0.78rem !important;
}
.sbep-clinical-curr--modal-expanded {
  margin-bottom: 8px;
  padding: 10px 12px;
}
.sbep-clinical-curr--modal-expanded .sbep-subh {
  margin-top: 8px;
  font-size: 0.8rem;
}
.sbep-clinical-curr .sbep-subh-curr-first {
  margin-top: 0;
}
.sbep-curr-expanded-lead {
  margin: 0 0 8px;
}
.sbep-clinical--modal .sbep-modal-mini-lead {
  margin: 0 0 8px;
  font-size: 0.8rem;
}
.sbep-clinical--modal .sbep-label {
  font-size: 0.7rem;
  margin-bottom: 4px;
}
.sbep-clinical--modal .sbep-subh {
  margin-top: 12px;
  font-size: 0.82rem;
}
.sbep-clinical--modal .sbep-clinical-activities {
  margin-bottom: 8px;
  padding: 9px 10px;
}
.sbep-clinical--modal .sbep-act-chip {
  font-size: 0.8rem;
  padding: 4px 8px;
}
.sbep-clinical--modal .sbep-composer {
  padding: 10px 12px;
}
.sbep-clinical--modal .sbep-composer-head {
  margin-bottom: 8px;
}
.sbep-clinical--modal .sbep-composer-title {
  font-size: 0.88rem;
}
.sbep-clinical--modal .sbep-composer-hint {
  font-size: 0.78rem;
}
.sbep-clinical--modal .sbep-clinical-textarea {
  padding: 0.55rem 0.65rem;
  font-size: 0.84rem;
  min-height: 120px;
}
.sbep-clinical--modal .sbep-field {
  margin-bottom: 10px;
}
.sbep-clinical--modal .sbep-field-audio {
  margin-bottom: 8px;
}
.sbep-clinical--modal .sbep-clinical-note-out {
  margin-top: 10px;
}
.sbep-clinical-title {
  margin: 0 0 6px;
  font-size: 1.05rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--primary, #0f766e);
}
.sbep-clinical-lead {
  margin: 0 0 14px;
  line-height: 1.45;
}
.sbep-label {
  display: block;
  text-align: left;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--text-secondary, #64748b);
  margin-bottom: 6px;
}
.sbep-subh {
  margin: 16px 0 0;
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--text-secondary, #64748b);
}
.sbep-subh-tight {
  margin: 0;
}
.sbep-composer {
  width: 100%;
  box-sizing: border-box;
  margin-top: 4px;
  padding: 14px 14px 16px;
  border-radius: 12px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: #fff;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
  display: flex;
  flex-direction: column;
  align-items: stretch;
  text-align: left;
  gap: 0;
}
.sbep-composer-head {
  margin-bottom: 12px;
}
.sbep-composer-title {
  margin: 0 0 4px;
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-primary, #0f172a);
  letter-spacing: -0.01em;
}
.sbep-composer-hint {
  margin: 0;
  line-height: 1.4;
}
.sbep-composer-block-hint {
  margin: 0 0 10px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(15, 118, 110, 0.25);
  background: rgba(15, 118, 110, 0.06);
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-primary, #0f172a);
  line-height: 1.35;
}
.sbep-field {
  width: 100%;
  box-sizing: border-box;
  text-align: left;
  margin-bottom: 14px;
}
.sbep-field:last-of-type {
  margin-bottom: 0;
}
.sbep-field-audio {
  margin-bottom: 12px;
}
.sbep-audio-row {
  display: flex;
  flex-direction: row;
  justify-content: flex-start;
  align-items: center;
  gap: 10px;
  width: 100%;
  text-align: left;
}
.sbep-audio-btn {
  flex-shrink: 0;
}
.sbep-clinical-textarea {
  display: block;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  margin: 0;
  text-align: left;
  direction: ltr;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid var(--border, #e2e8f0);
  background: #fafafa;
  font-size: 0.9rem;
  line-height: 1.5;
  resize: vertical;
  min-height: 140px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}
.sbep-clinical-textarea:hover {
  border-color: #cbd5e1;
  background: #fff;
}
.sbep-clinical-textarea:focus {
  outline: none;
  border-color: var(--primary, #0f766e);
  background: #fff;
  box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.15);
}
.sbep-clinical-textarea:disabled {
  opacity: 0.65;
  cursor: not-allowed;
  background: #f1f5f9;
}
.sbep-clinical-textarea-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.82rem;
}
.sbep-field-actions {
  display: flex;
  justify-content: flex-start;
  margin-top: 8px;
}
.sbep-hidden-file {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}
.sbep-clinical-activities {
  margin: 0 0 12px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid rgba(15, 23, 42, 0.06);
  background: rgba(255, 255, 255, 0.7);
}
.sbep-act-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}
.sbep-act-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid var(--border, #e2e8f0);
  background: #fff;
  font-size: 0.85rem;
  cursor: pointer;
}
.sbep-act-chip input {
  margin: 0;
}
.sbep-clinical-curr {
  margin: 0 0 12px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px dashed rgba(15, 118, 110, 0.25);
  background: rgba(15, 118, 110, 0.04);
}
.sbep-clinical-curr-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin: 8px 0 0;
}
.sbep-clinical-client-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin: 8px 0 12px;
}
.sbep-clinical-gen-actions {
  margin: 14px 0 4px;
  justify-content: flex-start;
}
.sbep-inline-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.sbep-clinical-danger {
  color: #b91c1c;
}
.sbep-clinical-note-out {
  margin-top: 14px;
}
.sbep-clinical-note-out-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}
.sbep-note-out-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 6px 10px;
}
.sbep-sec-card {
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  background: #fff;
  margin-bottom: 10px;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}
.sbep-sec-card-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border, #e2e8f0);
  background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
}
.sbep-sec-title {
  font-weight: 700;
  font-size: 0.85rem;
}
.sbep-sec-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.sbep-sec-card-body {
  margin: 0;
  padding: 12px 14px;
  white-space: pre-wrap;
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 0.88rem;
  line-height: 1.5;
  text-align: left;
}
.sbep-sec-card-edit {
  margin: 0 12px 12px;
  width: calc(100% - 24px);
  max-width: calc(100% - 24px);
  box-sizing: border-box;
  border-radius: 10px;
}
.sbep-plain-fallback {
  margin-top: 0;
}
.sbep-kiosk-field {
  width: 100%;
  box-sizing: border-box;
  text-align: left;
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
  border-radius: 16px;
  padding: 20px;
  max-width: 560px;
  width: 100%;
  max-height: 90vh;
  overflow: auto;
  box-shadow: 0 24px 48px rgba(15, 23, 42, 0.18);
  border: 1px solid var(--border, #e2e8f0);
}
.sbep-modal-title {
  margin: 0 0 10px;
  font-size: 1rem;
  font-weight: 800;
}
.sbep-modal-hint {
  margin: 0 0 10px;
}

/* Teleported — class is unique; keep visible above modals */
.sbep-copy-toast {
  position: fixed;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10050;
  padding: 10px 18px;
  border-radius: 999px;
  background: #0f172a;
  color: #fff;
  font-size: 0.875rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.28);
  pointer-events: none;
  animation: sbep-copy-toast-pop 0.28s ease;
}
@keyframes sbep-copy-toast-pop {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(12px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0) scale(1);
  }
}

/* Full-width, left-aligned form controls in this panel */
.sbep-clinical :deep(select.input),
.sbep-clinical :deep(.input.sbep-kiosk-field) {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  text-align: left;
}
</style>
