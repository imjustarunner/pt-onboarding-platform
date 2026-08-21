<template>
  <div class="hd-root container">
    <div class="hd-header">
      <div>
        <h2 class="hd-title">Welcome back{{ firstName ? `, ${firstName}` : '' }}</h2>
        <p class="hd-subtitle">Here’s what’s happening with your hiring today.</p>
      </div>
      <div class="hd-header-actions">
        <div v-if="canChooseAgency" class="hd-agency-picker">
          <label class="hd-label">Agency</label>
          <select v-model="selectedAgencyId" class="input">
            <option v-for="a in agencyChoices" :key="a.id" :value="String(a.id)">{{ a.name }}</option>
          </select>
        </div>
        <input
          v-model="searchQ"
          class="input hd-search"
          placeholder="Search applicants…"
          @keyup.enter="goApplicants({ q: searchQ })"
        />
        <button type="button" class="btn btn-secondary" :disabled="loading" @click="load">
          Refresh
        </button>
        <button type="button" class="btn btn-primary" @click="goApplicants()">
          View applications
        </button>
      </div>
    </div>

    <div v-if="error" class="hd-error">{{ error }}</div>

    <div class="hd-kpi-row">
      <button type="button" class="hd-kpi" @click="goCareers">
        <div class="hd-kpi-icon" aria-hidden="true">💼</div>
        <div class="hd-kpi-body">
          <div class="hd-kpi-label">Open Jobs</div>
          <div class="hd-kpi-value">{{ loading ? '—' : stats.openJobs }}</div>
          <div class="hd-kpi-meta">Active postings</div>
        </div>
      </button>
      <button type="button" class="hd-kpi" @click="goApplicants()">
        <div class="hd-kpi-icon" aria-hidden="true">👥</div>
        <div class="hd-kpi-body">
          <div class="hd-kpi-label">Total Applications</div>
          <div class="hd-kpi-value">{{ loading ? '—' : stats.totalApplicants }}</div>
          <div class="hd-kpi-meta">Active pipeline</div>
        </div>
      </button>
      <button type="button" class="hd-kpi" @click="goApplicants()">
        <div class="hd-kpi-icon" aria-hidden="true">📋</div>
        <div class="hd-kpi-body">
          <div class="hd-kpi-label">Pending Reviews</div>
          <div class="hd-kpi-value">{{ loading ? '—' : stats.pendingReviews }}</div>
          <div class="hd-kpi-meta">Applied + review</div>
        </div>
      </button>
      <button type="button" class="hd-kpi" @click="goInterviewHub">
        <div class="hd-kpi-icon" aria-hidden="true">📅</div>
        <div class="hd-kpi-body">
          <div class="hd-kpi-label">Upcoming Interviews</div>
          <div class="hd-kpi-value">{{ loading ? '—' : stats.upcomingInterviewsCount }}</div>
          <div class="hd-kpi-meta">Next 7 days</div>
        </div>
      </button>
      <button type="button" class="hd-kpi" @click="goApplicants({ stage: 'offered' })">
        <div class="hd-kpi-icon" aria-hidden="true">🏅</div>
        <div class="hd-kpi-body">
          <div class="hd-kpi-label">Offers Extended</div>
          <div class="hd-kpi-value">{{ loading ? '—' : (stats.stageCounts?.offered || 0) }}</div>
          <div class="hd-kpi-meta">Awaiting decision</div>
        </div>
      </button>
    </div>

    <div class="hd-mid">
      <section class="hd-card">
        <div class="hd-card-head">
          <h3>Pending Jobs</h3>
          <button type="button" class="linkish" @click="goCareers">View all jobs</button>
        </div>
        <div v-if="loading" class="hd-muted">Loading jobs…</div>
        <div v-else-if="!(stats.jobs || []).length" class="hd-muted">No active jobs yet.</div>
        <ul v-else class="hd-job-list">
          <li v-for="j in stats.jobs.slice(0, 6)" :key="j.id">
            <button type="button" class="hd-job-row" @click="goApplicants({ jobDescriptionId: j.id })">
              <div class="hd-job-title">{{ j.title }}</div>
              <div class="hd-job-meta">
                <span>{{ j.applicantCount }} applicant{{ j.applicantCount === 1 ? '' : 's' }}</span>
                <span v-if="j.newForMeCount > 0" class="hd-badge">{{ j.newForMeCount }} new</span>
              </div>
            </button>
          </li>
        </ul>
        <div v-if="closingSoonCount > 0" class="hd-warn">
          {{ closingSoonCount }} job{{ closingSoonCount === 1 ? '' : 's' }} closing within 14 days.
        </div>
      </section>

      <section class="hd-card">
        <div class="hd-card-head">
          <h3>Upcoming Interviews</h3>
          <button type="button" class="linkish" @click="goInterviewHub">View calendar</button>
        </div>
        <div v-if="loading" class="hd-muted">Loading interviews…</div>
        <div v-else-if="!(stats.upcomingInterviews || []).length" class="hd-muted">No interviews in the next 7 days.</div>
        <ul v-else class="hd-iv-list">
          <li v-for="iv in stats.upcomingInterviews" :key="iv.id">
            <button type="button" class="hd-iv-row" @click="goCandidate(iv.candidateUserId)">
              <div class="hd-avatar">{{ initials(iv.firstName, iv.lastName) }}</div>
              <div class="hd-iv-body">
                <div class="hd-iv-name">{{ iv.firstName }} {{ iv.lastName }}</div>
                <div class="hd-iv-meta">{{ iv.jobTitle || 'Interview' }} · {{ formatWhen(iv.startsAt) }}</div>
              </div>
              <span class="hd-badge hd-badge--soft">{{ relativeWhen(iv.startsAt) }}</span>
            </button>
          </li>
        </ul>
      </section>

      <section class="hd-card">
        <div class="hd-card-head">
          <h3>Pipeline Snapshot</h3>
          <button type="button" class="linkish" @click="goApplicants()">View applications</button>
        </div>
        <div v-if="loading" class="hd-muted">Loading pipeline…</div>
        <div v-else class="hd-pipeline">
          <div v-for="p in stats.pipeline || []" :key="p.stage" class="hd-pipe-row">
            <button type="button" class="hd-pipe-btn" @click="goApplicants({ stage: p.stage })">
              <div class="hd-pipe-top">
                <span>{{ p.label }}</span>
                <strong>{{ p.count }}</strong>
              </div>
              <div class="hd-pipe-track">
                <div class="hd-pipe-fill" :style="{ width: pipeWidth(p.count) }" />
              </div>
            </button>
          </div>
        </div>
      </section>
    </div>

    <div class="hd-bottom">
      <section class="hd-card hd-card--wide">
        <div class="hd-card-head">
          <h3>Applicant Pipeline</h3>
          <span class="hd-muted small">Active conversion view</span>
        </div>
        <div v-if="loading" class="hd-muted">Loading…</div>
        <div v-else class="hd-funnel">
          <div
            v-for="(p, idx) in (stats.pipeline || [])"
            :key="`funnel-${p.stage}`"
            class="hd-funnel-step"
            :style="{ width: funnelWidth(idx) }"
          >
            <div class="hd-funnel-label">{{ p.label }}</div>
            <div class="hd-funnel-count">{{ p.count }}</div>
          </div>
        </div>
        <div class="hd-conversion" v-if="!loading">
          <div class="hd-conversion-value">{{ conversionRate }}%</div>
          <div class="hd-conversion-meta">Applied → Hired conversion</div>
        </div>
      </section>

      <section class="hd-card">
        <div class="hd-card-head">
          <h3>Recent Activity</h3>
          <button type="button" class="linkish" @click="goApplicants()">View all</button>
        </div>
        <div v-if="loading" class="hd-muted">Loading activity…</div>
        <div v-else-if="!(stats.recentApplicants || []).length" class="hd-muted">No recent applicants.</div>
        <ul v-else class="hd-activity">
          <li v-for="a in stats.recentApplicants" :key="a.id">
            <button type="button" class="hd-activity-row" @click="goCandidate(a.id)">
              <span class="hd-dot" :class="activityDotClass(a.stage)" />
              <div>
                <div class="hd-activity-title">
                  New application from {{ a.firstName }} {{ a.lastName }}
                </div>
                <div class="hd-activity-meta">
                  {{ a.jobTitle || 'Applicant' }} · {{ a.stageLabel }} · {{ relativeWhen(a.createdAt) }}
                </div>
              </div>
            </button>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api';

