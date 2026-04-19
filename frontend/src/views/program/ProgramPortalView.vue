<template>
  <div class="program-portal" :class="{ 'is-dark': isDarkMode }">
    <PlatformPreviewBanner
      v-if="props.previewMode"
      :title="`Previewing ${programName} portal`"
      subtitle="Platform preview of the program portal."
    />

    <header class="pp-header">
      <div class="pp-header-row">
        <div class="pp-header-left">
          <div v-if="programLogoUrl" class="pp-logo">
            <img :src="programLogoUrl" alt="" />
          </div>
          <div>
            <p class="pp-eyebrow">Program portal</p>
            <h1 class="pp-title">{{ programName }}</h1>
            <p v-if="parentAgencyName" class="pp-subtitle">
              Affiliated with {{ parentAgencyName }}
            </p>
          </div>
        </div>
        <div class="pp-header-right">
          <button
            v-if="canShowOrgSettings"
            type="button"
            class="btn btn-secondary btn-sm"
            @click="showSettings = true"
            title="Program settings"
          >
            ⚙ Settings
          </button>
          <router-link
            v-if="canBackToOrgs"
            :to="`/${orgSlug}/admin/schools/overview?orgType=program`"
            class="btn btn-secondary btn-sm"
          >
            All programs
          </router-link>
          <label class="pp-dark-toggle" :title="isDarkMode ? 'Turn off dark mode' : 'Turn on dark mode'">
            <input type="checkbox" :checked="isDarkMode" @change="onDarkModeToggle" />
            <span>Dark</span>
          </label>
        </div>
      </div>
      <div
        v-if="bannerTexts.length"
        class="pp-banner"
        role="button"
        tabindex="0"
        @click="goToNotifications"
        @keydown.enter.prevent="goToNotifications"
        @keydown.space.prevent="goToNotifications"
        title="Open notifications"
      >
        <div class="pp-banner-track">
          <span v-for="(t, idx) in bannerLoop" :key="`${idx}-${t.slice(0, 16)}`" class="pp-banner-item">
            {{ t }}
            <span class="pp-banner-sep" aria-hidden="true"> • </span>
          </span>
        </div>
      </div>
    </header>

    <SurveyPromptCard v-if="authStore.user?.id && !props.previewMode" :splash="true" />

    <section v-if="loadError" class="pp-state error" role="alert">
      {{ loadError }}
      <button type="button" class="btn btn-secondary btn-sm" @click="reloadAll">Retry</button>
    </section>

    <section class="pp-hero" aria-label="Program at a glance">
      <div class="pp-hero-card kpi" v-for="kpi in kpiCards" :key="kpi.key">
        <span class="pp-kpi-label">{{ kpi.label }}</span>
        <span class="pp-kpi-value">
          <template v-if="loadingSummary && kpi.value === 0">—</template>
          <template v-else>{{ kpi.value }}</template>
        </span>
        <span v-if="kpi.hint" class="pp-kpi-hint">{{ kpi.hint }}</span>
      </div>
    </section>

    <FocusedClientBanner
      v-if="focusClientId"
      :client-id="focusClientId"
      :agency-id="parentAgencyId"
      :program-org-id="programOrganizationId"
      :program-slug="orgSlug"
      :program-events="events"
      @open-event="openEventPortal"
      @clear="clearFocusedClient"
    />

    <section class="pp-section pp-events-section">
      <header class="pp-section-head">
        <div>
          <h2 class="pp-section-title">Events</h2>
          <p class="pp-section-sub">
            All events scheduled under this program. Open one to manage schedule, providers, registrations, and chat.
          </p>
        </div>
        <div class="pp-section-actions">
          <div class="pp-tabs" role="tablist" aria-label="Filter events by status">
            <button
              v-for="t in statusTabs"
              :key="t.key"
              type="button"
              role="tab"
              :aria-selected="statusFilter === t.key ? 'true' : 'false'"
              class="pp-tab"
              :class="{ active: statusFilter === t.key }"
              @click="statusFilter = t.key"
            >
              {{ t.label }}
              <span class="pp-tab-count">{{ statusCounts[t.key] || 0 }}</span>
            </button>
          </div>
        </div>
      </header>

      <div v-if="loadingSummary && !events.length" class="pp-state muted">Loading events…</div>
      <div v-else-if="!filteredEvents.length" class="pp-state muted">
        <template v-if="!events.length">
          No events have been created for this program yet.
          <router-link
            v-if="canManagePrograms"
            class="btn btn-primary btn-sm"
            :to="`/${orgSlug}/admin/program-events`"
          >
            Open program admin
          </router-link>
        </template>
        <template v-else>No events match the {{ activeStatusLabel }} filter.</template>
      </div>
      <ul v-else class="pp-event-grid" role="list">
        <li v-for="ev in filteredEvents" :key="ev.companyEventId" class="pp-event-card">
          <div class="pp-event-card-top">
            <div class="pp-event-meta">
              <span class="pp-event-status" :class="`status-${ev.statusKey}`">
                {{ statusLabel(ev.statusKey) }}
              </span>
              <span v-if="ev.weekdays.length" class="pp-event-days">
                {{ ev.weekdays.map(weekdayShort).join(' · ') }}
              </span>
            </div>
            <h3 class="pp-event-title">{{ ev.title }}</h3>
            <p class="pp-event-dates">{{ formatDateRange(ev.startsAt, ev.endsAt) }}</p>
            <p v-if="ev.schoolName" class="pp-event-host">at {{ ev.schoolName }}</p>
          </div>
          <div class="pp-event-stats" role="list">
            <div class="pp-stat" role="listitem">
              <span class="pp-stat-val">{{ ev.registrationsCount }}</span>
              <span class="pp-stat-lbl">{{ ev.registrationsCount === 1 ? 'registration' : 'registrations' }}</span>
            </div>
            <div class="pp-stat" role="listitem">
              <span class="pp-stat-val">{{ ev.providersCount }}</span>
              <span class="pp-stat-lbl">{{ ev.providersCount === 1 ? 'provider' : 'providers' }}</span>
            </div>
            <div class="pp-stat" role="listitem">
              <span class="pp-stat-val">{{ ev.sessionsTotal }}</span>
              <span class="pp-stat-lbl">{{ ev.sessionsTotal === 1 ? 'session' : 'sessions' }}</span>
            </div>
            <div v-if="ev.sessionsToday > 0" class="pp-stat highlight" role="listitem">
              <span class="pp-stat-val">{{ ev.sessionsToday }}</span>
              <span class="pp-stat-lbl">today</span>
            </div>
          </div>
          <div class="pp-event-actions">
            <button type="button" class="btn btn-primary btn-sm" @click="openEventPortal(ev.companyEventId)">
              Open event portal →
            </button>
          </div>
        </li>
      </ul>
    </section>

    <section v-if="recentApplicants.length" class="pp-section pp-applicants-section">
      <header class="pp-section-head">
        <div>
          <h2 class="pp-section-title">Recent applicants</h2>
          <p class="pp-section-sub">Registrations submitted to this program in the last 14 days.</p>
        </div>
      </header>
      <ul class="pp-applicant-list" role="list">
        <li v-for="(a, idx) in recentApplicants" :key="`${a.clientId}-${a.companyEventId}-${idx}`" class="pp-applicant-row">
          <div class="pp-applicant-main">
            <span class="pp-applicant-name">{{ a.clientLabel }}</span>
            <span class="pp-applicant-event">→ {{ a.eventTitle }}</span>
          </div>
          <span class="pp-applicant-time">{{ relativeTime(a.createdAt) }}</span>
          <button type="button" class="btn btn-secondary btn-xs" @click="openEventPortal(a.companyEventId)">
            Open event
          </button>
        </li>
      </ul>
    </section>

    <section class="pp-section pp-tools-section">
      <header class="pp-section-head">
        <div>
          <h2 class="pp-section-title">Program tools</h2>
          <p class="pp-section-sub">Documents, messages, notifications, and administrative actions for the program.</p>
        </div>
      </header>
      <div class="pp-tool-grid">
        <button v-for="tool in toolCards" :key="tool.key" type="button" class="pp-tool-card" @click="openTool(tool.key)">
          <span class="pp-tool-icon" aria-hidden="true">{{ tool.icon }}</span>
          <span class="pp-tool-text">
            <span class="pp-tool-title">{{ tool.title }}</span>
            <span class="pp-tool-desc">{{ tool.description }}</span>
          </span>
          <span v-if="tool.badge" class="pp-tool-badge">{{ tool.badge }}</span>
        </button>
      </div>
    </section>

    <OrganizationSettingsModal
      v-if="showSettings && organizationId"
      :visible="showSettings"
      :organization-id="organizationId"
      :organization-slug="orgSlug"
      @close="showSettings = false"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useOrganizationStore } from '../../store/organization';
