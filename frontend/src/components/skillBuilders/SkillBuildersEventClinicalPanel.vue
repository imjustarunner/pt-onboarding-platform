<template>
  <div class="sbclin">
    <!-- Toolbar -->
    <div class="sbclin-toolbar">
      <label class="sbclin-field">
        <span class="sbclin-lbl">Session date</span>
        <input v-model="selectedDate" type="date" class="input input-sm" @change="onDateChange" />
      </label>
      <button type="button" class="btn btn-secondary btn-sm" :disabled="loading" @click="reload">
        {{ loading ? '…' : 'Refresh' }}
      </button>
    </div>

    <p v-if="loadError" class="error-box sbclin-err">{{ loadError }}</p>

    <div v-if="!selectedDate" class="sbclin-empty muted">
      Select a session date above to view attendance, observations, and generate clinical notes.
    </div>

    <div v-else-if="loading" class="muted">Loading…</div>

    <div v-else-if="!dayData.clients?.length" class="sbclin-empty muted">
      No client check-ins found for {{ selectedDate }}.
    </div>

    <div v-else class="sbclin-client-list">
      <!-- Session-level curriculum notes indicator -->
      <div v-if="dayData.curriculumNotesText" class="sbclin-curriculum-banner">
        <span class="sbclin-curriculum-icon">📋</span>
        <span class="muted small">Activity / session notes available for this date (from Materials).</span>
      </div>

      <div
        v-for="client in dayData.clients"
        :key="client.clientId"
        class="sbclin-client-card"
      >
        <!-- Card header -->
        <button
          type="button"
          class="sbclin-client-hdr"
          @click="toggleClient(client.clientId)"
        >
          <div class="sbclin-client-name-row">
            <span class="sbclin-client-name">{{ client.displayName }}</span>
            <span class="sbclin-badge sbclin-badge-obs" :class="{ 'sbclin-badge-zero': !client.observations?.length }">
              {{ client.observations?.length || 0 }} obs
            </span>
            <span
              v-if="client.hasClinicalNote"
              class="sbclin-badge sbclin-badge-note"
              :class="`sbclin-note-${client.clinicalNoteStatus || 'completed'}`"
            >
              {{ noteStatusLabel(client.clinicalNoteStatus) }}
            </span>
            <span v-else class="sbclin-badge sbclin-badge-nonote">No note</span>
          </div>
          <div class="sbclin-client-sub muted small">
            Checked in {{ formatTime(client.checkedInAt) }}
            <template v-if="client.checkedOutAt"> · Out {{ formatTime(client.checkedOutAt) }}</template>
          </div>
          <span class="sbclin-caret">{{ expandedClients[client.clientId] ? '▾' : '▸' }}</span>
        </button>

        <!-- Expanded body -->
        <div v-if="expandedClients[client.clientId]" class="sbclin-client-body">
          <!-- Observations -->
          <h5 class="sbclin-subh">Observation entries</h5>
          <p v-if="!client.observations?.length" class="muted small">No observations logged for this client on this date.</p>
          <ul v-else class="sbclin-obs-list">
            <li v-for="entry in client.observations" :key="entry.id" class="sbclin-obs-card">
              <div class="sbclin-obs-meta">
                <span class="muted small">{{ entry.authorName }} · {{ formatWhen(entry.createdAt) }}</span>
              </div>
              <dl class="sbclin-obs-dl">
                <template v-if="entry.payload?.overallStatus">
                  <dt>Overall</dt>
                  <dd>{{ labelPreset('overallStatus', entry.payload.overallStatus) }}</dd>
                </template>
                <template v-if="activityLabels(entry).length">
                  <dt>Activities</dt>
                  <dd>{{ activityLabels(entry).join(' · ') }}</dd>
                </template>
                <template v-if="entry.payload?.behaviorValence">
                  <dt>Behavior tone</dt>
                  <dd>{{ labelPreset('behaviorValence', entry.payload.behaviorValence) }}</dd>
                </template>
                <template v-if="behaviorLabels(entry.payload).length">
                  <dt>Behaviors</dt>
                  <dd>{{ behaviorLabels(entry.payload).join(' · ') }}</dd>
                </template>
                <template v-if="chipLabels('strengths', entry.payload?.strengths, entry.payload?.strengthsOther).length">
                  <dt>Strengths</dt>
                  <dd>{{ chipLabels('strengths', entry.payload.strengths, entry.payload.strengthsOther).join(' · ') }}</dd>
                </template>
                <template v-if="chipLabels('struggles', entry.payload?.struggles, entry.payload?.strugglesOther).length">
                  <dt>Struggles</dt>
                  <dd>{{ chipLabels('struggles', entry.payload.struggles, entry.payload.strugglesOther).join(' · ') }}</dd>
                </template>
                <template v-if="entry.payload?.peerInteraction">
                  <dt>Peer interaction</dt>
                  <dd>{{ labelPreset('peerInteraction', entry.payload.peerInteraction) }}</dd>
                </template>
                <template v-if="entry.payload?.briefNote">
                  <dt>Note</dt>
                  <dd>{{ entry.payload.briefNote }}</dd>
                </template>
              </dl>
            </li>
          </ul>

          <!-- Generate H2014 note (requires feature flag) -->
          <div v-if="canGenerateNotes" class="sbclin-generate-block">
            <h5 class="sbclin-subh">Generate H2014 clinical note</h5>
            <div class="sbclin-generate-form">
              <label class="sbclin-field-full">
                <span class="sbclin-lbl">
                  Additional clinician notes
                  <span class="sbclin-lbl-optional muted"> — optional when observations are logged</span>
                </span>
                <textarea
                  v-model="clinicianSummary[client.clientId]"
                  class="input sbclin-summary-textarea"
                  rows="3"
                  maxlength="4000"
                  placeholder="Add any extra context not captured in the observation entries (optional). The note will use observations + activity notes if this is left blank."
                />
              </label>
            </div>

            <p v-if="generateError[client.clientId]" class="error-box sbclin-gen-err">
              {{ generateError[client.clientId] }}
            </p>

            <div class="sbclin-generate-actions">
              <button
                type="button"
                class="btn btn-primary btn-sm"
                :disabled="generating[client.clientId]"
                @click="generateNote(client)"
              >
                {{ generating[client.clientId] ? 'Generating…' : client.hasClinicalNote ? 'Regenerate H2014 note' : 'Generate H2014 note' }}
              </button>
              <span v-if="dayData.curriculumNotesText" class="muted small sbclin-paste-notice">
                Activity notes from Materials will be included.
              </span>
            </div>

            <!-- Generated note output -->
            <div v-if="generatedNotes[client.clientId]" class="sbclin-note-output">
              <div class="sbclin-note-output-hdr">
                <span class="sbclin-note-saved-badge">Note saved</span>
              </div>
              <pre class="sbclin-note-text">{{ generatedNotes[client.clientId] }}</pre>
            </div>
          </div>
          <div v-else class="sbclin-generate-locked">
            <span class="muted small">H2014 note generation requires the Clinical Note Generator feature. Contact your administrator to enable it.</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: [Number, String], required: true },
  eventId: { type: [Number, String], required: true },
  /** Whether the agency has the H2014 note generation feature enabled. */
  canGenerateNotes: { type: Boolean, default: false }
});

