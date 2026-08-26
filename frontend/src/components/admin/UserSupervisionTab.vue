<template>
  <div class="user-supervision-tab" data-tour="dash-my-supervision">
    <header class="ust-header">
      <div>
        <h2 class="ust-title">My Supervision</h2>
        <p class="ust-sub">
          Individual and group hours count toward your requirement. Session focus, goals, action items, summary, and transcript are encrypted and available below.
        </p>
        <p class="ust-encrypt muted">
          <span aria-hidden="true">🔒</span>
          All supervision data is encrypted and accessible only to you and your supervisor for training and development purposes.
        </p>
      </div>
      <button
        v-if="sessions.length"
        type="button"
        class="btn btn-secondary btn-sm"
        @click="exportSessionsCsv"
      >
        Export CSV
      </button>
    </header>

    <div v-if="loading" class="ust-loading">Loading supervision…</div>
    <div v-else-if="error" class="ust-error">{{ error }}</div>

    <template v-else>
      <section v-if="showProgress" class="ust-progress" aria-label="Supervision hour progress">
        <div class="ust-progress-head">
          <div>
            <div class="ust-progress-total">
              {{ fmtHours(earnedTotal) }}
              <span class="ust-progress-of">/ {{ fmtHours(requiredTotal) }} hrs</span>
            </div>
            <div class="ust-progress-remaining" :class="{ done: remainingTotal <= 0 }">
              <template v-if="remainingTotal <= 0">Requirement met</template>
              <template v-else>{{ fmtHours(remainingTotal) }} hrs remaining</template>
            </div>
          </div>
          <div class="ust-progress-ring" :style="{ '--pct': overallPct }" role="img" :aria-label="`${overallPct}% of required hours`">
            <span>{{ overallPct }}%</span>
          </div>
        </div>

        <div class="ust-tracks">
          <div class="ust-track">
            <div class="ust-track-label">
              <span>Individual</span>
              <span>{{ fmtHours(indHours) }} / {{ fmtHours(indRequired) }}</span>
            </div>
            <div class="ust-bar" aria-hidden="true">
              <span class="ust-bar-fill ust-bar-fill--ind" :style="{ width: indPct + '%' }" />
            </div>
            <div class="ust-track-hint">
              <template v-if="indRemaining <= 0">Complete</template>
              <template v-else>{{ fmtHours(indRemaining) }} hrs left</template>
            </div>
          </div>
          <div class="ust-track">
            <div class="ust-track-label">
              <span>Group</span>
              <span>{{ fmtHours(grpHours) }} / {{ fmtHours(grpRequired) }}</span>
            </div>
            <div class="ust-bar" aria-hidden="true">
              <span class="ust-bar-fill ust-bar-fill--grp" :style="{ width: grpPct + '%' }" />
            </div>
            <div class="ust-track-hint">
              <template v-if="grpRemaining <= 0">Complete</template>
              <template v-else>{{ fmtHours(grpRemaining) }} hrs left</template>
            </div>
          </div>
        </div>

        <p class="ust-progress-note">
          Requirement hours come from payroll-credited supervision (individual + group).
          Video sessions below are where you meet — open each for summary and transcript when available.
        </p>
      </section>

      <section
        v-if="canAdjustHours && !isSelfView && scopeOrgId && showProgress"
        class="ust-admin-adjust"
        aria-label="Adjust supervision hour totals"
      >
        <h3 class="ust-admin-adjust-title">Adjust supervision totals</h3>
        <p class="ust-admin-adjust-lead">
          Set this employee’s current individual and group hours. Lowering the total shifts baseline
          and session Before/After history down together so the chain stays consistent.
        </p>
        <form class="ust-admin-adjust-form" @submit.prevent="saveAdjustedHours">
          <div class="ust-admin-adjust-fields">
            <label class="ust-admin-adjust-field">
              <span>Individual hours</span>
              <input
                v-model="adjustForm.individualHours"
                type="number"
                min="0"
                step="0.01"
                :disabled="adjustSaving"
                required
              />
            </label>
            <label class="ust-admin-adjust-field">
              <span>Group hours</span>
              <input
                v-model="adjustForm.groupHours"
                type="number"
                min="0"
                step="0.01"
                :disabled="adjustSaving"
                required
              />
            </label>
          </div>
          <div class="ust-admin-adjust-actions">
            <button type="submit" class="btn btn-primary btn-sm" :disabled="adjustSaving || !adjustDirty">
              {{ adjustSaving ? 'Saving…' : 'Save totals' }}
            </button>
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              :disabled="adjustSaving || !adjustDirty"
              @click="resetAdjustForm"
            >
              Reset
            </button>
          </div>
          <p v-if="adjustError" class="ust-admin-adjust-error">{{ adjustError }}</p>
          <p v-if="adjustSuccess" class="ust-admin-adjust-success">{{ adjustSuccess }}</p>
        </form>
      </section>

      <section v-else-if="supervisionEnabled === false" class="ust-banner">
        Supervision tracking is not enabled for this organization.
      </section>

      <section v-else class="ust-banner">
        Session history and artifacts are below. Hour requirements apply when you are marked pre-licensed.
      </section>

      <section
        v-if="isSelfView && scopeOrgId"
        class="ust-discrepancy"
        aria-label="Report supervision hours discrepancy"
      >
        <p class="ust-discrepancy-lead">
          Notice a discrepancy? Let us know so we can get things up to date.
        </p>
        <form class="ust-discrepancy-form" @submit.prevent="submitDiscrepancyTicket">
          <div class="ust-discrepancy-fields">
            <label class="ust-discrepancy-field">
              <span>Individual hours</span>
              <input
                v-model="discrepancyForm.individualHours"
                type="number"
                min="0"
                step="0.01"
                inputmode="decimal"
                placeholder="e.g. 12.5"
                :disabled="discrepancySending"
                required
              />
            </label>
            <label class="ust-discrepancy-field">
              <span>Group hours</span>
              <input
                v-model="discrepancyForm.groupHours"
                type="number"
                min="0"
                step="0.01"
                inputmode="decimal"
                placeholder="e.g. 8"
                :disabled="discrepancySending"
                required
              />
            </label>
            <label class="ust-discrepancy-field">
              <span>Accurate as of</span>
              <input
                v-model="discrepancyForm.asOfDate"
                type="date"
                :max="todayIso"
                :disabled="discrepancySending"
                required
              />
            </label>
          </div>
          <div class="ust-discrepancy-actions">
            <button
              type="submit"
              class="btn btn-secondary btn-sm"
              :disabled="discrepancySending || !canSubmitDiscrepancy"
            >
              {{ discrepancySending ? 'Submitting…' : 'Submit ticket' }}
            </button>
          </div>
        </form>
        <p v-if="discrepancyError" class="ust-discrepancy-msg ust-discrepancy-msg--error">{{ discrepancyError }}</p>
        <p v-else-if="discrepancySuccess" class="ust-discrepancy-msg ust-discrepancy-msg--ok">{{ discrepancySuccess }}</p>
      </section>

      <div v-if="upcomingSessions.length" class="ust-section">
        <h3 class="ust-section-title">Upcoming</h3>
        <div class="sessions-list">
          <article
            v-for="session in upcomingSessions"
            :key="`up-${session.id}`"
            class="supervision-session-card is-upcoming"
          >
            <div class="session-header">
              <div class="session-meta">
                <span class="session-type-pill" :class="typeClass(session.sessionType)">
                  {{ formatSessionType(session.sessionType) }}
                </span>
                <strong class="session-when">{{ formatSessionDate(session.startAt) }}</strong>
                <span v-if="sessionPeerLabel(session)" class="session-supervisor">with {{ sessionPeerLabel(session) }}</span>
              </div>
              <a
                v-if="session.hostJoinUrl || session.joinUrl"
                :href="session.hostJoinUrl || session.joinUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="btn btn-primary btn-sm"
              >
                {{ session.hostJoinUrl ? 'Host join' : 'Join' }}
              </a>
              <a
                v-if="session.hostJoinUrl && (session.participantJoinUrl || session.joinUrl)"
                :href="session.participantJoinUrl || session.joinUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="btn btn-secondary btn-sm"
              >
                Participant link
              </a>
            </div>
          </article>
        </div>
      </div>

      <div class="ust-section">
        <div class="ust-section-head">
          <h3 class="ust-section-title">Sessions</h3>
          <span v-if="pastSessions.length" class="ust-section-meta">
            {{ pastSessions.length }} · {{ fmtHours(sessionAttendanceHours) }} hrs attended
          </span>
        </div>

        <div v-if="!sessions.length" class="empty-state">
          <p>No supervision sessions yet.</p>
          <p class="empty-hint">
            When your supervisor schedules a session, it will appear here with join links, notes, and transcripts.
          </p>
        </div>

        <div v-else-if="!pastSessions.length" class="empty-state">
          <p>No past sessions yet — only upcoming sessions are scheduled.</p>
        </div>

        <div v-else class="ust-split" :class="{ 'ust-split--detail': pastSessions.length > 0 }">
          <div class="ust-list-panel">
            <div class="sessions-list">
              <article
                v-for="session in pastSessions"
                :key="session.id"
                class="supervision-session-card"
                :class="{ 'is-selected': selectedSessionId === session.id }"
                role="button"
                tabindex="0"
                :aria-pressed="selectedSessionId === session.id"
                @click="selectSession(session.id)"
                @keydown.enter.prevent="selectSession(session.id)"
                @keydown.space.prevent="selectSession(session.id)"
              >
                <div class="session-header">
                  <div class="session-meta">
                    <span class="session-type-pill" :class="typeClass(session.sessionType)">
                      {{ formatSessionType(session.sessionType) }}
                    </span>
                    <strong class="session-when">{{ formatSessionDate(session.startAt) }}</strong>
                    <span v-if="sessionPeerLabel(session)" class="session-supervisor">with {{ sessionPeerLabel(session) }}</span>
                    <span
                      v-if="session.status"
                      class="session-status"
                      :class="statusClass(session.status)"
                    >{{ formatSessionStatus(session.status) }}</span>
                  </div>
                  <span class="session-chevron" aria-hidden="true">›</span>
                </div>

                <div class="session-stats">
                  <span>Attended: <strong>{{ fmtDuration(session) }}</strong></span>
                  <span v-if="session.segmentCount">Segments: {{ session.segmentCount }}</span>
                </div>
                <div
                  v-if="sessionHoursBreakdown(session)"
                  class="session-hours-breakdown"
                >
                  <span>Before: <strong>{{ sessionHoursBreakdown(session).before }}</strong></span>
                  <span>This session: <strong>{{ sessionHoursBreakdown(session).attended }}</strong></span>
                  <span>After: <strong>{{ sessionHoursBreakdown(session).after }}</strong></span>
                </div>
              </article>
            </div>
          </div>

          <aside v-if="pastSessions.length" class="ust-detail-panel" :class="{ 'ust-detail-panel--empty': !selectedSession }">
            <template v-if="selectedSession">
              <div class="ust-detail-head">
                <div>
                  <div class="ust-detail-kicker">
                    <span class="session-type-pill" :class="typeClass(selectedSession.sessionType)">
                      {{ formatSessionType(selectedSession.sessionType) }}
                    </span>
                    <span
                      v-if="selectedSession.status"
                      class="session-status"
                      :class="statusClass(selectedSession.status)"
                    >{{ formatSessionStatus(selectedSession.status) }}</span>
                  </div>
                  <h4 class="ust-detail-title">{{ formatSessionDate(selectedSession.startAt) }}</h4>
                  <p v-if="sessionPeerLabel(selectedSession)" class="ust-detail-peer muted">
                    with {{ sessionPeerLabel(selectedSession) }}
                  </p>
                </div>
                <button
                  type="button"
                  class="ust-detail-close"
                  title="Close session details"
                  @click="clearSelectedSession"
                >
                  ✕
                </button>
              </div>

              <div class="ust-detail-stats">
                <div class="ust-detail-stat">
                  <span class="ust-detail-stat-k">Attended</span>
                  <strong>{{ fmtDuration(selectedSession) }}</strong>
                </div>
                <div v-if="selectedSession.segmentCount" class="ust-detail-stat">
                  <span class="ust-detail-stat-k">Segments</span>
                  <strong>{{ selectedSession.segmentCount }}</strong>
                </div>
                <div v-if="selectedSession.sessionFinalizedAt" class="ust-detail-stat">
                  <span class="ust-detail-stat-k">Finalized</span>
                  <strong>{{ formatSessionDate(selectedSession.sessionFinalizedAt) }}</strong>
                </div>
              </div>

              <section class="ust-detail-section">
                <h5 class="ust-detail-section-title">Session focus</h5>
                <p v-if="selectedSession.focusTitle" class="ust-detail-text">{{ selectedSession.focusTitle }}</p>
                <p v-else class="ust-detail-empty-line">Not recorded for this session.</p>
              </section>

              <section class="ust-detail-section">
                <h5 class="ust-detail-section-title">Goals</h5>
                <ul v-if="(selectedSession.goals || []).length" class="workspace-list">
                  <li v-for="g in selectedSession.goals" :key="g.id || g.text">
                    <span class="workspace-check" :class="{ done: g.done }">{{ g.done ? '✓' : '○' }}</span>
                    <span :class="{ done: g.done }">{{ g.text }}</span>
                  </li>
                </ul>
                <p v-else class="ust-detail-empty-line">No goals recorded.</p>
              </section>

              <section class="ust-detail-section">
                <h5 class="ust-detail-section-title">Action items</h5>
                <ul v-if="(selectedSession.actionItems || []).length" class="workspace-list">
                  <li v-for="a in selectedSession.actionItems" :key="a.id || a.text">
                    <span class="workspace-check" :class="{ done: a.done }">{{ a.done ? '✓' : '○' }}</span>
                    <span :class="{ done: a.done }">{{ a.text }}</span>
                  </li>
                </ul>
                <p v-else class="ust-detail-empty-line">No action items recorded.</p>
              </section>

              <section class="ust-detail-section">
                <h5 class="ust-detail-section-title">AI summary</h5>
                <div
                  v-if="selectedSession.summaryText"
                  class="artifact-content markdown-body"
                  v-html="renderedSummary(selectedSession.summaryText)"
                />
                <p v-else class="ust-detail-empty-line">No AI summary yet.</p>
              </section>

              <section class="ust-detail-section">
                <h5 class="ust-detail-section-title">Transcript</h5>
                <pre v-if="selectedSession.transcriptText" class="artifact-content">{{ selectedSession.transcriptText }}</pre>
                <p v-else class="ust-detail-empty-line">No transcript yet.</p>
              </section>
            </template>

            <p v-else class="ust-detail-placeholder">
              Select a session to view focus, goals, action items, summary, and transcript.
            </p>
          </aside>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import api from '../../services/api';
