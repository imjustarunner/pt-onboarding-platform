<template>
  <div class="container">
    <div class="dashboard-header">
      <div class="header-content">
        <BrandingLogo size="large" class="dashboard-logo" />
        <div>
          <h1>Platform Dashboard</h1>
          <span class="badge badge-warning">Super Admin</span>
        </div>
      </div>
    </div>
    
    <div v-if="loading" class="loading">Loading platform statistics...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    
    <div v-else class="dashboard-content">
      <div class="dashboard-grid">
        <div class="stat-card">
          <router-link to="/admin/settings?tab=agencies" class="stat-card-link">
            <h3>Total Agencies</h3>
            <p class="stat-value">{{ stats.totalAgencies }}</p>
          </router-link>

          <button
            class="stat-details-toggle"
            type="button"
            @click.stop.prevent="showOrgBreakdown = !showOrgBreakdown"
            :aria-expanded="showOrgBreakdown ? 'true' : 'false'"
          >
            {{ showOrgBreakdown ? 'Hide breakdown' : 'Show breakdown' }}
          </button>

          <div v-if="showOrgBreakdown" class="stat-details" @click.stop>
            <div class="stat-details-row">
              <span class="k">Total schools</span>
              <span class="v">{{ orgTypeCounts.school }}</span>
            </div>
            <div class="stat-details-row">
              <span class="k">Total programs</span>
              <span class="v">{{ orgTypeCounts.program }}</span>
            </div>
            <div class="stat-details-row">
              <span class="k">Total learning</span>
              <span class="v">{{ orgTypeCounts.learning }}</span>
            </div>
            <div class="stat-details-row">
              <span class="k">Total organizations</span>
              <span class="v">{{ orgTypeCounts.total }}</span>
            </div>
          </div>
        </div>
        
        <router-link to="/admin/users" class="stat-card">
          <h3>Active Users</h3>
          <p class="stat-value">{{ stats.activeUsers }}</p>
        </router-link>
        
        <router-link to="/admin/modules?filter=templates" class="stat-card">
          <h3>Training Focus Templates</h3>
          <p class="stat-value">{{ stats.trainingFocusTemplates }}</p>
        </router-link>
        
        <router-link to="/admin/modules?view=table" class="stat-card">
          <h3>Total Modules</h3>
          <p class="stat-value">{{ stats.totalModules }}</p>
        </router-link>

        <router-link to="/tickets?mine=1&status=open" class="stat-card">
          <h3>My Open Tickets</h3>
          <p class="stat-value">{{ myOpenTickets }}</p>
        </router-link>

        <button
          v-if="isSupervisor(user)"
          type="button"
          class="stat-card stat-card-button"
          @click="showSupervisionModal = true"
        >
          <h3>Supervision</h3>
          <p class="stat-value">View supervisees</p>
        </button>
      </div>
      
      <div class="presence-widgets-wrap">
        <div class="presence-widget-wrap">
          <PresenceStatusWidget />
        </div>
        <div class="presence-preview-wrap">
          <PresenceTeamPreview />
        </div>
      </div>
      
      <NotificationCards />

      <section v-if="showSupervisionModal" class="supervision-panel-wrap">
        <div class="section-header">
          <h2 style="margin: 0;">Supervision</h2>
          <button type="button" class="btn btn-secondary btn-sm" @click="showSupervisionModal = false">
            Back to dashboard
          </button>
        </div>
        <SupervisionModal />
      </section>
      
      <div v-if="!currentAgency" class="brand-preview-hint">
        Select an agency brand to preview agency-specific icon overrides.
      </div>

      <QuickActionsSection
        title="Quick Actions"
        context-key="platform"
        :actions="quickActions"
        :default-action-ids="defaultQuickActionIds"
        :icon-resolver="resolveQuickActionIcon"
        :badge-counts="betaFeedbackBadgeCounts"
        compact
      />
      
      <AgencySpecsPanel
        title="Agency Specs"
        v-model:organizationId="selectedOrgId"
        :organizations="agencies"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { useAuthStore } from '../../store/auth';
