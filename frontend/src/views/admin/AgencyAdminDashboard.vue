<template>
  <div class="container">
    <PlatformPreviewBanner
      v-if="previewMode"
      :title="`Previewing ${currentAgency?.name || 'tenant'} admin dashboard`"
      subtitle="Platform preview keeps the tenant shell visible while write actions stay disabled."
    />
    <div class="dashboard-header" :class="{ 'dashboard-header--compact': isSummitStatsContext }">
      <div class="header-content">
        <BrandingLogo 
          v-if="currentAgency && !isSummitStatsContext" 
          size="large" 
          class="dashboard-logo" 
          :logo-url="dashboardLogoUrl"
        />
        <div class="header-title-block">
          <h1>{{ dashboardTitle }}</h1>
          <span class="badge badge-info">{{ dashboardBadge }}</span>
        </div>
      </div>
      <div v-if="currentAgency && !isSummitStatsContext" class="header-right">
        <div v-if="showClubSwitcher" class="club-switcher">
          <label for="club-switcher-select" class="club-switcher-label">Managing club</label>
          <select
            id="club-switcher-select"
            class="club-switcher-select"
            :value="String(currentAgency.id)"
            @change="onClubSwitch($event)"
          >
            <option v-for="opt in clubManagerManagedClubs" :key="opt.id" :value="String(opt.id)">
              {{ opt.name }}
            </option>
          </select>
        </div>
        <div class="agency-badge">
          <span class="agency-name">{{ currentAgency.name }}</span>
        </div>
      </div>
    </div>
    
    <!-- Summit Stats club managers only (sstc slug): create/manage club as main interface -->
    <div v-if="clubContextLoading && isSscAdminRoute" class="loading">Loading…</div>
    <div v-else-if="isSscAdminRoute && clubContext?.summitStatsScopedAdmin && !(clubContext.clubs?.length)" class="create-club-section">
      <div v-if="!clubContext?.emailVerified" class="create-club-card create-club-verify">
        <h3>Verify your email</h3>
        <p>Please verify your email before creating your club. Check your inbox for the verification link.</p>
        <p class="hint">Didn't receive the email? Click "Resend" below to resend the verification email or get a direct link (when email isn't configured).</p>
        <div v-if="verificationError" class="create-club-error">{{ verificationError }}</div>
        <p v-if="verificationLink" class="verification-link-box">
          <strong>Verification link</strong> (if email not configured):<br />
          <a :href="verificationLink" target="_blank" rel="noopener noreferrer">{{ verificationLink }}</a>
        </p>
        <button
          type="button"
          class="btn create-club-btn"
          :disabled="resendVerificationLoading"
          @click="requestVerificationLink"
        >
          {{ resendVerificationLoading ? 'Sending…' : 'Resend' }}
        </button>
      </div>
      <div v-else class="create-club-card">
        <h3>Create your club</h3>
        <p>Create and manage your club or organization here. This is your main admin interface.</p>
        <div v-if="createClubError" class="create-club-error">{{ createClubError }}</div>
        <form v-if="!createClubSuccess" @submit.prevent="submitCreateClub" class="create-club-form">
          <input v-model="createClubName" type="text" placeholder="Club name" required class="create-club-input" />
          <div class="create-club-slug-row">
            <input v-model="createClubSlug" type="text" placeholder="Custom URL slug (optional)" class="create-club-input create-club-slug" />
            <span class="create-club-slug-hint">Leave blank to auto-generate from name. You can edit later in settings.</span>
          </div>
          <button type="submit" :disabled="createClubSubmitting" class="create-club-btn">
            {{ createClubSubmitting ? 'Creating…' : 'Create Club' }}
          </button>
        </form>
        <p v-else class="create-club-success">Club created. Refreshing…</p>
      </div>
    </div>

    <div v-else-if="loading" class="loading">Loading agency statistics...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    
    <div v-else class="dashboard-content" :class="{ 'dashboard-content--club': isSummitStatsContext }">
      <div class="dashboard-grid" :class="{ 'dashboard-grid--club': isSummitStatsContext }">
        <component 
          v-if="!isSummitStatsContext && ((user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'support') || (user?.role !== 'clinical_practice_assistant' && !isSupervisor(user)))"
          :is="previewMode ? 'div' : 'router-link'"
          :to="previewMode ? null : '/admin/settings?tab=agencies'"
          class="stat-card"
          :class="{ 'preview-disabled': previewMode }"
        >
          <h3>My Agencies</h3>
          <p class="stat-value">{{ stats.myAgencies }}</p>
        </component>
        
        <component 
          v-if="!isSummitStatsContext && ((user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'support') || (user?.role !== 'clinical_practice_assistant' && !isSupervisor(user)))"
          :is="previewMode ? 'div' : 'router-link'"
          :to="previewMode ? null : '/admin/modules?filter=templates'"
          class="stat-card"
          :class="{ 'preview-disabled': previewMode }"
        >
          <h3>Training Focus Templates</h3>
          <p class="stat-value">{{ stats.trainingFocusTemplates }}</p>
        </component>
        
        <component 
          v-if="!isSummitStatsContext && ((user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'support') || (user?.role !== 'clinical_practice_assistant' && !isSupervisor(user)))"
          :is="previewMode ? 'div' : 'router-link'"
          :to="previewMode ? null : '/admin/modules?view=table'"
          class="stat-card"
          :class="{ 'preview-disabled': previewMode }"
        >
          <h3>Agency Modules</h3>
          <p class="stat-value">{{ stats.agencyModules }}</p>
        </component>
        
        <component 
          v-if="!isSummitStatsContext"
          :is="previewMode ? 'div' : 'router-link'"
          :to="previewMode ? null : orgTo('/admin/users')"
          class="stat-card"
          :class="{ 'preview-disabled': previewMode }"
        >
          <h3>Active Users</h3>
          <p class="stat-value">{{ stats.activeUsers }}</p>
        </component>

        <component
          v-if="!isSummitStatsContext"
          :is="previewMode ? 'div' : 'router-link'"
          :to="previewMode ? null : ticketsLink"
          class="stat-card"
          :class="{ 'preview-disabled': previewMode }"
        >
          <h3>My Open Tickets</h3>
          <p class="stat-value">{{ myOpenTickets }}</p>
        </component>

        <button
          v-if="!previewMode && (isSupervisor(user) || user?.role === 'clinical_practice_assistant')"
          type="button"
          class="stat-card stat-card-button stat-card-compact"
          @click="showSupervisionModal = true"
        >
          <h3>Supervision</h3>
          <p class="stat-value">View supervisees</p>
        </button>
      </div>
      
      <!-- Club managers see notifications inline inside ClubQuickActions card grid -->
      <NotificationCards v-if="!previewMode && !isSummitStatsContext" :compact="false" />

      <section v-if="showSupervisionModal" class="supervision-panel-wrap">
        <div class="section-header">
          <h2 style="margin: 0;">Supervision</h2>
          <button type="button" class="btn btn-secondary btn-sm" @click="showSupervisionModal = false">
            Back to dashboard
          </button>
        </div>
        <SupervisionModal />
      </section>

      <ClubQuickActions
        v-if="!previewMode && isSummitStatsContext"
        :key="`club-qa-${currentAgency?.id || 0}`"
        :org-slug="orgSlug"
        :agency="agencyData || currentAgency"
        :active-member-count="clubMemberStats.active"
        :dormant-member-count="clubMemberStats.dormant"
        compact
        @add-member="showAddMemberModal = true"
        @add-season="showAddSeasonModal = true"
      />
      <QuickActionsSection
        v-else-if="!previewMode"
        title="Quick Actions"
        context-key="agency"
        :actions="quickActions"
        :default-action-ids="defaultQuickActionIds"
        :icon-resolver="resolveQuickActionIcon"
        compact
      />

      <ClubAddMemberModal
        :open="showAddMemberModal"
        :club-id="currentAgency?.id"
        @close="showAddMemberModal = false"
        @added="() => { fetchStats(); showAddMemberModal = false; }"
      />
      <ClubAddSeasonModal
        :open="showAddSeasonModal"
        :club-id="currentAgency?.id"
        @close="showAddSeasonModal = false"
        @created="() => { showAddSeasonModal = false; }"
      />

      <ClubSpecsPanel
        v-if="!previewMode && isSummitStatsContext && currentAgency?.id"
        :key="`club-specs-${currentAgency.id}`"
        title="Club Specs"
        :organization-id="currentAgency?.id"
        compact
      />
      <AgencySpecsPanel
        v-else-if="!previewMode && myAgencies.length > 0 && ((user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'support') || (user?.role !== 'clinical_practice_assistant' && !isSupervisor(user)))"
        title="Agency Specs"
        v-model:organizationId="selectedOrgId"
        :organizations="myAgencies"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { getCached, setCached } from '../../utils/adminApiCache';
