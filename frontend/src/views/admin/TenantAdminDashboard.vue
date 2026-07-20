<template>
  <div class="tenant-admin-dashboard" :style="brandVars">
    <header class="top-bar">
      <div class="top-bar-left">
        <BrandingLogo size="medium" :logo-url="agencyStore.currentAgency?.logo_url" />
        <div class="org-name">
          <h1>{{ agencyStore.currentAgency?.name || 'Admin Dashboard' }}</h1>
          <span class="role-badge">{{ userRoleLabel }}</span>
        </div>
      </div>

      <div class="top-bar-center">
        <div class="search-bar">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search clients, providers, docs..."
            @keyup.enter="performSearch"
          >
          <button class="search-btn" type="button" @click="performSearch" aria-label="Search">🔍</button>
        </div>
      </div>

      <div class="top-bar-right">
        <button
          class="notifications-bell"
          type="button"
          :class="{ 'has-unread': unreadCount > 0 }"
          @click="toggleNotifications"
        >
          Notifications
          <span v-if="unreadCount > 0" class="badge">{{ unreadCount }}</span>
        </button>

        <div class="user-profile" @click="toggleProfileMenu">
          <div class="avatar">{{ userInitials }}</div>
          <div class="user-info">
            <span class="name">{{ userName }}</span>
            <span class="role">{{ userRoleLabel }}</span>
          </div>
        </div>
      </div>

      <div v-if="showNotificationsPanel" class="notifications-panel" @click.stop>
        <div class="panel-header">
          <h3>Notifications</h3>
          <button class="view-all" type="button" @click="viewAllNotifications">View All</button>
        </div>
        <div v-if="notifications.length === 0" class="empty-state-sm">No notifications</div>
        <div
          v-for="notif in notifications.slice(0, 5)"
          :key="notif.id"
          class="notification-item"
          :class="notif.priority"
        >
          <div class="notif-icon">{{ getPriorityIcon(notif.priority) }}</div>
          <div>
            <div class="notif-title">{{ notif.title || notif.message }}</div>
            <div class="notif-time">{{ formatNotifTime(notif) }}</div>
          </div>
        </div>
      </div>
    </header>

    <div class="main-layout" @click="closeDropdowns">
      <nav class="sidebar">
        <div class="sidebar-section">
          <div class="section-header">CORE</div>
          <router-link :to="`/${slug}/admin-dashboard`" class="nav-item">Dashboard</router-link>
        </div>

        <div class="sidebar-section">
          <div class="section-header">CLIENTS</div>
          <router-link :to="`/${slug}/admin/clients`" class="nav-item">Client List</router-link>
          <router-link :to="`/${slug}/admin/guardians`" class="nav-item">Guardians</router-link>
          <router-link :to="`/${slug}/admin/intake-links`" class="nav-item">Applications</router-link>
        </div>

        <div class="sidebar-section">
          <div class="section-header">PEOPLE OPS</div>
          <router-link :to="`/${slug}/admin/users`" class="nav-item">Employees</router-link>
          <router-link :to="`/${slug}/admin/hiring`" class="nav-item">Job Applications</router-link>
          <router-link :to="`/${slug}/admin/payroll`" class="nav-item">Payroll</router-link>
        </div>

        <div class="sidebar-section">
          <div class="section-header">OPERATIONS</div>
          <router-link :to="ticketsPath" class="nav-item">Tickets</router-link>
          <router-link :to="`/${slug}/admin/communications`" class="nav-item">Communications</router-link>
          <router-link :to="`/${slug}/admin/unassigned-documents`" class="nav-item">Documentation</router-link>
          <router-link :to="`/${slug}/schedule`" class="nav-item">Scheduling</router-link>
          <router-link v-if="canSeeSchoolPortals" :to="`/${slug}/admin/school-portals-hub`" class="nav-item">School Portals</router-link>
          <router-link :to="`/${slug}/admin/company-events`" class="nav-item">Events</router-link>
          <router-link v-if="hasAffiliatedPrograms" :to="`/${slug}/admin/schools/overview?orgType=program`" class="nav-item">Programs</router-link>
        </div>

        <div class="sidebar-section">
          <div class="section-header">REPORTS</div>
          <router-link :to="`/${slug}/admin/agency-progress`" class="nav-item">Progress Reports</router-link>
          <router-link :to="`/${slug}/admin/payroll/reports`" class="nav-item">Payroll Reports</router-link>
        </div>

        <div class="sidebar-section">
          <div class="section-header">SYSTEM</div>
          <router-link :to="`/${slug}/admin/settings`" class="nav-item">Settings</router-link>
          <router-link :to="`/${slug}/admin/audit-center`" class="nav-item">Audit Logs</router-link>
          <router-link :to="notificationsPath" class="nav-item">Notifications</router-link>
        </div>

        <div class="sidebar-footer">
          <button type="button" class="logout-btn" @click="logout">Logout</button>
        </div>
      </nav>

      <main class="main-content">
        <div class="page-header">
          <div>
            <h1>Management Dashboard</h1>
            <p class="subtitle">Real-time overview of priority operations and actions.</p>
          </div>
          <div class="page-header-right">
            <span v-if="loading" class="loading-chip" aria-live="polite">Updating…</span>
            <time class="datetime">{{ formattedNow }}</time>
            <button type="button" class="customize-btn" @click="showCustomizeModal = true">
              Customize Dashboard
            </button>
          </div>
        </div>

        <AtAGlanceRow
          v-if="isVisible('atGlance')"
          :cards="glanceCards"
          @navigate="go"
        />

        <div class="mid-grid">
          <DocumentationAlertsCard
            v-if="isVisible('documentationAlerts')"
            :alerts="docAlerts"
            :view-all-to="`/${slug}/admin/unassigned-documents`"
            @navigate="go"
          />

          <div v-if="isVisible('quickActions')" class="qa-wrap panel">
            <QuickActionsSection
              ref="quickActionsRef"
              title="Quick Actions"
              context-key="tenant-ops-v3"
              compact
              :actions="quickActionsCatalog"
              :default-action-ids="defaultQuickActionIds"
              :icon-resolver="resolveQuickActionIcon"
              :badge-counts="quickActionBadges"
            />
          </div>
        </div>

        <TenantContextCards
          :show-school-updates="isVisible('schoolUpdates') && canSeeSchoolPortals"
          :show-events="isVisible('events')"
          :show-programs="isVisible('programs') && hasAffiliatedPrograms"
          :school-updates="schoolUpdatesFeed"
          :events="upcomingEvents"
          :program-stats="programStats"
          :paths="contextPaths"
          @navigate="go"
        />

        <OpsSummaryCards
          :show-communications="isVisible('communications')"
          :show-people-ops="isVisible('peopleOps')"
          :show-system-alerts="isVisible('systemAlerts')"
          :show-todays-schedule="isVisible('todaysSchedule')"
          :communications="commsSummary"
          :people-ops="peopleOpsSummary"
          :system-alerts="systemAlertsSummary"
          :schedule-slots="scheduleSlots"
          :schedule-loading="scheduleLoading"
          :paths="summaryPaths"
          @navigate="go"
        />
      </main>
    </div>

    <div v-if="showCustomizeModal" class="modal-overlay" @click.self="showCustomizeModal = false">
      <div class="modal" role="dialog" aria-labelledby="customize-title">
        <div class="modal-header">
          <h3 id="customize-title">Customize Dashboard</h3>
          <button type="button" class="btn-close" aria-label="Close" @click="showCustomizeModal = false">×</button>
        </div>
        <div class="modal-body">
          <p class="modal-intro">Choose which sections appear on your management dashboard.</p>
          <div class="section-toggles">
            <label
              v-for="item in sectionLabels"
              :key="item.key"
              class="toggle-row"
            >
              <input
                type="checkbox"
                :checked="isVisible(item.key)"
                @change="setSection(item.key, $event.target.checked)"
              >
              <span>{{ item.label }}</span>
            </label>
          </div>
          <div class="modal-actions-row">
            <button type="button" class="btn-secondary" @click="resetSections">Reset sections</button>
            <button type="button" class="btn-secondary" @click="openQuickActionsCustomizer">
              Customize Quick Actions…
            </button>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-primary" @click="showCustomizeModal = false">Done</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import { useNotificationStore } from '../../store/notifications';