import { useBrandingStore } from '../../store/branding';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api';
import { isSupervisor } from '../../utils/helpers.js';
import BrandingLogo from '../../components/BrandingLogo.vue';
import NotificationCards from '../../components/admin/NotificationCards.vue';
import QuickActionsSection from '../../components/admin/QuickActionsSection.vue';
import AgencySpecsPanel from '../../components/admin/AgencySpecsPanel.vue';
import SupervisionModal from '../../components/supervision/SupervisionModal.vue';
import PresenceStatusWidget from '../../components/dashboard/PresenceStatusWidget.vue';
import PresenceTeamPreview from '../../components/dashboard/PresenceTeamPreview.vue';

const authStore = useAuthStore();
const user = computed(() => authStore.user);
const showSupervisionModal = ref(false);
const myOpenTickets = ref('—');
const brandingStore = useBrandingStore();
const agencyStore = useAgencyStore();
const currentAgency = computed(() => agencyStore.currentAgency);

const loading = ref(true);
const error = ref('');
const stats = ref({
  totalAgencies: 0,
  activeUsers: 0,
  trainingFocusTemplates: 0,
  totalModules: 0
});
const orgTypeCounts = ref({ total: 0, agency: 0, school: 0, program: 0, learning: 0, other: 0 });
const showOrgBreakdown = ref(false);
const agencies = ref([]);
const selectedOrgId = ref(null);
const orgOverviewSummary = ref({ counts: { school: 0, program: 0, learning: 0, other: 0 } });
const betaFeedbackPendingCount = ref(0);

const betaFeedbackBadgeCounts = computed(() => ({
  beta_feedback: betaFeedbackPendingCount.value > 0 ? betaFeedbackPendingCount.value : 0
}));

// Use branding from store instead of local ref
const branding = computed(() => brandingStore.platformBranding);

const fetchStats = async () => {
  try {
    loading.value = true;
    
    // Ensure branding is fetched from store
    if (!brandingStore.platformBranding) {
      await brandingStore.fetchPlatformBranding();
    }
    
    const [agenciesRes, usersRes, modulesRes, templatesRes, pendingRes] = await Promise.all([
      api.get('/agencies'),
      api.get('/users'),
      api.get('/modules'),
      api.get('/training-focuses/templates'),
      api.get('/beta-feedback/pending-count', { skipGlobalLoading: true }).catch(() => ({ data: { count: 0 } }))
    ]);
    betaFeedbackPendingCount.value = pendingRes?.data?.count ?? 0;

    const rawOrgs = Array.isArray(agenciesRes.data) ? agenciesRes.data : [];
    const primaryAgencies = rawOrgs.filter((a) => String(a?.organization_type || 'agency').toLowerCase() === 'agency');

    const counts = { total: rawOrgs.length, agency: 0, school: 0, program: 0, learning: 0, other: 0 };
    for (const o of rawOrgs) {
      const t = String(o?.organization_type || '').trim().toLowerCase();
      if (t === 'agency') counts.agency += 1;
      else if (t === 'school') counts.school += 1;
      else if (t === 'program') counts.program += 1;
      else if (t === 'learning') counts.learning += 1;
      else counts.other += 1;
    }
    orgTypeCounts.value = counts;
    
    stats.value = {
      totalAgencies: primaryAgencies.length,
      activeUsers: (usersRes.data || []).filter((u) => String(u?.status || '').toUpperCase() === 'ACTIVE_EMPLOYEE').length,
      trainingFocusTemplates: templatesRes.data.length,
      totalModules: modulesRes.data.length
    };
    
    console.log('SuperAdminDashboard: Using branding from store:', {
      manage_agencies_icon_id: branding.value?.manage_agencies_icon_id,
      manage_agencies_icon_path: branding.value?.manage_agencies_icon_path,
      manage_modules_icon_id: branding.value?.manage_modules_icon_id,
      manage_modules_icon_path: branding.value?.manage_modules_icon_path,
      manage_documents_icon_id: branding.value?.manage_documents_icon_id,
      manage_documents_icon_path: branding.value?.manage_documents_icon_path,
      manage_users_icon_id: branding.value?.manage_users_icon_id,
      manage_users_icon_path: branding.value?.manage_users_icon_path,
      platform_settings_icon_id: branding.value?.platform_settings_icon_id,
      platform_settings_icon_path: branding.value?.platform_settings_icon_path,
      view_all_progress_icon_id: branding.value?.view_all_progress_icon_id,
      view_all_progress_icon_path: branding.value?.view_all_progress_icon_path
    });
    
    // Agency Specs should focus on agencies; other org types are secondary.
    agencies.value = primaryAgencies;

    // Default to the first org (prefer active)
    if (!selectedOrgId.value && Array.isArray(agencies.value) && agencies.value.length > 0) {
      const active = agencies.value.find((a) => a?.is_active) || agencies.value[0];
      selectedOrgId.value = active?.id || null;
    }
    
    // Show all agencies, not just first 6
    // agencies.value = agenciesRes.data.slice(0, 6); // Removed limit
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load statistics';
  } finally {
    loading.value = false;
  }
};

