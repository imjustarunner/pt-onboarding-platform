<template>
  <div class="ilw" :class="{ dark: dark }">
    <div class="ilw-brief">
      <div class="ilw-brief-nav">
        <button type="button" class="ilw-brief-tab" :class="{ active: briefPage === 0 }" @click="briefPage = 0">
          Resume
        </button>
        <button type="button" class="ilw-brief-tab" :class="{ active: briefPage === 1 }" @click="briefPage = 1">
          Research
        </button>
        <button type="button" class="ilw-brief-tab" :class="{ active: briefPage === 2 }" @click="briefPage = 2">
          Strengths / gaps
        </button>
      </div>
      <div class="ilw-brief-body">
        <div v-show="briefPage === 0">
          <div class="ilw-brief-title">Resume snapshot</div>
          <ul v-if="resumeBullets.length" class="ilw-resume-list">
            <li v-for="(b, idx) in resumeBullets" :key="`rs_${idx}`">{{ b }}</li>
          </ul>
          <p v-else class="muted small">No resume summary yet.</p>
        </div>
        <div v-show="briefPage === 1">
          <div class="ilw-brief-title">Candidate research (condensed)</div>
          <ul v-if="researchBrief.length" class="ilw-resume-list">
            <li v-for="(b, idx) in researchBrief" :key="`rb_${idx}`">{{ b }}</li>
          </ul>
          <p v-else class="muted small">No pre-screen report yet. Run pre-screen in Candidate Assessment.</p>
        </div>
        <div v-show="briefPage === 2">
          <div class="ilw-brief-title">Strengths</div>
          <ul v-if="strengthItems.length" class="ilw-resume-list ilw-strengths">
            <li v-for="(s, idx) in strengthItems" :key="`st_${idx}`">{{ s }}</li>
          </ul>
          <p v-else class="muted small">No strengths listed in pre-screen yet.</p>
          <div class="ilw-brief-title" style="margin-top:10px;">Weaknesses / discussion points</div>
          <ul v-if="weaknessItems.length" class="ilw-resume-list ilw-weaknesses">
            <li v-for="(w, idx) in weaknessItems" :key="`wk_${idx}`">{{ w }}</li>
          </ul>
          <p v-else class="muted small">No gaps flagged in pre-screen yet.</p>
        </div>
      </div>
    </div>

    <div class="ilw-tabs">
      <button
        v-for="t in tabs"
        :key="t.id"
        type="button"
        class="ilw-tab"
        :class="{ active: activeTab === t.id }"
        @click="activeTab = t.id"
      >
        {{ t.label }}
        <span v-if="t.id === 'chat' && unreadChat" class="ilw-badge">{{ unreadChat }}</span>
      </button>
    </div>

    <div v-if="loading" class="ilw-empty">Loading interview workspace…</div>
    <div v-else-if="error" class="ilw-error">{{ error }}</div>
    <template v-else>
      <!-- Flow -->
      <div v-show="activeTab === 'flow'" class="ilw-panel">
        <div class="ilw-section-head">
          <h4>Interview flow</h4>
          <button type="button" class="ilw-link" :disabled="saving" @click="saveArtifacts">
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
        </div>
        <div v-for="section in flowSections" :key="section.key" class="ilw-flow-section">
          <div class="ilw-flow-title">
            <span>{{ section.label }}</span>
            <button
              v-if="section.key === 'icebreaker'"
              type="button"
              class="ilw-btn"
              @click="regenIcebreaker"
            >
              New icebreaker
            </button>
            <button
              v-if="section.key === 'salutation'"
              type="button"
              class="ilw-btn"
              @click="regenSalutation"
            >
              New salutation
            </button>
          </div>
          <div
            v-for="(q, qIdx) in sectionQuestions(section)"
            :key="`${section.key}_${q.key || qIdx}`"
            class="ilw-q"
            :class="{ done: isComplete(section.key, q.key || qIdx) }"
          >
            <button type="button" class="ilw-check" @click="toggleComplete(section.key, q.key || qIdx)">
              {{ isComplete(section.key, q.key || qIdx) ? '✓' : '' }}
            </button>
            <div class="ilw-q-text">{{ q.text || q.prompt || q }}</div>
          </div>
          <div v-if="!sectionQuestions(section).length && section.prompt" class="ilw-q">
            <div class="ilw-q-text muted">{{ section.prompt }}</div>
          </div>
        </div>
      </div>

      <!-- Notes -->
      <div v-show="activeTab === 'notes'" class="ilw-panel">
        <div class="ilw-section-head">
          <h4>Private notes</h4>
          <button type="button" class="ilw-link" :disabled="saving" @click="saveArtifacts">
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
        </div>
        <textarea v-model="myNotes" class="ilw-textarea" rows="12" placeholder="Notes only visible to the hiring team…" @blur="saveArtifacts" />
      </div>

      <!-- Scorecard -->
      <div v-show="activeTab === 'scorecard'" class="ilw-panel">
        <div class="ilw-section-head">
          <h4>Scorecard (out of 4)</h4>
          <button type="button" class="ilw-link" :disabled="saving" @click="saveArtifacts">
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
        </div>
        <div v-for="c in criteria" :key="c.key" class="ilw-score-row">
          <div class="ilw-score-label">{{ c.label }}</div>
          <div class="ilw-stars">
            <button
              v-for="n in 4"
              :key="n"
              type="button"
              class="ilw-star"
              :class="{ on: (ratings[c.key] || 0) >= n }"
              @click="setRating(c.key, n)"
            >★</button>
          </div>
        </div>
        <div class="ilw-avg">Average: {{ averageDisplay }}</div>
      </div>

      <!-- Transcript & intelligence -->
      <div v-show="activeTab === 'transcript'" class="ilw-panel">
        <div class="ilw-section-head">
          <h4>Transcript & summary</h4>
          <button type="button" class="ilw-link" :disabled="transcriptLoading" @click="loadMeetingNotes">
            {{ transcriptLoading ? 'Loading…' : 'Refresh' }}
          </button>
        </div>
        <p class="muted small" style="margin-bottom:8px;">
          Live speech is captured from the video room. Summary, action items, and quoted pay/schedule statements are generated when transcription stops or the scorecard is finalized.
        </p>
        <div v-if="meetingSummary" class="ilw-intel-block">
          <div class="ilw-brief-title">Interview summary & artifacts</div>
          <pre class="ilw-transcript-pre">{{ meetingSummary }}</pre>
        </div>
        <div v-if="meetingActionItems.length" class="ilw-intel-block">
          <div class="ilw-brief-title">Action items</div>
          <ul class="ilw-resume-list">
            <li v-for="(item, idx) in meetingActionItems" :key="item.id || idx">
              {{ item.text }}<span v-if="item.assigneeName"> — {{ item.assigneeName }}</span>
            </li>
          </ul>
        </div>
        <div class="ilw-intel-block">
          <div class="ilw-brief-title">Live transcript</div>
          <pre v-if="meetingTranscript" class="ilw-transcript-pre">{{ meetingTranscript }}</pre>
          <p v-else class="muted small">No transcript yet — join the video room to start capturing speech.</p>
        </div>
      </div>

      <!-- Team chat -->
      <div v-show="activeTab === 'chat'" class="ilw-panel ilw-chat">
        <div class="ilw-section-head">
          <h4>Team chat</h4>
          <span class="muted small">Interviewers only</span>
        </div>
        <div ref="chatScroll" class="ilw-chat-log">
          <div v-for="(m, idx) in teamChat" :key="idx" class="ilw-chat-msg">
            <div class="ilw-chat-meta">{{ m.authorName || 'Interviewer' }} · {{ formatWhen(m.at) }}</div>
            <div>{{ m.text }}</div>
          </div>
          <div v-if="!teamChat.length" class="muted small">No team messages yet.</div>
        </div>
        <form class="ilw-chat-form" @submit.prevent="sendChat">
          <input v-model="chatDraft" class="ilw-input" placeholder="Add a note for your team…" />
          <button type="submit" class="ilw-btn primary" :disabled="!chatDraft.trim() || saving">Send</button>
        </form>
      </div>

      <div class="ilw-footer">
        <button type="button" class="ilw-btn" :disabled="saving || finalizing || endingGuest" @click="saveArtifacts">Save progress</button>
        <button
          type="button"
          class="ilw-btn danger"
          :disabled="saving || finalizing || endingGuest || guestAccessEnded"
          :title="guestAccessEnded ? 'Interviewee access already ended' : 'End interviewee access; interviewers can stay'"
          @click="endGuestAccess"
        >
          {{ endingGuest ? 'Ending…' : (guestAccessEnded ? 'Interview ended for guest' : 'End Interview') }}
        </button>
        <button type="button" class="ilw-btn primary" :disabled="saving || finalizing || endingGuest" @click="finalize">
          {{ finalizing ? 'Finalizing…' : 'Finalize scorecard' }}
        </button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { buildQuickResumeBullets } from '../../utils/hiringResumeSummaryBullets.js';
