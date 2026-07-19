<template>
  <!-- Programs get a dedicated dashboard; schools/learning use school portal;
       life_coach/consultant use practitioner shells; agencies use standard dashboard.
       Nested affiliations (Book Club / clubs) never fall through to full My Dashboard. -->
  <LifeCoachPractitionerDashboardView v-if="isLifeCoach" />
  <ConsultantPractitionerDashboardView v-else-if="isConsultant" />
  <ProgramPortalView v-else-if="isProgramPortal" :preview-mode="isSuperadminPreview" />
  <SchoolPortalView v-else-if="isPortalOrg" :preview-mode="isSuperadminPreview" />
  <div v-else-if="isNestedAffiliationRedirect" class="org-dash-redirect muted">
    Redirecting…
  </div>
  <DashboardView
    v-else
    :preview-mode="isSuperadminPreview"
    :preview-status="previewStatus"
    :preview-data="previewData"
  />
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useOrganizationStore } from '../store/organization';
import { useAgencyStore } from '../store/agency';
import { useSuperadminPlatformPreview } from '../composables/useSuperadminPlatformPreview';
import { createMockDashboardData } from '../utils/previewUtils';
import { isConsultantOrgType, isLifeCoachOrgType } from '../utils/practitionerVertical.js';
import { isBookClubAgency } from '../utils/bookClubAgency.js';
import {
  getOrganizationType,
  getParentAgencyFromOrg,
  getOrgSlug,
  isNestedOrganizationType,
  isTenantOrganizationType,
  resolveNestedOrgNavigation
} from '../utils/organizationTypes.js';
import DashboardView from './DashboardView.vue';
import SchoolPortalView from './school/SchoolPortalView.vue';
import ProgramPortalView from './program/ProgramPortalView.vue';
import LifeCoachPractitionerDashboardView from './practitioner/LifeCoachPractitionerDashboardView.vue';
import ConsultantPractitionerDashboardView from './practitioner/ConsultantPractitionerDashboardView.vue';

const route = useRoute();
const router = useRouter();
const organizationStore = useOrganizationStore();
const agencyStore = useAgencyStore();
const { isSuperadminPreview } = useSuperadminPlatformPreview({ route });
const redirectingNested = ref(false);

const previewStatus = computed(() => {
  if (!isSuperadminPreview.value) return null;
  const raw = String(route.query?.previewStatus || 'ACTIVE_EMPLOYEE').trim().toUpperCase();
  const allowed = new Set(['PREHIRE_OPEN', 'PREHIRE_REVIEW', 'ONBOARDING', 'ACTIVE_EMPLOYEE']);
  return allowed.has(raw) ? raw : 'ACTIVE_EMPLOYEE';
});

const previewData = computed(() => {
  if (!isSuperadminPreview.value || !previewStatus.value) return null;
  return createMockDashboardData(previewStatus.value);
});

const organizationType = computed(() => {
  return organizationStore.organizationContext?.organizationType
    || organizationStore.currentOrganization?.organization_type
    || organizationStore.currentOrganization?.organizationType
    || 'agency';
});

const currentOrgRow = computed(() => {
  return organizationStore.currentOrganization
    || organizationStore.organizationContext
    || null;
});

const isLifeCoach = computed(() => isLifeCoachOrgType(organizationType.value));
const isConsultant = computed(() => isConsultantOrgType(organizationType.value));

const isPortalOrg = computed(() => {
  const t = String(organizationType.value || '').toLowerCase();
  return t === 'school' || t === 'program' || t === 'learning';
});

const isProgramPortal = computed(() => {
  return String(organizationType.value || '').toLowerCase() === 'program';
});

const isNestedAffiliationRedirect = computed(() => {
  if (redirectingNested.value) return true;
  const org = currentOrgRow.value;
  if (!org) return false;
  if (isBookClubAgency(org)) return true;
  const t = getOrganizationType(org);
  // school/program/learning have portal shells above; clinical/affiliation must not use DashboardView.
  return isNestedOrganizationType(org) && (t === 'affiliation' || t === 'clubwebapp' || t === 'clinical');
});

const memberships = () => ([
  ...(Array.isArray(agencyStore.userAgencies) ? agencyStore.userAgencies : []),
  ...(Array.isArray(agencyStore.agencies) ? agencyStore.agencies : [])
]);

const redirectNestedAwayFromFullDashboard = async () => {
  const org = currentOrgRow.value;
  if (!org || isLifeCoach.value || isConsultant.value || isPortalOrg.value || isProgramPortal.value) {
    return;
  }
  if (!isNestedOrganizationType(org) && !isBookClubAgency(org)) return;

  redirectingNested.value = true;
  const list = memberships();
  const nav = resolveNestedOrgNavigation(org, list);

  if (nav.setCurrentAgencyToParent && nav.parent && isTenantOrganizationType(nav.parent)) {
    agencyStore.setCurrentAgency(nav.parent);
  } else if (isBookClubAgency(org) || getOrganizationType(org) === 'clinical') {
    const parent = getParentAgencyFromOrg(org, list);
    if (parent) agencyStore.setCurrentAgency(parent);
  }

  // Book Club / clinical: leave full dashboard for the resolved portal path.
  // SSTC affiliations: my_club_dashboard (summit), never personal DashboardView.
  const path = nav.path
    || (isBookClubAgency(org)
      ? `/${getOrgSlug(nav.parent) || getOrgSlug(org)}/bookclub`
      : null);

  if (path && String(route.path || '') !== path) {
    await router.replace(path);
    return;
  }

  // Fallback: parent tenant personal dashboard
  const parent = nav.parent || getParentAgencyFromOrg(org, list);
  const parentSlug = getOrgSlug(parent);
  if (parentSlug) {
    if (parent) agencyStore.setCurrentAgency(parent);
    await router.replace(`/${parentSlug}/dashboard`);
  }
};

const ensureOrgLoaded = async () => {
  const slug = route.params.organizationSlug;
  if (typeof slug === 'string' && slug) {
    if (organizationStore.organizationContext?.slug !== slug) {
      await organizationStore.fetchBySlug(slug);
    }
  }
  await redirectNestedAwayFromFullDashboard();
};

watch(() => route.params.organizationSlug, async () => {
  redirectingNested.value = false;
  await ensureOrgLoaded();
}, { immediate: true });

onMounted(async () => {
  await ensureOrgLoaded();
});
</script>

<style scoped>
.org-dash-redirect {
  padding: 24px;
  text-align: center;
}
</style>
