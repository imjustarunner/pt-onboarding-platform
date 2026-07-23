<template>
  <div class="reinit-admin">
    <div class="reinit-admin__head">
      <div>
        <h2>Collaborative Year Update</h2>
        <p class="muted">Track school progress, scores, and addendums for {{ schoolYear }}.</p>
      </div>
      <div class="reinit-admin__head-actions">
        <button type="button" class="btn btn-secondary btn-sm" :disabled="!filteredRows.length" @click="exportCsv">
          Export Report
        </button>
        <button type="button" class="btn btn-secondary btn-sm" :disabled="loading" @click="load">
          {{ loading ? 'Loading…' : 'Refresh' }}
        </button>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          :disabled="!campaign.isEnabled"
          @click="showQuestions = !showQuestions"
        >
          {{ showQuestions ? 'Hide questionnaire' : 'Edit questionnaire' }}
        </button>
        <button type="button" class="btn btn-secondary btn-sm" :disabled="!campaign.isEnabled" @click="showSlots = !showSlots">
          {{ showSlots ? 'Hide check-in slots' : 'Check-in slots' }}
        </button>
      </div>
    </div>

    <div class="reinit-admin__campaign">
      <div class="reinit-admin__campaign-status">
        <span class="pill" :class="'pill--' + (campaign.status || 'draft')">{{ campaignLabel }}</span>
        <span class="muted">
          <template v-if="campaign.isPushed">Pushed {{ formatDt(campaign.pushedAt) }} — school logins show the update (dismissible).</template>
          <template v-else-if="campaign.isEnabled">Enabled — edit questions/slots, then Push to Schools when ready.</template>
          <template v-else>Not started — Enable Year Update to seed questions for {{ schoolYear }}.</template>
        </span>
      </div>
      <div class="reinit-admin__campaign-actions">
        <button
          type="button"
          class="btn btn-primary"
          :disabled="campaignBusy || campaign.isEnabled"
          @click="enableYearUpdate"
        >
          {{ campaign.isEnabled ? 'Year Update Enabled' : 'Enable Year Update' }}
        </button>
        <button
          type="button"
          class="btn btn-push"
          :disabled="campaignBusy || !campaign.isEnabled"
          @click="pushToSchools"
        >
          {{ campaign.isPushed ? 'Pushed to Schools' : 'Push to Schools' }}
        </button>
      </div>
      <p v-if="pushFlash" class="success-banner">{{ pushFlash }}</p>
    </div>

    <div v-if="error" class="error-banner">{{ error }}</div>

    <!-- Questionnaire editor -->
    <div v-if="showQuestions" class="reinit-admin__panel">
      <div class="reinit-admin__panel-head">
        <strong>Questionnaire ({{ schoolYear }})</strong>
        <button type="button" class="btn btn-secondary btn-sm" :disabled="savingQ" @click="resetQuestions">
          Reset to defaults
        </button>
      </div>
      <div v-if="!questions.length" class="muted">No questions loaded.</div>
      <div v-for="q in questions" :key="q.question_key" class="reinit-admin__q">
        <div class="reinit-admin__q-meta">
          <code>{{ q.section_key }} / {{ q.question_key }}</code>
          <span class="muted small">{{ q.input_type }}</span>
          <label class="inline"><input v-model="q.enabled" type="checkbox" true-value="1" false-value="0" @change="saveQuestion(q)" /> Enabled</label>
          <label class="inline"><input v-model="q.required" type="checkbox" true-value="1" false-value="0" @change="saveQuestion(q)" /> Required</label>
        </div>
        <input v-model="q.label" type="text" class="reinit-admin__input" @change="saveQuestion(q)" />
        <input v-model="q.help_text" type="text" class="reinit-admin__input muted-input" placeholder="Help text" @change="saveQuestion(q)" />
      </div>
    </div>

    <!-- Check-in slots -->
    <div v-if="showSlots" class="reinit-admin__panel">
      <strong>Fall check-in preset slots</strong>
      <ul class="reinit-admin__slots">
        <li v-for="s in slots" :key="s.id">{{ formatDt(s.starts_at) }} {{ s.label ? `— ${s.label}` : '' }}</li>
      </ul>
      <div class="reinit-admin__slot-form">
        <input v-model="newSlot.startsAt" type="datetime-local" />
        <input v-model="newSlot.label" type="text" placeholder="Label (optional)" />
        <button type="button" class="btn btn-primary btn-sm" :disabled="!newSlot.startsAt" @click="addSlot">Add slot</button>
      </div>
    </div>

    <!-- Metric cards -->
    <div class="reinit-admin__metrics">
      <div class="metric">
        <span class="metric__label">Total Schools</span>
        <strong>{{ summary.totalSchools || 0 }}</strong>
      </div>
      <div class="metric">
        <span class="metric__label">Completed</span>
        <strong>{{ summary.finalized || 0 }}</strong>
        <span class="metric__pct">{{ pctOf(summary.finalized) }}%</span>
      </div>
      <div class="metric">
        <span class="metric__label">In Progress</span>
        <strong>{{ summary.inProgress || 0 }}</strong>
        <span class="metric__pct">{{ pctOf(summary.inProgress) }}%</span>
      </div>
      <div class="metric">
        <span class="metric__label">Not Started</span>
        <strong>{{ summary.notStarted || 0 }}</strong>
        <span class="metric__pct">{{ pctOf(summary.notStarted) }}%</span>
      </div>
      <div class="metric">
        <span class="metric__label">Total Views</span>
        <strong>{{ summary.totalTokenViews || 0 }}</strong>
      </div>
    </div>

    <div v-if="scoreHighlight" class="reinit-admin__score-strip">
      {{ scoreHighlight }}
    </div>

    <div class="reinit-admin__workspace" :class="{ 'has-detail': Boolean(selectedRow) }">
      <div class="reinit-admin__main">
        <div class="reinit-admin__filters">
          <input v-model="filterText" type="text" placeholder="Search schools…" class="reinit-admin__input" />
          <select v-model="filterStatus">
            <option value="all">All statuses</option>
            <option value="not_started">Not started</option>
            <option value="in_progress">In progress</option>
            <option value="finalized">Finalized</option>
          </select>
          <select v-model="sortKey">
            <option value="pct">Sort: Overall progress</option>
            <option value="name">Sort: Name</option>
            <option value="days">Sort: Days/week</option>
            <option value="clicks">Sort: Token clicks</option>
            <option value="satisfaction">Sort: Satisfaction</option>
            <option value="quote">Sort: Has marketing quote</option>
          </select>
          <label class="inline"><input v-model="filterHasQuote" type="checkbox" /> Has quote</label>
          <label class="inline"><input v-model="filterDelivery" type="checkbox" /> Needs delivery</label>
          <label class="inline"><input v-model="filterSat4" type="checkbox" /> Rated 4+</label>
        </div>

        <div class="reinit-admin__table-wrap">
          <table class="reinit-admin__table">
            <thead>
              <tr>
                <th>School</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Sections</th>
                <th>Scores</th>
                <th>Viewers</th>
                <th>Clicks</th>
                <th>Last activity</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in filteredRows"
                :key="row.schoolOrganizationId"
                :class="{ 'is-selected': selectedRow?.schoolOrganizationId === row.schoolOrganizationId }"
                @click="selectRow(row)"
              >
                <td>
                  <div class="school-cell">
                    <span class="school-avatar" :style="{ background: avatarColor(row.schoolName) }">
                      {{ initials(row.schoolName) }}
                    </span>
                    <div>
                      <strong>{{ row.schoolName }}</strong>
                      <div v-if="row.finalizedAt" class="muted small">Done {{ formatDt(row.finalizedAt) }}</div>
                    </div>
                  </div>
                </td>
                <td><span class="pill" :class="'pill--' + row.status">{{ statusLabel(row.status) }}</span></td>
                <td>
                  <div class="progress-cell">
                    <span>{{ row.sectionPercent }}%</span>
                    <div class="progress-bar"><i :style="{ width: `${row.sectionPercent || 0}%` }" /></div>
                  </div>
                </td>
                <td>
                  <div class="section-dots" :title="`${row.reviewedCount}/${row.sectionTotal} complete`">
                    <span
                      v-for="(done, idx) in sectionDots(row)"
                      :key="idx"
                      class="dot"
                      :class="{ 'is-done': done }"
                    />
                  </div>
                </td>
                <td class="scores-cell">
                  <span v-if="row.scores?.overallSatisfaction != null">{{ row.scores.overallSatisfaction }}/5</span>
                  <span v-else class="muted">—</span>
                  <span class="muted"> · </span>
                  <span v-if="row.scores?.recommendNps != null">NPS {{ row.scores.recommendNps }}</span>
                  <span v-else class="muted">NPS —</span>
                </td>
                <td>
                  <div class="viewer-stack">
                    <span
                      v-for="(v, i) in (row.viewers || []).slice(0, 3)"
                      :key="`${row.schoolOrganizationId}-v-${i}`"
                      class="viewer-chip"
                      :title="v.actor_display_name || 'Viewer'"
                    >
                      {{ initials(v.actor_display_name || '?') }}
                    </span>
                    <span v-if="(row.viewerCount || 0) > 3" class="viewer-more">+{{ row.viewerCount - 3 }}</span>
                    <span v-if="!(row.viewerCount || 0)" class="muted">0</span>
                  </div>
                </td>
                <td>{{ row.tokenClickCount || 0 }}</td>
                <td class="muted small">{{ formatDt(row.lastActivityAt) }}</td>
                <td>
                  <button type="button" class="btn btn-secondary btn-sm icon-btn" title="Open details" @click.stop="selectRow(row)">
                    👁
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-if="!filteredRows.length" class="muted empty-msg">No schools match filters.</p>
        </div>
      </div>

      <!-- Persistent right detail pane -->
      <aside v-if="selectedRow" class="reinit-admin__detail">
        <div class="detail__head">
          <div class="school-cell">
            <span class="school-avatar" :style="{ background: avatarColor(selectedRow.schoolName) }">
              {{ initials(selectedRow.schoolName) }}
            </span>
            <div>
              <strong>{{ selectedRow.schoolName }}</strong>
              <div class="detail__meta">
                <span class="pill" :class="'pill--' + selectedRow.status">{{ statusLabel(selectedRow.status) }}</span>
                <span v-if="selectedRow.finalizedAt" class="muted small">{{ formatDt(selectedRow.finalizedAt) }}</span>
              </div>
            </div>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" @click="clearSelection">✕</button>
        </div>

        <div class="detail__stats">
          <div><span>Progress</span><strong>{{ selectedRow.sectionPercent }}%</strong></div>
          <div><span>Token clicks</span><strong>{{ selectedRow.tokenClickCount || 0 }}</strong></div>
          <div><span>Viewers</span><strong>{{ selectedRow.viewerCount || 0 }}</strong></div>
        </div>

        <div class="detail__tabs">
          <button type="button" :class="{ active: detailTab === 'summary' }" @click="detailTab = 'summary'">Summary</button>
          <button type="button" :class="{ active: detailTab === 'sections' }" @click="detailTab = 'sections'">
            Sections ({{ selectedRow.sectionTotal || 8 }})
          </button>
          <button type="button" :class="{ active: detailTab === 'activity' }" @click="detailTab = 'activity'">Activity</button>
          <button type="button" :class="{ active: detailTab === 'addendums' }" @click="detailTab = 'addendums'">
            Addendums ({{ selectedRow.addendumCount || detail?.addendums?.length || 0 }})
          </button>
        </div>

        <div class="detail__body">
          <div v-if="detailLoading" class="muted">Loading…</div>
          <template v-else>
            <div v-show="detailTab === 'summary'" class="detail__summary">
              <h4>Key information</h4>
              <div class="kv-grid">
                <div><span>Satisfaction</span><strong>{{ scoreOrDash(selectedRow.scores?.overallSatisfaction, 5) }}</strong></div>
                <div><span>NPS</span><strong>{{ scoreOrDash(selectedRow.scores?.recommendNps, 10) }}</strong></div>
                <div><span>Days / week</span><strong>{{ selectedRow.daysPerWeekRequested ?? '—' }}</strong></div>
                <div><span>Provider prefs</span><strong>{{ selectedRow.providerPreferences || '—' }}</strong></div>
                <div><span>First day</span><strong>{{ selectedRow.firstDayOfSchool || '—' }}</strong></div>
                <div><span>Partner invited</span><strong>{{ yn(selectedRow.btsPartnerInvited) }}</strong></div>
                <div><span>Marketing table</span><strong>{{ yn(selectedRow.btsMarketingTable) }}</strong></div>
                <div><span>Active sign-ups</span><strong>{{ yn(selectedRow.btsActiveSignups) }}</strong></div>
                <div><span>Paper packets</span><strong>{{ yn(selectedRow.needPaperPackets) }}</strong></div>
                <div><span>Trifolds</span><strong>{{ yn(selectedRow.needTrifolds) }}</strong></div>
                <div><span>Delivery</span><strong>{{ yn(selectedRow.materialsDeliveryRequired) }}</strong></div>
                <div><span>Fall check-in</span><strong>{{ fallCheckInLabel(selectedRow) }}</strong></div>
                <div class="span-2"><span>Marketing quote</span><strong>{{ selectedRow.marketingQuote || (selectedRow.hasMarketingQuote ? 'Yes' : '—') }}</strong></div>
              </div>
              <div class="detail__token-actions">
                <button type="button" class="btn btn-secondary btn-sm" @click="generateLink(selectedRow)">Generate link</button>
                <button
                  v-if="selectedRow.tokens?.[0]"
                  type="button"
                  class="btn btn-secondary btn-sm"
                  @click="copyLink(selectedRow.tokens[0].token)"
                >
                  Copy token
                </button>
                <button
                  v-if="selectedRow.tokens?.[0]"
                  type="button"
                  class="btn btn-secondary btn-sm"
                  @click="toggleSent(selectedRow.tokens[0])"
                >
                  {{ selectedRow.tokens[0].marked_sent_at ? 'Unmark sent' : 'Mark sent' }}
                </button>
              </div>
            </div>

            <div v-show="detailTab === 'sections'">
              <ul class="section-list">
                <li v-for="s in detailSections" :key="s.sectionKey">
                  <span :class="{ done: s.reviewed || s.completed }">{{ sectionTitle(s.sectionKey) }}</span>
                  <span v-if="s.reviewed || s.completed" class="muted small">✓ {{ formatDt(s.reviewedAt) }}</span>
                  <span v-else class="muted small">not reviewed</span>
                </li>
              </ul>
              <h4>Pending change requests</h4>
              <div v-if="!pendingCrs.length" class="muted">None</div>
              <div v-for="cr in pendingCrs" :key="cr.id" class="reinit-admin__cr">
                <div>
                  <strong>{{ cr.action }}</strong> {{ cr.entity_type }} #{{ cr.entity_id }}
                  <span class="muted">by {{ cr.submitted_by_display_name || '—' }}</span>
                </div>
                <div class="reinit-admin__actions">
                  <button type="button" class="btn btn-primary btn-sm" @click="resolveCr(cr.id, 'approved')">Approve</button>
                  <button type="button" class="btn btn-secondary btn-sm" @click="resolveCr(cr.id, 'rejected')">Reject</button>
                </div>
              </div>
            </div>

            <div v-show="detailTab === 'activity'">
              <div v-if="!(detail?.viewEvents || []).length" class="muted">No activity recorded yet.</div>
              <ul class="activity-list">
                <li v-for="(ev, i) in detail?.viewEvents || []" :key="i">
                  <strong>{{ formatDt(ev.created_at) }}</strong>
                  — {{ ev.event_type || 'view' }}
                  <span class="muted">{{ ev.actor_display_name || 'Anonymous' }}</span>
                  <span v-if="ev.section_key" class="muted">({{ sectionTitle(ev.section_key) }})</span>
                </li>
              </ul>
            </div>

            <div v-show="detailTab === 'addendums'">
              <ul class="activity-list">
                <li v-for="a in detail?.addendums || []" :key="a.id">
                  <strong>{{ formatDt(a.submitted_at) }}</strong>
                  — {{ a.summary_text }}
                  <span class="muted">({{ a.submitted_by_display_name || 'Unknown' }})</span>
                </li>
              </ul>
              <p v-if="!(detail?.addendums || []).length" class="muted">None</p>
            </div>
          </template>
        </div>

        <div class="detail__footer">
          <button type="button" class="btn btn-secondary" @click="openCollaborativeUi(selectedRow)">
            View Receipt / Summary
          </button>
          <button type="button" class="btn btn-push" @click="detailTab = 'addendums'">
            View Addendums ({{ selectedRow.addendumCount || detail?.addendums?.length || 0 }})
          </button>
        </div>
      </aside>
    </div>

    <div v-if="lastLink" class="success-banner">
      Link ready:
      <code>{{ lastLink }}</code>
      <button type="button" class="btn btn-secondary btn-sm" @click="copyText(lastLink)">Copy URL</button>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { SECTION_META } from '../../utils/schoolReinit';

