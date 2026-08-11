<template>
  <Teleport to="body">
    <Transition name="briefing-fade">
      <div
        v-if="visible"
        class="briefing-overlay"
        role="presentation"
        @click.self="dismiss"
      >
        <section
          class="briefing-modal"
          :style="brandVars"
          role="dialog"
          aria-modal="true"
          aria-labelledby="provider-briefing-title"
          @keydown.esc="dismiss"
        >
          <div class="briefing-brand-rail" aria-hidden="true">
            <div class="brand-logo-stack">
              <div class="brand-logo-wrap" :title="tenantAgency?.name">
                <img v-if="tenantAgency?.logo" :src="tenantAgency.logo" alt="" class="brand-logo" />
                <span v-else class="brand-logo-fallback">{{ tenantAgency?.initials }}</span>
              </div>
            </div>
          </div>

          <button class="briefing-close" type="button" aria-label="Close login briefing" @click="dismiss">×</button>

          <header class="briefing-header">
            <div>
              <div class="briefing-eyebrow">{{ tenantContextLabel }}</div>
              <h1 id="provider-briefing-title">Welcome back, {{ firstName }}</h1>
              <p>Here’s what needs your attention in {{ tenantAgency?.name || 'your organization' }} today.</p>
            </div>
            <time class="briefing-date" :datetime="todayIso">
              <span class="date-icon" aria-hidden="true">▦</span>
              <span><strong>{{ dateLabel }}</strong><small>{{ weekdayLabel }}</small></span>
            </time>
          </header>

          <div v-if="loading" class="briefing-loading" role="status">
            <span class="briefing-spinner" aria-hidden="true"></span>
            Building your personalized briefing…
          </div>

          <template v-else>
            <div v-if="loadError" class="briefing-warning" role="status">
              Some live information could not be loaded. The available sections are shown below.
            </div>

            <div class="briefing-layout">
              <div class="briefing-main">
                <div v-if="sections.length" class="briefing-card-grid">
                  <article
                    v-for="section in sections"
                    :key="section.key"
                    class="briefing-card"
                    :class="`briefing-card--${section.tone}`"
                  >
                    <header class="card-header">
                      <span class="card-icon" aria-hidden="true">{{ section.icon }}</span>
                      <div>
                        <div class="card-kicker">{{ section.title }}</div>
                        <div class="card-count"><strong>{{ section.count }}</strong> {{ section.countLabel }}</div>
                      </div>
                    </header>
                    <button
                      v-for="item in section.items.slice(0, 3)"
                      :key="item.id"
                      type="button"
                      class="briefing-item"
                      @click="navigate(section.to)"
                    >
                      <span class="item-dot" aria-hidden="true"></span>
                      <span class="item-copy">
                        <strong>{{ item.label }}</strong>
                        <small v-if="item.meta">{{ item.meta }}</small>
                      </span>
                      <span v-if="item.badge" class="item-badge" :class="`item-badge--${item.badgeTone || 'neutral'}`">
                        {{ item.badge }}
                      </span>
                    </button>
                    <button class="card-link" type="button" @click="navigate(section.to)">
                      {{ section.action }} <span aria-hidden="true">→</span>
                    </button>
                  </article>
                </div>

                <div v-else class="all-clear-card">
                  <span aria-hidden="true">✓</span>
                  <div><strong>You’re all caught up.</strong><small>No new items need your attention right now.</small></div>
                </div>

                <div class="at-a-glance" aria-label="At a glance">
                  <div class="glance-title"><span aria-hidden="true">▥</span> At a glance</div>
                  <div v-for="metric in glanceMetrics" :key="metric.label" class="glance-metric">
                    <strong>{{ metric.value }}</strong>
                    <span>{{ metric.label }}</span>
                    <small v-if="metric.hint">{{ metric.hint }}</small>
                  </div>
                </div>
              </div>

              <aside class="briefing-side">
                <button v-if="urgentCount" class="urgent-card" type="button" @click="navigate(urgentDestination)">
                  <span class="urgent-icon" aria-hidden="true">△</span>
                  <span><small>Needs attention</small><strong>{{ urgentCount }}</strong> overdue or urgent items</span>
                  <span aria-hidden="true">→</span>
                </button>

                <section v-if="payPeriodLabel" class="pay-card">
                  <div class="side-kicker">Pay period</div>
                  <strong>{{ payPeriodLabel }}</strong>
                  <small v-if="tierLabel">{{ tierLabel }}</small>
                </section>

                <section class="security-card">
                  <span aria-hidden="true">♢</span>
                  <div><strong>Security tip</strong><p>If you see unfamiliar account activity, sign out and reset your password.</p></div>
                </section>
              </aside>
            </div>
          </template>

          <footer class="briefing-footer">
            <label class="dont-show-label">
              <input v-model="dontShowAgain" type="checkbox" />
              <span>Don’t show this briefing again on this device</span>
            </label>
            <button class="enter-dashboard" type="button" @click="enterDashboard">
              <span aria-hidden="true">&#x25A3;</span> Enter Dashboard
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import { useBrandingStore } from '../../store/branding';
import { toUploadsUrl } from '../../utils/uploadsUrl';
import { resolveHostImpliedPortalSlug } from '../../utils/orgScopedPath';
import {
  activeProviderBriefingSections,
  briefingPathPrefix,
  isProviderLoginBriefingUser,
  parseBrandPalette,
  providerBriefingDashboardPath,
  resolveLoginTenantAgency,
  splitProviderBriefingNotifications
} from '../../utils/providerLoginBriefing';

