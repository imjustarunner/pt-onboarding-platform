<template>
  <ClinicalWorkspaceFrame :enabled="practiceCategory === 'mental_health'" compact :tenant-id="agencyId" :show-back="false" context-label="Note Workspace · Session note">
  <div class="oesn" data-testid="office-event-session-note">
    <div v-if="hipaaBannerVisible" class="oesn-hipaa" role="status">
      HIPAA: Session notes contain protected health information. Viewing is logged for the assigned provider, supervisor, and admins.
      <button type="button" class="oesn-hipaa-dismiss" @click="hipaaBannerVisible = false">Dismiss</button>
    </div>

    <div class="oesn-tabs" role="tablist">
      <button type="button" role="tab" :class="{ active: inputMode === 'type' }" @click="inputMode = 'type'">Type</button>
      <button type="button" role="tab" :class="{ active: inputMode === 'speak' }" @click="inputMode = 'speak'">Speak</button>
    </div>

    <div v-if="hasSavedPhi && !revealed" class="oesn-redacted">
      <p>Session notes are saved and encrypted. Content is hidden until you reveal it.</p>
      <button type="button" class="oesn-reveal" @click="revealPhi">Reveal session notes</button>
    </div>
    <template v-else>
      <textarea
        v-if="inputMode === 'type'"
        v-model="inputText"
        :disabled="loadingDraft || activeDraftState?.loadFailed"
        class="oesn-textarea"
        rows="8"
        maxlength="12000"
        placeholder="Type in all information that occurred during the session, your interpretation of the client’s progress, etc."
      />
      <template v-else>
        <textarea
          v-model="inputText"
          :disabled="loadingDraft || activeDraftState?.loadFailed"
          class="oesn-textarea"
          rows="6"
          maxlength="12000"
          placeholder="Transcript appears here after dictation…"
        />
        <button type="button" class="oesn-speak-btn" :class="{ on: listening }" :disabled="!speechSupported" @click="toggleDictation">
          {{ listening ? 'Stop recording' : 'Record dictation' }}
        </button>
        <p v-if="dictationError" class="oesn-error">{{ dictationError }}</p>
      </template>
    </template>

    <div class="oesn-footer">
      <span class="oesn-count">{{ String(inputText || '').length }} / 12000</span>
      <label class="oesn-toggle">
        Interactive Complexity
        <span class="oesn-switch" :class="{ on: includeInteractiveComplexity }">
          <input v-model="includeInteractiveComplexity" type="checkbox" />
          <span class="oesn-switch-thumb" />
        </span>
      </label>
      <button
        type="button"
        class="oesn-open-aid"
        :disabled="!agencyId || !clientId"
        @click="openInNoteAid"
      >
        Open in Note Workspace
      </button>
      <button
        type="button"
        class="oesn-generate"
        :disabled="generating || !String(inputText || '').trim() || !agencyId || !clientId"
        @click="generateNote"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
          <path d="M12 2l1.2 6.3L19 12l-5.8 3.7L12 22l-1.2-6.3L5 12l5.8-3.7L12 2z"/>
        </svg>
        {{ generating ? 'Generating…' : 'Generate Note' }}
      </button>
    </div>
    <p class="oesn-hint">Add session notes in the box above or record dictation. This text is saved automatically and becomes the source text in Note Workspace for this appointment.</p>
    <p class="oesn-hint">After the scheduled end, saving session content confirms attendance and may collect the authorized copay today. Opening this panel alone does not confirm attendance. For a session that did not occur, use Missed appointment or Cancel instead.</p>
    <p v-if="attendanceNotice" class="oesn-hint" role="status">{{ attendanceNotice }}</p>
    <p v-if="statusMsg" class="oesn-status">{{ statusMsg }}</p>
    <p v-if="errorMsg" class="oesn-error">{{ errorMsg }}</p>

    <NoteAidObjectiveRatings
      :goals="activeGoals"
      :previous-ratings="previousRatings"
      :date-of-service="dateOfService"
      :kiosk-share-enabled="!!Number(latestPlan?.kiosk_share_enabled || 0)"
      :client-name="clientName"
      :disabled="generating"
      @update:ratings="sessionRatings = $event"
    />
  </div>
  </ClinicalWorkspaceFrame>
</template>