const fetchOrgOverviewSummary = async () => {
  const agencyId = selectedOrgId.value ? Number(selectedOrgId.value) : null;
  if (!agencyId) {
    orgOverviewSummary.value = { counts: { school: 0, program: 0, learning: 0, other: 0 } };
    return;
  }
  try {
    const res = await api.get('/dashboard/org-overview-summary', { params: { agencyId } });
    orgOverviewSummary.value = res.data || { counts: { school: 0, program: 0, learning: 0, other: 0 } };
  } catch {
    orgOverviewSummary.value = { counts: { school: 0, program: 0, learning: 0, other: 0 } };
  }
};

const hasAffiliatedSchools = computed(() => Number(orgOverviewSummary.value?.counts?.school || 0) > 0);
// Program Overview includes learning orgs (but not schools).
const hasAffiliatedPrograms = computed(() =>
  Number(orgOverviewSummary.value?.counts?.program || 0) + Number(orgOverviewSummary.value?.counts?.learning || 0) > 0
);

const getActionIcon = (actionKey) => {
  // Use centralized branding logic.
  // For super_admin, allow previewing a selected agency's overrides via currentAgency.
  return brandingStore.getAdminQuickActionIconUrl(actionKey, currentAgency.value || null);
};

const parseFeatureFlags = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'object') return raw || {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) || {}; } catch { return {}; }
  }
  return {};
};
const isTruthyFlag = (v) => {
  if (v === true || v === 1) return true;
  const s = String(v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
};
const clinicalNoteGeneratorEnabledForAgency = computed(() =>
  (() => {
    const flags = parseFeatureFlags(currentAgency.value?.feature_flags);
    return isTruthyFlag(flags?.noteAidEnabled) || isTruthyFlag(flags?.clinicalNoteGeneratorEnabled);
  })()
);

const quickActions = computed(() => {
  const base = [
  {
    id: 'manage_organizations',
    title: 'Manage Organizations',
    description: 'Create and manage all organizations',
    to: '/admin/settings?tab=agencies',
    emoji: '🏢',
    iconKey: 'manage_agencies',
    category: 'Management',
    roles: ['admin', 'support', 'super_admin', 'staff'],
    capabilities: ['canAccessPlatform']
  },
  {
    id: 'manage_clients',
    title: 'Manage Clients',
    description: 'Create and manage clients',
    to: '/admin/clients',
    emoji: '🧾',
    iconKey: 'manage_clients',
    category: 'Management',
    roles: ['admin', 'support', 'super_admin', 'staff'],
    capabilities: ['canAccessPlatform']
  },
  {
    id: 'clinical_note_generator',
    title: 'Note Aid',
    description: 'Clinical Director Agent (audio + text)',
    to: '/admin/note-aid',
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
    to: '/admin/schools/import',
    emoji: '🏫',
    category: 'Management',
    roles: ['admin', 'support', 'super_admin', 'staff'],
    capabilities: ['canAccessPlatform']
  },
  {
    id: 'school_overview',
    title: 'School Overview',
    description: 'View affiliated schools and key staffing/slot stats',
    to: '/admin/schools/overview?orgType=school',
    emoji: '🏫',
    iconKey: 'school_overview',
    category: 'Management',
    roles: ['admin', 'support', 'super_admin', 'staff'],
    capabilities: ['canAccessPlatform']
  },
  {
    id: 'program_overview',
    title: 'Program Overview',
    description: 'View affiliated programs and learning orgs (staffing/slots/docs)',
    to: '/admin/schools/overview?orgType=program',
    emoji: '🧩',
    iconKey: 'program_overview',
    category: 'Management',
    roles: ['admin', 'support', 'super_admin', 'staff'],
    capabilities: ['canAccessPlatform']
  },
  {
    id: 'intake_links',
    title: 'Intake Links',
    description: 'Configure intake links, documents, and questions',
    to: '/admin/intake-links',
    emoji: '🔗',
    iconKey: 'intake_links',
    category: 'Documents',
    roles: ['admin', 'support', 'super_admin', 'staff'],
    capabilities: ['canSignDocuments']
  },
  {
    id: 'manage_modules',
    title: 'Manage Modules',
    description: 'Create shared modules and manage all training',
    to: '/admin/modules',
    emoji: '📚',
    iconKey: 'manage_modules',
    category: 'Training',
    roles: ['admin', 'support', 'super_admin', 'staff'],
    capabilities: ['canViewTraining']
  },
  {
    id: 'manage_documents',
    title: 'Manage Documents',
    description: 'Upload templates and assign documents for signature',
    to: '/admin/documents',
    emoji: '📄',
    iconKey: 'manage_documents',
    category: 'Documents',
    roles: ['admin', 'support', 'super_admin', 'staff'],
    capabilities: ['canSignDocuments']
  },
  {
    id: 'manage_users',
    title: 'Manage Users',
    description: 'View and manage all user accounts',
    to: '/admin/users',
    emoji: '👥',
    iconKey: 'manage_users',
    category: 'Management',
    roles: ['admin', 'support', 'super_admin', 'staff'],
    capabilities: ['canAccessPlatform']
  },
  {
    id: 'communications',
    title: 'Communications',
    description: 'View communications feed',
    to: '/admin/communications',
    emoji: '💬',
    iconKey: 'dashboard_communications',
    category: 'Communications',
    roles: ['admin', 'support', 'super_admin', 'staff', 'clinical_practice_assistant'],
    capabilities: ['canUseChat']
  },
  {
    id: 'chats',
    title: 'Chats',
    description: 'Open platform chats',
    to: '/admin/communications/chats',
    emoji: '💬',
    iconKey: 'dashboard_chats',
    category: 'Communications',
    roles: ['admin', 'support', 'super_admin', 'staff', 'clinical_practice_assistant'],
    capabilities: ['canUseChat']
  },
  {
    id: 'external_calendar_audit',
    title: 'Agency Calendar',
    description: 'Review provider schedules with calendar busy overlays',
    to: '/admin/external-calendar-audit',
    emoji: '🗓️',
    iconKey: 'external_calendar_audit',
    category: 'Scheduling',
    roles: ['admin', 'support', 'super_admin', 'staff', 'clinical_practice_assistant'],
    capabilities: ['canAccessPlatform']
  },
  {
    id: 'provider_availability_dashboard',
    title: 'Provider Availability',
    description: 'View availability by school slots, office, and virtual',
    to: '/admin/provider-availability',
    emoji: '🧭',
    iconKey: 'provider_availability_dashboard',
    category: 'Scheduling',
    roles: ['admin', 'support', 'super_admin', 'staff', 'clinical_practice_assistant'],
    capabilities: ['canAccessPlatform']
  },
  {
    id: 'provider_scheduling_settings',
    title: 'Provider Scheduling',
    description: 'Configure provider scheduling preferences and rules',
    to: '/admin/settings?category=workflow&item=provider-scheduling',
    emoji: '🗓️',
    category: 'Scheduling',
    roles: ['admin', 'super_admin'],
    capabilities: ['canAccessPlatform']
  },
  {
    id: 'skill_builders_availability',
    title: 'Skill Builders Availability',
    description: 'Review Skill Builders availability by day',
    to: '/admin/skill-builders-availability',
    emoji: '🧩',
    iconKey: 'skill_builders_availability',
    category: 'Scheduling',
    roles: ['admin', 'support', 'super_admin', 'staff', 'clinical_practice_assistant'],
    capabilities: ['canAccessPlatform']
  },
  {
    id: 'notifications',
    title: 'Notifications',
    description: 'View all notifications',
    to: '/admin/notifications',
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
    to: '/admin/payroll',
    emoji: '💵',
    iconKey: 'dashboard_payroll',
    category: 'Management',
    roles: ['admin', 'super_admin'],
    capabilities: ['canAccessPlatform']
  },
  {
    id: 'executive_report',
    title: 'Executive Report',
    description: 'Snapshot + trends for meetings',
    to: '/admin/executive-report',
    emoji: '📈',
    iconKey: 'executive_report',
    category: 'Management',
    roles: ['super_admin'],
    capabilities: ['canAccessPlatform']
  },
  {
    id: 'marketing_social',
    title: 'Marketing and Social Media',
    description: 'Schedule and publish Instagram posts per agency',
    to: '/admin/marketing-social',
    emoji: '📱',
    iconKey: 'marketing_social',
    category: 'Management',
    roles: ['super_admin'],
    capabilities: ['canAccessPlatform']
  },
  {
    id: 'platform_settings',
    title: 'Platform Settings',
    description: 'Configure platform-wide settings and terminology',
    to: '/admin/settings',
    emoji: '⚙️',
    iconKey: 'platform_settings',
    category: 'System',
    roles: ['super_admin'],
    capabilities: ['canAccessPlatform']
  },
  {
    id: 'audit_center',
    title: 'Audit Center',
    description: 'Audit exports and operational reports',
    to: '/admin/audit-center',
    emoji: '🛡️',
    iconKey: 'audit_center',
    category: 'System',
    roles: ['super_admin'],
    capabilities: ['canAccessPlatform']
  },
  {
    id: 'presence',
    title: 'Presence / Team Board',
    description: 'See who is in, out, or traveling (SuperAdmin testing)',
    to: '/admin/presence',
    emoji: '📍',
    category: 'Management',
    roles: ['super_admin'],
    capabilities: ['canAccessPlatform']
  },
  {
    id: 'beta_feedback',
    title: 'Beta Feedback',
    description: 'View user-submitted feedback and screenshots for debugging',
    to: '/admin/beta-feedback',
    emoji: '🐛',
    category: 'System',
    roles: ['super_admin'],
    capabilities: ['canAccessPlatform']
  },
  {
    id: 'all_progress',
    title: 'View All Progress',
    description: 'View training progress across all agencies',
    to: '/admin/agency-progress',
    emoji: '📊',
    iconKey: 'view_all_progress',
    category: 'Training',
    roles: ['admin', 'support', 'super_admin', 'staff'],
    capabilities: ['canViewTraining']
  },
  {
    id: 'billing',
    title: 'Billing',
    description: 'Plan usage and QuickBooks',
    to: '/admin/settings?category=general&item=billing',
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
    to: '/admin/billing-policy-rules',
    emoji: '📘',
    iconKey: 'dashboard_billing',
    category: 'System',
    roles: ['admin', 'support', 'super_admin', 'staff'],
    capabilities: ['canAccessPlatform']
  }
  ];

  return base.filter((a) => {
    if (String(a?.id) === 'school_overview') return hasAffiliatedSchools.value;
    if (String(a?.id) === 'program_overview') return hasAffiliatedPrograms.value;
    if (String(a?.id) === 'clinical_note_generator') return clinicalNoteGeneratorEnabledForAgency.value;
    return true;
  });
});

const defaultQuickActionIds = computed(() => ([
  'executive_report',
  'presence',
  'beta_feedback',
  'manage_organizations',
  'manage_clients',
  ...(clinicalNoteGeneratorEnabledForAgency.value ? ['clinical_note_generator'] : []),
  ...(hasAffiliatedSchools.value ? ['school_overview'] : []),
  ...(hasAffiliatedPrograms.value ? ['program_overview'] : []),
  'manage_modules',
  'manage_documents',
  'intake_links',
  'manage_users',
  'audit_center',
  'external_calendar_audit',
  'provider_availability_dashboard',
  'provider_scheduling_settings',
  'skill_builders_availability',
  'notifications',
  'communications',
  'chats',
  'payroll',
  'billing',
  'billing_policy_rules',
  'all_progress'
]));

const resolveQuickActionIcon = (action) => {
  if (!action?.iconKey) return null;
  return getActionIcon(action.iconKey);
};

// Watch for branding changes and refetch if needed
watch(() => brandingStore.platformBranding, (newBranding) => {
  if (newBranding) {
    console.log('SuperAdminDashboard: Branding updated in store, icons should refresh');
  }
}, { deep: true });

watch(
  () => selectedOrgId.value,
  async () => {
    await fetchOrgOverviewSummary();
  }
);

onMounted(async () => {
  // Ensure branding is loaded before fetching stats
  if (!brandingStore.platformBranding) {
    await brandingStore.fetchPlatformBranding();
  }
  await fetchStats();
  await fetchOrgOverviewSummary();
});

const loadMyOpenTickets = async () => {
  try {
    const r = await api.get('/support-tickets', { params: { mine: true, status: 'open' } });
    const list = Array.isArray(r.data) ? r.data : [];
    myOpenTickets.value = String(list.length);
  } catch {
    myOpenTickets.value = '—';
  }
};

onMounted(loadMyOpenTickets);
</script>

<style scoped>
.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
  padding-bottom: 24px;
  border-bottom: 2px solid var(--border);
}

