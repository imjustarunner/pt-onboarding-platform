<template>
  <div class="cip">
    <div class="cip-head">
      <div>
        <h3>Interviews</h3>
        <p class="muted small">Schedule a live Interview Hub meeting here (calendar, join link, scorecard). Results appear after finalize.</p>
      </div>
      <div class="cip-actions">
        <router-link class="btn btn-secondary btn-sm" :to="hubPath">Open Interview Hub</router-link>
        <button type="button" class="btn btn-primary btn-sm" @click="openScheduleForm">
          {{ showSchedule ? 'Hide schedule' : 'Schedule interview' }}
        </button>
      </div>
    </div>

    <div v-if="showSchedule" ref="scheduleSectionRef" class="cip-schedule">
      <div class="cip-schedule-title">New Interview Hub meeting</div>
      <div class="cip-schedule-form">
        <div class="cip-field">
          <label for="cip-round">Interview round</label>
          <select id="cip-round" v-model="interviewRound" class="cip-input">
            <option v-for="r in roundOptions" :key="r.key" :value="r.key">{{ r.label }}</option>
          </select>
        </div>
        <div v-if="interviewRound === 'other'" class="cip-field">
          <label for="cip-round-custom">Custom round label</label>
          <input id="cip-round-custom" v-model="roundLabelCustom" class="cip-input" type="text" placeholder="e.g. Culture fit call" />
        </div>
        <div class="cip-field cip-field--full">
          <label>Calendar title</label>
          <div class="cip-title-preview">{{ scheduleTitlePreview }}</div>
          <p class="muted small">Used on the calendar invite and Interview Hub list.</p>
        </div>
        <div class="cip-field">
          <label for="cip-starts">Start (local)</label>
          <input id="cip-starts" v-model="startsLocal" class="cip-input" type="datetime-local" />
        </div>
        <div class="cip-field">
          <label for="cip-tz">Timezone</label>
          <input id="cip-tz" v-model="timezone" class="cip-input" placeholder="America/Denver" />
        </div>
        <div class="cip-field">
          <label for="cip-duration">Duration (minutes)</label>
          <input id="cip-duration" v-model.number="durationMinutes" class="cip-input" type="number" min="15" max="240" />
        </div>
        <div class="cip-field">
          <label for="cip-questions">Job-specific questions</label>
          <select id="cip-questions" v-model="jobQuestionSetId" class="cip-input">
            <option value="">None (standard only)</option>
            <option v-for="s in jobSets" :key="s.id" :value="String(s.id)">{{ s.title }}</option>
          </select>
        </div>
        <div class="cip-field cip-field--full">
          <label for="cip-interviewers">Interviewers</label>
          <select id="cip-interviewers" v-model="interviewerPick" class="cip-input" @change="addInterviewer">
            <option value="">Add interviewer…</option>
            <option v-for="u in assignees" :key="u.id" :value="String(u.id)" :disabled="interviewerIds.includes(Number(u.id))">
              {{ u.first_name }} {{ u.last_name }}
            </option>
          </select>
          <div v-if="interviewerIds.length" class="chips">
            <span v-for="id in interviewerIds" :key="id" class="chip">
              {{ interviewerName(id) }}
              <button type="button" class="chip-x" aria-label="Remove interviewer" @click="removeInterviewer(id)">×</button>
            </span>
          </div>
        </div>
        <label class="cip-check cip-field--full">
          <input v-model="sendInvites" type="checkbox" />
          <span>Send calendar + email invites</span>
        </label>
      </div>
      <div class="row-actions">
        <button type="button" class="btn btn-primary" :disabled="scheduling || !startsLocal || !canSubmitSchedule" @click="scheduleInterview">
          {{ scheduling ? 'Scheduling…' : 'Create interview meeting' }}
        </button>
      </div>
      <div v-if="scheduleError" class="error-banner">{{ scheduleError }}</div>
    </div>

    <div v-if="loading" class="loading">Loading interviews…</div>
    <div v-else-if="!interviews.length" class="empty">No Interview Hub interviews yet. Schedule one above.</div>
    <div v-else class="cip-list">
      <div v-for="iv in interviews" :key="iv.id" class="cip-card" :class="{ active: Number(selectedId) === Number(iv.id) }" @click="selectInterview(iv)">
        <div class="cip-card-top">
          <strong>{{ interviewCardTitle(iv) }}</strong>
          <span class="badge" :class="iv.status">{{ iv.status }}</span>
        </div>
        <div class="muted small">{{ formatWhen(iv.interview_starts_at) }}</div>
        <div v-if="iv.public_join_url" class="muted small truncate">Join: {{ iv.public_join_url }}</div>
      </div>
    </div>

    <div v-if="selected" class="cip-detail">
      <h4>{{ interviewCardTitle(selected) }}</h4>
      <div class="kv"><div class="k">Status</div><div class="v">{{ selected.status }}</div></div>
      <div class="kv"><div class="k">When</div><div class="v">{{ formatWhen(selected.interview_starts_at) }} ({{ selected.interview_timezone || '—' }})</div></div>
      <div class="kv" v-if="selected.public_join_url">
        <div class="k">Candidate join link</div>
        <div class="v">
          <a :href="selected.public_join_url" target="_blank" rel="noopener">{{ selected.public_join_url }}</a>
          <button type="button" class="btn btn-secondary btn-sm" @click="copy(selected.public_join_url)">Copy</button>
        </div>
      </div>
      <div class="kv" v-if="selected.provider_schedule_event_id">
        <div class="k">Schedule event</div>
        <div class="v">#{{ selected.provider_schedule_event_id }}</div>
      </div>

      <div v-if="artifactLoading" class="loading">Loading results…</div>
      <template v-else-if="artifact">
        <div class="kv" v-if="artifact.average_score != null">
          <div class="k">Average score</div>
          <div class="v">{{ artifact.average_score }} / 4</div>
        </div>
        <div v-if="artifact.scorecard_json?.ratings" class="score-block">
          <h5>Scorecard</h5>
          <div v-for="(val, key) in artifact.scorecard_json.ratings" :key="key" class="score-row">
            <span>{{ labelForCriterion(key) }}</span>
            <span>{{ val || '—' }} ★</span>
          </div>
        </div>
        <div v-if="notesPreview" class="notes-block">
          <h5>Notes</h5>
          <pre class="pre">{{ notesPreview }}</pre>
        </div>
        <div v-if="artifact.finalized_at" class="muted small">Finalized {{ formatWhen(artifact.finalized_at) }}</div>
      </template>

    </div>

    <div v-if="!isHired" class="cip-capsule">
      <div class="cip-head">
        <div>
          <h3>Time capsule</h3>
          <p class="muted small">
            Seal 6- and 12-month predictions for this applicant. When due, a dismissable splash appears for up to 24 hours
            (snooze 1 hour at a time), or open them here until they’re hired.
          </p>
        </div>
      </div>
      <div v-if="capsuleError" class="error-banner">{{ capsuleError }}</div>
      <div class="cip-grid">
        <label class="small">6-month prediction</label>
        <textarea v-model="prediction6m" class="input" rows="2" placeholder="Where do you see this candidate in 6 months?" />
        <label class="small">12-month prediction</label>
        <textarea v-model="prediction12m" class="input" rows="2" placeholder="Where do you see this candidate in 12 months?" />
      </div>
      <div class="row-actions" style="margin-top:8px;">
        <button
          type="button"
          class="btn btn-primary btn-sm"
          :disabled="capsuleSaving || !prediction6m.trim() || !prediction12m.trim()"
          @click="saveCapsule"
        >
          {{ capsuleSaving ? 'Saving…' : 'Seal time capsule' }}
        </button>
      </div>
      <div v-if="capsuleLoading" class="loading" style="margin-top:10px;">Loading capsules…</div>
      <ul v-else-if="capsules.length" class="cip-capsule-list">
        <li v-for="c in capsules" :key="c.id">
          <div>
            <strong>{{ c.horizon_months }}-month</strong>
            · {{ [c.author_first_name, c.author_last_name].filter(Boolean).join(' ') || 'Interviewer' }}
            · {{ c.is_due ? 'Due' : `Opens ${formatWhen(c.reveal_at)}` }}
          </div>
          <button
            v-if="c.is_due"
            type="button"
            class="btn btn-secondary btn-sm"
            :disabled="capsuleOpeningId === c.id"
            @click="openCapsule(c)"
          >
            {{ capsuleOpeningId === c.id ? 'Opening…' : 'Open' }}
          </button>
        </li>
      </ul>
      <div v-if="openedCapsuleBody" class="notes-block" style="margin-top:10px;">
        <h5>Opened prediction</h5>
        <pre class="pre">{{ openedCapsuleBody }}</pre>
      </div>
    </div>
    <div v-else class="muted small">Time capsules are available on the applicant until they are hired.</div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { HIRING_INTERVIEW_ROUNDS, suggestInterviewRound } from '../../constants/hiringInterviewRounds.js';
