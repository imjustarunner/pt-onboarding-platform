<template>
  <div class="team-finder" :class="{ 'team-finder--editing': canEditPage }" :data-service="serviceType">
    <div v-if="canEditPage" class="tf-editor-bar" :class="{ 'tf-editor-bar--active': editing }">
      <template v-if="!editing">
        <span class="tf-editor-hint">Editor</span>
        <button class="tf-editor-btn tf-editor-btn--primary" type="button" @click="startEdit">
          Edit this page
        </button>
        <a v-if="adminSettingsPath" class="tf-editor-link" :href="adminSettingsPath" target="_blank" rel="noopener">
          Full settings
        </a>
      </template>
      <template v-else>
        <span class="tf-editor-hint">Editing finder</span>
        <button class="tf-editor-btn" type="button" :disabled="savingEdit" @click="cancelEdit">Cancel</button>
        <button class="tf-editor-btn tf-editor-btn--primary" type="button" :disabled="savingEdit" @click="saveEdit">
          {{ savingEdit ? 'Saving…' : 'Save' }}
        </button>
        <a v-if="adminSettingsPath" class="tf-editor-link" :href="adminSettingsPath" target="_blank" rel="noopener">
          Full settings
        </a>
        <p v-if="editError" class="tf-editor-error">{{ editError }}</p>
        <p v-if="editOk" class="tf-editor-ok">{{ editOk }}</p>
      </template>
    </div>

    <header class="tf-nav">
      <div class="tf-nav-inner">
        <button class="tf-back" type="button" @click="goBack" aria-label="Back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
        </button>
        <BrandingLogo v-if="brandingStore.displayLogoUrl" class="tf-logo" />
        <span class="tf-nav-title">{{ agencyName || pageTitle }}</span>
        <nav v-if="navLinks.length" class="tf-care-nav" aria-label="Find care">
          <router-link
            v-for="link in navLinks"
            :key="link.to"
            :to="link.to"
            class="tf-care-link"
            :class="{ active: link.serviceType === serviceType }"
          >
            {{ link.label }}
          </router-link>
        </nav>
      </div>
    </header>

    <section v-if="editing || heroImageUrl || displayTitle !== pageTitle || introBlurb" class="tf-hero">
      <div
        class="tf-hero-inner"
        :style="heroImageUrl ? { backgroundImage: `linear-gradient(rgba(15,23,42,0.55), rgba(15,23,42,0.72)), url(${heroImageUrl})` } : null"
      >
        <template v-if="editing">
          <label class="tf-hero-edit">
            <span>Finder display name</span>
            <input v-model="editDraft.displayName" type="text" :placeholder="pageTitle" />
          </label>
          <label class="tf-hero-edit">
            <span>Intro blurb</span>
            <textarea v-model="editDraft.introBlurb" rows="2" placeholder="Short intro shown above results…" />
          </label>
          <label class="tf-hero-edit">
            <span>Hero image URL</span>
            <input v-model="editDraft.heroImageUrl" type="url" placeholder="https://…" />
          </label>
        </template>
        <template v-else>
          <h1 class="tf-hero-title">{{ displayTitle }}</h1>
          <p v-if="introBlurb" class="tf-hero-blurb">{{ introBlurb }}</p>
        </template>
      </div>
    </section>

    <div class="tf-shell">
      <aside class="tf-rail">
        <h2 class="tf-rail-title">Refine results</h2>

        <label class="tf-field">
          <span>Search</span>
          <input
            v-model="filters.search"
            type="search"
            :placeholder="searchPlaceholder"
            @input="debouncedLoad"
          />
        </label>

        <label class="tf-field">
          <span>Session type</span>
          <select v-model="filters.programType" @change="load">
            <option value="VIRTUAL">Virtual</option>
            <option value="IN_PERSON">In-person</option>
          </select>
        </label>

        <label v-if="filterMode === 'counseling'" class="tf-field">
          <span>Specialty / focus</span>
          <select v-model="filters.specialty" @change="load">
            <option value="">All specialties</option>
            <option v-for="s in specialtyOptions" :key="s" :value="s">{{ s }}</option>
          </select>
        </label>

        <label v-if="filterMode === 'counseling'" class="tf-field">
          <span>Ages served</span>
          <select v-model="filters.ageGroup" @change="load">
            <option value="">All ages</option>
            <option v-for="a in ageGroupOptions" :key="a" :value="a">{{ a }}</option>
          </select>
        </label>

        <label v-if="filterMode === 'tutoring'" class="tf-field">
          <span>Subject</span>
          <select v-model="filters.subject" @change="load">
            <option value="">All subjects</option>
            <option v-for="s in subjectOptions" :key="s" :value="s">{{ s }}</option>
          </select>
        </label>

        <label v-if="filterMode === 'tutoring'" class="tf-field">
          <span>Grade level</span>
          <select v-model="filters.gradeLevel" @change="load">
            <option value="">All grades</option>
            <option v-for="g in gradeOptions" :key="g" :value="g">{{ g }}</option>
          </select>
        </label>

        <fieldset class="tf-avail">
          <legend>Availability</legend>
          <button
            v-for="tab in availTabs"
            :key="tab.id"
            type="button"
            class="tf-avail-btn"
            :class="{ active: activeTab === tab.id }"
            @click="setTab(tab.id)"
          >
            {{ tab.label }}
          </button>
        </fieldset>

        <label class="tf-field">
          <span>Week starting</span>
          <input v-model="filters.weekStart" type="date" @change="load" />
        </label>

        <button v-if="hasActiveFilters" class="tf-clear" type="button" @click="clearFilters">
          Clear filters
        </button>

        <button class="tf-match" type="button" disabled title="Coming soon">
          Find my match
        </button>
      </aside>

      <main class="tf-main">
        <div class="tf-results-head">
          <div>
            <h1 class="tf-count">{{ displayedProviders.length }} {{ providerNoun }} found</h1>
            <p class="tf-tz">Times shown in your local timezone ({{ timezoneLabel }}).</p>
          </div>
          <label class="tf-sort">
            Sort by
            <select v-model="sortBy">
              <option value="soonest">First available</option>
              <option value="name">Name A–Z</option>
            </select>
          </label>
        </div>

        <p v-if="!editing && introBlurb && !(heroImageUrl || displayTitle !== pageTitle)" class="tf-intro">{{ introBlurb }}</p>

        <div v-if="loading" class="tf-state">
          <div class="tf-spinner" />
          <span>Loading {{ providerNoun }}…</span>
        </div>
        <div v-else-if="error" class="tf-state tf-state--error">{{ error }}</div>
        <div v-else-if="!displayedProviders.length" class="tf-state">
          No {{ providerNoun }} match your current filters.
        </div>

        <div v-else class="tf-cards">
          <PublicProviderCard
            v-for="(provider, idx) in displayedProviders"
            :key="provider.id || provider.providerId"
            :provider="provider"
            :is-best-match="sortBy === 'soonest' && idx === 0"
            :is-fastest="sortBy === 'soonest' && idx === 1"
            @book="goBook"
            @view-profile="goProfile"
          />
        </div>
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import PublicProviderCard from './PublicProviderCard.vue';
import BrandingLogo from '../BrandingLogo.vue';
import { useBrandingStore } from '../../store/branding.js';
import { useAuthStore } from '../../store/auth';
import {
  listPathForServiceType,
  normalizePublicProviders,
  providerBookPath
} from '../../utils/publicAgencyServices.js';
import { isPractitionerOrgType } from '../../utils/practitionerVertical.js';