import { digestPreScreenReport } from '../../utils/hiringPreScreenDigest.js';

const props = defineProps({
  eventId: { type: [Number, String], required: true },
  agencyId: { type: [Number, String], default: null },
  dark: { type: Boolean, default: true }
});

const emit = defineEmits(['finalized', 'loaded', 'guest-access-ended']);

const authStore = useAuthStore();
const tabs = [
  { id: 'flow', label: 'Flow' },
  { id: 'notes', label: 'Notes' },
  { id: 'scorecard', label: 'Scorecard' },
  { id: 'transcript', label: 'Transcript' },
  { id: 'chat', label: 'Team chat' }
];
const activeTab = ref('flow');
const loading = ref(false);
const saving = ref(false);
const finalizing = ref(false);
const endingGuest = ref(false);
const guestAccessEnded = ref(false);
const error = ref('');
const interviewId = ref(null);
const flowSections = ref([]);
const completed = reactive({});
const criteria = ref([]);
const ratings = reactive({});
const myNotes = ref('');
const teamChat = ref([]);
const chatDraft = ref('');
const unreadChat = ref(0);
const chatScroll = ref(null);
const candidateUserId = ref(null);
const resumeBullets = ref([]);
const researchBrief = ref([]);
const strengthItems = ref([]);
const weaknessItems = ref([]);
const briefPage = ref(0);
const meetingTranscript = ref('');
const meetingSummary = ref('');
const meetingActionItems = ref([]);
const transcriptLoading = ref(false);
let autosaveTimer = null;

