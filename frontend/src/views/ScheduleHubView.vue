<template>
  <div class="sched-hub">
    <header class="hub-header" data-tour="schedule-hub-header">
      <div class="hub-brand">
        <div class="hub-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M3 9h18M8 3v4M16 3v4" stroke-linecap="round" />
          </svg>
        </div>
        <div>
          <h1 class="hub-title" data-tour="schedule-hub-title">Schedule Hub</h1>
          <p class="hub-subtitle" data-tour="schedule-hub-subtitle">
            Manage schedules, requests, and availability across schools and offices.
          </p>
        </div>
      </div>
      <router-link class="hub-calendar-btn" :to="orgTo('/my-schedule')">
        View calendar
      </router-link>
    </header>

    <div
      v-if="canOpenPrivilegedScheduleTools && pendingTotal > 0"
      class="hub-alert"
      role="status"
    >
      <div class="hub-alert-copy">
        <strong>{{ pendingTotal }} availability request{{ pendingTotal === 1 ? '' : 's' }} need review</strong>
        <span>Stay on top of pending requests to keep everything running smoothly.</span>
      </div>
      <div class="hub-alert-meta">
        <span class="hub-pill">{{ officePending }} office</span>
        <span class="hub-pill">{{ schoolPending }} school</span>
      </div>
    </div>

    <div class="hub-grid" data-tour="schedule-hub-grid">
      <router-link
        v-for="card in visibleCards"
        :key="card.id"
        class="hub-card"
        :class="[`tone-${card.tone}`]"
        :to="card.to"
        :data-tour="card.tour"
      >
        <span v-if="card.count > 0" class="hub-card-badge">{{ card.count }}</span>
        <div class="hub-card-icon" aria-hidden="true" v-html="card.icon" />
        <div class="hub-card-title">{{ card.title }}</div>
        <p class="hub-card-desc">{{ card.desc }}</p>
        <div class="hub-card-cta">{{ card.cta }}</div>
      </router-link>
    </div>

    <section v-if="canOpenPrivilegedScheduleTools" class="hub-overview">
      <h2>Quick overview</h2>
      <div class="hub-stats">
        <div class="hub-stat">
          <span class="dot office" />
          <strong>{{ officePending }}</strong>
          <span>Office pending</span>
        </div>
        <div class="hub-stat">
          <span class="dot school" />
          <strong>{{ schoolPending }}</strong>
          <span>School pending</span>
        </div>
        <div class="hub-stat">
          <span class="dot total" />
          <strong>{{ pendingTotal }}</strong>
          <span>Total to review</span>
        </div>
      </div>
      <p class="hub-tip">
        Tip: Approve office requests in the dedicated inbox. School schedule changes and additional hours live under School approvals.
        <router-link :to="orgTo('/my-schedule')">Open calendar →</router-link>
      </p>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../store/auth';
import { useAgencyStore } from '../store/agency';
import api from '../services/api';

const route = useRoute();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const orgSlug = computed(() => (typeof route.params.organizationSlug === 'string' ? route.params.organizationSlug : null));
const orgTo = (path) => (orgSlug.value ? `/${orgSlug.value}${path}` : path);

const actorRole = computed(() => String(authStore.user?.role || '').toLowerCase());
const isProviderBusyOnly = computed(() => actorRole.value === 'provider');
const canOpenPrivilegedScheduleTools = computed(() => !isProviderBusyOnly.value);
const agencyId = computed(() => Number(agencyStore.currentAgency?.id || 0));
const officePending = ref(0);
const schoolPending = ref(0);
const pendingTotal = computed(() => officePending.value + schoolPending.value);

const schoolApprovalsTo = computed(() => ({
  path: orgTo('/admin/school-approvals'),
  query: {
    tab: 'adjustments',
    ...(agencyId.value ? { agencyId: String(agencyId.value) } : {})
  }
}));

const officeApprovalsTo = computed(() => ({
  path: orgTo('/admin/office-approvals'),
  query: agencyId.value ? { agencyId: String(agencyId.value) } : {}
}));

const providerManagementTo = computed(() => ({
  path: orgTo('/admin/provider-availability'),
  query: agencyId.value ? { agencyId: String(agencyId.value) } : {}
}));

const icon = {
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4" stroke-linecap="round"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="3"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke-linecap="round"/></svg>',
  ticket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 1 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 1 0 0-4V9z"/></svg>',
  compare: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3M12 8v8" stroke-linecap="round"/></svg>',
  building: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M14 10h5a1 1 0 0 1 1 1v10M8 8h2M8 12h2M8 16h2M17 14h1M17 18h1"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6" stroke-linecap="round"/></svg>',
  school: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="M5 10v5c0 1.5 3 3 7 3s7-1.5 7-3v-5M12 13v8" stroke-linecap="round"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke-linecap="round"/></svg>'
};

