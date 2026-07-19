<template>
  <div class="pthq">
    <aside class="pthq-sidebar">
      <div class="pthq-brand">
        <div class="pthq-mark">PT</div>
        <div>
          <div class="pthq-brand-name">Plot Twist HQ</div>
          <div class="pthq-brand-sub">Platform Control</div>
        </div>
      </div>

      <nav class="pthq-nav">
        <div class="pthq-nav-section">Workspace</div>
        <button
          type="button"
          class="pthq-nav-item"
          :class="{ active: panel === 'schedule' }"
          data-tour="pthq-nav-schedule"
          @click="setPanel('schedule')"
        >
          Schedule
        </button>

        <div class="pthq-nav-section">Tenant Management</div>
        <button type="button" class="pthq-nav-item" :class="{ active: panel === 'overview' }" @click="setPanel('overview')">Overview</button>
        <button type="button" class="pthq-nav-item" :class="{ active: panel === 'tenants' }" @click="setPanel('tenants')">Organizations</button>
        <button type="button" class="pthq-nav-item" :class="{ active: panel === 'individuals' }" @click="setPanel('individuals')">Individuals</button>
        <router-link class="pthq-nav-item" to="/admin/settings?tab=agencies">Manage Organizations</router-link>

        <div class="pthq-nav-section">User Management</div>
        <router-link class="pthq-nav-item" to="/admin/users">Users</router-link>
        <router-link class="pthq-nav-item" to="/tickets?mine=1&status=open">Support Tickets</router-link>

        <div class="pthq-nav-section">System</div>
        <router-link class="pthq-nav-item" to="/admin/settings">Platform Settings</router-link>
        <router-link class="pthq-nav-item" to="/admin/audit-center">Audit Center</router-link>
        <router-link class="pthq-nav-item" to="/admin/modules">Modules</router-link>

        <div class="pthq-nav-section">Developer &amp; Testing</div>
        <button type="button" class="pthq-nav-item" :class="{ active: panel === 'testing' }" @click="setPanel('testing')">
          Testing Interface
          <span class="pthq-new">NEW</span>
        </button>
        <button type="button" class="pthq-nav-item" :class="{ active: panel === 'sandbox' }" @click="setPanel('sandbox')">Sandbox Tenants</button>
      </nav>

      <div class="pthq-sidebar-foot">
        <div class="pthq-user-mini">
          <div class="pthq-avatar">{{ userInitials }}</div>
          <div>
            <div class="pthq-user-name">{{ userName }}</div>
            <div class="pthq-user-role">Super Administrator</div>
          </div>
        </div>
        <button type="button" class="pthq-classic" @click="goClassic">Classic dashboard</button>
      </div>
    </aside>

    <div class="pthq-main">
      <header class="pthq-top" :class="{ 'pthq-top--schedule': panel === 'schedule' }">
        <div>
          <h1>{{ headerTitle }}</h1>
          <p class="pthq-top-sub">{{ headerSubtitle }}</p>
        </div>
        <div class="pthq-top-right">
          <template v-if="panel === 'schedule'">
            <router-link class="pthq-top-link" to="/schedule" title="Schedule hub">Schedule hub</router-link>
            <router-link class="pthq-top-link" to="/schedule/staff" title="Compare staff calendars">Staff schedules</router-link>
            <router-link class="pthq-top-link" to="/buildings/schedule" title="Office &amp; room booking">Buildings</router-link>
          </template>
          <div v-else class="pthq-search">Search tenants, users, settings…</div>
          <span class="pthq-pill">SUPER ADMIN</span>
        </div>
      </header>

      <!-- Platform schedule: available immediately (no telemetry gate) -->
      <section v-if="panel === 'schedule'" class="pthq-panel pthq-panel--schedule" data-tour="pthq-schedule-panel">
        <div class="pthq-schedule-shell">
          <div class="pthq-schedule-toolbar">
            <WorkHoursEditor
              v-if="authStore.user?.id"
              class="pthq-schedule-work-hours"
              :user-id="Number(authStore.user.id)"
            />
            <p class="pthq-schedule-hint muted">
              Your calendar across tenants — peers overlay, staff compare, and office bookings.
            </p>
          </div>
          <div v-if="!authStore.user?.id" class="muted">Sign in to view your schedule.</div>
          <ScheduleAvailabilityGrid
            v-else
            :user-id="Number(authStore.user.id)"
            mode="self"
            :compact-page-chrome="true"
            :platform-theme="true"
            :week-start-ymd="weekStartYmd || null"
            :show-skill-builders-programs-button="true"
            :show-company-events-calendar-button="true"
            @update:weekStartYmd="onWeekStartUpdate"
          />
        </div>
      </section>

      <div v-else-if="loading" class="pthq-loading">Loading platform telemetry…</div>
      <div v-else-if="error" class="pthq-error">{{ error }}</div>

      <template v-else>
        <!-- Overview -->
        <section v-if="panel === 'overview'" class="pthq-panel">
          <div class="pthq-kpi-row">
            <article class="pthq-kpi">
              <div class="k-label">Organizations</div>
              <div class="k-value">{{ segmentCounts.organization }}</div>
              <div class="k-meta">Billable / usage-tracked companies</div>
            </article>
            <article class="pthq-kpi">
              <div class="k-label">Individuals</div>
              <div class="k-value">{{ segmentCounts.individual }}</div>
              <div class="k-meta">Solo coaches &amp; consultants</div>
            </article>
            <article class="pthq-kpi">
              <div class="k-label">Active Users</div>
              <div class="k-value">{{ stats.activeUsers }}</div>
              <div class="k-meta up">ACTIVE_EMPLOYEE across platform</div>
            </article>
            <article class="pthq-kpi">
              <div class="k-label">Sandbox demos</div>
              <div class="k-value">{{ segmentCounts.sandbox }}</div>
              <div class="k-meta">Excluded from usage totals</div>
            </article>
          </div>

          <div class="pthq-grid-2">
            <article class="pthq-card">
              <div class="pthq-card-head">
                <h2>Root tenants</h2>
                <span class="muted">Billable / individual accounts</span>
              </div>
              <div class="pthq-dist">
                <div class="donut" :style="rootDonutStyle" />
                <ul>
                  <li v-for="row in rootDistributionRows" :key="row.key">
                    <span class="dot" :style="{ background: row.color }" />
                    {{ row.label }}
                    <strong>{{ row.count }}</strong>
                    <em>{{ row.pct }}%</em>
                  </li>
                </ul>
              </div>
            </article>

            <article class="pthq-card">
              <div class="pthq-card-head">
                <h2>Scoped sub-organizations</h2>
                <span class="muted">Affiliated under a tenant — not separate billable accounts</span>
              </div>
              <div class="pthq-dist">
                <div class="donut" :style="subOrgDonutStyle" />
                <ul>
                  <li v-for="row in subOrgDistributionRows" :key="row.key">
                    <span class="dot" :style="{ background: row.color }" />
                    {{ row.label }}
                    <strong>{{ row.count }}</strong>
                    <em>{{ row.pct }}%</em>
                  </li>
                  <li v-if="!subOrgDistributionRows.length" class="muted-row">
                    No affiliated schools / programs yet.
                  </li>
                </ul>
              </div>
              <p class="dist-footnote">
                Example: schools are managed inside a parent tenant (today mostly ITSCO), not platform-level tenants.
              </p>
            </article>
          </div>

          <div class="pthq-grid-2" style="margin-top: 1rem;">
            <article class="pthq-card launch-card" style="grid-column: 1 / -1;">
              <div class="pthq-card-head">
                <h2>Testing Interface</h2>
                <span class="pthq-new">NEW</span>
              </div>
              <p>Full testing environment for demo tenants — isolated windows, role switching, no session collision.</p>
              <button type="button" class="pthq-cta" @click="setPanel('testing')">Launch Testing Interface →</button>
            </article>
          </div>

          <div class="pthq-grid-main">
            <article class="pthq-card">
              <div class="pthq-card-head">
                <h2>Top organizations by activity</h2>
                <input v-model="tenantSearch" type="search" class="pthq-inline-search" placeholder="Filter…" >
              </div>
              <div class="pthq-table-wrap">
                <table class="pthq-table">
                  <thead>
                    <tr>
                      <th>Tenant</th>
                      <th>Patients</th>
                      <th>Employees</th>
                      <th>Sub-orgs</th>
                      <th>Open</th>
                      <th>Notifs</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="t in topTenants" :key="t.id">
                      <td>
                        <div class="t-name">{{ t.name }}</div>
                        <div class="t-slug">{{ t.slug || t.portal_url }}</div>
                      </td>
                      <td>{{ t.activePatients ?? '—' }}</td>
                      <td>{{ t.activeEmployees ?? '—' }}</td>
                      <td>
                        <span class="suborg-pill" :title="subOrgBreakdownTitle(t)">{{ subOrgSummary(t) }}</span>
                      </td>
                      <td>{{ t.openTasks ?? '—' }}</td>
                      <td>{{ t.unreadNotifications ?? '—' }}</td>
                      <td>
                        <div class="pthq-open-btns">
                          <button type="button" class="pthq-mini-btn" @click="openTenant(t, 'new')">Open New →</button>
                          <button type="button" class="pthq-mini-btn ghost" @click="openTenant(t, 'classic')">Classic</button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </article>

            <aside class="pthq-side-stack">
              <article class="pthq-card">
                <div class="pthq-card-head"><h2>Quick actions</h2></div>
                <div class="pthq-qa-grid">
                  <button type="button" @click="setPanel('schedule')">Schedule</button>
                  <router-link to="/admin/settings?tab=agencies">Add Tenant</router-link>
                  <button type="button" @click="setPanel('testing')">Impersonate / Demo</button>
                  <router-link to="/admin/settings">Feature Flags</router-link>
                  <router-link to="/admin/audit-center">Audit Logs</router-link>
                  <router-link to="/admin/users">Users</router-link>
                  <router-link to="/admin/modules">Modules</router-link>
                </div>
              </article>
              <article class="pthq-card">
                <div class="pthq-card-head"><h2>System overview</h2></div>
                <ul class="pthq-sys">
                  <li><span>Organizations</span><strong>{{ segmentCounts.organization }}</strong></li>
                  <li><span>Individuals</span><strong>{{ segmentCounts.individual }}</strong></li>
                  <li><span>Sandbox (excluded)</span><strong>{{ segmentCounts.sandbox }}</strong></li>
                  <li><span>Schools (scoped)</span><strong>{{ Number(subOrgTotals.school || 0) }}</strong></li>
                  <li><span>Modules</span><strong>{{ stats.totalModules }}</strong></li>
                  <li><span>Refreshed</span><strong>{{ refreshedAtLabel }}</strong></li>
                </ul>
              </article>
            </aside>
          </div>
        </section>

        <!-- Organizations / Individuals / Sandbox -->
        <section v-else-if="panel === 'tenants' || panel === 'individuals' || panel === 'sandbox'" class="pthq-panel">
          <div class="pthq-card-head row">
            <div>
              <h2>{{ panelTitle }} ({{ filteredTenants.length }})</h2>
              <p class="muted">{{ panelSubtitle }}</p>
            </div>
            <input v-model="tenantSearch" type="search" class="pthq-inline-search" placeholder="Search…" >
          </div>
          <div class="pthq-tenant-grid">
            <article v-for="t in filteredTenants" :key="t.id" class="pthq-tenant-card">
              <div class="t-badges">
                <span v-if="t.tenantSegment === 'individual'" class="seg individual">Individual</span>
                <span v-else-if="t.tenantSegment === 'sandbox'" class="seg sandbox">Sandbox</span>
                <span v-else class="seg org">Organization</span>
                <span class="seg type">{{ displayOrgType(t) }}</span>
              </div>
              <div class="t-name">{{ t.name }}</div>
              <div class="t-slug">{{ t.slug || t.portal_url }}</div>
              <div class="t-metrics">
                <div><span>Patients / Clients</span><strong>{{ t.activePatients ?? '—' }}</strong></div>
                <div><span>Employees</span><strong>{{ t.activeEmployees ?? '—' }}</strong></div>
                <div><span>Sub-orgs</span><strong>{{ Number(t.subOrganizations?.total || 0) }}</strong></div>
                <div><span>Notifs</span><strong>{{ t.unreadNotifications ?? '—' }}</strong></div>
              </div>
              <p v-if="Number(t.subOrganizations?.total || 0) > 0" class="t-hint">
                {{ subOrgBreakdownTitle(t) }}
              </p>
              <p v-if="t.tenantSegment === 'individual'" class="t-hint">
                Becomes an Organization when active employees &gt; 1.
              </p>
              <div class="pthq-open-btns">
                <button type="button" class="pthq-mini-btn" @click.stop="openTenant(t, 'new')">Open as Admin (New) →</button>
                <button type="button" class="pthq-mini-btn ghost" @click.stop="openTenant(t, 'classic')">Classic</button>
              </div>
            </article>
          </div>
          <p v-if="filteredTenants.length === 0" class="muted">No tenants in this segment.</p>
        </section>

        <!-- Testing -->
        <section v-else-if="panel === 'testing'" class="pthq-panel">
          <div class="pthq-card-head row">
            <div>
              <h2>Testing Interface</h2>
              <p class="muted">Platform-only. Launches isolated windows so your superadmin session stays put.</p>
            </div>
            <button type="button" class="pthq-ghost" @click="setPanel('overview')">← Back to overview</button>
          </div>
          <SuperadminDemoTestingLab />
        </section>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import { useBrandingStore } from '../../store/branding';