import { useBrandingStore } from '../../store/branding';
import { useAdminDashboardPrefs, SECTION_LABELS } from '../../composables/useAdminDashboardPrefs';
import api from '../../services/api';
import BrandingLogo from '../../components/BrandingLogo.vue';
import QuickActionsSection from '../../components/admin/QuickActionsSection.vue';
import AtAGlanceRow from '../../components/admin/opsDashboard/AtAGlanceRow.vue';
import DocumentationAlertsCard from '../../components/admin/opsDashboard/DocumentationAlertsCard.vue';
import OpsSummaryCards from '../../components/admin/opsDashboard/OpsSummaryCards.vue';
import TenantContextCards from '../../components/admin/opsDashboard/TenantContextCards.vue';
import { canAccessSchoolPortalsSurfaces } from '../../utils/schoolPortalsAccess.js';
import {
  fetchCoverageWarnings,
  fetchProviderCoverageSummary
} from '../../services/schoolCoverageApi.js';

const router = useRouter();
const route = useRoute();
const agencyStore = useAgencyStore();
const authStore = useAuthStore();
const notificationStore = useNotificationStore();
const brandingStore = useBrandingStore();

const searchQuery = ref('');
const showNotificationsPanel = ref(false);
const showCustomizeModal = ref(false);
const loading = ref(false);
const scheduleLoading = ref(false);
const quickActionsRef = ref(null);
const nowTick = ref(Date.now());
let nowTimer = null;

const slug = computed(() =>
  route.params.organizationSlug
  || agencyStore.currentAgency?.slug
  || agencyStore.currentAgency?.portal_url
  || ''
);

const currentUser = computed(() => authStore.user || authStore.currentUser || {});
const userId = computed(() => currentUser.value?.id || currentUser.value?.email || null);

const { isVisible, setSection, resetSections } = useAdminDashboardPrefs({ userId });
const sectionLabels = SECTION_LABELS;

const userName = computed(() => {
  const u = currentUser.value;
  if (u.first_name && u.last_name) return `${u.first_name} ${u.last_name}`;
  return u.name || u.email || 'Admin';
});
const userInitials = computed(() => {
  const parts = userName.value.split(' ');
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : userName.value.slice(0, 2).toUpperCase();
});
const userRoleLabel = computed(() => {
  const role = String(currentUser.value?.role || '').toLowerCase();
  const map = {
    super_admin: 'Super Admin',
    admin: 'Agency Admin',
    support: 'Support',
    club_manager: 'Club Manager',
    provider_plus: 'Provider+',
    clinical_practice_assistant: 'Clinical Assistant'
  };
  return map[role] || 'Admin';
});

const brandVars = computed(() => {
  const primary = brandingStore.primaryColor || '#1f6b4a';
  return {
    '--ops-primary': primary,
    '--ops-sidebar': `color-mix(in srgb, ${primary} 78%, #041a12)`,
    '--ops-ink': '#0f172a',
    '--ops-muted': '#64748b'
  };
});

const formattedNow = computed(() => {
  try {
    return new Date(nowTick.value).toLocaleString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return '';
  }
});

const prefix = computed(() => (slug.value ? `/${slug.value}` : ''));
const ticketsPath = computed(() => `${prefix.value}/tickets`);
const notificationsPath = computed(() => `${prefix.value}/notifications`);

