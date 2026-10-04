<template>
  <div class="club-search">
    <header class="directory-header">
      <div class="directory-wrap header-inner">
        <router-link :to="clubsPath" class="directory-brand">
          <img v-if="displayLogoUrl && !logoError" :src="displayLogoUrl" alt="" @error="logoError = true" />
          <span>{{ platformName }}<small>Find your people. Build your season.</small></span>
        </router-link>
        <nav aria-label="Club directory navigation">
          <a v-if="isSscSstcSlug" href="/p/sstc">Home</a>
          <router-link :to="clubsPath" aria-current="page">Find a club</router-link>
          <router-link :to="authStore.isAuthenticated ? dashboardPath : loginPath">{{ authStore.isAuthenticated ? 'My dashboard' : 'Log in' }}</router-link>
          <router-link :to="clubManagerSignupPath" class="btn btn-dark">Start my club <span aria-hidden="true">↗</span></router-link>
        </nav>
      </div>
    </header>
    <main>
      <section class="directory-hero">
        <div class="directory-wrap hero-inner">
          <div>
            <p class="eyebrow">THE CLUB DIRECTORY</p>
            <h1>A little competition.<br />A community to belong to.</h1>
            <p class="subtitle">Find a club near you, meet the manager, and take the first step toward your next season.</p>
          </div>
          <aside class="join-guide" aria-label="How to join">
            <p class="eyebrow">YOUR NEXT STEP</p>
            <h2>Good seasons start with good people.</h2>
            <ol><li>Find your club and explore its page.</li><li>{{ inviteOnlyMemberSignup ? 'Request an invitation from the manager.' : 'Send an application to join.' }}</li><li>Watch for your club’s next steps.</li></ol>
          </aside>
        </div>
      </section>
      <section class="directory-wrap directory-content" aria-labelledby="browse-heading">
        <div class="section-heading"><div><p class="eyebrow">FIND YOUR TEAM</p><h2 id="browse-heading">Explore current clubs</h2></div><p>{{ clubsPageSubtitle }}</p></div>
        <form class="search-filters" role="search" @submit.prevent="resetSearch">
          <label class="search-field" for="club-search">Club name or city
            <input id="club-search" v-model="search" type="search" placeholder="Where do you want to get moving?" @input="debouncedSearch" />
          </label>
          <label class="state-field" for="club-state">State
            <select id="club-state" v-model="stateFilter" @change="resetSearch"><option value="">All states</option><option v-for="s in usStates" :key="s" :value="s">{{ s }}</option></select>
          </label>
          <button v-if="search || stateFilter" type="button" class="clear-button" @click="clearFilters">Clear filters</button>
        </form>
        <div v-if="actionError" class="error" role="alert">{{ actionError }}</div>
        <div class="results-status" role="status" aria-live="polite">{{ loading ? 'Loading clubs…' : error ? 'Club directory unavailable' : `${total} ${total === 1 ? 'club' : 'clubs'} found` }}</div>
        <div v-if="error" class="empty-state" role="alert"><h3>We couldn’t load the clubs.</h3><p>{{ error }}</p><button type="button" class="btn btn-dark" @click="fetchClubs">Try again</button></div>
        <div v-else-if="loading" class="clubs-grid" aria-hidden="true"><div v-for="n in 6" :key="n" class="club-card skeleton"></div></div>
        <div v-else-if="!clubs.length" class="empty-state"><h3>{{ search || stateFilter ? 'No clubs match your search yet.' : 'The next community could be yours.' }}</h3><p>{{ search || stateFilter ? 'Try another city or state, or clear your filters to see every club.' : 'There are no current clubs to display. Check back soon or start your own.' }}</p><button v-if="search || stateFilter" type="button" class="btn btn-dark" @click="clearFilters">Show all clubs</button><router-link v-else :to="clubManagerSignupPath" class="btn btn-dark">Start my club</router-link></div>
        <div v-else class="clubs-grid">
          <article v-for="c in clubs" :key="c.id" class="club-card">
            <div class="card-top"><span class="club-monogram" aria-hidden="true">{{ initials(c.name) }}</span><span v-if="isMember(c.id)" class="club-badge">Member</span><span v-else-if="hasPendingApplication(c.id)" class="club-badge pending">Application pending</span><span v-else class="club-label">CURRENT CLUB</span></div>
            <h3><router-link :to="clubPath(c)">{{ c.name }}</router-link></h3>
            <dl class="club-details"><div><dt>Location</dt><dd>{{ [c.city, c.state].filter(Boolean).join(', ') || 'Location not listed' }}</dd></div><div><dt>Club manager</dt><dd>{{ c.primaryManagerName || 'Manager not listed' }}<span v-if="isManagedByCurrentUser(c)"> · You</span></dd></div></dl>
            <p v-if="hasPendingApplication(c.id)" class="application-note">Your application is waiting for the club manager’s review.</p>
            <div class="club-actions">
              <router-link :to="clubPath(c)" class="btn btn-outline">View club <span aria-hidden="true">↗</span></router-link>
              <button v-if="!isMember(c.id) && !hasPendingApplication(c.id)" type="button" class="btn btn-primary" :disabled="applyingId === c.id" @click="applyToClub(c)">{{ applyingId === c.id ? 'Submitting…' : isSscSstcSlug ? (inviteOnlyMemberSignup ? 'Request invite' : 'Apply to join') : (authStore.isAuthenticated ? 'Apply to join' : 'Sign in to join') }}</button>
            </div>
            <button v-if="c.primaryManagerUserId && !isManagedByCurrentUser(c)" type="button" class="contact-link" :disabled="contactingId === c.id" @click="contactManager(c)">{{ contactingId === c.id ? 'Opening…' : 'Contact manager' }}</button>
          </article>
        </div>
        <nav v-if="!loading && !error && total > pageSize" class="pagination" aria-label="Club directory pages"><button type="button" class="btn btn-outline" :disabled="page === 1" @click="changePage(-1)">← Previous</button><span>Page {{ page }} of {{ Math.ceil(total / pageSize) }}</span><button type="button" class="btn btn-outline" :disabled="page * pageSize >= total" @click="changePage(1)">Next →</button></nav>
        <aside class="start-club"><div><h2>Bring your own people together.</h2><p>Have a community in mind? Give it a club to call home.</p></div><router-link :to="clubManagerSignupPath" class="btn btn-dark">Start my club <span aria-hidden="true">→</span></router-link></aside>
      </section>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../services/api';
