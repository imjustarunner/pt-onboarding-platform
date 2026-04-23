<template>
  <div class="tenant-admin-dashboard">
    <!-- Beta indicator bar — lets users return to the classic dashboard -->
    <div class="beta-bar">
      <span class="beta-pill">BETA</span>
      <span class="beta-bar-text">You're using the new admin dashboard.</span>
      <button class="beta-bar-back" @click="backToClassic">← Back to Classic Dashboard</button>
    </div>

    <!-- Top Bar -->
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
            placeholder="Search patients, providers, docs..."
            @keyup.enter="performSearch"
          >
          <button class="search-btn" @click="performSearch" aria-label="Search">
            <span>🔍</span>
          </button>
        </div>
      </div>

      <div class="top-bar-right">
        <button class="quick-actions-btn" @click="toggleQuickActions">
          Quick Actions <span class="arrow">▼</span>
        </button>

        <button class="notifications-bell" :class="{ 'has-unread': unreadCount > 0 }" @click="toggleNotifications">
          🔔 Notifications
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

      <!-- Quick Actions Dropdown -->
      <div v-if="showQuickActions" class="quick-actions-dropdown" @click.stop>
        <button @click="quickAction('add-patient')">+ Add Patient</button>
        <button @click="quickAction('schedule')">Schedule Session</button>
        <button @click="quickAction('document')">Create Document</button>
        <button @click="quickAction('provider')">View Providers</button>
        <button @click="quickAction('module')">Manage Modules</button>
      </div>

      <!-- Notifications Panel -->
      <div v-if="showNotificationsPanel" class="notifications-panel" @click.stop>
        <div class="panel-header">
          <h3>Notifications</h3>
          <button class="view-all" @click="viewAllNotifications">View All</button>
        </div>
        <div v-if="notifications.length === 0" class="empty-state-sm">No notifications</div>
        <div v-for="notif in notifications.slice(0, 5)" :key="notif.id" class="notification-item" :class="notif.priority">
          <div class="notif-icon">{{ getPriorityIcon(notif.priority) }}</div>
          <div>
            <div class="notif-title">{{ notif.title || notif.message }}</div>
            <div class="notif-time">{{ notif.time || notif.created_at }}</div>
          </div>
        </div>
      </div>
    </header>

    <div class="main-layout" @click="closeDropdowns">
      <!-- Left Sidebar -->
      <nav class="sidebar">
        <div class="sidebar-section">
          <div class="section-header">CORE</div>
          <router-link :to="`/${slug}/admin-dashboard`" class="nav-item">
            <span class="icon">📊</span> Dashboard
          </router-link>
          <router-link :to="`/${slug}/admin/clients`" class="nav-item">
            <span class="icon">👥</span> Patients
          </router-link>
          <router-link :to="`/${slug}/admin/providers`" class="nav-item">
            <span class="icon">🩺</span> Providers
          </router-link>
          <router-link :to="`/${slug}/admin/company-events`" class="nav-item">
            <span class="icon">📅</span> Scheduling
          </router-link>
          <router-link :to="`/${slug}/admin/documents`" class="nav-item">
            <span class="icon">📄</span> Documentation
          </router-link>
          <router-link :to="`/${slug}/admin/modules`" class="nav-item">
            <span class="icon">📚</span> Modules
          </router-link>
          <router-link :to="`/${slug}/classroom/class-presentation-dashboard`" class="nav-item">
            <span class="icon">🎓</span> Class Presentations
          </router-link>
        </div>

        <div class="sidebar-section">
          <div class="section-header">OPERATIONS</div>
          <router-link :to="`/${slug}/admin/payroll`" class="nav-item">
            <span class="icon">💰</span> Payroll
          </router-link>
          <router-link :to="`/${slug}/admin/communications`" class="nav-item">
            <span class="icon">💬</span> Communications
          </router-link>
          <router-link :to="`/${slug}/admin/agency-progress`" class="nav-item">
            <span class="icon">📈</span> Progress Reports
          </router-link>
          <router-link :to="`/${slug}/admin/users`" class="nav-item">
            <span class="icon">👤</span> Users
          </router-link>
        </div>

        <div class="sidebar-section">
          <div class="section-header">SYSTEM</div>
          <router-link :to="`/${slug}/admin/settings`" class="nav-item">
            <span class="icon">⚙️</span> Settings
          </router-link>
          <router-link :to="`/${slug}/admin/audit-center`" class="nav-item">
            <span class="icon">🔍</span> Audit Center
          </router-link>
          <router-link :to="`/${slug}/admin/notifications`" class="nav-item">
            <span class="icon">🔔</span> Notifications
          </router-link>
        </div>

        <div class="sidebar-footer">
          <button @click="logout" class="logout-btn">Logout</button>
        </div>
      </nav>

      <!-- Main Content -->
      <main class="main-content">
        <!-- Loading state -->
        <div v-if="loading" class="loading-overlay">
          <div class="loading-spinner"></div>
          <p>Loading dashboard data...</p>
        </div>

        <!-- KPI Metrics Row -->
        <div class="kpi-row">
          <div v-for="(kpi, i) in kpis" :key="i" class="kpi-card" @click="navigateToKpi(kpi)">
            <div class="kpi-label">{{ kpi.label }}</div>
            <div class="kpi-value">{{ kpi.value }}</div>
            <div class="micro-chart">
              <svg v-if="trends.length > 1" width="100%" height="32" class="trend-svg" viewBox="0 0 140 32" preserveAspectRatio="none">
                <polyline
                  v-for="(series, idx) in getTrendSeries(trends)"
                  :key="idx"
                  :points="getTrendPoints(series.values)"
                  fill="none"
                  :stroke="idx === 0 ? '#0ea5e9' : '#22d3ee'"
                  stroke-width="2"
                  stroke-linejoin="round"
                />
              </svg>
              <div v-else class="sparkline"></div>
            </div>
          </div>
        </div>

        <div class="content-grid">
          <!-- Left/Center panel -->
          <div class="left-panel">
            <!-- Today's Activity Feed -->
            <div class="panel activity-feed">
              <div class="panel-header">
                <h2>Today's Activity</h2>
                <button @click="viewAllNotifications" class="view-all-btn">View All</button>
              </div>
              <div v-if="activityFeed.length === 0" class="empty-state">
                <span>No recent activity</span>
              </div>
              <div v-for="activity in activityFeed" :key="activity.id || activity.time" class="activity-item">
                <div class="activity-time">{{ activity.time }}</div>
                <div class="activity-content">
                  <span :class="`status ${normalizeStatus(activity.status || activity.type)}`">{{ normalizeStatus(activity.status || activity.type) }}</span>
                  {{ activity.description || activity.message }}
                </div>
              </div>
            </div>

            <!-- Tasks & Workflows -->
            <div class="panel tasks-panel">
              <div class="panel-header">
                <h2>Tasks & Workflows <span class="count">({{ tasks.length }})</span></h2>
              </div>
              <div v-if="tasks.length === 0" class="empty-state">
                <span>No pending tasks — you're all caught up!</span>
              </div>
              <div v-for="task in tasks" :key="task.id || task.title" class="task-item" @click="handleTaskClick(task)">
                <div class="task-icon">{{ getTaskIcon(task.type) }}</div>
                <div class="task-details">
                  <div class="task-title">{{ task.title }}</div>
                  <div class="task-meta">{{ task.count }} {{ task.meta || 'items' }}</div>
                </div>
                <div class="task-priority" :class="task.priority || 'medium'">{{ task.priority || 'medium' }}</div>
              </div>
            </div>
          </div>

          <!-- Schedule Snapshot -->
          <div class="schedule-panel panel">
            <div class="panel-header">
              <h2>Schedule Snapshot</h2>
              <div class="view-toggle">
                <button :class="{ active: viewMode === 'day' }" @click="viewMode = 'day'">Day</button>
                <button :class="{ active: viewMode === 'week' }" @click="viewMode = 'week'">Week</button>
                <button :class="{ active: viewMode === 'month' }" @click="viewMode = 'month'">Month</button>
              </div>
            </div>
            <div v-if="scheduleLoading" class="empty-state">Loading schedule...</div>
            <div v-else-if="scheduleSlots.length === 0" class="empty-state">
              <span>No sessions scheduled for today</span>
            </div>
            <div v-else class="calendar-snapshot">
              <div v-for="(slot, i) in scheduleSlots" :key="slot.id || i" class="calendar-slot" @click="openSession(slot)">
                <div class="slot-time">{{ slot.time }}</div>
                <div class="slot-info">
                  <div class="slot-provider">{{ slot.provider }}</div>
                  <div class="slot-client">{{ slot.client }}</div>
                </div>
                <div class="slot-type" :class="slot.type">{{ slot.type }}</div>
              </div>
            </div>
            <button @click="viewFullCalendar" class="full-calendar-btn">View Full Calendar →</button>
          </div>

          <!-- Right Panel -->
          <div class="right-panel">
            <!-- Notifications -->
            <div class="panel notifications-right">
              <div class="panel-header">
                <h2>Notifications</h2>
                <span class="urgent-count" v-if="urgentNotifications > 0">{{ urgentNotifications }} Urgent</span>
              </div>
              <div v-if="rightNotifications.length === 0" class="empty-state">No new notifications</div>
              <div v-for="notif in rightNotifications" :key="notif.id" class="right-notif">
                <div class="notif-dot" :class="notif.priority || 'info'"></div>
                <div class="notif-content">
                  <strong>{{ notif.title || notif.message }}</strong>
                  <small>{{ notif.subtitle || '' }}</small>
                </div>
                <small class="notif-time">{{ notif.time || '' }}</small>
              </div>
            </div>

            <!-- Quick Stats -->
            <div class="panel engagement">
              <div class="panel-header">
                <h2>Quick Stats</h2>
              </div>
              <div class="quick-stats">
                <div class="stat-row">
                  <span class="stat-label">Active Employees</span>
                  <span class="stat-value">{{ activeEmployees }}</span>
                </div>
                <div class="stat-row">
                  <span class="stat-label">Sessions Today</span>
                  <span class="stat-value">{{ sessionsToday }}</span>
                </div>
                <div class="stat-row">
                  <span class="stat-label">Unread Notifications</span>
                  <span class="stat-value">{{ unreadCount }}</span>
                </div>
                <div class="stat-row" v-if="recentPayrollPeriod">
                  <span class="stat-label">Last Payroll Period</span>
                  <span class="stat-value">{{ recentPayrollPeriod.label || recentPayrollPeriod.period_start }}</span>
                </div>
              </div>
            </div>

            <!-- System Status -->
            <div class="panel system-status">
              <div class="panel-header">
                <h2>System Status</h2>
              </div>
              <div class="status-items">
                <div class="status-item success">
                  <span class="dot"></span>
                  All Systems Operational
                </div>
                <div class="status-meta">Last updated: {{ lastRefresh }}</div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import { useNotificationStore } from '../../store/notifications';