const selectedDate = ref('');
const loading = ref(false);
const loadError = ref('');
const dayData = ref({ clients: [], sessionId: null, curriculumNotesText: '' });
const presets = ref({});

/** @type {Record<number, boolean>} */
const expandedClients = reactive({});
/** @type {Record<number, string>} */
const clinicianSummary = reactive({});
/** @type {Record<number, boolean>} */
const generating = reactive({});
/** @type {Record<number, string>} */
const generateError = reactive({});
/** @type {Record<number, string>} */
const generatedNotes = reactive({});

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatTime(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch {
    return String(v);
  }
}

function formatWhen(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return String(v);
  }
}

function noteStatusLabel(status) {
  if (status === 'completed') return 'Note complete';
  if (status === 'missed') return 'Missed';
  if (status === 'note_needed') return 'Needs note';
  return 'Note on file';
}

function labelPreset(category, id) {
  const list = presets.value[category] || [];
  const hit = list.find((p) => p.id === id);
  return hit?.label || String(id || '').replace(/_/g, ' ');
}

function chipLabels(category, ids, other) {
  const base = Array.isArray(ids) ? ids.map((id) => labelPreset(category, id)) : [];
  if (other) base.push(other);
  return base.filter(Boolean);
}

function labelBehavior(id) {
  for (const cat of ['behaviorsPositive', 'behaviorsConcerning']) {
    const list = presets.value[cat] || [];
    const hit = list.find((p) => p.id === id);
    if (hit) return hit.label;
  }
  return String(id || '').replace(/_/g, ' ');
}