const allCards = computed(() => [
  {
    id: 'my',
    title: 'My Schedule',
    desc: 'Your personal week grid — book sessions, request rooms, and overlay coworker busy times.',
    cta: 'Open →',
    to: orgTo('/my-schedule'),
    tone: 'green',
    icon: icon.calendar,
    tour: 'schedule-hub-card-full',
    show: true,
    count: 0
  },
  {
    id: 'meetings',
    title: 'Admin Meetings',
    desc: 'Log of admin meetings with attendance, transcript, summary, chat, and goals.',
    cta: 'Open →',
    to: {
      path: orgTo('/admin/admin-meetings'),
      query: agencyId.value ? { agencyId: String(agencyId.value) } : {}
    },
    tone: 'green',
    icon: icon.people,
    tour: 'schedule-hub-card-admin-meetings',
    show: canOpenPrivilegedScheduleTools.value,
    count: 0
  },
  {
    id: 'events',
    title: 'Event shift requests',
    desc: 'Request to work upcoming program-event sessions (regular, waitlist, or on-call).',
    cta: 'Open →',
    to: orgTo('/schedule/event-staffing'),
    tone: 'purple',
    icon: icon.ticket,
    tour: null,
    show: canOpenPrivilegedScheduleTools.value,
    count: 0
  },
  {
    id: 'staff',
    title: 'Staff schedules (compare)',
    desc: isProviderBusyOnly.value
      ? 'See coworker busy blocks across your agencies (details hidden).'
      : 'Select multiple providers and compare schedules; reorder and view two+ at once.',
    cta: 'Open →',
    to: orgTo('/schedule/staff'),
    tone: 'orange',
    icon: icon.compare,
    tour: 'schedule-hub-card-staff',
    show: true,
    count: 0
  },
  {
    id: 'provider-mgmt',
    title: 'Provider Management',
    desc: 'School slots, office & virtual availability, payroll ratios, app usage, and kudos — by agency.',
    cta: 'Open →',
    to: providerManagementTo.value,
    tone: 'purple',
    icon: icon.people,
    tour: 'schedule-hub-card-provider-management',
    show: canOpenPrivilegedScheduleTools.value,
    count: 0
  },
  {
    id: 'buildings-grid',
    title: 'Buildings master grid',
    desc: 'All rooms in a building — same data as My Schedule, building-centric view (find availability, company holds).',
    cta: 'Open →',
    to: orgTo('/buildings/schedule'),
    tone: 'blue',
    icon: icon.building,
    tour: 'schedule-hub-card-buildings-schedule',
    show: canOpenPrivilegedScheduleTools.value,
    count: 0
  },
  {
    id: 'office',
    title: 'Approve office requests',
    desc: 'Dedicated inbox for office requests and reported Therapy Notes coverage conflicts.',
    cta: officePending.value > 0 ? `Review ${officePending.value} →` : 'Open →',
    to: officeApprovalsTo.value,
    tone: 'orange',
    icon: icon.mail,
    tour: 'schedule-hub-card-approvals',
    show: canOpenPrivilegedScheduleTools.value,
    count: officePending.value
  },
  {
    id: 'school',
    title: 'Approve school requests',
    desc: 'Review schedule adjustments and additional school-hour requests with current vs requested details.',
    cta: schoolPending.value > 0 ? `Review ${schoolPending.value} →` : 'Open →',
    to: schoolApprovalsTo.value,
    tone: 'green',
    icon: icon.school,
    tour: 'schedule-hub-card-school-requests',
    show: canOpenPrivilegedScheduleTools.value,
    count: schoolPending.value
  },
  {
    id: 'buildings-admin',
    title: 'Buildings settings',
    desc: 'Building selection, review workflows, and building settings.',
    cta: 'Open →',
    to: orgTo('/buildings'),
    tone: 'blue',
    icon: icon.gear,
    tour: 'schedule-hub-card-buildings-admin',
    show: canOpenPrivilegedScheduleTools.value,
    count: 0
  }
]);

const visibleCards = computed(() => allCards.value.filter((c) => c.show));

const loadPendingCounts = async () => {
  if (!canOpenPrivilegedScheduleTools.value) return;
  try {
    const { data } = await api.get('/availability/admin/pending-counts', {
      params: agencyId.value ? { agencyId: agencyId.value } : undefined,
      skipGlobalLoading: true
    });
    officePending.value = Number(data?.officeRequestsPending || 0);
    schoolPending.value = Number(data?.schoolRequestsPending || 0);
  } catch {
    officePending.value = 0;
    schoolPending.value = 0;
  }
};

