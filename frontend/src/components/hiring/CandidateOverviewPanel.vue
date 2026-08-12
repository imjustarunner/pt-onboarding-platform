<template>
  <div class="cov">
    <div class="cov-grid">
      <section class="cov-card">
        <h4>Candidate</h4>
        <div class="cov-kv"><span>Status</span><strong>{{ statusLabel }}</strong></div>
        <div class="cov-kv"><span>Hiring stage</span><strong>{{ stageLabel }}</strong></div>
        <div class="cov-kv"><span>Role applied</span><strong>{{ roleTitle }}</strong></div>
        <div class="cov-kv"><span>Email</span><strong>{{ email || '—' }}</strong></div>
        <div class="cov-kv"><span>Phone</span><strong>{{ phone || '—' }}</strong></div>
        <div class="cov-kv"><span>Source</span><strong>{{ source || '—' }}</strong></div>
      </section>

      <section class="cov-card">
        <h4>Recommendation</h4>
        <div class="cov-score">
          <div class="cov-score-value">{{ overallScore }}</div>
          <div class="cov-score-meta">{{ recommendation }}</div>
        </div>
        <p class="muted small">Based on latest interview scorecard and resume/pre-screen signals. Verify before deciding.</p>
        <div class="cov-actions">
          <button type="button" class="btn btn-primary btn-sm" @click="$emit('goto-tab', 'assessment')">Open assessment</button>
          <button type="button" class="btn btn-secondary btn-sm" @click="$emit('schedule-interview')">Schedule interview</button>
        </div>
      </section>

      <section class="cov-card">
        <h4>Interview status</h4>
        <div class="cov-kv"><span>Hub interviews</span><strong>{{ interviewCount }}</strong></div>
        <div class="cov-kv"><span>Next / latest</span><strong>{{ nextInterviewLabel }}</strong></div>
        <div class="cov-kv"><span>Next action</span><strong>{{ nextAction }}</strong></div>
        <div class="cov-actions" style="margin-top:10px;">
          <button type="button" class="btn btn-primary btn-sm" @click="$emit('schedule-interview')">Schedule interview</button>
          <button type="button" class="btn btn-secondary btn-sm" @click="$emit('goto-tab', 'interview')">Go to Interviews</button>
        </div>
      </section>
    </div>

    <div class="cov-grid cov-grid--2">
      <section class="cov-card">
        <div class="cov-card-head">
          <h4>Key highlights</h4>
          <button type="button" class="linkish" @click="$emit('goto-tab', 'assessment')">Details</button>
        </div>
        <ul v-if="highlights.length" class="cov-list">
          <li v-for="(h, i) in highlights" :key="i">{{ h }}</li>
        </ul>
        <p v-else class="muted small">No highlights yet. Run the pre-screen report in Candidate Assessment for a condensed research summary.</p>
      </section>

      <section class="cov-card">
        <div class="cov-card-head">
          <h4>Important flags</h4>
        </div>
        <ul v-if="flags.length" class="cov-list cov-flags">
          <li v-for="(f, i) in flags" :key="i">{{ f }}</li>
        </ul>
        <p v-else class="muted small">No flags flagged yet.</p>
      </section>
    </div>

    <section class="cov-card">
      <div class="cov-card-head">
        <h4>Recent activity</h4>
        <button type="button" class="linkish" @click="$emit('goto-tab', 'notes')">Notes</button>
      </div>
      <ul v-if="activityItems.length" class="cov-list">
        <li v-for="(a, i) in activityItems.slice(0, 6)" :key="i">
          <strong>{{ a.title }}</strong>
          <span class="muted small"> — {{ a.meta }}</span>
        </li>
      </ul>
      <p v-else class="muted small">No recent activity.</p>
    </section>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { buildOverviewHighlights, buildOverviewFlags } from '../../utils/hiringPreScreenDigest.js';

const props = defineProps({
  profile: { type: Object, default: null },
  user: { type: Object, default: null },
  jobTitle: { type: String, default: '' },
  resumeSummary: { type: Object, default: null },
  summaryBullets: { type: Array, default: () => [] },
  latestPreScreen: { type: Object, default: null },
  interviews: { type: Array, default: () => [] },
  averageInterviewScore: { type: [Number, String], default: null },
  activityItems: { type: Array, default: () => [] }
});

defineEmits(['goto-tab', 'schedule-interview']);

const stageLabel = computed(() => {
  if (props.profile?.stage_label) return props.profile.stage_label;
  const s = String(props.profile?.stage || 'applied').replace(/_/g, ' ');
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Applied';
});

