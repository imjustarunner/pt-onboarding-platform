<template>
  <div class="notification-cards-container">
    <div v-if="totalNotifications > 0 || agencies.length > 0" class="header-row">
      <h2>Notifications</h2>
      <button
        v-if="canCustomizeScope"
        class="btn-scope"
        type="button"
        @click="showScopeModal = true"
      >
        Scope
      </button>
    </div>
    <div v-if="loading" class="loading">Loading notifications...</div>
    <div v-else-if="agencies.length === 0" class="empty-state">
      <p>No agencies available.</p>
    </div>
    <div v-else-if="totalNotifications === 0 && !showAllAgenciesCard" class="empty-state">
      <p>No notifications at this time.</p>
    </div>
    <div v-else>
      <div v-if="showTopToggle" class="top-toggle">
        <button class="btn-toggle" type="button" @click="toggleShowAll">
          {{ showAll ? 'Show top 10' : `Show all (${agenciesWithNotifications.length})` }}
        </button>
      </div>

      <div class="notification-cards-grid">
      <!-- All Agencies Card (if multiple agencies or super_admin) -->
      <div
        v-if="showAllAgenciesCard"
        class="notification-card all-agencies-card"
        @click="goToAllNotifications"
      >
        <div class="card-content">
          <div class="agency-icon-wrapper">
            <img
              v-if="allAgenciesNotificationsIconUrl"
              :src="allAgenciesNotificationsIconUrl"
              alt="All Notifications"
              class="agency-icon"
            />
            <div v-else class="agency-icon-placeholder all-agencies">
              🌐
            </div>
          </div>
          <div class="card-info">
            <h3 class="agency-name">All Notifications</h3>
            <p class="notification-count-text">
              {{ totalNotifications }} 
              {{ totalNotifications === 1 ? 'notification' : 'notifications' }}
            </p>
          </div>
          <div class="notification-badge has-notifications">
            {{ totalNotifications }}
          </div>
        </div>
      </div>

      <!-- Individual Organization Cards -->
      <div
        v-for="agency in visibleAgencies"
        :key="agency.id"
        class="notification-card"
        :style="getCardStyle(agency)"
        @click="openCategoryModal(agency.id, agency.name)"
      >
        <div class="card-content">
          <div class="agency-icon-wrapper">
            <img
              v-if="getAgencyIconUrl(agency)"
              :src="getAgencyIconUrl(agency)"
              :alt="`${agency.name} icon`"
              class="agency-icon"
              @error="handleIconError"
            />
            <div v-else class="agency-icon-placeholder">
              {{ agency.name.charAt(0).toUpperCase() }}
            </div>
          </div>
          <div class="card-info">
            <h3 class="agency-name">{{ agency.name }}</h3>
            <p v-if="orgTypeLabel(agency)" class="org-type">
              {{ orgTypeLabel(agency) }}
            </p>
            <p class="notification-count-text">
              {{ getNotificationCount(agency.id) }} 
              {{ getNotificationCount(agency.id) === 1 ? 'notification' : 'notifications' }}
            </p>
          </div>
          <div class="notification-badge" :class="{ 'has-notifications': getNotificationCount(agency.id) > 0 }">
            {{ getNotificationCount(agency.id) }}
          </div>
        </div>
      </div>
      </div>
    </div>

    <!-- Category Modal -->
    <NotificationCategoryModal
      v-if="showCategoryModal"
      :agency-id="selectedAgencyId"
      :agency-name="selectedAgencyName"
      @close="closeCategoryModal"
    />

    <!-- Scope Modal -->
    <div v-if="showScopeModal" class="modal-overlay" @click="closeScopeModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h2>Notification Scope</h2>
          <button class="btn-close" type="button" title="Close" @click="closeScopeModal">×</button>
        </div>

        <div class="modal-body">
          <p class="hint">
            Choose which organization types show up here. Agencies will always be listed first.
          </p>

          <div class="scope-grid">
            <label v-for="opt in scopeOptions" :key="opt.value" class="scope-item">
              <input
                type="checkbox"
                :value="opt.value"
                v-model="selectedOrgTypes"
                :disabled="savingScope || opt.value === 'agency'"
              />
              <span class="scope-label">{{ opt.label }}</span>
            </label>
          </div>

          <div class="actions">
            <button class="btn btn-primary" type="button" @click="saveScope" :disabled="savingScope">
              {{ savingScope ? 'Saving…' : 'Save' }}
            </button>
            <div v-if="scopeSaved" class="saved">Saved</div>
            <div v-if="scopeError" class="error-inline">{{ scopeError }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useNotificationStore } from '../../store/notifications';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import { useBrandingStore } from '../../store/branding';