const averageDisplay = computed(() => {
  const vals = criteria.value.map((c) => Number(ratings[c.key] || 0)).filter((n) => n > 0);
  if (!vals.length) return '—';
  return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
});

const agencyParam = computed(() => (props.agencyId ? { agencyId: props.agencyId } : {}));

onMounted(load);
watch(() => props.eventId, load);

onUnmounted(() => {
  if (autosaveTimer) clearTimeout(autosaveTimer);
});

async function load() {
  if (!props.eventId) return;
  loading.value = true;
  error.value = '';
  try {
    const r = await api.get(`/hiring/interview-hub/by-schedule-event/${props.eventId}`, {
      params: agencyParam.value
    });
    const data = r.data?.data || r.data || {};
    interviewId.value = data.interview?.id || null;
    candidateUserId.value = data.interview?.candidate_user_id || data.interview?.candidateUserId || null;
    const flow = data.flow || data.artifact?.flow_state_json || {};
    flowSections.value = Array.isArray(flow.sections) ? flow.sections : normalizeFlow(flow);
    const doneMap = flow.completed || data.artifact?.flow_state_json?.completed || {};
    Object.keys(completed).forEach((k) => delete completed[k]);
    Object.assign(completed, doneMap);

    const crit = data.template?.scorecard_criteria_json
      || data.artifact?.scorecard_json?.criteria
      || [
        { key: 'communication', label: 'Communication' },
        { key: 'relevant_experience', label: 'Relevant Experience' },
        { key: 'problem_solving', label: 'Problem Solving' },
        { key: 'culture_collaboration', label: 'Culture & Collaboration' },
        { key: 'overall_fit', label: 'Overall Fit' }
      ];
    criteria.value = Array.isArray(crit) ? crit : [];
    Object.keys(ratings).forEach((k) => delete ratings[k]);
    const savedRatings = data.artifact?.scorecard_json?.ratings || {};
    Object.assign(ratings, savedRatings);

    const notesMap = data.artifact?.private_notes_json || {};
    const uid = String(authStore.user?.id || '');
    myNotes.value = notesMap[uid] || notesMap[authStore.user?.id] || '';

    teamChat.value = Array.isArray(data.artifact?.team_chat_json) ? data.artifact.team_chat_json : [];
    guestAccessEnded.value = !!(data?.interview?.guest_access_ended_at);
    await loadResumeSummary();
    await loadMeetingNotes();
    emit('loaded', data);
  } catch (e) {
    error.value = e.response?.data?.error?.message
      || e.response?.data?.message
      || 'Interview workspace unavailable for this meeting.';
  } finally {
    loading.value = false;
  }
}