import { buildHiringInterviewTitle } from '../../utils/hiringInterviewTitle.js';

const props = defineProps({
  candidateUserId: { type: [Number, String], required: true },
  agencyId: { type: [Number, String], required: true },
  assignees: { type: Array, default: () => [] },
  jobDescriptionId: { type: [Number, String], default: null },
  candidateStage: { type: String, default: '' },
  hiringProfileId: { type: [Number, String], default: null },
  candidateName: { type: String, default: '' },
  jobTitle: { type: String, default: '' },
  schedulePulse: { type: Number, default: 0 }
});

const authStore = useAuthStore();
const interviews = ref([]);
const loading = ref(false);
const selectedId = ref(null);
const artifact = ref(null);
const artifactLoading = ref(false);
const showSchedule = ref(true);
const emit = defineEmits(['interviews-updated']);
const scheduling = ref(false);
const scheduleError = ref('');
const startsLocal = ref('');
const timezone = ref(Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Denver');
const durationMinutes = ref(60);
const jobSets = ref([]);
const jobQuestionSetId = ref('');
const interviewerIds = ref([]);
const interviewerPick = ref('');
const sendInvites = ref(true);
const interviewRound = ref('initial');
const roundLabelCustom = ref('');
const roundOptions = HIRING_INTERVIEW_ROUNDS;
const capsules = ref([]);
const capsuleLoading = ref(false);
const capsuleSaving = ref(false);
const capsuleError = ref('');
const prediction6m = ref('');
const prediction12m = ref('');
const capsuleOpeningId = ref(null);
const openedCapsuleBody = ref('');
const scheduleSectionRef = ref(null);

const route = useRoute();

const hubPath = computed(() => {
  const slug = String(route.params?.organizationSlug || '').trim();
  return slug ? `/${slug}/admin/interview-hub` : '/admin/interview-hub';
});

const isHired = computed(() => String(props.candidateStage || '').toLowerCase() === 'hired');

const selected = computed(() => interviews.value.find((i) => Number(i.id) === Number(selectedId.value)) || null);

const scheduleTitlePreview = computed(() => buildHiringInterviewTitle({
  interviewRound: interviewRound.value,
  roundLabelCustom: roundLabelCustom.value,
  candidateName: props.candidateName,
  jobTitle: props.jobTitle
}));

const canSubmitSchedule = computed(() => {
  if (interviewRound.value === 'other' && !roundLabelCustom.value.trim()) return false;
  return true;
});

const notesPreview = computed(() => {
  const map = artifact.value?.private_notes_json || {};
  const parts = Object.entries(map).map(([uid, text]) => {
    if (!String(text || '').trim()) return null;
    return `User ${uid}:\n${text}`;
  }).filter(Boolean);
  return parts.join('\n\n');
});

onMounted(async () => {
  await Promise.all([loadInterviews(), loadJobSets(), loadCapsules()]);
});

watch(() => props.candidateUserId, async () => {
  await Promise.all([loadInterviews(), loadCapsules()]);
});

watch(() => props.schedulePulse, (n) => {
  if (n > 0) openScheduleForm();
}, { immediate: true, flush: 'post' });

function toDatetimeLocalValue(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function suggestDefaultStartLocal() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return toDatetimeLocalValue(d);
}

function ensureDefaultInterviewer() {
  const me = Number(authStore.user?.id || 0);
  if (!me) return;
  if (!interviewerIds.value.includes(me)) {
    interviewerIds.value = [...interviewerIds.value, me];
  }
}

function suggestRoundFromExisting() {
  interviewRound.value = suggestInterviewRound(interviews.value);
}

function openScheduleForm() {
  showSchedule.value = true;
  scheduleError.value = '';
  if (!startsLocal.value) startsLocal.value = suggestDefaultStartLocal();
  suggestRoundFromExisting();
  ensureDefaultInterviewer();
  nextTick(() => {
    scheduleSectionRef.value?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  });
}

defineExpose({ openScheduleForm });

async function loadInterviews() {
  if (!props.candidateUserId || !props.agencyId) return;
  loading.value = true;
  try {
    const r = await api.get(`/hiring/interview-hub/candidates/${props.candidateUserId}/interviews`, {
      params: { agencyId: props.agencyId }
    });
    interviews.value = r.data?.data || r.data || [];
    if (!interviews.value.length) showSchedule.value = true;
    if (showSchedule.value) suggestRoundFromExisting();
    if (interviews.value.length && !selectedId.value) {
      await selectInterview(interviews.value[0]);
    }
    emit('interviews-updated', interviews.value);
  } catch {
    interviews.value = [];
    showSchedule.value = true;
    emit('interviews-updated', []);
  } finally {
    loading.value = false;
  }
}

async function loadJobSets() {
  try {
    const r = await api.get('/hiring/interview-hub/job-question-sets', {
      params: { agencyId: props.agencyId, jobDescriptionId: props.jobDescriptionId || undefined }
    });
    jobSets.value = r.data?.data || r.data || [];
  } catch {
    jobSets.value = [];
  }
}

async function selectInterview(iv) {
  selectedId.value = iv.id;
  artifactLoading.value = true;
  artifact.value = null;
  try {
    const r = await api.get(`/hiring/interview-hub/interviews/${iv.id}/artifacts`, {
      params: { agencyId: props.agencyId }
    });
    artifact.value = r.data?.data || r.data || null;
  } catch {
    artifact.value = null;
  } finally {
    artifactLoading.value = false;
  }
}

function interviewerName(id) {
  const u = (props.assignees || []).find((a) => Number(a.id) === Number(id));
  return u ? `${u.first_name || ''} ${u.last_name || ''}`.trim() : `User ${id}`;
}

function addInterviewer() {
  const id = Number(interviewerPick.value);
  interviewerPick.value = '';
  if (!id || interviewerIds.value.includes(id)) return;
  interviewerIds.value = [...interviewerIds.value, id];
}

function removeInterviewer(id) {
  interviewerIds.value = interviewerIds.value.filter((x) => Number(x) !== Number(id));
}

async function scheduleInterview() {
  scheduling.value = true;
  scheduleError.value = '';
  try {
    const startsAt = startsLocal.value
      ? new Date(startsLocal.value).toISOString()
      : '';
    if (!startsAt || Number.isNaN(new Date(startsAt).getTime())) {
      scheduleError.value = 'Pick a valid start date and time.';
      return;
    }
    await api.post('/hiring/interview-hub/interviews', {
      agencyId: props.agencyId,
      candidateUserId: props.candidateUserId,
      startsAt,
      timezone: timezone.value,
      durationMinutes: durationMinutes.value,
      interviewerUserIds: interviewerIds.value,
      jobQuestionSetId: jobQuestionSetId.value || null,
      hiringProfileId: props.hiringProfileId || null,
      sendInvites: sendInvites.value,
      interviewRound: interviewRound.value,
      roundLabelCustom: interviewRound.value === 'other' ? roundLabelCustom.value.trim() : null
    });
    showSchedule.value = false;
    await loadInterviews();
  } catch (e) {
    scheduleError.value = e.response?.data?.error?.message
      || e.response?.data?.message
      || 'Failed to schedule interview';
  } finally {
    scheduling.value = false;
  }
}

function interviewCardTitle(iv) {
  if (!iv) return 'Interview';
  if (iv.display_title) return iv.display_title;
  return buildHiringInterviewTitle({
    interviewRound: iv.interview_round || 'initial',
    candidateName: props.candidateName,
    jobTitle: props.jobTitle
  });
}

function labelForCriterion(key) {
  const c = (artifact.value?.scorecard_json?.criteria || []).find((x) => x.key === key);
  return c?.label || String(key).replace(/_/g, ' ');
}

function formatWhen(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v);
  }
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* ignore */
  }
}