import api from '../../services/api';
import SuperadminDemoTestingLab from '../../components/admin/SuperadminDemoTestingLab.vue';
import ScheduleAvailabilityGrid from '../../components/schedule/ScheduleAvailabilityGrid.vue';
import WorkHoursEditor from '../../components/schedule/WorkHoursEditor.vue';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const brandingStore = useBrandingStore();

const VALID_PANELS = new Set(['overview', 'schedule', 'tenants', 'individuals', 'sandbox', 'testing']);
const panelFromQuery = () => {
  const q = String(route.query.panel || 'overview').trim().toLowerCase();
  return VALID_PANELS.has(q) ? q : 'overview';
};
const panel = ref(panelFromQuery());
const loading = ref(true);
const error = ref('');
const tenantSearch = ref('');
const agencies = ref([]);
const rootTypeCounts = ref({ agency: 0, learning: 0, life_coach: 0, consultant: 0, clubwebapp: 0, other: 0 });
const subOrgTotals = ref({ school: 0, program: 0, learning: 0, clinical: 0, affiliation: 0, other: 0, total: 0 });
const stats = ref({
  totalAgencies: 0,
  activeUsers: 0,
  trainingFocusTemplates: 0,
  totalModules: 0
});
const myOpenTickets = ref('—');
const refreshedAt = ref(null);
const weekStartYmd = ref('');