const props = defineProps({
  loginTrigger: { type: [Number, String], default: 0 }
});

const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const brandingStore = useBrandingStore();
const router = useRouter();

const visible = ref(false);
const loading = ref(false);
const loadError = ref(false);
const dontShowAgain = ref(false);
const loginTenantAgency = ref(null);
const tierLabel = ref('');
const payPeriodLabel = ref('');
const briefing = ref({
  notifications: null,
  messages: null,
  tasks: null,
  calendar: null,
  clientUpdates: null,
  notesToSign: null,
  tickets: null,
  supervision: null,
  yearUpdate: null,
  overdueNotes: null
});

let requestGeneration = 0;
const BRIEFING_PRIMARY_TIMEOUT_MS = 10000;
const BRIEFING_SECONDARY_TIMEOUT_MS = 8000;

const userId = computed(() => authStore.user?.id || null);
const role = computed(() => String(authStore.user?.role || '').toLowerCase());
const firstName = computed(() => String(
  authStore.user?.preferredName || authStore.user?.preferred_name || authStore.user?.firstName || authStore.user?.first_name || 'there'
).trim().split(/\s+/)[0] || 'there');

const hostPortalSlug = computed(() => resolveHostImpliedPortalSlug(brandingStore));

const platformPalette = computed(() => {
  const pb = brandingStore.platformBranding || {};
  return {
    primary: pb.primary_color || '#1f6b4a',
    secondary: pb.secondary_color || '#0f2f27',
    accent: pb.accent_color || pb.primary_color || '#2f8c68'
  };
});

function agencyLogo(agency) {
  const direct = agency?.logo_url ?? agency?.logoUrl;
  if (direct) return String(direct).startsWith('http') ? direct : toUploadsUrl(direct);
  const path = agency?.logo_path ?? agency?.logoPath ?? agency?.icon_file_path;
  return path ? toUploadsUrl(path) : null;
}

function initialsFor(value) {
  return String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'PT';
}

const tenantAgency = computed(() => {
  const agency = loginTenantAgency.value;
  if (!agency) return null;
  const palette = parseBrandPalette(agency, platformPalette.value);
  return {
    ...agency,
    ...palette,
    logo: agencyLogo(agency),
    initials: initialsFor(agency?.name)
  };
});

const tenantContextLabel = computed(() => tenantAgency.value?.name || 'Your briefing');

const brandVars = computed(() => {
  const tenant = tenantAgency.value || platformPalette.value;
  return {
    '--brief-primary': tenant.primary || platformPalette.value.primary,
    '--brief-secondary': tenant.secondary || platformPalette.value.secondary,
    '--brief-accent': tenant.accent || platformPalette.value.accent,
    '--brief-blend': tenant.primary || platformPalette.value.primary
  };
});

const now = new Date();
const todayIso = now.toISOString().slice(0, 10);
const dateLabel = now.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
const weekdayLabel = now.toLocaleDateString([], { weekday: 'long' });

const prefix = computed(() => briefingPathPrefix({
  agency: loginTenantAgency.value,
  hostPortalSlug: hostPortalSlug.value,
  routeSlug: router.currentRoute.value.params?.organizationSlug
}));

const sections = computed(() => activeProviderBriefingSections(briefing.value));

const urgentCount = computed(() => {
  const overdueTasks = (briefing.value.tasks?.items || []).filter((item) => item.badgeTone === 'danger').length;
  const overdueNotes = Number(briefing.value.overdueNotes?.count || 0);
  const yearUpdate = Number(briefing.value.yearUpdate?.count || 0);
  const notesToSign = Number(briefing.value.notesToSign?.count || 0);
  return overdueTasks + overdueNotes + yearUpdate + notesToSign;
});

