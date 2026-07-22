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
        <template v-if="isOperationsMode">
          <div class="sidebar-section">
            <div class="section-header">CORE</div>
            <router-link :to="`/${slug}/operations-dashboard`" class="nav-item">Dashboard</router-link>
            <router-link :to="`/${slug}/schedule`" class="nav-item">Schedule Hub</router-link>
            <router-link :to="`/${slug}/admin/communications`" class="nav-item">Communications</router-link>
          </div>
          <div class="sidebar-section">
            <div class="section-header">COVERAGE</div>
            <router-link
              v-if="canSeeSchoolPortals"
              :to="`/${slug}/admin/school-portals-hub`"
              class="nav-item"
            >School Portals</router-link>
            <router-link
              v-if="canSeeSchoolPortals"
              :to="`/${slug}/admin/caseload-hub/schools-staff`"
              class="nav-item"
            >Caseload Hub</router-link>
            <router-link :to="`/${slug}/admin/provider-availability`" class="nav-item">Provider Management</router-link>
            <router-link
              :to="`/${slug}/admin/office-approvals`"
              class="nav-item"
            >Office Approvals</router-link>
          </div>
          <div class="sidebar-section">
            <div class="section-header">PROGRAMS</div>
            <router-link
              v-if="hasAffiliatedPrograms"
              :to="`/${slug}/admin/schools/overview?orgType=program`"
              class="nav-item"
            >Program Overview</router-link>
            <router-link :to="`/${slug}/admin/program-events`" class="nav-item">Program Events</router-link>
            <router-link :to="`/${slug}/admin/agency-progress`" class="nav-item">Training Progress</router-link>
          </div>
          <div class="sidebar-section">
            <div class="section-header">PEOPLE</div>
            <router-link
              v-if="canSeeUsersNav"
              :to="`/${slug}/admin/users`"
              class="nav-item"
            >Users</router-link>
            <router-link
              v-if="canSeeClientsNav"
              :to="`/${slug}/admin/clients`"
              class="nav-item"
            >Clients</router-link>
            <router-link :to="`/${slug}/admin/tools-aids`" class="nav-item">Tools &amp; Aids</router-link>
            <router-link :to="{ path: `/${slug}/dashboard`, query: { tab: 'submit' } }" class="nav-item">Submit</router-link>
          </div>
          <div class="sidebar-section">
            <div class="section-header">SYSTEM</div>
            <router-link :to="notificationsPath" class="nav-item">Notifications</router-link>
          </div>
        </template>
        <template v-else>
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
            <router-link
              v-if="canAccessTeamBoardRole"
              to="/admin/presence"
              class="nav-item"
            >Presence / Team Board</router-link>
            <router-link :to="`/${slug}/admin/hiring`" class="nav-item">Job Applications</router-link>
            <router-link :to="`/${slug}/admin/payroll`" class="nav-item">Payroll</router-link>
          </div>

          <div class="sidebar-section">
            <div class="section-header">OPERATIONS</div>
            <router-link :to="ticketsPath" class="nav-item">Tickets</router-link>
            <router-link
              v-if="canSeeEscalations"
              :to="escalationsPath"
              class="nav-item"
            >Escalations</router-link>
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
        </template>

        <div class="sidebar-footer">
          <button type="button" class="logout-btn" @click="logout">Logout</button>
        </div>
      </nav>

      <main class="main-content">
        <div class="page-header">
          <div>
            <h1>{{ pageTitle }}</h1>
            <p class="subtitle">{{ pageSubtitle }}</p>
          </div>
          <div class="page-header-right">
            <span v-if="showLoadingChip" class="loading-chip" aria-live="polite">Updating…</span>
            <time class="datetime">{{ formattedNow }}</time>
            <button type="button" class="customize-btn" @click="showCustomizeModal = true">
              Customize Dashboard
            </button>
          </div>
        </div>

        <div class="dashboard-stack">
          <div
            v-if="isVisible('atGlance')"
            class="dash-block dash-block--full"
            :style="sectionStyle('atGlance')"
          >
            <AtAGlanceRow
              :cards="glanceCards"
              @navigate="go"
            />
          </div>

          <div
            v-if="isVisible('documentationAlerts') || isVisible('quickActions')"
            class="dash-block dash-block--full mid-grid"
            :class="{ 'mid-grid--qa-full': isOperationsMode || !isVisible('documentationAlerts') }"
            :style="midGridStyle"
          >
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
                :context-key="isOperationsMode ? 'operations-ops-v1' : 'tenant-ops-v5'"
                compact
                :actions="quickActionsCatalog"
                :default-action-ids="defaultQuickActionIds"
                :icon-resolver="resolveQuickActionIcon"
                :badge-counts="quickActionBadges"
              />
            </div>
          </div>

          <article
            v-if="showTeamBoardCard"
            class="panel team-board-panel"
            :style="sectionStyle('teamBoard')"
          >
            <div class="team-board-split">
              <div class="team-board-presence">
                <PresenceTeamPreview
                  embedded
                  title="Presence / Team Board"
                  :agency-id="currentAgencyId"
                  board-to="/admin/presence"
                />
                <p class="team-board-hint">
                  Source of truth for who is logged in, idle, timed out, or available while logged out.
                  Hover a name for details. Use Planned Outs for dated absences.
                </p>
              </div>
              <PlannedOutsPanel
                :agency-id="currentAgencyId"
                @open-full="go(plannedOutsPath)"
              />
            </div>
          </article>

          <EscalationsCard
            v-if="showEscalationsCard"
            class="escalations-dash-card"
            :agency-id="currentAgencyId"
            :desk-path="escalationsPath"
            :style="sectionStyle('escalations')"
            @navigate="go"
          />

          <TenantContextCards
            use-contents
            :show-school-updates="isVisible('schoolUpdates') && canSeeSchoolPortals"
            :show-events="isVisible('events')"
            :school-updates="schoolUpdatesFeed"
            :events="upcomingEvents"
            :paths="contextPaths"
            :order-styles="cardOrderStyles"
            @navigate="go"
          />

          <OpsSummaryCards
            use-contents
            :show-programs="isVisible('programs') && hasAffiliatedPrograms"
            :show-communications="isVisible('communications')"
            :show-people-ops="isVisible('peopleOps')"
            :show-system-alerts="isVisible('systemAlerts')"
            :show-todays-schedule="isVisible('todaysSchedule')"
            :program-stats="programStats"
            :communications="commsSummary"
            :people-ops="peopleOpsSummary"
            :system-alerts="systemAlertsSummary"
            :schedule-slots="scheduleSlots"
            :schedule-loading="scheduleLoading"
            :paths="{ ...summaryPaths, ...contextPaths }"
            :order-styles="cardOrderStyles"
            @navigate="go"
          />

          <section
            v-if="isOperationsMode && isVisible('momentum') && currentAgencyId && !isSuperadminPreview"
            class="dash-block dash-block--full momentum-panel"
            :style="sectionStyle('momentum')"
            aria-label="Your focus"
          >
          <h2 class="momentum-panel-title">
            {{ momentumListEnabled ? 'Your Momentum List' : 'Your Checklist' }}
          </h2>
          <MomentumListTab
            v-if="momentumListEnabled"
            :program-id="route.query?.programId ? parseInt(route.query.programId, 10) : null"
            :agency-id="currentAgencyId"
            :kudos-enabled="canSeeKudosWidget"
          />
          <UnifiedChecklistTab
            v-else
            :program-id="route.query?.programId ? parseInt(route.query.programId, 10) : null"
            :agency-id="currentAgencyId"
          />
          </section>
        </div>
      </main>
    </div>

    <div v-if="showCustomizeModal" class="modal-overlay" @click.self="showCustomizeModal = false">
      <div class="modal modal--wide" role="dialog" aria-labelledby="customize-title">
        <div class="modal-header">
          <h3 id="customize-title">Customize Dashboard</h3>
          <button type="button" class="btn-close" aria-label="Close" @click="showCustomizeModal = false">×</button>
        </div>
        <div class="modal-body">
          <p class="modal-intro">Show or hide sections, and use ↑ ↓ to rearrange cards.</p>
          <div class="section-toggles">
            <div
              v-for="item in customizeSectionLabels"
              :key="item.key"
              class="toggle-row toggle-row--reorder"
            >
              <label class="toggle-label">
                <input
                  type="checkbox"
                  :checked="isSectionChecked(item.key)"
                  :disabled="item.key === 'teamBoard' && roleLower === 'super_admin'"
                  @change="setSection(item.key, $event.target.checked)"
                >
                <span>{{ item.label }}</span>
                <span
                  v-if="item.key === 'teamBoard' && roleLower === 'super_admin'"
                  class="toggle-note"
                >Always on</span>
              </label>
              <div class="reorder-btns">
                <button
                  type="button"
                  class="reorder-btn"
                  :disabled="sectionIsFirst(item.key)"
                  aria-label="Move up"
                  @click="moveSectionUp(item.key)"
                >↑</button>
                <button
                  type="button"
                  class="reorder-btn"
                  :disabled="sectionIsLast(item.key)"
                  aria-label="Move down"
                  @click="moveSectionDown(item.key)"
                >↓</button>
              </div>
            </div>
          </div>
          <div class="modal-actions-row">
            <button type="button" class="btn-secondary" @click="resetDashboardLayout">Reset layout</button>
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
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import { useNotificationStore } from '../../store/notifications';
import { useBrandingStore } from '../../store/branding';
import {
  useAdminDashboardPrefs,
  OPERATIONS_SECTION_VISIBILITY,
  DEFAULT_SECTION_ORDER
} from '../../composables/useAdminDashboardPrefs';
import { useDashboardLayout } from '../../composables/useDashboardLayout';
import api from '../../services/api';
import BrandingLogo from '../../components/BrandingLogo.vue';
import QuickActionsSection from '../../components/admin/QuickActionsSection.vue';
import AtAGlanceRow from '../../components/admin/opsDashboard/AtAGlanceRow.vue';
import DocumentationAlertsCard from '../../components/admin/opsDashboard/DocumentationAlertsCard.vue';
import OpsSummaryCards from '../../components/admin/opsDashboard/OpsSummaryCards.vue';
import TenantContextCards from '../../components/admin/opsDashboard/TenantContextCards.vue';
import MomentumListTab from '../../components/dashboard/MomentumListTab.vue';
import UnifiedChecklistTab from '../../components/dashboard/UnifiedChecklistTab.vue';
import PresenceTeamPreview from '../../components/dashboard/PresenceTeamPreview.vue';
import EscalationsCard from '../../components/admin/opsDashboard/EscalationsCard.vue';
import PlannedOutsPanel from '../../components/admin/opsDashboard/PlannedOutsPanel.vue';
import { useMomentumListAddon } from '../../composables/useMomentumListAddon';
import { useSuperadminPlatformPreview } from '../../composables/useSuperadminPlatformPreview';
import { canAccessSchoolPortalsSurfaces, parseFeatureFlags, isTruthyFeatureFlag } from '../../utils/schoolPortalsAccess.js';
import { canAccessSkillBuildersSchoolProgramSurfaces } from '../../utils/skillBuildersSchoolProgramAccess.js';
import {
  fetchCoverageWarnings,
  fetchProviderCoverageSummary,
  fetchHubEvents
} from '../../services/schoolCoverageApi.js';

