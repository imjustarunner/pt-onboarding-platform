<template>
  <div class="peh-root" :style="rootFontStyle">
    <header v-if="showPublicShell" class="peh-hero">
      <div class="peh-hero-inner">
        <p class="peh-eyebrow">Program enrollment</p>
        <div v-if="headerLogoUrl" class="peh-logo-wrap">
          <img class="peh-logo" :src="headerLogoUrl" :alt="headerLogoAlt" loading="eager" />
        </div>
        <h1 class="peh-title">{{ pageTitle }}</h1>
        <p class="peh-subtitle">
          Register for individual services (program enrollment) or open events for this program, when available.
        </p>
      </div>
    </header>

    <div class="peh-cross">
      <RouterLink class="peh-cross-a" :to="eventsOnlyPath">Scheduled events only (no enrollments list)</RouterLink>
    </div>

    <div v-if="loading" class="peh-loading">Loading…</div>
    <div v-else-if="error" class="peh-error">{{ error }}</div>
    <template v-else>
      <section class="peh-section">
        <h2 class="peh-section-title">Program enrollments</h2>
        <p class="peh-section-sub muted">
          Individual services and client onboarding — use the link your provider shared or enroll below when open.
        </p>
        <ul v-if="enrollments.length" class="peh-enroll-list">
          <li v-for="en in enrollments" :key="`en-${en.id}`" class="peh-enroll-card">
            <div class="peh-enroll-main">
              <h3 class="peh-enroll-title">{{ en.title }}</h3>
              <p v-if="en.description" class="peh-enroll-desc">{{ en.description }}</p>
            </div>
            <div class="peh-enroll-actions">
              <a
                v-if="en.registrationPublicKey"
                class="peh-btn"
                :href="registrationUrl(en.registrationPublicKey)"
              >
                Enroll now
              </a>
              <span v-else class="peh-muted">Registration not available</span>
              <RouterLink
                v-if="isGroupEnrollment(en)"
                class="peh-btn peh-btn-secondary"
                :to="guardianJoinPath(en)"
              >
                Guardian join class
              </RouterLink>
            </div>
          </li>
        </ul>
        <p v-else class="peh-empty">No open program enrollments right now.</p>
      </section>

      <section class="peh-section peh-section--events">
        <h2 class="peh-section-title">Program events</h2>
        <p class="peh-section-sub muted">Group or session-based registrations with dates and locations.</p>
        <PublicEventsListing
          page-title=""
          page-subtitle=""
          :events="events"
          :loading="false"
          :error="''"
          :nearest-agency-slug="nearestAgencySlug"
          :use-portal-program-nearest="!useAgencyApiPath"
          :portal-program-portal-slug="portalSlug"
          :portal-program-program-slug="programSlug"
          :footer-home-slug="portalSlug"
          :hide-pel-header="true"
          :show-public-shell="false"
        />
      </section>
    </template>

    <footer v-if="showPublicShell" class="peh-footer">
      <RouterLink v-if="portalSlug" class="peh-footer-link" :to="homePath">Portal home</RouterLink>
      <span v-if="portalSlug" class="peh-footer-dot">·</span>
      <span class="peh-footer-note">Secure enrollment powered by your provider</span>
    </footer>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import api from '../../services/api';
import { useBrandingStore } from '../../store/branding';
import PublicEventsListing from '../../components/public/PublicEventsListing.vue';
import { buildPublicIntakeUrl } from '../../utils/publicIntakeUrl';

const route = useRoute();
const brandingStore = useBrandingStore();

const portalSlug = computed(() =>
  String(route.params.agencySlug || route.params.organizationSlug || '').trim()
);
const programSlug = computed(() => String(route.params.programSlug || '').trim());
const useAgencyApiPath = computed(() => Boolean(route.params.agencySlug));

const loading = ref(false);
const error = ref('');
const enrollments = ref([]);
const events = ref([]);
const agencyName = ref('');
const nearestAgencySlug = ref('');

const showPublicShell = computed(() => true);

const pageTitle = computed(() => {
  if (agencyName.value && programSlug.value) {
    const human = humanizeSlug(programSlug.value);
    return `${agencyName.value} — ${human}`;
  }
  if (programSlug.value) return humanizeSlug(programSlug.value);
  return 'Program';
});