async function loadMeetingNotes() {
  if (!props.eventId) return;
  transcriptLoading.value = true;
  try {
    const notesR = await api.get(`/team-meetings/${props.eventId}/notes`, { skipGlobalLoading: true });
    meetingTranscript.value = String(notesR.data?.transcript || '').trim();
    meetingSummary.value = String(notesR.data?.summary || '').trim();
    if (interviewId.value) {
      const artR = await api.get(`/hiring/interview-hub/interviews/${interviewId.value}/artifacts`, {
        params: agencyParam.value,
        skipGlobalLoading: true
      });
      const art = artR.data?.data || artR.data || {};
      if (art.transcript_summary && !meetingSummary.value) {
        meetingSummary.value = String(art.transcript_summary).trim();
      }
      const items = art.action_items_json || art.actionItemsJson || [];
      meetingActionItems.value = Array.isArray(items) ? items : [];
    }
  } catch {
    meetingTranscript.value = meetingTranscript.value || '';
  } finally {
    transcriptLoading.value = false;
  }
}

async function loadResumeSummary() {
  const uid = candidateUserId.value;
  if (!uid || !props.agencyId) {
    resumeBullets.value = [];
    researchBrief.value = [];
    strengthItems.value = [];
    weaknessItems.value = [];
    return;
  }
  try {
    const [summaryR, candidateR] = await Promise.all([
      api.get(`/hiring/candidates/${uid}/resume-summary`, {
        params: { agencyId: props.agencyId }
      }),
      api.get(`/hiring/candidates/${uid}`, {
        params: { agencyId: props.agencyId }
      })
    ]);
    resumeBullets.value = buildQuickResumeBullets(summaryR.data?.summary || null);
    const reportText = candidateR.data?.latestPreScreen?.report_text || '';
    const digest = digestPreScreenReport(reportText);
    researchBrief.value = digest.researchBrief;
    strengthItems.value = digest.strengths;
    weaknessItems.value = digest.weaknesses;
  } catch {
    resumeBullets.value = [];
    researchBrief.value = [];
    strengthItems.value = [];
    weaknessItems.value = [];
  }
}

function normalizeFlow(flow) {
  if (!flow || typeof flow !== 'object') return [];
  if (Array.isArray(flow)) return flow;
  if (Array.isArray(flow.sections)) return flow.sections;
  return Object.keys(flow)
    .filter((k) => k !== 'completed' && k !== 'sections' && k !== 'generatedAt' && k !== 'scorecardCriteria')
    .map((key) => ({
      key,
      label: key.replace(/_/g, ' '),
      questions: Array.isArray(flow[key]) ? flow[key] : (flow[key] ? [{ key: `${key}_1`, text: String(flow[key]) }] : [])
    }));
}

function sectionQuestions(section) {
  if (!section) return [];
  if (Array.isArray(section.questions) && section.questions.length) return section.questions;
  if (section.item) {
    return [{ key: `${section.key}_1`, text: String(section.item) }];
  }
  return [];
}

function isComplete(sectionKey, qKey) {
  return !!completed[`${sectionKey}:${qKey}`];
}

function toggleComplete(sectionKey, qKey) {
  const id = `${sectionKey}:${qKey}`;
  completed[id] = !completed[id];
  queueSave();
}

function setRating(key, n) {
  ratings[key] = ratings[key] === n ? 0 : n;
  queueSave();
}

async function regenIcebreaker() {
  try {
    const r = await api.post('/hiring/interview-hub/icebreaker/random', {}, { params: agencyParam.value });
    const text = r.data?.data?.icebreaker || r.data?.icebreaker;
    if (!text) return;
    const sec = flowSections.value.find((s) => s.key === 'icebreaker');
    if (sec) {
      sec.item = text;
      sec.questions = [{ key: 'icebreaker_1', text }];
    }
    queueSave();
  } catch {
    /* ignore */
  }
}