import { useBrandingStore } from '../store/branding';
import { useAuthStore } from '../store/auth';
import { useAgencyStore } from '../store/agency';
import { SUMMIT_STATS_TEAM_CHALLENGE_NAME } from '../constants/summitStatsBranding.js';

const route  = useRoute();
const router = useRouter();
const brandingStore = useBrandingStore();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const orgSlug = computed(() => route.params?.organizationSlug || null);
const loginPath = computed(() => (orgSlug.value ? `/${orgSlug.value}/login` : '/login'));
const signupPath = computed(() => (orgSlug.value ? `/${orgSlug.value}/signup` : '/signup'));
const clubManagerSignupPath = computed(() =>
  orgSlug.value ? `/${orgSlug.value}/signup/club-manager` : '/signup/club-manager'
);

const clubsPath = computed(() => `/${orgSlug.value || 'sstc'}/clubs`);
const dashboardPath = computed(() => `/${orgSlug.value || 'sstc'}/dashboard`);
const clubPath = (club) => `${clubsPath.value}/${club.id}`;
const initials = (name) => String(name || '').trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
const loginTheme = ref(null);
const platformName = computed(() => loginTheme.value?.agency?.name || SUMMIT_STATS_TEAM_CHALLENGE_NAME);
const actionError = ref('');
const total = ref(0);
const page = ref(1);
const pageSize = 12;
let requestId = 0;
const logoError = ref(false);
const clubs = ref([]);
const loading = ref(true);
const error = ref('');
const search = ref('');
const stateFilter = ref('');
const myApplications = ref([]);
const applyingId = ref(null);
const contactingId = ref(null);
const inviteOnlyMemberSignup = ref(false);
let searchTimeout = null;

const usStates = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS',
  'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY',
  'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
];

const displayLogoUrl = computed(() => {
  if (orgSlug.value && loginTheme.value?.agency?.logoUrl) return loginTheme.value.agency.logoUrl;
  return brandingStore.displayLogoUrl;
});

