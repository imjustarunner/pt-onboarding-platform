<template>
  <div class="prac-finder" :data-service="serviceType">
    <header class="finder-nav">
      <div class="finder-nav-inner">
        <button class="nav-back" type="button" @click="goBack">←</button>
        <BrandingLogo v-if="brandingStore.displayLogoUrl" class="nav-logo" />
        <span class="nav-title">{{ agencyName || pageTitle }}</span>
      </div>
    </header>

    <section class="finder-hero">
      <div class="finder-hero-inner">
        <h1>{{ heroTitle }}</h1>
        <p class="hero-sub">{{ introBlurb || heroSub }}</p>
      </div>
    </section>

    <section class="filters-bar">
      <div class="filters-bar-inner">
        <label class="filter-field">
          <span>Search</span>
          <input v-model="filters.search" type="text" :placeholder="searchPlaceholder" @input="debouncedLoad" >
        </label>
        <label class="filter-field">
          <span>Session type</span>
          <select v-model="filters.programType" @change="load">
            <option value="VIRTUAL">Virtual</option>
            <option value="IN_PERSON">In-Person</option>
          </select>
        </label>
        <label class="filter-field">
          <span>Week starting</span>
          <input v-model="filters.weekStart" type="date" @change="load" >
        </label>
      </div>
    </section>

    <div v-if="loading" class="state">Loading providers…</div>
    <div v-else-if="error" class="state error">{{ error }}</div>
    <div v-else-if="!providers.length" class="state">
      No available times right now. Check back soon, or contact the practice directly.
    </div>

    <main v-else class="providers">
      <PublicProviderCard
        v-for="p in providers"
        :key="p.id"
        :provider="p"
        @book="openWizard"
      />
    </main>

    <PublicBookingWizard
      v-if="wizardState.open"
      :provider="wizardState.provider"
      :slot="wizardState.slot"
      :agency-slug="slug"
      :service-type="serviceType"
      @close="wizardState.open = false"
      @submitted="wizardState.open = false"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import PublicProviderCard from '../../components/publicServices/PublicProviderCard.vue';
import PublicBookingWizard from '../../components/publicServices/PublicBookingWizard.vue';
import BrandingLogo from '../../components/BrandingLogo.vue';
import { useBrandingStore } from '../../store/branding.js';

const props = defineProps({
  /** coaching | consulting — also readable from route meta */
  forcedServiceType: { type: String, default: '' }
});

const route = useRoute();
const router = useRouter();
const brandingStore = useBrandingStore();

const slug = computed(() =>
  String(route.params.organizationSlug || route.params.agencySlug || '').trim()
);

const serviceType = computed(() => {
  const fromProp = String(props.forcedServiceType || '').trim().toLowerCase();
  if (fromProp === 'coaching' || fromProp === 'consulting') return fromProp;
  const fromMeta = String(route.meta?.serviceType || '').trim().toLowerCase();
  if (fromMeta === 'coaching' || fromMeta === 'consulting') return fromMeta;
  const path = String(route.path || '');
  if (path.includes('find-consultant')) return 'consulting';
  return 'coaching';
});

const pageTitle = computed(() => (serviceType.value === 'consulting' ? 'Find a Consultant' : 'Find a Coach'));
const heroTitle = computed(() =>
  serviceType.value === 'consulting'
    ? 'Book a free discovery call.'
    : 'Book a free discovery session.'
);
const heroSub = computed(() =>
  serviceType.value === 'consulting'
    ? 'See live availability and request a no-cost virtual discovery meeting before enrolling in consulting services.'
    : 'See live availability and request a no-cost virtual discovery call before enrolling in coaching.'
);
const searchPlaceholder = computed(() =>
  serviceType.value === 'consulting' ? 'Name or keyword…' : 'Goals, focus areas…'
);

const listPath = computed(() =>
  serviceType.value === 'consulting' ? 'consultants' : 'coaches'
);

const agencyName = ref('');
const introBlurb = ref('');
const loading = ref(false);
const error = ref('');
const providers = ref([]);
const filters = ref({
  search: '',
  programType: 'VIRTUAL',
  weekStart: new Date().toISOString().slice(0, 10)
});
const wizardState = ref({ open: false, provider: null, slot: null });

let debounceTimer = null;
function debouncedLoad() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(load, 300);
}

function goBack() {
  if (!slug.value) {
    router.back();
    return;
  }
  router.push(`/${slug.value}/services`);
}

function openWizard(provider, slot) {
  wizardState.value = {
    open: true,
    provider,
    slot: slot || provider?.availability?.slots?.[0] || null
  };
}

async function load() {
  if (!slug.value) return;
  loading.value = true;
  error.value = '';
  try {
    const params = {
      bookingMode: 'NEW_CLIENT',
      programType: filters.value.programType,
      weekStart: filters.value.weekStart,
      search: filters.value.search || undefined
    };
    const res = await api.get(
      `/public/agency-services/${encodeURIComponent(slug.value)}/${listPath.value}`,
      { params, skipAuthRedirect: true }
    );
    agencyName.value = res.data?.agencyName || '';
    introBlurb.value = res.data?.introBlurb || '';
    providers.value = Array.isArray(res.data?.providers) ? res.data.providers : [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load providers.';
    providers.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.prac-finder {
  --hub-p: var(--agency-primary-color, #4338ca);
  min-height: 100vh;
  background: #f8f9fa;
  font-family: var(--agency-font-family, system-ui, sans-serif);
}
.finder-nav {
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  padding: 0.75rem 1.25rem;
}
.finder-nav-inner {
  max-width: 1100px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.nav-back {
  border: none;
  background: transparent;
  font-size: 1.1rem;
  cursor: pointer;
  color: #374151;
}
.nav-logo { height: 32px; width: auto; }
.nav-title { font-weight: 700; color: #111827; }
.finder-hero {
  background: linear-gradient(135deg, color-mix(in srgb, var(--hub-p) 88%, #0f172a), #0f172a);
  color: #fff;
  padding: 2.5rem 1.25rem;
}
.finder-hero-inner { max-width: 1100px; margin: 0 auto; }
.finder-hero h1 { margin: 0 0 0.5rem; font-size: clamp(1.6rem, 3vw, 2.2rem); }
.hero-sub { margin: 0; opacity: 0.9; max-width: 40rem; }
.filters-bar {
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  padding: 1rem 1.25rem;
}
.filters-bar-inner {
  max-width: 1100px;
  margin: 0 auto;
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem;
}
.filter-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: #6b7280;
  font-weight: 600;
}
.filter-field input,
.filter-field select {
  min-width: 160px;
  padding: 0.45rem 0.6rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 0.9rem;
}
.state {
  max-width: 1100px;
  margin: 2rem auto;
  padding: 0 1.25rem;
  color: #6b7280;
}
.state.error { color: #b91c1c; }
.providers {
  max-width: 1100px;
  margin: 1.5rem auto 3rem;
  padding: 0 1.25rem;
  display: grid;
  gap: 1rem;
}
.prac-finder[data-service='coaching'] {
  --hub-p: var(--agency-primary-color, #1a3a2a);
}
.prac-finder[data-service='consulting'] {
  --hub-p: var(--agency-primary-color, #7c3aed);
}
</style>