<script setup>
import ClinicalWorkspaceFrame from '../clinicalWorkspace/ClinicalWorkspaceFrame.vue';
import { noteDraftAttendanceNotice } from '../../utils/noteDraftAttendance.js';
import { privateSpeechRecognition } from '../../utils/privateSpeechRecognition.js';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import NoteAidObjectiveRatings from '../clinical/NoteAidObjectiveRatings.vue';
import {
  activePlanGoals,
  buildObjectiveRatingsContextText,
  buildTreatmentPlanContextText
} from '../../utils/noteAidTreatmentHelpers.js';
import { buildNoteAidQuery, navigateToNoteAid, noteAidPath } from '../../utils/noteAidLaunch.js';

const props = defineProps({
  practiceCategory: { type: String, default: '' },
  agencyId: { type: [Number, String], default: 0 },
  clientId: { type: [Number, String], default: 0 },
  clientName: { type: String, default: '' },
  officeEventId: { type: [Number, String], default: 0 },
  clinicalSessionId: { type: [Number, String], default: 0 },
  dateOfService: { type: String, default: '' },
  serviceCode: { type: String, default: '' },
  latestPlan: { type: Object, default: null },
  initials: { type: String, default: '' }
});

const emit = defineEmits(['open-note-aid']);

const router = useRouter();
const route = useRoute();
const inputText = defineModel('inputText', { type: String, default: '' });
const inputMode = ref('type');

const includeInteractiveComplexity = ref(false);
const generating = ref(false);
const draftId = ref(null);
const listening = ref(false);
const dictationError = ref('');
const statusMsg = ref('');
const attendanceNotice = ref('');
const errorMsg = ref('');
const previousRatings = ref([]);
const sessionRatings = ref([]);
const revealed = ref(false);
const hasSavedPhi = ref(false);
const hipaaBannerVisible = ref(true);
let recognition = null;
let saveTimer = null;
const loadingDraft = ref(false);
let activeDraftState = null;

function sessionContext() {
  return {
    agencyId: Number(props.agencyId || 0),
    clientId: Number(props.clientId || 0) || null,
    officeEventId: Number(props.officeEventId || 0) || null,
    clinicalSessionId: Number(props.clinicalSessionId || 0) || null,
    dateOfService: String(props.dateOfService || '').slice(0, 10) || null,
    serviceCode: String(props.serviceCode || '').trim() || null,
    initials: String(props.initials || '').trim() || null
  };
}


const speechSupported = computed(() => (
  typeof window !== 'undefined' && !!(privateSpeechRecognition())
));
const activeGoals = computed(() => activePlanGoals(props.latestPlan));

async function logSessionNoteView(extra = {}) {
  const agencyId = Number(props.agencyId || 0);
  const clientId = Number(props.clientId || 0);
  if (!agencyId || !clientId) return;
  try {
    await api.post('/clinical-notes/audit', {
      agencyId,
      clientId,
      action: 'session_note_viewed',
      metadata: {
        officeEventId: Number(props.officeEventId || 0) || null,
        clinicalSessionId: Number(props.clinicalSessionId || 0) || null,
        draftId: draftId.value || null,
        ...extra
      }
    }, { skipGlobalLoading: true });
  } catch {
    /* best-effort */
  }
}

async function revealPhi() {
  const ok = window.confirm(
    'Reveal protected session notes? This access is logged for HIPAA audit.'
  );
  if (!ok) return;
  revealed.value = true;
  await logSessionNoteView({ reveal: true });
}

async function loadExistingDraft(state) {
  const { agencyId, clientId, officeEventId, clinicalSessionId } = state.context;
  if (!agencyId || !clientId) return;
  try {
    const res = await api.get('/clinical-notes/recent', {
      params: { agencyId, clientIds: clientId, days: 120 }, skipGlobalLoading: true
    });
    if (state !== activeDraftState) return;
    const drafts = (Array.isArray(res.data?.drafts) ? res.data.drafts : [])
      .filter(d => Number(d.client_id) === clientId && !d.archived_at);
    // A same-day draft can belong to another appointment. Only reuse this exact session.
    const hit = drafts.find(d => clinicalSessionId && Number(d.clinical_session_id) === clinicalSessionId)
      || drafts.find(d => officeEventId && Number(d.office_event_id) === officeEventId
        && (!clinicalSessionId || !Number(d.clinical_session_id) || Number(d.clinical_session_id) === clinicalSessionId));
    if (!hit) return;
    state.id = hit.id;
    draftId.value = hit.id;
    try { state.outputJson = typeof hit.output_json === 'string' ? JSON.parse(hit.output_json) : hit.output_json; } catch { state.outputJson = null; }
    state.lastSavedInput = String(hit.input_text || '');
    state.text = state.lastSavedInput;
    inputText.value = state.text;
    hasSavedPhi.value = !!state.text.trim();
    revealed.value = false;
    if (hasSavedPhi.value) await logSessionNoteView({ mode: 'tab_open_redacted' });
  } catch (e) {
    if (state === activeDraftState) errorMsg.value = 'Could not load this session’s saved note. Retry before writing to avoid a duplicate draft.';
    state.loadFailed = true;
  }
}

