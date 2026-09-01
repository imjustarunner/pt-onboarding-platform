<template>
  <div class="oesn" data-testid="office-event-session-note">
    <div class="oesn-tabs" role="tablist">
      <button type="button" role="tab" :class="{ active: inputMode === 'type' }" @click="inputMode = 'type'">Type</button>
      <button type="button" role="tab" :class="{ active: inputMode === 'speak' }" @click="inputMode = 'speak'">Speak</button>
    </div>

    <textarea
      v-if="inputMode === 'type'"
      v-model="inputText"
      class="oesn-textarea"
      rows="8"
      maxlength="12000"
      placeholder="Type in all information that occurred during the session, your interpretation of the client’s progress, etc."
    />
    <template v-else>
      <textarea
        v-model="inputText"
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
    <p class="oesn-hint">Add session notes in the box above or record dictation. This text is the same blurb Note Aid uses for this session.</p>
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
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import NoteAidObjectiveRatings from '../clinical/NoteAidObjectiveRatings.vue';
import {
  activePlanGoals,
  buildObjectiveRatingsContextText,
  buildTreatmentPlanContextText
} from '../../utils/noteAidTreatmentHelpers.js';

const props = defineProps({
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

const inputText = defineModel('inputText', { type: String, default: '' });
const inputMode = ref('type');

const includeInteractiveComplexity = ref(false);
const generating = ref(false);
const draftId = ref(null);
const listening = ref(false);
const dictationError = ref('');
const statusMsg = ref('');
const errorMsg = ref('');
const previousRatings = ref([]);
const sessionRatings = ref([]);
let recognition = null;
let saveTimer = null;

const speechSupported = computed(() => (
  typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition)
));
const activeGoals = computed(() => activePlanGoals(props.latestPlan));

async function loadExistingDraft() {
  const agencyId = Number(props.agencyId || 0);
  const clientId = Number(props.clientId || 0);
  if (!agencyId) return;
  try {
    const res = await api.get('/clinical-notes/recent', {
      params: { agencyId, clientIds: clientId || undefined, days: 120 },
      skipGlobalLoading: true
    });
    const drafts = Array.isArray(res.data?.drafts) ? res.data.drafts : [];
    const oe = Number(props.officeEventId || 0);
    const cs = Number(props.clinicalSessionId || 0);
    const dos = String(props.dateOfService || '').slice(0, 10);
    const hit = drafts.find((d) => oe && Number(d.office_event_id || 0) === oe)
      || drafts.find((d) => cs && Number(d.clinical_session_id || 0) === cs)
      || drafts.find((d) => clientId && Number(d.client_id) === clientId && String(d.date_of_service || '').slice(0, 10) === dos);
    if (hit) {
      draftId.value = hit.id;
      if (!String(inputText.value || '').trim()) {
        inputText.value = String(hit.input_text || '').trim();
      }
    }
  } catch {
    // ignore — clinician can still type a new blurb
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

async function persistDraft() {
  const agencyId = Number(props.agencyId || 0);
  const clientId = Number(props.clientId || 0);
  if (!agencyId) return;
  const payload = {
    agencyId,
    clientId: clientId || null,
    officeEventId: Number(props.officeEventId || 0) || null,
    clinicalSessionId: Number(props.clinicalSessionId || 0) || null,
    dateOfService: String(props.dateOfService || '').slice(0, 10) || null,
    serviceCode: String(props.serviceCode || '').trim() || null,
    initials: String(props.initials || '').trim() || null,
    inputText: String(inputText.value || '')
  };
  if (!draftId.value && !String(payload.inputText || '').trim()) return;
  try {
    if (!draftId.value) {
      const res = await api.post('/clinical-notes/drafts', payload, { skipGlobalLoading: true });
      draftId.value = res?.data?.draft?.id || null;
    } else {
      await api.patch(`/clinical-notes/drafts/${draftId.value}`, payload, { skipGlobalLoading: true });
    }
  } catch {
    // keep typing even if autosave fails
  }
}

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
    if (res.data?.draft?.id) draftId.value = res.data.draft.id;
    await persistRatings();
    statusMsg.value = 'Note generated. Open Note Aid to copy SOAP sections or keep documenting here.';
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
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
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
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { persistDraft(); }, 700);
});

watch(
  () => [props.officeEventId, props.clientId, props.agencyId],
  () => {
    draftId.value = null;
    inputText.value = '';
    loadExistingDraft();
    loadRatings();
  }
);

onMounted(() => {
  loadExistingDraft();
  loadRatings();
});

onBeforeUnmount(() => {
  clearTimeout(saveTimer);
  try { recognition?.stop?.(); } catch { /* ignore */ }
});
</script>

<style scoped>
.oesn {
  padding: 12px 14px 18px;
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
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px;
  min-height: 140px;
  font: inherit;
  resize: vertical;
}
.oesn-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 10px;
}
.oesn-count { font-size: 0.78rem; color: #64748b; margin-right: auto; }
.oesn-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8rem;
  font-weight: 600;
  color: #475569;
}
.oesn-switch {
  position: relative;
  width: 36px;
  height: 20px;
  background: #cbd5e1;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
}
.oesn-switch.on { background: #0f766e; }
.oesn-switch input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.oesn-switch-thumb {
  width: 16px;
  height: 16px;
  background: #fff;
  border-radius: 50%;
  margin-left: 2px;
  transition: transform 0.15s ease;
}
.oesn-switch.on .oesn-switch-thumb { transform: translateX(16px); }
.oesn-generate {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #0f766e;
  color: #fff;
  border: 0;
  border-radius: 10px;
  padding: 8px 14px;
  font-weight: 700;
  cursor: pointer;
}
.oesn-generate:disabled { opacity: 0.5; cursor: not-allowed; }
.oesn-speak-btn {
  margin-top: 8px;
  border: 1px solid #0f766e;
  background: #fff;
  color: #0f766e;
  border-radius: 999px;
  padding: 6px 12px;
  font-weight: 700;
  cursor: pointer;
}
.oesn-speak-btn.on { background: #0f766e; color: #fff; }
.oesn-hint { margin: 8px 0 0; font-size: 0.75rem; color: #94a3b8; }
.oesn-status { margin: 6px 0 0; font-size: 0.8rem; color: #0f766e; }
.oesn-error { margin: 6px 0 0; font-size: 0.8rem; color: #b91c1c; }
</style>