const props = defineProps({
  agencyId: { type: [Number, String], required: true },
  schoolYear: { type: String, default: '' },
});

const router = useRouter();
const route = useRoute();

const loading = ref(false);
const savingQ = ref(false);
const campaignBusy = ref(false);
const error = ref('');
const pushFlash = ref('');
const report = ref({ schools: [], summary: {} });
const campaign = ref({
  status: 'draft',
  isEnabled: false,
  isPushed: false,
  enabledAt: null,
  pushedAt: null,
});
const questions = ref([]);
const slots = ref([]);
const showQuestions = ref(false);
const showSlots = ref(false);
const filterText = ref('');
const filterStatus = ref('all');
const sortKey = ref('pct');
const filterHasQuote = ref(false);
const filterDelivery = ref(false);
const filterSat4 = ref(false);
const lastLink = ref('');
const selectedRow = ref(null);
const detail = ref(null);
const detailLoading = ref(false);
const detailTab = ref('summary');
const newSlot = reactive({ startsAt: '', label: '' });

const schoolYear = computed(() => {
  if (props.schoolYear) return props.schoolYear;
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return m >= 8 ? `${y}-${String(y + 1).slice(-2)}` : `${y - 1}-${String(y).slice(-2)}`;
});

const campaignLabel = computed(() => {
  const s = campaign.value?.status || 'draft';
  if (s === 'pushed') return 'Pushed';
  if (s === 'enabled') return 'Enabled';
  return 'Draft';
});