async function loadRatings() {
  const agencyId = Number(props.agencyId || 0);
  const clientId = Number(props.clientId || 0);
  if (!agencyId || !clientId) return;
  try {
    const res = await api.get(`/medical-billing/clients/${clientId}/objective-ratings`, {
      params: { agencyId },
      skipGlobalLoading: true
    });
    previousRatings.value = Array.isArray(res.data?.ratings) ? res.data.ratings : [];
  } catch {
    previousRatings.value = [];
  }
}

async function persistDraft({ allowEmpty = false, state = activeDraftState } = {}) {
  if (!state || state.loadFailed || !state.context.agencyId || !state.context.clientId) {
    throw new Error('This session’s draft is not ready. Reopen the appointment and retry.');
  }
  const text = state.text;
  if (!text.trim() && !state.id && !allowEmpty) return;
  const request = async () => {
    if (state.id && text === state.lastSavedInput) return;
    const payload = { ...state.context, inputText: text };
    // Never replace a generated note's sections when updating its source text.
    if (!state.id) payload.outputJson = { meta: { quickNote: true } };
    else if (state.outputJson && typeof state.outputJson === 'object') {
      payload.outputJson = { ...state.outputJson, meta: { ...state.outputJson.meta, quickNote: true } };
    }
    if (text.trim() && text !== state.lastSavedInput) payload.attendanceIntent = 'authored_session_draft';
    let attendance;
    if (!state.id) {
      const res = await api.post('/clinical-notes/drafts', payload, { skipGlobalLoading: true });
      attendance = res?.data?.attendance;
      state.id = res?.data?.draft?.id || null;
      if (!state.id) throw new Error('The session draft was not saved. Please retry.');
    } else {
      const res = await api.patch(`/clinical-notes/drafts/${state.id}`, payload, { skipGlobalLoading: true });
      attendance = res?.data?.attendance;
    }
    state.lastSavedInput = text;
    if (state === activeDraftState) {
      draftId.value = state.id;
      hasSavedPhi.value = !!text.trim();
      if (text.trim()) revealed.value = true;
      statusMsg.value = 'Draft saved.';
      if (payload.attendanceIntent) attendanceNotice.value = noteDraftAttendanceNotice(attendance);
      errorMsg.value = '';
    }
  };
  // Autosave and Open/Generate may overlap. Serialize them so a new draft is created once.
  state.saving = state.saving.catch(() => {}).then(request);
  try {
    await state.saving;
  } catch (e) {
    if (state === activeDraftState) {
      statusMsg.value = '';
      errorMsg.value = e?.response?.data?.error?.message || 'Draft could not be saved. Keep this appointment open and retry.';
    }
    throw e;
  }
}

function flushPendingDraft(state = activeDraftState) {
  clearTimeout(saveTimer);
  if (state && !state.loadFailed && state.text !== state.lastSavedInput) {
    return persistDraft({ state }).catch(() => {});
  }
}

async function savePendingDraft() {
  clearTimeout(saveTimer);
  const state = activeDraftState;
  if (!state || loadingDraft.value) return;
  await state.saving.catch(() => {});
  if (state.text !== state.lastSavedInput) await persistDraft({ state });
}
defineExpose({ savePendingDraft });

async function persistRatings() {
  const agencyId = Number(props.agencyId || 0);
  const clientId = Number(props.clientId || 0);
  const ratings = sessionRatings.value || [];
  if (!agencyId || !clientId || !ratings.length) return;
  for (const r of ratings) {
    try {
      await api.post(`/medical-billing/objectives/${r.objectiveId}/ratings`, {
        agencyId,
        clientId,
        disposition: r.disposition || 'rated',
        scaleValue: r.scaleValue,
        scaleTarget: r.scaleTarget,
        previousScaleValue: r.previousScaleValue,
        raterKind: r.raterKind || 'clinician',
        raterLabel: r.raterLabel || null,
        draftId: draftId.value || null,
        dateOfService: String(props.dateOfService || '').slice(0, 10) || null
      }, { skipGlobalLoading: true });
    } catch {
      // non-blocking
    }
  }
}