import { parseUtcInstant } from '../../utils/timezones.js';

const props = defineProps({
  userId: { type: [Number, String], required: true },
  agencyId: { type: [Number, String], default: null },
  canAdjustHours: { type: Boolean, default: false }
});

const loading = ref(false);
const error = ref('');
const sessions = ref([]);
const supervision = ref(null);
const supervisionEnabled = ref(null);
const selectedSessionId = ref(null);

const isSelfView = computed(() => String(props.userId) === 'me');
const scopeOrgId = computed(() => {
  const id = Number(props.agencyId);
  return Number.isFinite(id) && id > 0 ? id : null;
});

const discrepancyForm = ref({
  individualHours: '',
  groupHours: '',
  asOfDate: ''
});
const discrepancySending = ref(false);
const discrepancyError = ref('');
const discrepancySuccess = ref('');

const adjustForm = ref({ individualHours: '', groupHours: '' });
const adjustBaseline = ref({ individualHours: '', groupHours: '' });
const adjustSaving = ref(false);
const adjustError = ref('');
const adjustSuccess = ref('');

const adjustDirty = computed(() => (
  String(adjustForm.value.individualHours ?? '').trim() !== String(adjustBaseline.value.individualHours ?? '').trim()
  || String(adjustForm.value.groupHours ?? '').trim() !== String(adjustBaseline.value.groupHours ?? '').trim()
));

