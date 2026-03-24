<template>
  <div class="school-splash" :style="{ background: loginBackground }">
    <!-- Avoid flash: don’t paint splash cards until we know school vs agency portal -->
    <div v-if="splashPhase === 'loading'" class="splash-loading" role="status" aria-live="polite">
      <div class="splash-loading-inner">
        <div class="splash-spinner" aria-hidden="true" />
        <p class="splash-loading-text">Loading portal…</p>
      </div>
    </div>

    <template v-else>
      <div class="splash-container">
        <div class="splash-header">
          <BrandingLogo size="large" class="splash-logo" />
          <h1 v-if="organizationName" class="organization-name">{{ organizationName }}</h1>
          <p v-if="splashPhase === 'portal'" class="splash-tagline">
            Choose an option below. Public sign-up links work without logging in.
          </p>

          <div v-if="splashPhase === 'school' && (schoolName || schoolLogoUrl)" class="school-affiliation">
            <div class="school-affiliation-label">School</div>
            <div class="school-affiliation-row">
              <img v-if="schoolLogoUrl" :src="schoolLogoUrl" class="school-logo" :alt="schoolName || 'School logo'" />
              <div v-if="schoolName" class="school-name">{{ schoolName }}</div>
            </div>
          </div>
        </div>

        <!-- School portal -->
        <div v-if="splashPhase === 'school'" class="action-cards action-cards-3">
          <div class="action-card" @click="openIntakeLink">
            <div class="action-icon">🔗</div>
            <h3>{{ digitalLinkTitle }}</h3>
            <p>{{ digitalLinkSubtitle }}</p>
            <span class="action-note">Opens in a new tab — share with families</span>
          </div>

          <div class="action-card" @click="showLoginModal = true">
            <div class="action-icon">🔐</div>
            <h3>School staff login</h3>
            <p>Access your portal, referrals, and tools</p>
            <span class="action-note">Email can be remembered on this device</span>
          </div>

          <div class="action-card" @click="goReferralUpload">
            <div class="action-icon">📤</div>
            <h3>Upload referral packet</h3>
            <p>Submit a PDF or images (sign in with your school account)</p>
            <span class="action-note">Same as the school upload page</span>
          </div>
        </div>

        <!-- Agency / program / learning (no redirect to login — stops splash “flash”) -->
        <div v-else-if="splashPhase === 'portal'" class="action-cards">
          <div class="action-card" @click="goPublicEvents">
            <div class="action-icon">📅</div>
            <h3>Public programs &amp; events</h3>
            <p>Open registrations and schedules we publish for the community</p>
            <span class="action-note">No login required</span>
          </div>

          <div class="action-card" @click="goStaffLogin">
            <div class="action-icon">🔐</div>
            <h3>Staff sign in</h3>
            <p>Providers, admins, and school staff use the branded login page</p>
            <span class="action-note">Username can be remembered on this device</span>
          </div>
        </div>

        <div v-if="splashPhase === 'school' && intakeLinkError" class="error-message">{{ intakeLinkError }}</div>
      </div>

      <StaffLoginModal
        v-if="showLoginModal && splashPhase === 'school'"
        :organization-slug="organizationSlug"
        :parent-organization-slug="staffLoginParentSlug"
        @close="showLoginModal = false"
        @login-success="handleLoginSuccess"
      />

      <PoweredByFooter />
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useOrganizationStore } from '../../store/organization';
import { useBrandingStore } from '../../store/branding';
import api from '../../services/api';
import { buildPublicIntakeUrl } from '../../utils/publicIntakeUrl';
import BrandingLogo from '../../components/BrandingLogo.vue';
import StaffLoginModal from '../../components/school/StaffLoginModal.vue';
import PoweredByFooter from '../../components/PoweredByFooter.vue';
import { toUploadsUrl } from '../../utils/uploadsUrl';
import { buildOrgLoginPath } from '../../utils/orgLoginPath';