.header-content {
  display: flex;
  align-items: center;
  gap: 24px;
}

.dashboard-logo {
  flex-shrink: 0;
}

.dashboard-header h1 {
  margin: 0;
  color: var(--text-primary);
}

.dashboard-content {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.brand-preview-hint {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: -8px;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
}

.stat-card {
  background: white;
  padding: 32px;
  border-radius: 12px;
  box-shadow: var(--shadow);
  text-align: center;
  cursor: pointer;
  text-decoration: none;
  display: block;
  color: inherit;
  border: 1px solid var(--border);
  transition: all 0.2s;
  display: block;
  text-decoration: none;
  color: inherit;
  cursor: pointer;
  position: relative;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
  border-color: var(--primary);
}

.stat-card.stat-card-button {
  width: 100%;
  font: inherit;
  appearance: none;
  -webkit-appearance: none;
}

.stat-card-link {
  display: block;
  text-decoration: none;
  color: inherit;
}

.stat-details-toggle {
  margin-top: 14px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg-alt);
  color: var(--text-primary);
  cursor: pointer;
  font-weight: 700;
  width: 100%;
}

.stat-details-toggle:hover {
  border-color: var(--primary);
}

.stat-details {
  margin-top: 12px;
  text-align: left;
  border-top: 1px solid var(--border);
  padding-top: 12px;
  display: grid;
  gap: 8px;
}

