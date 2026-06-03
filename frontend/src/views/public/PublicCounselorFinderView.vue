<template>
  <div class="counselor-finder">

    <!-- Top nav -->
    <header class="finder-nav">
      <div class="finder-nav-inner">
        <button class="nav-back" type="button" @click="goBack">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
        </button>
        <BrandingLogo v-if="brandingStore.displayLogoUrl" class="nav-logo" />
        <span class="nav-title">{{ agencyName || 'Find a Counselor' }}</span>
      </div>
    </header>

    <!-- Hero -->
    <section class="finder-hero">
      <div class="finder-hero-inner">
        <h1>Find the right therapist.<br /><em>Book with confidence.</em></h1>
        <p class="hero-sub">Browse our trusted providers and find the time that works best for you.</p>
        <div class="hero-trust">
          <span><svg class="trust-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg> All providers are licensed &amp; verified</span>
          <span><svg class="trust-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg> HIPAA-compliant &amp; confidential</span>
          <span><svg class="trust-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" /></svg> Compassionate care that puts you first</span>
          <span><svg class="trust-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg> 4.9/5 Client satisfaction rating</span>
        </div>
      </div>
    </section>

    <!-- Filters bar -->
    <section class="filters-bar">
      <div class="filters-bar-inner">
        <label class="filter-field">
          <span>Search providers</span>
          <input v-model="filters.search" type="text" placeholder="Name, specialty, issue…" @input="debouncedLoad" />
        </label>
        <label class="filter-field">
          <span>Specialty</span>
          <select v-model="filters.specialty" @change="load">
            <option value="">All Specialties</option>
            <option v-for="s in SPECIALTY_OPTIONS" :key="s" :value="s">{{ s }}</option>
          </select>
        </label>
        <label class="filter-field">
          <span>Appointment Type</span>
          <select v-model="filters.programType" @change="load">
            <option value="IN_PERSON">In-Person</option>
            <option value="VIRTUAL">Virtual</option>
          </select>
        </label>
        <label class="filter-field">
          <span>Day / Time</span>
          <input v-model="filters.weekStart" type="date" @change="load" />
        </label>
        <div class="availability-tabs">
          <button v-for="tab in AVAIL_TABS" :key="tab.id" class="avail-tab" :class="{ active: activeTab === tab.id }" type="button" @click="setTab(tab.id)">{{ tab.label }}</button>
        </div>
        <button v-if="hasActiveFilters" class="clear-filters" type="button" @click="clearFilters">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
          Clear filters
        </button>
      </div>
    </section>

    <!-- Stats bar -->
    <div class="stats-bar">
      <div class="stats-bar-inner">
        <div class="stat-item">
          <svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" /></svg>
          <strong>{{ stats.totalCount }}</strong> <span>Providers available</span>
        </div>
        <div class="stat-item">
          <svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
          <strong>{{ stats.availableTodayCount }}</strong> <span>Available today</span>
        </div>
        <div class="stat-item">
          <svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0H3" /></svg>
          <strong>{{ stats.virtualOnlyCount }}</strong> <span>Virtual only</span>
        </div>
        <div v-if="stats.fastestAvailableAt" class="stat-item stat-item--highlight">
          <svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span>Fastest opening</span> <strong>{{ formatNextAvailable(stats.fastestAvailableAt) }}</strong>
        </div>
        <div class="stats-sort">
          <label>Sort by
            <select v-model="sortBy" @change="applySort">
              <option value="soonest">Soonest Availability</option>
              <option value="name">Name A–Z</option>
            </select>
          </label>
        </div>
      </div>
    </div>

    <!-- Main layout -->
    <div class="finder-layout">
      <!-- Provider list -->
      <main class="provider-list">
        <div v-if="loading" class="list-state">
          <div class="spinner" />
          <span>Loading providers…</span>
        </div>
        <div v-else-if="error" class="list-state list-state--error">{{ error }}</div>
        <div v-else-if="displayedProviders.length === 0" class="list-state">No providers match your current filters.</div>

        <div v-else>
          <p v-if="introBlurb" class="intro-blurb">{{ introBlurb }}</p>
          <PublicProviderCard
            v-for="(provider, idx) in displayedProviders"
            :key="provider.providerId"
            :provider="provider"
            :is-best-match="idx === 0"
            :is-fastest="idx === 1"
            @book="openWizard"
            @view-profile="openProfile"
          />
        </div>
      </main>

      <!-- Right sidebar -->
      <aside class="finder-sidebar">
        <div class="sidebar-help">
          <div class="sidebar-help-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" /></svg>
          </div>
          <h4>Need help choosing?</h4>
          <p>We're here to help you find the right therapist for your needs.</p>
          <a :href="`tel:${contactPhone}`" v-if="contactPhone" class="sidebar-contact-link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" /></svg>
            Call us
          </a>
        </div>

        <div class="sidebar-legend">
          <h4>Availability legend</h4>
          <div class="legend-row"><span class="legend-dot legend-dot--inperson" /><span>In-Person</span></div>
          <div class="legend-row"><span class="legend-dot legend-dot--virtual" /><span>Virtual</span></div>
          <div class="legend-row"><span class="legend-dot legend-dot--both" /><span>Both</span></div>
          <div class="legend-row"><span class="legend-dot legend-dot--limited" /><span>Limited availability</span></div>
        </div>

        <div class="sidebar-why">
          <h4>Why choose us?</h4>
          <ul>
            <li>Vetted, licensed providers with proven experience</li>
            <li>Personalized support for every client</li>
            <li>Flexible scheduling that works for your life</li>
            <li>Easy online booking in just a few clicks</li>
          </ul>
        </div>

        <div class="sidebar-security">
          <svg class="sec-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>
          <div>
            <strong>Your information is safe with us.</strong>
            <p>We protect your data with secure, encrypted technology and never share it with third parties.</p>
          </div>
        </div>
      </aside>
    </div>

    <!-- Provider profile modal -->
    <div v-if="profileModal.open" class="modal-overlay" @click.self="closeProfile">
      <div class="profile-modal">
        <button class="modal-close" type="button" @click="closeProfile">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
        <img v-if="profileModal.provider?.profilePhotoUrl" :src="profileModal.provider.profilePhotoUrl" :alt="profileModal.provider.displayName" class="profile-modal-avatar" />
        <div v-else class="profile-modal-avatar-fallback">{{ initials(profileModal.provider?.displayName) }}</div>
        <h3>{{ profileModal.provider?.displayName }}</h3>
        <p v-if="profileModal.provider?.title" class="profile-modal-title">{{ profileModal.provider.title }}</p>
        <p v-if="profileModal.provider?.profile?.publicBlurb" class="profile-modal-bio">{{ profileModal.provider.profile.publicBlurb }}</p>
        <div v-if="profileModal.provider?.specialties?.length" class="profile-modal-section">
          <strong>Specialties</strong>
          <div class="modal-tags">
            <span v-for="s in profileModal.provider.specialties" :key="s" class="tag">{{ s }}</span>
          </div>
        </div>
        <div v-if="profileModal.provider?.modalities?.length" class="profile-modal-section">
          <strong>Modalities</strong>
          <div class="modal-tags">
            <span v-for="m in profileModal.provider.modalities" :key="m" class="tag">{{ m }}</span>
          </div>
        </div>
        <div v-if="profileModal.provider?.ageGroups?.length" class="profile-modal-section">
          <strong>Ages served</strong>
          <div class="modal-tags">
            <span v-for="a in profileModal.provider.ageGroups" :key="a" class="tag">{{ a }}</span>
          </div>
        </div>
        <div class="profile-modal-section">
          <strong>Rate</strong>
          <span>{{ profileModal.provider?.profile?.selfPayRateLabel || 'Contact office for rate' }}</span>
        </div>
        <div v-if="profileModal.provider?.profile?.insurancesAccepted?.length" class="profile-modal-section">
          <strong>Insurance accepted</strong>
          <span>{{ profileModal.provider.profile.insurancesAccepted.join(', ') }}</span>
        </div>
        <button class="btn-book-modal" type="button" :disabled="!(profileModal.provider?.availability?.slots?.length)" @click="bookFromProfile">Book Now</button>
      </div>
    </div>

    <!-- Booking wizard -->
    <PublicBookingWizard
      v-if="wizardState.open"
      :provider="wizardState.provider"
      :slot="wizardState.slot"
      :agency-slug="slug"
      service-type="counseling"
      @close="wizardState.open = false"
      @submitted="wizardState.open = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import PublicProviderCard from '../../components/publicServices/PublicProviderCard.vue';