const summaryPaths = computed(() => ({
  prefix: prefix.value,
  communications: `${prefix.value}/admin/communications`,
  hiring: `${prefix.value}/admin/hiring`,
  notifications: notificationsPath.value,
  schedule: `${prefix.value}/schedule`
}));

const contextPaths = computed(() => ({
  schoolPortals: `${prefix.value}/admin/school-portals`,
  schoolPortalsHub: `${prefix.value}/admin/school-portals-hub`,
  caseloadHub: `${prefix.value}/admin/caseload-hub/schools-staff`,
  events: `${prefix.value}/admin/company-events`,
  companyEvents: `${prefix.value}/admin/company-events`,
  programs: `${prefix.value}/admin/schools/overview?orgType=program`,
  modules: `${prefix.value}/admin/modules`
}));

// Live metrics
const newTickets = ref(0);
const openTickets = ref(0);
const unreadMessages = ref(0);
const clientMessages = ref(0);
const lateNotes = ref(0);
const unsignedDocs = ref(0);
const unassignedDocs = ref(0);
const newApplications = ref(0);
const payrollSubmissions = ref(0);
const pendingEmployees = ref(0);
const activeEmployees = ref(0);
const deliveryQueue = ref(0);
const scheduleSlots = ref([]);
const schoolUpdatesFeed = ref([]);
const upcomingEvents = ref([]);
const programStats = ref({ programs: 0, learning: 0, modules: 0 });
const orgOverviewSummary = ref({ counts: { school: 0, program: 0, learning: 0, other: 0 } });
const canSeeSchoolPortals = ref(false);

const hasAffiliatedPrograms = computed(() =>
  Number(orgOverviewSummary.value?.counts?.program || 0)
  + Number(orgOverviewSummary.value?.counts?.learning || 0) > 0
);

const notifications = computed(() => notificationStore.notifications || []);
const unreadCount = computed(() => {
  const n = notificationStore.unreadNotifications;
  return typeof n === 'object' ? (n?.value ?? 0) : (n ?? 0);
});
const highPriorityCount = computed(() =>
  (notificationStore.notifications || []).filter((n) => {
    const p = String(n.priority || '').toLowerCase();
    return p === 'urgent' || p === 'high';
  }).length
);

const glanceCards = computed(() => [
  {
    key: 'new_tickets',
    label: 'New Tickets',
    value: newTickets.value,
    hint: 'Requires immediate attention',
    cta: 'View All',
    tone: 'danger',
    to: `${ticketsPath.value}?status=open`
  },
  {
    key: 'open_tickets',
    label: 'Open Tickets',
    value: openTickets.value,
    hint: 'Active support tickets',
    cta: 'View All',
    tone: 'warn',
    to: ticketsPath.value
  },
  {
    key: 'messages',
    label: 'Messages',
    value: unreadMessages.value,
    hint: 'Unread messages',
    cta: 'Open Inbox',
    tone: 'info',
    to: `${prefix.value}/messages`
  },
  {
    key: 'late_notes',
    label: 'Late Notes',
    value: lateNotes.value,
    hint: 'Notes past due',
    cta: 'Review',
    tone: 'purple',
    to: `${prefix.value}/admin/payroll`
  },
  {
    key: 'applications',
    label: 'New Applications',
    value: newApplications.value,
    hint: 'New job applications',
    cta: 'Review',
    tone: 'success',
    to: `${prefix.value}/admin/hiring`
  },
  {
    key: 'payroll',
    label: 'Payroll Submissions',
    value: payrollSubmissions.value,
    hint: 'Pending payroll items',
    cta: 'Review',
    tone: 'accent',
    to: `${prefix.value}/admin/payroll/pending`
  }
]);

const docAlerts = computed(() => {
  const rows = [];
  if (lateNotes.value > 0) {
    rows.push({
      key: 'late_notes',
      count: lateNotes.value,
      label: 'Late Progress Notes',
      hint: 'Requires immediate attention',
      tone: 'danger',
      to: `${prefix.value}/admin/payroll`
    });
  }
  if (unsignedDocs.value > 0) {
    rows.push({
      key: 'unsigned',
      count: unsignedDocs.value,
      label: 'Unsigned Documents',
      hint: 'Pending signatures',
      tone: 'warn',
      to: `${prefix.value}/admin/unassigned-documents`
    });
  }
  if (unassignedDocs.value > 0) {
    rows.push({
      key: 'unassigned',
      count: unassignedDocs.value,
      label: 'Unassigned Documents',
      hint: 'Needs client assignment',
      tone: 'info',
      to: `${prefix.value}/admin/unassigned-documents`
    });
  }
  return rows;
});

const commsSummary = computed(() => ({
  unread: unreadMessages.value,
  clientMessages: clientMessages.value,
  openTickets: openTickets.value
}));

const peopleOpsSummary = computed(() => ({
  newApplications: newApplications.value,
  onboarding: pendingEmployees.value,
  activeEmployees: activeEmployees.value
}));

const systemAlertsSummary = computed(() => ({
  highPriority: highPriorityCount.value,
  unread: unreadCount.value,
  deliveryQueue: deliveryQueue.value
}));

const opsRoles = ['admin', 'support', 'super_admin', 'staff', 'clinical_practice_assistant', 'provider_plus', 'club_manager'];

const defaultQuickActionIds = computed(() => {
  const ids = [
    'send_message',
    'create_ticket',
    'schedule_appointment',
    'manage_clients',
    'company_events'
  ];
  if (canSeeSchoolPortals.value) ids.push('school_portals');
  if (hasAffiliatedPrograms.value) ids.push('program_overview');
  ids.push('add_progress_note', 'review_applications', 'run_reports');
  return ids;
});