import api from '../../services/api';
import BrandingLogo from '../../components/BrandingLogo.vue';

const router = useRouter();
const route = useRoute();
const agencyStore = useAgencyStore();
const authStore = useAuthStore();
const notificationStore = useNotificationStore();

// UI state
const searchQuery = ref('');
const showQuickActions = ref(false);
const showNotificationsPanel = ref(false);
const viewMode = ref('day');
const loading = ref(false);
const scheduleLoading = ref(false);

// Derive slug — no hardcoded fallback
const slug = computed(() =>
  route.params.organizationSlug
  || agencyStore.currentAgency?.slug
  || agencyStore.currentAgency?.portal_url
  || ''
);

// Current user info from auth store
const currentUser = computed(() => authStore.user || authStore.currentUser || {});
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
    clinical_practice_assistant: 'Clinical Assistant',
    school_staff: 'School Staff',
  };
  return map[role] || 'Admin';
});

// Dashboard data refs — all empty by default, filled by onMounted
const kpis = ref([]);
const trends = ref([]);
const activityFeed = ref([]);
const tasks = ref([]);
const scheduleSlots = ref([]);

// Quick stats (populated alongside KPIs)
const activeEmployees = ref(0);
const sessionsToday = ref(0);
const recentPayrollPeriod = ref(null);
const lastRefresh = ref('');