import { useAgencyStore } from '../../store/agency';
import { useBrandingStore } from '../../store/branding';
import { useAuthStore } from '../../store/auth';
import { canAccessSchoolPortalsSurfaces } from '../../utils/schoolPortalsAccess.js';
import { canAccessSkillBuildersSchoolProgramSurfaces } from '../../utils/skillBuildersSchoolProgramAccess.js';
import { isSupervisor } from '../../utils/helpers.js';
import NotificationCards from '../../components/admin/NotificationCards.vue';
import PlatformPreviewBanner from '../../components/admin/PlatformPreviewBanner.vue';
import QuickActionsSection from '../../components/admin/QuickActionsSection.vue';
import ClubQuickActions from '../../components/club/ClubQuickActions.vue';
import ClubAddMemberModal from '../../components/club/ClubAddMemberModal.vue';
import ClubAddSeasonModal from '../../components/club/ClubAddSeasonModal.vue';
import AgencySpecsPanel from '../../components/admin/AgencySpecsPanel.vue';
import ClubSpecsPanel from '../../components/club/ClubSpecsPanel.vue';
import SupervisionModal from '../../components/supervision/SupervisionModal.vue';
import { isSummitPlatformRouteSlug } from '../../utils/summitPlatformSlugs.js';

const props = defineProps({
  previewMode: {
    type: Boolean,
    default: false
  },
  previewStats: {
    type: Object,
    default: null
  }
});

const myOpenTickets = ref('—');