const quickActionsCatalog = computed(() => {
  const p = prefix.value;
  const all = [
    {
      id: 'send_message',
      title: 'Send Message',
      description: 'Open messages inbox',
      to: `${p}/messages`,
      emoji: '💬',
      iconKey: 'chats',
      category: 'Communications',
      roles: opsRoles
    },
    {
      id: 'create_ticket',
      title: 'Create New Ticket',
      description: 'Open a support ticket',
      to: `${p}/tickets?create=1`,
      emoji: '🎫',
      iconKey: 'communications',
      category: 'Operations',
      roles: opsRoles
    },
    {
      id: 'schedule_appointment',
      title: 'Schedule Appointment',
      description: 'Open schedule hub',
      to: `${p}/schedule`,
      emoji: '📅',
      iconKey: 'schedule',
      category: 'Scheduling',
      roles: opsRoles
    },
    {
      id: 'manage_clients',
      title: 'Manage Clients',
      description: 'Client list and profiles',
      to: `${p}/admin/clients`,
      emoji: '🧾',
      iconKey: 'manage_clients',
      category: 'Clients',
      roles: opsRoles
    },
    {
      id: 'company_events',
      title: 'Events',
      description: 'Company events and updates',
      to: `${p}/admin/company-events`,
      emoji: '🗓️',
      iconKey: 'company_events',
      category: 'Events',
      roles: opsRoles
    },
    {
      id: 'school_portals',
      title: 'School Portals',
      description: 'School updates, portals, and changes',
      to: `${p}/admin/school-portals-hub`,
      emoji: '🏫',
      iconKey: 'school_overview',
      category: 'Schools',
      roles: opsRoles
    },
    {
      id: 'program_overview',
      title: 'Program Overview',
      description: 'Affiliated programs and learning orgs',
      to: `${p}/admin/schools/overview?orgType=program`,
      emoji: '🧩',
      iconKey: 'program_overview',
      category: 'Programs',
      roles: opsRoles
    },
    {
      id: 'add_progress_note',
      title: 'Add Progress Note',
      description: 'Note Aid clinical notes',
      to: `${p}/admin/note-aid`,
      emoji: '📝',
      iconKey: 'clinical_note_generator',
      category: 'Clinical',
      roles: opsRoles
    },
    {
      id: 'review_applications',
      title: 'Review Applications',
      description: 'Hiring candidates queue',
      to: `${p}/admin/hiring`,
      emoji: '📋',
      iconKey: 'manage_users',
      category: 'People Ops',
      roles: ['admin', 'support', 'super_admin']
    },
    {
      id: 'run_reports',
      title: 'Run Reports',
      description: 'Training progress reports',
      to: `${p}/admin/agency-progress`,
      emoji: '📊',
      iconKey: 'progress_dashboard',
      category: 'Reports',
      roles: opsRoles
    },
    {
      id: 'payroll_reports',
      title: 'Payroll Reports',
      description: 'Payroll reporting tools',
      to: `${p}/admin/payroll/reports`,
      emoji: '💰',
      iconKey: 'payroll',
      category: 'Reports',
      roles: ['admin', 'support', 'super_admin']
    },
    {
      id: 'communications',
      title: 'Communications Center',
      description: 'Messages, tickets, engagement',
      to: `${p}/admin/communications`,
      emoji: '📡',
      iconKey: 'communications',
      category: 'Communications',
      roles: opsRoles
    },
    {
      id: 'unassigned_documents',
      title: 'Unassigned Documents',
      description: 'Assign submitted paperwork',
      to: `${p}/admin/unassigned-documents`,
      emoji: '📄',
      iconKey: 'manage_documents',
      category: 'Documentation',
      roles: opsRoles
    },
    {
      id: 'manage_users',
      title: 'Manage Users',
      description: 'Employees and staff accounts',
      to: `${p}/admin/users`,
      emoji: '👤',
      iconKey: 'manage_users',
      category: 'People Ops',
      roles: ['admin', 'support', 'super_admin']
    },
    {
      id: 'payroll_pending',
      title: 'Payroll Pending',
      description: 'Review pending submissions',
      to: `${p}/admin/payroll/pending`,
      emoji: '⏳',
      iconKey: 'payroll',
      category: 'People Ops',
      roles: ['admin', 'support', 'super_admin']
    },
    {
      id: 'manage_modules',
      title: 'Manage Modules',
      description: 'Training modules',
      to: `${p}/admin/modules`,
      emoji: '📚',
      iconKey: 'manage_modules',
      category: 'Programs',
      roles: opsRoles
    },
    {
      id: 'notifications',
      title: 'Notifications',
      description: 'Unified notification inbox',
      to: notificationsPath.value,
      emoji: '🔔',
      iconKey: 'notifications',
      category: 'System',
      roles: opsRoles
    }
  ];
  return all.filter((a) => {
    if (a.id === 'school_portals') return canSeeSchoolPortals.value;
    if (a.id === 'program_overview') return hasAffiliatedPrograms.value;
    return true;
  });
});

const quickActionBadges = computed(() => ({
  create_ticket: openTickets.value,
  review_applications: newApplications.value,
  payroll_pending: payrollSubmissions.value,
  unassigned_documents: unassignedDocs.value,
  send_message: unreadMessages.value
}));

const resolveQuickActionIcon = (action) => {
  try {
    return brandingStore.getAdminQuickActionIconUrl(action?.iconKey || action?.id, agencyStore.currentAgency || null);
  } catch {
    return null;
  }
};

const countLateNoteNotifications = () => {
  const types = new Set([
    'payroll_unpaid_notes_2_periods_old',
    'payroll_missing_notes_reminder',
    'payroll_unsigned_draft_notes',
    'late_progress_note',
    'late_notes'
  ]);
  return (notificationStore.notifications || []).filter((n) => {
    const t = String(n.type || n.notification_type || '').toLowerCase();
    const title = String(n.title || n.message || '').toLowerCase();
    return types.has(t) || title.includes('late note') || title.includes('late progress');
  }).length;
};