import NotificationCategoryModal from './NotificationCategoryModal.vue';
import { getBackendBaseUrl, toUploadsUrl } from '../../utils/uploadsUrl';
import api from '../../services/api';

const notificationStore = useNotificationStore();
const agencyStore = useAgencyStore();
const authStore = useAuthStore();
const brandingStore = useBrandingStore();
const router = useRouter();
const route = useRoute();

const loading = ref(false);
const agencies = ref([]);
const expandedOrganizations = ref([]); // agencies + affiliated orgs
const iconErrors = ref({});
const showCategoryModal = ref(false);
const selectedAgencyId = ref(null);
const selectedAgencyName = ref('');
const showAll = ref(false);
const isDesktop = ref(true);

const showScopeModal = ref(false);
const savingScope = ref(false);
const scopeSaved = ref(false);
const scopeError = ref('');
const selectedOrgTypes = ref(['agency']);

const canCustomizeScope = computed(() => {
  // Only show the scope UI for admin-like roles (these dashboards)
  const role = authStore.user?.role;
  return role === 'super_admin' || role === 'admin' || role === 'support';
});

const scopeOptions = computed(() => ([
  { value: 'agency', label: 'Agencies (required)' },
  { value: 'program', label: 'Programs' },
  { value: 'school', label: 'Schools' },
  { value: 'learning', label: 'Learning' }
]));

const parseJsonMaybe = (v) => {
  if (!v) return null;
  if (typeof v === 'object') return v;
  if (typeof v !== 'string') return null;
  try { return JSON.parse(v); } catch { return null; }
};

const totalNotifications = computed(() => {
  return Object.values(notificationStore.counts).reduce((sum, count) => sum + count, 0);
});

const showAllAgenciesCard = computed(() => {
  // Show "All Agencies" card if user is super_admin or has multiple agencies
  if (authStore.user?.role === 'super_admin') {
    return agencies.value.length > 1;
  }
  return agencies.value.length > 1;
});

const agenciesWithNotifications = computed(() => {
  // Show all agencies that have notifications OR all agencies if user is super_admin
  if (authStore.user?.role === 'super_admin') {
    return expandedOrganizations.value;
  }
  // For regular admins, show all their agencies (they'll see counts)
  return expandedOrganizations.value;
});

const normalizedSelectedTypes = computed(() => {
  const raw = Array.isArray(selectedOrgTypes.value) ? selectedOrgTypes.value : [];
  const set = new Set(raw.map((t) => String(t || '').trim().toLowerCase()).filter(Boolean));
  // Always include agencies (default and requirement)
  set.add('agency');
  return Array.from(set);
});

const typeOrder = ['agency', 'program', 'school', 'learning'];

const orgTypeValue = (org) => String(org?.organization_type || 'agency').toLowerCase();

const visibleOrganizationsByType = computed(() => {
  const allowed = new Set(normalizedSelectedTypes.value);
  const list = [...(agenciesWithNotifications.value || [])].filter((o) => allowed.has(orgTypeValue(o)));
  return list;
});