const route = useRoute();
const router = useRouter();
const agencyStore = useAgencyStore();
const brandingStore = useBrandingStore();
const authStore = useAuthStore();
const user = computed(() => authStore.user);
const ticketsLink = computed(() => {
  const slug = route.params?.organizationSlug;
  const base = typeof slug === 'string' && slug ? `/${slug}/tickets` : '/tickets';
  return `${base}?mine=1&status=open`;
});
const currentAgency = computed(() => agencyStore.currentAgency);

// Summit platform org slug (sstc / sstc / summit-stats / env) — same as club-manager dashboard route
const isSscAdminRoute = computed(() => isSummitPlatformRouteSlug(route.params?.organizationSlug));
// Summit Stats club context: use "Club" terminology instead of "Agency"
const isSummitStatsContext = computed(() => {
  if (clubContext.value?.summitStatsScopedAdmin) return true;
  const orgType = String(currentAgency.value?.organization_type || currentAgency.value?.organizationType || '').toLowerCase();
  return orgType === 'affiliation';
});

/** Club dashboard: show the affiliation logo; otherwise fall back to platform branding store. */
const dashboardLogoUrl = computed(() => {
  if (props.previewMode) {
    return currentAgency.value?.logo_url || null;
  }
  if (isSummitStatsContext.value) {
    const u = agencyData.value?.logo_url || currentAgency.value?.logo_url;
    return u || null;
  }
  return undefined;
});

const dashboardTitle = computed(() => (isSummitStatsContext.value ? 'Club Dashboard' : 'Agency Dashboard'));
const dashboardBadge = computed(() => (isSummitStatsContext.value ? 'Club Manager' : 'Agency Admin'));

const showSupervisionModal = ref(false);
const loading = ref(true);
const error = ref('');
const stats = ref({
  myAgencies: 0,
  agencyModules: 0,
  trainingFocusTemplates: 0,
  activeUsers: 0
});
const clubMemberStats = ref({ active: null, dormant: null });
const myAgencies = ref([]);
const branding = computed(() => brandingStore.platformBranding);

// Summit Stats club manager: create club flow
const clubContext = ref(null);
const clubContextLoading = ref(false);
const createClubName = ref('');
const createClubSlug = ref('');
const createClubSubmitting = ref(false);
const createClubSuccess = ref(false);
const createClubError = ref('');
const verificationLink = ref('');
const verificationError = ref('');
const resendVerificationLoading = ref(false);
const showAddMemberModal = ref(false);
const showAddSeasonModal = ref(false);

const requestVerificationLink = async () => {
  resendVerificationLoading.value = true;
  verificationLink.value = '';
  verificationError.value = '';
  try {
    const r = await api.post('/auth/resend-club-manager-verification', {
      portalSlug: route.params?.organizationSlug || undefined
    });
    if (r.data?.verifyUrl) {
      verificationLink.value = r.data.verifyUrl;
    }
    if (r.data?.alreadyVerified) {
      await loadClubManagerContext();
    }
  } catch (e) {
    verificationError.value = e?.response?.data?.error?.message || 'Failed to get verification link';
  } finally {
    resendVerificationLoading.value = false;
  }
};

const loadClubManagerContext = async () => {
  if (!isSummitPlatformRouteSlug(route.params?.organizationSlug)) return;
  clubContextLoading.value = true;
  try {
    const r = await api.get('/summit-stats/club-manager-context', { skipGlobalLoading: true });
    clubContext.value = r.data || null;

    // Club already exists: the dashboard will skip the create-club form (clubs.length > 0 guard).
    // No redirect needed — club managers stay at /sstc/admin regardless of which club they own.
  } catch {
    clubContext.value = null;
  } finally {
    clubContextLoading.value = false;
  }
};

const applyClubTargetAgency = async (target) => {
  const targetId = Number(target?.id || 0);
  if (!targetId) return;
  const fromList = (agencyStore.userAgencies || []).find((a) => Number(a?.id) === targetId);
  if (fromList) {
    agencyStore.setCurrentAgency(fromList);
    return;
  }
  try {
    const { data } = await api.get(`/agencies/${targetId}`);
    if (data?.id) agencyStore.setCurrentAgency(data);
  } catch {
    // ignore
  }
};

/**
 * Club managers often still have the SSTC platform org as persisted currentAgency (localStorage).
 * Panels (applications, club specs) need the affiliation id — not the platform tenant.
 * Supports `?club=<id>` for multi-club switching and bookmarkable links.
 */