watch(agencyId, loadPendingCounts);
onMounted(loadPendingCounts);
</script>

<style scoped>
.sched-hub {
  --hub-ink: color-mix(in srgb, var(--primary, #1f6b4a) 22%, #0f172a);
  --hub-muted: #64748b;
  --hub-line: #e2e8f0;
  --hub-panel: #fff;
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 28px 24px 48px;
  box-sizing: border-box;
  color: var(--hub-ink);
  min-height: calc(100vh - 72px);
  min-height: calc(100dvh - 72px);
}
.hub-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 18px;
  flex-wrap: wrap;
}
.hub-brand {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}
.hub-icon {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--primary, #1f6b4a) 12%, #fff);
  color: var(--primary, #1f6b4a);
  flex-shrink: 0;
}
.hub-icon svg { width: 24px; height: 24px; }
.hub-title {
  margin: 0;
  font-size: clamp(1.6rem, 2.4vw, 2rem);
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--primary, #1f6b4a);
}
.hub-subtitle {
  margin: 6px 0 0;
  color: var(--hub-muted);
  font-size: 14px;
  max-width: 46ch;
  line-height: 1.45;
}
.hub-calendar-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid var(--hub-line);
  background: #fff;
  color: var(--hub-ink);
  text-decoration: none;
  font-weight: 700;
  font-size: 13px;
}
.hub-alert {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;
  margin: 0 0 20px;
  padding: 14px 16px;
  border: 1px solid #fecaca;
  border-radius: 16px;
  background: #fef2f2;
}
.hub-alert-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.hub-alert-copy strong { color: #991b1b; font-size: 15px; }
.hub-alert-copy span { color: #b91c1c; font-size: 13px; }
.hub-alert-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.hub-pill {
  display: inline-flex;
  padding: 5px 10px;
  border-radius: 999px;
  background: #fff;
  border: 1px solid #fecaca;
  color: #991b1b;
  font-size: 12px;
  font-weight: 700;
}
.hub-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}
.hub-card {
  position: relative;
  display: flex;
  flex-direction: column;
  text-decoration: none;
  color: inherit;
  background: var(--hub-panel);
  border: 1px solid var(--hub-line);
  border-radius: 18px;
  padding: 18px 16px 14px;
  min-height: 176px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.12s ease;
}
.hub-card:hover {
  border-color: color-mix(in srgb, var(--primary, #1f6b4a) 35%, var(--hub-line));
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
  transform: translateY(-1px);
}
.hub-card-badge {
  position: absolute;
  top: 12px;
  right: 12px;
  min-width: 24px;
  height: 24px;
  padding: 0 7px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #dc2626;
  color: #fff;
  font-size: 12px;
  font-weight: 800;
}
.hub-card-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  margin-bottom: 12px;
}
.hub-card-icon :deep(svg) {
  width: 20px;
  height: 20px;
}
.tone-green .hub-card-icon { background: #ecfdf5; color: #15803d; }
.tone-orange .hub-card-icon { background: #fff7ed; color: #c2410c; }
.tone-purple .hub-card-icon { background: #f5f3ff; color: #6d28d9; }
.tone-blue .hub-card-icon { background: #eff6ff; color: #1d4ed8; }
.hub-card-title {
  font-weight: 800;
  font-size: 15px;
  margin-bottom: 6px;
  color: var(--hub-ink);
  padding-right: 28px;
}
.hub-card-desc {
  margin: 0;
  color: var(--hub-muted);
  font-size: 13px;
  line-height: 1.4;
  flex: 1;
}
.hub-card-cta {
  margin-top: 14px;
  font-weight: 800;
  font-size: 13px;
  color: var(--primary, #1f6b4a);
}
.hub-overview {
  margin-top: 28px;
  padding: 18px;
  border: 1px solid var(--hub-line);
  border-radius: 18px;
  background: #f8fafc;
}
.hub-overview h2 {
  margin: 0 0 14px;
  font-size: 1rem;
  font-weight: 800;
}
.hub-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  margin-bottom: 12px;
}
.hub-stat {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--hub-muted);
}
.hub-stat strong {
  color: var(--hub-ink);
  font-size: 16px;
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
}
.dot.office { background: #ea580c; }
.dot.school { background: #16a34a; }
.dot.total { background: #64748b; }
.hub-tip {
  margin: 0;
  font-size: 13px;
  color: var(--hub-muted);
  line-height: 1.45;
}
.hub-tip a {
  color: var(--primary, #1f6b4a);
  font-weight: 700;
  text-decoration: none;
}
@media (max-width: 1100px) {
  .hub-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
  .hub-grid { grid-template-columns: 1fr; }
  .hub-alert { align-items: flex-start; }
}
</style>