const sortedAgencies = computed(() => {
  const list = [...(visibleOrganizationsByType.value || [])];
  const countFor = (id) => notificationStore.counts?.[id] || 0;
  const byType = new Map();
  for (const org of list) {
    const t = orgTypeValue(org);
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t).push(org);
  }

  const out = [];
  for (const t of typeOrder) {
    const arr = byType.get(t) || [];
    arr.sort((a, b) => {
      const ac = countFor(a?.id);
      const bc = countFor(b?.id);
      if (ac !== bc) return bc - ac;
      return String(a?.name || '').localeCompare(String(b?.name || ''));
    });
    out.push(...arr);
  }

  // Any unknown types go to the end (stable-ish)
  const unknown = list.filter((o) => !typeOrder.includes(orgTypeValue(o)));
  if (unknown.length) {
    unknown.sort((a, b) => {
      const ac = countFor(a?.id);
      const bc = countFor(b?.id);
      if (ac !== bc) return bc - ac;
      return String(a?.name || '').localeCompare(String(b?.name || ''));
    });
    out.push(...unknown);
  }

  return out;
});

const showTopToggle = computed(() => {
  // Desktop-only affordance
  return isDesktop.value && sortedAgencies.value.length > 10;
});

const visibleAgencies = computed(() => {
  if (!isDesktop.value) return sortedAgencies.value;
  if (showAll.value) return sortedAgencies.value;
  return sortedAgencies.value.slice(0, 10);
});

const allAgenciesNotificationsIconUrl = computed(() => {
  return toUploadsUrl(brandingStore.platformBranding?.all_agencies_notifications_icon_path);
});

const getNotificationCount = (agencyId) => {
  if (agencyId === null) {
    return totalNotifications.value;
  }
  return notificationStore.counts[agencyId] || 0;
};

const getAgencyIconUrl = (agency) => {
  // Priority 1: Use agency icon_file_path (master icon)
  if (agency.icon_file_path) {
    return toUploadsUrl(agency.icon_file_path);
  }
  
  // Priority 2: Use logo_url
  if (agency.logo_url) {
    if (agency.logo_url.startsWith('http://') || agency.logo_url.startsWith('https://')) {
      return agency.logo_url;
    }
    const apiBase = getBackendBaseUrl();
    return `${apiBase}${agency.logo_url.startsWith('/') ? '' : '/'}${agency.logo_url}`;
  }
  
  return null;
};

const getCardStyle = (agency) => {
  const primaryColor = agency.primary_color || agency.color_palette?.primary || '#007bff';
  
  return {
    '--agency-color': primaryColor,
    '--agency-bg': `${primaryColor}08`, // 3% opacity
    borderLeftColor: primaryColor
  };
};

const handleIconError = (event) => {
  const agencyId = event.target.dataset?.agencyId;
  if (agencyId) {
    iconErrors.value[agencyId] = true;
  }
};

const openCategoryModal = (agencyId, agencyName) => {
  selectedAgencyId.value = agencyId;
  selectedAgencyName.value = agencyName;
  showCategoryModal.value = true;
};

const orgTo = (path) => {
  const slug = route.params.organizationSlug;
  if (typeof slug === 'string' && slug) return `/${slug}${path}`;
  return path;
};

const goToAllNotifications = () => {
  // Match existing navigation conventions:
  // - supervisors/CPAs use /notifications
  // - admins/support/super_admin use /admin/notifications
  const role = authStore.user?.role;
  const isSupervisorOrCpa = role === 'supervisor' || role === 'clinical_practice_assistant';
  const path = isSupervisorOrCpa ? '/notifications' : '/admin/notifications';
  router.push(orgTo(path));
};

const closeScopeModal = () => {
  showScopeModal.value = false;
  scopeError.value = '';
};