const setPanel = (next) => {
  const p = VALID_PANELS.has(String(next || '')) ? String(next) : 'overview';
  panel.value = p;
};

const onWeekStartUpdate = (ymd) => {
  const next = String(ymd || '').slice(0, 10);
  if (next) weekStartYmd.value = next;
};

watch(panel, (p) => {
  const current = String(route.query.panel || 'overview');
  if (current === p) return;
  const query = { ...route.query };
  if (p === 'overview') delete query.panel;
  else query.panel = p;
  router.replace({ path: route.path, query }).catch(() => {});
});

watch(
  () => route.query.panel,
  () => {
    const next = panelFromQuery();
    if (next !== panel.value) panel.value = next;
  }
);

const userName = computed(() => {
  const u = authStore.user || {};
  return [u.firstName || u.first_name, u.lastName || u.last_name].filter(Boolean).join(' ') || u.email || 'Super Admin';
});
const userInitials = computed(() => {
  const parts = String(userName.value).split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || 'SA';
});
const headerTitle = computed(() => {
  if (panel.value === 'schedule') return 'Schedule';
  if (panel.value === 'testing') return 'Testing Interface';
  if (panel.value === 'tenants') return 'Organizations';
  if (panel.value === 'individuals') return 'Individual Practitioners';
  if (panel.value === 'sandbox') return 'Sandbox Tenants';
  return 'Superadmin Dashboard Overview';
});
const headerSubtitle = computed(() => {
  if (panel.value === 'schedule') {
    return 'Platform calendar — book across tenants, overlay peers & staff, manage office holds';
  }
  return 'Platform-wide visibility across every tenant';
});