const props = defineProps({
  /** `operations` = CPA / Provider+ Operations Dashboard shell */
  variant: { type: String, default: 'management' }
});

const router = useRouter();
const route = useRoute();
const agencyStore = useAgencyStore();
const authStore = useAuthStore();
const notificationStore = useNotificationStore();
const brandingStore = useBrandingStore();
const { isSuperadminPreview } = useSuperadminPlatformPreview({ route, agencyStore });

const isOperationsMode = computed(() => String(props.variant || '').toLowerCase() === 'operations');

const searchQuery = ref('');
const showNotificationsPanel = ref(false);
const showCustomizeModal = ref(false);
const loading = ref(false);
const showLoadingChip = ref(false);
let loadingChipTimer = null;
const scheduleLoading = ref(false);
const quickActionsRef = ref(null);
const nowTick = ref(Date.now());
let nowTimer = null;

const setLoading = (on) => {
  loading.value = !!on;
  if (loadingChipTimer) {
    clearTimeout(loadingChipTimer);
    loadingChipTimer = null;
  }
  if (on) {
    // Avoid teasing: shell paints first; only show chip if load is actually slow.
    loadingChipTimer = setTimeout(() => {
      if (loading.value) showLoadingChip.value = true;
    }, 450);
  } else {
    showLoadingChip.value = false;
  }
};

const slug = computed(() =>
  route.params.organizationSlug
  || agencyStore.currentAgency?.slug
  || agencyStore.currentAgency?.portal_url
  || ''
);

const currentUser = computed(() => authStore.user || authStore.currentUser || {});
const userId = computed(() => currentUser.value?.id || currentUser.value?.email || null);
const roleLower = computed(() => String(currentUser.value?.role || '').toLowerCase());
const canSeeUsersNav = computed(() =>
  ['admin', 'support', 'super_admin', 'clinical_practice_assistant', 'club_manager'].includes(roleLower.value)
);
const canSeeClientsNav = computed(() =>
  ['admin', 'support', 'super_admin', 'staff', 'provider', 'provider_plus'].includes(roleLower.value)
);

const currentAgencyId = computed(() => agencyStore.currentAgency?.id ?? null);

const { isVisible, setSection, resetSections, sectionLabels } = useAdminDashboardPrefs({
  userId,
  agencyId: currentAgencyId,
  namespace: isOperationsMode.value ? 'operations' : 'tenant',
  defaults: isOperationsMode.value ? OPERATIONS_SECTION_VISIBILITY : undefined
});

const layoutKind = computed(() => (isOperationsMode.value ? 'tenant-ops-operations' : 'tenant-ops'));
const defaultOrderForLayout = computed(() => {
  const allowed = new Set(sectionLabels.map((s) => s.key));
  return DEFAULT_SECTION_ORDER.filter((k) => allowed.has(k));
});