async function regenSalutation() {
  try {
    const r = await api.post('/hiring/interview-hub/salutation/random', {}, { params: agencyParam.value });
    const text = r.data?.data?.salutation || r.data?.salutation;
    if (!text) return;
    const sec = flowSections.value.find((s) => s.key === 'salutation');
    if (sec) {
      sec.item = text;
      sec.questions = [{ key: 'salutation_1', text }];
    }
    queueSave();
  } catch {
    /* ignore */
  }
}

function queueSave() {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => saveArtifacts(), 800);
}

function buildPayload() {
  const uid = String(authStore.user?.id || 'unknown');
  const name = [authStore.user?.first_name, authStore.user?.last_name].filter(Boolean).join(' ') || 'Interviewer';
  return {
    agencyId: props.agencyId,
    flowStateJson: {
      sections: flowSections.value,
      completed: { ...completed }
    },
    scorecardJson: {
      criteria: criteria.value,
      ratings: { ...ratings },
      maxStars: 4
    },
    privateNotesJson: {
      [uid]: myNotes.value
    },
    teamChatJson: teamChat.value,
    _authorName: name,
    _authorId: uid
  };
}

async function saveArtifacts() {
  if (!interviewId.value) return;
  saving.value = true;
  try {
    const payload = buildPayload();
    // Merge notes with server map so we don't wipe other interviewers' notes
    const existing = await api.get(`/hiring/interview-hub/interviews/${interviewId.value}/artifacts`, {
      params: agencyParam.value
    });
    const prevNotes = existing.data?.data?.private_notes_json || {};
    payload.privateNotesJson = { ...prevNotes, ...payload.privateNotesJson };
    await api.put(`/hiring/interview-hub/interviews/${interviewId.value}/artifacts`, payload, {
      params: agencyParam.value
    });
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.response?.data?.message || 'Failed to save';
  } finally {
    saving.value = false;
  }
}

async function sendChat() {
  const text = chatDraft.value.trim();
  if (!text) return;
  const payload = buildPayload();
  teamChat.value = [
    ...teamChat.value,
    {
      text,
      at: new Date().toISOString(),
      authorId: payload._authorId,
      authorName: payload._authorName
    }
  ];
  chatDraft.value = '';
  if (activeTab.value !== 'chat') unreadChat.value += 1;
  await saveArtifacts();
}

watch(activeTab, (t) => {
  if (t === 'chat') unreadChat.value = 0;
  if (t === 'transcript') loadMeetingNotes();
});

async function finalize() {
  if (!interviewId.value) return;
  finalizing.value = true;
  try {
    await saveArtifacts();
    await api.post(`/hiring/interview-hub/interviews/${interviewId.value}/finalize`, {
      agencyId: props.agencyId
    }, { params: agencyParam.value });
    await loadMeetingNotes();
    emit('finalized');
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.response?.data?.message || 'Failed to finalize';
  } finally {
    finalizing.value = false;
  }
}

async function endGuestAccess() {
  if (!interviewId.value || guestAccessEnded.value) return;
  const ok = window.confirm(
    'End interview access for the candidate? They will see a thank-you screen and cannot rejoin. Interviewers can stay in the room.'
  );
  if (!ok) return;
  endingGuest.value = true;
  error.value = '';
  try {
    await saveArtifacts();
    const r = await api.post(
      `/hiring/interview-hub/interviews/${interviewId.value}/end-guest-access`,
      { agencyId: props.agencyId },
      { params: agencyParam.value }
    );
    guestAccessEnded.value = true;
    emit('guest-access-ended', r.data?.data || r.data || {});
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.response?.data?.message || 'Failed to end interview access';
  } finally {
    endingGuest.value = false;
  }
}