const myAgencyIds = computed(() => {
  const list = agencyStore.userAgencies?.value ?? agencyStore.userAgencies ?? [];
  return new Set((Array.isArray(list) ? list : []).map((a) => Number(a?.id)).filter(Boolean));
});
const currentUserId = computed(() => Number(authStore.user?.id || 0));
const pendingClubIds = computed(() => new Set(
  (myApplications.value || [])
    .filter((app) => String(app?.status || '').toLowerCase() === 'pending')
    .map((app) => Number(app?.clubId || 0))
    .filter(Boolean)
));

const isMember = (clubId) => authStore.isAuthenticated && myAgencyIds.value.has(Number(clubId));
const isManagedByCurrentUser = (club) => currentUserId.value > 0 && Number(club?.primaryManagerUserId || 0) === currentUserId.value;
const hasPendingApplication = (clubId) => pendingClubIds.value.has(Number(clubId));

const fetchClubs = async () => {
  const id = ++requestId;
  loading.value = true;
  error.value = '';
  try {
    const r = await api.get('/summit-stats/clubs', {
      params: {
        platformSlug: orgSlug.value || undefined,
        search: search.value.trim() || undefined,
        state: stateFilter.value || undefined,
        limit: pageSize,
        offset: (page.value - 1) * pageSize
      },
      skipGlobalLoading: true,
      skipAuthRedirect: true
    });
    if (id !== requestId) return;
    clubs.value = r.data?.clubs || [];
    total.value = Number(r.data?.total ?? clubs.value.length);
    inviteOnlyMemberSignup.value = r.data?.inviteOnlyMemberSignup === true;
  } catch (e) {
    if (id !== requestId) return;
    error.value = e?.response?.data?.error?.message || 'Please try again in a moment.';
    clubs.value = [];
  } finally {
    if (id === requestId) loading.value = false;
  }
};

const resetSearch = () => {
  clearTimeout(searchTimeout);
  page.value = 1;
  fetchClubs();
};
const clearFilters = () => {
  search.value = '';
  stateFilter.value = '';
  resetSearch();
};
const changePage = (direction) => {
  page.value += direction;
  fetchClubs();
};
const debouncedSearch = () => {
  clearTimeout(searchTimeout);
  ++requestId; // Ignore responses for the previous filter while the next search waits.
  loading.value = true;
  searchTimeout = setTimeout(resetSearch, 300);
};
onBeforeUnmount(() => { clearTimeout(searchTimeout); ++requestId; });

const isSscSstcSlug = computed(() => {
  const s = String(orgSlug.value || '').toLowerCase();
  return s === 'ssc' || s === 'sstc';
});

const clubsPageSubtitle = computed(() => {
  if (isSscSstcSlug.value && inviteOnlyMemberSignup.value) {
    return 'Browse clubs and request an invitation, or use a personal link from your club if you already have one.';
  }
  return 'Browse clubs and start an application to join.';
});

const applyToClub = async (club) => {
  // SSC/SSTC: send through the full member application flow (handles both authed and unauthed)
  if (isSscSstcSlug.value) {
    router.push({ path: `/${orgSlug.value}/join`, query: { club: club.id } });
    return;
  }
  // Other tenants: require auth, then direct-apply via API
  if (!authStore.isAuthenticated) {
    router.push({ path: loginPath.value, query: { redirect: clubsPath.value } });
    return;
  }
  actionError.value = '';
  applyingId.value = club.id;
  try {
    await api.post(`/summit-stats/clubs/${club.id}/apply`);
    await Promise.all([agencyStore.fetchUserAgencies(), loadMyApplications()]);
  } catch (e) {
    actionError.value = e?.response?.data?.error?.message || 'Failed to join club';
  } finally {
    applyingId.value = null;
  }
};

const contactManager = async (club) => {
  if (!authStore.isAuthenticated) {
    router.push({ path: loginPath.value, query: { redirect: clubsPath.value } });
    return;
  }
  contactingId.value = club.id;
  actionError.value = '';
  try {
    const { data } = await api.post(`/summit-stats/clubs/${club.id}/contact-manager`);
    const query = {
      agencyId: String(data?.agencyId || ''),
      threadId: String(data?.threadId || '')
    };
    router.push({ path: `/${orgSlug.value}/messages`, query });
  } catch (e) {
    actionError.value = e?.response?.data?.error?.message || 'Failed to open the manager chat';
  } finally {
    contactingId.value = null;
  }
};

