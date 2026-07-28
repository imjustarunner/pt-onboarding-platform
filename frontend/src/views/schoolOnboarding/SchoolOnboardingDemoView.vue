<template>
  <div class="so-demo-portal">
    <header class="so-demo-banner">
      <div>
        <strong>{{ schoolName }} demo</strong>
        <span class="muted">
          {{
            standalone
              ? 'School portal preview — browse freely. No login required.'
              : 'Identical school portal UI — browse freely. Nothing here is live.'
          }}
        </span>
      </div>
      <div v-if="!standalone" class="so-demo-actions">
        <button type="button" class="btn ghost" @click="backToOnboarding">← Back to onboarding</button>
        <button type="button" class="btn primary" @click="continueReview">Continue to review →</button>
      </div>
    </header>

    <div v-if="loading" class="so-demo-msg muted">Opening Hogwarts school portal demo…</div>
    <div v-else-if="error" class="so-demo-msg">
      <p class="error">{{ error }}</p>
      <button type="button" class="btn primary" @click="boot">Try again</button>
      <button type="button" class="btn ghost" @click="continueReview">Skip demo →</button>
    </div>
    <SchoolPortalView
      v-else-if="ready"
      :preview-mode="true"
      :public-demo-token="demoApiToken"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useBrandingStore } from '../../store/branding';
import { useOrganizationStore } from '../../store/organization';
import {
  activateSchoolOnboardingDemo,
  deactivateSchoolOnboardingDemo,
  SCHOOL_ONBOARDING_PUBLIC_DEMO_TOKEN
} from '../../utils/schoolOnboardingDemoContext.js';
import SchoolPortalView from '../school/SchoolPortalView.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const organizationStore = useOrganizationStore();
const brandingStore = useBrandingStore();

const token = String(route.params.token || '').trim();
const standalone = computed(() => route.meta?.schoolOnboardingStandaloneDemo === true);
const demoApiToken = computed(() => (standalone.value ? SCHOOL_ONBOARDING_PUBLIC_DEMO_TOKEN : token));
const loading = ref(true);
const ready = ref(false);
const error = ref('');
const schoolMeta = ref(null);
let previousAuthUser = null;
let injectedDemoAuth = false;

const schoolName = computed(() => schoolMeta.value?.official_name || schoolMeta.value?.name || 'Hogwarts');

function demoPortalThemeSlug(school) {
  // Prefer affiliated tenant branding slug (ITSCO) so standalone matches onboarding shell.
  const theme = school?.portal_theme;
  if (theme?.brandingAgencyId && theme?.agencyName) {
    // ITSCO portal_url is the branding source of truth for this demo.
    return 'itsco';
  }
  return String(school?.portal_url || school?.slug || 'hogwarts').trim().toLowerCase();
}

function applyDemoPortalTheme(school) {
  const slug = demoPortalThemeSlug(school);
  brandingStore.setActiveRouteSlug(slug);
  const theme = school?.portal_theme;
  if (theme?.colorPalette) {
    brandingStore.setPortalThemeData({
      brandingAgencyId: theme.brandingAgencyId || null,
      portalOrganizationId: theme.portalOrganizationId || school?.id || null,
      agencyName: theme.agencyName || school?.official_name || school?.name || 'Hogwarts',
      colorPalette: theme.colorPalette || {},
      themeSettings: {
        ...(theme.themeSettings || {}),
        useAffiliatedAgencyBranding: true
      },
      terminologySettings: theme.terminologySettings || {},
      logoUrl: theme.logoUrl || school?.logo_url || school?.logo_path || null,
      iconUrl: theme.iconUrl || null
    });
    return;
  }
  return brandingStore.fetchAgencyTheme(slug);
}

function injectDemoSchoolAdmin(school) {
  const demoUser = school?.demo_user || {
    id: 1015,
    firstName: 'Minerva',
    lastName: 'McGonagall',
    email: 'minerva.mcgonagall@hogwarts.edu',
    role: 'school_staff',
    isSchoolAdmin: true
  };
  previousAuthUser = authStore.user ? { ...authStore.user } : null;
  authStore.user = {
    id: demoUser.id,
    first_name: demoUser.firstName || demoUser.first_name || 'Minerva',
    last_name: demoUser.lastName || demoUser.last_name || 'McGonagall',
    firstName: demoUser.firstName || demoUser.first_name || 'Minerva',
    lastName: demoUser.lastName || demoUser.last_name || 'McGonagall',
    email: demoUser.email || 'minerva.mcgonagall@hogwarts.edu',
    role: demoUser.role || 'school_staff',
    isSchoolAdmin: true,
    username: demoUser.email || 'minerva.mcgonagall@hogwarts.edu',
    __schoolOnboardingDemoUser: true
  };
  injectedDemoAuth = true;
}