const panelTitle = computed(() => {
  if (panel.value === 'sandbox') return 'Sandbox / demo tenants';
  if (panel.value === 'individuals') return 'Individual practitioners';
  return 'Organizations';
});

const panelSubtitle = computed(() => {
  if (panel.value === 'sandbox') {
    return 'Demo accounts for the Testing Lab — not counted in organization usage/billing.';
  }
  if (panel.value === 'individuals') {
    return 'Solo life coaches & consultants (≤1 active employee). Graduate to Organizations when the team grows.';
  }
  return 'Company tenants tracked for usage and billing. Sandbox demos are excluded.';
});

const envLabel = computed(() => (import.meta.env.PROD ? 'Production' : 'Development'));
const refreshedAtLabel = computed(() => {
  if (!refreshedAt.value) return '—';
  try {
    return new Date(refreshedAt.value).toLocaleString();
  } catch {
    return '—';
  }
});

const isDemoish = (t) => {
  if (t?.isSandbox || t?.tenantSegment === 'sandbox') return true;
  const hay = `${t?.name || ''} ${t?.slug || ''} ${t?.portal_url || ''}`.toLowerCase();
  return ['demo', 'fake', 'sandbox', 'training', 'sample', 'test'].some((k) => hay.includes(k));
};

const classifyTenant = (t) => {
  if (t?.tenantSegment) return t.tenantSegment;
  if (isDemoish(t)) return 'sandbox';
  const org = String(t?.organizationType || t?.organization_type || 'agency').toLowerCase();
  const employees = Number(t?.activeEmployees || 0);
  if ((org === 'life_coach' || org === 'consultant') && employees <= 1) return 'individual';
  return 'organization';
};

const segmentCounts = computed(() => {
  const list = agencies.value || [];
  return {
    organization: list.filter((t) => classifyTenant(t) === 'organization').length,
    individual: list.filter((t) => classifyTenant(t) === 'individual').length,
    sandbox: list.filter((t) => classifyTenant(t) === 'sandbox').length
  };
});

const filteredTenants = computed(() => {
  let list = agencies.value || [];
  if (panel.value === 'sandbox') list = list.filter((t) => classifyTenant(t) === 'sandbox');
  else if (panel.value === 'individuals') list = list.filter((t) => classifyTenant(t) === 'individual');
  else if (panel.value === 'tenants') list = list.filter((t) => classifyTenant(t) === 'organization');
  const q = tenantSearch.value.trim().toLowerCase();
  if (!q) return list;
  return list.filter((a) =>
    String(a.name || '').toLowerCase().includes(q) ||
    String(a.slug || a.portal_url || '').toLowerCase().includes(q)
  );
});