const urgentDestination = computed(() => {
  if (briefing.value.overdueNotes?.count) return `${prefix.value}/payroll/submit`;
  if (briefing.value.yearUpdate?.count) return `${prefix.value}/provider/year-update/flow`;
  if (briefing.value.notesToSign?.count) return `${prefix.value}/notes-to-sign`;
  return `${prefix.value}/tasks`;
});

const glanceMetrics = computed(() => [
  { value: tenantAgency.value?.name || '—', label: 'Tenant' },
  { value: sections.value.reduce((sum, section) => sum + Number(section.count || 0), 0), label: 'Items needing attention' },
  { value: Number(briefing.value.calendar?.count || 0), label: 'On your calendar today' },
  { value: Number(briefing.value.messages?.count || 0), label: 'Unread messages' }
]);

function storageKey() {
  return `pt.providerLoginBriefing.disabled:${userId.value || 0}`;
}

function isDisabled() {
  try { return localStorage.getItem(storageKey()) === '1'; } catch { return false; }
}

function relativeTime(raw) {
  const ms = new Date(raw || 0).getTime();
  if (!Number.isFinite(ms)) return '';
  const minutes = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (minutes < 1) return 'Now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

function localYmd(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function mondayYmd() {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  const day = date.getDay();
  date.setDate(date.getDate() + ((day === 0 ? -6 : 1) - day));
  return localYmd(date);
}

function formatTime(raw) {
  const date = new Date(raw || 0);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function unwrapList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.notifications)) return data.notifications;
  if (Array.isArray(data?.tickets)) return data.tickets;
  return [];
}