import PublicBookingWizard from '../../components/publicServices/PublicBookingWizard.vue';
import BrandingLogo from '../../components/BrandingLogo.vue';
import { useBrandingStore } from '../../store/branding.js';

const route = useRoute();
const router = useRouter();
const brandingStore = useBrandingStore();

const slug = computed(() =>
  String(route.params.organizationSlug || route.params.agencySlug || '').trim()
);

const AVAIL_TABS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'two_weeks', label: 'Next 2 Weeks' }
];

const SPECIALTY_OPTIONS = [
  'Anxiety', 'Depression', 'Trauma/PTSD', 'ADHD', 'Grief & Loss', 'Family Conflict',
  'Relationship Issues', 'LGBTQ+', "Women's Issues", 'Child & Adolescent', 'Life Transitions',
  'Stress', 'Self-Esteem', 'Anger Management', 'Substance Use'
];

const contactPhone = ref('');
const agencyName = ref('');
const introBlurb = ref('');
const loading = ref(false);
const error = ref('');
const providers = ref([]);
const stats = ref({ totalCount: 0, availableTodayCount: 0, virtualOnlyCount: 0, fastestAvailableAt: null });
const activeTab = ref('week');
const sortBy = ref('soonest');

const filters = ref({
  search: '',
  specialty: '',
  programType: 'IN_PERSON',
  weekStart: new Date().toISOString().slice(0, 10)
});

