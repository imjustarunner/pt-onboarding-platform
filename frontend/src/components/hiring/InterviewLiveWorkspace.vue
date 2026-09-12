<template>
  <div class="ilw" :class="{ dark: dark }">
    <Teleport :to="briefTeleportTarget || 'body'" :disabled="!briefTeleportTarget">
    <div class="ilw-brief" :class="{ dark }">
      <h3>{{ candidateName || 'Candidate brief' }}</h3><p class="muted small">{{ candidateRole }} · Interviewers only</p>
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
          <article v-for="(job, idx) in workHistory" :key="idx" class="ilw-source-card">
            <strong>{{ job.title }} · {{ job.employer }}</strong><p class="small">{{ job.startDate }} – {{ job.endDate || 'Present' }}</p>
            <p v-if="job.summary">{{ job.summary }}</p>
            <ul><li v-for="(item, i) in (job.highlights || job.responsibilities || [])" :key="i">{{ item }}</li></ul>
            <p class="ilw-prompt">Explore: What did you learn in your role at {{ job.employer || 'this organization' }}, and how would it apply here?</p>
          </article>
          <article v-if="education.length" class="ilw-source-card"><strong>Education</strong><p v-for="(item, i) in education" :key="i">{{ item.school }} · {{ item.degree }} {{ item.field }}</p></article>
          <article v-if="certifications.length" class="ilw-source-card"><strong>Certifications</strong><p v-for="(item, i) in certifications" :key="i">{{ item.name }}</p></article>
          <div class="ilw-skills"><span v-for="skill in skills" :key="skill">{{ skill }}</span></div>
          <details v-if="coverLetter"><summary>Cover letter</summary><p style="white-space:pre-wrap">{{ coverLetter }}</p></details>
          <div v-if="documents.length" class="ilw-source-card"><strong>Original documents</strong><button v-for="doc in documents" :key="doc.id" class="ilw-btn" @click="openDocument(doc)">{{ doc.title || doc.original_name || 'Open document' }}</button></div>
          <p v-if="documentError" role="alert">{{ documentError }}</p>
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

    </Teleport>
    <p class="ilw-save-status" role="status">{{ saving ? 'Saving…' : saveStatus }} · Interviewers only</p>
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
    <div v-if="error" class="ilw-error" role="alert">{{ error }} <button class="ilw-btn" @click="saveArtifacts">Retry save</button></div>
    <template v-if="!loading && interviewId">
      <!-- Flow -->
      <div v-show="activeTab === 'flow'" class="ilw-panel">
        <div class="ilw-section-head">
          <h4>Interview guide</h4><span class="small">{{ completedCount }} / {{ questionCount }} asked</span>
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
            <button type="button" :aria-label="`Mark question ${isComplete(section.key, q.key || qIdx) ? 'unasked' : 'asked'}`" :aria-pressed="isComplete(section.key, q.key || qIdx)" class="ilw-check" @click="toggleComplete(section.key, q.key || qIdx)">
              {{ isComplete(section.key, q.key || qIdx) ? '✓' : '' }}
            </button>
            <div class="ilw-q-text">{{ q.text || q.prompt || q }}</div>
          </div>
          <div v-if="!sectionQuestions(section).length && section.prompt" class="ilw-q">
            <div class="ilw-q-text muted">{{ section.prompt }}</div>
          </div>
        </div>
      </div>

      <form v-if="activeTab === 'flow'" class="ilw-chat-form" @submit.prevent="addQuestion"><input v-model="questionDraft" class="ilw-input" placeholder="Add an interview question…" aria-label="Additional interview question" /><button class="ilw-btn" :disabled="saving || !questionDraft.trim()">Add</button></form>
      <!-- Notes -->
      <div v-show="activeTab === 'notes'" class="ilw-panel">
        <div class="ilw-section-head">
          <h4>Private notes</h4>
          <button type="button" class="ilw-link" :disabled="saving" @click="saveArtifacts">
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
        </div>
        <textarea v-model="myNotes" class="ilw-textarea" rows="12" placeholder="Your private notes — only visible to you…" @input="notesDirty = true; queueSave()" @blur="saveArtifacts" />
      </div>

      <!-- Scorecard -->
      <div v-show="activeTab === 'scorecard'" class="ilw-panel">
        <div class="ilw-section-head">
          <h4>Your scorecard (out of 4)</h4>
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
              :aria-label="`${c.label}: ${n} out of 4`"
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
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { buildQuickResumeBullets } from '../../utils/hiringResumeSummaryBullets.js';
import { digestPreScreenReport } from '../../utils/hiringPreScreenDigest.js';