async function loadCapsules() {
  if (!props.candidateUserId || !props.agencyId || isHired.value) {
    capsules.value = [];
    return;
  }
  capsuleLoading.value = true;
  capsuleError.value = '';
  try {
    const r = await api.get(`/hiring/candidates/${props.candidateUserId}/time-capsules`, {
      params: { agencyId: props.agencyId }
    });
    capsules.value = r.data?.capsules || [];
  } catch (e) {
    capsules.value = [];
    capsuleError.value = e.response?.data?.error?.message || '';
  } finally {
    capsuleLoading.value = false;
  }
}

async function saveCapsule() {
  capsuleSaving.value = true;
  capsuleError.value = '';
  try {
    const r = await api.post(`/hiring/candidates/${props.candidateUserId}/time-capsules`, {
      agencyId: props.agencyId,
      prediction6m: prediction6m.value.trim(),
      prediction12m: prediction12m.value.trim()
    });
    capsules.value = r.data?.capsules || [];
    prediction6m.value = '';
    prediction12m.value = '';
  } catch (e) {
    capsuleError.value = e.response?.data?.error?.message || e.message || 'Failed to seal capsule';
  } finally {
    capsuleSaving.value = false;
  }
}

async function openCapsule(c) {
  if (!c?.id) return;
  capsuleOpeningId.value = c.id;
  capsuleError.value = '';
  openedCapsuleBody.value = '';
  try {
    const r = await api.post(
      `/hiring/candidates/${props.candidateUserId}/time-capsules/${c.id}/open`,
      {},
      { params: { agencyId: props.agencyId } }
    );
    openedCapsuleBody.value = r.data?.bodyText || r.data?.body_text || '(empty)';
  } catch (e) {
    capsuleError.value = e.response?.data?.error?.message || e.message || 'Could not open capsule';
  } finally {
    capsuleOpeningId.value = null;
  }
}
</script>