const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const route = useRoute();
const router = useRouter();

const loading = ref(false);
const error = ref('');
const searchQ = ref('');
const stats = ref({
  openJobs: 0,
  totalApplicants: 0,
  pendingReviews: 0,
  upcomingInterviewsCount: 0,
  stageCounts: {},
  jobs: [],
  upcomingInterviews: [],
  recentApplicants: [],
  pipeline: []
});

const firstName = computed(() => String(authStore.user?.firstName || authStore.user?.first_name || '').trim());

const agencyChoices = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  const base = role === 'super_admin'
    ? (Array.isArray(agencyStore.agencies) ? agencyStore.agencies : [])
    : (Array.isArray(agencyStore.userAgencies) ? agencyStore.userAgencies : []);
  return (base || [])
    .filter((o) => String(o?.organization_type || 'agency').toLowerCase() === 'agency')
    .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
});

const canChooseAgency = computed(() => (agencyChoices.value || []).length > 1);
const selectedAgencyId = ref('');
const agencyStorageKey = computed(() => `hiring_selected_agency_v1_${authStore.user?.id || 'anon'}`);

const effectiveAgencyId = computed(() => {
  const chosen = selectedAgencyId.value ? parseInt(String(selectedAgencyId.value), 10) : null;
  if (chosen) return chosen;
  const a = agencyStore.currentAgency?.value || agencyStore.currentAgency;
  if (a?.id) return a.id;
  if (authStore.user?.agencyId) return authStore.user.agencyId;
  const ids = Array.isArray(authStore.user?.agencyIds) ? authStore.user.agencyIds : [];
  if (ids.length > 0) return ids[0];
  return null;
});