const summary = computed(() => report.value.summary || {});

const scoreHighlight = computed(() => {
  const s = summary.value;
  const parts = [];
  if (s.satisfactionRespondedCount) {
    parts.push(
      `${s.satisfactionAtLeast4Count}/${s.satisfactionRespondedCount} schools rated overall satisfaction 4+`
    );
  }
  if (s.avgNps != null) parts.push(`Avg NPS ${s.avgNps}`);
  if (s.avgSatisfaction != null) parts.push(`Avg satisfaction ${s.avgSatisfaction}/5`);
  if (s.npsRespondedCount) {
    parts.push(`${s.npsPromoters} promoters / ${s.npsPassives} passives / ${s.npsDetractors} detractors`);
  }
  return parts.join(' · ');
});

const filteredRows = computed(() => {
  let rows = [...(report.value.schools || [])];
  const q = filterText.value.trim().toLowerCase();
  if (q) rows = rows.filter((r) => String(r.schoolName || '').toLowerCase().includes(q));
  if (filterStatus.value !== 'all') rows = rows.filter((r) => r.status === filterStatus.value);
  if (filterHasQuote.value) rows = rows.filter((r) => r.hasMarketingQuote);
  if (filterDelivery.value) rows = rows.filter((r) => r.materialsDeliveryRequired);
  if (filterSat4.value) {
    rows = rows.filter((r) => r.scores?.overallSatisfaction != null && r.scores.overallSatisfaction >= 4);
  }
  rows.sort((a, b) => {
    if (sortKey.value === 'pct') return (b.sectionPercent || 0) - (a.sectionPercent || 0);
    if (sortKey.value === 'days') return Number(b.daysPerWeekRequested || 0) - Number(a.daysPerWeekRequested || 0);
    if (sortKey.value === 'clicks') return (b.tokenClickCount || 0) - (a.tokenClickCount || 0);
    if (sortKey.value === 'quote') return Number(b.hasMarketingQuote) - Number(a.hasMarketingQuote);
    if (sortKey.value === 'satisfaction') {
      return Number(b.scores?.overallSatisfaction ?? -1) - Number(a.scores?.overallSatisfaction ?? -1);
    }
    return String(a.schoolName || '').localeCompare(String(b.schoolName || ''));
  });
  return rows;
});