import { useAuthStore } from '../../store/auth';
import api from '../../services/api';
import { setDarkMode, getStoredDarkMode } from '../../utils/darkMode';
import SurveyPromptCard from '../../components/dashboard/SurveyPromptCard.vue';
import PlatformPreviewBanner from '../../components/admin/PlatformPreviewBanner.vue';
import OrganizationSettingsModal from '../../components/school/OrganizationSettingsModal.vue';
import FocusedClientBanner from './FocusedClientBanner.vue';

const props = defineProps({
  previewMode: {
    type: Boolean,
    default: false
  }
});

const route = useRoute();
const router = useRouter();
const organizationStore = useOrganizationStore();
const authStore = useAuthStore();

const showSettings = ref(false);
const isDarkMode = ref(getStoredDarkMode());

const parentAgencyId = ref(null);
const parentAgencyName = ref('');
const summaryData = ref({ summary: null, events: [], recentApplicants: [] });
const loadingSummary = ref(false);
const loadError = ref('');
const bannerTexts = ref([]);
const messagesUnread = ref(0);
const notificationsUnread = ref(0);
const intakeLinksCount = ref(0);
const statusFilter = ref('live');

const focusClientId = computed(() => {
  const raw = route.query?.focusClientId;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
});

const orgSlug = computed(() => String(route.params.organizationSlug || '').trim());
const organizationId = computed(() => organizationStore.organizationContext?.id || null);
const programOrganizationId = computed(() => organizationId.value);
const programName = computed(() => organizationStore.organizationContext?.name || 'Program');
const programLogoUrl = computed(() => organizationStore.organizationContext?.logoUrl || null);