// Notifications — all from store (no hardcoded fallbacks)
const notifications = computed(() => notificationStore.notifications || []);
const unreadCount = computed(() => {
  const n = notificationStore.unreadNotifications;
  return typeof n === 'object' ? (n?.value ?? 0) : (n ?? 0);
});
const urgentNotifications = computed(() =>
  (notificationStore.notifications || []).filter(
    n => String(n.priority || '').toLowerCase() === 'urgent'
  ).length
);
const rightNotifications = computed(() =>
  (notificationStore.notifications || []).slice(0, 5)
);

onMounted(async () => {
  loading.value = true;
  const agencyId = agencyStore.currentAgency?.id
    || (typeof agencyStore.currentAgency === 'object' ? agencyStore.currentAgency?.value?.id : null);

  try {
    // Fetch notifications (real, from store)
    await notificationStore.fetchNotifications();
  } catch { /* non-fatal */ }

  if (agencyId) {
    // Dashboard KPIs
    try {
      const { data: d } = await api.get('/dashboard/agency-specs', { params: { agencyId } });

      activeEmployees.value = d.activeEmployees || 0;
      sessionsToday.value = d.sessionsToday || 0;
      recentPayrollPeriod.value = d.recentPayrollPeriod || null;
      lastRefresh.value = d.refreshedAt ? new Date(d.refreshedAt).toLocaleTimeString() : new Date().toLocaleTimeString();

      kpis.value = [
        { label: 'Active Patients', value: String(d.activePatients || 0), link: `/${slug.value}/admin/clients` },
        { label: 'Active Employees', value: String(d.activeEmployees || 0), link: `/${slug.value}/admin/providers` },
        { label: 'Sessions Today', value: String(d.sessionsToday || 0), link: `/${slug.value}/admin/company-events` },
        { label: 'Open Tasks', value: String(d.openTasks || 0), link: `/${slug.value}/admin/audit-center` },
        { label: 'Revenue (MTD)', value: '$' + (d.revenueMTD || 0).toLocaleString(), link: `/${slug.value}/admin/payroll` },
      ];

      trends.value = Array.isArray(d.trends) ? d.trends : [];

      // Activity feed from backend notifications query
      if (Array.isArray(d.activityFeed) && d.activityFeed.length > 0) {
        activityFeed.value = d.activityFeed;
      } else {
        // Fall back to notification store items formatted as activity
        activityFeed.value = (notificationStore.notifications || []).slice(0, 5).map(n => ({
          id: n.id,
          time: n.created_at ? new Date(n.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '',
          status: n.type || 'info',
          description: n.message || n.title || '',
        }));
      }

      // Tasks from real task summary
      if (Array.isArray(d.tasksSummary) && d.tasksSummary.length > 0) {
        tasks.value = d.tasksSummary.map((t, i) => ({
          id: i + 1,
          title: t.title,
          count: t.count || 0,
          meta: 'items',
          priority: i === 0 ? 'high' : 'medium',
          type: 'review',
        }));
      }
    } catch (e) {
      console.error('Dashboard KPI load failed:', e);
      // Zero state — no fake numbers
      kpis.value = [
        { label: 'Active Patients', value: '—', link: `/${slug.value}/admin/clients` },
        { label: 'Active Employees', value: '—', link: `/${slug.value}/admin/providers` },
        { label: 'Sessions Today', value: '—', link: `/${slug.value}/admin/company-events` },
        { label: 'Open Tasks', value: '—', link: `/${slug.value}/admin/audit-center` },
        { label: 'Revenue (MTD)', value: '—', link: `/${slug.value}/admin/payroll` },
      ];
    }

    // Schedule snapshot
    scheduleLoading.value = true;
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data: sched } = await api.get('/dashboard/schedule-snapshot', { params: { agencyId, date: today } });
      scheduleSlots.value = Array.isArray(sched.sessions) ? sched.sessions : [];
    } catch (e) {
      console.error('Schedule snapshot load failed:', e);
      scheduleSlots.value = [];
    } finally {
      scheduleLoading.value = false;
    }
  } else {
    // No agency selected — empty KPIs
    kpis.value = [
      { label: 'Active Patients', value: '—', link: '' },
      { label: 'Active Employees', value: '—', link: '' },
      { label: 'Sessions Today', value: '—', link: '' },
      { label: 'Open Tasks', value: '—', link: '' },
      { label: 'Revenue (MTD)', value: '—', link: '' },
    ];
  }

  loading.value = false;
});