const wizardState = ref({ open: false, provider: null, slot: null });
const profileModal = ref({ open: false, provider: null });

const hasActiveFilters = computed(() =>
  filters.value.search || filters.value.specialty
);

const displayedProviders = computed(() => {
  const list = [...providers.value];
  if (sortBy.value === 'name') {
    list.sort((a, b) => String(a.displayName || '').localeCompare(String(b.displayName || '')));
  }
  return list;
});

let debounceTimer = null;
function debouncedLoad() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(load, 300);
}

function setTab(tabId) {
  activeTab.value = tabId;
  const today = new Date();
  if (tabId === 'today') {
    filters.value.weekStart = today.toISOString().slice(0, 10);
  } else if (tabId === 'week') {
    filters.value.weekStart = today.toISOString().slice(0, 10);
  } else if (tabId === 'two_weeks') {
    const d = new Date(today);
    d.setDate(d.getDate() + 7);
    filters.value.weekStart = d.toISOString().slice(0, 10);
  }
  load();
}

function clearFilters() {
  filters.value.search = '';
  filters.value.specialty = '';
  load();
}

function applySort() { /* computed handles it */ }

async function load() {
  if (!slug.value) return;
  loading.value = true;
  error.value = '';
  try {
    const params = new URLSearchParams({
      programType: filters.value.programType,
      weekStart: filters.value.weekStart
    });
    if (filters.value.search) params.set('search', filters.value.search);
    if (filters.value.specialty) params.set('specialty', filters.value.specialty);

    const res = await api.get(
      `/public/agency-services/${encodeURIComponent(slug.value)}/counselors?${params}`,
      { skipAuthRedirect: true }
    );
    providers.value = Array.isArray(res.data?.providers) ? res.data.providers : [];
    stats.value = res.data?.stats || { totalCount: 0, availableTodayCount: 0, virtualOnlyCount: 0, fastestAvailableAt: null };
    introBlurb.value = res.data?.introBlurb || '';
    agencyName.value = res.data?.agencyName || res.data?.agencySlug || '';
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load providers.';
  } finally {
    loading.value = false;
  }
}

function openWizard(provider, slot) {
  wizardState.value = { open: true, provider, slot };
}

function openProfile(provider) {
  profileModal.value = { open: true, provider };
}

function closeProfile() {
  profileModal.value = { open: false, provider: null };
}

function bookFromProfile() {
  const p = profileModal.value.provider;
  const firstSlot = p?.availability?.slots?.[0];
  if (!firstSlot) return;
  closeProfile();
  openWizard(p, firstSlot);
}