const countUnsignedNotifications = () => {
  return (notificationStore.notifications || []).filter((n) => {
    const t = String(n.type || n.notification_type || '').toLowerCase();
    const title = String(n.title || n.message || '').toLowerCase();
    return t.includes('unsigned') || title.includes('unsigned');
  }).length;
};

const withTimeout = (promise, ms = 7000) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      const t = setTimeout(() => {
        clearTimeout(t);
        reject(new Error('timeout'));
      }, ms);
    })
  ]);

const safeGet = (url, config = {}, ms = 7000) =>
  withTimeout(api.get(url, { ...config, skipGlobalLoading: true }), ms)
    .then((r) => r?.data ?? null)
    .catch(() => null);

const applyGlanceFromPayloads = ({ center, personal, openCountRes, metrics, specs }) => {
  openTickets.value = Number(
    center?.kpis?.openTickets
    ?? metrics?.open
    ?? openCountRes?.count
    ?? 0
  );
  newTickets.value = Number(
    metrics?.open
    ?? center?.tickets?.open
    ?? openCountRes?.count
    ?? openTickets.value
  );
  unreadMessages.value = Number(personal?.cards?.unread || 0);
  clientMessages.value = Number(
    personal?.cards?.clientMessages
    ?? center?.messagesMode?.unread
    ?? center?.queues?.sms
    ?? 0
  );
  deliveryQueue.value = Number(center?.kpis?.pendingInQueues || 0);
  activeEmployees.value = Number(specs?.activeEmployees || 0);
  pendingEmployees.value = Number(specs?.pendingEmployees || 0);
  lateNotes.value = countLateNoteNotifications();
  unsignedDocs.value = countUnsignedNotifications();
};

