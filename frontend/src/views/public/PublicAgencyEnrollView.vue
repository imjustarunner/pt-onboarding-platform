<template>
  <div class="pea-root" :style="rootFontStyle">
    <header v-if="showPublicShell" class="pea-hero">
      <div class="pea-hero-inner">
        <p class="pea-eyebrow">Program enrollment</p>
        <div v-if="headerLogoUrl" class="pea-logo-wrap">
          <img class="pea-logo" :src="headerLogoUrl" :alt="headerLogoAlt" loading="eager" />
        </div>
        <h1 class="pea-title">{{ pageTitle }}</h1>
        <p class="pea-subtitle">
          Choose a program to see individual service enrollments and any open events. This page is for becoming a client — not
          only for group or class sign-ups.
        </p>
      </div>
    </header>

    <div class="pea-cross">
      <RouterLink class="pea-cross-a" :to="eventsPath">Looking for scheduled events only? View the events page</RouterLink>
    </div>

    <div v-if="loading" class="pea-loading">Loading…</div>
    <div v-else-if="error" class="pea-error">{{ error }}</div>
    <div v-else-if="!programs.length" class="pea-empty">
      <p>No program portals are linked to this organization yet.</p>
      <RouterLink class="pea-btn" :to="eventsPath">View upcoming events</RouterLink>
    </div>
    <ul v-else class="pea-list">
      <li v-for="p in programs" :key="`prog-${p.id}`">
        <RouterLink class="pea-card" :to="programEnrollPath(p.slug)">
          <div class="pea-card-body">
            <h2 class="pea-card-title">{{ p.name }}</h2>
            <p class="pea-card-meta">Enrollments and events for this program</p>
          </div>
          <span class="pea-card-cta">Open</span>
        </RouterLink>
      </li>
    </ul>

    <footer v-if="showPublicShell" class="pea-footer">
      <RouterLink v-if="footerHomeSlug" class="pea-footer-link" :to="homePath">Portal home</RouterLink>
      <span v-if="footerHomeSlug" class="pea-footer-dot">·</span>
      <span class="pea-footer-note">Secure enrollment powered by your provider</span>
    </footer>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import api from '../../services/api';
import { useBrandingStore } from '../../store/branding';

const route = useRoute();
const brandingStore = useBrandingStore();

const slug = computed(() =>
  String(route.params.agencySlug || route.params.organizationSlug || '').trim()
);
const isOpenPath = computed(() => Boolean(route.params.agencySlug));

const showPublicShell = computed(() => true);

const loading = ref(false);
const error = ref('');
const programs = ref([]);
const agencyName = ref('');

const pageTitle = computed(() => {
  if (agencyName.value) return `${agencyName.value} — enroll`;
  return 'Enroll in a program';
});

const footerHomeSlug = computed(() => slug.value);
const homePath = computed(() => `/${footerHomeSlug.value}`);

const eventsPath = computed(() => {
  if (isOpenPath.value) return `/open-events/${slug.value}/events`;
  return `/${slug.value}/events`;
});

function programEnrollPath(programSlug) {
  const ps = String(programSlug || '').trim();
  if (!slug.value || !ps) return '/';
  if (isOpenPath.value) return `/open-events/${slug.value}/programs/${ps}/enroll`;
  return `/${slug.value}/programs/${ps}/enroll`;
}

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

async function load() {
  if (!slug.value) return;
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get(`/public/skill-builders/agency/${encodeURIComponent(slug.value)}/enroll/programs`, {
      skipGlobalLoading: true
    });
    programs.value = Array.isArray(res.data?.programs) ? res.data.programs : [];
    agencyName.value = String(res.data?.agencyName || '').trim();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load';
    programs.value = [];
    agencyName.value = '';
  } finally {
    loading.value = false;
  }
}

watch(slug, () => load(), { immediate: true });
</script>

<style scoped>
.pea-root {
  min-height: 100vh;
  background: linear-gradient(180deg, #f8fafc 0%, #fff 40%);
  color: #0f172a;
  padding-bottom: 48px;
}
.pea-hero {
  padding: 28px 20px 20px;
  text-align: center;
  border-bottom: 1px solid #e2e8f0;
  background: #fff;
}
.pea-hero-inner {
  max-width: 720px;
  margin: 0 auto;
}
.pea-eyebrow {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #64748b;
}
.pea-logo-wrap {
  margin: 0 auto 12px;
  max-height: 64px;
}
.pea-logo {
  max-height: 64px;
  width: auto;
  object-fit: contain;
}
.pea-title {
  margin: 0;
  font-size: 1.65rem;
  color: var(--primary, #15803d);
}
.pea-subtitle {
  margin: 12px 0 0;
  font-size: 0.95rem;
  line-height: 1.5;
  color: #64748b;
}
.pea-cross {
  text-align: center;
  padding: 16px 20px 8px;
}
.pea-cross-a {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--primary, #15803d);
  text-decoration: underline;
}
.pea-loading,
.pea-error,
.pea-empty {
  max-width: 640px;
  margin: 24px auto;
  padding: 0 20px;
  text-align: center;
}
.pea-error {
  color: #b91c1c;
}
.pea-list {
  list-style: none;
  margin: 16px auto 0;
  padding: 0 20px;
  max-width: 720px;
}
.pea-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
  padding: 18px 20px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: #fff;
  text-decoration: none;
  color: inherit;
  box-shadow: 0 1px 2px rgb(15 23 42 / 6%);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.pea-card:hover {
  border-color: var(--primary, #15803d);
  box-shadow: 0 4px 14px rgb(15 23 42 / 8%);
}
.pea-card-title {
  margin: 0;
  font-size: 1.15rem;
}
.pea-card-meta {
  margin: 6px 0 0;
  font-size: 0.88rem;
  color: #64748b;
}
.pea-card-cta {
  font-weight: 700;
  font-size: 0.9rem;
  color: var(--primary, #15803d);
  white-space: nowrap;
}
.pea-btn {
  display: inline-block;
  margin-top: 12px;
  padding: 10px 18px;
  border-radius: 8px;
  background: var(--primary, #15803d);
  color: #fff;
  font-weight: 600;
  text-decoration: none;
}
.pea-footer {
  margin-top: 40px;
  padding: 20px;
  text-align: center;
  font-size: 0.85rem;
  color: #64748b;
  border-top: 1px solid #e2e8f0;
}
.pea-footer-link {
  color: var(--primary, #15803d);
  font-weight: 600;
  text-decoration: none;
}
.pea-footer-dot {
  margin: 0 8px;
}
</style>