// UI helpers
const toggleQuickActions = () => {
  showQuickActions.value = !showQuickActions.value;
  showNotificationsPanel.value = false;
};
const toggleNotifications = () => {
  showNotificationsPanel.value = !showNotificationsPanel.value;
  showQuickActions.value = false;
};
const toggleProfileMenu = () => {
  showQuickActions.value = false;
  showNotificationsPanel.value = false;
};
const closeDropdowns = () => {
  showQuickActions.value = false;
  showNotificationsPanel.value = false;
};

const performSearch = () => {
  if (searchQuery.value.trim() && slug.value) {
    router.push({ path: `/${slug.value}/admin/clients`, query: { q: searchQuery.value } });
    searchQuery.value = '';
  }
};

const quickAction = (action) => {
  showQuickActions.value = false;
  const s = slug.value;
  if (!s) return;
  switch (action) {
    case 'add-patient': router.push(`/${s}/admin/clients`); break;
    case 'schedule': router.push(`/${s}/admin/company-events`); break;
    case 'document': router.push(`/${s}/admin/documents`); break;
    case 'provider': router.push(`/${s}/admin/providers`); break;
    case 'module': router.push(`/${s}/admin/modules`); break;
  }
};

const handleTaskClick = (task) => {
  const s = slug.value;
  if (!s) return;
  if (task.type === 'review' || task.title?.toLowerCase().includes('ticket')) {
    router.push(`/${s}/admin/audit-center`);
  } else {
    router.push(`/${s}/admin/audit-center`);
  }
};