async function openInNoteAid() {
  errorMsg.value = '';
  try {
    clearTimeout(saveTimer);
    await persistDraft({ allowEmpty: true });
    const ctx = {
      agencyId: Number(props.agencyId || 0),
      practiceCategory: props.practiceCategory,
      clientId: Number(props.clientId || 0),
      officeEventId: Number(props.officeEventId || 0) || undefined,
      clinicalSessionId: Number(props.clinicalSessionId || 0) || undefined,
      draftId: draftId.value || undefined,
      dateOfService: String(props.dateOfService || '').slice(0, 10) || undefined,
      serviceCode: String(props.serviceCode || '').trim() || undefined,
      launchIntent: 'progress_note',
      noteType: 'PROGRESS_NOTE',
      templateVersion: 'v1'
    };
    emit('open-note-aid', ctx);
    try {
      await navigateToNoteAid(router, ctx, { organizationSlug: route.params.organizationSlug });
    } catch {
      const q = new URLSearchParams(buildNoteAidQuery(ctx));
      window.location.href = `${noteAidPath({ organizationSlug: route.params.organizationSlug })}?${q.toString()}`;
    }
  } catch (e) {
    errorMsg.value = e?.response?.data?.error?.message || e?.message || 'Could not open Note Workspace';
  }
}

async function generateNote() {
  const agencyId = Number(props.agencyId || 0);
  const clientId = Number(props.clientId || 0);
  const text = String(inputText.value || '').trim();
  if (!agencyId || !text) return;
  generating.value = true;
  errorMsg.value = '';
  statusMsg.value = '';
  try {
    await persistDraft();
    const fd = new FormData();
    fd.append('agencyId', String(agencyId));
    if (clientId) fd.append('clientId', String(clientId));
    if (props.serviceCode) fd.append('serviceCode', String(props.serviceCode));
    if (props.dateOfService) fd.append('dateOfService', String(props.dateOfService).slice(0, 10));
    if (props.officeEventId) fd.append('officeEventId', String(props.officeEventId));
    if (props.clinicalSessionId) fd.append('clinicalSessionId', String(props.clinicalSessionId));
    if (props.initials) fd.append('initials', String(props.initials));
    if (draftId.value) fd.append('draftId', String(draftId.value));
    fd.append('includeInteractiveComplexity', String(!!includeInteractiveComplexity.value));
    fd.append('inputText', text);
    const planCtx = buildTreatmentPlanContextText(props.latestPlan, '');
    if (planCtx) fd.append('treatmentPlanContext', planCtx);
    const ratingsCtx = buildObjectiveRatingsContextText(sessionRatings.value);
    if (ratingsCtx) fd.append('objectiveRatingsContext', ratingsCtx);
    const res = await api.post('/clinical-notes/generate', fd, { skipGlobalLoading: true });
    if (res.data?.draft?.id) {
      draftId.value = res.data.draft.id;
      activeDraftState.id = res.data.draft.id;
      const generated = res.data.draft.output_json ?? res.data.outputJson;
      try { activeDraftState.outputJson = typeof generated === 'string' ? JSON.parse(generated) : generated; } catch { /* preserve the prior output */ }
    }
    await persistRatings();
    statusMsg.value = 'Note generated. Open Note Workspace to copy SOAP sections or keep documenting here.';
  } catch (e) {
    errorMsg.value = e?.response?.data?.error?.message || 'Failed to generate note';
  } finally {
    generating.value = false;
  }
}

function toggleDictation() {
  dictationError.value = '';
  if (!speechSupported.value) {
    dictationError.value = 'Speech recognition needs Chrome/Edge (or Safari) with microphone permission.';
    return;
  }
  if (listening.value) {
    try { recognition?.stop?.(); } catch { /* ignore */ }
    listening.value = false;
    return;
  }
  const Ctor = privateSpeechRecognition();
  recognition = new Ctor();
  recognition.continuous = true;
  recognition.interimResults = true;
  let committed = String(inputText.value || '').trim();
  recognition.onresult = (event) => {
    let interim = '';
    let finalChunk = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const piece = String(event.results[i]?.[0]?.transcript || '');
      if (event.results[i].isFinal) finalChunk += piece;
      else interim += piece;
    }
    if (finalChunk) {
      committed = `${committed} ${finalChunk}`.trim();
      inputText.value = committed.slice(0, 12000);
    } else if (interim) {
      inputText.value = `${committed} ${interim}`.trim().slice(0, 12000);
    }
  };
  recognition.onerror = () => { listening.value = false; };
  recognition.onend = () => { listening.value = false; };
  try {
    recognition.start();
    listening.value = true;
  } catch (e) {
    dictationError.value = e?.message || 'Could not start dictation.';
  }
}