const dashboardLayout = useDashboardLayout({
  kind: layoutKind,
  userId,
  agencyId: currentAgencyId,
  defaultOrder: defaultOrderForLayout.value.length
    ? [...defaultOrderForLayout.value]
    : [...DEFAULT_SECTION_ORDER]
});

watch(defaultOrderForLayout, (next) => {
  if (!Array.isArray(next) || !next.length) return;
  const current = dashboardLayout.order.value || [];
  const seen = new Set();
  const merged = [];
  current.forEach((id) => {
    if (next.includes(id) && !seen.has(id)) {
      merged.push(id);
      seen.add(id);
    }
  });
  next.forEach((id) => {
    if (!seen.has(id)) merged.push(id);
  });
  if (merged.join('|') !== current.join('|')) dashboardLayout.order.value = merged;
});

const sectionStyle = (id) => dashboardLayout.orderStyle(id);
const sectionIsFirst = (id) => dashboardLayout.isFirst(id);
const sectionIsLast = (id) => dashboardLayout.isLast(id);
const moveSectionUp = (id) => dashboardLayout.moveUp(id);
const moveSectionDown = (id) => dashboardLayout.moveDown(id);

/** Docs + Quick Actions share one row; use the earlier of the two section orders. */
const midGridStyle = computed(() => {
  const docsOn = isVisible('documentationAlerts');
  const qaOn = isVisible('quickActions');
  if (docsOn && qaOn) {
    return {
      order: Math.min(
        dashboardLayout.orderOf('documentationAlerts'),
        dashboardLayout.orderOf('quickActions')
      )
    };
  }
  if (docsOn) return sectionStyle('documentationAlerts');
  return sectionStyle('quickActions');
});

const cardOrderStyles = computed(() => {
  const keys = [
    'teamBoard',
    'escalations',
    'schoolUpdates',
    'events',
    'programs',
    'communications',
    'peopleOps',
    'systemAlerts',
    'todaysSchedule'
  ];
  const map = {};
  keys.forEach((key) => {
    map[key] = sectionStyle(key);
  });
  return map;
});

const canSeeEscalations = computed(() =>
  ['admin', 'support', 'super_admin', 'staff', 'clinical_practice_assistant', 'provider_plus'].includes(roleLower.value)
);
const showEscalationsCard = computed(() =>
  canSeeEscalations.value && isVisible('escalations') && !!currentAgencyId.value && !isOperationsMode.value
);
const escalationsPath = computed(() => `${prefix.value}/admin/escalations`);
const plannedOutsPath = computed(() => `${prefix.value}/admin/planned-outs`);

const agencyFlags = computed(() =>
  parseFeatureFlags(agencyStore.currentAgency?.feature_flags || agencyStore.currentAgency?.featureFlags)
);
const presenceEnabled = computed(() => agencyFlags.value?.presenceEnabled === true);
const canAccessTeamBoardRole = computed(() =>
  ['admin', 'support', 'super_admin'].includes(roleLower.value)
);
/** Super admin always sees Team Board on tenant ops; admin/support need presenceEnabled. */
const showTeamBoardCard = computed(() => {
  if (!canAccessTeamBoardRole.value) return false;
  if (roleLower.value === 'super_admin') return true;
  return presenceEnabled.value && isVisible('teamBoard');
});

const customizeSectionLabels = computed(() => {
  const byKey = new Map(
    sectionLabels
      .filter((item) => {
        if (item.key === 'escalations') return canSeeEscalations.value;
        if (item.key !== 'teamBoard') return true;
        if (roleLower.value === 'super_admin') return true;
        return canAccessTeamBoardRole.value && presenceEnabled.value;
      })
      .map((item) => [item.key, item])
  );
  const ordered = [];
  (dashboardLayout.order.value || []).forEach((key) => {
    if (byKey.has(key)) {
      ordered.push(byKey.get(key));
      byKey.delete(key);
    }
  });
  byKey.forEach((item) => ordered.push(item));
  return ordered;
});

const isSectionChecked = (key) => {
  if (key === 'teamBoard' && roleLower.value === 'super_admin') return true;
  return isVisible(key);
};

const resetDashboardLayout = () => {
  resetSections();
  dashboardLayout.resetOrder();
};

const { momentumListEnabled } = useMomentumListAddon(currentAgencyId);
const canSeeKudosWidget = computed(() => isTruthyFeatureFlag(agencyFlags.value?.kudosEnabled));

const pageTitle = computed(() =>
  (isOperationsMode.value ? 'Operations Dashboard' : 'Management Dashboard')
);
const pageSubtitle = computed(() =>
  (isOperationsMode.value
    ? 'Schedule coordination, school coverage, hiring pipeline, and program support.'
    : 'Real-time overview of priority operations and actions.')
);

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
  // Programs & events directory (Skill Builders / D11 Summer / company / school)
  events: `${prefix.value}/admin/program-events`,
  companyEvents: `${prefix.value}/admin/company-events`,
  schoolEvents: `${prefix.value}/admin/caseload-hub/events`,
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
const officeRequestCount = ref(0);
const inOnboardingCount = ref(0);
const completedOnboardingCount = ref(0);

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

const glanceCards = computed(() => {
  if (isOperationsMode.value) {
    return [
      {
        key: 'office_requests',
        label: 'Office Approvals',
        value: officeRequestCount.value,
        hint: 'Pending office requests & coverage conflicts',
        cta: 'Review',
        tone: officeRequestCount.value > 0 ? 'danger' : 'accent',
        to: `${prefix.value}/admin/office-approvals`
      },
      {
        key: 'new_hires',
        label: 'New Applications',
        value: newApplications.value,
        hint: 'Prospective candidates to review',
        cta: 'Review',
        tone: 'success',
        to: `${prefix.value}/admin/hiring`
      },
      {
        key: 'in_onboarding',
        label: 'In Onboarding',
        value: inOnboardingCount.value,
        hint: 'Hires moved into onboarding',
        cta: 'Open',
        tone: 'warn',
        to: `${prefix.value}/admin/users?status=ONBOARDING`
      },
      {
        key: 'completed_onboarding',
        label: 'Completed Onboarding',
        value: completedOnboardingCount.value,
        hint: 'Recently active employees',
        cta: 'View',
        tone: 'info',
        to: `${prefix.value}/admin/users?status=ACTIVE_EMPLOYEE`
      },
      {
        key: 'messages',
        label: 'Messages',
        value: unreadMessages.value,
        hint: 'Unread messages',
        cta: 'Open Inbox',
        tone: 'purple',
        to: `${prefix.value}/messages`
      },
      {
        key: 'training',
        label: 'Training Modules',
        value: programStats.value.modules || 0,
        hint: 'Open training progress',
        cta: 'Open',
        tone: 'accent',
        to: `${prefix.value}/admin/agency-progress`
      }
    ];
  }
  return [
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
  ];
});

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

const agencyFeatureFlags = computed(() =>
  parseFeatureFlags(agencyStore.currentAgency?.feature_flags || agencyStore.currentAgency?.featureFlags)
);