const detailSections = computed(() => {
  if (detail.value?.sections?.length) return detail.value.sections;
  return selectedRow.value?.sections || [];
});

const pendingCrs = computed(() =>
  (detail.value?.changeRequests || []).filter((c) => c.status === 'pending')
);

function pctOf(n) {
  const total = summary.value.totalSchools || 0;
  if (!total) return 0;
  return Math.round((Number(n || 0) / total) * 100);
}

function formatDt(raw) {
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw).slice(0, 16);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function statusLabel(s) {
  if (s === 'finalized') return 'Finalized';
  if (s === 'in_progress') return 'In Progress';
  return 'Not Started';
}

function yn(v) {
  if (v === true || v === 1 || v === '1') return 'Yes';
  if (v === false || v === 0 || v === '0') return 'No';
  return '—';
}

function scoreOrDash(n, max) {
  if (n == null) return '—';
  return `${n} / ${max}`;
}

function initials(name) {
  const parts = String(name || '?')
    .split(/[\s,]+/)
    .filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
}

function avatarColor(name) {
  const colors = ['#0c4a6e', '#166534', '#9a3412', '#1e40af', '#7c2d12', '#334155'];
  let h = 0;
  for (const c of String(name || '')) h = (h + c.charCodeAt(0) * 17) % colors.length;
  return colors[h];
}