function todayScheduleItems(data) {
  const rows = [
    ...(data?.officeEvents || []),
    ...(data?.scheduleEvents || []),
    ...(data?.supervisionSessions || [])
  ];
  return rows
    .map((item, index) => {
      const startsAt = item.startAt || item.startsAt || item.startDate;
      const date = new Date(startsAt || 0);
      if (Number.isNaN(date.getTime()) || localYmd(date) !== localYmd()) return null;
      return {
        id: `calendar-${item.id || index}`,
        label: item.title || item.counterpartyName || item.buildingName || 'Scheduled event',
        meta: formatTime(startsAt),
        sortAt: date.getTime()
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.sortAt - b.sortAt);
}

function todaySupervisionItems(rows = []) {
  return rows
    .map((item, index) => {
      const startsAt = item.startAt || item.startsAt;
      const date = new Date(startsAt || 0);
      if (Number.isNaN(date.getTime()) || localYmd(date) !== localYmd()) return null;
      return {
        id: `supervision-${item.id || index}`,
        label: item.sessionTypeLabel || item.title || 'Supervision session',
        meta: formatTime(startsAt),
        sortAt: date.getTime()
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.sortAt - b.sortAt);
}

function baseSection({ title, icon, tone, count, countLabel, items, action, to }) {
  return { title, icon, tone, count: Number(count || 0), countLabel, items: items || [], action, to };
}

function mapNotificationItems(rows = []) {
  return rows.slice(0, 3).map((item) => ({
    id: `notification-${item.id}`,
    label: item.title || item.message || 'Notification',
    meta: relativeTime(item.created_at || item.createdAt)
  }));
}

async function loadBriefing() {
  const generation = ++requestGeneration;
  loading.value = true;
  loadError.value = false;
  tierLabel.value = '';
  payPeriodLabel.value = '';
  briefing.value = {
    notifications: null,
    messages: null,
    tasks: null,
    calendar: null,
    clientUpdates: null,
    notesToSign: null,
    tickets: null,
    supervision: null,
    yearUpdate: null,
    overdueNotes: null
  };
  visible.value = true;

  const apiOpts = (timeoutMs) => ({
    timeout: timeoutMs,
    skipGlobalLoading: true,
    skipAuthRedirect: true
  });

  try {
    const current = Array.isArray(agencyStore.userAgencies) ? agencyStore.userAgencies : [];
    const rows = current.length ? current : (await agencyStore.fetchUserAgencies());
    const tenant = resolveLoginTenantAgency({
      agencies: rows || [],
      hostPortalSlug: hostPortalSlug.value,
      currentAgency: agencyStore.currentAgency?.value || agencyStore.currentAgency || null
    });
    loginTenantAgency.value = tenant;
    if (tenant?.id) agencyStore.setCurrentAgency(tenant);

    const agencyId = Number(tenant?.id || 0);
    const notificationParams = {
      isRead: false,
      isResolved: false,
      limit: 40,
      ...(agencyId ? { agencyId } : {})
    };

    const phase1 = await Promise.allSettled([
      api.get('/notifications/counts', apiOpts(BRIEFING_PRIMARY_TIMEOUT_MS)),
      api.get('/notifications', { params: notificationParams, ...apiOpts(BRIEFING_PRIMARY_TIMEOUT_MS) }),
      agencyId
        ? api.get('/messages/dashboard-summary', {
          params: { agencyId, allAgencies: 0 },
          ...apiOpts(BRIEFING_PRIMARY_TIMEOUT_MS)
        })
        : Promise.resolve({ data: { cards: { unread: 0 }, priority: [] } })
    ]);

    if (generation !== requestGeneration) return;

    const notificationCounts = phase1[0].status === 'fulfilled' ? (phase1[0].value?.data || {}) : {};
    const notificationList = phase1[1].status === 'fulfilled' ? unwrapList(phase1[1].value?.data) : [];
    const unreadNotifications = notificationList.filter((item) => {
      const read = item._is_read_for_viewer ?? item.is_read;
      return !read && !item.is_resolved;
    });
    const { tenantRows, schoolRows } = splitProviderBriefingNotifications(unreadNotifications);
    const notificationCount = Math.max(
      Number(agencyId ? notificationCounts[agencyId] : 0) || 0,
      tenantRows.length + schoolRows.length,
      unreadNotifications.length
    );

    briefing.value = {
      ...briefing.value,
      notifications: baseSection({
        title: 'Notifications',
        icon: '♢',
        tone: 'slate',
        count: tenantRows.length || notificationCount,
        countLabel: tenantRows.length === 1 ? 'new' : 'new',
        items: mapNotificationItems(tenantRows),
        action: 'View all notifications',
        to: `${prefix.value}/notifications`
      }),
      clientUpdates: baseSection({
        title: 'Client & school updates',
        icon: '▣',
        tone: 'green',
        count: schoolRows.length,
        countLabel: schoolRows.length === 1 ? 'update' : 'updates',
        items: mapNotificationItems(schoolRows),
        action: 'View client updates',
        to: `${prefix.value}/notifications`
      })
    };

    const messageData = phase1[2].status === 'fulfilled' ? (phase1[2].value?.data || {}) : {};
    const messageCount = Number(messageData?.cards?.unread || 0);
    briefing.value = {
      ...briefing.value,
      messages: baseSection({
        title: 'Missed messages',
        icon: '◌',
        tone: 'blue',
        count: messageCount,
        countLabel: 'unread',
        items: (messageData?.priority || []).slice(0, 3).map((item) => ({
          id: item.id,
          label: item.label || 'Conversation',
          meta: [item.agencyName, relativeTime(item.occurredAt)].filter(Boolean).join(' · ')
        })),
        action: 'View all messages',
        to: `${prefix.value}/messages`
      })
    };

    loadError.value = phase1[0].status === 'rejected' && phase1[1].status === 'rejected';
    loading.value = false;

    const scheduleParams = {
      weekStart: mondayYmd(),
      includeAllAgencies: 0,
      ...(agencyId ? { agencyId } : {})
    };

    const phase2 = await Promise.allSettled([
      api.get('/tasks', { params: agencyId ? { agencyId } : {}, ...apiOpts(BRIEFING_SECONDARY_TIMEOUT_MS) }),
      api.get(`/users/${userId.value}/schedule-summary`, { params: scheduleParams, ...apiOpts(BRIEFING_SECONDARY_TIMEOUT_MS) }),
      api.get('/me/notes-to-sign/count', apiOpts(BRIEFING_SECONDARY_TIMEOUT_MS)),
      api.get('/support-tickets/mine', apiOpts(BRIEFING_SECONDARY_TIMEOUT_MS)),
      api.get('/supervision/my-prompts', {
        params: agencyId ? { agencyId } : {},
        ...apiOpts(BRIEFING_SECONDARY_TIMEOUT_MS)
      }),
      agencyId
        ? api.get('/provider-year-update/me/status', { params: { agencyId }, ...apiOpts(BRIEFING_SECONDARY_TIMEOUT_MS) })
        : Promise.resolve({ data: null }),
      agencyId
        ? api.get('/payroll/me/dashboard-summary', { params: { agencyId }, ...apiOpts(BRIEFING_SECONDARY_TIMEOUT_MS) })
        : Promise.resolve({ data: null }),
      agencyId
        ? api.get('/payroll/me/current-tier', { params: { agencyId }, ...apiOpts(BRIEFING_SECONDARY_TIMEOUT_MS) })
        : Promise.resolve({ data: null })
    ]);

    if (generation !== requestGeneration) return;

    const value = (index, fallback = null) => phase2[index].status === 'fulfilled'
      ? phase2[index].value?.data
      : fallback;

    const taskRows = unwrapList(value(0, [])).filter((task) => {
      const status = String(task?.status || task?.task_status || 'pending').toLowerCase();
      return ['pending', 'in_progress', 'open'].includes(status);
    });
    const calendarRows = todayScheduleItems(value(1, {}));
    const notesCount = Number(value(2, {})?.count || 0);
    const ticketRows = unwrapList(value(3, [])).filter((item) => String(item?.status || '').toLowerCase() !== 'closed');
    const supervisionRows = todaySupervisionItems(Array.isArray(value(4, [])) ? value(4, []) : (value(4, {})?.items || []));
    const yearUpdateStatus = value(5, null);
    const payrollSummary = value(6, null);
    const tierData = value(7, null);

    const unpaid = payrollSummary?.unpaidNotes?.lastPayPeriod || null;
    const overdueNoteCount = Number(unpaid?.totalNotes ?? unpaid?.totalUnits ?? 0) || 0;
    const noNoteCount = Number(unpaid?.noNoteNotes ?? unpaid?.noNoteUnits ?? 0) || 0;
    const draftCount = Number(unpaid?.draftNotes ?? unpaid?.draftUnits ?? 0) || 0;

    const yearUpdatePending = yearUpdateStatus?.available && !yearUpdateStatus?.userFinalized;
    tierLabel.value = String(tierData?.tier?.label || tierData?.label || '').trim();
    const periodStart = payrollSummary?.lastPaycheck?.periodStart || tierData?.periodStart;
    const periodEnd = payrollSummary?.lastPaycheck?.periodEnd || tierData?.periodEnd;
    if (periodStart && periodEnd) {
      payPeriodLabel.value = `${periodStart} – ${periodEnd}`;
    }

    briefing.value = {
      ...briefing.value,
      tasks: baseSection({
        title: 'Assigned tasks',
        icon: '☷',
        tone: 'green',
        count: taskRows.length,
        countLabel: 'open',
        items: taskRows.slice(0, 3).map((item) => {
          const dueAt = item.due_date || item.dueDate;
          const overdue = dueAt && new Date(dueAt).getTime() < Date.now();
          return {
            id: `task-${item.id}`,
            label: item.title || 'Assigned task',
            meta: dueAt ? `Due ${new Date(dueAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : '',
            badge: overdue ? 'PAST DUE' : null,
            badgeTone: overdue ? 'danger' : 'neutral'
          };
        }),
        action: 'View all tasks',
        to: `${prefix.value}/tasks`
      }),
      calendar: baseSection({
        title: 'Today’s schedule',
        icon: '▦',
        tone: 'blue',
        count: calendarRows.length,
        countLabel: 'scheduled',
        items: calendarRows,
        action: 'View full schedule',
        to: `${prefix.value}/my-schedule`
      }),
      notesToSign: baseSection({
        title: 'Notes to sign',
        icon: '✎',
        tone: 'orange',
        count: notesCount,
        countLabel: notesCount === 1 ? 'pending' : 'pending',
        items: notesCount > 0
          ? [{ id: 'notes-to-sign', label: `${notesCount} clinical note${notesCount === 1 ? '' : 's'} awaiting your signature`, meta: 'Open notes to sign' }]
          : [],
        action: 'Open notes to sign',
        to: `${prefix.value}/notes-to-sign`
      }),
      tickets: baseSection({
        title: 'Support tickets',
        icon: '◇',
        tone: 'slate',
        count: ticketRows.length,
        countLabel: 'open',
        items: ticketRows.slice(0, 3).map((item) => ({
          id: `ticket-${item.id}`,
          label: item.subject || `Support ticket #${item.id}`,
          meta: item.agency_name || '',
          badge: String(item.priority || '').toUpperCase() || null,
          badgeTone: String(item.priority || '').toLowerCase() === 'high' ? 'danger' : 'warning'
        })),
        action: 'View my tickets',
        to: `${prefix.value}/tickets`
      }),
      supervision: baseSection({
        title: 'Supervision today',
        icon: '◎',
        tone: 'blue',
        count: supervisionRows.length,
        countLabel: supervisionRows.length === 1 ? 'session' : 'sessions',
        items: supervisionRows,
        action: 'View supervision',
        to: `${prefix.value}/my-schedule`
      }),
      yearUpdate: baseSection({
        title: 'Year update',
        icon: '↻',
        tone: 'red',
        count: yearUpdatePending ? 1 : 0,
        countLabel: 'pending',
        items: yearUpdatePending
          ? [{ id: 'year-update', label: 'Complete your provider year update', meta: yearUpdateStatus?.schoolYear || '' }]
          : [],
        action: 'Continue year update',
        to: `${prefix.value}/provider/year-update/flow`
      }),
      overdueNotes: baseSection({
        title: 'Overdue documentation',
        icon: '△',
        tone: 'red',
        count: overdueNoteCount,
        countLabel: overdueNoteCount === 1 ? 'item' : 'items',
        items: overdueNoteCount > 0
          ? [{
            id: 'overdue-notes',
            label: `${overdueNoteCount} unpaid note${overdueNoteCount === 1 ? '' : 's'} from last pay period`,
            meta: [noNoteCount ? `${noNoteCount} missing` : '', draftCount ? `${draftCount} draft` : ''].filter(Boolean).join(' · '),
            badge: 'OVERDUE',
            badgeTone: 'danger'
          }]
          : [],
        action: 'Open payroll submit',
        to: `${prefix.value}/payroll/submit`
      })
    };

    if (phase2.some((request) => request.status === 'rejected')) {
      loadError.value = true;
    }
  } catch {
    if (generation === requestGeneration) loadError.value = true;
  } finally {
    if (generation === requestGeneration) {
      loading.value = false;
    }
  }
}

function dismiss() {
  if (dontShowAgain.value) {
    try { localStorage.setItem(storageKey(), '1'); } catch { /* ignore */ }
  }
  visible.value = false;
}

async function navigate(to) {
  dismiss();
  await nextTick();
  if (to) await router.push(to);
}

async function enterDashboard() {
  const path = providerBriefingDashboardPath(role.value, prefix.value);
  await navigate(path);
}

watch(
  () => [authStore.user?.id, props.loginTrigger],
  ([nextUserId, trigger]) => {
    if (!nextUserId || !isProviderLoginBriefingUser(authStore.user) || isDisabled()) {
      visible.value = false;
      return;
    }
    let freshFlag = false;
    try { freshFlag = sessionStorage.getItem('justLoggedIn') === 'true'; } catch { /* ignore */ }
    if (!trigger && !freshFlag) return;
    void loadBriefing();
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  requestGeneration += 1;
});
</script>

<style scoped>
.briefing-overlay {
  position: fixed;
  inset: 0;
  z-index: 10050;
  display: grid;
  place-items: center;
  padding: 22px;
  background: rgba(5, 17, 27, 0.87);
  backdrop-filter: blur(12px);
}
.briefing-modal {
  --brief-primary: #1f6b4a;
  --brief-secondary: #0f2f27;
  --brief-accent: #2f8c68;
  position: relative;
  width: min(1440px, 96vw);
  max-height: min(920px, 94vh);
  overflow: auto;
  border: 1px solid color-mix(in srgb, var(--brief-primary) 38%, #cbd5e1);
  border-radius: 20px;
  background: #f8fafc;
  color: #172033;
  box-shadow: 0 34px 90px rgba(0, 0, 0, 0.38);
}
.briefing-modal::before {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 5px;
  background: var(--brief-blend);
}
.briefing-brand-rail {
  position: absolute;
  left: 0;
  top: 5px;
  bottom: 66px;
  width: 92px;
  border-radius: 0 0 0 19px;
  background: color-mix(in srgb, var(--brief-secondary) 92%, #08111b);
}
.brand-logo-stack { display: flex; flex-direction: column; align-items: center; padding-top: 34px; }
.brand-logo-wrap {
  width: 50px;
  height: 50px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border: 3px solid color-mix(in srgb, var(--brief-secondary) 88%, #fff);
  border-radius: 50%;
  background: #fff;
  color: var(--brief-primary);
  font-size: 12px;
  font-weight: 900;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.18);
}
.brand-logo { width: 100%; height: 100%; object-fit: contain; }
.briefing-close {
  position: absolute;
  z-index: 2;
  top: 22px;
  right: 24px;
  border: 0;
  background: transparent;
  color: currentColor;
  font-size: 32px;
  font-weight: 300;
  line-height: 1;
  cursor: pointer;
}
.briefing-header {
  min-height: 128px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 28px;
  padding: 28px 92px 20px 126px;
  background: linear-gradient(115deg, color-mix(in srgb, var(--brief-primary) 8%, #fff), transparent 58%);
}
.briefing-eyebrow { color: var(--brief-primary); font-size: 12px; font-weight: 850; letter-spacing: .08em; text-transform: uppercase; }
.briefing-header h1 { margin: 4px 0 3px; font-size: clamp(25px, 2.2vw, 36px); line-height: 1.1; }
.briefing-header p { margin: 0; color: #526078; font-size: 14px; }
.briefing-date { display: flex; align-items: center; gap: 10px; min-width: 180px; font-size: 12px; }
.briefing-date span:last-child { display: flex; flex-direction: column; }
.briefing-date small { margin-top: 2px; color: #64748b; }
.date-icon { display: grid; place-items: center; width: 40px; height: 40px; border: 1px solid #d8dee9; border-radius: 8px; font-size: 23px; color: var(--brief-primary); background: rgba(255,255,255,.7); }
.briefing-loading { min-height: 430px; display: flex; align-items: center; justify-content: center; gap: 12px; color: #64748b; }
.briefing-spinner { width: 23px; height: 23px; border: 3px solid #dbe5e0; border-top-color: var(--brief-primary); border-radius: 50%; animation: briefing-spin .75s linear infinite; }
.briefing-warning { margin: 0 26px 12px 126px; padding: 9px 12px; border: 1px solid #fcd34d; border-radius: 8px; background: #fffbeb; color: #92400e; font-size: 12px; }
.briefing-layout { display: grid; grid-template-columns: minmax(0, 1fr) 310px; gap: 18px; padding: 0 28px 18px 126px; }
.briefing-main { min-width: 0; }
.briefing-card-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.briefing-card { min-height: 230px; display: flex; flex-direction: column; padding: 18px; border: 1px solid #dce2ea; border-radius: 12px; background: rgba(255,255,255,.92); box-shadow: 0 6px 24px rgba(15, 23, 42, .035); }
.card-header { display: flex; gap: 13px; align-items: center; margin-bottom: 12px; }
.card-icon { width: 48px; height: 48px; display: grid; place-items: center; border-radius: 10px; color: #fff; background: var(--card-color, #334155); font-size: 25px; }
.briefing-card--blue { --card-color: #245b9c; }
.briefing-card--orange { --card-color: #b3470b; }
.briefing-card--green { --card-color: #236747; }
.briefing-card--red { --card-color: #a51c1c; }
.briefing-card--slate { --card-color: #17333b; }
.card-kicker, .side-kicker { color: var(--card-color, #1e293b); font-size: 12px; font-weight: 850; letter-spacing: .025em; text-transform: uppercase; }
.card-count { margin-top: 2px; color: #475569; font-size: 12px; }
.card-count strong { margin-right: 5px; color: var(--card-color, #1e293b); font-size: 28px; }
.briefing-item { width: 100%; display: flex; align-items: center; gap: 9px; padding: 7px 0; border: 0; border-top: 1px solid #eef1f5; background: transparent; color: inherit; text-align: left; cursor: pointer; }
.briefing-item:hover .item-copy strong { color: var(--brief-primary); }
.item-dot { width: 6px; height: 6px; flex: 0 0 auto; border-radius: 50%; background: var(--card-color, #334155); }
.item-copy { min-width: 0; display: flex; flex: 1; flex-direction: column; }
.item-copy strong { overflow: hidden; color: inherit; font-size: 12px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.item-copy small { margin-top: 2px; overflow: hidden; color: #64748b; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.item-badge { flex: 0 0 auto; border-radius: 5px; padding: 3px 5px; background: #f1f5f9; color: #475569; font-size: 8px; font-weight: 850; }
.item-badge--danger { background: #fee2e2; color: #b91c1c; }
.item-badge--warning { background: #ffedd5; color: #c2410c; }
.card-link { display: flex; align-items: center; justify-content: space-between; width: 100%; margin-top: auto; padding: 12px 0 0; border: 0; background: transparent; color: var(--card-color, var(--brief-primary)); font-size: 12px; font-weight: 800; cursor: pointer; }
.all-clear-card { display: flex; align-items: center; gap: 14px; min-height: 120px; padding: 24px; border: 1px solid #dce2ea; border-radius: 12px; background: #fff; }
.all-clear-card > span { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 50%; background: #dcfce7; color: #166534; font-size: 22px; }
.all-clear-card div { display: flex; flex-direction: column; gap: 4px; }
.all-clear-card small { color: #64748b; }
.at-a-glance { display: grid; grid-template-columns: 1.2fr repeat(3, 1fr); margin-top: 14px; padding: 16px 18px; border: 1px solid #dce2ea; border-radius: 12px; background: rgba(255,255,255,.9); }
.glance-title { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 850; }
.glance-metric { display: flex; flex-direction: column; padding-left: 18px; border-left: 1px solid #dce2ea; }
.glance-metric strong { font-size: 20px; }
.glance-metric span { color: #64748b; font-size: 10px; }
.glance-metric small { color: #16803c; font-size: 9px; }
.briefing-side { display: flex; flex-direction: column; gap: 14px; }
.pay-card, .security-card { padding: 18px; border: 1px solid #dce2ea; border-radius: 12px; background: rgba(255,255,255,.9); }
.pay-card strong { display: block; margin-top: 8px; font-size: 14px; }
.pay-card small { display: block; margin-top: 4px; color: #64748b; font-size: 11px; }
.urgent-card { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 18px; border: 0; border-radius: 12px; background: #17202c; color: #fff; text-align: left; cursor: pointer; }
.urgent-icon { color: #fb6b52; font-size: 25px; }
.urgent-card span:nth-child(2) { font-size: 11px; }
.urgent-card small { display: block; margin-bottom: 7px; color: #fb6b52; font-size: 9px; font-weight: 850; text-transform: uppercase; }
.urgent-card strong { margin-right: 5px; font-size: 24px; }
.security-card { display: flex; gap: 12px; font-size: 12px; }
.security-card > span { color: var(--brief-primary); font-size: 22px; }
.security-card p { margin: 7px 0 0; color: #526078; font-size: 11px; line-height: 1.55; }
.briefing-footer { position: sticky; bottom: 0; z-index: 2; min-height: 66px; display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 10px 28px 10px 126px; border-top: 1px solid rgba(203, 213, 225, .35); border-radius: 0 0 19px 19px; background: color-mix(in srgb, var(--brief-secondary) 95%, #06111b); color: #fff; }
.dont-show-label { display: flex; align-items: center; gap: 9px; font-size: 11px; cursor: pointer; }
.dont-show-label input { width: 16px; height: 16px; accent-color: var(--brief-primary); }
.enter-dashboard { min-width: 245px; padding: 12px 20px; border: 1px solid rgba(255,255,255,.15); border-radius: 7px; background: var(--brief-blend); color: #fff; font-size: 13px; font-weight: 800; cursor: pointer; }
.briefing-fade-enter-active, .briefing-fade-leave-active { transition: opacity .18s ease; }
.briefing-fade-enter-active .briefing-modal, .briefing-fade-leave-active .briefing-modal { transition: transform .18s ease; }
.briefing-fade-enter-from, .briefing-fade-leave-to { opacity: 0; }
.briefing-fade-enter-from .briefing-modal, .briefing-fade-leave-to .briefing-modal { transform: translateY(12px) scale(.985); }
@keyframes briefing-spin { to { transform: rotate(360deg); } }

@media (max-width: 1100px) {
  .briefing-card-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .briefing-layout { grid-template-columns: minmax(0, 1fr) 280px; }
  .at-a-glance { grid-template-columns: repeat(2, 1fr); gap: 12px; }
  .glance-title { grid-column: 1 / -1; }
  .glance-metric { border-left: 0; padding-left: 0; }
}
@media (max-width: 760px) {
  .briefing-overlay { padding: 0; }
  .briefing-modal { width: 100vw; max-height: 100dvh; min-height: 100dvh; border: 0; border-radius: 0; }
  .briefing-brand-rail { display: none; }
  .briefing-header { min-height: auto; align-items: flex-start; flex-direction: column; padding: 30px 52px 16px 20px; }
  .briefing-date { min-width: 0; }
  .briefing-warning { margin-left: 20px; margin-right: 20px; }
  .briefing-layout { display: block; padding: 0 16px 100px; }
  .briefing-card-grid { grid-template-columns: 1fr; }
  .briefing-card { min-height: 210px; }
  .briefing-side { margin-top: 14px; }
  .briefing-footer { position: fixed; left: 0; right: 0; padding: 10px 14px; border-radius: 0; }
  .dont-show-label span { max-width: 150px; }
  .enter-dashboard { min-width: 155px; }
}
@media (prefers-reduced-motion: reduce) {
  .briefing-fade-enter-active, .briefing-fade-leave-active, .briefing-fade-enter-active .briefing-modal, .briefing-fade-leave-active .briefing-modal { transition: none; }
  .briefing-spinner { animation: none; }
}
</style>