function resetAdjustForm() {
  adjustForm.value = { ...adjustBaseline.value };
  adjustError.value = '';
  adjustSuccess.value = '';
}

function syncAdjustFormFromSupervision() {
  if (!props.canAdjustHours || isSelfView.value || adjustSaving.value) return;
  const snap = {
    individualHours: fmtHours(indHours.value),
    groupHours: fmtHours(grpHours.value)
  };
  adjustForm.value = { ...snap };
  adjustBaseline.value = { ...snap };
}

const todayIso = computed(() => new Date().toISOString().slice(0, 10));

const canSubmitDiscrepancy = computed(() => {
  const ind = String(discrepancyForm.value.individualHours ?? '').trim();
  const grp = String(discrepancyForm.value.groupHours ?? '').trim();
  const asOf = String(discrepancyForm.value.asOfDate ?? '').trim();
  if (!ind || !grp || !asOf) return false;
  const indN = Number(ind);
  const grpN = Number(grp);
  return Number.isFinite(indN) && indN >= 0 && Number.isFinite(grpN) && grpN >= 0;
});

const showProgress = computed(() => {
  const s = supervision.value;
  return !!(s?.enabled && s?.isPrelicensed);
});

const indHours = computed(() => Number(supervision.value?.individualHours || 0));
const grpHours = computed(() => Number(supervision.value?.groupHours || 0));
const indRequired = computed(() => Number(supervision.value?.requiredIndividualHours || 0));
const grpRequired = computed(() => Number(supervision.value?.requiredGroupHours || 0));
const earnedTotal = computed(() => indHours.value + grpHours.value);
const requiredTotal = computed(() => indRequired.value + grpRequired.value);