const statusLabel = computed(() => {
  const raw = String(props.profile?.status || props.profile?.hiring_status || props.profile?.stage || 'applied')
    .replace(/_/g, ' ')
    .trim();
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : 'Applied';
});

const roleTitle = computed(() => props.jobTitle || props.profile?.applied_role || '—');
const email = computed(() => props.user?.personal_email || props.user?.email || '');
const phone = computed(() => props.user?.phone_number || '');
const source = computed(() => props.profile?.source || '');

const interviewCount = computed(() => (props.interviews || []).length);

const nextInterviewLabel = computed(() => {
  const list = [...(props.interviews || [])].sort((a, b) => {
    const ta = new Date(a.interview_starts_at || 0).getTime();
    const tb = new Date(b.interview_starts_at || 0).getTime();
    return tb - ta;
  });
  const iv = list[0];
  if (!iv) return 'None scheduled';
  try {
    const when = iv.interview_starts_at ? new Date(iv.interview_starts_at).toLocaleString() : '';
    const title = iv.display_title ? `${iv.display_title} · ` : '';
    return `${title}${iv.status || 'scheduled'}${when ? ` · ${when}` : ''}`;
  } catch {
    return String(iv.status || 'scheduled');
  }
});

const overallScore = computed(() => {
  const score = parseInterviewAverage(props.averageInterviewScore);
  if (score != null) return `${score}/4`;
  if (props.latestPreScreen?.status === 'completed') return 'Pre-screen ready';
  if (props.resumeSummary?.summary) return 'Summary ready';
  return '—';
});

function parseInterviewAverage(raw) {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const recommendation = computed(() => {
  const score = parseInterviewAverage(props.averageInterviewScore);
  if (score != null) {
    if (score >= 3.5) return 'Strong interview signal';
    if (score >= 2.5) return 'Mixed / proceed with review';
    return 'Weak interview signal';
  }
  if (!props.resumeSummary?.summary) return 'Awaiting resume assessment';
  if (!props.latestPreScreen) return 'Resume assessed — run or await pre-screen';
  return 'No interview score yet — review pre-screen, then schedule or decide';
});

const nextAction = computed(() => {
  if (!(props.interviews || []).length) return 'Schedule interview';
  const open = (props.interviews || []).find((i) => ['scheduled', 'in_progress'].includes(String(i.status || '')));
  if (open) return 'Complete / finalize interview';
  if (!props.latestPreScreen) return 'Generate pre-screen report';
  return 'Review and advance stage';
});

const highlights = computed(() =>
  buildOverviewHighlights({
    preScreenReportText: props.latestPreScreen?.report_text || '',
    resumeSummaryBullets: props.summaryBullets || []
  })
);

const flags = computed(() => {
  const extra = [];
  const hints = props.resumeSummary?.summary?.credentialingHints || {};
  if (hints.needsSupervision === true) extra.push('May need supervision (from resume hints)');
  if (hints.likelyLicensureStatus && hints.likelyLicensureStatus !== 'licensed') {
    extra.push(`Licensure signal: ${hints.likelyLicensureStatus}`);
  }
  const stage = String(props.profile?.stage || '').toLowerCase();
  if (stage === 'applied') extra.push('Still in Applied — move to Review when ready');
  if (!props.latestPreScreen) extra.push('No pre-screen report yet');
  return buildOverviewFlags({
    preScreenReportText: props.latestPreScreen?.report_text || '',
    extraFlags: extra
  });
});
</script>

<style scoped>
.cov { display: flex; flex-direction: column; gap: 12px; }
.cov-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.cov-grid--2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.cov-card {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 14px;
  background: #fff;
}
.cov-card h4 { margin: 0 0 10px; font-size: 0.95rem; }
.cov-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.cov-card-head h4 { margin: 0; }
.cov-kv {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 13px;
  padding: 4px 0;
  border-bottom: 1px solid #f1f5f9;
}
.cov-kv span { color: #64748b; }
.cov-kv strong { text-align: right; font-weight: 600; color: #0f172a; }
.cov-score { margin-bottom: 8px; }
.cov-score-value { font-size: 1.6rem; font-weight: 700; color: #0f172a; }
.cov-score-meta { color: #64748b; font-size: 0.9rem; }
.cov-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.cov-list {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}
.cov-flags li { color: #9a3412; }
.linkish {
  border: 0;
  background: none;
  color: #5b21b6;
  cursor: pointer;
  font-size: 12px;
  text-decoration: underline;
  padding: 0;
}
.muted { color: #64748b; }
.small { font-size: 12px; }
@media (max-width: 960px) {
  .cov-grid, .cov-grid--2 { grid-template-columns: 1fr; }
}
</style>