const getTaskIcon = (type) => {
  const icons = { review: '📝', signature: '✍️', doc: '📄', insurance: '🛡️' };
  return icons[type] || '📋';
};

const getPriorityIcon = (priority) => {
  if (priority === 'urgent') return '⚠️';
  if (priority === 'high') return '🔴';
  return 'ℹ️';
};

const normalizeStatus = (s) => {
  if (!s) return 'info';
  const lower = String(s).toLowerCase();
  if (lower.includes('complet')) return 'completed';
  if (lower.includes('alert') || lower.includes('urgent') || lower.includes('error')) return 'alert';
  if (lower.includes('review') || lower.includes('pending') || lower.includes('warn')) return 'review';
  return lower;
};

const viewAllNotifications = () => {
  showNotificationsPanel.value = false;
  if (slug.value) router.push(`/${slug.value}/admin/notifications`);
};
const viewFullCalendar = () => {
  if (slug.value) router.push(`/${slug.value}/admin/company-events`);
};
const openSession = (slot) => {
  if (slot.id && slug.value) {
    router.push(`/${slug.value}/admin/company-events`);
  }
};
const navigateToKpi = (kpi) => {
  if (kpi.link) router.push(kpi.link);
};
const logout = () => {
  authStore.logout();
};

const backToClassic = () => {
  const s = slug.value;
  if (s) {
    router.push(`/${s}/admin`);
  } else {
    router.push('/admin');
  }
};