const roleNorm = computed(() => String(authStore.user?.role || '').toLowerCase());
const isInternalRole = computed(() =>
  ['super_admin', 'admin', 'staff', 'support'].includes(roleNorm.value)
);
const canShowOrgSettings = computed(() => isInternalRole.value);
const canManagePrograms = computed(() => isInternalRole.value);
const canBackToOrgs = computed(() => isInternalRole.value);

const events = computed(() => Array.isArray(summaryData.value.events) ? summaryData.value.events : []);
const summary = computed(() => summaryData.value.summary || {});
const recentApplicants = computed(() =>
  Array.isArray(summaryData.value.recentApplicants) ? summaryData.value.recentApplicants : []
);

const kpiCards = computed(() => [
  { key: 'live', label: 'Live now', value: summary.value.activeEvents || 0 },
  { key: 'upcoming', label: 'Upcoming (30d)', value: summary.value.upcomingEvents || 0 },
  {
    key: 'registrations',
    label: 'Registrations',
    value: summary.value.totalRegistrations || 0,
    hint: 'across all events'
  },
  {
    key: 'providers',
    label: 'Providers on roster',
    value: summary.value.providersOnRoster || 0
  },
  {
    key: 'today',
    label: 'Sessions today',
    value: summary.value.sessionsToday || 0
  },
  {
    key: 'applicants',
    label: 'Recent applicants',
    value: summary.value.recentApplicantsCount || 0,
    hint: 'past 14 days'
  }
]);