const syncClubManagerAffiliationContext = async () => {
  if (String(authStore.user?.role || '').toLowerCase() !== 'club_manager') return;

  const managedList = Array.isArray(clubContext.value?.managedClubs) ? clubContext.value.managedClubs : [];
  let clubsList = Array.isArray(clubContext.value?.clubs) ? clubContext.value.clubs : [];

  if (!managedList.length && !clubsList.length) {
    const list = Array.isArray(agencyStore.userAgencies) ? agencyStore.userAgencies : [];
    clubsList = list.filter(
      (a) => String(a?.organization_type || a?.organizationType || '').toLowerCase() === 'affiliation'
    );
  }

  const seen = new Set();
  const candidates = [];
  for (const a of [...managedList, ...clubsList]) {
    const id = Number(a?.id || 0);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    candidates.push(a);
  }
  if (!candidates.length) return;

  let queryClubId = Number(route.query.club || 0);
  if (route.query.club != null && String(route.query.club).trim() !== '') {
    if (!queryClubId || !candidates.some((c) => Number(c.id) === queryClubId)) {
      const nextQ = { ...route.query };
      delete nextQ.club;
      await router.replace({ path: route.path, query: nextQ, hash: route.hash });
      queryClubId = 0;
    }
  }

  const cur = agencyStore.currentAgency?.value || agencyStore.currentAgency || null;
  const curId = Number(cur?.id || 0);
  const curType = String(cur?.organization_type || cur?.organizationType || '').toLowerCase();

  if (queryClubId && candidates.some((c) => Number(c.id) === queryClubId)) {
    if (curId !== queryClubId || curType !== 'affiliation') {
      const target = candidates.find((c) => Number(c.id) === queryClubId);
      await applyClubTargetAgency(target);
    }
    return;
  }

  if (curType === 'affiliation' && candidates.some((c) => Number(c.id) === curId)) {
    return;
  }

  const routeSlug = String(route.params?.organizationSlug || '').trim().toLowerCase();
  let target = null;
  if (routeSlug && !isSummitPlatformRouteSlug(routeSlug)) {
    target = candidates.find(
      (c) => String(c.slug || c.portal_url || c.portalUrl || '').trim().toLowerCase() === routeSlug
    );
  }
  if (!target) {
    target = managedList.length ? managedList[0] : candidates[0];
  }

  await applyClubTargetAgency(target);
};

/** Affiliation clubs this manager can act on (for the header switcher). */
const clubManagerManagedClubs = computed(() => {
  if (String(authStore.user?.role || '').toLowerCase() !== 'club_manager') return [];
  const managed = clubContext.value?.managedClubs;
  const clubs = clubContext.value?.clubs;
  const seen = new Set();
  const out = [];
  for (const a of [...(Array.isArray(managed) ? managed : []), ...(Array.isArray(clubs) ? clubs : [])]) {
    const id = Number(a?.id || 0);
    if (!id || seen.has(id)) continue;
    if (String(a?.organization_type || a?.organizationType || '').toLowerCase() !== 'affiliation') continue;
    seen.add(id);
    out.push({ id, name: String(a?.name || '').trim() || `Club ${id}` });
  }
  if (out.length) {
    return out.sort((x, y) => x.name.localeCompare(y.name));
  }
  return (agencyStore.userAgencies || [])
    .filter((a) => String(a?.organization_type || a?.organizationType || '').toLowerCase() === 'affiliation')
    .map((a) => ({
      id: Number(a.id),
      name: String(a?.name || '').trim() || `Club ${a.id}`
    }))
    .sort((x, y) => x.name.localeCompare(y.name));
});

const showClubSwitcher = computed(
  () =>
    !props.previewMode &&
    isSscAdminRoute.value &&
    clubManagerManagedClubs.value.length > 1
);

const onClubSwitch = async (event) => {
  const id = Number(event?.target?.value);
  if (!id) return;
  if (!clubManagerManagedClubs.value.some((c) => c.id === id)) return;
  const full = (agencyStore.userAgencies || []).find((a) => Number(a?.id) === id);
  if (full) {
    agencyStore.setCurrentAgency(full);
  } else {
    try {
      const { data } = await api.get(`/agencies/${id}`);
      if (data?.id) agencyStore.setCurrentAgency(data);
    } catch {
      return;
    }
  }
  await router.replace({
    path: route.path,
    query: { ...route.query, club: String(id) },
    hash: route.hash
  });
  await fetchStats();
};

const submitCreateClub = async () => {
  const name = String(createClubName.value || '').trim();
  if (!name) return;
  createClubSubmitting.value = true;
  try {
    const payload = { name };
    const slug = String(createClubSlug.value || '').trim();
    if (slug) payload.slug = slug;
    const r = await api.post('/summit-stats/clubs', payload);
    createClubSuccess.value = true;
    createClubError.value = '';
    const club = r.data;
    if (club) agencyStore.setCurrentAgency(club);
    await loadClubManagerContext();
    await agencyStore.fetchUserAgencies();
    const adminSlug = club?.parent_slug || club?.slug || club?.portal_url || route.params.organizationSlug;
    if (adminSlug) {
      const dest =
        String(authStore.user?.role || '').toLowerCase() === 'club_manager'
          ? `/${adminSlug}/club_manager_dashboard`
          : `/${adminSlug}/admin`;
      await router.replace(dest);
    }
    setTimeout(() => {
      createClubSuccess.value = false;
      createClubName.value = '';
      createClubSlug.value = '';
    }, 1500);
  } catch (e) {
    createClubError.value = e?.response?.data?.error?.message || 'Failed to create club';
  } finally {
    createClubSubmitting.value = false;
  }
};
const agencyData = ref(null);
const orgOverviewSummary = ref({ counts: { school: 0, program: 0, learning: 0, other: 0 } });

const selectedOrgId = computed({
  get() {
    return currentAgency.value?.id || null;
  },
  set(id) {
    const targetId = Number(id);
    if (!targetId || !Array.isArray(myAgencies.value)) return;
    const next = myAgencies.value.find((a) => Number(a?.id) === targetId);
    if (next && currentAgency.value?.id !== next.id) {
      agencyStore.setCurrentAgency(next);
    }
  }
});