watch(inputText, () => {
  if (loadingDraft.value || !activeDraftState) return;
  activeDraftState.text = String(inputText.value || '');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { persistDraft().catch(() => {}); }, 700);
}, { flush: 'sync' });

watch(
  () => [props.officeEventId, props.clinicalSessionId, props.clientId, props.agencyId, props.dateOfService],
  async () => {
    flushPendingDraft();
    loadingDraft.value = true;
    const state = { context: sessionContext(), id: null, text: '', lastSavedInput: '', saving: Promise.resolve(), loadFailed: false };
    activeDraftState = state;
    draftId.value = null;
    inputText.value = '';
    hasSavedPhi.value = false;
    revealed.value = false;
    statusMsg.value = '';
    errorMsg.value = '';
    hipaaBannerVisible.value = true;
    attendanceNotice.value = '';
    await loadExistingDraft(state);
    if (state === activeDraftState) loadingDraft.value = false;
    loadRatings();
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  flushPendingDraft();
  try { recognition?.stop?.(); } catch { /* ignore */ }
});
</script>

<style scoped>
.oesn {
  padding: 12px 14px 18px;
}
.oesn-hipaa {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #fff7ed;
  border: 1px solid #fdba74;
  color: #9a3412;
  font-size: 0.82rem;
  line-height: 1.35;
}
.oesn-hipaa-dismiss {
  border: 0;
  background: transparent;
  color: #9a3412;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}
.oesn-redacted {
  border: 1px dashed #cbd5e1;
  border-radius: 12px;
  padding: 18px 14px;
  background: #f8fafc;
  text-align: center;
  color: #475569;
  margin-bottom: 10px;
}
.oesn-reveal {
  margin-top: 8px;
  border: 1px solid #0f766e;
  background: #fff;
  color: #0f766e;
  border-radius: 999px;
  padding: 8px 14px;
  font-weight: 700;
  cursor: pointer;
}
.oesn-tabs {
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
}
.oesn-tabs button {
  border: 0;
  background: transparent;
  font-weight: 700;
  color: #64748b;
  padding: 6px 0;
  cursor: pointer;
  border-bottom: 2px solid transparent;
}
.oesn-tabs button.active {
  color: #0f766e;
  border-bottom-color: #0f766e;
}
.oesn-textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px;
  font: inherit;
  resize: vertical;
  min-height: 140px;
}
.oesn-speak-btn {
  margin-top: 8px;
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 999px;
  padding: 8px 12px;
  font-weight: 700;
  cursor: pointer;
}
.oesn-speak-btn.on {
  border-color: #dc2626;
  color: #b91c1c;
}
.oesn-footer {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}
.oesn-count {
  font-size: 0.78rem;
  color: #64748b;
}
.oesn-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.82rem;
  color: #334155;
}
.oesn-switch {
  position: relative;
  width: 36px;
  height: 20px;
  border-radius: 999px;
  background: #cbd5e1;
  display: inline-block;
}
.oesn-switch.on { background: #0f766e; }
.oesn-switch input {
  opacity: 0;
  position: absolute;
  inset: 0;
  margin: 0;
  cursor: pointer;
}
.oesn-switch-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: #fff;
  transition: transform 0.15s ease;
}
.oesn-switch.on .oesn-switch-thumb { transform: translateX(16px); }
.oesn-open-aid,
.oesn-generate {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  padding: 9px 14px;
  font-weight: 700;
  cursor: pointer;
}
.oesn-open-aid {
  border: 1px solid #0f766e;
  background: #fff;
  color: #0f766e;
  margin-left: 0;
}
.oesn-generate {
  border: 0;
  background: #0f172a;
  color: #fff;
}
.oesn-generate:disabled,
.oesn-open-aid:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.oesn-hint {
  margin: 8px 0 0;
  font-size: 0.8rem;
  color: #64748b;
}
.oesn-status { color: #047857; font-size: 0.85rem; }
.oesn-error { color: #b91c1c; font-size: 0.85rem; }
</style>