const clinicalNoteGeneratorEnabledForAgency = computed(() => {
  const flags = agencyFeatureFlags.value;
  if (flags?.noteAidEnabled === false && flags?.clinicalNoteGeneratorEnabled === false) return false;
  return true;
});

const bookClubEnabledForAgency = computed(() => isTruthyFeatureFlag(agencyFeatureFlags.value?.bookClubEnabled));

const canSeeSkillBuildersSchoolProgramQuickAction = computed(() => {
  const agency = agencyStore.currentAgency || {};
  const pb = brandingStore.platformBranding || {};
  return canAccessSkillBuildersSchoolProgramSurfaces({
    userRole: currentUser.value?.role,
    agencyFeatureFlags: agency.feature_flags ?? agency.featureFlags,
    platformAvailableAgencyFeaturesJson: pb.available_agency_features_json ?? pb.availableAgencyFeaturesJson,
    tenantAvailableAgencyFeaturesOverrideJson:
      agency.tenant_available_agency_features_json ?? agency.tenantAvailableAgencyFeaturesJson
  });
});

// Same catalog as classic AgencyAdminDashboard (no create-ticket — admins don't open tickets).
const defaultQuickActionIds = computed(() => {
  if (isOperationsMode.value) {
    return [
      'schedule',
      'provider_availability_dashboard',
      'office_approvals',
      'communications_center',
      'communications',
      ...(canSeeSchoolPortals.value ? ['school_portals'] : []),
      ...(hasAffiliatedPrograms.value ? ['program_overview'] : []),
      'program_events',
      'progress_dashboard',
      ...(clinicalNoteGeneratorEnabledForAgency.value ? ['tools_aids', 'clinical_note_generator'] : []),
      ...(canSeeUsersNav.value ? ['manage_users'] : []),
      ...(canSeeClientsNav.value ? ['manage_clients'] : []),
      'notifications'
    ];
  }
  return [
    'progress_dashboard',
    'manage_clients',
    'management_team',
    ...((canAccessTeamBoardRole.value && (roleLower.value === 'super_admin' || presenceEnabled.value))
      ? ['presence_team_board']
      : []),
    ...(clinicalNoteGeneratorEnabledForAgency.value ? ['tools_aids', 'clinical_note_generator'] : []),
    ...(canSeeSchoolPortals.value ? ['school_portals', 'school_marketing_campaigns'] : []),
    ...(hasAffiliatedPrograms.value ? ['program_overview'] : []),
    ...(bookClubEnabledForAgency.value ? ['book_club'] : []),
    'manage_modules',
    'manage_documents',
    'surveys',
    'manage_users',
    'settings',
    'audit_center',
    'external_calendar_audit',
    'provider_availability_dashboard',
    'provider_scheduling_settings',
    ...(canSeeSkillBuildersSchoolProgramQuickAction.value ? ['skill_builders_availability'] : []),
    'notifications',
    'communications',
    'chats',
    'payroll',
    'billing',
    'billing_policy_rules'
  ];
});