// Chart helpers for real multi-series SVG trends
const getTrendSeries = (trends) => {
  if (!trends || trends.length === 0) return [];
  const patients = trends.map(t => Number(t.activePatients || 0));
  const sessions = trends.map(t => Number(t.sessions || 0));
  const maxP = Math.max(...patients, 1);
  const maxS = Math.max(...sessions, 1);
  return [
    { name: 'patients', values: patients.map(v => (v / maxP) * 28) },
    { name: 'sessions', values: sessions.map(v => (v / maxS) * 28) },
  ];
};
const getTrendPoints = (values) => {
  if (!values || values.length === 0) return '0,28 140,28';
  const step = 140 / Math.max(values.length - 1, 1);
  const pts = values.map((v, i) => `${Math.round(i * step)},${Math.round(28 - v)}`).join(' ');
  return `0,28 ${pts} 140,28`;
};
</script>

<style scoped>
.tenant-admin-dashboard {
  min-height: 100vh;
  background: #f8fafc;
  font-family: system-ui, -apple-system, sans-serif;
  --primary: #0ea5e9;
  --primary-dark: #0369a1;
}

.beta-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #0f172a;
  color: rgba(255,255,255,0.85);
  padding: 7px 20px;
  font-size: 13px;
  position: sticky;
  top: 0;
  z-index: 60;
}

.beta-pill {
  background: #0ea5e9;
  color: white;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  padding: 2px 7px;
  border-radius: 9999px;
}

.beta-bar-text {
  flex: 1;
}

.beta-bar-back {
  background: none;
  border: 1px solid rgba(255,255,255,0.25);
  color: rgba(255,255,255,0.8);
  border-radius: 6px;
  padding: 4px 12px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.beta-bar-back:hover {
  background: rgba(255,255,255,0.1);
  color: white;
  border-color: rgba(255,255,255,0.5);
}

.top-bar {
  background: white;
  border-bottom: 1px solid #e2e8f0;
  padding: 12px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: sticky;
  top: 0;
  z-index: 50;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}

.top-bar-left, .top-bar-center, .top-bar-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.org-name h1 {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  color: #0f172a;
}

.role-badge {
  background: #e0f2fe;
  color: #0369a1;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 9999px;
  font-weight: 500;
}

.search-bar {
  display: flex;
  background: #f1f5f9;
  border-radius: 9999px;
  padding: 8px 16px;
  width: 360px;
  border: 1px solid #cbd5e1;
}

.search-bar input {
  border: none;
  background: transparent;
  flex: 1;
  outline: none;
  font-size: 14px;
}

.search-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: #64748b;
}

.quick-actions-btn {
  background: var(--primary);
  color: white;
  border: none;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
}

.notifications-bell {
  position: relative;
  font-size: 14px;
  cursor: pointer;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: white;
  display: flex;
  align-items: center;
  gap: 6px;
}

.notifications-bell.has-unread {
  border-color: var(--primary);
}

.badge {
  background: #ef4444;
  color: white;
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 9999px;
  min-width: 16px;
  text-align: center;
}

.user-profile {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}

.avatar {
  width: 32px;
  height: 32px;
  background: #3b82f6;
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 12px;
  flex-shrink: 0;
}