const loadScopePreference = async () => {
  try {
    const userId = authStore.user?.id;
    if (!userId) return;
    const resp = await api.get(`/users/${userId}/preferences`);
    const prefs = resp.data || {};
    const raw = prefs.dashboard_notification_org_types;
    const parsed = parseJsonMaybe(raw);
    const arr = Array.isArray(parsed) ? parsed : (Array.isArray(raw) ? raw : null);
    if (Array.isArray(arr) && arr.length) {
      selectedOrgTypes.value = arr.map((t) => String(t || '').trim().toLowerCase()).filter(Boolean);
    } else {
      selectedOrgTypes.value = ['agency'];
    }
  } catch {
    // Non-blocking; default stays agencies-only
    selectedOrgTypes.value = ['agency'];
  }
};

const saveScope = async () => {
  try {
    const userId = authStore.user?.id;
    if (!userId) return;
    savingScope.value = true;
    scopeError.value = '';
    scopeSaved.value = false;

    // Always include agency (required)
    const payload = {
      dashboard_notification_org_types: normalizedSelectedTypes.value
    };

    await api.put(`/users/${userId}/preferences`, payload);
    scopeSaved.value = true;
    setTimeout(() => { scopeSaved.value = false; }, 1500);
  } catch (e) {
    scopeError.value = e?.response?.data?.error?.message || e?.message || 'Failed to save scope';
  } finally {
    savingScope.value = false;
  }
};

const toggleShowAll = () => {
  showAll.value = !showAll.value;
};

const closeCategoryModal = () => {
  showCategoryModal.value = false;
  selectedAgencyId.value = null;
  selectedAgencyName.value = '';
};

const fetchAgencies = async () => {
  try {
    loading.value = true;
    
    // Get user's agencies based on role
    if (authStore.user?.role === 'super_admin') {
      // Super admin sees all agencies
      const response = await api.get('/agencies');
      agencies.value = response.data;
    } else {
      // Admin/support see their agencies
      await agencyStore.fetchAgencies(authStore.user?.id);
      agencies.value = agencyStore.agencies;
    }

    // Expand organizations with affiliated orgs (program/school/learning) under agency parents.
    // Best-effort: only used when scope includes non-agency types.
    const base = Array.isArray(agencies.value) ? agencies.value : [];
    const parents = base.filter((a) => String(a?.organization_type || 'agency').toLowerCase() === 'agency');
    const affLists = await Promise.all(
      parents.map(async (a) => {
        try {
          const r = await api.get(`/agencies/${a.id}/affiliated-organizations`);
          return r.data || [];
        } catch {
          return [];
        }
      })
    );
    const merged = [...base, ...affLists.flat()];
    const byId = new Map();
    for (const org of merged) {
      if (!org?.id) continue;
      if (!byId.has(org.id)) byId.set(org.id, org);
    }
    expandedOrganizations.value = Array.from(byId.values());
  } catch (error) {
    console.error('Error fetching agencies:', error);
  } finally {
    loading.value = false;
  }
};

const fetchNotificationCounts = async () => {
  try {
    await notificationStore.fetchCounts();
  } catch (error) {
    // Silently fail - don't break the dashboard if notifications can't be loaded
    console.error('Error fetching notification counts:', error);
    // Set empty counts to prevent further errors
    notificationStore.counts = {};
  }
};

let cleanupMq = null;

onMounted(async () => {
  // Track desktop breakpoint for top-10 behavior.
  const mq = window.matchMedia('(min-width: 769px)');
  const apply = () => {
    isDesktop.value = !!mq.matches;
    if (!isDesktop.value) showAll.value = true; // mobile/tablet: show all
  };
  apply();
  const onChange = () => apply();
  mq.addEventListener?.('change', onChange);
  // Safari fallback
  mq.addListener?.(onChange);
  cleanupMq = () => {
    mq.removeEventListener?.('change', onChange);
    mq.removeListener?.(onChange);
  };

  // Fetch platform branding to get the all agencies notifications icon
  if (!brandingStore.platformBranding) {
    await brandingStore.fetchPlatformBranding();
  }
  await loadScopePreference();
  await fetchAgencies();
  await fetchNotificationCounts();

});

onUnmounted(() => {
  try {
    cleanupMq?.();
  } catch {
    // ignore
  }
  cleanupMq = null;
});

