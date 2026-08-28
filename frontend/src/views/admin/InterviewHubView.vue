<template>
  <div class="ih-root container">
    <div class="ih-header">
      <div>
        <h2 class="ih-title">Interview Hub</h2>
        <p class="ih-subtitle">Create, customize, and manage interview experiences.</p>
      </div>
      <div class="ih-header-actions">
        <div v-if="canChooseAgency" class="ih-agency-picker">
          <label class="ih-label">Agency</label>
          <select v-model="selectedAgencyId" class="input">
            <option v-for="a in agencyChoices" :key="a.id" :value="String(a.id)">{{ a.name }}</option>
          </select>
        </div>
        <button
          v-if="activeTab === 'interviews'"
          type="button"
          class="btn btn-primary"
          :disabled="!effectiveAgencyId"
          @click="openScheduleModal"
        >
          Schedule interview
        </button>
        <button type="button" class="btn btn-secondary" :disabled="loading" @click="refresh">
          Refresh
        </button>
      </div>
    </div>

    <div class="ih-tabs" role="tablist">
      <button
        type="button"
        class="ih-tab"
        :class="{ active: activeTab === 'interviews' }"
        role="tab"
        @click="activeTab = 'interviews'"
      >
        My Interviews
      </button>
      <button
        type="button"
        class="ih-tab"
        :class="{ active: activeTab === 'templates' }"
        role="tab"
        @click="activeTab = 'templates'; loadTemplatesTab()"
      >
        Templates
      </button>
    </div>

    <div v-if="error" class="ih-error">{{ error }}</div>
    <div v-if="successMsg" class="ih-success">{{ successMsg }}</div>

    <!-- My Interviews -->
    <div v-if="activeTab === 'interviews'" class="ih-split">
      <aside class="ih-sidebar">
        <div class="ih-filters">
          <button
            v-for="f in filterOptions"
            :key="f.key"
            type="button"
            class="ih-chip"
            :class="{ active: timeFilter === f.key }"
            @click="timeFilter = f.key"
          >
            {{ f.label }}
          </button>
        </div>
        <div v-if="loading && !interviews.length" class="ih-muted ih-pad">Loading interviews…</div>
        <div v-else-if="!filteredInterviews.length" class="ih-muted ih-pad">No interviews in this range.</div>
        <ul v-else class="ih-list">
          <li
            v-for="iv in filteredInterviews"
            :key="iv.id"
            class="ih-list-item"
            :class="{ selected: selectedInterviewId === iv.id }"
            @click="selectInterview(iv.id)"
          >
            <div class="ih-list-name">{{ interviewListLabel(iv) }}</div>
            <div class="ih-list-meta">
              <span class="ih-status" :class="`st-${iv.status}`">{{ iv.status || '—' }}</span>
              <span>{{ fmtDateTime(iv.interview_starts_at) }}</span>
            </div>
          </li>
        </ul>
      </aside>

      <main class="ih-main">
        <div v-if="!selectedInterview" class="ih-empty-main">
          <p>Select an interview to view details, or schedule a new one.</p>
        </div>
        <div v-else class="ih-detail">
          <div class="ih-detail-head">
            <div>
              <h3>{{ interviewListLabel(selectedInterview) }}</h3>
              <div class="ih-detail-meta">
                <span class="ih-status" :class="`st-${selectedInterview.status}`">{{ selectedInterview.status }}</span>
                <span>{{ fmtDateTime(selectedInterview.interview_starts_at) }}</span>
                <span v-if="selectedInterview.interview_timezone" class="ih-muted">{{ selectedInterview.interview_timezone }}</span>
              </div>
            </div>
            <div class="ih-detail-actions">
              <a
                v-if="selectedInterview.public_join_url"
                class="btn btn-primary btn-sm"
                :href="selectedInterview.public_join_url"
                target="_blank"
                rel="noopener noreferrer"
              >Open join link</a>
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                :disabled="!selectedInterview.public_join_url"
                @click="copyInvite"
              >Copy invite</button>
              <button
                v-if="canEditSelected"
                type="button"
                class="btn btn-secondary btn-sm"
                @click="toggleEditInterview"
              >{{ showEditInterview ? 'Cancel edit' : 'Edit interview' }}</button>
            </div>
          </div>

          <div v-if="showEditInterview" class="ih-edit-panel">
            <div class="ih-edit-grid">
              <label class="ih-label">Start</label>
              <input v-model="editForm.startsAt" class="input" type="datetime-local" />
              <label class="ih-label">Timezone</label>
              <select v-model="editForm.timezone" class="input">
                <option v-for="tz in timezoneOptions" :key="`edit-${tz}`" :value="tz">{{ tz }}</option>
              </select>
              <label class="ih-label ih-field-full">Interviewers</label>
              <select v-model="editInterviewerPick" class="input ih-field-full" @change="addEditInterviewer">
                <option value="">Add interviewer…</option>
                <option
                  v-for="a in assignees"
                  :key="`edit-${a.id || a.user_id}`"
                  :value="String(a.id || a.user_id)"
                  :disabled="editForm.interviewerUserIds.includes(String(a.id || a.user_id))"
                >
                  {{ formatAssigneeOption(a) }}
                </option>
              </select>
              <div v-if="editForm.interviewerUserIds.length" class="ih-chips ih-field-full">
                <span v-for="id in editForm.interviewerUserIds" :key="`chip-${id}`" class="ih-chip">
                  {{ interviewerNameById(id) }}
                  <button type="button" class="ih-chip-x" aria-label="Remove interviewer" @click="removeEditInterviewer(id)">×</button>
                </span>
              </div>
            </div>
            <div class="ih-edit-actions">
              <button
                type="button"
                class="btn btn-primary btn-sm"
                :disabled="savingEdit || !editForm.startsAt"
                @click="saveInterviewEdit"
              >{{ savingEdit ? 'Saving…' : 'Save changes' }}</button>
            </div>
            <p v-if="editError" class="error-inline">{{ editError }}</p>
          </div>

          <div class="ih-detail-grid">
            <div class="ih-field">
              <div class="ih-field-label">Interviewers</div>
              <div>{{ interviewerLabels(selectedInterview).join(', ') || '—' }}</div>
            </div>
            <div class="ih-field">
              <div class="ih-field-label">Job question set</div>
              <div>{{ jobSetTitle(selectedInterview.job_question_set_id) || '—' }}</div>
            </div>
            <div class="ih-field ih-field-wide">
              <div class="ih-field-label">Join URL</div>
              <div class="ih-url-row">
                <code class="ih-url">{{ selectedInterview.public_join_url || 'Not available' }}</code>
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  :disabled="!selectedInterview.public_join_url"
                  @click="copyText(selectedInterview.public_join_url)"
                >Copy</button>
              </div>
              <p class="ih-hint">Candidates join as guests. Signed-in staff join as hosts on the same link.</p>
            </div>
            <div v-if="selectedInterview.provider_schedule_event_id" class="ih-field">
              <div class="ih-field-label">Schedule event</div>
              <router-link :to="scheduleEventLink(selectedInterview)" class="ih-link">
                Event #{{ selectedInterview.provider_schedule_event_id }}
              </router-link>
            </div>
          </div>
        </div>
      </main>
    </div>

    <!-- Templates -->
    <div v-else class="ih-templates">
      <section class="ih-panel">
        <div class="ih-panel-head">
          <div>
            <h3>Default template</h3>
            <p class="ih-muted small">Standard questions, scorecard, and icebreaker pools for new interviews.</p>
          </div>
          <button type="button" class="btn btn-primary btn-sm" :disabled="savingTemplate || !template" @click="saveTemplate">
            {{ savingTemplate ? 'Saving…' : 'Save' }}
          </button>
        </div>

        <div v-if="loadingTemplates" class="ih-muted">Loading template…</div>
        <template v-else-if="template">
          <label class="ih-label">Standard questions <span class="ih-hint">(one per line)</span></label>
          <textarea v-model="templateForm.standardQuestionsText" class="input ih-textarea" rows="6" />

          <div class="ih-scorecard">
            <div class="ih-scorecard-head">
              <label class="ih-label">Scorecard criteria</label>
              <button type="button" class="btn btn-secondary btn-sm" @click="addCriterion">Add</button>
            </div>
            <div v-for="(c, idx) in templateForm.criteria" :key="idx" class="ih-criterion-row">
              <input v-model="c.label" class="input" type="text" placeholder="Label" />
              <input v-model.number="c.weight" class="input ih-weight" type="number" min="0" step="0.1" placeholder="Weight" />
              <button type="button" class="btn btn-secondary btn-sm" @click="templateForm.criteria.splice(idx, 1)">✕</button>
            </div>
          </div>

          <label class="ih-label">Salutation pool <span class="ih-hint">(one per line)</span></label>
          <textarea v-model="templateForm.salutationsText" class="input ih-textarea" rows="5" />

          <label class="ih-label">Icebreaker pool <span class="ih-hint">(one per line)</span></label>
          <textarea v-model="templateForm.icebreakersText" class="input ih-textarea" rows="5" />
        </template>
      </section>

      <section class="ih-panel">
        <div class="ih-panel-head">
          <div>
            <h3>Job question sets</h3>
            <p class="ih-muted small">Role-specific questions attached when scheduling an interview.</p>
          </div>
          <button type="button" class="btn btn-primary btn-sm" @click="startNewJobSet">New set</button>
        </div>

        <div v-if="editingJobSet" class="ih-jobset-form">
          <label class="ih-label">Title</label>
          <input v-model="jobSetForm.title" class="input" type="text" placeholder="e.g. BCBA interview questions" />

          <label class="ih-label">Job description <span class="ih-hint">(optional)</span></label>
          <select v-model="jobSetForm.jobDescriptionId" class="input">
            <option value="">— None —</option>
            <option v-for="j in jobDescriptions" :key="j.id" :value="String(j.id)">{{ j.title || `Job #${j.id}` }}</option>
          </select>

          <label class="ih-label">Questions <span class="ih-hint">(one per line)</span></label>
          <textarea v-model="jobSetForm.questionsText" class="input ih-textarea" rows="5" />

          <div class="ih-row-actions">
            <button type="button" class="btn btn-primary btn-sm" :disabled="savingJobSet || !jobSetForm.title.trim()" @click="saveJobSet">
              {{ savingJobSet ? 'Saving…' : (jobSetForm.id ? 'Update' : 'Create') }}
            </button>
            <button type="button" class="btn btn-secondary btn-sm" @click="editingJobSet = false">Cancel</button>
          </div>
        </div>

        <div v-if="loadingJobSets" class="ih-muted">Loading sets…</div>
        <ul v-else-if="jobSets.length" class="ih-jobset-list">
          <li v-for="s in jobSets" :key="s.id" class="ih-jobset-item">
            <div>
              <div class="ih-list-name">{{ s.title }}</div>
              <div class="ih-muted small">{{ questionCount(s) }} question(s)</div>
            </div>
            <div class="ih-row-actions">
              <button type="button" class="btn btn-secondary btn-sm" @click="editJobSet(s)">Edit</button>
              <button type="button" class="btn btn-secondary btn-sm" @click="removeJobSet(s)">Delete</button>
            </div>
          </li>
        </ul>
        <div v-else class="ih-muted">No job question sets yet.</div>
      </section>
    </div>

    <!-- Schedule modal -->
    <div v-if="showScheduleModal" class="ih-modal-overlay" @click.self="showScheduleModal = false">
      <div class="ih-modal" role="dialog" aria-labelledby="ih-schedule-title">
        <div class="ih-modal-header">
          <h3 id="ih-schedule-title">Schedule new interview</h3>
          <button type="button" class="btn btn-secondary btn-sm" @click="showScheduleModal = false">Close</button>
        </div>
        <div class="ih-modal-body">
          <label class="ih-label">Candidate</label>
          <select v-model="scheduleForm.candidateUserId" class="input">
            <option value="">Select candidate…</option>
            <option v-for="c in candidates" :key="c.id || c.user_id" :value="String(c.user_id || c.id)">
              {{ formatCandidateOption(c) }}
            </option>
          </select>

          <label class="ih-label">Interview round</label>
          <select v-model="scheduleForm.interviewRound" class="input">
            <option v-for="r in roundOptions" :key="r.key" :value="r.key">{{ r.label }}</option>
          </select>

          <label v-if="scheduleForm.interviewRound === 'other'" class="ih-label">Custom round label</label>
          <input
            v-if="scheduleForm.interviewRound === 'other'"
            v-model="scheduleForm.roundLabelCustom"
            class="input"
            type="text"
            placeholder="e.g. Culture fit call"
          />

          <div class="ih-field-full">
            <label class="ih-label">Calendar title</label>
            <div class="ih-title-preview">{{ scheduleTitlePreview }}</div>
          </div>

          <label class="ih-label">Start</label>
          <input v-model="scheduleForm.startsAt" class="input" type="datetime-local" />

          <label class="ih-label">Timezone</label>
          <select v-model="scheduleForm.timezone" class="input">
            <option v-for="tz in timezoneOptions" :key="tz" :value="tz">{{ tz }}</option>
          </select>

          <label class="ih-label">Duration (minutes)</label>
          <input v-model.number="scheduleForm.durationMinutes" class="input" type="number" min="15" max="240" step="15" />

          <label class="ih-label">Interviewers</label>
          <select v-model="scheduleForm.interviewerUserIds" class="input ih-multi" multiple>
            <option v-for="a in assignees" :key="a.id || a.user_id" :value="String(a.id || a.user_id)">
              {{ formatAssigneeOption(a) }}
            </option>
          </select>
          <p class="ih-hint">Hold Ctrl/Cmd to select multiple.</p>

          <label class="ih-label">Job question set</label>
          <select v-model="scheduleForm.jobQuestionSetId" class="input">
            <option value="">— None —</option>
            <option v-for="s in jobSets" :key="s.id" :value="String(s.id)">{{ s.title }}</option>
          </select>

          <label class="ih-checkbox">
            <input v-model="scheduleForm.sendInvites" type="checkbox" />
            Send calendar invites
          </label>
        </div>
        <div class="ih-modal-footer">
          <button type="button" class="btn btn-secondary" @click="showScheduleModal = false">Cancel</button>
          <button type="button" class="btn btn-primary" :disabled="scheduling || !canSubmitSchedule" @click="submitSchedule">
            {{ scheduling ? 'Scheduling…' : 'Submit' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import { HIRING_INTERVIEW_ROUNDS, suggestInterviewRound } from '../../constants/hiringInterviewRounds.js';
import { buildHiringInterviewTitle } from '../../utils/hiringInterviewTitle.js';

const route = useRoute();
const agencyStore = useAgencyStore();
const authStore = useAuthStore();

const activeTab = ref('interviews');
const loading = ref(false);
const loadingTemplates = ref(false);
const loadingJobSets = ref(false);
const savingTemplate = ref(false);
const savingJobSet = ref(false);
const scheduling = ref(false);
const error = ref('');
const successMsg = ref('');

const interviews = ref([]);
const selectedInterviewId = ref(null);
const timeFilter = ref('all');
const candidates = ref([]);
const assignees = ref([]);
const jobDescriptions = ref([]);
const jobSets = ref([]);
const template = ref(null);
const showScheduleModal = ref(false);
const editingJobSet = ref(false);

const selectedAgencyId = ref('');
const agencyChoices = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  const base = role === 'super_admin'
    ? (Array.isArray(agencyStore.agencies) ? agencyStore.agencies : [])
    : (Array.isArray(agencyStore.userAgencies) ? agencyStore.userAgencies : []);
  return (base || [])
    .filter((o) => String(o?.organization_type || 'agency').toLowerCase() === 'agency')
    .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
});
const canChooseAgency = computed(() => agencyChoices.value.length > 1);
const effectiveAgencyId = computed(() => {
  const chosen = Number(selectedAgencyId.value || 0) || null;
  if (chosen) return chosen;
  const a = agencyStore.currentAgency?.value || agencyStore.currentAgency;
  return Number(a?.id || authStore.user?.agencyId || 0) || null;
});