const statusTabs = [
  { key: 'live', label: 'Live now' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past' },
  { key: 'all', label: 'All' }
];

const statusCounts = computed(() => ({
  live: events.value.filter((e) => e.statusKey === 'live').length,
  upcoming: events.value.filter((e) => e.statusKey === 'upcoming').length,
  past: events.value.filter((e) => e.statusKey === 'past').length,
  all: events.value.length
}));

const filteredEvents = computed(() => {
  if (statusFilter.value === 'all') return events.value;
  return events.value.filter((e) => e.statusKey === statusFilter.value);
});

const activeStatusLabel = computed(() => {
  const t = statusTabs.find((x) => x.key === statusFilter.value);
  return t ? t.label.toLowerCase() : statusFilter.value;
});

const bannerLoop = computed(() => {
  if (!bannerTexts.value.length) return [];
  return [...bannerTexts.value, ...bannerTexts.value];
});

const toolCards = computed(() => [
  {
    key: 'notifications',
    icon: '🔔',
    title: 'Notifications',
    description: 'Recent activity, applicants, alerts.',
    badge: notificationsUnread.value || null
  },
  {
    key: 'messages',
    icon: '💬',
    title: 'Messages',
    description: 'Chats with providers, staff, and program coordinators.',
    badge: messagesUnread.value || null
  },
  {
    key: 'intake-links',
    icon: '📝',
    title: 'Public intake links',
    description: 'QR codes & URLs parents use to register for events.',
    badge: intakeLinksCount.value || null
  },
  {
    key: 'admin-program',
    icon: '🛠️',
    title: 'Program admin',
    description: 'Create or edit events, manage schedules, sessions, and rosters.'
  },
  {
    key: 'public-events',
    icon: '🌐',
    title: 'Public events page',
    description: 'Open the public listing for this program.'
  },
  {
    key: 'tickets',
    icon: '🎟️',
    title: 'Support tickets',
    description: 'School / parent tickets routed to your team.'
  }
]);

const formatDateRange = (start, end) => {
  if (!start && !end) return '';
  const fmt = (val) => {
    if (!val) return '';
    try {
      const d = new Date(val);
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return '';
    }
  };
  const s = fmt(start);
  const e = fmt(end);
  if (s && e) return `${s} – ${e}`;
  return s || e || '';
};

const weekdayShort = (w) => {
  const m = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun' };
  return m[w] || w?.slice(0, 3) || w;
};

const statusLabel = (key) => {
  if (key === 'live') return 'Live now';
  if (key === 'upcoming') return 'Upcoming';
  return 'Past';
};

const relativeTime = (iso) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const diff = Date.now() - d.getTime();
    const min = Math.round(diff / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min}m ago`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.round(hr / 24);
    if (day === 1) return 'yesterday';
    if (day < 14) return `${day}d ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
};

const openEventPortal = (eventId) => {
  if (!eventId) return;
  const slug = orgSlug.value;
  if (slug) {
    router.push(`/${slug}/skill-builders/event/${eventId}`);
  } else {
    router.push(`/skill-builders/event/${eventId}`);
  }
};

const goToNotifications = () => {
  router.push('/notifications');
};

const openTool = (key) => {
  const slug = orgSlug.value;
  switch (key) {
    case 'notifications':
      router.push('/notifications');
      return;
    case 'messages':
      if (slug) router.push(`/${slug}/messages`);
      else router.push('/messages');
      return;
    case 'intake-links':
      if (slug) router.push(`/${slug}/admin/intake-links`);
      return;
    case 'admin-program':
      if (slug) router.push(`/${slug}/admin/program-events`);
      return;
    case 'public-events': {
      if (!slug) return;
      const url = `/${slug}/programs/${slug}/events`;
      window.open(url, '_blank', 'noopener');
      return;
    }
    case 'tickets':
      if (slug) router.push(`/${slug}/tickets`);
      return;
    default:
      return;
  }
};

const clearFocusedClient = () => {
  const next = { ...route.query };
  delete next.focusClientId;
  router.replace({ path: route.path, query: next });
};

const onDarkModeToggle = (event) => {
  const enabled = !!event.target?.checked;
  isDarkMode.value = enabled;
  setDarkMode(enabled);
};