const props = defineProps({
  eventId: { type: [Number, String], required: true },
  agencyId: { type: [Number, String], default: null },
  dark: { type: Boolean, default: true },
  briefTarget: { type: String, default: null }
});

const emit = defineEmits(['finalized', 'loaded', 'guest-access-ended']);

const authStore = useAuthStore();
const briefTeleportTarget = ref(null);
const salutationPool = ref([]);
const icebreakerPool = ref([]);
const tabs = [
  { id: 'flow', label: 'Interview guide' },
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
let pollTimer = null;
let saveChain = Promise.resolve(true);
const pendingCompleted = reactive({});
const notesDirty = ref(false);
const ratingsDirty = ref(false);
const saveStatus = ref('Progress saved');
const candidateName = ref('');
const candidateRole = ref('');
const documents = ref([]);
const coverLetter = ref('');
const resumeSummary = ref({});
const documentError = ref('');
const questionDraft = ref('');
const completedCount = computed(() => Object.values(completed).filter(Boolean).length);
const questionCount = computed(() => flowSections.value.reduce((n, sec) => n + sectionQuestions(sec).length, 0));
const workHistory = computed(() => resumeSummary.value.workHistory || []);
const education = computed(() => resumeSummary.value.education || []);
const certifications = computed(() => resumeSummary.value.licensesAndCertifications || []);
const skills = computed(() => resumeSummary.value.skills || []);


const averageDisplay = computed(() => {
  const vals = criteria.value.map((c) => Number(ratings[c.key] || 0)).filter((n) => n > 0);
  if (!vals.length) return '—';
  return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
});

const agencyParam = computed(() => (props.agencyId ? { agencyId: props.agencyId } : {}));

onMounted(async () => {
  await nextTick();
  briefTeleportTarget.value = props.briefTarget ? document.querySelector(props.briefTarget) : null;
  await load();
  pollTimer = setInterval(refreshShared, 5000);
});
watch(() => props.eventId, load);

onUnmounted(() => {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  if (pollTimer) clearInterval(pollTimer);
  saveArtifacts();
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
    salutationPool.value = data.template?.salutation_pool_json || [];
    icebreakerPool.value = data.template?.icebreaker_pool_json || [];
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
    const savedRatings = data.artifact?.my_scorecard || {};
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
  if (!interviewId.value) return;
  try {
    const response = await api.get(`/hiring/interview-hub/interviews/${interviewId.value}/brief`);
    const brief = response.data?.data || {};
    candidateName.value = brief.candidateName || '';
    candidateRole.value = brief.role || '';
    documents.value = brief.documents || [];
    coverLetter.value = brief.coverLetter || '';
    resumeSummary.value = brief.summary?.summary || brief.summary || {};
    resumeBullets.value = buildQuickResumeBullets(brief.summary);
    const digest = digestPreScreenReport(brief.reportText || '');
    researchBrief.value = digest.researchBrief;
    strengthItems.value = digest.strengths;
    weaknessItems.value = digest.weaknesses;
  } catch { documentError.value = 'Candidate materials could not be loaded. Reopen the workspace to retry.'; }
}

async function openDocument(doc) {
  documentError.value = '';
  const tab = window.open('', '_blank');
  if (tab) tab.opener = null;
  try {
    const r = await api.get(`/hiring/interview-hub/interviews/${interviewId.value}/documents/${doc.id}`);
    if (tab && r.data?.url) tab.location = r.data.url;
    else { tab?.close(); documentError.value = 'Allow popups to open the original document.'; }
  } catch { tab?.close(); documentError.value = 'Unable to open this document.'; }
}

async function refreshShared() {
  if (!interviewId.value || saving.value || !document.hasFocus()) return;
  try {
    const r = await api.get(`/hiring/interview-hub/interviews/${interviewId.value}/artifacts`, { skipGlobalLoading: true });
    const art = r.data?.data || {};
    for (const [key, value] of Object.entries(art.flow_state_json?.completed || {})) {
      if (!(key in pendingCompleted)) completed[key] = value;
    }
    if (art.flow_state_json?.sections) flowSections.value = art.flow_state_json.sections;
    const incoming = art.team_chat_json || [];
    if (activeTab.value !== 'chat' && incoming.length > teamChat.value.length) unreadChat.value += incoming.length - teamChat.value.length;
    teamChat.value = incoming;
  } catch { saveStatus.value = 'Team sync interrupted — retrying'; }
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
  pendingCompleted[id] = completed[id];
  queueSave();
}

function setRating(key, n) {
  ratings[key] = ratings[key] === n ? 0 : n;
  ratingsDirty.value = true;
  queueSave();
}

async function regenIcebreaker() {
  try {
    const pool = icebreakerPool.value;
    const text = pool[Math.floor(Math.random() * pool.length)];
    if (!text) return;
    const sec = flowSections.value.find((s) => s.key === 'icebreaker');
    if (sec) {
      sec.item = text;
      sec.questions = [{ key: 'icebreaker_1', text }];
    }
    if (sec) await saveArtifacts({ sectionPatch: { ...sec } });
  } catch { error.value = 'Unable to update the interview guide.'; }
}

async function regenSalutation() {
  try {
    const pool = salutationPool.value;
    const text = pool[Math.floor(Math.random() * pool.length)];
    if (!text) return;
    const sec = flowSections.value.find((s) => s.key === 'salutation');
    if (sec) {
      sec.item = text;
      sec.questions = [{ key: 'salutation_1', text }];
    }
    if (sec) await saveArtifacts({ sectionPatch: { ...sec } });
  } catch { error.value = 'Unable to update the interview guide.'; }
}

function queueSave() {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  saveStatus.value = 'Unsaved changes';
  autosaveTimer = setTimeout(() => saveArtifacts(), 800);
}

function saveArtifacts(extra = {}) {
  if (extra instanceof Event) extra = {};
  if (autosaveTimer) clearTimeout(autosaveTimer);
  saveChain = saveChain.catch(() => false).then(async () => {
    if (!interviewId.value) return false;
    const delta = { ...pendingCompleted };
    const notes = myNotes.value;
    const currentRatings = { ...ratings };
    const payload = { ...extra, completedPatch: delta,
      ...(notesDirty.value ? { myNotes: notes } : {}),
      ...(ratingsDirty.value ? { myRatings: currentRatings } : {}) };
    if (!Object.keys(delta).length && payload.myNotes === undefined && payload.myRatings === undefined && !payload.sectionPatch && !payload.teamMessage) return true;
    saving.value = true;
    try {
      const r = await api.put(`/hiring/interview-hub/interviews/${interviewId.value}/artifacts`, payload);
      for (const [key, value] of Object.entries(delta)) if (pendingCompleted[key] === value) delete pendingCompleted[key];
      if (myNotes.value === notes) notesDirty.value = false;
      if (JSON.stringify(ratings) === JSON.stringify(currentRatings)) ratingsDirty.value = false;
      teamChat.value = r.data?.data?.team_chat_json || teamChat.value;
      error.value = '';
      saveStatus.value = 'Progress saved';
      return true;
    } catch (e) {
      error.value = e.response?.data?.error?.message || e.response?.data?.message || 'Your changes have not saved. Retry before leaving.';
      saveStatus.value = 'Unsaved changes';
      return false;
    } finally { saving.value = false; }
  });
  return saveChain;
}

let pendingMessage = null;
async function sendChat() {
  const text = chatDraft.value.trim();
  if (!text) return;
  if (!pendingMessage || pendingMessage.text !== text) pendingMessage = { id: crypto.randomUUID(), text };
  if (await saveArtifacts({ teamMessage: pendingMessage })) { chatDraft.value = ''; pendingMessage = null; }
}

async function addQuestion() {
  const text = questionDraft.value.trim();
  if (!text) return;
  const section = flowSections.value.find(s => s.key === 'additional') || { key: 'additional', label: 'Additional questions', questions: [] };
  const updated = { ...section, questions: [...section.questions, { key: crypto.randomUUID(), text }] };
  if (await saveArtifacts({ sectionPatch: updated })) { questionDraft.value = ''; await refreshShared(); }
}

watch(activeTab, (t) => {
  if (t === 'chat') unreadChat.value = 0;
  if (t === 'transcript') loadMeetingNotes();
});

async function finalize() {
  if (!interviewId.value) return;
  finalizing.value = true;
  try {
    if (!await saveArtifacts()) return;
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
    if (!await saveArtifacts()) return;
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
  flex-wrap: wrap;
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
  max-height: calc(100vh - 220px);
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

<style scoped>
.ilw-brief h3 { margin: 0 0 8px; }
.ilw-brief.dark { color: #e5e7eb; background: #192331; }
.ilw-source-card { border: 1px solid #64748b55; border-radius: 10px; padding: 12px; margin-top: 12px; font-size: 13px; }
.ilw-source-card p { margin: 8px 0; }
.ilw-source-card .ilw-btn { display: block; margin-top: 8px; text-align: left; }
.ilw-prompt { padding: 8px; background: #8b5cf622; border-radius: 6px; line-height: 1.5; }
.ilw-skills { display: flex; flex-wrap: wrap; gap: 5px; margin: 12px 0; }
.ilw-skills span { background: #64748b33; padding: 4px 8px; border-radius: 6px; font-size: 12px; }
.ilw-save-status { margin: 0; font-size: 12px; color: #86efac; }
</style>