const topTenants = computed(() => {
  // Overview table: organizations only (never sandbox / individuals mix-in)
  const orgs = (agencies.value || []).filter((t) => classifyTenant(t) === 'organization');
  const q = tenantSearch.value.trim().toLowerCase();
  const filtered = !q
    ? orgs
    : orgs.filter((a) =>
        String(a.name || '').toLowerCase().includes(q) ||
        String(a.slug || a.portal_url || '').toLowerCase().includes(q)
      );
  const scored = [...filtered].sort((a, b) => {
    const sa = Number(a.activeEmployees || 0) + Number(a.activePatients || 0) + Number(a.unreadNotifications || 0);
    const sb = Number(b.activeEmployees || 0) + Number(b.activePatients || 0) + Number(b.unreadNotifications || 0);
    return sb - sa;
  });
  return scored.slice(0, 8);
});

const displayOrgType = (t) => {
  const org = String(t?.organizationType || t?.organization_type || 'agency').replace('_', ' ');
  return org;
};

const ROOT_DIST_COLORS = {
  agency: '#a78bfa',
  learning: '#fbbf24',
  life_coach: '#6ee7b7',
  consultant: '#c4b5fd',
  clubwebapp: '#94a3b8',
  other: '#64748b'
};

const SUB_DIST_COLORS = {
  school: '#38bdf8',
  program: '#34d399',
  learning: '#fbbf24',
  clinical: '#fb7185',
  affiliation: '#a78bfa',
  other: '#64748b'
};

const pctRows = (counts, colors) => {
  const keys = Object.keys(colors);
  const total = keys.reduce((s, k) => s + Number(counts?.[k] || 0), 0);
  const denom = Math.max(1, total);
  return keys
    .map((key) => {
      const count = Number(counts?.[key] || 0);
      return {
        key,
        label: key.replace(/_/g, ' '),
        count,
        pct: Math.round((count / denom) * 100),
        color: colors[key]
      };
    })
    .filter((r) => r.count > 0);
};

const rootDistributionRows = computed(() => pctRows(rootTypeCounts.value, ROOT_DIST_COLORS));
const subOrgDistributionRows = computed(() => pctRows(subOrgTotals.value, SUB_DIST_COLORS));

const donutFromRows = (rows) => {
  const total = rows.reduce((s, r) => s + r.count, 0) || 1;
  let acc = 0;
  const parts = rows.map((r) => {
    const start = (acc / total) * 100;
    acc += r.count;
    const end = (acc / total) * 100;
    return `${r.color} ${start}% ${end}%`;
  });
  return {
    background: parts.length ? `conic-gradient(${parts.join(', ')})` : '#1e293b'
  };
};

const rootDonutStyle = computed(() => donutFromRows(rootDistributionRows.value));
const subOrgDonutStyle = computed(() => donutFromRows(subOrgDistributionRows.value));

const subOrgSummary = (t) => {
  const total = Number(t?.subOrganizations?.total || 0);
  if (!total) return '—';
  const schools = Number(t?.subOrganizations?.school || 0);
  if (schools && schools === total) return `${schools} school${schools === 1 ? '' : 's'}`;
  return String(total);
};

const subOrgBreakdownTitle = (t) => {
  const sub = t?.subOrganizations || {};
  const labels = {
    school: 'school',
    program: 'program',
    learning: 'learning',
    clinical: 'clinical',
    affiliation: 'affiliation',
    other: 'other'
  };
  const parts = Object.keys(labels)
    .map((k) => {
      const n = Number(sub[k] || 0);
      if (!n) return null;
      const label = labels[k];
      return `${n} ${label}${n === 1 ? '' : 's'}`;
    })
    .filter(Boolean);
  return parts.length ? parts.join(' · ') : 'No scoped sub-organizations';
};