const orgPath = (path) => {
  const slug = String(route.params?.organizationSlug || '').trim();
  if (!slug) return path;
  return `/${slug}${path}`;
};

const maxPipe = computed(() => {
  const nums = (stats.value.pipeline || []).map((p) => Number(p.count) || 0);
  return Math.max(1, ...nums);
});

const closingSoonCount = computed(() => {
  const now = Date.now();
  const twoWeeks = 14 * 24 * 60 * 60 * 1000;
  return (stats.value.jobs || []).filter((j) => {
    if (!j.applicationDeadline) return false;
    const t = new Date(j.applicationDeadline).getTime();
    return Number.isFinite(t) && t >= now && t - now <= twoWeeks;
  }).length;
});

const conversionRate = computed(() => {
  const applied = Number(stats.value.stageCounts?.applied || 0)
    + Number(stats.value.stageCounts?.review || 0)
    + Number(stats.value.stageCounts?.interview || 0)
    + Number(stats.value.stageCounts?.offered || 0)
    + Number(stats.value.stageCounts?.hired || 0);
  const hired = Number(stats.value.stageCounts?.hired || 0);
  if (!applied) return '0.0';
  return ((hired / applied) * 100).toFixed(1);
});

function pipeWidth(count) {
  return `${Math.max(6, Math.round((Number(count) || 0) / maxPipe.value * 100))}%`;
}

function funnelWidth(idx) {
  const widths = ['100%', '82%', '64%', '46%', '32%'];
  return widths[idx] || '40%';
}

function initials(first, last) {
  const a = String(first || '').trim().charAt(0);
  const b = String(last || '').trim().charAt(0);
  return `${a}${b}`.toUpperCase() || '?';
}

function formatWhen(raw) {
  if (!raw) return '';
  try {
    return new Date(raw).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return '';
  }
}