const loadMyApplications = async () => {
  if (!authStore.isAuthenticated) {
    myApplications.value = [];
    return;
  }
  try {
    const { data } = await api.get('/summit-stats/my-applications', { skipGlobalLoading: true });
    myApplications.value = Array.isArray(data?.applications) ? data.applications : [];
  } catch {
    myApplications.value = [];
  }
};

const fetchLoginTheme = async (portalUrl) => {
  try {
    const r = await api.get(`/agencies/portal/${portalUrl}/login-theme`, { skipGlobalLoading: true });
    loginTheme.value = r.data;
    brandingStore.setPortalThemeFromLoginTheme(r.data);
  } catch {
    // ignore
  }
};

onMounted(async () => {
  if (orgSlug.value) await fetchLoginTheme(orgSlug.value);
  else if (!brandingStore.portalHostPortalUrl) brandingStore.clearPortalTheme();
  await fetchClubs();
  if (authStore.isAuthenticated) {
    await Promise.all([
      agencyStore.fetchUserAgencies(),
      loadMyApplications()
    ]);
  }
});

watch(orgSlug, (newSlug) => {
  if (newSlug) fetchLoginTheme(newSlug);
  resetSearch();
});

watch(
  () => authStore.isAuthenticated,
  async (isAuthed) => {
    if (isAuthed) {
      await Promise.all([
        agencyStore.fetchUserAgencies(),
        loadMyApplications()
      ]);
    } else {
      myApplications.value = [];
    }
  }
);
</script>