const loadDashboard = async () => {
  loading.value = true;
  const agencyId = agencyStore.currentAgency?.id
    || (typeof agencyStore.currentAgency === 'object' ? agencyStore.currentAgency?.value?.id : null);
  const params = agencyId ? { agencyId } : {};

  const agency = agencyStore.currentAgency || {};
  const pb = brandingStore.platformBranding || {};
  canSeeSchoolPortals.value = canAccessSchoolPortalsSurfaces({
    userRole: currentUser.value?.role,
    agencyFeatureFlags: agency.feature_flags ?? agency.featureFlags,
    platformAvailableAgencyFeaturesJson: pb.available_agency_features_json ?? pb.availableAgencyFeaturesJson,
    tenantAvailableAgencyFeaturesOverrideJson:
      agency.tenant_available_agency_features_json ?? agency.tenantAvailableAgencyFeaturesJson
  });

  // Notifications are best-effort and must not block the first paint.
  notificationStore.fetchNotifications?.().catch(() => {});
  notificationStore.fetchCounts?.().catch(() => {});

  if (!agencyId) {
    loading.value = false;
    return;
  }

  try {
    // Phase 1 — glance metrics only (fast path)
    const [center, personal, openCountRes, metrics, specs] = await Promise.all([
      safeGet('/communications/center-summary', { params }, 6000),
      safeGet('/messages/dashboard-summary', { params }, 6000),
      safeGet('/support-tickets/count', { params: { ...params, status: 'open' } }, 6000),
      safeGet('/support-tickets/metrics', { params }, 6000),
      safeGet('/dashboard/agency-specs', { params }, 6000)
    ]);
    applyGlanceFromPayloads({ center, personal, openCountRes, metrics, specs });
  } finally {
    loading.value = false;
  }

  // Phase 2 — secondary panels (no blocking overlay)
  scheduleLoading.value = true;
  try {
    const formatWhen = (raw) => {
      if (!raw) return '';
      try {
        return new Date(raw).toLocaleString([], {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        });
      } catch {
        return '';
      }
    };

    const startOfTodayMs = (() => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    })();

    const isSchoolEventType = (eventType) => String(eventType || '').toLowerCase().startsWith('school_');
    const isProgramEventType = (eventType) => {
      const t = String(eventType || '').toLowerCase();
      return t.startsWith('program_')
        || t === 'guardian_program_class'
        || t === 'skills_group'
        || t === 'skill_builders';
    };

    const eventPortalPath = (e) => {
      const id = e.id;
      const et = e.eventType || e.event_type;
      if (isSchoolEventType(et)) {
        return `${prefix.value}/admin/caseload-hub/events?eventId=${id}&tab=list`;
      }
      if (isProgramEventType(et) || e.organizationId || e.programOrganizationSlug) {
        return `${prefix.value}/skill-builders/event/${id}`;
      }
      return `/company-events/${id}`;
    };

    const eventKind = (e) => {
      const et = e.eventType || e.event_type;
      if (isSchoolEventType(et)) return 'school';
      if (isProgramEventType(et) || e.organizationType === 'program' || e.organizationType === 'learning') {
        return 'program';
      }
      return 'org';
    };

    const [
      sched,
      unassigned,
      hiring,
      payrollPending,
      orgOverview,
      companyEvents,
      modulesRes,
      coverageWarnings,
      providerCoverage
    ] = await Promise.all([
      safeGet('/dashboard/schedule-snapshot', {
        params: { agencyId, date: new Date().toISOString().split('T')[0] }
      }, 8000),
      safeGet('/unassigned-documents', { params }, 8000),
      safeGet('/hiring/candidates', {
        params: { agencyId, status: 'PROSPECTIVE', stageFilter: 'active' }
      }, 8000),
      safeGet('/payroll/pending-submissions-summary', { params }, 8000),
      safeGet('/dashboard/org-overview-summary', { params }, 8000),
      safeGet(`/agencies/${agencyId}/company-events`, {}, 8000),
      safeGet('/modules', {}, 8000),
      canSeeSchoolPortals.value
        ? withTimeout(fetchCoverageWarnings(agencyId), 8000).catch(() => null)
        : Promise.resolve(null),
      canSeeSchoolPortals.value
        ? withTimeout(fetchProviderCoverageSummary(agencyId), 8000).catch(() => null)
        : Promise.resolve(null)
    ]);

    if (Array.isArray(unassigned)) {
      unassignedDocs.value = unassigned.length;
    } else if (Array.isArray(unassigned?.rows)) {
      unassignedDocs.value = unassigned.rows.length;
    } else {
      unassignedDocs.value = Number(unassigned?.count || 0);
    }

    if (Array.isArray(hiring)) {
      newApplications.value = hiring.length;
    } else if (Array.isArray(hiring?.candidates)) {
      newApplications.value = hiring.candidates.length;
    } else {
      newApplications.value = Number(hiring?.count || 0);
    }

    payrollSubmissions.value = Number(payrollPending?.totalCount || 0);
    scheduleSlots.value = Array.isArray(sched?.sessions) ? sched.sessions : [];

    orgOverviewSummary.value = orgOverview?.counts
      ? orgOverview
      : { counts: { school: 0, program: 0, learning: 0, other: 0, ...(orgOverview?.counts || {}) } };

    const caseloadBase = `${prefix.value}/admin/caseload-hub/schools-staff`;
    const warningTypesWanted = new Set([
      'waitlist_no_capacity',
      'waitlist_unused_capacity',
      'clients_without_provider',
      'clients_without_service_day',
      'unstaffed_school_days',
      'school_nearing_capacity'
    ]);

    const warningFeed = (Array.isArray(coverageWarnings?.items) ? coverageWarnings.items : [])
      .filter((item) => warningTypesWanted.has(String(item.type || '')))
      .map((item) => {
        const type = String(item.type || '');
        let kind = 'caseload';
        let cta = 'Review';
        if (type === 'waitlist_no_capacity') {
          kind = 'waitlist';
          cta = 'Needs Therapist';
        } else if (type === 'waitlist_unused_capacity') {
          kind = 'waitlist';
          cta = 'Review Waitlist';
        } else if (type === 'school_nearing_capacity') {
          kind = 'capacity';
          cta = 'View Capacity';
        }
        const path = item.resolutionPath
          ? (String(item.resolutionPath).startsWith('/')
            ? `${prefix.value}${item.resolutionPath}`
            : item.resolutionPath)
          : `${caseloadBase}?schoolId=${item.schoolId || ''}`;
        return {
          id: item.id || `warn-${type}-${item.schoolId}`,
          kind,
          title: item.title || 'School update',
          body: item.message || '',
          meta: [item.schoolName, item.severity, item.count != null ? `${item.count}` : null]
            .filter(Boolean)
            .join(' · '),
          sortMs: type === 'waitlist_no_capacity' ? Date.now() + 2
            : (type.startsWith('waitlist') || type === 'clients_without_provider' ? Date.now() + 1 : Date.now()),
          severityRank: item.severity === 'critical' ? 0 : 1,
          to: path,
          cta
        };
      });

    const fullClinicianFeed = (Array.isArray(providerCoverage?.providers) ? providerCoverage.providers : [])
      .filter((p) => Number(p.slotsTotal || 0) > 0 && Number(p.slotsAvailable || 0) === 0)
      .slice(0, 8)
      .map((p) => ({
        id: `clinician-full-${p.providerId}`,
        kind: 'full',
        title: `${p.name || 'Clinician'} filled all spots`,
        body: `${p.slotsUsed || p.slotsTotal || 0}/${p.slotsTotal || 0} slots used`
          + (p.assignedSchools ? ` across ${p.assignedSchools} school(s)` : ''),
        meta: 'Capacity full',
        sortMs: Date.now(),
        severityRank: 2,
        to: `${caseloadBase}?tab=by-person&providerId=${p.providerId}`,
        cta: 'View Clinician'
      }));

    const schoolNotifTypes = new Set([
      'school_provider_availability_confirmed',
      'school_provider_availability_updated',
      'school_provider_slot_verification_requested',
      'school_provider_slot_verification_completed',
      'school_availability_request_pending',
      'school_availability_request_approved',
      'school_availability_request_denied',
      'client_assigned'
    ]);

    const isSchoolStaffNotif = (n) => {
      const t = String(n.type || n.notification_type || '').toLowerCase();
      if (t !== 'program_reminder') return false;
      const hay = `${n.title || ''} ${n.message || ''}`.toLowerCase();
      return hay.includes('school staff');
    };

    const notifFeed = (notificationStore.notifications || [])
      .filter((n) => {
        const t = String(n.type || n.notification_type || '').toLowerCase();
        return schoolNotifTypes.has(t) || isSchoolStaffNotif(n);
      })
      .slice(0, 12)
      .map((n) => {
        const t = String(n.type || n.notification_type || '').toLowerCase();
        const staff = isSchoolStaffNotif(n);
        const kind = staff
          ? 'staff'
          : (t === 'client_assigned' ? 'caseload' : 'slots');
        const relatedUserId = n.related_entity_id || n.relatedEntityId || n.entity_id;
        let to = `${caseloadBase}`;
        if (staff && relatedUserId) to = `${prefix.value}/admin/users/${relatedUserId}`;
        else if (t.includes('availability') || t.includes('slot')) {
          to = `${prefix.value}/admin/availability-intake?agencyId=${agencyId}&tab=school`;
        }
        return {
          id: `notif-${n.id}`,
          kind,
          title: n.title || (staff ? 'School staff update' : 'School caseload update'),
          body: n.message || n.body || '',
          meta: formatWhen(n.created_at || n.createdAt) || 'Notification',
          sortMs: new Date(n.created_at || n.createdAt || 0).getTime() || 0,
          severityRank: staff ? 1 : 2,
          to,
          cta: staff ? 'View User' : 'Open'
        };
      });

    schoolUpdatesFeed.value = [...warningFeed, ...fullClinicianFeed, ...notifFeed]
      .sort((a, b) => {
        const sr = (a.severityRank ?? 9) - (b.severityRank ?? 9);
        if (sr !== 0) return sr;
        return (b.sortMs || 0) - (a.sortMs || 0);
      })
      .slice(0, 10);

    const companyEventsRaw = Array.isArray(companyEvents)
      ? companyEvents
      : (Array.isArray(companyEvents?.events) ? companyEvents.events : []);

    upcomingEvents.value = companyEventsRaw
      .filter((e) => e?.isActive !== false)
      .map((e) => {
        const start = e.startsAt || e.starts_at || e.start_at || e.start_date || e.event_date;
        const end = e.endsAt || e.ends_at || e.end_at;
        const startMs = start ? new Date(start).getTime() : 0;
        const endMs = end ? new Date(end).getTime() : 0;
        const kind = eventKind(e);
        const orgLabel = e.organizationName || e.schoolName || e.location || '';
        const typeLabel = kind === 'program'
          ? 'Program event'
          : (kind === 'school' ? 'School event' : 'Organization event');
        const when = formatWhen(start);
        return {
          id: `evt-${e.id}`,
          kind,
          title: e.title || e.name || `Event ${e.id}`,
          subtitle: [orgLabel, String(e.description || '').trim().slice(0, 120)].filter(Boolean).join(' — ')
            || typeLabel,
          meta: [typeLabel, when, e.location || e.eventLocationName || null].filter(Boolean).join(' · '),
          startMs,
          endMs,
          to: eventPortalPath(e),
          cta: 'Event Portal'
        };
      })
      .filter((e) => {
        if (!e.startMs) return true;
        // Include today and future; still-running events whose end is today/future also count.
        if (e.endMs && e.endMs >= startOfTodayMs) return true;
        return e.startMs >= startOfTodayMs;
      })
      .sort((a, b) => (a.startMs || Number.MAX_SAFE_INTEGER) - (b.startMs || Number.MAX_SAFE_INTEGER))
      .slice(0, 8);

    const modulesList = Array.isArray(modulesRes)
      ? modulesRes
      : (Array.isArray(modulesRes?.modules) ? modulesRes.modules : []);
    programStats.value = {
      programs: Number(orgOverviewSummary.value?.counts?.program || 0),
      learning: Number(orgOverviewSummary.value?.counts?.learning || 0),
      modules: modulesList.length
    };

    lateNotes.value = countLateNoteNotifications();
    unsignedDocs.value = countUnsignedNotifications();
  } finally {
    scheduleLoading.value = false;
  }
};