function sectionDots(row) {
  const keys = row.sectionKeys || SECTION_META.map((m) => m.key);
  const byKey = Object.fromEntries((row.sections || []).map((s) => [s.sectionKey, s]));
  return keys.map((k) => Boolean(byKey[k]?.reviewed || byKey[k]?.completed));
}

function sectionTitle(key) {
  return SECTION_META.find((m) => m.key === key)?.shortTitle || key;
}

function fallCheckInLabel(row) {
  const f = row.fallCheckIn || {};
  if (f.preferredWeek || f.preferredDay || f.preferredTime) {
    return [f.preferredWeek, f.preferredDay, f.preferredTime].filter(Boolean).join(' · ');
  }
  if (f.slotId) return `Slot #${f.slotId}`;
  return '—';
}

async function load() {
  if (!props.agencyId) return;
  loading.value = true;
  error.value = '';
  try {
    const [rep, camp] = await Promise.all([
      api.get('/school-reinit/report', { params: { agencyId: props.agencyId, schoolYear: schoolYear.value } }),
      api.get('/school-reinit/campaign', { params: { agencyId: props.agencyId, schoolYear: schoolYear.value } }),
    ]);
    report.value = rep.data;
    campaign.value = camp.data?.campaign ||
      rep.data?.campaign || {
        status: 'draft',
        isEnabled: false,
        isPushed: false,
      };

    if (selectedRow.value) {
      const refreshed = (rep.data.schools || []).find(
        (r) => r.schoolOrganizationId === selectedRow.value.schoolOrganizationId
      );
      if (refreshed) selectedRow.value = refreshed;
    }

    if (campaign.value.isEnabled) {
      const [qs, sl] = await Promise.all([
        api.get('/school-reinit/questions', { params: { agencyId: props.agencyId, schoolYear: schoolYear.value } }),
        api.get('/school-reinit/checkin-slots', { params: { agencyId: props.agencyId, schoolYear: schoolYear.value } }),
      ]);
      questions.value = (qs.data.questions || []).map((q) => ({
        ...q,
        enabled: q.enabled ? 1 : 0,
        required: q.required ? 1 : 0,
      }));
      slots.value = sl.data.slots || [];
    } else {
      questions.value = [];
      slots.value = [];
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load';
  } finally {
    loading.value = false;
  }
}

async function enableYearUpdate() {
  if (campaignBusy.value) return;
  campaignBusy.value = true;
  error.value = '';
  pushFlash.value = '';
  try {
    const res = await api.post('/school-reinit/campaign/enable', {
      agencyId: Number(props.agencyId),
      schoolYear: schoolYear.value,
    });
    campaign.value = res.data.campaign;
    showQuestions.value = true;
    pushFlash.value = 'Year Update enabled. Default questions are seeded — edit them, then Push to Schools.';
    await load();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Enable failed';
  } finally {
    campaignBusy.value = false;
  }
}

async function pushToSchools() {
  if (campaignBusy.value || !campaign.value.isEnabled) return;
  if (
    !window.confirm(
      'Push to all schools? This creates share tokens and shows the Collaborative Update splash on school staff login (they can dismiss / complete later).'
    )
  ) {
    return;
  }
  campaignBusy.value = true;
  error.value = '';
  pushFlash.value = '';
  try {
    const res = await api.post('/school-reinit/campaign/push', {
      agencyId: Number(props.agencyId),
      schoolYear: schoolYear.value,
    });
    campaign.value = res.data.campaign;
    pushFlash.value = `Pushed to ${res.data.schoolsReady || res.data.schoolCount || 0} schools (${res.data.tokensCreated || 0} new tokens).`;
    await load();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Push failed';
  } finally {
    campaignBusy.value = false;
  }
}

async function saveQuestion(q) {
  savingQ.value = true;
  try {
    await api.put(`/school-reinit/questions/${q.question_key}`, {
      agencyId: Number(props.agencyId),
      schoolYear: schoolYear.value,
      label: q.label,
      help_text: q.help_text,
      enabled: Boolean(Number(q.enabled)),
      required: Boolean(Number(q.required)),
      sort_order: q.sort_order,
    });
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Save failed';
  } finally {
    savingQ.value = false;
  }
}

async function resetQuestions() {
  if (!window.confirm('Reset all questionnaire wording to defaults for this year?')) return;
  savingQ.value = true;
  try {
    const res = await api.post('/school-reinit/questions/reset', {
      agencyId: Number(props.agencyId),
      schoolYear: schoolYear.value,
    });
    questions.value = (res.data.questions || []).map((q) => ({
      ...q,
      enabled: q.enabled ? 1 : 0,
      required: q.required ? 1 : 0,
    }));
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Reset failed';
  } finally {
    savingQ.value = false;
  }
}

async function addSlot() {
  try {
    await api.post('/school-reinit/checkin-slots', {
      agencyId: Number(props.agencyId),
      schoolYear: schoolYear.value,
      startsAt: newSlot.startsAt.replace('T', ' ') + ':00',
      label: newSlot.label || null,
    });
    newSlot.startsAt = '';
    newSlot.label = '';
    await load();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Add slot failed';
  }
}

async function generateLink(row) {
  try {
    const res = await api.post('/school-reinit/tokens', {
      agencyId: Number(props.agencyId),
      schoolOrganizationId: row.schoolOrganizationId,
      schoolYear: schoolYear.value,
    });
    const path = res.data.path || `/school-reinit/${res.data.token}`;
    lastLink.value = `${window.location.origin}${path}`;
    await load();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Token failed';
  }
}

function copyLink(token) {
  copyText(`${window.location.origin}/school-reinit/${token}`);
}
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    lastLink.value = text;
  } catch {
    lastLink.value = text;
  }
}