const quickActionsCatalog = computed(() => {
  const p = prefix.value;
  const base = [
    {
      id: 'team_lead_dashboard',
      title: 'Team Lead Dashboards',
      description: 'View what team leads and captains see',
      to: `${p}/operations-dashboard`,
      emoji: '👥',
      iconKey: 'provider_availability_dashboard',
      category: 'Management',
      roles: ['admin', 'support', 'super_admin', 'staff', 'clinical_practice_assistant', 'provider_plus', 'club_manager'],
      capabilities: ['canAccessPlatform']
    },
    {
      id: 'schedule',
      title: 'Schedule',
      description: 'View schedule hub',
      to: `${p}/schedule`,
      emoji: '📅',
      iconKey: 'schedule',
      category: 'Scheduling',
      roles: ['admin', 'support', 'super_admin', 'staff', 'clinical_practice_assistant', 'provider_plus', 'club_manager'],
      capabilities: ['canAccessPlatform']
    },
    {
      id: 'season_management',
      title: 'Season Management',
      description: 'Manage active and past seasons',
      to: `${p}/admin/settings?category=workflow&item=challenge-management`,
      emoji: '🏁',
      iconKey: 'challenges',
      category: 'Management',
      roles: ['admin', 'support', 'super_admin', 'staff', 'provider_plus', 'club_manager'],
      capabilities: ['canAccessPlatform']
    },
    {
      id: 'start_new_season',
      title: 'Start New Season',
      description: 'Create a new season (container for teams, scoring, and weekly challenges)',
      to: `${p}/admin?openAddSeason=1`,
      emoji: '🏁',
      iconKey: 'challenges',
      category: 'Seasons',
      roles: ['admin', 'support', 'super_admin', 'club_manager'],
      capabilities: ['canAccessPlatform']
    },
    {
      id: 'school_marketing_campaigns',
      title: 'School Marketing Campaigns',
      description: 'Promote a public page, event, or program as a slide-out toast on every school portal',
      to: `${p}/admin/marketing-campaigns`,
      emoji: '📣',
      iconKey: 'communications',
      category: 'Management',
      roles: ['admin', 'support', 'super_admin'],
      capabilities: ['canAccessPlatform']
    },
    {
      id: 'progress_dashboard',
      title: 'Progress Dashboard',
      description: 'View and manage training progress, completion, and quiz scores',
      to: `${p}/admin/agency-progress`,
      emoji: '📊',
      iconKey: 'progress_dashboard',
      category: 'Training',
      roles: ['admin', 'support', 'super_admin', 'staff', 'clinical_practice_assistant', 'supervisor'],
      capabilities: ['canAccessPlatform']
    },
    {
      id: 'manage_clients',
      title: 'Manage Clients',
      description: 'Create and manage clients',
      to: `${p}/admin/clients`,
      emoji: '🧾',
      iconKey: 'manage_clients',
      category: 'Management',
      roles: ['admin', 'support', 'super_admin', 'staff'],
      capabilities: ['canAccessPlatform']
    },
    {
      id: 'tools_aids',
      title: 'Tools & Aids',
      description: 'Note Aid and upcoming clinical tools',
      to: `${p}/admin/tools-aids`,
      emoji: '🩺',
      iconKey: 'tools_aids',
      category: 'Clinical',
      roles: ['admin', 'support', 'super_admin', 'staff', 'provider', 'intern', 'clinical_practice_assistant', 'supervisor'],
      capabilities: ['canAccessPlatform']
    },
    {
      id: 'clinical_note_generator',
      title: 'Note Aid',
      description: 'Clinical Director Agent (audio + text)',
      to: `${p}/admin/note-aid`,
      emoji: '🩺',
      iconKey: 'clinical_note_generator',
      category: 'Clinical',
      roles: ['admin', 'support', 'super_admin', 'staff', 'provider', 'intern', 'clinical_practice_assistant', 'supervisor'],
      capabilities: ['canAccessPlatform']
    },
    {
      id: 'import_school_directory',
      title: 'Import School Directory',
      description: 'Bulk import school contacts + ITSCO email + schedules',
      to: `${p}/admin/schools/import`,
      emoji: '🏫',
      iconKey: 'school_overview',
      category: 'Management',
      roles: ['admin', 'support', 'super_admin', 'staff'],
      capabilities: ['canAccessPlatform']
    },
    {
      id: 'school_portals',
      title: 'School Portals',
      description: 'School overview, all portals, and add-school when enabled for this tenant',
      to: `${p}/admin/school-portals-hub`,
      emoji: '🏫',
      iconKey: 'school_overview',
      category: 'Management',
      roles: ['admin', 'support', 'super_admin', 'staff'],
      allowSubCoordinator: true,
      capabilities: ['canAccessPlatform']
    },
    {
      id: 'program_overview',
      title: 'Program Overview',
      description: 'View affiliated programs and learning orgs (staffing/slots/docs)',
      to: `${p}/admin/schools/overview?orgType=program`,
      emoji: '🧩',
      iconKey: 'program_overview',
      category: 'Management',
      roles: ['admin', 'support', 'super_admin', 'staff'],
      allowSubCoordinator: true,
      capabilities: ['canAccessPlatform']
    },
    {
      id: 'manage_modules',
      title: 'Course Builder',
      description: 'Create and edit courses, lessons, and content blocks',
      to: `${p}/admin/modules`,
      emoji: '📚',
      iconKey: 'manage_modules',
      category: 'Training',
      roles: ['admin', 'support', 'super_admin', 'staff'],
      capabilities: ['canViewTraining']
    },
    {
      id: 'manage_documents',
      title: 'Manage Documents',
      description: 'Upload templates and assign documents',
      to: `${p}/admin/documents`,
      emoji: '📄',
      iconKey: 'manage_documents',
      category: 'Documents',
      roles: ['admin', 'support', 'super_admin', 'staff'],
      capabilities: ['canSignDocuments']
    },
    {
      id: 'intake_links',
      title: 'Digital Forms',
      description: 'Configure digital forms, documents, and public submissions',
      to: `${p}/admin/digital-forms`,
      emoji: '🔗',
      iconKey: 'intake_links',
      category: 'Documents',
      roles: ['admin', 'support', 'super_admin', 'staff'],
      capabilities: ['canSignDocuments']
    },
    {
      id: 'company_events',
      title: 'Club Events',
      description: 'Create and manage club RSVP events',
      to: `${p}/admin/company-events`,
      emoji: '📅',
      iconKey: 'dashboard_communications',
      category: 'Club',
      roles: ['admin', 'super_admin', 'provider_plus', 'club_manager'],
      capabilities: ['canAccessPlatform']
    },
    {
      id: 'program_events',
      title: 'Program Events',
      description: 'Skill Builders, D11 Summer, school, and company events directory',
      to: `${p}/admin/program-events`,
      emoji: '🗓️',
      iconKey: 'dashboard_communications',
      category: 'Events',
      roles: ['admin', 'support', 'super_admin', 'staff', 'clinical_practice_assistant', 'provider_plus', 'club_manager'],
      capabilities: ['canAccessPlatform']
    },
    {
      id: 'office_approvals',
      title: 'Office Approvals',
      description: 'Approve office requests and triage bookings missing Therapy Notes coverage',
      to: `${p}/admin/office-approvals`,
      emoji: '✅',
      iconKey: 'provider_availability_dashboard',
      category: 'Scheduling',
      roles: ['admin', 'support', 'super_admin', 'staff', 'clinical_practice_assistant', 'provider_plus'],
      capabilities: ['canAccessPlatform']
    },
    {
      id: 'surveys',
      title: 'Surveys',
      description: 'Build and push staff/client surveys and review outcomes',
      to: `${p}/admin/surveys`,
      emoji: '📊',
      iconKey: 'intake_links',
      category: 'Documents',
      roles: ['admin', 'super_admin', 'provider_plus', 'club_manager'],
      capabilities: ['canAccessPlatform']
    },
    {
      id: 'book_club',
      title: 'Book Club',
      description: 'Manage monthly books, Book Worms voting, and meetings',
      to: `${p}/admin/book-club`,
      emoji: '📚',
      iconKey: 'dashboard_communications',
      category: 'Culture',
      roles: ['admin', 'support', 'super_admin'],
      capabilities: ['canAccessPlatform']
    },
    {
      id: 'unassigned_documents',
      title: 'Submitted Documents',
      description: 'Assign public form submissions to clients',
      to: `${p}/admin/unassigned-documents`,
      emoji: '📋',
      iconKey: 'manage_documents',
      category: 'Documents',
      roles: ['admin', 'support', 'super_admin', 'staff'],
      capabilities: ['canSignDocuments']
    },
    {
      id: 'management_team',
      title: 'Management Team',
      description: 'Your platform support team and availability',
      to: `${p}/admin/management-team`,
      emoji: '👥',
      iconKey: 'manage_users',
      category: 'Management',
      roles: ['admin', 'support', 'super_admin', 'staff'],
      capabilities: ['canAccessPlatform']
    },
    {
      id: 'presence_team_board',
      title: 'Presence / Team Board',
      description: 'See who is in, out, or away — including return times',
      to: '/admin/presence',
      emoji: '📍',
      iconKey: 'presence',
      category: 'Management',
      roles: ['admin', 'support', 'super_admin'],
      capabilities: ['canAccessPlatform']
    },
    {
      id: 'escalations_desk',
      title: 'Escalations',
      description: 'Leadership escalations — assignable issue workflow',
      to: `${p}/admin/escalations`,
      emoji: '⬆️',
      iconKey: 'tickets',
      category: 'Management',
      roles: ['admin', 'support', 'super_admin', 'staff', 'clinical_practice_assistant', 'provider_plus'],
      capabilities: ['canAccessPlatform']
    },
    {
      id: 'manage_users',
      title: 'Manage Users',
      description: 'View and manage user accounts',
      to: `${p}/admin/users`,
      emoji: '👥',
      iconKey: 'manage_users',
      category: 'Management',
      roles: ['admin', 'support', 'super_admin', 'staff', 'clinical_practice_assistant', 'supervisor', 'club_manager'],
      capabilities: ['canAccessPlatform']
    },
    {
      id: 'provider_directory',
      title: 'Provider Directory',
      description: 'Search providers by profile (specialties, ages, interests)',
      to: `${p}/admin/providers`,
      emoji: '🔎',
      iconKey: 'manage_users',
      category: 'Management',
      roles: ['admin', 'support', 'super_admin', 'staff'],
      capabilities: ['canAccessPlatform']
    },
    {
      id: 'settings',
      title: 'Settings',
      description: 'Configure organizations, tracks, and branding',
      to: `${p}/admin/settings`,
      emoji: '⚙️',
      iconKey: 'settings',
      category: 'System',
      roles: ['admin', 'support', 'super_admin', 'staff', 'club_manager'],
      capabilities: ['canAccessPlatform']
    },
    {
      id: 'audit_center',
      title: 'Audit Center',
      description: 'Audit exports and operational reports',
      to: `${p}/admin/audit-center`,
      emoji: '🛡️',
      iconKey: 'audit_center',
      category: 'System',
      roles: ['admin', 'super_admin'],
      capabilities: ['canAccessPlatform']
    },
    {
      id: 'communications',
      title: 'Messages',
      description: 'Direct messages, channels, threads, and mentions',
      to: `${p}/messages`,
      emoji: '💬',
      iconKey: 'dashboard_communications',
      category: 'Communications',
      roles: ['admin', 'support', 'super_admin', 'staff', 'clinical_practice_assistant', 'provider_plus'],
      capabilities: ['canUseChat']
    },
    {
      id: 'communications_center',
      title: 'Communications Center',
      description: 'Messages hub and communication tools you can access',
      to: `${p}/admin/communications`,
      emoji: '📡',
      iconKey: 'dashboard_communications',
      category: 'Communications',
      roles: ['admin', 'support', 'super_admin', 'clinical_practice_assistant', 'provider_plus'],
      capabilities: ['canAccessPlatform']
    },
    {
      id: 'chats',
      title: 'Engagement Feed',
      description: 'Texting activity, calls, and delivery queue',
      to: `${p}/admin/communications/feed`,
      emoji: '📡',
      iconKey: 'dashboard_chats',
      category: 'Communications',
      roles: ['admin', 'support', 'super_admin', 'staff', 'clinical_practice_assistant'],
      capabilities: ['canUseChat']
    },
    {
      id: 'external_calendar_audit',
      title: 'Agency Calendar',
      description: 'Review provider schedules with calendar busy overlays',
      to: `${p}/admin/external-calendar-audit`,
      emoji: '🗓️',
      iconKey: 'external_calendar_audit',
      category: 'Scheduling',
      roles: ['admin', 'support', 'super_admin', 'staff', 'clinical_practice_assistant'],
      capabilities: ['canAccessPlatform']
    },
    {
      id: 'provider_availability_dashboard',
      title: 'Provider Management',
      description: 'View availability by school slots, office, and virtual',
      to: `${p}/admin/provider-availability`,
      emoji: '🧭',
      iconKey: 'provider_availability_dashboard',
      category: 'Scheduling',
      roles: ['admin', 'support', 'super_admin', 'staff', 'clinical_practice_assistant', 'supervisor', 'schedule_manager', 'provider_plus'],
      capabilities: ['canAccessPlatform']
    },
    {
      id: 'provider_scheduling_settings',
      title: 'Provider Scheduling',
      description: 'Configure provider scheduling preferences and rules',
      to: `${p}/admin/settings?category=workflow&item=provider-scheduling`,
      emoji: '🗓️',
      iconKey: 'schedule',
      category: 'Scheduling',
      roles: ['admin', 'super_admin'],
      capabilities: ['canAccessPlatform']
    },
    {
      id: 'skill_builders_availability',
      title: 'Event availability',
      description: 'Review weekly availability submissions by day',
      to: `${p}/admin/skill-builders-availability`,
      emoji: '🧩',
      iconKey: 'skill_builders_availability',
      category: 'Scheduling',
      roles: ['admin', 'support', 'super_admin', 'staff', 'clinical_practice_assistant'],
      allowSubCoordinator: true,
      capabilities: ['canAccessPlatform']
    },
    {
      id: 'notifications',
      title: 'Notifications',
      description: 'View notifications',
      to: `${p}/admin/notifications`,
      emoji: '🔔',
      iconKey: 'dashboard_notifications',
      category: 'Management',
      roles: ['admin', 'support', 'super_admin', 'staff'],
      capabilities: ['canAccessPlatform']
    },
    {
      id: 'payroll',
      title: 'Payroll',
      description: 'Manage payroll',
      to: `${p}/admin/payroll`,
      emoji: '💵',
      iconKey: 'dashboard_payroll',
      category: 'Management',
      roles: ['admin', 'super_admin'],
      capabilities: ['canAccessPlatform']
    },
    {
      id: 'billing',
      title: 'Billing',
      description: 'Plan usage and QuickBooks',
      to: `${p}/admin/settings?category=general&item=billing`,
      emoji: '💳',
      iconKey: 'dashboard_billing',
      category: 'System',
      roles: ['admin', 'super_admin'],
      capabilities: ['canAccessPlatform']
    },
    {
      id: 'billing_policy_rules',
      title: 'Billing Policy Rules',
      description: 'Upload billing manual and manage code eligibility/unit rules',
      to: `${p}/admin/billing-policy-rules`,
      emoji: '📘',
      iconKey: 'dashboard_billing',
      category: 'System',
      roles: ['admin', 'support', 'super_admin', 'staff'],
      capabilities: ['canAccessPlatform']
    },
    {
      id: 'review_applications',
      title: 'Review Applications',
      description: 'Hiring candidates queue',
      to: `${p}/admin/hiring`,
      emoji: '📋',
      iconKey: 'manage_users',
      category: 'People Ops',
      roles: ['admin', 'support', 'super_admin'],
      capabilities: ['canAccessPlatform']
    }
  ];

  return base.filter((a) => {
    if (isOperationsMode.value) {
      // No Engagement Feed on Operations; Communications Center covers messaging.
      if (a.id === 'chats') return false;
      if (a.id === 'payroll' || a.id === 'billing' || a.id === 'billing_policy_rules') return false;
      if (a.id === 'audit_center' || a.id === 'settings' || a.id === 'management_team') return false;
      if (a.id === 'school_marketing_campaigns') return false;
    }
    if (a.id === 'school_portals' || a.id === 'school_marketing_campaigns') return canSeeSchoolPortals.value;
    if (a.id === 'skill_builders_availability') return canSeeSkillBuildersSchoolProgramQuickAction.value;
    if (a.id === 'program_overview') return hasAffiliatedPrograms.value;
    if (a.id === 'book_club') return bookClubEnabledForAgency.value;
    if (a.id === 'tools_aids' || a.id === 'clinical_note_generator') return clinicalNoteGeneratorEnabledForAgency.value;
    return true;
  });
});