function behaviorLabels(payload) {
  const ids = payload?.behaviors || [];
  const labels = ids.map((id) => labelBehavior(id));
  if (payload?.behaviorsOther) labels.push(payload.behaviorsOther);
  return labels.filter(Boolean);
}

function activityLabels(entry) {
  if (entry.activityLabels?.length) {
    const labels = [...entry.activityLabels];
    if (entry.payload?.activityOther) labels.push(entry.payload.activityOther);
    return labels;
  }
  const ids = entry.payload?.activityIds || [];
  const labels = ids.map((id) => `Activity #${id}`);
  if (entry.payload?.activityOther) labels.push(entry.payload.activityOther);
  return labels;
}

function toggleClient(clientId) {
  expandedClients[clientId] = !expandedClients[clientId];
}

async function loadPresets() {
  try {
    const res = await api.get(`/skill-builders/events/${props.eventId}/observations/presets`, {
      params: { agencyId: props.agencyId },
      skipGlobalLoading: true
    });
    presets.value = res.data?.presets || {};
  } catch {
    /* optional */
  }
}

async function loadClinicalDay() {
  if (!selectedDate.value) return;
  loading.value = true;
  loadError.value = '';
  try {
    const res = await api.get(`/skill-builders/events/${props.eventId}/clinical-day`, {
      params: { agencyId: props.agencyId, date: selectedDate.value },
      skipGlobalLoading: true
    });
    dayData.value = res.data || { clients: [], sessionId: null, curriculumNotesText: '' };
  } catch (e) {
    loadError.value = e.response?.data?.error?.message || 'Could not load clinical day data';
    dayData.value = { clients: [], sessionId: null, curriculumNotesText: '' };
  } finally {
    loading.value = false;
  }
}

async function reload() {
  await loadClinicalDay();
}

function onDateChange() {
  reload();
}

async function generateNote(client) {
  const sessionId = dayData.value?.sessionId;
  if (!sessionId) {
    window.alert('No session found for this date. Please ensure sessions are configured for this event.');
    return;
  }
  const summary = String(clinicianSummary[client.clientId] || '').trim();
  generating[client.clientId] = true;
  generateError[client.clientId] = '';
  try {
    const body = {
      agencyId: props.agencyId,
      clinicianSummaryText: summary || undefined,
      includeSessionObservations: true,
      sessionDate: selectedDate.value,
      curriculumPaste: dayData.value?.curriculumNotesText || undefined
    };
    const res = await api.post(
      `/skill-builders/events/${props.eventId}/sessions/${sessionId}/clinical-notes/clients/${client.clientId}/generate`,
      body,
      { skipGlobalLoading: true }
    );
    const note = res.data?.note;
    generatedNotes[client.clientId] = String(note?.plainText || '').trim();
    // Refresh to show updated note status
    await loadClinicalDay();
  } catch (e) {
    generateError[client.clientId] = e.response?.data?.error?.message || 'Note generation failed';
  } finally {
    generating[client.clientId] = false;
  }
}

watch(
  () => [props.eventId, props.agencyId],
  () => {
    loadPresets();
    reload();
  }
);

// Initialize with today's date
selectedDate.value = todayYmd();
loadPresets();
reload();
</script>