.stat-details-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 13px;
}

.stat-details-row .k {
  color: var(--text-secondary);
  font-weight: 700;
}

.stat-details-row .v {
  color: var(--text-primary);
  font-weight: 900;
}

.stat-card h3 {
  color: var(--text-secondary);
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 12px;
  font-weight: 600;
}

.stat-value {
  font-size: 40px;
  font-weight: 700;
  color: var(--primary);
  margin: 0;
}

/* Quick Actions are now rendered by `QuickActionsSection` */

.agencies-overview {
  background: white;
  padding: 32px;
  border-radius: 12px;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
}

.agencies-overview h2 {
  margin-bottom: 24px;
  color: var(--text-primary);
}

.agencies-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 20px;
}

.agency-card {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  padding: 20px;
  background: var(--bg-alt);
  border-radius: 8px;
  border: 2px solid var(--border);
  transition: all 0.2s;
  cursor: pointer;
  gap: 12px;
}

.agency-card:hover {
  border-color: var(--primary);
  box-shadow: var(--shadow);
  transform: translateY(-2px);
}

.agency-actions {
  display: flex;
  gap: 8px;
}

.agency-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0; /* allow truncation */
  flex-wrap: nowrap;
}

.agency-name {
  font-weight: 800;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.agency-badges {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  flex-shrink: 0;
  white-space: nowrap;
}

/* Keep everything on one line; allow horizontal scroll if needed */
.agency-card {
  overflow: hidden;
}

.agency-actions {
  flex-shrink: 0;
  white-space: nowrap;
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: var(--text-secondary);
}

.presence-widgets-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  align-items: flex-start;
}

.presence-widget-wrap {
  max-width: 280px;
}

.presence-preview-wrap {
  flex: 1;
  min-width: 280px;
  max-width: 600px;
}
</style>

