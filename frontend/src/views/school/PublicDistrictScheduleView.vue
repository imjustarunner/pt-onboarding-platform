<template>
  <div class="pds-page" :style="themeVars">
    <header class="pds-header">
      <div class="pds-brand">
        <img v-if="headerLogo" :src="headerLogo" alt="" class="pds-brand-logo" />
        <div>
          <div class="pds-brand-kicker">{{ agencyName }}</div>
          <div class="pds-brand-title">District schedule</div>
        </div>
      </div>
    </header>

    <section class="pds-hero">
      <h1>{{ pageTitle }}</h1>
      <p v-if="districtName">{{ districtName }} — schools, providers, and on-site days</p>
      <p v-else>Select a district to view provider schedules across all schools.</p>
    </section>

    <div v-if="loadError" class="pds-banner pds-banner-error">{{ loadError }}</div>
    <div v-else-if="loading" class="pds-loading">Loading schedule…</div>

    <div v-else-if="!districtSlug" class="pds-body">
      <div class="pds-district-grid">
        <router-link
          v-for="d in districts"
          :key="d.slug"
          class="pds-district-card"
          :to="districtRoute(d.slug)"
        >
          <strong>{{ d.name }}</strong>
          <span>{{ d.schoolCount }} {{ d.schoolCount === 1 ? 'school' : 'schools' }}</span>
        </router-link>
      </div>
      <p v-if="!districts.length" class="pds-empty">No district schedules are published yet.</p>
    </div>

    <div v-else class="pds-body">
      <div v-if="!schools.length" class="pds-empty">No schools found for this district.</div>
      <article v-for="school in schools" :key="school.id" class="pds-school-card">
        <div class="pds-school-head">
          <img v-if="school.logoUrl" :src="school.logoUrl" alt="" class="pds-school-logo" />
          <div>
            <h2>{{ school.name }}</h2>
            <p v-if="schoolLocation(school)" class="pds-school-meta">{{ schoolLocation(school) }}</p>
          </div>
        </div>

        <div v-if="!school.providers?.length" class="pds-muted">No providers scheduled yet.</div>
        <div v-else class="pds-provider-list">
          <div v-for="provider in school.providers" :key="provider.id" class="pds-provider-row">
            <img
              v-if="provider.photoUrl"
              :src="provider.photoUrl"
              alt=""
              class="pds-provider-photo"
            />
            <div v-else class="pds-provider-photo pds-provider-photo--fallback">
              {{ initials(provider.displayName) }}
            </div>
            <div class="pds-provider-main">
              <strong>{{ provider.displayName }}</strong>
              <div class="pds-day-chips">
                <span
                  v-for="day in provider.days"
                  :key="day"
                  class="pds-day-chip"
                >{{ dayShort(day) }}</span>
              </div>
            </div>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { resolvePortalSlug } from '../../utils/orgScopedPath';
import { useBrandingStore } from '../../store/branding';
import schoolLogoGreen from '../../assets/schoolReferral/school-logo-green.png';

const route = useRoute();
const brandingStore = useBrandingStore();

const agencySlug = computed(() =>
  resolvePortalSlug(route.params, brandingStore.portalHostPortalUrl)
);
const districtSlug = computed(() => String(route.params.districtSlug || '').trim().toLowerCase());

const loading = ref(true);
const loadError = ref('');
const agency = ref(null);
const district = ref(null);
const districts = ref([]);
const schools = ref([]);

const agencyName = computed(() => agency.value?.name || 'School schedule');
const districtName = computed(() => district.value?.name || '');
const pageTitle = computed(() => districtName.value || 'Browse districts');
const isItsco = computed(() =>
  agencySlug.value === 'itsco' || String(agency.value?.slug || '').toLowerCase() === 'itsco'
);

const branding = computed(() => agency.value?.branding || {});
const palette = computed(() => branding.value?.colorPalette || {});

const themeVars = computed(() => {
  const primary = palette.value.primary || '#1f6b4a';
  const secondary = palette.value.secondary || '#0f766e';
  const accent = palette.value.accent || '#14b8a6';
  const bg = palette.value.backgroundColor || '#f7faf8';
  const text = palette.value.textPrimary || '#0f172a';
  return {
    '--pds-primary': primary,
    '--pds-primary-soft': `${primary}18`,
    '--pds-secondary': secondary,
    '--pds-accent': accent,
    '--pds-bg': bg,
    '--pds-text': text,
    '--pds-muted': palette.value.textMuted || '#64748b',
    '--pds-border': palette.value.dividerColor || '#dce8e2'
  };
});

const headerLogo = computed(() => {
  if (isItsco.value) return schoolLogoGreen;
  return branding.value?.logoUrl || branding.value?.agencyLogoUrl || schoolLogoGreen;
});