<style scoped>
.sbclin-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-end;
  margin-bottom: 16px;
}
.sbclin-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sbclin-field-full {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
}
.sbclin-lbl {
  font-size: 12px;
  color: #64748b;
  font-weight: 600;
}
.sbclin-lbl-req {
  color: #dc2626;
  margin-left: 2px;
}
.sbclin-lbl-optional {
  font-weight: 400;
  font-size: 0.78rem;
}
.sbclin-err {
  margin-bottom: 12px;
}
.sbclin-empty {
  padding: 24px 0;
  text-align: center;
}
.sbclin-curriculum-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 8px;
  padding: 8px 12px;
  margin-bottom: 12px;
}
.sbclin-curriculum-icon {
  font-size: 1rem;
}
.sbclin-client-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sbclin-client-card {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
}
.sbclin-client-hdr {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  cursor: pointer;
  padding: 12px 14px;
  transition: background 0.1s;
}
.sbclin-client-hdr:hover {
  background: #f8fafc;
}
.sbclin-client-name-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1;
}
.sbclin-client-name {
  font-weight: 700;
  font-size: 0.97rem;
}
.sbclin-client-sub {
  margin-top: 2px;
  flex: 1 1 100%;
}
.sbclin-caret {
  color: #94a3b8;
  font-size: 1rem;
  flex-shrink: 0;
  margin-top: 2px;
}
.sbclin-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.74rem;
  font-weight: 600;
  white-space: nowrap;
}
.sbclin-badge-obs {
  background: #eff6ff;
  color: #1d4ed8;
}
.sbclin-badge-zero {
  background: #f1f5f9;
  color: #94a3b8;
}
.sbclin-badge-note {
  background: #f0fdf4;
  color: #15803d;
}
.sbclin-note-completed {
  background: #f0fdf4;
  color: #15803d;
}
.sbclin-note-missed {
  background: #fef2f2;
  color: #b91c1c;
}
.sbclin-note-note_needed {
  background: #fefce8;
  color: #a16207;
}
.sbclin-badge-nonote {
  background: #f1f5f9;
  color: #64748b;
}
.sbclin-client-body {
  padding: 0 14px 14px;
  border-top: 1px solid #f1f5f9;
}
.sbclin-subh {
  margin: 14px 0 8px;
  font-size: 0.88rem;
  font-weight: 700;
  color: #166534;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.sbclin-obs-list {
  list-style: none;
  margin: 0 0 16px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sbclin-obs-card {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 12px;
  background: #f8fafc;
}
.sbclin-obs-meta {
  margin-bottom: 6px;
}
.sbclin-obs-dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 3px 10px;
  margin: 0;
  font-size: 0.87rem;
}
.sbclin-obs-dl dt {
  color: #64748b;
  font-weight: 600;
  margin: 0;
}
.sbclin-obs-dl dd {
  margin: 0;
}
.sbclin-generate-block {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 14px;
  margin-top: 8px;
}
.sbclin-generate-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 10px;
}
.sbclin-summary-textarea {
  width: 100%;
  max-width: 100%;
  resize: vertical;
  font-size: 0.9rem;
  font-family: inherit;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 8px 10px;
}
.sbclin-gen-err {
  margin-bottom: 10px;
}
.sbclin-generate-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}
.sbclin-paste-notice {
  color: #15803d;
}
.sbclin-note-output {
  margin-top: 14px;
  border-top: 1px solid #e2e8f0;
  padding-top: 12px;
}
.sbclin-note-output-hdr {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}
.sbclin-note-saved-badge {
  display: inline-block;
  background: #dcfce7;
  color: #15803d;
  font-size: 0.78rem;
  font-weight: 700;
  padding: 2px 10px;
  border-radius: 999px;
}
.sbclin-generate-locked {
  padding: 10px 14px;
  background: #f8fafc;
  border: 1px dashed #e2e8f0;
  border-radius: 8px;
  margin-top: 8px;
}
.sbclin-note-text {
  white-space: pre-wrap;
  font-family: inherit;
  font-size: 0.88rem;
  line-height: 1.6;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px 14px;
  margin: 0;
  max-height: 400px;
  overflow-y: auto;
}
</style>