.user-info {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.user-info .name {
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
}

.user-info .role {
  font-size: 11px;
  color: #64748b;
}

.quick-actions-dropdown, .notifications-panel {
  position: absolute;
  top: 70px;
  right: 20px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 10px 25px -5px rgba(0,0,0,0.15);
  z-index: 100;
  min-width: 240px;
}

.quick-actions-dropdown button {
  width: 100%;
  text-align: left;
  padding: 10px 20px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 14px;
  color: #334155;
}

.quick-actions-dropdown button:hover {
  background: #f1f5f9;
}

.notifications-panel .panel-header {
  padding: 12px 16px;
  border-bottom: 1px solid #f1f5f9;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.notifications-panel h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.notifications-panel .view-all {
  background: none;
  border: none;
  color: var(--primary);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
}

.notification-item {
  display: flex;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid #f8fafc;
  align-items: flex-start;
}

.notification-item .notif-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.notification-item .notif-title {
  font-size: 13px;
  color: #334155;
  font-weight: 500;
}

.notification-item .notif-time {
  font-size: 11px;
  color: #94a3b8;
}

.main-layout {
  display: flex;
  height: calc(100vh - 64px);
  position: relative;
}

.sidebar {
  width: 240px;
  background: #0f172a;
  color: #e2e8f0;
  padding: 24px 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #1e2937;
  overflow-y: auto;
  flex-shrink: 0;
}

.sidebar-section {
  margin-bottom: 16px;
}

.section-header {
  padding: 0 24px 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.5px;
  color: #64748b;
  text-transform: uppercase;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 24px;
  color: #cbd5e1;
  text-decoration: none;
  transition: background 0.15s;
  font-size: 14px;
}

.nav-item:hover {
  background: #1e2937;
  color: white;
}

.nav-item.router-link-active {
  background: #1e3a5f;
  color: white;
  border-left: 3px solid var(--primary);
}

.nav-item .icon {
  width: 20px;
  font-size: 16px;
  flex-shrink: 0;
}

.sidebar-footer {
  margin-top: auto;
  padding: 20px 24px;
}

.logout-btn {
  width: 100%;
  padding: 10px;
  background: #334155;
  color: #e2e8f0;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.15s;
}

.logout-btn:hover {
  background: #475569;
}

.main-content {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
  background: #f8fafc;
  position: relative;
}

.loading-overlay {
  position: absolute;
  inset: 0;
  background: rgba(248,250,252,0.85);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 10;
  gap: 12px;
  font-size: 14px;
  color: #64748b;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #e2e8f0;
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

.kpi-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 16px;
  margin-bottom: 28px;
}

.kpi-card {
  background: white;
  border-radius: 12px;
  padding: 18px 20px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
  border: 1px solid #e2e8f0;
}

.kpi-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px -4px rgba(0,0,0,0.1);
}

.kpi-label {
  font-size: 12px;
  color: #64748b;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.kpi-value {
  font-size: 26px;
  font-weight: 700;
  color: #0f172a;
  margin: 6px 0;
}

.micro-chart {
  height: 32px;
  margin-top: 10px;
  background: #f1f5f9;
  border-radius: 4px;
  overflow: hidden;
}