const indRemaining = computed(() => Math.max(0, indRequired.value - indHours.value));
const grpRemaining = computed(() => Math.max(0, grpRequired.value - grpHours.value));
const remainingTotal = computed(() => indRemaining.value + grpRemaining.value);

const pct = (earned, required) => {
  const r = Number(required);
  if (!Number.isFinite(r) || r <= 0) return 0;
  return Math.min(100, Math.round((Number(earned || 0) / r) * 100));
};

const indPct = computed(() => pct(indHours.value, indRequired.value));
const grpPct = computed(() => pct(grpHours.value, grpRequired.value));
const overallPct = computed(() => pct(earnedTotal.value, requiredTotal.value));

const upcomingSessions = computed(() =>
  (sessions.value || []).filter((s) => isUpcoming(s))
);

const pastSessions = computed(() =>
  (sessions.value || []).filter((s) => !isUpcoming(s))
);

const selectedSession = computed(() => {
  const id = Number(selectedSessionId.value || 0);
  if (!id) return null;
  return pastSessions.value.find((s) => Number(s.id) === id) || null;
});

const sessionAttendanceHours = computed(() =>
  pastSessions.value.reduce((sum, s) => sum + (Number(s.totalHours) || 0), 0)
);

async function fetchAll() {
  const uid = props.userId;
  if (!uid && uid !== 0) return;
  loading.value = true;
  error.value = '';
  try {
    const params = props.agencyId ? { agencyId: props.agencyId } : {};
    const isMe = String(uid) === 'me';

    const sessionsReq = isMe
      ? api.get('/supervision/my-sessions', { params })
      : api.get(`/supervision/supervisee/${uid}/sessions`, { params });

    const summaryReq = isMe
      ? api.get('/payroll/me/dashboard-summary', { params, skipGlobalLoading: true })
      : api.get(`/payroll/supervisee/${uid}/dashboard-summary`, { params, skipGlobalLoading: true });

    const [sessionsResp, summaryResp] = await Promise.all([
      sessionsReq.catch((e) => {
        throw e;
      }),
      summaryReq.catch(() => null)
    ]);

    sessions.value = sessionsResp?.data?.sessions || [];
    const validIds = new Set((sessions.value || []).map((s) => Number(s.id)));
    if (!validIds.has(Number(selectedSessionId.value || 0))) {
      selectedSessionId.value = null;
    }
    const sup = summaryResp?.data?.supervision || null;
    supervision.value = sup;
    supervisionEnabled.value = sup == null ? null : !!sup.enabled;
    syncAdjustFormFromSupervision();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load sessions';
    sessions.value = [];
    supervision.value = null;
  } finally {
    loading.value = false;
  }
}