const props = defineProps({
  serviceType: { type: String, required: true },
  pageTitle: { type: String, default: 'Find care' },
  providerNoun: { type: String, default: 'providers' },
  searchPlaceholder: { type: String, default: 'Name, keyword…' },
  filterMode: { type: String, default: 'coaching' }, // counseling | tutoring | coaching
  specialtyOptions: { type: Array, default: () => [] },
  ageGroupOptions: { type: Array, default: () => [] },
  subjectOptions: { type: Array, default: () => [] },
  gradeOptions: { type: Array, default: () => [] }
});

const route = useRoute();
const router = useRouter();
const brandingStore = useBrandingStore();
const authStore = useAuthStore();

const slug = computed(() =>
  String(route.params.organizationSlug || route.params.agencySlug || '').trim()
);

const availTabs = [
  { id: 'first', label: 'First available' },
  { id: 'week', label: 'This week' },
  { id: 'two_weeks', label: 'Next 2 weeks' }
];

const agencyId = ref(null);
const agencyName = ref('');
const orgType = ref('agency');
const introBlurb = ref('');
const displayName = ref('');
const heroImageUrl = ref('');
const serviceEnabled = ref(true);
const sortOrder = ref(0);
const loading = ref(false);
const error = ref('');
const providers = ref([]);
const activeTab = ref('first');
const sortBy = ref('soonest');
const canEditPage = ref(false);
const editing = ref(false);
const savingEdit = ref(false);
const editError = ref('');
const editOk = ref('');
const editDraft = ref({ displayName: '', introBlurb: '', heroImageUrl: '' });
const filters = ref({
  search: '',
  specialty: '',
  ageGroup: '',
  subject: '',
  gradeLevel: '',
  programType: 'VIRTUAL',
  weekStart: new Date().toISOString().slice(0, 10)
});