const fetchStats = async () => {
  // In preview mode, use mock data
  if (props.previewMode) {
    if (props.previewStats) {
      // Backward compatible: old previews may provide totalUsers instead of activeUsers
      const next = { ...props.previewStats };
      if (next.activeUsers === undefined && next.totalUsers !== undefined) {
        next.activeUsers = next.totalUsers;
      }
      stats.value = next;
    }
    myAgencies.value = currentAgency.value
      ? [{ id: currentAgency.value.id, name: currentAgency.value.name, is_active: currentAgency.value.is_active !== false }]
      : [{ id: 1, name: 'Preview Agency', is_active: true }];
    loading.value = false;
    return;
  }
  
  try {
    loading.value = true;
    
    // Get all agencies the user has access to
    const agenciesRes = await api.get('/agencies');
    const rawAgencies = Array.isArray(agenciesRes.data) ? agenciesRes.data : [];
    const primaryAgencies = rawAgencies.filter((a) => String(a?.organization_type || 'agency').toLowerCase() === 'agency');
    // If current selection isn't an agency (rare), keep it available as a secondary option.
    const cur = currentAgency.value;
    const needsCurrent =
      cur?.id && !primaryAgencies.some((a) => Number(a?.id) === Number(cur.id));
    myAgencies.value = needsCurrent ? [...primaryAgencies, cur] : primaryAgencies;
    
    // Fetch training focuses for each agency the admin has access to
    // Also include platform templates (agency_id IS NULL)
    const trainingFocusPromises = [
      api.get('/training-focuses', { params: { agencyId: null } }).catch(() => ({ data: [] })) // Platform templates
    ];
    
    // Add promises for each agency
    rawAgencies.forEach(agency => {
      trainingFocusPromises.push(
        api.get('/training-focuses', { params: { agencyId: agency.id } }).catch(() => ({ data: [] }))
      );
    });
    
    // Ensure branding is fetched from store
    if (!brandingStore.platformBranding) {
      await brandingStore.fetchPlatformBranding();
    }
    
    // Club (affiliation) context: skip modules/training-focuses (may require canViewTraining which club managers lack)
    const isClub = String(currentAgency.value?.organization_type || currentAgency.value?.organizationType || '').toLowerCase() === 'affiliation';
    const modulesPromise = isClub ? Promise.resolve({ data: [] }) : api.get('/modules').catch(() => ({ data: [] }));
    const trainingPromises = isClub ? [] : trainingFocusPromises;

    const [modulesRes, usersRes, ...trainingFocusResults] = await Promise.all([
      modulesPromise,
      api.get('/users').catch(err => {
        // If users fetch fails (e.g., for supervisors without assignments), return empty array
        console.warn('Could not fetch users:', err.message);
        return { data: [] };
      }),
      ...trainingPromises
    ]);
    
    // Fetch current agency data if available
    if (currentAgency.value) {
      try {
        const agencyRes = await api.get(`/agencies/${currentAgency.value.id}`);
        agencyData.value = agencyRes.data;
      } catch (err) {
        console.error('Failed to fetch agency data:', err);
      }
    }
    
    // Filter modules for user's agencies
    const agencyModules = (modulesRes?.data || []).filter(m =>
      !m.is_shared && rawAgencies.some(a => a.id === m.agency_id)
    );
    
    // Count all unique training focuses across platform templates and all user's agencies
    const allTrainingFocuses = trainingFocusResults.flatMap(res => res.data || []);
    const uniqueTrainingFocusIds = new Set(allTrainingFocuses.map(tf => tf.id));
    const totalTrainingFocuses = uniqueTrainingFocusIds.size;
    
    stats.value = {
      myAgencies: rawAgencies.length,
      agencyModules: agencyModules.length,
      trainingFocusTemplates: totalTrainingFocuses,
      activeUsers: (usersRes.data || []).filter((u) => String(u?.status || '').toUpperCase() === 'ACTIVE_EMPLOYEE').length
    };

    // For SSTC club context: fetch active/dormant member counts
    if (isClub && currentAgency.value?.id) {
      try {
        const msRes = await api.get(`/summit-stats/clubs/${currentAgency.value.id}/member-stats`);
        clubMemberStats.value = { active: msRes.data.active ?? null, dormant: msRes.data.dormant ?? null };
      } catch {
        // non-critical — leave nulls so badge just hides
      }
    }
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load statistics';
  } finally {
    loading.value = false;
  }
};

const fetchOrgOverviewSummary = async () => {
  const agencyId = currentAgency.value?.id ? Number(currentAgency.value.id) : null;
  const orgType = String(currentAgency.value?.organization_type || 'agency').toLowerCase();
  if (!agencyId || orgType !== 'agency') {
    orgOverviewSummary.value = { counts: { school: 0, program: 0, learning: 0, other: 0 } };
    return;
  }
  const url = '/dashboard/org-overview-summary';
  const params = { agencyId };
  const cached = getCached(url, params);
  if (cached) {
    orgOverviewSummary.value = cached;
    return;
  }
  try {
    const res = await api.get(url, { params: { agencyId } });
    const data = res.data || { counts: { school: 0, program: 0, learning: 0, other: 0 } };
    orgOverviewSummary.value = data;
    setCached(url, params, data);
  } catch {
    orgOverviewSummary.value = { counts: { school: 0, program: 0, learning: 0, other: 0 } };
  }
};