function selectSession(id) {
  const sid = Number(id || 0);
  if (!sid) return;
  selectedSessionId.value = sid;
}

function clearSelectedSession() {
  selectedSessionId.value = null;
}

function sessionPeerLabel(session) {
  if (!session) return '';
  if (session.role === 'supervisor' || session.role === 'both') {
    return String(session.superviseeName || session.supervisorName || '').trim();
  }
  return String(session.supervisorName || session.superviseeName || '').trim();
}

function typeClass(type) {
  const t = String(type || 'individual').toLowerCase();
  if (t === 'group') return 'is-group';
  if (t === 'triadic') return 'is-triadic';
  return 'is-individual';
}

function formatSessionType(type) {
  const t = String(type || 'individual').toLowerCase();
  if (t === 'group') return 'Group';
  if (t === 'triadic') return 'Triadic';
  return 'Individual';
}

function formatSessionStatus(status) {
  const s = String(status || '').trim().toUpperCase();
  if (s === 'FINALIZED') return 'Finalized';
  if (s === 'MISSED') return 'Missed';
  if (s === 'IN_PROGRESS') return 'In progress';
  if (s === 'COMPLETED_PENDING_FINALIZE') return 'Pending finalize';
  if (s === 'SCHEDULED') return 'Scheduled';
  if (s === 'CANCELLED') return 'Cancelled';
  if (s === 'RESCHEDULED') return 'Rescheduled';
  return s ? s.replace(/_/g, ' ').toLowerCase() : '';
}

function statusClass(status) {
  const s = String(status || '').trim().toUpperCase();
  if (s === 'FINALIZED') return 'is-finalized';
  if (s === 'MISSED') return 'is-missed';
  if (s === 'IN_PROGRESS' || s === 'COMPLETED_PENDING_FINALIZE') return 'is-pending';
  return '';
}

function fmtDuration(session) {
  const seconds = Number(session?.totalSeconds || 0);
  if (seconds > 0) {
    const mins = Math.round(seconds / 60);
    if (mins < 60) return `${mins} min`;
    return `${fmtHours(seconds / 3600)} hrs (${mins} min)`;
  }
  const hours = Number(session?.totalHours || 0);
  return `${fmtHours(hours)} hrs`;
}

function sessionHoursBreakdown(session) {
  const before = session?.hoursBefore ?? session?.hours_before;
  const attended = session?.hoursAttended ?? session?.hours_attended ?? session?.totalHours;
  const after = session?.hoursAfter ?? session?.hours_after;
  if (before == null && after == null) return null;
  return {
    before: fmtHours(Number(before || 0)),
    attended: fmtHours(Number(attended || 0)),
    after: fmtHours(Number(after || 0))
  };
}