const route = useRoute();
const router = useRouter();
const organizationStore = useOrganizationStore();
const brandingStore = useBrandingStore();

const showLoginModal = ref(false);
const intakeLinkLoading = ref(false);
const intakeLinkError = ref('');
const intakeLink = ref(null);

/** loading | school | portal — portal = agency/program/etc. (no auto-redirect to login) */
const splashPhase = ref('loading');

const organizationSlug = computed(() => route.params.organizationSlug);

/** Parent agency segment for URLs like /itsco/rudy/login (host resolve or API parent_slug). */
const staffLoginParentSlug = computed(() => {
  const org = organizationStore.currentOrganization || organizationStore.organizationContext || null;
  const fromOrg = org?.parent_slug || org?.parentSlug || null;
  if (fromOrg) return String(fromOrg).trim().toLowerCase();
  return String(brandingStore.portalHostPortalUrl || '').trim().toLowerCase() || null;
});

const organizationName = computed(() => {
  return organizationStore.organizationContext?.name || 
         organizationStore.currentOrganization?.name || 
         brandingStore.displayName;
});

const loginBackground = computed(() => brandingStore.loginBackground);

const schoolName = computed(() => {
  const org = organizationStore.currentOrganization || organizationStore.organizationContext || null;
  return org?.name || null;
});

const schoolLogoUrl = computed(() => {
  const org = organizationStore.currentOrganization || organizationStore.organizationContext || null;
  if (!org) return null;
  if (org.logo_path) return toUploadsUrl(org.logo_path);
  if (org.logo_url) return org.logo_url;
  return null;
});

const intakeLinkUrl = computed(() => {
  const key = intakeLink.value?.public_key || '';
  if (!key) return '';
  return buildPublicIntakeUrl(key);
});

const formTypeKey = computed(() => String(intakeLink.value?.form_type || '').toLowerCase());

const digitalLinkTitle = computed(() => {
  if (formTypeKey.value === 'job_application') return 'Job Application';
  if (formTypeKey.value === 'medical_records_request') return 'Medical Records Request';
  if (formTypeKey.value === 'smart_registration') return 'Smart Registration';
  return 'Parent Intake Link';
});

const digitalLinkSubtitle = computed(() => {
  if (formTypeKey.value === 'job_application') return 'Start your job application';
  if (formTypeKey.value === 'medical_records_request') return 'Request your medical records';
  if (formTypeKey.value === 'smart_registration') return 'Register for a program, class, or event';
  return 'Same link as the QR code for this school';
});

const loadIntakeLink = async () => {
  if (!organizationStore.currentOrganization?.id && !organizationStore.organizationContext?.id) return;
  const orgId = organizationStore.currentOrganization?.id || organizationStore.organizationContext?.id;
  try {
    intakeLinkLoading.value = true;
    intakeLinkError.value = '';
    const resp = await api.get(`/public-intake/school/${orgId}`);
    intakeLink.value = resp.data?.link || null;
  } catch (e) {
    intakeLink.value = null;
    intakeLinkError.value = e.response?.data?.error?.message || 'Failed to load intake link';
  } finally {
    intakeLinkLoading.value = false;
  }
};

const openIntakeLink = async () => {
  if (!intakeLinkUrl.value) {
    await loadIntakeLink();
  }
  if (!intakeLinkUrl.value) return;
  window.open(intakeLinkUrl.value, '_blank', 'noopener');
};

const handleLoginSuccess = () => {
  showLoginModal.value = false;
  router.push(`/${organizationSlug.value}/dashboard`);
};

function goPublicEvents() {
  const slug = organizationSlug.value;
  if (!slug) return;
  router.push(`/${slug}/events`);
}

function goStaffLogin() {
  const slug = organizationSlug.value;
  if (!slug) return;
  router.push(
    buildOrgLoginPath(
      slug,
      staffLoginParentSlug.value,
      String(brandingStore.portalHostPortalUrl || '').trim().toLowerCase() || null
    )
  );
}