function relativeWhen(raw) {
  if (!raw) return '';
  try {
    const t = new Date(raw).getTime();
    const diff = t - Date.now();
    const abs = Math.abs(diff);
    const mins = Math.round(abs / 60000);
    if (mins < 60) return diff >= 0 ? `In ${mins}m` : `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 36) return diff >= 0 ? (hours <= 2 ? `In ${hours}h` : 'Tomorrow') : `${hours}h ago`;
    const days = Math.round(hours / 24);
    return diff >= 0 ? `In ${days}d` : `${days}d ago`;
  } catch {
    return '';
  }
}

function activityDotClass(stage) {
  const s = String(stage || '').toLowerCase();
  if (s === 'hired') return 'hd-dot--green';
  if (s === 'interview' || s === 'offered') return 'hd-dot--purple';
  if (s === 'not_hired') return 'hd-dot--red';
  return 'hd-dot--blue';
}

function goApplicants(opts = {}) {
  const query = {};
  if (opts.q) query.q = opts.q;
  if (opts.stage) query.stage = opts.stage;
  if (opts.jobDescriptionId) query.jobDescriptionId = String(opts.jobDescriptionId);
  if (effectiveAgencyId.value) query.agencyId = String(effectiveAgencyId.value);
  router.push({ path: orgPath('/admin/hiring/applicants'), query });
}

function goCandidate(userId) {
  if (!userId) return;
  router.push({
    path: orgPath('/admin/hiring/applicants'),
    query: {
      candidateId: String(userId),
      ...(effectiveAgencyId.value ? { agencyId: String(effectiveAgencyId.value) } : {})
    }
  });
}

function goCareers() {
  router.push(orgPath('/admin/careers'));
}

function goInterviewHub() {
  router.push(orgPath('/admin/interview-hub'));
}

async function load() {
  if (!effectiveAgencyId.value) {
    error.value = 'Select an agency to view hiring stats.';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const r = await api.get('/hiring/dashboard', { params: { agencyId: effectiveAgencyId.value } });
    stats.value = {
      openJobs: r.data?.openJobs || 0,
      totalApplicants: r.data?.totalApplicants || 0,
      pendingReviews: r.data?.pendingReviews || 0,
      upcomingInterviewsCount: r.data?.upcomingInterviewsCount || 0,
      stageCounts: r.data?.stageCounts || {},
      jobs: r.data?.jobs || [],
      upcomingInterviews: r.data?.upcomingInterviews || [],
      recentApplicants: r.data?.recentApplicants || [],
      pipeline: r.data?.pipeline || []
    };
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load hiring dashboard';
  } finally {
    loading.value = false;
  }
}

watch(
  () => selectedAgencyId.value,
  (v) => {
    try {
      const raw = String(v || '').trim();
      if (raw) localStorage.setItem(agencyStorageKey.value, raw);
    } catch {
      // ignore
    }
    load();
  }
);

watch(
  () => effectiveAgencyId.value,
  (id, prev) => {
    if (id && id !== prev) load();
  }
);

onMounted(() => {
  try {
    const saved = localStorage.getItem(agencyStorageKey.value);
    if (saved && (agencyChoices.value || []).some((a) => String(a.id) === String(saved))) {
      selectedAgencyId.value = String(saved);
    } else if (effectiveAgencyId.value) {
      selectedAgencyId.value = String(effectiveAgencyId.value);
    }
  } catch {
    if (effectiveAgencyId.value) selectedAgencyId.value = String(effectiveAgencyId.value);
  }
  load();
});
</script>

<style scoped>
.hd-root {
  padding-bottom: 40px;
}
.hd-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 20px;
  flex-wrap: wrap;
}
.hd-title {
  margin: 0;
  font-size: 1.6rem;
}
.hd-subtitle {
  margin: 4px 0 0;
  color: #64748b;
}
.hd-header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.hd-agency-picker {
  display: flex;
  gap: 6px;
  align-items: center;
}
.hd-label {
  font-size: 0.8rem;
  color: #64748b;
}
.hd-search {
  min-width: 200px;
}
.hd-error {
  background: #fef2f2;
  color: #b91c1c;
  border: 1px solid #fecaca;
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 14px;
}
.hd-kpi-row {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}
.hd-kpi {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  text-align: left;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 14px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  cursor: pointer;
}
.hd-kpi:hover {
  border-color: #c4b5fd;
  box-shadow: 0 4px 14px rgba(124, 58, 237, 0.08);
}
.hd-kpi-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: #f5f3ff;
  display: grid;
  place-items: center;
}
.hd-kpi-label {
  font-size: 0.78rem;
  color: #64748b;
}
.hd-kpi-value {
  font-size: 1.55rem;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.1;
  margin-top: 2px;
}
.hd-kpi-meta {
  font-size: 0.75rem;
  color: #94a3b8;
  margin-top: 2px;
}
.hd-mid,
.hd-bottom {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}
.hd-bottom {
  grid-template-columns: 1.4fr 1fr;
}
.hd-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 14px 16px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  min-height: 220px;
}
.hd-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.hd-card-head h3 {
  margin: 0;
  font-size: 1rem;
}
.hd-muted {
  color: #94a3b8;
}
.small {
  font-size: 0.8rem;
}
.linkish {
  background: none;
  border: none;
  color: #7c3aed;
  cursor: pointer;
  padding: 0;
  font-size: 0.85rem;
}
.hd-job-list,
.hd-iv-list,
.hd-activity {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.hd-job-row,
.hd-iv-row,
.hd-activity-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
  background: #f8fafc;
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 10px;
  cursor: pointer;
}
.hd-job-row:hover,
.hd-iv-row:hover,
.hd-activity-row:hover {
  border-color: #ddd6fe;
  background: #f5f3ff;
}
.hd-job-title,
.hd-iv-name,
.hd-activity-title {
  font-weight: 600;
  color: #0f172a;
}
.hd-job-meta,
.hd-iv-meta,
.hd-activity-meta {
  font-size: 0.8rem;
  color: #64748b;
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.hd-badge {
  background: #ede9fe;
  color: #6d28d9;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 0.72rem;
  font-weight: 600;
  white-space: nowrap;
}
.hd-badge--soft {
  background: #f3e8ff;
}
.hd-warn {
  margin-top: 12px;
  color: #b91c1c;
  font-size: 0.85rem;
}
.hd-avatar {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  background: linear-gradient(135deg, #8b5cf6, #6366f1);
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 0.75rem;
  font-weight: 700;
  flex-shrink: 0;
}
.hd-iv-body {
  flex: 1;
  min-width: 0;
}
.hd-pipeline {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.hd-pipe-btn {
  width: 100%;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  text-align: left;
}
.hd-pipe-top {
  display: flex;
  justify-content: space-between;
  font-size: 0.85rem;
  margin-bottom: 4px;
  color: #334155;
}
.hd-pipe-track {
  height: 8px;
  background: #f1f5f9;
  border-radius: 999px;
  overflow: hidden;
}
.hd-pipe-fill {
  height: 100%;
  background: linear-gradient(90deg, #8b5cf6, #6366f1);
  border-radius: 999px;
}
.hd-funnel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
}
.hd-funnel-step {
  background: linear-gradient(90deg, #7c3aed, #6366f1);
  color: #fff;
  border-radius: 10px;
  padding: 10px 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.hd-funnel-label {
  font-weight: 600;
}
.hd-funnel-count {
  font-weight: 700;
}
.hd-conversion {
  margin-top: 14px;
  background: #f8fafc;
  border-radius: 10px;
  padding: 12px;
  display: inline-flex;
  flex-direction: column;
}
.hd-conversion-value {
  font-size: 1.4rem;
  font-weight: 700;
  color: #0f172a;
}
.hd-conversion-meta {
  font-size: 0.8rem;
  color: #64748b;
}
.hd-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #94a3b8;
  flex-shrink: 0;
  margin-top: 5px;
}
.hd-dot--blue { background: #3b82f6; }
.hd-dot--purple { background: #8b5cf6; }
.hd-dot--green { background: #22c55e; }
.hd-dot--red { background: #ef4444; }

@media (max-width: 1100px) {
  .hd-kpi-row {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .hd-mid,
  .hd-bottom {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 700px) {
  .hd-kpi-row {
    grid-template-columns: 1fr;
  }
}
</style>