const orgPath = (path) => {
  const slug = String(route.params?.organizationSlug || '').trim();
  if (!slug) return path;
  return `/${slug}${path}`;
};

const filterOptions = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'later', label: 'Later' }
];

const timezoneOptions = [
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Chicago',
  'America/New_York',
  'UTC'
];

const templateForm = ref({
  standardQuestionsText: '',
  criteria: [],
  salutationsText: '',
  icebreakersText: ''
});

const jobSetForm = ref({
  id: null,
  title: '',
  jobDescriptionId: '',
  questionsText: ''
});

const scheduleForm = ref({
  candidateUserId: '',
  startsAt: '',
  timezone: 'America/Denver',
  durationMinutes: 60,
  interviewerUserIds: [],
  jobQuestionSetId: '',
  sendInvites: true,
  interviewRound: 'initial',
  roundLabelCustom: ''
});

const roundOptions = HIRING_INTERVIEW_ROUNDS;

const candidateById = computed(() => {
  const map = new Map();
  for (const c of candidates.value) {
    const id = Number(c.user_id || c.id);
    if (id) map.set(id, c);
  }
  return map;
});

const assigneeById = computed(() => {
  const map = new Map();
  for (const a of assignees.value) {
    const id = Number(a.id || a.user_id);
    if (id) map.set(id, a);
  }
  return map;
});