const fetchAffiliation = async () => {
  if (!organizationId.value) return;
  try {
    const r = await api.get(`/school-portal/${organizationId.value}/affiliation`, { skipGlobalLoading: true });
    const aid = r?.data?.active_agency_id ?? null;
    parentAgencyId.value = aid ? Number(aid) : null;
    if (parentAgencyId.value) {
      try {
        const a = await api.get(`/agencies/${parentAgencyId.value}`, { skipGlobalLoading: true });
        parentAgencyName.value = String(a?.data?.name || '').trim();
      } catch {
        parentAgencyName.value = '';
      }
    }
  } catch {
    parentAgencyId.value = null;
    parentAgencyName.value = '';
  }
};

const fetchSummary = async () => {
  if (!organizationId.value || !parentAgencyId.value) return;
  loadingSummary.value = true;
  loadError.value = '';
  try {
    const r = await api.get(`/skill-builders/program/${organizationId.value}/dashboard-summary`, {
      params: { agencyId: parentAgencyId.value },
      skipGlobalLoading: true
    });
    summaryData.value = {
      summary: r?.data?.summary || {},
      events: r?.data?.events || [],
      recentApplicants: r?.data?.recentApplicants || []
    };
    if (statusFilter.value === 'live' && (summaryData.value.summary?.activeEvents || 0) === 0) {
      statusFilter.value = (summaryData.value.summary?.upcomingEvents || 0) > 0 ? 'upcoming' : 'all';
    }
  } catch (err) {
    loadError.value = err?.response?.data?.error?.message || 'Failed to load program dashboard.';
    summaryData.value = { summary: null, events: [], recentApplicants: [] };
  } finally {
    loadingSummary.value = false;
  }
};

const fetchBanner = async () => {
  if (!organizationId.value) return;
  try {
    const r = await api.get(`/school-portal/${organizationId.value}/announcements/banner`, { skipGlobalLoading: true });
    const items = Array.isArray(r?.data?.items) ? r.data.items : [];
    bannerTexts.value = items
      .map((it) => String(it?.text || it?.message || it?.title || '').trim())
      .filter(Boolean);
  } catch {
    bannerTexts.value = [];
  }
};

const fetchUnreadCounts = async () => {
  if (!authStore.user?.id) return;
  try {
    const r = await api.get('/chat/threads', { skipGlobalLoading: true });
    const threads = Array.isArray(r?.data) ? r.data : (r?.data?.threads || []);
    messagesUnread.value = threads.reduce((acc, t) => acc + (Number(t?.unread_count) || 0), 0);
  } catch {
    messagesUnread.value = 0;
  }
  if (organizationId.value) {
    try {
      const r = await api.get(`/school-portal/${organizationId.value}/notifications/feed`, { skipGlobalLoading: true });
      const items = Array.isArray(r?.data?.items) ? r.data.items : [];
      notificationsUnread.value = items.filter((n) => !n?.is_read && !n?.is_resolved).length;
    } catch {
      notificationsUnread.value = 0;
    }
  }
};

const fetchIntakeLinks = async () => {
  if (!organizationId.value) return;
  try {
    const r = await api.get(`/public-intake/school/${organizationId.value}`, { skipGlobalLoading: true });
    const list = Array.isArray(r?.data?.links) ? r.data.links : (Array.isArray(r?.data) ? r.data : []);
    intakeLinksCount.value = list.length;
  } catch {
    intakeLinksCount.value = 0;
  }
};

const reloadAll = async () => {
  await fetchAffiliation();
  await Promise.allSettled([
    fetchSummary(),
    fetchBanner(),
    fetchUnreadCounts(),
    fetchIntakeLinks()
  ]);
};

watch(() => organizationId.value, async (id) => {
  if (id) {
    await reloadAll();
  }
}, { immediate: true });

watch(() => parentAgencyId.value, async (aid) => {
  if (aid && organizationId.value) {
    await fetchSummary();
  }
});

const handleVisibility = () => {
  if (document.visibilityState === 'visible') {
    void fetchSummary();
    void fetchUnreadCounts();
  }
};

onMounted(() => {
  setDarkMode(isDarkMode.value);
  document.addEventListener('visibilitychange', handleVisibility);
});

onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisibility);
});
</script>