// Watch for agency changes
watch(() => agencyStore.agencies, async () => {
  if (authStore.user?.role !== 'super_admin') {
    agencies.value = agencyStore.agencies;
    // Keep expanded list in sync; affiliated orgs are best-effort and may remain.
    expandedOrganizations.value = Array.isArray(agencies.value) ? agencies.value : [];
  }
});

const orgTypeLabel = (org) => {
  const t = orgTypeValue(org);
  if (t === 'agency') return null;
  if (t === 'program') return 'Program';
  if (t === 'school') return 'School';
  if (t === 'learning') return 'Learning';
  return null;
};
</script>

<style scoped>
.notification-cards-container {
  margin-bottom: 32px;
}

.notification-cards-container h2 {
  margin-bottom: 24px;
  color: var(--text-primary);
}

.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 24px;
}

.header-row h2 {
  margin: 0;
}

.btn-scope {
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: white;
  color: var(--text-primary);
  cursor: pointer;
  font-weight: 800;
}

.btn-scope:hover {
  border-color: var(--primary);
}

.top-toggle {
  display: flex;
  justify-content: flex-end;
  margin: 0 0 10px 0;
}

.btn-toggle {
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: white;
  color: var(--text-primary);
  cursor: pointer;
  font-weight: 700;
}

.btn-toggle:hover {
  border-color: var(--primary);
}

.loading {
  text-align: center;
  padding: 40px;
  color: var(--text-secondary);
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: var(--text-secondary);
  background: white;
  border-radius: 12px;
  border: 1px solid var(--border);
}

.notification-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

.notification-card {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--shadow);
  border: 2px solid var(--border);
  border-left: 4px solid var(--agency-color, var(--border));
  transition: all 0.2s;
  cursor: pointer;
  background-color: var(--agency-bg, white);
}

.notification-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-lg);
  border-color: var(--agency-color, var(--primary));
}

.card-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.agency-icon-wrapper {
  flex-shrink: 0;
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  border-radius: 8px;
  border: 2px solid var(--border);
  padding: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.agency-icon {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
}

.agency-icon-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 700;
  color: var(--agency-color, var(--primary));
  background: var(--agency-bg, var(--bg-alt));
  border-radius: 4px;
}

.agency-icon-placeholder.all-agencies {
  font-size: 32px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.all-agencies-card {
  border-left-color: #667eea;
  background: linear-gradient(135deg, #667eea08 0%, #764ba208 100%);
}

.card-info {
  flex: 1;
  min-width: 0;
}

.agency-name {
  margin: 0 0 8px;
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.org-type {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.notification-count-text {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.notification-badge {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 700;
  background: var(--bg-alt);
  color: var(--text-secondary);
  border: 2px solid var(--border);
  transition: all 0.2s;
}

.notification-badge.has-notifications {
  background: #dc3545;
  color: white;
  border-color: #dc3545;
  box-shadow: 0 2px 8px rgba(220, 53, 69, 0.3);
}

@media (max-width: 768px) {
  .notification-cards-grid {
    grid-template-columns: 1fr;
  }
}

/* Scope modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  border-radius: 12px;
  padding: 24px;
  width: 92%;
  max-width: 520px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}

.modal-header h2 {
  margin: 0;
  font-size: 18px;
  color: var(--text-primary);
}

.btn-close {
  background: none;
  border: none;
  font-size: 28px;
  color: var(--text-secondary);
  cursor: pointer;
  line-height: 1;
}

.modal-body {
  padding-top: 14px;
}

.hint {
  margin: 0 0 14px;
  color: var(--text-secondary);
  font-size: 13px;
}

.scope-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 14px;
}

.scope-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-alt);
}

.scope-label {
  font-weight: 700;
  color: var(--text-primary);
}

.actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.saved {
  color: var(--text-secondary);
  font-size: 13px;
}

.error-inline {
  color: #dc3545;
  font-size: 13px;
}
</style>