const selectedInterview = computed(() =>
  interviews.value.find((i) => Number(i.id) === Number(selectedInterviewId.value)) || null
);

const canEditSelected = computed(() => {
  const status = String(selectedInterview.value?.status || '').toLowerCase();
  return status === 'scheduled' || status === 'in_progress';
});

const showEditInterview = ref(false);
const savingEdit = ref(false);
const editError = ref('');
const editInterviewerPick = ref('');
const editForm = ref({
  startsAt: '',
  timezone: 'America/Denver',
  interviewerUserIds: []
});

function toDatetimeLocalValue(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function interviewerNameById(id) {
  const a = assigneeById.value.get(Number(id));
  return a ? formatAssigneeOption(a) : `#${id}`;
}

function populateEditForm(iv = selectedInterview.value) {
  if (!iv) return;
  editError.value = '';
  editInterviewerPick.value = '';
  editForm.value = {
    startsAt: iv.interview_starts_at ? toDatetimeLocalValue(new Date(iv.interview_starts_at)) : '',
    timezone: iv.interview_timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Denver',
    interviewerUserIds: (Array.isArray(iv.interviewer_user_ids_json) ? iv.interviewer_user_ids_json : [])
      .map((id) => String(id))
      .filter(Boolean)
  };
  if (!timezoneOptions.includes(editForm.value.timezone)) {
    timezoneOptions.push(editForm.value.timezone);
  }
}

async function toggleEditInterview() {
  if (showEditInterview.value) {
    showEditInterview.value = false;
    editError.value = '';
    return;
  }
  try {
    await loadAssignees();
  } catch {
    /* keep empty assignee list */
  }
  populateEditForm();
  showEditInterview.value = true;
}

function addEditInterviewer() {
  const id = String(editInterviewerPick.value || '').trim();
  editInterviewerPick.value = '';
  if (!id || editForm.value.interviewerUserIds.includes(id)) return;
  editForm.value.interviewerUserIds = [...editForm.value.interviewerUserIds, id];
}

function removeEditInterviewer(id) {
  editForm.value.interviewerUserIds = editForm.value.interviewerUserIds.filter((x) => String(x) !== String(id));
}

async function saveInterviewEdit() {
  const iv = selectedInterview.value;
  if (!iv?.id) return;
  savingEdit.value = true;
  editError.value = '';
  try {
    const startsAt = String(editForm.value.startsAt || '').trim();
    if (!startsAt || Number.isNaN(new Date(startsAt).getTime())) {
      editError.value = 'Pick a valid start date and time.';
      return;
    }
    await api.patch(`/hiring/interview-hub/interviews/${iv.id}`, {
      agencyId: effectiveAgencyId.value,
      startsAt,
      timezone: editForm.value.timezone,
      interviewerUserIds: editForm.value.interviewerUserIds.map((id) => Number(id)).filter((n) => n > 0)
    });
    showEditInterview.value = false;
    await loadInterviews();
    flashSuccess('Interview updated');
  } catch (e) {
    editError.value = e?.response?.data?.message || e?.message || 'Failed to update interview';
  } finally {
    savingEdit.value = false;
  }
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function endOfWeek(d) {
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = day === 0 ? 0 : 7 - day;
  x.setDate(x.getDate() + diff);
  return endOfDay(x);
}

const filteredInterviews = computed(() => {
  const list = [...(interviews.value || [])].sort((a, b) => {
    const ta = new Date(a.interview_starts_at || 0).getTime();
    const tb = new Date(b.interview_starts_at || 0).getTime();
    return ta - tb;
  });
  if (timeFilter.value === 'all') return list;
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const weekEnd = endOfWeek(now);
  return list.filter((iv) => {
    if (!iv.interview_starts_at) return timeFilter.value === 'later';
    const t = new Date(iv.interview_starts_at);
    if (Number.isNaN(t.getTime())) return false;
    if (timeFilter.value === 'today') return t >= todayStart && t <= todayEnd;
    if (timeFilter.value === 'week') return t >= todayStart && t <= weekEnd;
    if (timeFilter.value === 'later') return t > weekEnd;
    return true;
  });
});

const canSubmitSchedule = computed(() => {
  if (!scheduleForm.value.candidateUserId || !scheduleForm.value.startsAt) return false;
  if (scheduleForm.value.interviewRound === 'other' && !scheduleForm.value.roundLabelCustom.trim()) return false;
  return true;
});

function flashSuccess(msg) {
  successMsg.value = msg;
  setTimeout(() => {
    if (successMsg.value === msg) successMsg.value = '';
  }, 3200);
}

function linesToArray(text) {
  return String(text || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

function questionsFromLines(text) {
  return linesToArray(text).map((textLine, idx) => ({
    key: `q_${idx + 1}`,
    text: textLine
  }));
}

function questionsToLines(questions) {
  if (!Array.isArray(questions)) return '';
  return questions
    .map((q) => (typeof q === 'string' ? q : (q?.text || q?.question || '')))
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .join('\n');
}

function fmtDateTime(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function formatPerson(u) {
  if (!u) return '';
  const name = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
  return name || u.email || u.personal_email || '';
}

function formatCandidateOption(c) {
  const name = formatPerson(c) || formatPerson(c.user) || c.name;
  const email = c.personal_email || c.email || c.user?.email || '';
  return email ? `${name || 'Candidate'} (${email})` : (name || `Candidate #${c.user_id || c.id}`);
}

function formatAssigneeOption(a) {
  return formatPerson(a) || a.email || `User #${a.id || a.user_id}`;
}

function candidateLabel(iv) {
  const c = candidateById.value.get(Number(iv.candidate_user_id));
  if (c) return formatPerson(c) || formatPerson(c.user) || `Candidate #${iv.candidate_user_id}`;
  return `Candidate #${iv.candidate_user_id}`;
}

function interviewListLabel(iv) {
  if (!iv) return 'Interview';
  if (iv.display_title) return iv.display_title;
  const c = candidateById.value.get(Number(iv.candidate_user_id));
  const candidateName = c ? (formatPerson(c) || formatPerson(c.user) || '') : '';
  const jobTitle = c?.applied_role || c?.job_title || '';
  return buildHiringInterviewTitle({
    interviewRound: iv.interview_round || 'initial',
    candidateName,
    jobTitle
  });
}

const scheduleTitlePreview = computed(() => {
  const cid = Number(scheduleForm.value.candidateUserId);
  const c = cid ? candidateById.value.get(cid) : null;
  const candidateName = c ? (formatPerson(c) || formatPerson(c.user) || '') : '';
  const jobTitle = c?.applied_role || c?.job_title || '';
  return buildHiringInterviewTitle({
    interviewRound: scheduleForm.value.interviewRound,
    roundLabelCustom: scheduleForm.value.roundLabelCustom,
    candidateName,
    jobTitle
  });
});

function interviewerLabels(iv) {
  const ids = Array.isArray(iv.interviewer_user_ids_json) ? iv.interviewer_user_ids_json : [];
  return ids.map((id) => {
    const a = assigneeById.value.get(Number(id));
    return a ? formatAssigneeOption(a) : `#${id}`;
  });
}

function jobSetTitle(id) {
  if (!id) return '';
  const s = jobSets.value.find((x) => Number(x.id) === Number(id));
  return s?.title || '';
}

function questionCount(s) {
  const q = s?.questions_json ?? s?.questionsJson ?? [];
  return Array.isArray(q) ? q.length : 0;
}

function scheduleEventLink(iv) {
  const id = iv?.provider_schedule_event_id;
  return orgPath(`/workforce-operations${id ? `?eventId=${id}` : ''}`);
}

async function copyText(text) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    flashSuccess('Copied to clipboard');
  } catch {
    error.value = 'Could not copy to clipboard';
  }
}

async function copyInvite() {
  const iv = selectedInterview.value;
  if (!iv?.public_join_url) return;
  const name = interviewListLabel(iv);
  const when = fmtDateTime(iv.interview_starts_at);
  const body = [
    name,
    when !== '—' ? `When: ${when}${iv.interview_timezone ? ` (${iv.interview_timezone})` : ''}` : null,
    `Join: ${iv.public_join_url}`
  ].filter(Boolean).join('\n');
  await copyText(body);
}

function selectInterview(id) {
  selectedInterviewId.value = id;
  showEditInterview.value = false;
  editError.value = '';
}

function hydrateTemplateForm(t) {
  templateForm.value = {
    standardQuestionsText: questionsToLines(t?.standard_questions_json),
    criteria: (Array.isArray(t?.scorecard_criteria_json) ? t.scorecard_criteria_json : []).map((c, idx) => ({
      key: c.key || `c_${idx + 1}`,
      label: c.label || '',
      weight: c.weight != null ? Number(c.weight) : 1
    })),
    salutationsText: (Array.isArray(t?.salutation_pool_json) ? t.salutation_pool_json : []).join('\n'),
    icebreakersText: (Array.isArray(t?.icebreaker_pool_json) ? t.icebreaker_pool_json : []).join('\n')
  };
}

function addCriterion() {
  templateForm.value.criteria.push({
    key: `c_${templateForm.value.criteria.length + 1}`,
    label: '',
    weight: 1
  });
}

async function loadInterviews() {
  if (!effectiveAgencyId.value) return;
  const r = await api.get('/hiring/interview-hub/interviews', {
    params: { agencyId: effectiveAgencyId.value }
  });
  interviews.value = Array.isArray(r.data?.data) ? r.data.data : [];
  if (selectedInterviewId.value && !interviews.value.some((i) => Number(i.id) === Number(selectedInterviewId.value))) {
    selectedInterviewId.value = null;
  }
  if (!selectedInterviewId.value && filteredInterviews.value.length) {
    selectedInterviewId.value = filteredInterviews.value[0].id;
  }
}

async function loadCandidates() {
  if (!effectiveAgencyId.value) return;
  const r = await api.get('/hiring/candidates', {
    params: { agencyId: effectiveAgencyId.value, stageFilter: 'all' }
  });
  const data = r.data?.data;
  candidates.value = Array.isArray(data) ? data : (Array.isArray(data?.candidates) ? data.candidates : []);
}

async function loadAssignees() {
  if (!effectiveAgencyId.value) return;
  const r = await api.get('/hiring/assignees', {
    params: { agencyId: effectiveAgencyId.value }
  });
  assignees.value = Array.isArray(r.data?.data) ? r.data.data : [];
}

async function loadJobDescriptions() {
  if (!effectiveAgencyId.value) return;
  const r = await api.get('/hiring/job-descriptions', {
    params: { agencyId: effectiveAgencyId.value, includeInactive: 1 }
  });
  jobDescriptions.value = Array.isArray(r.data?.data) ? r.data.data : [];
}

async function loadJobSets() {
  if (!effectiveAgencyId.value) return;
  loadingJobSets.value = true;
  try {
    const r = await api.get('/hiring/interview-hub/job-question-sets', {
      params: { agencyId: effectiveAgencyId.value }
    });
    jobSets.value = Array.isArray(r.data?.data) ? r.data.data : [];
  } finally {
    loadingJobSets.value = false;
  }
}

async function loadTemplatesTab() {
  if (!effectiveAgencyId.value) return;
  loadingTemplates.value = true;
  error.value = '';
  try {
    await api.post(`/hiring/interview-hub/templates/ensure-default?agencyId=${effectiveAgencyId.value}`);
    const r = await api.get('/hiring/interview-hub/templates', {
      params: { agencyId: effectiveAgencyId.value }
    });
    const list = Array.isArray(r.data?.data) ? r.data.data : [];
    template.value = list.find((t) => t.is_default) || list[0] || null;
    if (template.value) hydrateTemplateForm(template.value);
    await Promise.all([loadJobSets(), loadJobDescriptions()]);
  } catch (e) {
    error.value = e?.response?.data?.message || e?.message || 'Failed to load templates';
  } finally {
    loadingTemplates.value = false;
  }
}

async function saveTemplate() {
  if (!template.value?.id) return;
  savingTemplate.value = true;
  error.value = '';
  try {
    const criteria = templateForm.value.criteria
      .map((c, idx) => ({
        key: String(c.key || `c_${idx + 1}`).trim() || `c_${idx + 1}`,
        label: String(c.label || '').trim(),
        weight: Number(c.weight) || 1
      }))
      .filter((c) => c.label);
    const body = {
      standardQuestionsJson: questionsFromLines(templateForm.value.standardQuestionsText),
      scorecardCriteriaJson: criteria,
      salutationPoolJson: linesToArray(templateForm.value.salutationsText),
      icebreakerPoolJson: linesToArray(templateForm.value.icebreakersText)
    };
    const r = await api.put(`/hiring/interview-hub/templates/${template.value.id}`, body);
    template.value = r.data?.data || template.value;
    hydrateTemplateForm(template.value);
    flashSuccess('Template saved');
  } catch (e) {
    error.value = e?.response?.data?.message || e?.message || 'Failed to save template';
  } finally {
    savingTemplate.value = false;
  }
}

function startNewJobSet() {
  jobSetForm.value = { id: null, title: '', jobDescriptionId: '', questionsText: '' };
  editingJobSet.value = true;
}

function editJobSet(s) {
  jobSetForm.value = {
    id: s.id,
    title: s.title || '',
    jobDescriptionId: s.job_description_id ? String(s.job_description_id) : '',
    questionsText: questionsToLines(s.questions_json)
  };
  editingJobSet.value = true;
}

async function saveJobSet() {
  if (!effectiveAgencyId.value || !jobSetForm.value.title.trim()) return;
  savingJobSet.value = true;
  error.value = '';
  try {
    const payload = {
      agencyId: effectiveAgencyId.value,
      title: jobSetForm.value.title.trim(),
      jobDescriptionId: jobSetForm.value.jobDescriptionId ? Number(jobSetForm.value.jobDescriptionId) : null,
      questions: questionsFromLines(jobSetForm.value.questionsText)
    };
    if (jobSetForm.value.id) {
      await api.put(`/hiring/interview-hub/job-question-sets/${jobSetForm.value.id}`, payload);
    } else {
      await api.post('/hiring/interview-hub/job-question-sets', payload);
    }
    editingJobSet.value = false;
    await loadJobSets();
    flashSuccess(jobSetForm.value.id ? 'Question set updated' : 'Question set created');
  } catch (e) {
    error.value = e?.response?.data?.message || e?.message || 'Failed to save question set';
  } finally {
    savingJobSet.value = false;
  }
}

async function removeJobSet(s) {
  if (!s?.id) return;
  if (!window.confirm(`Delete question set “${s.title}”?`)) return;
  error.value = '';
  try {
    await api.delete(`/hiring/interview-hub/job-question-sets/${s.id}`);
    if (jobSetForm.value.id === s.id) editingJobSet.value = false;
    await loadJobSets();
    flashSuccess('Question set deleted');
  } catch (e) {
    error.value = e?.response?.data?.message || e?.message || 'Failed to delete question set';
  }
}

async function openScheduleModal() {
  error.value = '';
  scheduleForm.value = {
    candidateUserId: '',
    startsAt: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Denver',
    durationMinutes: 60,
    interviewerUserIds: [],
    jobQuestionSetId: '',
    sendInvites: true,
    interviewRound: 'initial',
    roundLabelCustom: ''
  };
  if (!timezoneOptions.includes(scheduleForm.value.timezone)) {
    scheduleForm.value.timezone = 'America/Denver';
  }
  showScheduleModal.value = true;
  try {
    await Promise.all([loadCandidates(), loadAssignees(), loadJobSets()]);
  } catch (e) {
    error.value = e?.response?.data?.message || e?.message || 'Failed to load schedule options';
  }
}

async function submitSchedule() {
  if (!canSubmitSchedule.value || !effectiveAgencyId.value) return;
  scheduling.value = true;
  error.value = '';
  try {
    const interviewerUserIds = (scheduleForm.value.interviewerUserIds || [])
      .map((id) => Number(id))
      .filter((id) => id > 0);
    const body = {
      agencyId: effectiveAgencyId.value,
      candidateUserId: Number(scheduleForm.value.candidateUserId),
      startsAt: scheduleForm.value.startsAt,
      timezone: scheduleForm.value.timezone,
      durationMinutes: Number(scheduleForm.value.durationMinutes) || 60,
      interviewerUserIds,
      jobQuestionSetId: scheduleForm.value.jobQuestionSetId
        ? Number(scheduleForm.value.jobQuestionSetId)
        : null,
      sendInvites: !!scheduleForm.value.sendInvites,
      interviewRound: scheduleForm.value.interviewRound,
      roundLabelCustom: scheduleForm.value.interviewRound === 'other'
        ? scheduleForm.value.roundLabelCustom.trim()
        : null
    };
    const r = await api.post('/hiring/interview-hub/interviews', body);
    const created = r.data?.data?.interview || r.data?.data;
    showScheduleModal.value = false;
    await loadInterviews();
    if (created?.id) selectedInterviewId.value = created.id;
    flashSuccess('Interview scheduled');
  } catch (e) {
    error.value = e?.response?.data?.message || e?.message || 'Failed to schedule interview';
  } finally {
    scheduling.value = false;
  }
}

async function refresh() {
  if (!effectiveAgencyId.value) {
    error.value = 'Select an agency to continue.';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    if (activeTab.value === 'templates') {
      await loadTemplatesTab();
    } else {
      await Promise.all([loadInterviews(), loadCandidates(), loadAssignees(), loadJobSets()]);
    }
  } catch (e) {
    error.value = e?.response?.data?.message || e?.message || 'Failed to load Interview Hub';
  } finally {
    loading.value = false;
  }
}

watch(() => scheduleForm.value.candidateUserId, (cid) => {
  const id = Number(cid);
  if (!id) return;
  const prior = interviews.value.filter((iv) => Number(iv.candidate_user_id) === id);
  scheduleForm.value.interviewRound = suggestInterviewRound(prior);
});

watch(effectiveAgencyId, async (v, prev) => {
  if (!v || v === prev) return;
  await refresh();
});

onMounted(async () => {
  if (!selectedAgencyId.value && effectiveAgencyId.value) {
    selectedAgencyId.value = String(effectiveAgencyId.value);
  }
  await refresh();
});
</script>

<style scoped>
.ih-root { padding: 20px 0 40px; }
.ih-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.ih-title { margin: 0 0 4px; font-size: 1.5rem; color: #111827; }
.ih-subtitle { margin: 0; color: #6b7280; font-size: 0.95rem; }
.ih-header-actions { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; }
.ih-agency-picker { display: flex; flex-direction: column; gap: 4px; }
.ih-label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  color: #374151;
  margin: 10px 0 5px;
}
.ih-hint { font-weight: 400; color: #9ca3af; font-size: 0.77rem; }
.ih-tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid #e5e7eb;
  margin-bottom: 16px;
}
.ih-tab {
  border: none;
  background: transparent;
  padding: 10px 16px;
  font-size: 0.92rem;
  font-weight: 600;
  color: #6b7280;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}
.ih-tab.active {
  color: #6d28d9;
  border-bottom-color: #7c3aed;
}
.ih-error {
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #fecaca;
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 12px;
}
.ih-success {
  background: #f5f3ff;
  color: #5b21b6;
  border: 1px solid #ddd6fe;
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 12px;
}
.ih-split {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 16px;
  min-height: 420px;
}
.ih-sidebar {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.ih-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 12px;
  border-bottom: 1px solid #f3f4f6;
}
.ih-chip {
  border: 1px solid #e5e7eb;
  background: #f9fafb;
  color: #4b5563;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.ih-chip.active {
  background: #ede9fe;
  border-color: #c4b5fd;
  color: #5b21b6;
}
.ih-list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow: auto;
  flex: 1;
}
.ih-list-item {
  padding: 12px 14px;
  border-bottom: 1px solid #f3f4f6;
  cursor: pointer;
}
.ih-list-item:hover { background: #faf5ff; }
.ih-list-item.selected {
  background: #f5f3ff;
  box-shadow: inset 3px 0 0 #7c3aed;
}
.ih-list-name { font-weight: 600; color: #111827; font-size: 0.92rem; }
.ih-list-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 4px;
  font-size: 12px;
  color: #6b7280;
  flex-wrap: wrap;
}
.ih-main {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
  padding: 20px;
  min-height: 320px;
}
.ih-empty-main {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 280px;
  color: #9ca3af;
  text-align: center;
}
.ih-detail-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}
.ih-detail-head h3 { margin: 0 0 6px; font-size: 1.25rem; }
.ih-detail-meta {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  font-size: 0.9rem;
  color: #4b5563;
}
.ih-detail-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.ih-edit-panel {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #f9fafb;
  padding: 14px;
  margin-bottom: 16px;
}
.ih-edit-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 14px;
  align-items: start;
}
.ih-edit-actions { margin-top: 12px; }
.ih-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.ih-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #ede9fe;
  color: #5b21b6;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 13px;
  font-weight: 600;
}
.ih-chip-x {
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  padding: 0;
}
.ih-detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.ih-field-wide { grid-column: 1 / -1; }
.ih-field-label {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #6b7280;
  margin-bottom: 4px;
}
.ih-url-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.ih-url {
  flex: 1;
  min-width: 0;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 12px;
  word-break: break-all;
}
.ih-link { color: #6d28d9; font-weight: 600; text-decoration: none; }
.ih-link:hover { text-decoration: underline; }
.ih-status {
  display: inline-block;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 700;
  text-transform: capitalize;
  background: #f3f4f6;
  color: #374151;
}
.ih-status.st-scheduled { background: #ede9fe; color: #5b21b6; }
.ih-status.st-in_progress { background: #dbeafe; color: #1e40af; }
.ih-status.st-completed { background: #dcfce7; color: #166534; }
.ih-status.st-cancelled { background: #fee2e2; color: #991b1b; }
.ih-muted { color: #6b7280; }
.ih-pad { padding: 16px; }
.small { font-size: 12px; }
.ih-templates {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 16px;
  align-items: start;
}
.ih-panel {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
  padding: 16px 18px 20px;
}
.ih-panel-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 8px;
}
.ih-panel-head h3 { margin: 0 0 4px; font-size: 1.05rem; }
.ih-textarea { width: 100%; resize: vertical; font-family: inherit; }
.ih-scorecard { margin: 12px 0; }
.ih-scorecard-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.ih-criterion-row {
  display: grid;
  grid-template-columns: 1fr 90px auto;
  gap: 8px;
  margin-bottom: 8px;
}
.ih-weight { max-width: 90px; }
.ih-jobset-form {
  border: 1px solid #ede9fe;
  background: #faf5ff;
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 14px;
}
.ih-jobset-list { list-style: none; margin: 0; padding: 0; }
.ih-jobset-item {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid #f3f4f6;
}
.ih-row-actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
.ih-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  font-size: 0.9rem;
  color: #374151;
}
.ih-multi { min-height: 110px; }
.ih-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(17, 24, 39, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 16px;
}
.ih-modal {
  width: 520px;
  max-width: 100%;
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  overflow: hidden;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
}
.ih-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid #e5e7eb;
}
.ih-modal-header h3 { margin: 0; font-size: 1.05rem; }
.ih-modal-body { padding: 8px 16px 16px; max-height: min(70vh, 640px); overflow: auto; }
.ih-field-full { grid-column: 1 / -1; }
.ih-title-preview {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 0.9rem;
  font-weight: 600;
  color: #111827;
  background: #f9fafb;
}
.ih-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid #e5e7eb;
}
.btn {
  border-radius: 8px;
  border: 1px solid transparent;
  padding: 8px 14px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.btn:disabled { opacity: 0.55; cursor: not-allowed; }
.btn-sm { padding: 5px 10px; font-size: 0.8rem; }
.btn-primary {
  background: #7c3aed;
  border-color: #7c3aed;
  color: #fff;
}
.btn-primary:hover:not(:disabled) { background: #6d28d9; }
.btn-secondary {
  background: #fff;
  border-color: #d1d5db;
  color: #374151;
}
.btn-secondary:hover:not(:disabled) { background: #f9fafb; }
.input {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 0.9rem;
  background: #fff;
  box-sizing: border-box;
}
@media (max-width: 960px) {
  .ih-split,
  .ih-templates { grid-template-columns: 1fr; }
  .ih-detail-grid { grid-template-columns: 1fr; }
}
</style>