onMounted(() => {
  nowTimer = setInterval(() => { nowTick.value = Date.now(); }, 30000);
  loadDashboard();
});

onUnmounted(() => {
  if (nowTimer) clearInterval(nowTimer);
});

const go = (to) => {
  if (!to) return;
  router.push(to);
};

const toggleNotifications = () => {
  showNotificationsPanel.value = !showNotificationsPanel.value;
};
const toggleProfileMenu = () => {
  showNotificationsPanel.value = false;
};
const closeDropdowns = () => {
  showNotificationsPanel.value = false;
};

const performSearch = () => {
  if (searchQuery.value.trim() && slug.value) {
    router.push({ path: `/${slug.value}/admin/clients`, query: { q: searchQuery.value } });
    searchQuery.value = '';
  }
};

const viewAllNotifications = () => {
  showNotificationsPanel.value = false;
  go(notificationsPath.value);
};

const getPriorityIcon = (priority) => {
  if (priority === 'urgent') return '⚠️';
  if (priority === 'high') return '🔴';
  return 'ℹ️';
};

const formatNotifTime = (notif) => {
  const raw = notif.time || notif.created_at;
  if (!raw) return '';
  try {
    return new Date(raw).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return String(raw);
  }
};

const openQuickActionsCustomizer = () => {
  showCustomizeModal.value = false;
  // Ensure Quick Actions section is visible so the customizer has a host
  if (!isVisible('quickActions')) setSection('quickActions', true);
  requestAnimationFrame(() => {
    quickActionsRef.value?.openCustomizer?.();
  });
};

const logout = () => {
  authStore.logout();
};

</script>