// Program Overview includes learning orgs (but not schools).
const hasAffiliatedPrograms = computed(() =>
  Number(orgOverviewSummary.value?.counts?.program || 0) + Number(orgOverviewSummary.value?.counts?.learning || 0) > 0
);

const getActionIcon = (actionKey) => {
  // Use centralized branding logic (agency override -> icon_id fallback -> platform fallback).
  return brandingStore.getAdminQuickActionIconUrl(actionKey, agencyData.value || null);
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
    const flags = parseFeatureFlags(agencyData.value?.feature_flags || currentAgency.value?.feature_flags);
    return isTruthyFlag(flags?.noteAidEnabled) || isTruthyFlag(flags?.clinicalNoteGeneratorEnabled);
  })()
);
const bookClubEnabledForAgency = computed(() =>
  (() => {
    const flags = parseFeatureFlags(agencyData.value?.feature_flags || currentAgency.value?.feature_flags);
    return isTruthyFlag(flags?.bookClubEnabled);
  })()
);

const orgSlug = computed(() => route.params?.organizationSlug || '');
const orgTo = (path) => (orgSlug.value ? `/${orgSlug.value}${path}` : path);

const canSeeSchoolPortalsQuickAction = computed(() => {
  const ag = agencyData.value || currentAgency.value || {};
  const pb = brandingStore.platformBranding || {};
  return canAccessSchoolPortalsSurfaces({
    userRole: authStore.user?.role,
    agencyFeatureFlags: ag.feature_flags ?? ag.featureFlags,
    platformAvailableAgencyFeaturesJson: pb.available_agency_features_json ?? pb.availableAgencyFeaturesJson,
    tenantAvailableAgencyFeaturesOverrideJson:
      ag.tenant_available_agency_features_json ?? ag.tenantAvailableAgencyFeaturesJson
  });
});

const canSeeSkillBuildersSchoolProgramQuickAction = computed(() => {
  const ag = agencyData.value || currentAgency.value || {};
  const pb = brandingStore.platformBranding || {};
  return canAccessSkillBuildersSchoolProgramSurfaces({
    userRole: authStore.user?.role,
    agencyFeatureFlags: ag.feature_flags ?? ag.featureFlags,
    platformAvailableAgencyFeaturesJson: pb.available_agency_features_json ?? pb.availableAgencyFeaturesJson,
    tenantAvailableAgencyFeaturesOverrideJson:
      ag.tenant_available_agency_features_json ?? ag.tenantAvailableAgencyFeaturesJson
  });
});

const AFFILIATION_QUICK_ACTION_IDS = ['team_lead_dashboard', 'schedule', 'start_new_season', 'manage_users', 'settings'];
const AFFILIATION_HIDDEN_IDS = new Set([
  'school_portals', 'program_overview', 'import_school_directory', 'skill_builders_availability',
  'provider_availability_dashboard', 'provider_scheduling_settings', 'audit_center', 'external_calendar_audit',
  'manage_clients', 'progress_dashboard', 'tools_aids', 'clinical_note_generator', 'manage_modules',
  'manage_documents', 'intake_links', 'unassigned_documents', 'management_team', 'provider_directory',
  'communications', 'chats', 'notifications', 'payroll', 'billing', 'billing_policy_rules'
]);