function goReferralUpload() {
  const slug = organizationSlug.value;
  if (!slug) return;
  router.push(`/${slug}/upload`);
}

onMounted(async () => {
  const slug = organizationSlug.value;
  splashPhase.value = 'loading';

  if (!slug) {
    splashPhase.value = 'portal';
    return;
  }

  const org = await organizationStore.fetchBySlug(slug);
  if (!org) {
    const hostImplied = String(brandingStore.portalHostPortalUrl || '').trim().toLowerCase() || null;
    router.push(buildOrgLoginPath(slug, hostImplied, hostImplied));
    return;
  }

  let orgType = org.organization_type || 'agency';
  try {
    const themeRes = await api.get(`/agencies/portal/${slug}/login-theme`);
    orgType = themeRes.data?.agency?.organizationType || orgType;
  } catch {
    orgType = org.organization_type || 'agency';
  }

  await brandingStore.fetchAgencyTheme(slug);

  const normalized = String(orgType || '').toLowerCase();
  if (normalized === 'school') {
    splashPhase.value = 'school';
    await loadIntakeLink();
  } else {
    splashPhase.value = 'portal';
  }
});
</script>

<style scoped>
.school-splash {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 40px 20px;
}

.splash-container {
  max-width: 1200px;
  width: 100%;
  text-align: center;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.splash-header {
  margin-bottom: 60px;
}

.splash-logo {
  margin-bottom: 24px;
}

.organization-name {
  font-size: 36px;
  font-weight: 700;
  color: var(--header-text-color, #fff);
  margin: 0;
}

.splash-tagline {
  margin: 12px auto 0;
  max-width: 520px;
  font-size: 16px;
  line-height: 1.45;
  color: rgba(255, 255, 255, 0.88);
}

.splash-loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 50vh;
}

.splash-loading-inner {
  text-align: center;
}

.splash-spinner {
  width: 40px;
  height: 40px;
  margin: 0 auto 16px;
  border: 3px solid rgba(255, 255, 255, 0.25);
  border-top-color: rgba(255, 255, 255, 0.95);
  border-radius: 50%;
  animation: splash-spin 0.75s linear infinite;
}

.splash-loading-text {
  margin: 0;
  font-size: 16px;
  color: rgba(255, 255, 255, 0.9);
}

@keyframes splash-spin {
  to {
    transform: rotate(360deg);
  }
}

.action-cards-3 {
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
}

.school-affiliation {
  margin-top: 18px;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.18);
  backdrop-filter: blur(6px);
}

.school-affiliation-label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.85);
}

.school-affiliation-row {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.school-logo {
  height: 28px;
  width: auto;
  max-width: 120px;
  object-fit: contain;
}

.school-name {
  font-size: 16px;
  font-weight: 700;
  color: var(--header-text-color, #fff);
}

.action-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 32px;
  margin-top: 40px;
}

.action-card {
  background: rgba(255, 255, 255, 0.92);
  border-radius: 16px;
  padding: 40px 32px;
  box-shadow: var(--shadow);
  border: 2px solid var(--border);
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.action-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  border-color: var(--primary);
}

.action-icon {
  font-size: 64px;
  margin-bottom: 24px;
  line-height: 1;
}

.action-card h3 {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 12px 0;
}

.action-card p {
  font-size: 16px;
  color: var(--text-secondary);
  margin: 0 0 8px 0;
}

.action-note {
  font-size: 14px;
  color: var(--text-secondary);
  font-style: italic;
  margin-top: 8px;
}

@media (max-width: 768px) {
  .action-cards {
    grid-template-columns: 1fr;
    gap: 24px;
  }
  
  .organization-name {
    font-size: 28px;
  }
  
  .action-card {
    padding: 32px 24px;
  }

  .school-splash {
    padding: 28px 16px;
  }
}
</style>