function formatWhen(v) {
  if (!v) return '';
  try {
    return new Date(v).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}
</script>

<style scoped>
.ilw {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  min-height: 0;
  color: #111827;
}
.ilw.dark { color: #e5e7eb; }
.ilw-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.ilw-tab {
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: transparent;
  color: inherit;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  position: relative;
}
.ilw-tab.active {
  background: #7c3aed;
  border-color: #7c3aed;
  color: #fff;
}
.ilw-badge {
  margin-left: 4px;
  background: #ef4444;
  color: #fff;
  border-radius: 999px;
  padding: 0 5px;
  font-size: 10px;
}
.ilw-panel {
  flex: 1;
  min-height: 0;
  overflow: auto;
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 12px;
  padding: 10px;
}
.ilw-section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.ilw-section-head h4 { margin: 0; font-size: 0.95rem; }
.ilw-flow-section { margin-bottom: 12px; }
.ilw-flow-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 6px;
  opacity: 0.85;
}
.ilw-q {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 8px;
  border-radius: 8px;
  margin-bottom: 4px;
  background: rgba(148, 163, 184, 0.08);
}
.ilw-q.done { opacity: 0.65; }
.ilw-check {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: 1px solid rgba(148, 163, 184, 0.5);
  background: transparent;
  color: #22c55e;
  cursor: pointer;
  flex-shrink: 0;
}
.ilw-q.done .ilw-check { background: rgba(34, 197, 94, 0.2); border-color: #22c55e; }
.ilw-q-text { font-size: 13px; line-height: 1.4; }
.ilw-textarea, .ilw-input {
  width: 100%;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: rgba(15, 23, 42, 0.35);
  color: inherit;
  padding: 8px;
  font: inherit;
}
.ilw.dark .ilw-textarea, .ilw.dark .ilw-input { background: rgba(15, 23, 42, 0.55); }
.ilw-score-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
}
.ilw-stars { display: flex; gap: 2px; }
.ilw-star {
  border: 0;
  background: transparent;
  color: #4b5563;
  font-size: 18px;
  cursor: pointer;
  padding: 0 2px;
}
.ilw-star.on { color: #fbbf24; }
.ilw-avg { margin-top: 10px; font-weight: 600; }
.ilw-chat { display: flex; flex-direction: column; }
.ilw-chat-log { flex: 1; overflow: auto; min-height: 160px; margin-bottom: 8px; }
.ilw-chat-msg { margin-bottom: 8px; font-size: 13px; }
.ilw-chat-meta { font-size: 11px; opacity: 0.7; margin-bottom: 2px; }
.ilw-chat-form { display: flex; gap: 6px; }
.ilw-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.ilw-resume {
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 10px;
  background: rgba(15, 23, 42, 0.35);
}
.ilw-brief {
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 10px;
  background: rgba(15, 23, 42, 0.35);
}
.ilw-brief-nav {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.ilw-brief-tab {
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: transparent;
  color: inherit;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 11px;
  cursor: pointer;
  opacity: 0.85;
}
.ilw-brief-tab.active {
  background: rgba(99, 102, 241, 0.35);
  border-color: rgba(129, 140, 248, 0.6);
  opacity: 1;
}
.ilw-brief-title {
  font-size: 11px;
  font-weight: 700;
  opacity: 0.75;
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.ilw-brief-body {
  max-height: 200px;
  overflow: auto;
}
.ilw-resume-list {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.45;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ilw-strengths li { color: #86efac; }
.ilw-weaknesses li { color: #fdba74; }
.ilw-intel-block { margin-bottom: 12px; }
.ilw-transcript-pre {
  margin: 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.35);
  border: 1px solid rgba(148, 163, 184, 0.25);
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 220px;
  overflow: auto;
}
.ilw-btn {
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: transparent;
  color: inherit;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 12px;
  cursor: pointer;
}
.ilw-btn.primary, .ilw-btn.primary:disabled {
  background: #7c3aed;
  border-color: #7c3aed;
  color: #fff;
}
.ilw-btn.danger {
  background: #b91c1c;
  border-color: #b91c1c;
  color: #fff;
}
.ilw-btn.danger:disabled {
  opacity: 0.65;
  cursor: default;
}
.ilw-link {
  border: 0;
  background: none;
  color: #a78bfa;
  cursor: pointer;
  font-size: 12px;
}
.ilw-empty, .ilw-error { padding: 12px; font-size: 13px; }
.ilw-error { color: #fca5a5; }
.muted { opacity: 0.7; }
.small { font-size: 11px; }
</style>
