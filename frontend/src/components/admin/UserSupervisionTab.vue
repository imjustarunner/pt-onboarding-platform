<template>
  <div class="user-supervision-tab" data-tour="dash-my-supervision">
    <header class="ust-header">
      <div>
        <h2 class="ust-title">My Supervision</h2>
        <p class="ust-sub">
          Individual and group hours count toward your requirement. Open a session for notes, summary, or transcript.
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

      <section v-else-if="supervisionEnabled === false" class="ust-banner">
        Supervision tracking is not enabled for this organization.
      </section>

      <section v-else class="ust-banner">
        Session history and artifacts are below. Hour requirements apply when you are marked pre-licensed.
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
                <span v-if="session.supervisorName" class="session-supervisor">with {{ session.supervisorName }}</span>
              </div>
              <a
                v-if="session.joinUrl"
                :href="session.joinUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="btn btn-primary btn-sm"
              >
                Join
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

        <div v-else class="sessions-list">
          <article
            v-for="session in pastSessions"
            :key="session.id"
            class="supervision-session-card"
          >
            <div class="session-header">
              <div class="session-meta">
                <span class="session-type-pill" :class="typeClass(session.sessionType)">
                  {{ formatSessionType(session.sessionType) }}
                </span>
                <strong class="session-when">{{ formatSessionDate(session.startAt) }}</strong>
                <span v-if="session.supervisorName" class="session-supervisor">with {{ session.supervisorName }}</span>
                <span v-if="session.status" class="session-status">{{ String(session.status || '').toLowerCase() }}</span>
              </div>
              <div class="session-actions">
                <button
                  v-if="session.summaryText"
                  type="button"
                  class="btn btn-secondary btn-sm"
                  :aria-expanded="expandedId === `sum-${session.id}`"
                  @click="toggleExpand(`sum-${session.id}`)"
                >
                  {{ expandedId === `sum-${session.id}` ? 'Hide summary' : 'Summary' }}
                </button>
                <button
                  v-if="session.transcriptText"
                  type="button"
                  class="btn btn-secondary btn-sm"
                  :aria-expanded="expandedId === `tr-${session.id}`"
                  @click="toggleExpand(`tr-${session.id}`)"
                >
                  {{ expandedId === `tr-${session.id}` ? 'Hide transcript' : 'Transcript' }}
                </button>
                <span v-if="!session.summaryText && !session.transcriptText" class="session-no-artifacts">
                  No summary or transcript yet
                </span>
              </div>
            </div>

            <div class="session-stats">
              <span>Attended: <strong>{{ fmtHours(session.totalHours || 0) }} hrs</strong></span>
              <span v-if="session.segmentCount">Segments: {{ session.segmentCount }}</span>
              <span v-if="session.sessionFinalizedAt">Finalized: {{ formatSessionDate(session.sessionFinalizedAt) }}</span>
            </div>

            <div
              v-if="expandedId === `sum-${session.id}` && session.summaryText"
              class="artifact-panel"
            >
              <div class="artifact-label">Session summary</div>
              <div class="artifact-content markdown-body" v-html="renderedSummary(session.summaryText)"></div>
            </div>
            <div
              v-if="expandedId === `tr-${session.id}` && session.transcriptText"
              class="artifact-panel"
            >
              <div class="artifact-label">Transcript</div>
              <pre class="artifact-content">{{ session.transcriptText }}</pre>
            </div>
          </article>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  userId: { type: [Number, String], required: true },
  agencyId: { type: [Number, String], default: null }
});

const loading = ref(false);
const error = ref('');
const sessions = ref([]);
const supervision = ref(null);
const supervisionEnabled = ref(null);
const expandedId = ref('');

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
    const sup = summaryResp?.data?.supervision || null;
    supervision.value = sup;
    supervisionEnabled.value = sup == null ? null : !!sup.enabled;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load sessions';
    sessions.value = [];
    supervision.value = null;
  } finally {
    loading.value = false;
  }
}

function toggleExpand(id) {
  expandedId.value = expandedId.value === id ? '' : id;
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

function formatSessionDate(d) {
  if (!d) return '';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function isUpcoming(session) {
  const end = new Date(session.endAt || session.startAt || 0);
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
.sessions-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.supervision-session-card {
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 12px;
  padding: 14px 16px;
  background: var(--bg-secondary, #f8fafc);
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
.artifact-panel {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border, #e5e7eb);
}
.artifact-label {
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary, #6b7280);
  margin-bottom: 8px;
}
.artifact-content {
  margin: 0;
  padding: 12px;
  background: var(--bg-primary, #fff);
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

@media (max-width: 720px) {
  .ust-tracks {
    grid-template-columns: 1fr;
  }
  .ust-header {
    flex-direction: column;
  }
}
</style>