function humanizeSlug(s) {
  return String(s || '')
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const eventsOnlyPath = computed(() => {
  if (useAgencyApiPath.value) {
    return `/open-events/${encodeURIComponent(portalSlug.value)}/programs/${encodeURIComponent(programSlug.value)}/events`;
  }
  return `/${portalSlug.value}/programs/${encodeURIComponent(programSlug.value)}/events`;
});

const homePath = computed(() => `/${portalSlug.value}`);

const headerLogoUrl = computed(() => {
  const t = brandingStore.portalTheme;
  const u = t?.logoUrl || brandingStore.portalAgency?.logoUrl;
  return u ? String(u).trim() : '';
});

const headerLogoAlt = computed(() => {
  const n = brandingStore.portalTheme?.agencyName || brandingStore.portalAgency?.name;
  return n ? `${n} logo` : 'Organization logo';
});

const rootFontStyle = computed(() => {
  const raw =
    brandingStore.portalTheme?.themeSettings?.fontFamily ||
    brandingStore.portalAgency?.themeSettings?.fontFamily;
  if (!raw) return {};
  return { fontFamily: String(raw).trim() };
});

function registrationUrl(publicKey) {
  return buildPublicIntakeUrl(publicKey);
}

function isGroupEnrollment(enrollment) {
  return String(enrollment?.deliveryMode || 'group').toLowerCase() === 'group';
}

function guardianJoinPath(enrollment) {
  const classId = Number(enrollment?.id || 0);
  if (!classId || !portalSlug.value) return `/${portalSlug.value || ''}/login`;
  const redirectPath = `/${portalSlug.value}/learning/classes/${classId}`;
  return `/${portalSlug.value}/login?redirect=${encodeURIComponent(redirectPath)}`;
}

async function load() {
  if (!portalSlug.value || !programSlug.value) return;
  loading.value = true;
  error.value = '';
  try {
    const path = useAgencyApiPath.value
      ? `/public/skill-builders/agency/${encodeURIComponent(portalSlug.value)}/programs/${encodeURIComponent(programSlug.value)}/enroll`
      : `/public/skill-builders/portal/${encodeURIComponent(portalSlug.value)}/programs/${encodeURIComponent(programSlug.value)}/enroll`;
    const res = await api.get(path, { skipGlobalLoading: true });
    enrollments.value = Array.isArray(res.data?.enrollments) ? res.data.enrollments : [];
    events.value = Array.isArray(res.data?.events) ? res.data.events : [];
    agencyName.value = String(res.data?.agencyName || '').trim();
    nearestAgencySlug.value = String(res.data?.agencySlug || '').trim().toLowerCase();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load';
    enrollments.value = [];
    events.value = [];
    agencyName.value = '';
    nearestAgencySlug.value = '';
  } finally {
    loading.value = false;
  }
}

watch([portalSlug, programSlug, useAgencyApiPath], () => load(), { immediate: true });
</script>

<style scoped>
.peh-root {
  min-height: 100vh;
  background: linear-gradient(180deg, #f8fafc 0%, #fff 36%);
  color: #0f172a;
  padding-bottom: 48px;
}
.peh-hero {
  padding: 28px 20px 16px;
  text-align: center;
  border-bottom: 1px solid #e2e8f0;
  background: #fff;
}
.peh-hero-inner {
  max-width: 720px;
  margin: 0 auto;
}
.peh-eyebrow {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #64748b;
}
.peh-logo-wrap {
  margin: 0 auto 12px;
  max-height: 64px;
}
.peh-logo {
  max-height: 64px;
  width: auto;
  object-fit: contain;
}
.peh-title {
  margin: 0;
  font-size: 1.6rem;
  color: var(--primary, #15803d);
}
.peh-subtitle {
  margin: 12px 0 0;
  font-size: 0.95rem;
  line-height: 1.5;
  color: #64748b;
}
.peh-cross {
  text-align: center;
  padding: 14px 20px 4px;
}
.peh-cross-a {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--primary, #15803d);
  text-decoration: underline;
}
.peh-loading,
.peh-error {
  max-width: 640px;
  margin: 24px auto;
  padding: 0 20px;
  text-align: center;
}
.peh-error {
  color: #b91c1c;
}
.peh-section {
  max-width: 920px;
  margin: 24px auto 0;
  padding: 0 20px;
}
.peh-section-title {
  margin: 0 0 6px;
  font-size: 1.25rem;
}
.peh-section-sub {
  margin: 0 0 16px;
  font-size: 0.9rem;
}
.muted {
  color: #64748b;
}
.peh-enroll-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.peh-enroll-card {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  padding: 16px 18px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: #fff;
  box-shadow: 0 1px 2px rgb(15 23 42 / 6%);
}
.peh-enroll-title {
  margin: 0;
  font-size: 1.05rem;
}
.peh-enroll-desc {
  margin: 6px 0 0;
  font-size: 0.88rem;
  color: #475569;
  line-height: 1.45;
}
.peh-btn {
  display: inline-block;
  padding: 10px 16px;
  border-radius: 8px;
  background: var(--primary, #15803d);
  color: #fff !important;
  font-weight: 600;
  font-size: 0.9rem;
  text-decoration: none;
}
.peh-btn.peh-btn-secondary {
  background: #f1f5f9;
  color: #0f172a !important;
  border: 1px solid #cbd5e1;
}
.peh-enroll-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
.peh-muted {
  font-size: 0.85rem;
  color: #94a3b8;
}
.peh-empty {
  margin: 0;
  padding: 12px 0;
  color: #64748b;
  font-size: 0.95rem;
}
.peh-section--events {
  margin-top: 36px;
}
.peh-footer {
  margin-top: 40px;
  padding: 20px;
  text-align: center;
  font-size: 0.85rem;
  color: #64748b;
  border-top: 1px solid #e2e8f0;
}
.peh-footer-link {
  color: var(--primary, #15803d);
  font-weight: 600;
  text-decoration: none;
}
.peh-footer-dot {
  margin: 0 8px;
}
</style>