const fetchAll = async () => {
  loading.value = true;
  error.value = '';
  try {
    if (!brandingStore.platformBranding) {
      await brandingStore.fetchPlatformBranding().catch(() => {});
    }
    const [agenciesRes, usersRes, modulesRes, templatesRes, ticketsRes] = await Promise.all([
      api.get('/agencies'),
      api.get('/users'),
      api.get('/modules'),
      api.get('/training-focuses/templates'),
      api.get('/support-tickets', { params: { mine: true, status: 'open' } }).catch(() => ({ data: [] }))
    ]);

    const rawOrgs = Array.isArray(agenciesRes.data) ? agenciesRes.data : [];
    const primaryAgencies = rawOrgs.filter((a) => {
      const t = String(a?.organization_type || 'agency').toLowerCase();
      return t === 'agency' || t === 'life_coach' || t === 'consultant' || t === 'learning' || t === 'clubwebapp';
    });

    myOpenTickets.value = String(Array.isArray(ticketsRes.data) ? ticketsRes.data.length : 0);

    let merged = primaryAgencies;
    try {
      const summaryRes = await api.get('/dashboard/platform-tenant-summary');
      refreshedAt.value = summaryRes.data?.refreshedAt || new Date().toISOString();
      const summaryTenants = Array.isArray(summaryRes.data?.tenants) ? summaryRes.data.tenants : [];
      const metricsById = Object.fromEntries(summaryTenants.map((t) => [t.id, t]));
      if (summaryRes.data?.rootTypeCounts) rootTypeCounts.value = { ...rootTypeCounts.value, ...summaryRes.data.rootTypeCounts };
      if (summaryRes.data?.subOrgTotals) subOrgTotals.value = { ...subOrgTotals.value, ...summaryRes.data.subOrgTotals };

      if (summaryTenants.length) {
        merged = summaryTenants.map((m) => {
          const base = primaryAgencies.find((a) => Number(a.id) === Number(m.id)) || {};
          return {
            ...base,
            ...m,
            organization_type: m.organizationType || base.organization_type,
            activePatients: m.activePatients ?? 0,
            activeEmployees: m.activeEmployees ?? 0,
            openTasks: m.openTasks ?? 0,
            unreadNotifications: m.unreadNotifications ?? 0,
            subOrganizations: m.subOrganizations || { total: 0 }
          };
        });
        for (const a of primaryAgencies) {
          if (!metricsById[Number(a.id)]) merged.push(a);
        }
      } else {
        merged = primaryAgencies;
      }
    } catch {
      refreshedAt.value = new Date().toISOString();
      // Fallback: root types only from /agencies (never count schools as tenants)
      const counts = { agency: 0, learning: 0, life_coach: 0, consultant: 0, clubwebapp: 0, other: 0 };
      for (const a of primaryAgencies) {
        if (isDemoish(a)) continue;
        const t = String(a?.organization_type || 'agency').toLowerCase();
        if (Object.prototype.hasOwnProperty.call(counts, t)) counts[t] += 1;
        else counts.other += 1;
      }
      rootTypeCounts.value = counts;
    }
    agencies.value = merged;

    const orgCount = merged.filter((t) => classifyTenant(t) === 'organization').length;
    stats.value = {
      totalAgencies: orgCount,
      activeUsers: (usersRes.data || []).filter((u) => String(u?.status || '').toUpperCase() === 'ACTIVE_EMPLOYEE').length,
      trainingFocusTemplates: Array.isArray(templatesRes.data) ? templatesRes.data.length : 0,
      totalModules: Array.isArray(modulesRes.data) ? modulesRes.data.length : 0
    };
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load platform dashboard';
  } finally {
    loading.value = false;
  }
};

const openTenant = (tenant, variant = 'new') => {
  if (!tenant) return;
  // Enter that tenant's admin context with full superadmin privileges.
  agencyStore.setCurrentAgency(tenant);
  const slug = String(tenant.slug || tenant.portal_url || '').toLowerCase().trim();
  if (!slug) return;
  // New unfinished tenant beta dashboard vs classic AgencyAdminDashboard
  if (variant === 'classic') {
    router.push(`/${slug}/admin`);
    return;
  }
  router.push(`/${slug}/admin-dashboard`);
};

const goClassic = () => {
  router.push({ path: '/admin', query: { classic: '1' } });
};

onMounted(fetchAll);
</script>

<style scoped>
.pthq {
  --bg: #070b14;
  --panel: #0f172a;
  --card: #111827;
  --line: rgba(148, 163, 184, 0.18);
  --text: #e5e7eb;
  --muted: #94a3b8;
  --accent: #8b5cf6;
  --accent-2: #38bdf8;
  --ok: #34d399;
  min-height: 100vh;
  display: flex;
  background: radial-gradient(1200px 500px at 10% -10%, rgba(139, 92, 246, 0.22), transparent 55%),
    radial-gradient(900px 400px at 90% 0%, rgba(56, 189, 248, 0.12), transparent 50%),
    var(--bg);
  color: var(--text);
  font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
}

.pthq-sidebar {
  width: 250px;
  flex-shrink: 0;
  background: rgba(8, 12, 22, 0.92);
  border-right: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  padding: 1.1rem 0.85rem;
}