<style scoped>
.tenant-admin-dashboard {
  min-height: 100vh;
  background:
    radial-gradient(1200px 500px at 10% -10%, color-mix(in srgb, var(--ops-primary, #1f6b4a) 12%, transparent), transparent),
    radial-gradient(900px 400px at 90% 0%, color-mix(in srgb, var(--ops-primary, #1f6b4a) 8%, transparent), transparent),
    #f4f7f5;
  font-family: system-ui, -apple-system, sans-serif;
  color: var(--ops-ink, #0f172a);
}

.top-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 20px;
  background: rgba(255, 255, 255, 0.9);
  border-bottom: 1px solid color-mix(in srgb, var(--ops-primary, #1f6b4a) 14%, #e2e8f0);
  position: relative;
  flex-wrap: wrap;
}
.top-bar-left, .top-bar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.top-bar-center { flex: 1; min-width: 220px; }
.org-name h1 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 800;
}
.role-badge {
  font-size: 11px;
  font-weight: 700;
  color: var(--ops-primary, #1f6b4a);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.search-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 8px 12px;
  max-width: 520px;
}
.search-bar input {
  border: none;
  outline: none;
  flex: 1;
  font-size: 14px;
  background: transparent;
}
.search-btn {
  border: none;
  background: none;
  cursor: pointer;
}
.notifications-bell {
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 10px;
  padding: 8px 12px;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  position: relative;
}
.notifications-bell.has-unread {
  border-color: color-mix(in srgb, var(--ops-primary, #1f6b4a) 40%, #e2e8f0);
}
.badge {
  margin-left: 6px;
  background: #dc2626;
  color: #fff;
  border-radius: 999px;
  padding: 1px 7px;
  font-size: 11px;
}
.user-profile {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.avatar {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ops-primary, #1f6b4a) 18%, #fff);
  color: var(--ops-primary, #1f6b4a);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 12px;
}
.user-info {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}
.user-info .name { font-size: 13px; font-weight: 700; }
.user-info .role { font-size: 11px; color: #64748b; }

.notifications-panel {
  position: absolute;
  right: 20px;
  top: calc(100% - 4px);
  width: min(360px, calc(100vw - 40px));
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.12);
  z-index: 40;
  padding: 12px;
}
.notifications-panel .panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.notifications-panel h3 { margin: 0; font-size: 14px; }
.view-all {
  border: none;
  background: none;
  color: var(--ops-primary, #1f6b4a);
  font-weight: 700;
  cursor: pointer;
  font-size: 12px;
}
.notification-item {
  display: flex;
  gap: 8px;
  padding: 8px;
  border-radius: 10px;
}
.notification-item:hover { background: #f8fafc; }
.notif-title { font-size: 13px; font-weight: 600; }
.notif-time { font-size: 11px; color: #94a3b8; }
.empty-state-sm { font-size: 13px; color: #94a3b8; padding: 12px; }

.main-layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  min-height: calc(100vh - 120px);
}
@media (max-width: 960px) {
  .main-layout { grid-template-columns: 1fr; }
  .sidebar { display: none; }
}

.sidebar {
  background: var(--ops-sidebar, color-mix(in srgb, var(--ops-primary, #1f6b4a) 78%, #041a12));
  color: rgba(255, 255, 255, 0.9);
  padding: 18px 12px 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.section-header {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.45);
  padding: 0 10px 6px;
}
.nav-item {
  display: block;
  padding: 8px 10px;
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.85);
  text-decoration: none;
  font-size: 13px;
  font-weight: 600;
}
.nav-item:hover,
.nav-item.router-link-active {
  background: color-mix(in srgb, #fff 14%, var(--ops-primary, #1f6b4a));
  color: #fff;
}
.sidebar-footer { margin-top: auto; padding: 8px 10px; }
.logout-btn {
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: transparent;
  color: rgba(255, 255, 255, 0.8);
  border-radius: 8px;
  padding: 8px;
  cursor: pointer;
  font-weight: 700;
}
.logout-btn:hover { background: rgba(255, 255, 255, 0.08); color: #fff; }

.main-content {
  padding: 22px 24px 40px;
  position: relative;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 18px;
  flex-wrap: wrap;
}
.page-header h1 {
  margin: 0 0 4px;
  font-size: 1.6rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--ops-primary, #1f6b4a);
}
.subtitle {
  margin: 0;
  color: #64748b;
  font-size: 14px;
}
.page-header-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.datetime {
  font-size: 13px;
  color: #64748b;
  font-weight: 600;
}
.loading-chip {
  font-size: 12px;
  font-weight: 700;
  color: var(--ops-primary, #1f6b4a);
  background: color-mix(in srgb, var(--ops-primary, #1f6b4a) 12%, #fff);
  border: 1px solid color-mix(in srgb, var(--ops-primary, #1f6b4a) 28%, #e2e8f0);
  border-radius: 999px;
  padding: 4px 10px;
}
.customize-btn {
  background: var(--ops-primary, #1f6b4a);
  color: #fff;
  border: none;
  border-radius: 10px;
  padding: 10px 14px;
  font-weight: 800;
  font-size: 13px;
  cursor: pointer;
  box-shadow: 0 8px 20px color-mix(in srgb, var(--ops-primary, #1f6b4a) 28%, transparent);
}
.customize-btn:hover { filter: brightness(1.05); }

.mid-grid {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(320px, 1.4fr);
  gap: 14px;
  margin-bottom: 16px;
  align-items: start;
}
@media (max-width: 1100px) {
  .mid-grid { grid-template-columns: 1fr; }
}
.qa-wrap.panel {
  background: #fff;
  border: 1px solid color-mix(in srgb, var(--ops-primary, #1f6b4a) 14%, #e2e8f0);
  border-radius: 16px;
  padding: 16px 18px;
  box-shadow: 0 8px 24px color-mix(in srgb, var(--ops-primary, #1f6b4a) 5%, transparent);
}
.qa-wrap :deep(.actions-grid) {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
@media (max-width: 700px) {
  .qa-wrap :deep(.actions-grid) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 80;
  padding: 20px;
}
.modal {
  width: min(480px, 100%);
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.25);
  overflow: hidden;
}
.modal-header, .modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid #e2e8f0;
}
.modal-footer {
  border-bottom: none;
  border-top: 1px solid #e2e8f0;
  justify-content: flex-end;
}
.modal-header h3 { margin: 0; font-size: 1.05rem; }
.btn-close {
  border: none;
  background: none;
  font-size: 22px;
  cursor: pointer;
  color: #64748b;
  line-height: 1;
}
.modal-body { padding: 16px 18px; }
.modal-intro {
  margin: 0 0 12px;
  font-size: 13px;
  color: #64748b;
}
.section-toggles {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}
.toggle-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
  cursor: pointer;
}
.modal-actions-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.btn-secondary, .btn-primary {
  border-radius: 10px;
  padding: 9px 12px;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
}
.btn-secondary {
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #0f172a;
}
.btn-primary {
  border: none;
  background: var(--ops-primary, #1f6b4a);
  color: #fff;
}
</style>