.sparkline {
  height: 100%;
  background: linear-gradient(90deg, #0ea5e9 0%, #bae6fd 100%);
  opacity: 0.4;
}

.trend-svg {
  display: block;
}

.content-grid {
  display: grid;
  grid-template-columns: 1fr 360px 280px;
  gap: 20px;
}

.left-panel, .right-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.panel {
  background: white;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  border: 1px solid #e2e8f0;
  overflow: hidden;
}

.panel-header {
  padding: 14px 20px;
  border-bottom: 1px solid #f1f5f9;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel-header h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
}

.view-all-btn {
  background: none;
  border: none;
  color: var(--primary);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
}

.empty-state {
  padding: 24px 20px;
  text-align: center;
  color: #94a3b8;
  font-size: 13px;
}

.empty-state-sm {
  padding: 12px 16px;
  color: #94a3b8;
  font-size: 13px;
}

.activity-item {
  padding: 10px 20px;
  border-bottom: 1px solid #f8fafc;
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.activity-time {
  font-size: 11px;
  color: #94a3b8;
  width: 60px;
  flex-shrink: 0;
  padding-top: 2px;
}

.activity-content {
  font-size: 13px;
  color: #334155;
  flex: 1;
  line-height: 1.4;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
}

.status {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 9999px;
  font-weight: 600;
  flex-shrink: 0;
}

.status.completed { background: #d1fae5; color: #065f46; }
.status.review { background: #fef3c7; color: #92400e; }
.status.alert { background: #fee2e2; color: #991b1b; }
.status.info { background: #e0f2fe; color: #0369a1; }

.task-item {
  padding: 12px 20px;
  border-bottom: 1px solid #f8fafc;
  display: flex;
  gap: 12px;
  align-items: center;
  cursor: pointer;
  transition: background 0.1s;
}

.task-item:hover {
  background: #f8fafc;
}

.task-icon {
  font-size: 18px;
  width: 28px;
  flex-shrink: 0;
}

.task-details {
  flex: 1;
}

.task-title {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
}

.task-meta {
  font-size: 12px;
  color: #64748b;
}

.count {
  font-weight: 400;
  color: #64748b;
}

.task-priority {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 9999px;
  flex-shrink: 0;
}

.task-priority.high { background: #fee2e2; color: #b91c1c; }
.task-priority.medium { background: #fef3c7; color: #b45309; }
.task-priority.urgent { background: #ec4899; color: white; }
.task-priority.low { background: #e2e8f0; color: #475569; }

.calendar-snapshot {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 340px;
  overflow-y: auto;
}

.calendar-slot {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
  padding: 10px 12px;
  background: #f8fafc;
  border-radius: 8px;
  cursor: pointer;
  border: 1px solid #e2e8f0;
  transition: background 0.1s, border-color 0.1s;
}

.calendar-slot:hover {
  background: #f0f9ff;
  border-color: var(--primary);
}

.slot-time {
  font-weight: 600;
  font-size: 12px;
  color: #334155;
  white-space: nowrap;
}

.slot-info {
  overflow: hidden;
}

.slot-provider {
  font-size: 13px;
  font-weight: 500;
  color: #1e293b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.slot-client {
  font-size: 12px;
  color: #64748b;
}

.slot-type {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 9999px;
  background: #e0f2fe;
  color: #0369a1;
  align-self: center;
  white-space: nowrap;
}

.slot-type.group { background: #f0fdf4; color: #166534; }
.slot-type.individual { background: #e0f2fe; color: #0369a1; }
.slot-type.psych { background: #fdf4ff; color: #7e22ce; }
.slot-type.couples { background: #fef3c7; color: #92400e; }

.full-calendar-btn {
  display: block;
  width: 100%;
  padding: 12px;
  background: none;
  border: none;
  border-top: 1px solid #f1f5f9;
  color: var(--primary);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  text-align: center;
}

.full-calendar-btn:hover {
  background: #f0f9ff;
}

.view-toggle {
  display: flex;
  gap: 2px;
}

.view-toggle button {
  padding: 4px 10px;
  border: 1px solid #e2e8f0;
  background: white;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.1s;
}

.view-toggle button:first-child { border-radius: 4px 0 0 4px; }
.view-toggle button:last-child { border-radius: 0 4px 4px 0; }

.view-toggle button.active {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}

.notifications-right .panel-header {
  padding: 14px 16px;
}

.urgent-count {
  background: #fee2e2;
  color: #991b1b;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 9999px;
}

.right-notif {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 16px;
  border-bottom: 1px solid #f8fafc;
}

.notif-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-top: 5px;
  flex-shrink: 0;
  background: #94a3b8;
}

.notif-dot.urgent { background: #ef4444; }
.notif-dot.high { background: #f97316; }
.notif-dot.info { background: #0ea5e9; }

.notif-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.notif-content strong {
  font-size: 13px;
  color: #1e293b;
}

.notif-content small {
  font-size: 11px;
  color: #94a3b8;
}

.notif-time {
  font-size: 11px;
  color: #94a3b8;
  white-space: nowrap;
}

.quick-stats {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}

.stat-label {
  color: #64748b;
}

.stat-value {
  font-weight: 600;
  color: #0f172a;
}

.status-items {
  padding: 14px 16px;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #334155;
}

.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  background: #10b981;
  border-radius: 50%;
}

.status-meta {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 6px;
}

@media (max-width: 1280px) {
  .content-grid {
    grid-template-columns: 1fr 320px;
  }
  .right-panel {
    display: none;
  }
}

@media (max-width: 1024px) {
  .content-grid {
    grid-template-columns: 1fr;
  }
}
</style>