<style scoped>
.program-portal {
  --pp-bg: #f5f6fb;
  --pp-card: #ffffff;
  --pp-border: #e5e7eb;
  --pp-text: #111827;
  --pp-muted: #6b7280;
  --pp-accent: #b45309; /* warm amber matches event portal */
  --pp-accent-bg: #fff7ed;
  --pp-success: #047857;
  --pp-danger: #b91c1c;
  --pp-radius: 14px;
  --pp-shadow: 0 1px 2px rgba(15, 23, 42, 0.05), 0 4px 12px rgba(15, 23, 42, 0.04);
  background: var(--pp-bg);
  min-height: 100vh;
  padding: 24px clamp(16px, 4vw, 48px);
  color: var(--pp-text);
}
.program-portal.is-dark {
  --pp-bg: #0f172a;
  --pp-card: #1e293b;
  --pp-border: #334155;
  --pp-text: #f1f5f9;
  --pp-muted: #94a3b8;
  --pp-accent: #fbbf24;
  --pp-accent-bg: #422006;
  --pp-success: #34d399;
  --pp-danger: #fca5a5;
}

.pp-header { margin-bottom: 16px; }
.pp-header-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.pp-header-left { display: flex; align-items: center; gap: 16px; }
.pp-logo {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  overflow: hidden;
  background: var(--pp-card);
  border: 1px solid var(--pp-border);
  display: flex; align-items: center; justify-content: center;
}
.pp-logo img { width: 100%; height: 100%; object-fit: cover; }
.pp-eyebrow {
  margin: 0 0 4px;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--pp-accent);
  font-weight: 600;
}
.pp-title { margin: 0; font-size: 28px; font-weight: 700; line-height: 1.1; }
.pp-subtitle { margin: 4px 0 0; color: var(--pp-muted); font-size: 14px; }
.pp-header-right { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.pp-dark-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--pp-muted);
  cursor: pointer;
}
.pp-banner {
  margin-top: 12px;
  background: var(--pp-accent-bg);
  border: 1px solid var(--pp-border);
  border-radius: var(--pp-radius);
  overflow: hidden;
  padding: 8px 16px;
  cursor: pointer;
}
.pp-banner-track {
  display: flex;
  white-space: nowrap;
  animation: pp-marquee 40s linear infinite;
}
.pp-banner-item { color: var(--pp-text); font-size: 14px; padding-right: 12px; }
.pp-banner-sep { color: var(--pp-accent); }
@keyframes pp-marquee {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}