.pthq-brand {
  display: flex;
  gap: 0.7rem;
  align-items: center;
  padding: 0.35rem 0.5rem 1.1rem;
  border-bottom: 1px solid var(--line);
  margin-bottom: 0.85rem;
}
.pthq-mark {
  width: 38px;
  height: 38px;
  border-radius: 11px;
  display: grid;
  place-items: center;
  font-weight: 800;
  font-size: 0.78rem;
  background: linear-gradient(135deg, #7c3aed, #2563eb);
}
.pthq-brand-name {
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-size: 0.78rem;
}
.pthq-brand-sub {
  font-size: 0.7rem;
  color: var(--muted);
}

.pthq-nav {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  flex: 1;
  overflow: auto;
}
.pthq-nav-section {
  margin: 0.85rem 0.5rem 0.35rem;
  font-size: 0.65rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #64748b;
  font-weight: 700;
}
.pthq-nav-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  text-align: left;
  border: 0;
  background: transparent;
  color: #cbd5e1;
  text-decoration: none;
  padding: 0.55rem 0.7rem;
  border-radius: 10px;
  font-size: 0.88rem;
  cursor: pointer;
}
.pthq-nav-item:hover,
.pthq-nav-item.active {
  background: rgba(139, 92, 246, 0.18);
  color: #fff;
}
.pthq-new {
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  background: linear-gradient(135deg, #7c3aed, #db2777);
  color: #fff;
  border-radius: 999px;
  padding: 0.12rem 0.4rem;
}

.pthq-sidebar-foot {
  border-top: 1px solid var(--line);
  padding-top: 0.85rem;
  margin-top: 0.75rem;
}
.pthq-user-mini {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  margin-bottom: 0.65rem;
}
.pthq-avatar {
  width: 34px;
  height: 34px;
  border-radius: 999px;
  background: linear-gradient(135deg, #7c3aed, #2563eb);
  display: grid;
  place-items: center;
  font-weight: 700;
  font-size: 0.75rem;
}
.pthq-user-name { font-size: 0.82rem; font-weight: 600; }
.pthq-user-role { font-size: 0.7rem; color: var(--muted); }
.pthq-classic {
  width: 100%;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--muted);
  border-radius: 9px;
  padding: 0.45rem;
  cursor: pointer;
  font-size: 0.78rem;
}

.pthq-main {
  flex: 1;
  min-width: 0;
  padding: 1.25rem 1.5rem 2rem;
}
.pthq-top {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  margin-bottom: 1.15rem;
}
.pthq-top h1 {
  margin: 0;
  font-size: 1.55rem;
  letter-spacing: -0.02em;
}
.pthq-top-sub { margin: 0.3rem 0 0; color: var(--muted); font-size: 0.9rem; }
.pthq-top-right { display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; }
.pthq-top--schedule { margin-bottom: 0.85rem; }
.pthq-top-link {
  display: inline-flex;
  align-items: center;
  padding: 0.4rem 0.75rem;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: rgba(15, 23, 42, 0.65);
  color: #c4b5fd;
  font-size: 0.78rem;
  font-weight: 600;
  text-decoration: none;
}
.pthq-top-link:hover {
  border-color: rgba(167, 139, 250, 0.45);
  color: #e9d5ff;
  background: rgba(139, 92, 246, 0.16);
}
.pthq-panel--schedule {
  min-width: 0;
}
.pthq-schedule-shell {
  background: rgba(17, 24, 39, 0.55);
  color: #e5e7eb;
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 12px 14px 18px;
  min-height: min(70vh, 820px);
}
.pthq-schedule-shell :deep(.work-hours__title),
.pthq-schedule-shell :deep(.work-hours__summary .muted) {
  color: #94a3b8;
}
.pthq-schedule-shell :deep(.work-hours[open]) {
  border-color: rgba(148, 163, 184, 0.22);
  background: rgba(15, 23, 42, 0.72);
}
.pthq-schedule-shell :deep(.work-hours[open] .work-hours__title) {
  color: #e5e7eb;
}
.pthq-schedule-shell :deep(.work-hours__help),
.pthq-schedule-shell :deep(.work-hours .muted) {
  color: #94a3b8;
}
.pthq-schedule-hint {
  margin: 0;
  max-width: 36rem;
  font-size: 0.82rem;
  color: #94a3b8;
}
.pthq-schedule-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px 16px;
  margin-bottom: 8px;
}
.pthq-schedule-work-hours {
  flex: 1 1 auto;
}
.pthq-search {
  min-width: 220px;
  padding: 0.55rem 0.85rem;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid var(--line);
  color: #64748b;
  font-size: 0.82rem;
}
.pthq-pill {
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  padding: 0.35rem 0.6rem;
  border-radius: 999px;
  background: rgba(139, 92, 246, 0.2);
  color: #c4b5fd;
  border: 1px solid rgba(167, 139, 250, 0.35);
}

.pthq-loading, .pthq-error { color: var(--muted); padding: 2rem 0; }
.pthq-error { color: #fca5a5; }

.pthq-kpi-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.85rem;
  margin-bottom: 0.9rem;
}
.pthq-kpi, .pthq-card {
  background: rgba(17, 24, 39, 0.88);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 1rem 1.05rem;
}
.k-label { font-size: 0.75rem; color: var(--muted); }
.k-value { font-size: 1.6rem; font-weight: 750; letter-spacing: -0.03em; margin-top: 0.25rem; }
.k-value.health { color: var(--ok); }
.k-meta { margin-top: 0.3rem; font-size: 0.75rem; color: var(--muted); }
.k-meta.up { color: var(--ok); }

.pthq-grid-2 {
  display: grid;
  grid-template-columns: 1.2fr 0.8fr;
  gap: 0.85rem;
  margin-bottom: 0.9rem;
}
.pthq-grid-main {
  display: grid;
  grid-template-columns: 1.55fr 0.85fr;
  gap: 0.85rem;
}
.pthq-card-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.75rem;
  margin-bottom: 0.85rem;
}
.pthq-card-head.row { align-items: center; margin-bottom: 1rem; }
.pthq-card-head h2 { margin: 0; font-size: 1rem; }
.muted { color: var(--muted); font-size: 0.82rem; margin: 0.25rem 0 0; }