async function toggleSent(tokenRow) {
  try {
    await api.patch(`/school-reinit/tokens/${tokenRow.id}/mark-sent`, {
      sent: !tokenRow.marked_sent_at,
    });
    await load();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Update failed';
  }
}

async function selectRow(row) {
  selectedRow.value = row;
  detailTab.value = 'summary';
  if (!row.cycleId) {
    detail.value = { sections: row.sections || [], changeRequests: [], addendums: [], viewEvents: [] };
    return;
  }
  detailLoading.value = true;
  try {
    const res = await api.get(`/school-reinit/cycles/${row.cycleId}`);
    detail.value = res.data;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Detail failed';
    detail.value = { sections: row.sections || [], changeRequests: [], addendums: [], viewEvents: [] };
  } finally {
    detailLoading.value = false;
  }
}

function clearSelection() {
  selectedRow.value = null;
  detail.value = null;
}

async function resolveCr(id, status) {
  try {
    await api.post(`/school-reinit/change-requests/${id}/resolve`, { status });
    if (selectedRow.value?.cycleId) {
      const res = await api.get(`/school-reinit/cycles/${selectedRow.value.cycleId}`);
      detail.value = res.data;
    }
    await load();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Resolve failed';
  }
}

function openCollaborativeUi(row) {
  const schoolId = row.schoolOrganizationId;
  const agencyId = Number(props.agencyId);
  const orgSlug = typeof route.params.organizationSlug === 'string' ? route.params.organizationSlug : '';
  if (orgSlug) {
    router.push({
      name: 'OrganizationSchoolReinitAdmin',
      params: { organizationSlug: orgSlug, schoolOrganizationId: String(schoolId) },
      query: { agencyId: String(agencyId) },
    });
  } else {
    router.push({
      name: 'SchoolReinitAdmin',
      params: { schoolOrganizationId: String(schoolId) },
      query: { agencyId: String(agencyId) },
    });
  }
}

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function exportCsv() {
  const headers = [
    'School',
    'Status',
    'Progress %',
    'Sections complete',
    'Satisfaction (1-5)',
    'NPS (0-10)',
    'Days/week',
    'Provider preferences',
    'First day of school',
    'Partner invited',
    'Marketing table',
    'Active sign-ups',
    'Paper packets',
    'Trifolds',
    'Delivery required',
    'Fall check-in',
    'Has marketing quote',
    'Marketing quote',
    'Token clicks',
    'Viewers',
    'Addendums',
    'Pending change requests',
    'Finalized at',
    'Last activity',
  ];
  const lines = [headers.join(',')];
  for (const r of filteredRows.value) {
    lines.push(
      [
        r.schoolName,
        r.status,
        r.sectionPercent,
        `${r.reviewedCount}/${r.sectionTotal}`,
        r.scores?.overallSatisfaction ?? '',
        r.scores?.recommendNps ?? '',
        r.daysPerWeekRequested ?? '',
        r.providerPreferences ?? '',
        r.firstDayOfSchool ?? '',
        yn(r.btsPartnerInvited),
        yn(r.btsMarketingTable),
        yn(r.btsActiveSignups),
        yn(r.needPaperPackets),
        yn(r.needTrifolds),
        yn(r.materialsDeliveryRequired),
        fallCheckInLabel(r),
        r.hasMarketingQuote ? 'Yes' : 'No',
        r.marketingQuote ?? '',
        r.tokenClickCount || 0,
        r.viewerCount || 0,
        r.addendumCount || 0,
        r.pendingChangeRequests || 0,
        r.finalizedAt || '',
        r.lastActivityAt || '',
      ]
        .map(csvEscape)
        .join(',')
    );
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `school-reinit-report-${schoolYear.value}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

watch(() => props.agencyId, () => {
  clearSelection();
  load();
});
onMounted(() => load());
</script>

<style scoped>
.reinit-admin {
  margin: 18px 0 28px;
  padding: 16px 18px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
}
.reinit-admin__head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.reinit-admin__head h2 {
  margin: 0 0 4px;
  font-size: 1.15rem;
}
.reinit-admin__head-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.reinit-admin__campaign {
  background: #fff;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  padding: 14px 16px;
  margin-bottom: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.reinit-admin__campaign-status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.reinit-admin__campaign-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.btn-push {
  background: #15803d;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 8px 14px;
  font-weight: 800;
  cursor: pointer;
}
.btn-push:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.muted {
  color: #64748b;
  font-size: 0.9rem;
  margin: 0;
}
.small {
  font-size: 0.75rem;
}
.error-banner,
.success-banner {
  padding: 10px 12px;
  border-radius: 8px;
  margin-bottom: 10px;
  font-size: 0.9rem;
}
.error-banner {
  background: #fef2f2;
  color: #b91c1c;
}
.success-banner {
  background: #ecfdf5;
  color: #065f46;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.reinit-admin__panel {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 12px;
}
.reinit-admin__panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.reinit-admin__q {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 0;
  border-bottom: 1px solid #f1f5f9;
}
.reinit-admin__q-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  font-size: 0.75rem;
}
.reinit-admin__input {
  padding: 6px 8px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font: inherit;
}
.muted-input {
  color: #64748b;
}
.inline {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.8rem;
}
.reinit-admin__metrics {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}
@media (max-width: 900px) {
  .reinit-admin__metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
.metric {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.metric__label {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
  font-weight: 700;
}
.metric strong {
  font-size: 1.4rem;
  color: #0f172a;
}
.metric__pct {
  font-size: 0.75rem;
  color: #64748b;
}
.reinit-admin__score-strip {
  background: #ecfdf5;
  border: 1px solid #bbf7d0;
  color: #166534;
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 0.88rem;
  font-weight: 600;
  margin-bottom: 12px;
}
.reinit-admin__workspace {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  align-items: start;
}
.reinit-admin__workspace.has-detail {
  grid-template-columns: minmax(0, 1fr) minmax(320px, 380px);
}
@media (max-width: 1100px) {
  .reinit-admin__workspace.has-detail {
    grid-template-columns: 1fr;
  }
}
.reinit-admin__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
  align-items: center;
}
.reinit-admin__table-wrap {
  overflow-x: auto;
  background: #fff;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
}
.reinit-admin__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.reinit-admin__table th,
.reinit-admin__table td {
  padding: 8px 10px;
  border-bottom: 1px solid #f1f5f9;
  text-align: left;
  vertical-align: middle;
}
.reinit-admin__table th {
  background: #f8fafc;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #64748b;
}
.reinit-admin__table tbody tr {
  cursor: pointer;
}
.reinit-admin__table tbody tr:hover,
.reinit-admin__table tbody tr.is-selected {
  background: #f0f9ff;
}
.school-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}
.school-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-weight: 800;
  flex-shrink: 0;
}
.progress-cell {
  min-width: 90px;
}
.progress-bar {
  height: 6px;
  background: #e2e8f0;
  border-radius: 999px;
  margin-top: 4px;
  overflow: hidden;
}
.progress-bar i {
  display: block;
  height: 100%;
  background: #15803d;
}
.section-dots {
  display: flex;
  gap: 3px;
  flex-wrap: wrap;
  max-width: 90px;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #e2e8f0;
}
.dot.is-done {
  background: #16a34a;
}
.scores-cell {
  white-space: nowrap;
  font-size: 0.8rem;
}
.viewer-stack {
  display: flex;
  align-items: center;
}
.viewer-chip {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #cbd5e1;
  color: #1e293b;
  font-size: 0.55rem;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-right: -6px;
  border: 2px solid #fff;
}
.viewer-more {
  margin-left: 10px;
  font-size: 0.7rem;
  color: #64748b;
}
.icon-btn {
  padding: 4px 8px;
}
.empty-msg {
  padding: 14px;
}
.pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
}
.pill--draft {
  background: #f1f5f9;
  color: #475569;
}
.pill--enabled {
  background: #dbeafe;
  color: #1d4ed8;
}
.pill--pushed {
  background: #dcfce7;
  color: #166534;
}
.pill--not_started {
  background: #f1f5f9;
  color: #475569;
}
.pill--in_progress {
  background: #dbeafe;
  color: #1d4ed8;
}
.pill--finalized {
  background: #dcfce7;
  color: #166534;
}
.reinit-admin__detail {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  max-height: min(80vh, 900px);
  position: sticky;
  top: 12px;
}
.detail__head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 14px 14px 10px;
  border-bottom: 1px solid #f1f5f9;
}
.detail__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin-top: 4px;
}
.detail__stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  padding: 10px 14px;
}
.detail__stats div {
  background: #f8fafc;
  border-radius: 8px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.detail__stats span {
  font-size: 0.68rem;
  color: #64748b;
  text-transform: uppercase;
  font-weight: 700;
}
.detail__stats strong {
  font-size: 1rem;
}
.detail__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 0 10px;
  border-bottom: 1px solid #e2e8f0;
}
.detail__tabs button {
  border: none;
  background: transparent;
  padding: 8px 10px;
  font-size: 0.78rem;
  font-weight: 700;
  color: #64748b;
  cursor: pointer;
  border-bottom: 2px solid transparent;
}
.detail__tabs button.active {
  color: #0c4a6e;
  border-bottom-color: #0c4a6e;
}
.detail__body {
  padding: 12px 14px;
  overflow: auto;
  flex: 1;
  font-size: 0.85rem;
}
.detail__body h4 {
  margin: 0 0 8px;
  font-size: 0.85rem;
}
.kv-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 12px;
}
.kv-grid div {
  background: #f8fafc;
  border-radius: 8px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.kv-grid .span-2 {
  grid-column: span 2;
}
.kv-grid span {
  font-size: 0.68rem;
  color: #64748b;
  text-transform: uppercase;
  font-weight: 700;
}
.detail__token-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.section-list,
.activity-list {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
}
.section-list li,
.activity-list li {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 6px;
  padding: 6px 0;
  border-bottom: 1px solid #f1f5f9;
}
.section-list .done {
  color: #166534;
  font-weight: 600;
}
.detail__footer {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 14px;
  border-top: 1px solid #e2e8f0;
}
.detail__footer .btn {
  flex: 1;
  min-width: 120px;
}
.reinit-admin__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.reinit-admin__cr {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid #f1f5f9;
  font-size: 0.85rem;
}
.reinit-admin__slots {
  margin: 8px 0;
  padding-left: 18px;
  font-size: 0.85rem;
}
.reinit-admin__slot-form {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.btn {
  font-family: system-ui, sans-serif;
  border-radius: 8px;
  border: 1px solid transparent;
  padding: 6px 10px;
  font-weight: 700;
  cursor: pointer;
}
.btn-sm {
  font-size: 0.75rem;
}
.btn-primary {
  background: #0c4a6e;
  color: #fff;
}
.btn-secondary {
  background: #f1f5f9;
  border-color: #cbd5e1;
  color: #334155;
}
</style>