<style scoped>
.cip {
  display: flex;
  flex-direction: column;
  gap: 14px;
  font-family: inherit;
  color: #0f172a;
}
.cip-head { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; align-items: flex-start; }
.cip-head h3 { margin: 0 0 4px; font-size: 1.05rem; font-weight: 700; color: #0f172a; }
.cip-head .muted { color: #64748b; font-size: 13px; line-height: 1.45; }
.cip-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.cip-schedule, .cip-detail, .cip-card {
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 16px;
  background: #f8fafc;
}
.cip-schedule-title {
  font-size: 13px;
  font-weight: 700;
  color: #334155;
  margin-bottom: 12px;
  letter-spacing: 0.01em;
}
.cip-schedule-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 16px;
}
.cip-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.cip-field--full { grid-column: 1 / -1; }
.cip-title-preview {
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
  background: #fff;
}
.cip-field label {
  font-size: 12px;
  font-weight: 600;
  color: #475569;
  letter-spacing: 0.02em;
}
.cip-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 14px;
  line-height: 1.35;
  color: #0f172a;
  background: #fff;
  font-family: inherit;
}
.cip-input:focus {
  outline: none;
  border-color: #7c3aed;
  box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.12);
}
.cip-check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #334155;
  cursor: pointer;
  margin: 0;
}
.cip-check input { width: 16px; height: 16px; accent-color: #5b21b6; }
.cip-grid { display: grid; gap: 8px; }
.cip-list { display: grid; gap: 8px; }
.cip-card { cursor: pointer; }
.cip-card.active { outline: 2px solid #7c3aed; }
.cip-card-top { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
.badge { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: #e5e7eb; text-transform: capitalize; }
.badge.completed { background: #d1fae5; color: #065f46; }
.badge.scheduled { background: #ede9fe; color: #5b21b6; }
.badge.in_progress { background: #ffedd5; color: #9a3412; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { background: #fff; border: 1px solid #e2e8f0; border-radius: 999px; padding: 4px 10px; font-size: 13px; display: inline-flex; gap: 6px; align-items: center; color: #334155; }
.chip-x { border: 0; background: none; cursor: pointer; color: #64748b; font-size: 16px; line-height: 1; padding: 0; }
.check-row { display: flex; gap: 8px; align-items: center; font-size: 13px; }
.kv { display: grid; grid-template-columns: 140px 1fr; gap: 8px; margin: 6px 0; font-size: 13px; }
.k { color: #64748b; }
.muted { color: #64748b; }
.small { font-size: 13px; }
.score-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
.pre { white-space: pre-wrap; font-size: 12px; background: #f9fafb; padding: 8px; border-radius: 8px; }
.truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.legacy-divider { margin-top: 12px; }
.cip-capsule {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 12px;
  padding: 12px;
  background: #fff;
}
.cip-capsule-list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cip-capsule-list li {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
  background: #f8fafc;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
}
.error-banner {
  background: #fef2f2;
  color: #b91c1c;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 8px 10px;
  margin-bottom: 8px;
  font-size: 13px;
}
.row-actions { display: flex; gap: 8px; margin-top: 14px; }
@media (max-width: 720px) {
  .cip-schedule-form { grid-template-columns: 1fr; }
}
</style>