function formatNextAvailable(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `Today at ${timeStr}`;
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow at ${timeStr}`;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ` at ${timeStr}`;
}

function initials(name) {
  return (name || '').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

function goBack() {
  if (slug.value) {
    router.push(`/${slug.value}/services`);
  } else {
    router.back();
  }
}

onMounted(load);
</script>

<style scoped>
.counselor-finder {
  /* ─── tenant-adaptive palette ───────────────────────────────────
     Falls back to the sage-green therapy theme when no agency palette
     is present. When fetchAgencyTheme runs (router guard), it writes
     --agency-primary-color etc. onto :root which these vars inherit. */
  --cf-p:      var(--agency-primary-color, #3d6b5f);
  --cf-p-dark: color-mix(in srgb, var(--cf-p) 75%, black);
  --cf-p-mid:  color-mix(in srgb, var(--cf-p) 70%, white);
  --cf-p-tint: color-mix(in srgb, var(--cf-p) 14%, white);
  --cf-p-bg:   color-mix(in srgb, var(--cf-p) 7%, white);
  min-height: 100vh;
  background: var(--cf-p-bg);
  font-family: var(--agency-font-family, system-ui, -apple-system, sans-serif);
}

/* Nav */
.finder-nav {
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  padding: 0.75rem 1.5rem;
  position: sticky;
  top: 0;
  z-index: 100;
}
.finder-nav-inner {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.nav-back {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  border: none;
  background: none;
  cursor: pointer;
  color: #6b7280;
  padding: 0.35rem;
  border-radius: 0.375rem;
}
.nav-back svg { width: 1.25rem; height: 1.25rem; }
.nav-back:hover { background: #f3f4f6; }
.nav-title { font-weight: 600; font-size: 0.95rem; color: #111827; }
.nav-logo { height: 2rem; width: auto; object-fit: contain; }

/* Hero */
.finder-hero {
  background: linear-gradient(135deg, var(--cf-p) 0%, var(--cf-p-mid) 60%, color-mix(in srgb, var(--cf-p) 55%, white) 100%);
  color: #fff;
  padding: 3rem 1.5rem;
}
.finder-hero-inner { max-width: 800px; margin: 0 auto; }
.finder-hero h1 {
  font-size: clamp(1.75rem, 4vw, 2.75rem);
  font-weight: 800;
  line-height: 1.2;
  margin: 0 0 0.75rem;
}
.finder-hero h1 em { color: #b2d8ce; font-style: normal; }
.hero-sub { font-size: 1rem; color: rgba(255,255,255,0.85); margin: 0 0 1.5rem; }
.hero-trust {
  display: flex;
  flex-wrap: wrap;
  gap: 1.25rem;
  font-size: 0.8125rem;
  color: rgba(255,255,255,0.9);
}
.hero-trust span { display: flex; align-items: center; gap: 0.4rem; }
.trust-i { width: 1rem; height: 1rem; flex-shrink: 0; }

/* Filters */
.filters-bar {
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  padding: 0.875rem 1.5rem;
  position: sticky;
  top: 48px;
  z-index: 90;
}
.filters-bar-inner {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.75rem;
}
.filter-field { display: flex; flex-direction: column; gap: 0.2rem; }
.filter-field span { font-size: 0.7rem; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.04em; }
.filter-field input, .filter-field select {
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  padding: 0.45rem 0.75rem;
  font-size: 0.875rem;
  background: #fff;
  outline: none;
  min-width: 140px;
  transition: border-color 0.15s;
}
.filter-field input:focus, .filter-field select:focus { border-color: var(--cf-p-mid); }

.availability-tabs {
  display: flex;
  gap: 0;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  overflow: hidden;
  align-self: flex-end;
}
.avail-tab {
  padding: 0.45rem 0.875rem;
  border: none;
  background: #fff;
  cursor: pointer;
  font-size: 0.8125rem;
  font-weight: 500;
  color: #6b7280;
  transition: all 0.12s;
}
.avail-tab + .avail-tab { border-left: 1px solid #e5e7eb; }
.avail-tab.active { background: var(--cf-p); color: #fff; }

.clear-filters {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 0.8125rem;
  color: #9ca3af;
  align-self: flex-end;
  padding: 0.45rem 0;
}
.clear-filters svg { width: 0.875rem; height: 0.875rem; }
.clear-filters:hover { color: #374151; }

/* Stats bar */
.stats-bar {
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  padding: 0.5rem 1.5rem;
}
.stats-bar-inner {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 1.5rem;
}
.stat-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8125rem;
  color: #374151;
}
.stat-item strong { font-weight: 700; color: #111827; }
.stat-item span { color: #6b7280; }
.stat-item--highlight strong { color: var(--cf-p); }
.stat-icon { width: 1rem; height: 1rem; color: #9ca3af; }
.stats-sort { margin-left: auto; }
.stats-sort label { font-size: 0.8125rem; color: #6b7280; display: flex; align-items: center; gap: 0.5rem; }
.stats-sort select {
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
  padding: 0.3rem 0.6rem;
  font-size: 0.8125rem;
  background: #fff;
}

/* Layout */
.finder-layout {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.5rem;
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: 1.5rem;
  align-items: start;
}
@media (max-width: 900px) { .finder-layout { grid-template-columns: 1fr; } .finder-sidebar { display: none; } }

/* Provider list */
.provider-list { display: flex; flex-direction: column; gap: 1rem; }
.list-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 4rem;
  color: #6b7280;
  font-size: 0.95rem;
}
.list-state--error { color: #dc2626; }
.intro-blurb {
  font-size: 0.9rem;
  color: #6b7280;
  background: var(--cf-p-bg);
  border-left: 3px solid var(--cf-p);
  padding: 0.75rem 1rem;
  border-radius: 0 0.5rem 0.5rem 0;
  margin-bottom: 0.5rem;
}
.spinner {
  width: 1.25rem; height: 1.25rem;
  border: 2px solid #e5e7eb;
  border-top-color: var(--cf-p);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Sidebar */
.finder-sidebar { display: flex; flex-direction: column; gap: 1rem; position: sticky; top: 110px; }
.sidebar-help, .sidebar-legend, .sidebar-why, .sidebar-security {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 0.875rem;
  padding: 1.125rem;
}
.sidebar-help-icon {
  width: 2.5rem; height: 2.5rem;
  border-radius: 50%;
  background: var(--cf-p-tint);
  color: var(--cf-p);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 0.75rem;
}
.sidebar-help-icon svg { width: 1.25rem; height: 1.25rem; }
.sidebar-help h4, .sidebar-legend h4, .sidebar-why h4 {
  font-size: 0.9rem;
  font-weight: 700;
  color: #111827;
  margin: 0 0 0.5rem;
}
.sidebar-help p { font-size: 0.8rem; color: #6b7280; margin: 0 0 0.75rem; }
.sidebar-contact-link {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  color: var(--cf-p);
  text-decoration: none;
  font-weight: 500;
  margin-bottom: 0.35rem;
}
.sidebar-contact-link svg { width: 1rem; height: 1rem; }
.sidebar-contact-link:hover { text-decoration: underline; }
.legend-row { display: flex; align-items: center; gap: 0.5rem; font-size: 0.8125rem; color: #374151; margin-bottom: 0.4rem; }
.legend-dot { width: 10px; height: 10px; border-radius: 50%; }
.legend-dot--inperson { background: #16a34a; }
.legend-dot--virtual { background: #2563eb; }
.legend-dot--both { background: linear-gradient(135deg, #16a34a 50%, #2563eb 50%); }
.legend-dot--limited { background: #f59e0b; }
.sidebar-why ul { margin: 0; padding-left: 1rem; font-size: 0.8125rem; color: #374151; line-height: 1.7; }
.sidebar-security { display: flex; align-items: flex-start; gap: 0.75rem; }
.sec-icon { width: 2rem; height: 2rem; color: var(--cf-p); flex-shrink: 0; margin-top: 2px; }
.sidebar-security strong { font-size: 0.8125rem; color: #111827; }
.sidebar-security p { font-size: 0.75rem; color: #9ca3af; margin: 0.2rem 0 0; line-height: 1.5; }

/* Profile modal */
.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 500;
  padding: 1rem;
}
.profile-modal {
  position: relative;
  background: #fff;
  border-radius: 1rem;
  padding: 2rem;
  max-width: 440px;
  width: 100%;
  max-height: 85vh;
  overflow-y: auto;
  text-align: center;
}
.modal-close {
  position: absolute; top: 1rem; right: 1rem;
  width: 2rem; height: 2rem;
  background: #f3f4f6; border: none; border-radius: 50%;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
}
.modal-close svg { width: 1rem; height: 1rem; }
.profile-modal-avatar {
  width: 5rem; height: 5rem; border-radius: 50%; object-fit: cover; margin-bottom: 0.75rem;
}
.profile-modal-avatar-fallback {
  width: 5rem; height: 5rem; border-radius: 50%;
  background: var(--cf-p-tint); color: var(--cf-p);
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 1.5rem;
  margin: 0 auto 0.75rem;
}
.profile-modal h3 { font-size: 1.25rem; font-weight: 700; margin: 0 0 0.2rem; }
.profile-modal-title { font-size: 0.875rem; color: #6b7280; margin: 0 0 0.75rem; }
.profile-modal-bio { font-size: 0.875rem; color: #374151; line-height: 1.6; margin: 0 0 1rem; text-align: left; }
.profile-modal-section { text-align: left; margin-bottom: 0.75rem; }
.profile-modal-section strong { font-size: 0.8rem; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.04em; display: block; margin-bottom: 0.35rem; }
.profile-modal-section span { font-size: 0.875rem; color: #374151; }
.modal-tags { display: flex; flex-wrap: wrap; gap: 0.3rem; }
.tag { font-size: 0.75rem; background: var(--cf-p-bg); color: var(--cf-p); border-radius: 0.3rem; padding: 2px 7px; }
.btn-book-modal {
  margin-top: 1rem;
  padding: 0.75rem 2rem;
  background: var(--cf-p);
  color: #fff;
  border: none;
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  font-weight: 700;
  cursor: pointer;
  width: 100%;
  transition: background 0.15s;
}
.btn-book-modal:hover:not(:disabled) { background: var(--cf-p-dark); }
.btn-book-modal:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