const quickActions = computed(() => {
  const slug = orgSlug.value;
  const prefix = slug ? `/${slug}` : '';
  const base = [
  {
    id: 'team_lead_dashboard',
    title: 'Team Lead Dashboards',
    description: 'View what team leads and captains see',
    to: '/operations-dashboard',
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
    to: '/schedule',
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
    to: '/admin/settings?category=workflow&item=challenge-management',
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
    to: '/admin?openAddSeason=1',
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
    to: '/admin/marketing-campaigns',
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
    to: '/admin/agency-progress',
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
    to: '/admin/clients',
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
    to: '/admin/tools-aids',
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
    iconKey: 'school_overview',
    category: 'Management',
    roles: ['admin', 'support', 'super_admin', 'staff'],
    capabilities: ['canAccessPlatform']
  },
  {
    id: 'school_portals',
    title: 'School Portals',
    description: 'School overview, all portals, and add-school when enabled for this tenant',
    to: '/admin/school-portals-hub',
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
    to: '/admin/schools/overview?orgType=program',
    emoji: '🧩',
    iconKey: 'program_overview',
    category: 'Management',
    roles: ['admin', 'support', 'super_admin', 'staff'],
    allowSubCoordinator: true,
    capabilities: ['canAccessPlatform']
  },
  {
    id: 'manage_modules',
    title: 'Manage Modules',
    description: 'Create and edit training modules',
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
    description: 'Upload templates and assign documents',
    to: '/admin/documents',
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
    to: '/admin/digital-forms',
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
    to: '/admin/company-events',
    emoji: '📅',
    iconKey: 'dashboard_communications',
    category: 'Club',
    roles: ['admin', 'super_admin', 'provider_plus', 'club_manager'],
    capabilities: ['canAccessPlatform']
  },
  {
    id: 'surveys',
    title: 'Surveys',
    description: 'Build and push staff/client surveys and review outcomes',
    to: '/admin/surveys',
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
    to: '/admin/book-club',
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
    to: '/admin/unassigned-documents',
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
    to: '/admin/management-team',
    emoji: '👥',
    iconKey: 'manage_users',
    category: 'Management',
    roles: ['admin', 'support', 'super_admin', 'staff'],
    capabilities: ['canAccessPlatform']
  },
  {
    id: 'manage_users',
    title: 'Manage Users',
    description: 'View and manage user accounts',
    to: '/admin/users',
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
    to: '/admin/providers',
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
    to: '/admin/settings',
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
    to: '/admin/audit-center',
    emoji: '🛡️',
    iconKey: 'audit_center',
    category: 'System',
    roles: ['admin', 'super_admin'],
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
    title: 'Messages',
    description: 'Open platform messages',
    to: '/admin/communications/messages',
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
    title: 'Provider Management',
    description: 'View availability by school slots, office, and virtual',
    to: '/admin/provider-availability',
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
    to: '/admin/settings?category=workflow&item=provider-scheduling',
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
    to: '/admin/skill-builders-availability',
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

  let filtered = base.filter((a) => {
    if (isSummitStatsContext.value && isSscAdminRoute.value) {
      if (AFFILIATION_HIDDEN_IDS.has(String(a?.id))) return false;
      if (String(a?.id) === 'manage_users') return true;
      if (String(a?.id) === 'season_management') return true;
      if (String(a?.id) === 'company_events') return true;
      if (String(a?.id) === 'surveys') return true;
      if (String(a?.id) === 'settings') return true;
      return ['team_lead_dashboard', 'manage_users', 'season_management', 'company_events', 'surveys', 'settings'].includes(String(a?.id));
    }
    if (String(a?.id) === 'school_portals') return canSeeSchoolPortalsQuickAction.value;
    if (String(a?.id) === 'skill_builders_availability') return canSeeSkillBuildersSchoolProgramQuickAction.value;
    if (String(a?.id) === 'program_overview') return hasAffiliatedPrograms.value;
    if (String(a?.id) === 'book_club') return bookClubEnabledForAgency.value && !isSummitStatsContext.value;
    // Admin/support/supervisor always see Tools & Aids when no agency selected; otherwise use agency feature flag
    const showToolsOrNoteAid = clinicalNoteGeneratorEnabledForAgency.value || !currentAgency.value;
    if (String(a?.id) === 'tools_aids' || String(a?.id) === 'clinical_note_generator') return showToolsOrNoteAid;
    return true;
  });
  return filtered.map((a) => {
    const toPath = prefix && a.to ? `${prefix}${a.to}` : a.to;
    const title = (isSummitStatsContext.value && isSscAdminRoute.value && String(a?.id) === 'manage_users') ? 'Members' : a.title;
    return { ...a, to: toPath || a.to, title };
  });
});

const defaultQuickActionIds = computed(() => {
  if (isSummitStatsContext.value && isSscAdminRoute.value) {
    return ['team_lead_dashboard', 'manage_users', 'season_management', 'company_events', 'surveys', 'settings'];
  }
  return [
    'progress_dashboard',
    'manage_clients',
    'management_team',
    ...((clinicalNoteGeneratorEnabledForAgency.value || !currentAgency.value) ? ['tools_aids', 'clinical_note_generator'] : []),
    ...(canSeeSchoolPortalsQuickAction.value ? ['school_portals', 'school_marketing_campaigns'] : []),
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

const resolveQuickActionIcon = (action) => {
  if (!action?.iconKey) return null;
  return getActionIcon(action.iconKey);
};

// Watch for agency changes and refetch agency data
watch(currentAgency, async (newAgency) => {
  if (newAgency) {
    try {
      const agencyRes = await api.get(`/agencies/${newAgency.id}`);
      agencyData.value = agencyRes.data;
    } catch (err) {
      console.error('Failed to fetch agency data:', err);
    }
    await fetchOrgOverviewSummary();
  }
});

watch(
  () => clubContext.value,
  async () => {
    if (!isSscAdminRoute.value) return;
    if (String(authStore.user?.role || '').toLowerCase() !== 'club_manager') return;
    await syncClubManagerAffiliationContext();
  },
  { deep: true }
);

watch(
  () => route.query.club,
  async () => {
    if (!isSscAdminRoute.value) return;
    if (String(authStore.user?.role || '').toLowerCase() !== 'club_manager') return;
    await syncClubManagerAffiliationContext();
  }
);

onMounted(async () => {
  // Ensure branding is loaded before fetching stats
  if (!brandingStore.platformBranding) {
    await brandingStore.fetchPlatformBranding();
  }
  // Ensure currentAgency is set/hydrated for non-super-admins; Quick Action icon overrides depend on it.
  await agencyStore.fetchUserAgencies();
  // Summit Stats club managers only (sstc/sstc): load context for create-club flow
  if (isSscAdminRoute.value) {
    await loadClubManagerContext();
    await syncClubManagerAffiliationContext();
  }
  if (String(route.query?.openAddSeason || '') === '1' && isSummitStatsContext.value) {
    showAddSeasonModal.value = true;
    const q = { ...route.query };
    delete q.openAddSeason;
    router.replace({ query: q });
  }
  await fetchStats();
  await fetchOrgOverviewSummary();
});

const loadMyOpenTickets = async () => {
  if (props.previewMode) return;
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

/* Compact header for club managers — less vertical height */
.dashboard-header--compact {
  margin-bottom: 16px;
  padding-bottom: 14px;
}

.header-content {
  display: flex;
  align-items: center;
  gap: 24px;
}

.dashboard-logo {
  flex-shrink: 0;
}

.header-title-block {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: nowrap;
}

.dashboard-header h1 {
  margin: 0;
  color: var(--primary);
  white-space: nowrap;
  font-size: 1.5rem;
}

.dashboard-header--compact h1 {
  font-size: 1.25rem;
}

.dashboard-header--compact .badge {
  font-size: 0.7rem;
  padding: 2px 8px;
}

.header-right {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}


.club-switcher {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.club-switcher-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted, #64748b);
  margin: 0;
}

.club-switcher-select {
  min-width: 200px;
  max-width: min(320px, 85vw);
  padding: 8px 12px;
  border-radius: 8px;
  border: 2px solid var(--border, #e2e8f0);
  background: var(--bg, #fff);
  font-size: 0.9375rem;
  color: var(--text, #0f172a);
}

.agency-badge {
  padding: 8px 16px;
  background: var(--bg-alt);
  border-radius: 8px;
  border: 2px solid var(--primary);
}

.agency-name {
  font-weight: 600;
  color: var(--primary);
}

.dashboard-content {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.dashboard-content--club {
  gap: 20px;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
}

.dashboard-grid--club {
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.stat-card {
  background: white;
  padding: 32px;
  border-radius: 12px;
  box-shadow: var(--shadow);
  text-align: center;
  border: 1px solid var(--border);
  transition: all 0.2s;
  display: block;
  text-decoration: none;
  color: inherit;
  cursor: pointer;
}

.dashboard-grid--club .stat-card {
  padding: 16px 14px;
  border-radius: 10px;
}

.stat-card.stat-card-button {
  width: 100%;
  font: inherit;
  appearance: none;
  -webkit-appearance: none;
}

.stat-card.stat-card-compact {
  padding: 16px 20px;
}

.stat-card.stat-card-compact .stat-value {
  font-size: 18px;
  font-weight: 600;
}

.stat-card.stat-card-compact h3 {
  margin-bottom: 6px;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

.create-club-section {
  margin-bottom: 24px;
}
.create-club-card {
  padding: 24px;
  background: var(--bg, #fff);
  border: 1px solid var(--border-color, #ddd);
  border-radius: 8px;
}
.create-club-card h3 {
  margin: 0 0 8px 0;
  font-size: 1.2em;
}
.create-club-card p {
  margin: 0 0 16px 0;
  color: var(--text-muted, #666);
}
.create-club-verify {
  background: #fff8e1;
  border-color: #ffc107;
}
.create-club-verify .hint {
  margin: 0 0 12px 0;
  font-size: 0.9em;
  color: #795548;
}
.create-club-verify .verification-link-box {
  margin: 12px 0;
  padding: 12px;
  background: #f5f5f5;
  border-radius: 6px;
  font-size: 0.85em;
  word-break: break-all;
}
.create-club-verify .verification-link-box a {
  color: var(--primary, #0066cc);
}
.create-club-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: stretch;
}
.create-club-slug-row {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.create-club-slug-hint {
  font-size: 0.8rem;
  color: var(--color-muted, #666);
}
.create-club-input {
  flex: 1;
  min-width: 180px;
  padding: 10px 12px;
  border: 1px solid var(--border-color, #ddd);
  border-radius: 6px;
  font-size: 1em;
}
.create-club-btn {
  padding: 10px 20px;
  background: var(--primary, #0066cc);
  color: #fff;
  border: none;
  border-radius: 6px;
  font-weight: 500;
  cursor: pointer;
}
.create-club-btn:hover:not(:disabled) {
  opacity: 0.9;
}
.create-club-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
.create-club-success {
  color: #2e7d32 !important;
  font-weight: 500;
}
.create-club-error {
  margin-bottom: 12px;
  padding: 10px;
  background: #ffebee;
  color: #c62828;
  border-radius: 6px;
  font-size: 0.9em;
}

.stat-card h3 {
  color: var(--text-secondary);
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 12px;
  font-weight: 600;
}

.dashboard-grid--club .stat-card h3 {
  margin-bottom: 6px;
  font-size: 11px;
}

.stat-value {
  font-size: 40px;
  font-weight: 700;
  color: var(--primary);
  margin: 0;
}

.dashboard-grid--club .stat-value {
  font-size: 28px;
  line-height: 1.05;
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
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
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
  gap: 12px;
  overflow: hidden;
}

.agency-card:hover {
  border-color: var(--primary);
  box-shadow: var(--shadow);
}

.agency-card.active {
  border-color: var(--accent);
  background: white;
}

.agency-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
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

.preview-disabled {
  pointer-events: none;
  cursor: default;
  opacity: 0.8;
}

.stat-card.preview-disabled:hover {
  transform: none;
  box-shadow: var(--shadow);
}

.action-card.preview-disabled:hover {
  transform: none;
  box-shadow: var(--shadow);
  border-color: var(--border);
}
</style>