function formatSessionDate(d) {
  const date = parseUtcInstant(d);
  if (!date) return '';
  return date.toLocaleString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function isUpcoming(session) {
  const end = parseUtcInstant(session.endAt || session.startAt);
  if (!end) return false;
  return end.getTime() > Date.now();
}

function renderedSummary(text) {
  if (!text) return '';
  return String(text)
    .replace(/^### (.*)$/gm, '<h4>$1</h4>')
    .replace(/^## (.*)$/gm, '<h3>$1</h3>')
    .replace(/^# (.*)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

function fmtHours(v) {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return '0';
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function csvCell(value) {
  const raw = value == null ? '' : String(value);
  if (!raw.includes('"') && !raw.includes(',') && !raw.includes('\n')) return raw;
  return `"${raw.replace(/"/g, '""')}"`;
}

function formatIsoDate(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-').map((part) => Number(part));
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

async function submitDiscrepancyTicket() {
  if (!scopeOrgId.value || !canSubmitDiscrepancy.value || discrepancySending.value) return;
  discrepancySending.value = true;
  discrepancyError.value = '';
  discrepancySuccess.value = '';
  const reportedInd = Number(discrepancyForm.value.individualHours);
  const reportedGrp = Number(discrepancyForm.value.groupHours);
  const asOf = String(discrepancyForm.value.asOfDate).trim();
  const lines = [
    'I believe my supervision hours are incorrect.',
    '',
    'Currently showing in My Supervision:',
    `- Individual: ${fmtHours(indHours.value)} hrs`,
    `- Group: ${fmtHours(grpHours.value)} hrs`,
    '',
    `Correct hours as of ${formatIsoDate(asOf)}:`,
    `- Individual: ${fmtHours(reportedInd)} hrs`,
    `- Group: ${fmtHours(reportedGrp)} hrs`
  ];
  try {
    await api.post('/support-tickets', {
      schoolOrganizationId: scopeOrgId.value,
      topic: 'payroll',
      subject: 'Supervision hours discrepancy',
      question: lines.join('\n')
    });
    discrepancyForm.value = { individualHours: '', groupHours: '', asOfDate: '' };
    discrepancySuccess.value = 'Thanks — we received your ticket and will review your hours.';
  } catch (e) {
    discrepancyError.value = e?.response?.data?.error?.message || e?.message || 'Could not submit ticket';
  } finally {
    discrepancySending.value = false;
  }
}

async function saveAdjustedHours() {
  if (!props.canAdjustHours || isSelfView.value || !scopeOrgId.value || adjustSaving.value) return;
  const uid = Number(props.userId);
  if (!uid) return;

  adjustSaving.value = true;
  adjustError.value = '';
  adjustSuccess.value = '';

  const payload = { userId: uid };
  const nextInd = parseFloat(String(adjustForm.value.individualHours ?? '').trim());
  const nextGrp = parseFloat(String(adjustForm.value.groupHours ?? '').trim());
  const baseInd = parseFloat(String(adjustBaseline.value.individualHours ?? '').trim());
  const baseGrp = parseFloat(String(adjustBaseline.value.groupHours ?? '').trim());

  if (!Number.isFinite(nextInd) || nextInd < 0 || !Number.isFinite(nextGrp) || nextGrp < 0) {
    adjustError.value = 'Enter valid non-negative hour totals.';
    adjustSaving.value = false;
    return;
  }

  if (Math.abs(nextInd - baseInd) > 1e-9) payload.individualHours = Math.round(nextInd * 100) / 100;
  if (Math.abs(nextGrp - baseGrp) > 1e-9) payload.groupHours = Math.round(nextGrp * 100) / 100;

  if (payload.individualHours === undefined && payload.groupHours === undefined) {
    adjustError.value = 'Change at least one total before saving.';
    adjustSaving.value = false;
    return;
  }

  try {
    const resp = await api.put('/payroll/supervision-sheet', {
      agencyId: scopeOrgId.value,
      updates: [payload],
      note: 'Balance set via user profile supervision tab'
    });
    const row = (resp.data?.results || []).find((r) => Number(r?.userId) === uid);
    if (row?.ok === false) {
      throw new Error(row.error || 'Failed to update supervision totals');
    }
    adjustSuccess.value = 'Supervision totals updated. Session history pills were shifted to match.';
    await fetchAll();
  } catch (e) {
    adjustError.value = e?.response?.data?.error?.message || e?.message || 'Failed to update supervision totals';
  } finally {
    adjustSaving.value = false;
  }
}

function exportSessionsCsv() {
  const rows = Array.isArray(sessions.value) ? sessions.value : [];
  if (!rows.length) return;
  const headers = [
    'sessionId',
    'sessionType',
    'status',
    'startAt',
    'endAt',
    'supervisorName',
    'totalSeconds',
    'totalHours',
    'segmentCount',
    'firstJoinedAt',
    'lastLeftAt',
    'sessionFinalizedAt',
    'sessionFinalizeSource',
    'transcriptUrl',
    'summaryText'
  ];
  const lines = [headers.join(',')];
  for (const s of rows) {
    const values = [
      Number(s.id || 0),
      String(s.sessionType || 'individual'),
      String(s.status || ''),
      s.startAt || '',
      s.endAt || '',
      String(s.supervisorName || ''),
      Number(s.totalSeconds || 0),
      Number(s.totalHours || 0),
      Number(s.segmentCount || 0),
      s.firstJoinedAt || '',
      s.lastLeftAt || '',
      s.sessionFinalizedAt || '',
      s.sessionFinalizeSource || '',
      s.transcriptUrl || '',
      s.summaryText || ''
    ];
    lines.push(values.map(csvCell).join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `supervision-sessions-${String(props.userId)}-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

onMounted(fetchAll);
watch([() => props.userId, () => props.agencyId], fetchAll);
</script>

<style scoped>
.user-supervision-tab {
  padding: 4px 0 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.ust-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}
.ust-title {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--text-primary, #111827);
}
.ust-sub {
  margin: 6px 0 0;
  max-width: 52rem;
  font-size: 0.92rem;
  color: var(--text-secondary, #6b7280);
  line-height: 1.45;
}
.ust-loading,
.ust-error,
.empty-state,
.ust-banner {
  padding: 20px;
  text-align: center;
  color: var(--text-secondary, #6b7280);
  background: var(--bg-secondary, #f8fafc);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 12px;
}
.ust-error {
  color: #b91c1c;
  background: #fef2f2;
  border-color: #fecaca;
}
.empty-hint {
  margin: 8px 0 0;
  font-size: 0.9rem;
}
.ust-progress {
  background: #fff;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 14px;
  padding: 18px 20px;
}
.ust-progress-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}
.ust-progress-total {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--text-primary, #111827);
  line-height: 1.1;
}
.ust-progress-of {
  font-size: 1rem;
  font-weight: 500;
  color: var(--text-secondary, #6b7280);
}
.ust-progress-remaining {
  margin-top: 6px;
  font-size: 0.95rem;
  font-weight: 600;
  color: #b45309;
}
.ust-progress-remaining.done {
  color: #047857;
}
.ust-progress-ring {
  --pct: 0;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: conic-gradient(#5b4cdb calc(var(--pct) * 1%), #e5e7eb 0);
  flex-shrink: 0;
}
.ust-progress-ring span {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: #fff;
  display: grid;
  place-items: center;
  font-size: 0.85rem;
  font-weight: 700;
  color: #374151;
}
.ust-tracks {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-top: 18px;
}
.ust-track-label {
  display: flex;
  justify-content: space-between;
  font-size: 0.85rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 6px;
}
.ust-bar {
  height: 10px;
  border-radius: 999px;
  background: #e5e7eb;
  overflow: hidden;
}
.ust-bar-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  min-width: 0;
  transition: width 0.25s ease;
}
.ust-bar-fill--ind { background: #5b4cdb; }
.ust-bar-fill--grp { background: #0d9488; }
.ust-track-hint {
  margin-top: 6px;
  font-size: 0.8rem;
  color: var(--text-secondary, #6b7280);
}
.ust-progress-note {
  margin: 16px 0 0;
  font-size: 0.82rem;
  line-height: 1.4;
  color: var(--text-secondary, #6b7280);
}
.ust-admin-adjust {
  border: 1px solid #dbeafe;
  background: #f8fbff;
  border-radius: 10px;
  padding: 14px 16px;
}
.ust-admin-adjust-title {
  margin: 0 0 6px;
  font-size: 1rem;
}
.ust-admin-adjust-lead {
  margin: 0 0 12px;
  color: var(--text-secondary, #6b7280);
  font-size: 0.9rem;
  line-height: 1.45;
}
.ust-admin-adjust-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ust-admin-adjust-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.ust-admin-adjust-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 140px;
}
.ust-admin-adjust-field span {
  font-size: 0.82rem;
  color: #475569;
  font-weight: 600;
}
.ust-admin-adjust-field input {
  width: 120px;
  padding: 7px 8px;
  border: 1px solid #c9d0d8;
  border-radius: 6px;
  font: inherit;
}
.ust-admin-adjust-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.ust-admin-adjust-error {
  margin: 0;
  color: #b42318;
  font-size: 0.88rem;
}
.ust-admin-adjust-success {
  margin: 0;
  color: #166534;
  font-size: 0.88rem;
}
.ust-discrepancy {
  background: #f8fafc;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 12px;
  padding: 14px 16px;
}
.ust-discrepancy-lead {
  margin: 0 0 12px;
  font-size: 0.9rem;
  color: var(--text-primary, #111827);
  line-height: 1.45;
}
.ust-discrepancy-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ust-discrepancy-fields {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.ust-discrepancy-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.78rem;
  font-weight: 600;
  color: #374151;
}
.ust-discrepancy-field input {
  font: inherit;
  font-weight: 400;
  padding: 8px 10px;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  background: #fff;
}
.ust-discrepancy-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.ust-discrepancy-msg {
  margin: 10px 0 0;
  font-size: 0.85rem;
}
.ust-discrepancy-msg--error {
  color: #b91c1c;
}
.ust-discrepancy-msg--ok {
  color: #166534;
}
.ust-section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.ust-section-title {
  margin: 0 0 10px;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-primary, #111827);
}
.ust-section-head .ust-section-title {
  margin-bottom: 0;
}
.ust-section-meta {
  font-size: 0.85rem;
  color: var(--text-secondary, #6b7280);
}
.ust-encrypt {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin: 8px 0 0;
  font-size: 0.82rem;
  line-height: 1.4;
}
.sessions-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ust-split {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}
.ust-split--detail {
  grid-template-columns: minmax(0, 0.95fr) minmax(280px, 1.05fr);
}
.ust-list-panel {
  min-width: 0;
}
.ust-detail-panel {
  position: sticky;
  top: 12px;
  align-self: start;
  max-height: calc(100vh - 140px);
  overflow: auto;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 12px;
  background: #fff;
  padding: 16px;
  min-width: 0;
}
.ust-detail-panel--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 220px;
  background: var(--bg-secondary, #f8fafc);
}
.ust-detail-placeholder {
  margin: 0;
  max-width: 18rem;
  text-align: center;
  color: var(--text-secondary, #6b7280);
  font-size: 0.92rem;
  line-height: 1.45;
}
.ust-detail-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 14px;
}
.ust-detail-kicker {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 6px;
}
.ust-detail-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-primary, #111827);
}
.ust-detail-peer {
  margin: 4px 0 0;
  font-size: 0.88rem;
}
.ust-detail-close {
  border: 0;
  background: #f1f5f9;
  color: #64748b;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  cursor: pointer;
  flex-shrink: 0;
}
.ust-detail-close:hover {
  background: #e2e8f0;
  color: #334155;
}
.ust-detail-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}
.ust-detail-stat {
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--bg-secondary, #f8fafc);
  border: 1px solid var(--border, #e5e7eb);
}
.ust-detail-stat-k {
  display: block;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
  margin-bottom: 4px;
}
.ust-detail-stat strong {
  font-size: 0.92rem;
  color: #0f172a;
}
.ust-detail-section {
  padding-top: 14px;
  margin-top: 14px;
  border-top: 1px solid var(--border, #e5e7eb);
}
.ust-detail-section-title {
  margin: 0 0 8px;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
}
.ust-detail-text {
  margin: 0;
  font-size: 0.92rem;
  line-height: 1.45;
  color: #0f172a;
}
.ust-detail-empty-line {
  margin: 0;
  font-size: 0.88rem;
  color: #94a3b8;
  font-style: italic;
}
.supervision-session-card {
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 12px;
  padding: 14px 16px;
  background: var(--bg-secondary, #f8fafc);
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}
.supervision-session-card:hover {
  border-color: #c7d2fe;
  background: #fff;
}
.supervision-session-card.is-selected {
  border-color: #5b4cdb;
  background: #f5f3ff;
  box-shadow: 0 0 0 1px rgba(91, 76, 219, 0.15);
}
.supervision-session-card:focus-visible {
  outline: 2px solid #5b4cdb;
  outline-offset: 2px;
}
.session-chevron {
  color: #94a3b8;
  font-size: 1.2rem;
  line-height: 1;
  flex-shrink: 0;
}
.supervision-session-card.is-selected .session-chevron {
  color: #5b4cdb;
}
.supervision-session-card.is-upcoming {
  background: #eff6ff;
  border-color: #bfdbfe;
}
.session-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}
.session-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.session-type-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.session-type-pill.is-individual {
  background: #ede9fe;
  color: #5b21b6;
}
.session-type-pill.is-group {
  background: #ccfbf1;
  color: #0f766e;
}
.session-type-pill.is-triadic {
  background: #e0e7ff;
  color: #3730a3;
}
.session-when {
  font-size: 0.95rem;
  color: var(--text-primary, #111827);
}
.session-supervisor,
.session-status,
.session-no-artifacts {
  color: var(--text-secondary, #6b7280);
  font-size: 0.88rem;
}
.session-status.is-finalized {
  color: #166534;
  font-weight: 600;
}
.session-status.is-missed {
  color: #9a3412;
  font-weight: 600;
}
.session-status.is-pending {
  color: #854d0e;
  font-weight: 600;
}
.session-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.session-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  margin-top: 10px;
  font-size: 0.85em;
  color: var(--text-secondary, #6b7280);
}
.session-hours-breakdown {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin-top: 6px;
  font-size: 0.78em;
  color: #475569;
}
.session-hours-breakdown span {
  background: #f1f5f9;
  border-radius: 999px;
  padding: 2px 8px;
}
.artifact-content {
  margin: 0;
  padding: 12px;
  background: var(--bg-primary, #fff);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  font-size: 0.9em;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 320px;
  overflow-y: auto;
}
.markdown-body :deep(h2) { font-size: 1.1em; margin: 8px 0 4px; }
.markdown-body :deep(h3) { font-size: 1em; margin: 6px 0 4px; }
.markdown-body :deep(h4) { font-size: 0.95em; margin: 4px 0 2px; }
.workspace-list {
  list-style: none;
  margin: 0;
  padding: 10px 12px;
  background: var(--bg-primary, #fff);
  border-radius: 8px;
  display: grid;
  gap: 6px;
}
.workspace-list li {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 0.9em;
}
.workspace-check {
  color: #94a3b8;
  font-weight: 700;
  min-width: 1rem;
}
.workspace-check.done,
.workspace-list .done {
  color: #15803d;
}
.workspace-list .done {
  text-decoration: line-through;
  opacity: 0.85;
}

@media (max-width: 960px) {
  .ust-split,
  .ust-split--detail {
    grid-template-columns: 1fr;
  }
  .ust-detail-panel {
    position: static;
    max-height: none;
  }
  .ust-detail-panel--empty {
    display: none;
  }
}

@media (max-width: 720px) {
  .ust-tracks {
    grid-template-columns: 1fr;
  }
  .ust-discrepancy-fields {
    grid-template-columns: 1fr;
  }
  .ust-header {
    flex-direction: column;
  }
}
</style>