.pthq-dist {
  display: flex;
  gap: 1rem;
  align-items: center;
}
.donut {
  width: 110px;
  height: 110px;
  border-radius: 999px;
  flex-shrink: 0;
  mask: radial-gradient(circle 34px, transparent 98%, #000 100%);
}
.pthq-dist ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  width: 100%;
}
.pthq-dist li {
  display: grid;
  grid-template-columns: 10px 1fr auto auto;
  gap: 0.45rem;
  align-items: center;
  font-size: 0.82rem;
  text-transform: capitalize;
}
.dot { width: 8px; height: 8px; border-radius: 999px; }
.pthq-dist em { color: var(--muted); font-style: normal; font-size: 0.75rem; }
.pthq-dist .muted-row {
  display: block;
  color: var(--muted);
  text-transform: none;
  font-size: 0.8rem;
}
.dist-footnote {
  margin: 0.85rem 0 0;
  font-size: 0.72rem;
  color: #64748b;
  line-height: 1.4;
}
.suborg-pill {
  font-size: 0.8rem;
  color: #cbd5e1;
  white-space: nowrap;
}

.launch-card {
  background:
    radial-gradient(500px 180px at 100% 0%, rgba(139, 92, 246, 0.35), transparent 60%),
    rgba(17, 24, 39, 0.92);
}
.launch-card p {
  color: var(--muted);
  font-size: 0.88rem;
  line-height: 1.45;
  margin: 0 0 1rem;
}
.pthq-cta {
  border: 0;
  border-radius: 10px;
  padding: 0.7rem 1rem;
  font-weight: 700;
  cursor: pointer;
  color: #fff;
  background: linear-gradient(135deg, #7c3aed, #2563eb);
}
.pthq-ghost {
  border: 1px solid var(--line);
  background: transparent;
  color: #cbd5e1;
  border-radius: 9px;
  padding: 0.45rem 0.75rem;
  cursor: pointer;
}

.pthq-inline-search {
  background: rgba(2, 6, 23, 0.45);
  border: 1px solid var(--line);
  color: var(--text);
  border-radius: 9px;
  padding: 0.4rem 0.65rem;
  font-size: 0.8rem;
}
.pthq-table-wrap { overflow: auto; }
.pthq-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.84rem;
}
.pthq-table th {
  text-align: left;
  color: var(--muted);
  font-weight: 600;
  padding: 0.45rem 0.35rem;
  border-bottom: 1px solid var(--line);
}
.pthq-table td {
  padding: 0.65rem 0.35rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  vertical-align: middle;
}
.t-name { font-weight: 600; }
.t-slug { color: var(--muted); font-size: 0.72rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.pthq-mini-btn {
  border: 0;
  border-radius: 8px;
  padding: 0.35rem 0.55rem;
  background: rgba(139, 92, 246, 0.2);
  color: #ddd6fe;
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 600;
}
.pthq-mini-btn.ghost {
  background: transparent;
  border: 1px solid rgba(148, 163, 184, 0.25);
  color: #94a3b8;
}
.pthq-open-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.pthq-side-stack { display: flex; flex-direction: column; gap: 0.85rem; }
.pthq-qa-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}
.pthq-qa-grid a,
.pthq-qa-grid button {
  text-decoration: none;
  border: 1px solid var(--line);
  background: rgba(2, 6, 23, 0.35);
  color: #e2e8f0;
  border-radius: 10px;
  padding: 0.65rem 0.55rem;
  font-size: 0.78rem;
  text-align: center;
  cursor: pointer;
}
.pthq-sys {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}
.pthq-sys li {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 0.82rem;
  color: var(--muted);
}
.pthq-sys strong { color: var(--text); font-weight: 600; }

.pthq-tenant-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.85rem;
}
.pthq-tenant-card {
  background: rgba(17, 24, 39, 0.88);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 1rem;
  cursor: pointer;
}
.t-metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.45rem;
  margin: 0.75rem 0;
}
.t-metrics span {
  display: block;
  font-size: 0.68rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.t-metrics strong { font-size: 0.95rem; }
.t-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-bottom: 0.45rem;
}
.seg {
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 0.15rem 0.4rem;
  border-radius: 999px;
}
.seg.individual { background: rgba(52, 211, 153, 0.15); color: #6ee7b7; }
.seg.organization { background: rgba(167, 139, 250, 0.15); color: #c4b5fd; }
.seg.sandbox { background: rgba(251, 191, 36, 0.15); color: #fcd34d; }
.seg.type { background: rgba(148, 163, 184, 0.12); color: #94a3b8; }
.t-hint {
  margin: 0 0 0.65rem;
  font-size: 0.72rem;
  color: #64748b;
  line-height: 1.35;
}

@media (max-width: 1100px) {
  .pthq { flex-direction: column; }
  .pthq-sidebar { width: 100%; }
  .pthq-kpi-row,
  .pthq-grid-2,
  .pthq-grid-main,
  .pthq-tenant-grid {
    grid-template-columns: 1fr;
  }
}
</style>