const timezoneLabel = computed(() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local';
  } catch {
    return 'local';
  }
});

const listPath = computed(() => listPathForServiceType(props.serviceType));
const displayTitle = computed(() => displayName.value || props.pageTitle);
const adminSettingsPath = computed(() => (slug.value ? `/${slug.value}/admin/public-services` : ''));

const navLinks = computed(() => {
  const s = slug.value;
  if (!s) return [];
  return [
    { label: 'Counselors', to: `/${s}/find-counselor`, serviceType: 'counseling' },
    { label: 'Tutors', to: `/${s}/find-tutor`, serviceType: 'tutoring' },
    { label: 'Coaches', to: `/${s}/find-coach`, serviceType: 'coaching' }
  ];
});

const hasActiveFilters = computed(() =>
  !!(
    filters.value.search ||
    filters.value.specialty ||
    filters.value.ageGroup ||
    filters.value.subject ||
    filters.value.gradeLevel
  )
);

const displayedProviders = computed(() => {
  const list = [...providers.value];
  if (sortBy.value === 'name') {
    list.sort((a, b) => String(a.displayName || '').localeCompare(String(b.displayName || '')));
  } else {
    list.sort((a, b) => {
      const aT = a.availability?.nextAvailableAt || '9999';
      const bT = b.availability?.nextAvailableAt || '9999';
      return String(aT).localeCompare(String(bT));
    });
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
  if (tabId === 'first' || tabId === 'week') {
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
  filters.value.ageGroup = '';
  filters.value.subject = '';
  filters.value.gradeLevel = '';
  load();
}

function providerIdOf(provider) {
  return Number(provider?.id || provider?.providerId || 0) || 0;
}

function goBook(provider, slot) {
  const id = providerIdOf(provider);
  const path = providerBookPath(slug.value, id, {
    serviceType: props.serviceType,
    slotStart: slot?.startAt || '',
    programType: filters.value.programType || slot?.programType || ''
  });
  if (path) router.push(path);
}

function goProfile(provider) {
  goBook(provider, null);
}

function goBack() {
  if (slug.value) router.push(`/${slug.value}/services`);
  else router.back();
}

async function resolveEditAccess() {
  canEditPage.value = false;
  if (!authStore.isAuthenticated) return;
  const role = String(authStore.user?.role || '').toLowerCase();
  if (role === 'super_admin' || role === 'support') {
    canEditPage.value = true;
    return;
  }
  if (['provider', 'provider_plus', 'client_guardian', 'kiosk'].includes(role)) {
    return;
  }
  if (['admin', 'agency_admin', 'staff'].includes(role)) {
    canEditPage.value = true;
    return;
  }
  if (isPractitionerOrgType(orgType.value)) {
    try {
      const res = await api.get('/practitioner-team/me', {
        params: { agencyId: agencyId.value },
        skipGlobalLoading: true
      });
      canEditPage.value = !!res.data?.isOwner;
    } catch {
      canEditPage.value = false;
    }
  }
}

function startEdit() {
  editDraft.value = {
    displayName: displayName.value || props.pageTitle,
    introBlurb: introBlurb.value || '',
    heroImageUrl: heroImageUrl.value || ''
  };
  editing.value = true;
  editError.value = '';
  editOk.value = '';
}

function cancelEdit() {
  editing.value = false;
  editError.value = '';
  editOk.value = '';
}

async function saveEdit() {
  if (!slug.value) return;
  savingEdit.value = true;
  editError.value = '';
  editOk.value = '';
  try {
    await api.post(
      `/public/agency-services/${encodeURIComponent(slug.value)}/service-types`,
      {
        serviceType: props.serviceType,
        displayName: editDraft.value.displayName || null,
        introBlurb: editDraft.value.introBlurb || null,
        heroImageUrl: editDraft.value.heroImageUrl || null,
        isEnabled: serviceEnabled.value !== false,
        sortOrder: sortOrder.value || 0
      },
      { skipAuthRedirect: true }
    );
    displayName.value = editDraft.value.displayName || '';
    introBlurb.value = editDraft.value.introBlurb || '';
    heroImageUrl.value = editDraft.value.heroImageUrl || '';
    editing.value = false;
    editOk.value = 'Saved';
    setTimeout(() => {
      editOk.value = '';
    }, 2500);
  } catch (e) {
    editError.value = e.response?.data?.error?.message || e.message || 'Could not save';
  } finally {
    savingEdit.value = false;
  }
}

async function loadHubMeta() {
  if (!slug.value) return;
  try {
    const hubRes = await api.get(`/public/agency-services/${encodeURIComponent(slug.value)}`, {
      skipAuthRedirect: true
    });
    agencyId.value = hubRes.data?.agency?.id || null;
    agencyName.value = hubRes.data?.agency?.name || agencyName.value;
    orgType.value = hubRes.data?.agency?.organizationType || 'agency';
    const svc = (hubRes.data?.serviceTypes || []).find((s) => s.serviceType === props.serviceType);
    if (svc) {
      displayName.value = svc.displayName || '';
      if (svc.introBlurb) introBlurb.value = svc.introBlurb;
      heroImageUrl.value = svc.heroImageUrl || '';
      sortOrder.value = svc.sortOrder ?? 0;
      serviceEnabled.value = true;
    }
    await resolveEditAccess();
  } catch {
    // non-fatal
  }
}

async function load() {
  if (!slug.value) return;
  loading.value = true;
  error.value = '';
  try {
    const params = {
      programType: filters.value.programType,
      weekStart: filters.value.weekStart,
      bookingMode: 'NEW_CLIENT'
    };
    if (filters.value.search) params.search = filters.value.search;
    if (filters.value.specialty) params.specialty = filters.value.specialty;
    if (filters.value.ageGroup) params.ageGroup = filters.value.ageGroup;
    if (filters.value.subject) params.subject = filters.value.subject;
    if (filters.value.gradeLevel) params.gradeLevel = filters.value.gradeLevel;

    const res = await api.get(
      `/public/agency-services/${encodeURIComponent(slug.value)}/${listPath.value}`,
      { params, skipAuthRedirect: true }
    );
    providers.value = normalizePublicProviders(res.data?.providers);
    if (res.data?.introBlurb && !introBlurb.value) introBlurb.value = res.data.introBlurb;
    agencyName.value = res.data?.agencyName || res.data?.agencySlug || agencyName.value;
    if (res.data?.agencyId) agencyId.value = res.data.agencyId;
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load providers.';
    providers.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  await loadHubMeta();
  await load();
});
</script>

<style scoped>
.team-finder {
  --tf-p: var(--agency-primary-color, #1e3a5f);
  --tf-a: var(--agency-accent-color, #4338ca);
  --tf-bg: color-mix(in srgb, var(--tf-p) 6%, #f8fafc);
  min-height: 100vh;
  background: var(--tf-bg);
  font-family: var(--agency-font-family, 'Source Sans 3', system-ui, sans-serif);
  color: #0f172a;
}
.team-finder--editing { padding-bottom: 120px; }
.tf-editor-bar {
  position: fixed;
  left: 12px;
  right: 12px;
  bottom: 12px;
  z-index: 60;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
  padding: 10px 16px;
  background: #0f172a;
  color: #f8fafc;
  border-radius: 14px;
  box-shadow: 0 16px 40px -18px rgba(15, 23, 42, 0.65);
}
.tf-editor-bar--active { background: #14532d; }
.tf-editor-hint {
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.tf-editor-btn {
  border: 1px solid rgba(248, 250, 252, 0.35);
  background: transparent;
  color: inherit;
  border-radius: 999px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 600;
}
.tf-editor-btn--primary {
  background: #f8fafc;
  color: #0f172a;
  border-color: transparent;
}
.tf-editor-btn:disabled { opacity: 0.55; cursor: wait; }
.tf-editor-link {
  color: #bae6fd;
  font-size: 0.82rem;
  margin-left: 0.25rem;
}
.tf-editor-error { margin: 0; width: 100%; color: #fecaca; font-size: 0.82rem; }
.tf-editor-ok { margin: 0; width: 100%; color: #bbf7d0; font-size: 0.82rem; }

.tf-hero {
  max-width: 1280px;
  margin: 0 auto;
  padding: 1rem 1.25rem 0;
}
.tf-hero-inner {
  border-radius: 0.85rem;
  padding: 1.35rem 1.4rem;
  background: #0f172a;
  color: #f8fafc;
  background-size: cover;
  background-position: center;
}
.tf-hero-title {
  margin: 0 0 0.35rem;
  font-size: 1.55rem;
  font-weight: 750;
}
.tf-hero-blurb {
  margin: 0;
  max-width: 60ch;
  color: #cbd5e1;
  line-height: 1.45;
}
.tf-hero-edit {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  margin-bottom: 0.75rem;
  font-size: 0.78rem;
  font-weight: 650;
  color: #94a3b8;
}
.tf-hero-edit input,
.tf-hero-edit textarea {
  border: 1px solid rgba(148, 163, 184, 0.45);
  border-radius: 0.5rem;
  padding: 0.55rem 0.65rem;
  font-size: 0.95rem;
  color: #0f172a;
  background: #fff;
}

.tf-nav {
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
  position: sticky;
  top: 0;
  z-index: 40;
}
.tf-nav-inner {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0.75rem 1.25rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.tf-back {
  border: none;
  background: #f1f5f9;
  border-radius: 0.5rem;
  width: 2.25rem;
  height: 2.25rem;
  display: grid;
  place-items: center;
  cursor: pointer;
  color: #475569;
}
.tf-back svg { width: 1.15rem; height: 1.15rem; }
.tf-logo { height: 1.75rem; width: auto; }
.tf-nav-title { font-weight: 700; font-size: 1rem; }
.tf-care-nav { display: flex; gap: 0.35rem; margin-left: auto; flex-wrap: wrap; }
.tf-care-link {
  text-decoration: none;
  color: #64748b;
  font-size: 0.85rem;
  font-weight: 600;
  padding: 0.35rem 0.7rem;
  border-radius: 999px;
}
.tf-care-link.active,
.tf-care-link:hover {
  background: color-mix(in srgb, var(--tf-a) 12%, white);
  color: var(--tf-a);
}

.tf-shell {
  max-width: 1280px;
  margin: 0 auto;
  padding: 1.25rem;
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 1.25rem;
  align-items: start;
}
.tf-rail {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 0.85rem;
  padding: 1rem;
  position: sticky;
  top: 4.5rem;
}
.tf-rail-title {
  margin: 0 0 1rem;
  font-size: 1rem;
  font-weight: 750;
}
.tf-field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  margin-bottom: 0.85rem;
  font-size: 0.78rem;
  font-weight: 600;
  color: #64748b;
}
.tf-field input,
.tf-field select {
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  padding: 0.55rem 0.65rem;
  font-size: 0.9rem;
  font-weight: 500;
  color: #0f172a;
  background: #fff;
}
.tf-avail {
  border: none;
  margin: 0 0 0.85rem;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.tf-avail legend {
  font-size: 0.78rem;
  font-weight: 600;
  color: #64748b;
  margin-bottom: 0.35rem;
}
.tf-avail-btn {
  text-align: left;
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 0.5rem;
  padding: 0.5rem 0.65rem;
  font-size: 0.85rem;
  cursor: pointer;
  color: #334155;
}
.tf-avail-btn.active {
  border-color: var(--tf-a);
  background: color-mix(in srgb, var(--tf-a) 10%, white);
  color: var(--tf-a);
  font-weight: 650;
}
.tf-clear {
  width: 100%;
  margin-bottom: 0.65rem;
  border: none;
  background: transparent;
  color: #64748b;
  font-size: 0.85rem;
  cursor: pointer;
  text-decoration: underline;
}
.tf-match {
  width: 100%;
  border: 1px dashed #cbd5e1;
  background: #f8fafc;
  color: #94a3b8;
  border-radius: 0.55rem;
  padding: 0.65rem;
  font-weight: 650;
  cursor: not-allowed;
}

.tf-main { min-width: 0; }
.tf-results-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 1rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}
.tf-count {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 750;
}
.tf-tz {
  margin: 0.25rem 0 0;
  font-size: 0.8rem;
  color: #64748b;
}
.tf-sort {
  font-size: 0.8rem;
  color: #64748b;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.tf-sort select {
  border: 1px solid #d1d5db;
  border-radius: 0.45rem;
  padding: 0.4rem 0.55rem;
  font-size: 0.85rem;
}
.tf-intro {
  margin: 0 0 1rem;
  color: #475569;
  font-size: 0.95rem;
}
.tf-cards {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}
.tf-state {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 0.85rem;
  padding: 2.5rem 1.25rem;
  text-align: center;
  color: #64748b;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
}
.tf-state--error { color: #b91c1c; }
.tf-spinner {
  width: 1.75rem;
  height: 1.75rem;
  border: 3px solid #e2e8f0;
  border-top-color: var(--tf-a);
  border-radius: 50%;
  animation: tf-spin 0.7s linear infinite;
}
@keyframes tf-spin { to { transform: rotate(360deg); } }

@media (max-width: 900px) {
  .tf-shell { grid-template-columns: 1fr; }
  .tf-rail { position: static; }
  .tf-care-nav { margin-left: 0; width: 100%; }
}
</style>