function districtRoute(slug) {
  if (route.meta?.flatDistrictSchedule) {
    return { name: 'FlatPublicDistrictSchedule', params: { districtSlug: slug } };
  }
  return {
    name: 'PublicDistrictSchedule',
    params: { organizationSlug: agencySlug.value, districtSlug: slug }
  };
}

function schoolLocation(school) {
  return [school.city, school.state].filter(Boolean).join(', ');
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('');
}

function dayShort(day) {
  return String(day || '').slice(0, 3);
}

async function loadDirectory() {
  loading.value = true;
  loadError.value = '';
  try {
    const res = await api.get(`/public/district-schedule/${encodeURIComponent(agencySlug.value)}`, {
      skipAuthRedirect: true,
      skipGlobalLoading: true
    });
    agency.value = res.data?.agency || null;
    districts.value = Array.isArray(res.data?.districts) ? res.data.districts : [];
    district.value = null;
    schools.value = [];
  } catch (e) {
    loadError.value = e?.response?.data?.error?.message || 'Failed to load districts';
  } finally {
    loading.value = false;
  }
}

async function loadSchedule() {
  loading.value = true;
  loadError.value = '';
  try {
    const res = await api.get(
      `/public/district-schedule/${encodeURIComponent(agencySlug.value)}/${encodeURIComponent(districtSlug.value)}`,
      { skipAuthRedirect: true, skipGlobalLoading: true }
    );
    agency.value = res.data?.agency || null;
    district.value = res.data?.district || null;
    schools.value = Array.isArray(res.data?.schools) ? res.data.schools : [];
  } catch (e) {
    loadError.value = e?.response?.data?.error?.message || 'Failed to load district schedule';
    schools.value = [];
  } finally {
    loading.value = false;
  }
}

async function load() {
  if (!agencySlug.value) {
    loadError.value = 'Organization not found';
    loading.value = false;
    return;
  }
  if (districtSlug.value) await loadSchedule();
  else await loadDirectory();
}

onMounted(load);
watch([agencySlug, districtSlug], load);
</script>

<style scoped>
.pds-page {
  min-height: 100vh;
  background: var(--pds-bg);
  color: var(--pds-text);
}
.pds-header {
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--pds-border);
  background: #fff;
}
.pds-brand {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  max-width: 1100px;
  margin: 0 auto;
}
.pds-brand-logo {
  width: 52px;
  height: 52px;
  object-fit: contain;
}
.pds-brand-kicker {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--pds-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.pds-brand-title {
  font-size: 1.05rem;
  font-weight: 700;
}
.pds-hero {
  max-width: 1100px;
  margin: 0 auto;
  padding: 1.5rem 1.25rem 0.75rem;
}
.pds-hero h1 {
  margin: 0 0 0.35rem;
  font-size: clamp(1.5rem, 3vw, 2rem);
}
.pds-hero p {
  margin: 0;
  color: var(--pds-muted);
}
.pds-body {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0.75rem 1.25rem 2rem;
}
.pds-district-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 0.85rem;
}
.pds-district-card {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 1rem;
  border-radius: 14px;
  border: 1px solid var(--pds-border);
  background: #fff;
  color: inherit;
  text-decoration: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.pds-district-card:hover {
  border-color: var(--pds-primary);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
}
.pds-district-card span {
  font-size: 0.85rem;
  color: var(--pds-muted);
}
.pds-school-card {
  margin-bottom: 1rem;
  padding: 1rem 1.1rem;
  border-radius: 16px;
  border: 1px solid var(--pds-border);
  background: #fff;
}
.pds-school-head {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  margin-bottom: 0.85rem;
}
.pds-school-logo {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  object-fit: contain;
  background: #f8fafc;
}
.pds-school-head h2 {
  margin: 0;
  font-size: 1.15rem;
}
.pds-school-meta {
  margin: 0.15rem 0 0;
  font-size: 0.85rem;
  color: var(--pds-muted);
}
.pds-provider-list {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}
.pds-provider-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 0.75rem;
  border-radius: 12px;
  background: var(--pds-primary-soft);
}
.pds-provider-photo {
  width: 44px;
  height: 44px;
  border-radius: 999px;
  object-fit: cover;
  flex-shrink: 0;
}
.pds-provider-photo--fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--pds-primary);
  color: #fff;
  font-size: 0.85rem;
  font-weight: 700;
}
.pds-provider-main strong {
  display: block;
  margin-bottom: 0.25rem;
}
.pds-day-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.pds-day-chip {
  display: inline-flex;
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
  background: #fff;
  border: 1px solid var(--pds-border);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--pds-secondary);
}
.pds-loading,
.pds-empty,
.pds-muted {
  color: var(--pds-muted);
}
.pds-banner {
  max-width: 1100px;
  margin: 0.75rem auto 0;
  padding: 0.75rem 1rem;
  border-radius: 10px;
}
.pds-banner-error {
  background: #fef2f2;
  color: #b91c1c;
  border: 1px solid #fecaca;
}
</style>