<style scoped>
.club-search { --ink: #15323c; --muted: #58707a; --line: #dbe3dd; background: #f8faf7; color: var(--ink); min-height: 100vh; }
.club-search * { box-sizing: border-box; }
.directory-wrap { width: min(1240px, calc(100% - 64px)); margin: 0 auto; }
.directory-header { background: #fff; border-bottom: 1px solid var(--line); }
.header-inner { display: flex; align-items: center; justify-content: space-between; gap: 28px; padding-block: 24px; }
.directory-brand { display: flex; align-items: center; gap: 14px; color: var(--ink); text-decoration: none; font-size: 18px; font-weight: 800; }
.directory-brand img { width: 62px; height: 62px; object-fit: contain; }
.directory-brand small { display: block; font-size: 11px; font-weight: 500; margin-top: 5px; letter-spacing: .04em; }
.directory-header nav { display: flex; flex-wrap: wrap; align-items: center; gap: 24px; font-size: 14px; font-weight: 650; }
.directory-header nav a { color: var(--ink); text-decoration: none; }
.directory-header nav a[aria-current] { text-decoration: underline; text-underline-offset: 7px; }
.directory-hero { background: #eaf0e3; border-bottom: 1px solid var(--line); }
.hero-inner { display: grid; grid-template-columns: 1.8fr 1fr; gap: 70px; align-items: center; padding-block: 70px; }
.eyebrow { font-size: 11px; letter-spacing: .16em; font-weight: 800; color: #50752d; margin: 0 0 18px; }
h1 { font-size: clamp(36px, 4.3vw, 60px); line-height: 1.08; letter-spacing: -.045em; margin: 0 0 24px; max-width: 760px; }
.subtitle { font-size: 18px; line-height: 1.7; color: var(--muted); max-width: 590px; margin: 0; }
.join-guide { border-left: 1px solid #c5d3bc; padding-left: 32px; }
.join-guide h2 { font-size: 24px; line-height: 1.25; margin: 0 0 22px; }
.join-guide ol { padding-left: 20px; color: var(--muted); font-size: 14px; line-height: 1.6; }
.join-guide li { padding-left: 6px; margin-top: 12px; }
.join-guide li::marker { color: #50752d; font-weight: 800; }
.directory-content { padding-block: 50px; }
.section-heading { display: flex; align-items: end; justify-content: space-between; gap: 32px; margin-bottom: 28px; }
.section-heading h2 { font-size: 30px; margin: 0; letter-spacing: -.03em; }
.section-heading .eyebrow { margin-bottom: 10px; }
.section-heading > p { max-width: 440px; color: var(--muted); font-size: 14px; line-height: 1.6; margin: 0; }
.search-filters { display: flex; gap: 18px; align-items: end; padding: 22px; border: 1px solid var(--line); border-radius: 12px; background: white; }
.search-filters label { display: flex; flex-direction: column; gap: 8px; font-size: 12px; font-weight: 700; }
.search-field { flex: 1; }
.state-field { width: 200px; }
.search-filters input, .search-filters select { min-height: 48px; width: 100%; padding: 12px 14px; border: 1px solid #cad7cf; border-radius: 6px; background: #f8faf7; color: var(--ink); font: inherit; font-size: 15px; }
.clear-button { background: none; border: none; min-height: 48px; text-decoration: underline; color: var(--muted); cursor: pointer; }
.results-status { padding-block: 24px 16px; font-size: 13px; color: var(--muted); }
.clubs-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; }
.club-card { background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 26px; display: flex; flex-direction: column; min-width: 0; }
.club-card:hover { border-color: #a6baa0; box-shadow: 0 8px 24px #15323c08; }
.card-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 22px; }
.club-monogram { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 12px; background: #eaf0e3; color: #50752d; font-size: 18px; font-weight: 800; flex-shrink: 0; }
.club-label { font-size: 9px; letter-spacing: .12em; color: var(--muted); font-weight: 700; }
.club-badge { font-size: 11px; padding: 6px 10px; border-radius: 20px; background: #eaf0e3; color: #3d6520; }
.pending { background: #fff1d8; color: #805512; }
.club-card h3 { margin: 0 0 22px; font-size: 22px; line-height: 1.25; overflow-wrap: anywhere; }
.club-card h3 a { color: var(--ink); text-decoration: none; }
.club-card h3 a:hover { text-decoration: underline; }
.club-details { margin: 0 0 24px; display: grid; gap: 16px; }
.club-details dt { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: .1em; margin-bottom: 5px; }
.club-details dd { margin: 0; font-size: 14px; overflow-wrap: anywhere; }
.club-actions { display: flex; gap: 10px; margin-top: auto; padding-top: 20px; border-top: 1px solid var(--line); flex-wrap: wrap; }
.btn { min-height: 44px; padding: 12px 16px; border-radius: 5px; font-size: 13px; font-weight: 700; font-family: inherit; cursor: pointer; border: 1px solid transparent; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; gap: 16px; }
.btn-primary { background: #d0fa64; color: var(--ink); }
.btn-dark, .directory-header nav .btn-dark { background: var(--ink); color: #fff; }
.btn-outline { background: #fff; border-color: var(--line); color: var(--ink); }
.btn:hover:not(:disabled) { filter: brightness(.95); }
button:disabled { opacity: .55; cursor: not-allowed; }
.contact-link { align-self: start; background: none; border: none; padding: 16px 0 0; font: inherit; font-size: 12px; color: var(--muted); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
.application-note { font-size: 13px; color: #805512; line-height: 1.6; }
.error { padding: 16px; margin-top: 16px; color: #a12c23; background: #fff0ee; border-radius: 6px; }
.empty-state { text-align: center; background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 48px 24px; }
.empty-state p { color: var(--muted); line-height: 1.6; }
.skeleton { min-height: 300px; background: linear-gradient(120deg, #eef2e9, #f7f9f3); }
.pagination { display: flex; align-items: center; justify-content: center; gap: 24px; margin-top: 30px; font-size: 13px; }
.start-club { display: flex; justify-content: space-between; align-items: center; gap: 24px; padding: 34px; margin-top: 50px; background: #eaf0e3; border-radius: 12px; }
.start-club h2 { font-size: 24px; margin: 0 0 8px; letter-spacing: -.025em; }
.start-club p { margin: 0; color: var(--muted); line-height: 1.6; font-size: 14px; }
:where(a, button, input, select):focus-visible { outline: 3px solid #50752d; outline-offset: 4px; }
@media (max-width: 1050px) { .clubs-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .header-inner { flex-wrap: wrap; } .hero-inner { gap: 32px; } }
@media (max-width: 640px) { .directory-wrap { width: calc(100% - 32px); } .directory-header nav { width: 100%; justify-content: space-between; gap: 12px; font-size: 12px; } .directory-header nav .btn { padding: 10px; } .hero-inner { grid-template-columns: 1fr; padding-block: 42px; } .join-guide { padding-left: 20px; } .section-heading { align-items: start; flex-direction: column; gap: 12px; } .search-filters { flex-wrap: wrap; padding: 16px; } .search-field { flex-basis: 100%; } .state-field { flex: 1; } .clubs-grid { grid-template-columns: 1fr; } .start-club { align-items: start; flex-direction: column; padding: 24px; } .pagination { gap: 12px; } }
</style>