function restoreAuthUser() {
  if (!injectedDemoAuth) return;
  authStore.user = previousAuthUser;
  previousAuthUser = null;
  injectedDemoAuth = false;
}

function backToOnboarding() {
  router.push(`/school-onboarding/${token}/explore_demo`);
}

function continueReview() {
  completeExploreDemo('review_submit');
}

async function completeExploreDemo(nextStep = 'review_submit') {
  try {
    await api.put(
      `/public/school-onboarding/${token}/steps/explore_demo`,
      { payload: { completed: true }, markComplete: true },
      { skipAuthRedirect: true }
    );
  } catch {
    // Best-effort — still let them continue if save fails.
  }
  router.push(`/school-onboarding/${token}/${nextStep}`);
}

async function boot() {
  if (!standalone.value && !token) {
    error.value = 'Missing onboarding invite token.';
    loading.value = false;
    ready.value = false;
    return;
  }
  loading.value = true;
  error.value = '';
  ready.value = false;
  try {
    const schoolMetaUrl = standalone.value
      ? '/public/school-onboarding/demo/school'
      : `/public/school-onboarding/${token}/demo/school`;
    const res = await api.get(schoolMetaUrl, {
      skipAuthRedirect: true
    });
    const school = res.data?.school;
    if (!school?.id) throw new Error('Demo school unavailable');
    schoolMeta.value = school;

    activateSchoolOnboardingDemo({
      token: demoApiToken.value,
      schoolId: school.id,
      standalone: standalone.value
    });
    const theme = school.portal_theme || {};
    organizationStore.setCurrentOrganization({
      id: school.id,
      name: school.name,
      official_name: school.official_name || school.name,
      slug: school.slug || 'hogwarts',
      portal_url: school.portal_url || school.slug || 'hogwarts',
      organization_type: 'school',
      is_active: true,
      logo_url: theme.logoUrl || school.logo_url || null,
      logo_path: school.logo_path || null,
      color_palette: theme.colorPalette || school.color_palette || null,
      theme_settings: {
        ...(theme.themeSettings || school.theme_settings || {}),
        useAffiliatedAgencyBranding: true
      },
      terminology_settings: theme.terminologySettings || school.terminology_settings || null
    });
    injectDemoSchoolAdmin(school);
    await applyDemoPortalTheme(school);
    ready.value = true;
  } catch (e) {
    restoreAuthUser();
    deactivateSchoolOnboardingDemo();
    error.value = e?.response?.data?.error?.message || e?.message || 'Unable to open demo';
    ready.value = false;
  } finally {
    loading.value = false;
  }
}

onMounted(boot);

onUnmounted(() => {
  restoreAuthUser();
  deactivateSchoolOnboardingDemo();
  brandingStore.setActiveRouteSlug('');
  brandingStore.clearPortalTheme();
});
</script>

<style scoped>
.so-demo-portal {
  min-height: 100vh;
  background: #f8fafc;
}
.so-demo-banner {
  position: sticky;
  top: 0;
  z-index: 60;
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
  flex-wrap: wrap;
  padding: 0.7rem 1rem;
  background: #0f172a;
  color: #fff;
}
.so-demo-banner .muted {
  display: block;
  color: #cbd5e1;
  font-size: 0.85rem;
  margin-top: 0.15rem;
}
.so-demo-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.btn {
  border: none;
  border-radius: 8px;
  padding: 0.45rem 0.85rem;
  font: inherit;
  cursor: pointer;
}
.btn.primary { background: #3b82f6; color: #fff; }
.btn.ghost { background: rgba(255, 255, 255, 0.12); color: #fff; }
.so-demo-msg .btn.ghost {
  background: #e2e8f0;
  color: #0f172a;
  margin-left: 0.5rem;
}
.so-demo-msg {
  max-width: 560px;
  margin: 2rem auto;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 1.5rem;
}
.error { color: #b91c1c; }
.muted { color: #64748b; }
</style>