.pp-state {
  background: var(--pp-card);
  border: 1px dashed var(--pp-border);
  padding: 20px;
  border-radius: var(--pp-radius);
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.pp-state.muted { color: var(--pp-muted); }
.pp-state.error { color: var(--pp-danger); border-color: var(--pp-danger); background: #fef2f2; }
.is-dark .pp-state.error { background: #450a0a; }

.pp-hero {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 12px;
  margin: 16px 0 24px;
}
.pp-hero-card.kpi {
  background: var(--pp-card);
  border: 1px solid var(--pp-border);
  border-radius: var(--pp-radius);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-shadow: var(--pp-shadow);
}
.pp-kpi-label {
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--pp-muted);
  font-weight: 600;
}
.pp-kpi-value { font-size: 28px; font-weight: 700; color: var(--pp-text); line-height: 1.05; }
.pp-kpi-hint { font-size: 12px; color: var(--pp-muted); }

.pp-section {
  background: var(--pp-card);
  border: 1px solid var(--pp-border);
  border-radius: var(--pp-radius);
  padding: 20px;
  margin-bottom: 20px;
  box-shadow: var(--pp-shadow);
}
.pp-section-head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-end;
  gap: 12px;
  margin-bottom: 16px;
}
.pp-section-title { margin: 0; font-size: 18px; font-weight: 700; }
.pp-section-sub { margin: 4px 0 0; color: var(--pp-muted); font-size: 13px; }

.pp-tabs { display: flex; gap: 4px; flex-wrap: wrap; }
.pp-tab {
  background: transparent;
  border: 1px solid var(--pp-border);
  color: var(--pp-text);
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.pp-tab.active {
  background: var(--pp-accent);
  color: #fff;
  border-color: var(--pp-accent);
}
.pp-tab-count {
  font-size: 11px;
  background: rgba(255,255,255,0.25);
  padding: 1px 6px;
  border-radius: 999px;
}
.pp-tab:not(.active) .pp-tab-count {
  background: var(--pp-bg);
  color: var(--pp-muted);
}

.pp-event-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
  list-style: none;
  padding: 0;
  margin: 0;
}
.pp-event-card {
  background: var(--pp-bg);
  border: 1px solid var(--pp-border);
  border-radius: var(--pp-radius);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: transform 0.1s ease, box-shadow 0.1s ease;
}
.pp-event-card:hover { transform: translateY(-1px); box-shadow: var(--pp-shadow); }
.pp-event-card-top { display: flex; flex-direction: column; gap: 4px; }
.pp-event-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 12px; }
.pp-event-status {
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.pp-event-status.status-live { background: #dcfce7; color: var(--pp-success); }
.pp-event-status.status-upcoming { background: var(--pp-accent-bg); color: var(--pp-accent); }
.pp-event-status.status-past { background: var(--pp-bg); color: var(--pp-muted); border: 1px solid var(--pp-border); }
.is-dark .pp-event-status.status-live { background: #064e3b; color: #6ee7b7; }
.pp-event-days { color: var(--pp-muted); }
.pp-event-title { margin: 4px 0 0; font-size: 16px; font-weight: 700; line-height: 1.25; }
.pp-event-dates { margin: 0; color: var(--pp-muted); font-size: 13px; }
.pp-event-host { margin: 0; color: var(--pp-muted); font-size: 12px; font-style: italic; }

.pp-event-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(60px, 1fr));
  gap: 8px;
}
.pp-stat {
  background: var(--pp-card);
  border: 1px solid var(--pp-border);
  border-radius: 10px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.pp-stat.highlight {
  background: var(--pp-accent-bg);
  border-color: var(--pp-accent);
}
.pp-stat-val { font-size: 18px; font-weight: 700; color: var(--pp-text); }
.pp-stat-lbl { font-size: 11px; color: var(--pp-muted); text-transform: uppercase; letter-spacing: 0.04em; }

.pp-event-actions { display: flex; justify-content: flex-end; }

.pp-applicant-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.pp-applicant-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: var(--pp-bg);
  border: 1px solid var(--pp-border);
  border-radius: 10px;
}
.pp-applicant-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.pp-applicant-name { font-weight: 600; }
.pp-applicant-event { color: var(--pp-muted); font-size: 13px; }
.pp-applicant-time { color: var(--pp-muted); font-size: 12px; white-space: nowrap; }

.pp-tool-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}
.pp-tool-card {
  background: var(--pp-bg);
  border: 1px solid var(--pp-border);
  border-radius: var(--pp-radius);
  padding: 14px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  text-align: left;
  cursor: pointer;
  position: relative;
  color: inherit;
  font: inherit;
}
.pp-tool-card:hover { border-color: var(--pp-accent); transform: translateY(-1px); transition: all 0.1s ease; }
.pp-tool-icon { font-size: 24px; line-height: 1; }
.pp-tool-text { display: flex; flex-direction: column; gap: 2px; }
.pp-tool-title { font-weight: 600; }
.pp-tool-desc { color: var(--pp-muted); font-size: 13px; }
.pp-tool-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  background: var(--pp-accent);
  color: #fff;
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 11px;
  font-weight: 600;
}

.btn { font: inherit; cursor: pointer; }
.btn-primary {
  background: var(--pp-accent); color: #fff; border: 1px solid var(--pp-accent);
  padding: 6px 12px; border-radius: 8px;
}
.btn-primary:hover { filter: brightness(0.95); }
.btn-secondary {
  background: var(--pp-card); color: var(--pp-text); border: 1px solid var(--pp-border);
  padding: 6px 12px; border-radius: 8px;
}
.btn-secondary:hover { border-color: var(--pp-accent); color: var(--pp-accent); }
.btn-sm { padding: 4px 10px; font-size: 13px; }
.btn-xs { padding: 2px 8px; font-size: 12px; }
</style>