const quickActionBadges = computed(() => ({
  communications: unreadMessages.value,
  unassigned_documents: unassignedDocs.value,
  payroll: payrollSubmissions.value,
  review_applications: newApplications.value,
  notifications: unreadCount.value
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
  setLoading(true);
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

  // Notifications are best-effort and must not block the first paint / global loader.
  notificationStore
    .fetchNotifications?.({
      agencyId: agencyId || undefined,
      limit: 200,
      skipGlobalLoading: true
    })
    .catch(() => {});
  notificationStore.fetchCounts?.().catch(() => {});

  if (!agencyId) {
    setLoading(false);
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
    setLoading(false);
  }

  // Phase 2 — secondary panels (no blocking overlay)
  scheduleLoading.value = true;
  try {
    const toMs = (raw) => {
      if (!raw) return 0;
      const n = new Date(raw).getTime();
      return Number.isFinite(n) ? n : 0;
    };

    const formatWhen = (raw) => {
      const ms = toMs(raw);
      if (!ms) return '';
      try {
        return new Date(ms).toLocaleString([], {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        });
      } catch {
        return '';
      }
    };

    const formatWhenRange = (start, end) => {
      const startLabel = formatWhen(start);
      if (!startLabel) return '';
      const endMs = toMs(end);
      const startMs = toMs(start);
      if (!endMs || endMs === startMs) return startLabel;
      try {
        const sameDay = new Date(startMs).toDateString() === new Date(endMs).toDateString();
        if (sameDay) {
          const endTime = new Date(endMs).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
          return `${startLabel} – ${endTime}`;
        }
        return `${startLabel} – ${formatWhen(end)}`;
      } catch {
        return startLabel;
      }
    };

    const startOfTodayMs = (() => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    })();

    const isSchoolEventType = (eventType) => String(eventType || '').toLowerCase().startsWith('school_');
    const isProgramEventType = (eventType, orgType) => {
      const t = String(eventType || '').toLowerCase();
      const ot = String(orgType || '').toLowerCase();
      if (ot === 'program' || ot === 'learning') return true;
      return t.startsWith('program_')
        || t === 'guardian_program_class'
        || t === 'skills_group'
        || t === 'skill_builders'
        || t.includes('skill_builder');
    };

    const eventPortalPath = (e) => {
      const id = e.id || e.companyEventId;
      const et = e.eventType || e.event_type;
      if (isSchoolEventType(et)) {
        return `${prefix.value}/admin/caseload-hub/events?eventId=${id}&tab=list`;
      }
      if (isProgramEventType(et, e.organizationType) || e.programOrganizationSlug || e.programPortalSlug) {
        return `${prefix.value}/skill-builders/event/${id}`;
      }
      return `/company-events/${id}`;
    };

    const eventKind = (e) => {
      const et = e.eventType || e.event_type;
      if (isSchoolEventType(et)) return 'school';
      if (isProgramEventType(et, e.organizationType)) return 'program';
      if (e.schoolName || e.schoolOrganizationId) return e.skillsGroupId ? 'program' : 'school';
      return 'org';
    };

    // Company-events list is heavy (per-event summaries) — do not block the panel on it.
    // Program directory + school hub events paint first; company events merge in after.
    const companyEventsPromise = safeGet(`/agencies/${agencyId}/company-events`, {}, 25000);

    const [
      sched,
      unassigned,
      hiring,
      payrollPending,
      orgOverview,
      sbDirectory,
      schoolHubEvents,
      modulesRes,
      coverageWarnings,
      providerCoverage,
      officeRequestsRaw,
      onboardingRaw
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
      safeGet('/skill-builders/events/directory', { params: { agencyId } }, 12000),
      canSeeSchoolPortals.value
        ? withTimeout(fetchHubEvents(agencyId), 10000).catch(() => null)
        : Promise.resolve(null),
      safeGet('/modules', {}, 8000),
      canSeeSchoolPortals.value
        ? withTimeout(fetchCoverageWarnings(agencyId), 8000).catch(() => null)
        : Promise.resolve(null),
      canSeeSchoolPortals.value
        ? withTimeout(fetchProviderCoverageSummary(agencyId), 8000).catch(() => null)
        : Promise.resolve(null),
      safeGet('/availability/admin/office-requests', {
        params: { agencyId, status: 'PENDING' }
      }, 8000),
      safeGet('/hiring/onboarding-candidates', { params: { agencyId } }, 8000)
    ]);

    const officeList = Array.isArray(officeRequestsRaw)
      ? officeRequestsRaw
      : (Array.isArray(officeRequestsRaw?.requests) ? officeRequestsRaw.requests : []);
    officeRequestCount.value = officeList.length;

    const onboardingList = Array.isArray(onboardingRaw)
      ? onboardingRaw
      : (Array.isArray(onboardingRaw?.candidates) ? onboardingRaw.candidates : []);
    inOnboardingCount.value = onboardingList.length;

    // Active employees ≈ completed onboarding (agency specs from phase 1).
    completedOnboardingCount.value = activeEmployees.value;

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
      .slice(0, 16)
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

    // Prefer waitlist + caseload warnings; keep clinician-full + staff notifs secondary.
    const fullClinicianFeed = (Array.isArray(providerCoverage?.providers) ? providerCoverage.providers : [])
      .filter((p) => Number(p.slotsTotal || 0) > 0 && Number(p.slotsAvailable || 0) === 0)
      .slice(0, 4)
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

    const isSchoolStaffNotif = (n) => {
      const t = String(n.type || n.notification_type || '').toLowerCase();
      if (t !== 'program_reminder') return false;
      const hay = `${n.title || ''} ${n.message || ''}`.toLowerCase();
      return hay.includes('school staff');
    };

    // Keep noise down: staff adds + client_assigned only (slot spam stays in notifications hub).
    const notifFeed = (notificationStore.notifications || [])
      .filter((n) => {
        const t = String(n.type || n.notification_type || '').toLowerCase();
        return t === 'client_assigned' || isSchoolStaffNotif(n);
      })
      .slice(0, 8)
      .map((n) => {
        const staff = isSchoolStaffNotif(n);
        const relatedUserId = n.related_entity_id || n.relatedEntityId || n.entity_id;
        const to = staff && relatedUserId
          ? `${prefix.value}/admin/users/${relatedUserId}`
          : caseloadBase;
        return {
          id: `notif-${n.id}`,
          kind: staff ? 'staff' : 'caseload',
          title: n.title || (staff ? 'School staff update' : 'Caseload update'),
          body: n.message || n.body || '',
          meta: formatWhen(n.created_at || n.createdAt) || 'Notification',
          sortMs: toMs(n.created_at || n.createdAt),
          severityRank: staff ? 1 : 2,
          to,
          cta: staff ? 'View User' : 'Open'
        };
      });

    // Keep a longer list for in-card "Show more"; UI previews 6.
    schoolUpdatesFeed.value = [...warningFeed, ...fullClinicianFeed, ...notifFeed]
      .sort((a, b) => {
        const sr = (a.severityRank ?? 9) - (b.severityRank ?? 9);
        if (sr !== 0) return sr;
        return (b.sortMs || 0) - (a.sortMs || 0);
      })
      .slice(0, 24);

    const byEventId = new Map();
    const upsertEvent = (raw) => {
      const id = Number(raw?.id || raw?.companyEventId || 0);
      if (!id) return;
      if (raw?.isActive === false || raw?.is_active === 0 || raw?.is_active === false) return;
      const start = raw.startsAt || raw.starts_at || raw.start_at || raw.start_date || raw.event_date;
      const end = raw.endsAt || raw.ends_at || raw.end_at;
      const startMs = toMs(start);
      const endMs = toMs(end);
      const kind = eventKind(raw);
      const orgLabel = raw.organizationName
        || raw.schoolName
        || raw.skillsGroupName
        || raw.location
        || '';
      const typeLabel = kind === 'program'
        ? 'Program event'
        : (kind === 'school' ? 'School event' : 'Company event');
      const whenLabel = formatWhenRange(start, end);
      const next = {
        id: `evt-${id}`,
        eventId: id,
        kind,
        title: raw.title || raw.name || `Event ${id}`,
        whenLabel,
        subtitle: orgLabel || typeLabel,
        meta: [typeLabel, raw.location || raw.eventLocationName || null].filter(Boolean).join(' · '),
        startMs,
        endMs,
        to: eventPortalPath({ ...raw, id }),
        cta: 'Event Portal'
      };
      const prior = byEventId.get(id);
      if (!prior) {
        byEventId.set(id, next);
        return;
      }
      // Prefer richer subtitle/kind when merging duplicate sources.
      byEventId.set(id, {
        ...prior,
        ...next,
        kind: prior.kind === 'org' ? next.kind : prior.kind,
        subtitle: (prior.subtitle && prior.subtitle !== 'Company event' && prior.subtitle !== 'Program event' && prior.subtitle !== 'School event')
          ? prior.subtitle
          : next.subtitle,
        whenLabel: prior.whenLabel || next.whenLabel,
        meta: prior.meta || next.meta,
        to: prior.to || next.to
      });
    };

    const finalizeUpcomingEvents = () => {
      upcomingEvents.value = Array.from(byEventId.values())
        .filter((e) => {
          // Ongoing multi-week programs count via end date; one-offs via start.
          if (!e.startMs && !e.endMs) return true;
          if (e.endMs && e.endMs >= startOfTodayMs) return true;
          if (e.startMs && e.startMs >= startOfTodayMs) return true;
          return false;
        })
        .sort((a, b) => (a.startMs || Number.MAX_SAFE_INTEGER) - (b.startMs || Number.MAX_SAFE_INTEGER))
        .slice(0, 24);
    };

    const directoryEvents = Array.isArray(sbDirectory?.events) ? sbDirectory.events : [];
    const hubSchoolEvents = Array.isArray(schoolHubEvents?.events) ? schoolHubEvents.events : [];

    for (const e of directoryEvents) {
      upsertEvent({
        id: e.companyEventId || e.id,
        companyEventId: e.companyEventId || e.id,
        title: e.title,
        startsAt: e.startsAt,
        endsAt: e.endsAt,
        eventType: e.eventType || 'program_event',
        organizationType: 'program',
        schoolName: e.schoolName || e.skillsGroupName,
        skillsGroupName: e.skillsGroupName,
        skillsGroupId: e.skillsGroupId,
        programPortalSlug: e.programPortalSlug,
        programOrganizationSlug: e.programPortalSlug,
        isActive: e.isActive !== false
      });
    }
    for (const e of hubSchoolEvents) {
      upsertEvent({
        id: e.id,
        title: e.title,
        startsAt: e.startsAt || e.starts_at,
        endsAt: e.endsAt || e.ends_at,
        eventType: e.eventType || e.event_type || 'school_other',
        schoolName: e.schoolName || e.school_name,
        organizationType: 'school',
        isActive: e.isActive !== false && e.is_active !== 0
      });
    }
    finalizeUpcomingEvents();

    // Merge company / club events when the heavier list returns (non-blocking).
    companyEventsPromise.then((companyEvents) => {
      const companyEventsRaw = Array.isArray(companyEvents)
        ? companyEvents
        : (Array.isArray(companyEvents?.events) ? companyEvents.events : []);
      if (!companyEventsRaw.length) return;
      for (const e of companyEventsRaw) upsertEvent(e);
      finalizeUpcomingEvents();
    }).catch(() => {});

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

.dashboard-stack {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 14px;
  align-items: start;
}
.dash-block--full {
  grid-column: 1 / -1;
}
.dashboard-stack :deep(.panel) {
  grid-column: span 2;
  min-width: 0;
}
.dashboard-stack :deep(.panel--feed) {
  grid-column: span 3;
}
.team-board-panel,
.escalations-dash-card {
  grid-column: 1 / -1 !important;
  background: #fff;
  border: 1px solid color-mix(in srgb, var(--ops-primary, #1f6b4a) 14%, #e2e8f0);
  border-radius: 16px;
  padding: 16px 18px;
  box-shadow: 0 8px 24px color-mix(in srgb, var(--ops-primary, #1f6b4a) 5%, transparent);
}
.escalations-dash-card {
  /* EscalationsCard brings its own panel chrome */
  background: transparent;
  border: none;
  padding: 0;
  box-shadow: none;
}
.team-board-split {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.95fr);
  gap: 16px;
  align-items: start;
}
.team-board-presence { min-width: 0; }
.team-board-hint {
  margin: 12px 0 0;
  font-size: 12px;
  line-height: 1.4;
  color: #64748b;
}
@media (max-width: 900px) {
  .team-board-split { grid-template-columns: 1fr; }
}
@media (max-width: 1100px) {
  .dashboard-stack :deep(.panel),
  .dashboard-stack :deep(.panel--feed) {
    grid-column: span 3;
  }
}
@media (max-width: 700px) {
  .dashboard-stack {
    grid-template-columns: 1fr;
  }
  .dashboard-stack :deep(.panel),
  .dashboard-stack :deep(.panel--feed),
  .team-board-panel {
    grid-column: 1 / -1 !important;
  }
}

.mid-grid {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(320px, 1.4fr);
  gap: 14px;
  margin-bottom: 0;
  align-items: start;
}
.mid-grid--qa-full {
  grid-template-columns: 1fr;
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
.mid-grid--qa-full .qa-wrap :deep(.actions-grid) {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}
@media (max-width: 1200px) {
  .mid-grid--qa-full .qa-wrap :deep(.actions-grid) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 900px) {
  .mid-grid--qa-full .qa-wrap :deep(.actions-grid) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 700px) {
  .qa-wrap :deep(.actions-grid),
  .mid-grid--qa-full .qa-wrap :deep(.actions-grid) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 480px) {
  .mid-grid--qa-full .qa-wrap :deep(.actions-grid) {
    grid-template-columns: 1fr;
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
.modal--wide {
  width: min(560px, 100%);
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
.toggle-row--reorder {
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px solid #f1f5f9;
  cursor: default;
}
.toggle-row--reorder:last-child { border-bottom: none; }
.toggle-label {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  min-width: 0;
  flex: 1;
}
.toggle-note {
  font-size: 11px;
  font-weight: 700;
  color: var(--ops-primary, #1f6b4a);
  background: color-mix(in srgb, var(--ops-primary, #1f6b4a) 12%, #fff);
  border-radius: 999px;
  padding: 2px 8px;
}
.reorder-btns {
  display: inline-flex;
  gap: 4px;
  flex-shrink: 0;
}
.reorder-btn {
  width: 32px;
  height: 32px;
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 8px;
  font-weight: 800;
  cursor: pointer;
  color: #0f172a;
}
.reorder-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--ops-primary, #1f6b4a) 8%, #fff);
  border-color: color-mix(in srgb, var(--ops-primary, #1f6b4a) 30%, #e2e8f0);
}
.reorder-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
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

.momentum-panel {
  margin-top: 0;
  padding: 16px 18px 20px;
  background: #fff;
  border: 1px solid color-mix(in srgb, var(--ops-primary, #1f6b4a) 14%, #e2e8f0);
  border-radius: 16px;
  box-shadow: 0 8px 24px color-mix(in srgb, var(--ops-primary, #1f6b4a) 5%, transparent);
}
.momentum-panel-title {
  margin: 0 0 12px;
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--ops-primary, #1f6b4a);
}
</style>
