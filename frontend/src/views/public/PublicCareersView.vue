<template>
  <div class="cr" :style="rootStyle">
    <!-- ── NAV ── -->
    <nav class="cr-nav">
      <div class="cr-nav-inner">
        <a class="cr-nav-brand" href="#">
          <img v-if="headerLogoUrl" class="cr-nav-logo" :src="headerLogoUrl" :alt="headerLogoAlt" loading="eager" />
          <span v-else class="cr-nav-name">{{ agencyName || 'Careers' }}</span>
          <span v-if="headerLogoUrl" class="cr-nav-careers-label">CAREERS</span>
        </a>
        <div class="cr-nav-links">
          <template v-for="item in navItems" :key="item.label">
            <a
              v-if="item.style === 'button'"
              class="cr-nav-btn"
              :href="item.href || '#'"
              target="_blank"
              rel="noopener noreferrer"
            >{{ item.label }}</a>
            <a
              v-else
              class="cr-nav-link"
              :href="item.href || '#'"
              target="_blank"
              rel="noopener noreferrer"
            >{{ item.label }}</a>
          </template>
        </div>
      </div>
    </nav>

    <!-- ── HERO ── -->
    <header class="cr-hero">
      <div class="cr-hero-inner" :class="{ 'cr-hero-inner--no-image': !careersHeroImageUrl }">
        <div class="cr-hero-copy">
          <span v-if="eyebrow" class="cr-eyebrow">{{ eyebrow }}</span>
          <h1 class="cr-hero-h1">
            <span v-if="heroHeadline" class="cr-hero-headline">{{ heroHeadline }}</span>
            <span v-if="heroSubheadline" class="cr-hero-subheadline">{{ heroSubheadline }}</span>
            <span v-if="!heroHeadline && !heroSubheadline" class="cr-hero-headline">{{ pageTitle }}</span>
          </h1>
          <p v-if="careersSubtitle" class="cr-hero-lead">{{ careersSubtitle }}</p>
          <div v-if="agencyFeatureCards.length" class="cr-feature-cards">
            <div v-for="card in agencyFeatureCards" :key="card.title" class="cr-feature-card">
              <span class="cr-feature-icon" aria-hidden="true">{{ cardIconEmoji(card.icon) }}</span>
              <div>
                <strong class="cr-feature-title">{{ card.title }}</strong>
                <span v-if="card.body" class="cr-feature-body">{{ card.body }}</span>
              </div>
            </div>
          </div>
        </div>

        <figure v-if="careersHeroImageUrl" class="cr-hero-fig">
          <img
            class="cr-hero-img"
            :src="careersHeroImageUrl"
            :alt="careersHeroImageAlt"
            :style="{ objectPosition: careersHeroImagePosition }"
            loading="eager"
          />
          <svg v-if="showLeafAccent" class="cr-leaf" viewBox="0 0 180 300" fill="none" aria-hidden="true">
            <path d="M90 290 C40 240 10 180 30 110 C50 40 110 10 150 50 C190 90 170 160 130 210 C110 240 90 270 90 290Z" fill="currentColor" opacity="0.13"/>
            <path d="M90 290 C60 250 50 200 70 150 C90 100 130 70 155 90" stroke="currentColor" stroke-width="2" opacity="0.25"/>
          </svg>
        </figure>
      </div>
    </header>

    <!-- ── FILTERS ── -->
    <div class="cr-filters-wrap">
      <div class="cr-filters">
        <!-- Role type pills -->
        <div class="cr-pill-group">
          <button class="cr-pill" :class="{ 'cr-pill--active': !selectedRoleType }" type="button" @click="selectedRoleType = ''">All Roles</button>
          <button
            v-for="rt in availableRoleTypes"
            :key="rt"
            class="cr-pill"
            :class="{ 'cr-pill--active': selectedRoleType === rt }"
            type="button"
            @click="selectedRoleType = rt"
          >{{ rt }}</button>
        </div>

        <!-- Location pills (cities) -->
        <div class="cr-pill-group cr-pill-group--location">
          <svg class="cr-loc-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 1.5A4.5 4.5 0 0 1 12.5 6c0 3.5-4.5 8.5-4.5 8.5S3.5 9.5 3.5 6A4.5 4.5 0 0 1 8 1.5Z" stroke="currentColor" stroke-width="1.3"/>
            <circle cx="8" cy="6" r="1.5" stroke="currentColor" stroke-width="1.3"/>
          </svg>
          <button class="cr-pill" :class="{ 'cr-pill--active': !selectedLocation }" type="button" @click="selectedLocation = ''">All Locations</button>
          <button
            v-for="loc in availableLocations"
            :key="loc"
            class="cr-pill"
            :class="{ 'cr-pill--active': selectedLocation === loc }"
            type="button"
            @click="selectedLocation = loc"
          >{{ loc }}</button>
        </div>

        <!-- Sort dropdown (fixed: outer is div, not select) -->
        <div class="cr-sort-wrap">
          <svg class="cr-sort-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="2" y="4" width="12" height="1.3" rx="0.65" fill="currentColor"/>
            <rect x="4" y="7.3" width="8" height="1.3" rx="0.65" fill="currentColor"/>
            <rect x="6" y="10.6" width="4" height="1.3" rx="0.65" fill="currentColor"/>
          </svg>
          <select v-model="sortBy" class="cr-select">
            <option value="featured_desc">Newest Posted</option>
            <option value="posted_asc">Oldest Posted</option>
            <option value="city_asc">City / State (A–Z)</option>
          </select>
        </div>
      </div>
    </div>

    <!-- ── LOADING / ERROR ── -->
    <div v-if="loading" class="cr-status">Loading open positions…</div>
    <div v-else-if="error" class="cr-status cr-status--error">{{ error }}</div>
    <div v-else-if="!jobs.length" class="cr-status">No open positions right now.</div>

    <template v-else>
      <!-- ── BANNER ── -->
      <div v-if="bannerText" class="cr-banner">
        <div class="cr-banner-inner">
          <svg class="cr-banner-icon" viewBox="0 0 40 40" fill="none" aria-hidden="true">
            <circle cx="20" cy="20" r="19" stroke="currentColor" stroke-width="1.5" opacity="0.25"/>
            <path d="M12 26 C12 18 20 12 28 14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <circle cx="20" cy="20" r="4" fill="currentColor" opacity="0.2"/>
            <path d="M17 23 L20 16 L23 23" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <div class="cr-banner-body">
            <p class="cr-banner-text">{{ bannerText }}</p>
            <p v-if="bannerBullets.length" class="cr-banner-bullets">
              <span v-for="(b, i) in bannerBullets" :key="b">{{ i > 0 ? ' • ' : '' }}{{ b }}</span>
            </p>
          </div>
          <a
            v-if="bannerLinkText && bannerLinkHref"
            class="cr-banner-link"
            :href="bannerLinkHref"
            target="_blank"
            rel="noopener noreferrer"
          >{{ bannerLinkText }} →</a>
        </div>
      </div>

      <!-- ── JOB LIST ── -->
      <div v-if="!filteredJobs.length" class="cr-status">No roles match the selected filters.</div>

      <ul v-else class="cr-list">
        <li v-for="job in pagedJobs" :key="job.jobId" class="cr-item">
          <article class="cr-card" :class="{ 'cr-card--featured': job.isFeatured }">
            <span v-if="job.isFeatured" class="cr-featured-badge">FEATURED</span>

            <!-- Job card icon: uploaded image or emoji fallback -->
            <div class="cr-card-icon" :class="`cr-card-icon--${roleTypeKey(job.roleType || job.educationLevel)}`">
              <img
                v-if="job.iconUrl"
                :src="resolveIconUrl(job.iconUrl)"
                :alt="job.roleType || 'Role icon'"
                class="cr-card-icon-img"
              />
              <span v-else aria-hidden="true">{{ roleTypeEmoji(job.roleType || job.educationLevel) }}</span>
            </div>

            <div class="cr-card-body">
              <h2 class="cr-card-title">{{ job.title }}</h2>
              <div class="cr-card-meta">
                <span v-if="job.city || job.state" class="cr-meta-item">
                  <svg viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M7 1.5A3.5 3.5 0 0 1 10.5 5c0 2.8-3.5 7-3.5 7S3.5 7.8 3.5 5A3.5 3.5 0 0 1 7 1.5Z" stroke="currentColor" stroke-width="1.2"/><circle cx="7" cy="5" r="1.2" stroke="currentColor" stroke-width="1.2"/></svg>
                  {{ [job.city, job.state].filter(Boolean).join(', ') }}
                </span>
                <span v-if="job.roleType" class="cr-meta-item">
                  <svg viewBox="0 0 14 14" fill="none" aria-hidden="true"><rect x="2" y="4" width="10" height="7" rx="1.5" stroke="currentColor" stroke-width="1.2"/><path d="M5 4V3a2 2 0 0 1 4 0v1" stroke="currentColor" stroke-width="1.2"/></svg>
                  {{ job.roleType }}
                </span>
                <span class="cr-meta-item">
                  <svg viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.2"/><path d="M7 4v3.5l2 1.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
                  {{ job.applicationDeadline ? `Apply by ${formatDate(job.applicationDeadline)}` : 'Ongoing' }}
                </span>
              </div>
              <p class="cr-card-desc">{{ trimText(job.descriptionText, 220) }}</p>
              <div v-if="job.tags && job.tags.length" class="cr-tags">
                <span v-for="tag in job.tags" :key="tag" class="cr-tag">{{ tag }}</span>
              </div>
            </div>

            <div class="cr-card-actions">
              <a
                class="cr-apply-btn"
                :href="buildPublicIntakeUrl(job.applicationPublicKey)"
                target="_blank"
                rel="noopener noreferrer"
              >Apply Now →</a>
              <button
                class="cr-save-btn"
                type="button"
                :class="{ 'cr-save-btn--saved': savedJobs.has(job.jobId) }"
                :aria-label="savedJobs.has(job.jobId) ? 'Unsave job' : 'Save job'"
                @click="toggleSave(job.jobId)"
              >
                <svg viewBox="0 0 16 18" fill="none" aria-hidden="true">
                  <path d="M3 1h10a1 1 0 0 1 1 1v14l-6-4-6 4V2a1 1 0 0 1 1-1Z" :fill="savedJobs.has(job.jobId) ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.4"/>
                </svg>
                {{ savedJobs.has(job.jobId) ? 'Saved' : 'Save' }}
              </button>
            </div>
          </article>
        </li>
      </ul>

      <!-- ── PAGINATION ── -->
      <div v-if="filteredJobs.length > 0" class="cr-pagination">
        <p class="cr-pagination-count">
          Showing {{ pageStart + 1 }}–{{ pageEnd }} of {{ filteredJobs.length }} role{{ filteredJobs.length !== 1 ? 's' : '' }}
        </p>
        <div class="cr-pagination-pages">
          <button
            v-for="p in totalPages"
            :key="p"
            class="cr-page-btn"
            :class="{ 'cr-page-btn--active': p === currentPage }"
            type="button"
            @click="currentPage = p"
          >{{ p }}</button>
          <button
            v-if="currentPage < totalPages"
            class="cr-page-btn cr-page-btn--next"
            type="button"
            @click="currentPage++"
          >›</button>
        </div>
        <button class="cr-view-all-link" type="button" @click="showAll = !showAll">
          {{ showAll ? 'Paginate results' : 'View all roles' }} →
        </button>
      </div>
    </template>

    <!-- ── LEARN MORE MODAL ── -->
    <div v-if="learnMoreJob" class="cr-modal-overlay" @click.self="learnMoreJob = null">
      <div class="cr-modal">
        <div class="cr-modal-header">
          <h3>{{ learnMoreJob.title }}</h3>
          <button class="cr-modal-close" type="button" @click="learnMoreJob = null">✕</button>
        </div>
        <div class="cr-modal-body">
          <p class="cr-modal-desc">{{ learnMoreJob.descriptionText || 'No description available.' }}</p>
          <div v-if="learnMoreJob.jobDescriptionFileUrl" class="cr-embed-wrap">
            <iframe :src="learnMoreJob.jobDescriptionFileUrl" class="cr-embed" title="Job description" />
          </div>
          <div v-else class="cr-modal-nodoc">No attached job description document.</div>
          <div class="cr-modal-actions">
            <a
              class="cr-apply-btn"
              :href="buildPublicIntakeUrl(learnMoreJob.applicationPublicKey)"
              target="_blank"
              rel="noopener noreferrer"
            >Apply Now →</a>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useBrandingStore } from '../../store/branding';
import { buildPublicIntakeUrl } from '../../utils/publicIntakeUrl';
import { toUploadsUrl } from '../../utils/uploadsUrl';

const PER_PAGE = 5;

const route = useRoute();
const brandingStore = useBrandingStore();

const slug = computed(() => String(route.params?.agencySlug || '').trim());
const loading = ref(false);
const error = ref('');
const jobs = ref([]);
const agencyName = ref('');
const agencyCareersPage = ref({});
const selectedLocation = ref('');
const selectedRoleType = ref('');
const sortBy = ref('featured_desc');
const learnMoreJob = ref(null);
const savedJobs = ref(new Set());
const currentPage = ref(1);
const showAll = ref(false);

/* ── Brand color (careers page explicit → branding store primary → default) ── */
const hexToRgba = (hex, alpha) => {
  const clean = String(hex || '').replace(/^#/, '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean.padEnd(6, '0');
  const r = parseInt(full.slice(0, 2), 16) || 26;
  const g = parseInt(full.slice(2, 4), 16) || 140;
  const b = parseInt(full.slice(4, 6), 16) || 84;
  return `rgba(${r},${g},${b},${alpha})`;
};

const accentColor = computed(() => {
  const explicit = String(agencyCareersPage.value?.accentColor || '').trim();
  if (explicit && /^#[0-9a-fA-F]{3,8}$/.test(explicit)) return explicit;
  const brand =
    brandingStore.portalTheme?.colorPalette?.primary ||
    brandingStore.portalAgency?.colorPalette?.primary ||
    brandingStore.primaryColor;
  if (brand && String(brand).startsWith('#')) return String(brand).trim();
  return '#1a8c54';
});

const rootStyle = computed(() => ({
  '--accent': accentColor.value,
  '--accent-light': hexToRgba(accentColor.value, 0.1),
  '--accent-border': hexToRgba(accentColor.value, 0.28),
}));

/* ── Careers page data accessors ── */
const navItems = computed(() => Array.isArray(agencyCareersPage.value?.navItems) ? agencyCareersPage.value.navItems : []);
const eyebrow = computed(() => String(agencyCareersPage.value?.eyebrow || '').trim());
const heroHeadline = computed(() => String(agencyCareersPage.value?.heroHeadline || '').trim());
const heroSubheadline = computed(() => String(agencyCareersPage.value?.heroSubheadline || '').trim());
const careersSubtitle = computed(() => String(agencyCareersPage.value?.lead || '').trim());
const careersHeroImageUrl = computed(() => {
  const raw = String(agencyCareersPage.value?.heroImageUrl || '').trim();
  return toUploadsUrl(raw) || raw;
});
const careersHeroImageAlt = computed(() => String(agencyCareersPage.value?.heroImageAlt || `${agencyName.value || 'Agency'} careers`).trim());
const careersHeroImagePosition = computed(() => String(agencyCareersPage.value?.heroImagePosition || 'center center').trim());
const showLeafAccent = computed(() => agencyCareersPage.value?.showLeafAccent !== false);
const agencyFeatureCards = computed(() =>
  (Array.isArray(agencyCareersPage.value?.featureCards) ? agencyCareersPage.value.featureCards : [])
    .map((c) => ({ icon: String(c?.icon || ''), title: String(c?.title || '').trim(), body: String(c?.body || '').trim() }))
    .filter((c) => c.title || c.body).slice(0, 4)
);
const bannerText = computed(() => String(agencyCareersPage.value?.bannerText || '').trim());
const bannerBullets = computed(() => Array.isArray(agencyCareersPage.value?.bannerBullets) ? agencyCareersPage.value.bannerBullets.filter(Boolean) : []);
const bannerLinkText = computed(() => String(agencyCareersPage.value?.bannerLinkText || '').trim());
const bannerLinkHref = computed(() => String(agencyCareersPage.value?.bannerLinkHref || '').trim());
const pageTitle = computed(() => agencyName.value ? `${agencyName.value} Careers` : 'Careers');

const headerLogoUrl = computed(() => {
  const t = brandingStore.portalTheme;
  const u = t?.logoUrl || brandingStore.portalAgency?.logoUrl;
  return u ? String(u).trim() : '';
});
const headerLogoAlt = computed(() => {
  const n = brandingStore.portalTheme?.agencyName || brandingStore.portalAgency?.name || agencyName.value;
  return n ? `${n} logo` : 'Organization logo';
});

/* ── Filters ── */
const availableRoleTypes = computed(() =>
  Array.from(new Set((jobs.value || []).map((j) => String(j?.roleType || '').trim()).filter(Boolean))).sort()
);

// Cities as location pills
const availableLocations = computed(() =>
  Array.from(new Set((jobs.value || []).map((j) => String(j?.city || '').trim()).filter(Boolean))).sort()
);

const filteredJobs = computed(() => {
  let list = (jobs.value || []).slice();
  if (selectedRoleType.value) list = list.filter((j) => String(j.roleType || '').trim() === selectedRoleType.value);
  if (selectedLocation.value) list = list.filter((j) => String(j.city || '').trim() === selectedLocation.value);
  if (sortBy.value === 'city_asc') {
    list.sort((a, b) => `${a.city || ''} ${a.state || ''}`.localeCompare(`${b.city || ''} ${b.state || ''}`));
  } else if (sortBy.value === 'posted_asc') {
    list.sort((a, b) => String(a.postedDate || '').localeCompare(String(b.postedDate || '')));
  } else {
    list.sort((a, b) => {
      if (b.isFeatured !== a.isFeatured) return (b.isFeatured ? 1 : 0) - (a.isFeatured ? 1 : 0);
      return String(b.postedDate || b.postedAt || '').localeCompare(String(a.postedDate || a.postedAt || ''));
    });
  }
  return list;
});

watch([selectedRoleType, selectedLocation, sortBy], () => { currentPage.value = 1; });

const totalPages = computed(() => showAll.value ? 1 : Math.max(1, Math.ceil(filteredJobs.value.length / PER_PAGE)));
const pageStart = computed(() => showAll.value ? 0 : (currentPage.value - 1) * PER_PAGE);
const pageEnd = computed(() => showAll.value ? filteredJobs.value.length : Math.min(currentPage.value * PER_PAGE, filteredJobs.value.length));
const pagedJobs = computed(() => filteredJobs.value.slice(pageStart.value, pageEnd.value));

/* ── Icon helpers ── */
const cardIconEmoji = (icon) => {
  const map = { school: '🏫', office: '🏢', people: '👥', growth: '📈', heart: '❤️', shield: '🛡️', lock: '🔒', handshake: '🤝', star: '⭐' };
  return map[String(icon || '').toLowerCase()] || '✦';
};
const ROLE_EMOJIS = { provider: '🩺', facilitator: '📖', intern: '🎓', clinician: '💼', admin: '📋' };
const roleTypeKey = (rt) => String(rt || '').toLowerCase().replace(/[^a-z]/g, '') || 'default';
const roleTypeEmoji = (rt) => {
  const key = String(rt || '').toLowerCase();
  for (const [k, v] of Object.entries(ROLE_EMOJIS)) { if (key.includes(k)) return v; }
  return '👤';
};
const resolveIconUrl = (url) => toUploadsUrl(String(url || '').trim()) || String(url || '').trim();

const formatDate = (v) => {
  const raw = String(v || '').trim();
  if (!raw) return '';
  const dt = new Date(raw);
  if (!Number.isFinite(dt.getTime())) return raw;
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
const trimText = (text, max = 220) => {
  const raw = String(text || '').trim();
  if (!raw) return 'No description provided.';
  return raw.length <= max ? raw : `${raw.slice(0, max).trim()}…`;
};
const toggleSave = (jobId) => {
  const s = new Set(savedJobs.value);
  if (s.has(jobId)) s.delete(jobId); else s.add(jobId);
  savedJobs.value = s;
};

const loadCareers = async () => {
  if (!slug.value) return;
  loading.value = true;
  error.value = '';
  try {
    try { await brandingStore.fetchAgencyTheme(slug.value, { pageContext: 'public_events' }); } catch { /* best effort */ }
    const r = await api.get(`/public-intake/careers/${encodeURIComponent(slug.value)}`, { skipAuthRedirect: true, timeout: 15000 });
    agencyName.value = String(r.data?.agency?.officialName || r.data?.agency?.name || '').trim();
    agencyCareersPage.value = r.data?.agency?.careersPage && typeof r.data.agency.careersPage === 'object' ? r.data.agency.careersPage : {};
    jobs.value = Array.isArray(r.data?.jobs) ? r.data.jobs : [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Unable to load careers at this time.';
    jobs.value = [];
    agencyCareersPage.value = {};
  } finally {
    loading.value = false;
  }
};

watch(slug, () => loadCareers(), { immediate: true });
</script>

<style scoped>
/* ── TOKENS (set via :style binding) ── */
.cr { --accent: #1a8c54; --accent-light: rgba(26,140,84,0.1); --accent-border: rgba(26,140,84,0.28); --dark: #0f172a; --muted: #64748b; --border: #e2e8f0; --card-radius: 16px; min-height: 100vh; background: #f8fafc; color: var(--dark); font-family: inherit; }

/* ── NAV ── */
.cr-nav { background: #fff; border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 20; }
.cr-nav-inner { max-width: 1160px; margin: 0 auto; padding: 14px 24px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.cr-nav-brand { display: flex; align-items: center; gap: 10px; text-decoration: none; color: inherit; }
.cr-nav-logo { height: 40px; width: auto; object-fit: contain; }
.cr-nav-name { font-size: 1.1rem; font-weight: 700; color: var(--dark); }
.cr-nav-careers-label { font-size: 0.65rem; font-weight: 800; letter-spacing: 0.12em; color: var(--accent); text-transform: uppercase; }
.cr-nav-links { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
.cr-nav-link { font-size: 0.88rem; font-weight: 500; color: var(--dark); text-decoration: none; display: flex; align-items: center; gap: 5px; transition: color 0.15s; }
.cr-nav-link:hover { color: var(--accent); }
.cr-nav-btn { font-size: 0.88rem; font-weight: 600; color: var(--accent); border: 1.5px solid var(--accent); border-radius: 24px; padding: 7px 18px; text-decoration: none; transition: background 0.15s, color 0.15s; }
.cr-nav-btn:hover { background: var(--accent); color: #fff; }

/* ── HERO ── */
.cr-hero { background: #fff; padding: 48px 24px 36px; border-bottom: 1px solid var(--border); }
.cr-hero-inner { max-width: 1160px; margin: 0 auto; display: grid; grid-template-columns: 1fr 0.85fr; align-items: center; gap: 40px; }
.cr-hero-inner--no-image { grid-template-columns: minmax(0, 760px); justify-content: center; }
.cr-eyebrow { display: inline-block; background: var(--accent-light); color: var(--accent); font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; padding: 4px 12px; border-radius: 99px; margin-bottom: 14px; }
.cr-hero-h1 { margin: 0 0 14px; line-height: 1.05; display: flex; flex-direction: column; gap: 2px; }
.cr-hero-headline { font-size: clamp(1.8rem, 4vw, 2.8rem); font-weight: 800; color: var(--dark); }
.cr-hero-subheadline { font-size: clamp(1.8rem, 4vw, 2.8rem); font-weight: 800; color: var(--accent); }
.cr-hero-lead { margin: 0 0 28px; font-size: 1rem; line-height: 1.6; color: var(--muted); max-width: 520px; }
.cr-feature-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.cr-feature-card { display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px; background: var(--accent-light); border-radius: 12px; }
.cr-feature-icon { font-size: 1.4rem; flex-shrink: 0; }
.cr-feature-title { display: block; font-size: 0.88rem; font-weight: 700; color: var(--dark); margin-bottom: 3px; }
.cr-feature-body { display: block; font-size: 0.82rem; color: var(--muted); line-height: 1.4; }
.cr-hero-fig { position: relative; margin: 0; }
.cr-hero-img { display: block; width: 100%; aspect-ratio: 1.5 / 1; object-fit: cover; border-radius: 32px 32px 32px 8px; box-shadow: 0 24px 56px -28px rgba(15, 23, 42, 0.55); }
.cr-leaf { position: absolute; bottom: -20px; left: -28px; width: 90px; height: 150px; color: var(--accent); pointer-events: none; }

/* ── FILTERS ── */
.cr-filters-wrap { background: #fff; border-bottom: 1px solid var(--border); padding: 12px 24px; }
.cr-filters { max-width: 1160px; margin: 0 auto; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.cr-pill-group { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding-right: 12px; border-right: 1px solid var(--border); }
.cr-pill-group--location { display: flex; align-items: center; gap: 6px; }
.cr-loc-icon { width: 14px; height: 14px; color: var(--muted); flex-shrink: 0; }
.cr-pill { font-size: 0.82rem; font-weight: 500; padding: 6px 14px; border-radius: 99px; border: 1.5px solid var(--border); background: #fff; color: var(--dark); cursor: pointer; transition: all 0.12s; white-space: nowrap; }
.cr-pill:hover { border-color: var(--accent); color: var(--accent); }
.cr-pill--active { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
.cr-sort-wrap { display: flex; align-items: center; gap: 6px; margin-left: auto; }
.cr-sort-icon { width: 14px; height: 14px; color: var(--muted); flex-shrink: 0; }
.cr-select { font-size: 0.82rem; border: 1.5px solid var(--border); border-radius: 8px; padding: 7px 10px; color: var(--dark); background: #fff; cursor: pointer; }

/* ── STATUS ── */
.cr-status { max-width: 760px; margin: 40px auto; padding: 0 24px; text-align: center; color: var(--muted); }
.cr-status--error { color: #b91c1c; }

/* ── BANNER ── */
.cr-banner { background: var(--accent-light); border-top: 1px solid var(--accent-border); border-bottom: 1px solid var(--accent-border); padding: 16px 24px; }
.cr-banner-inner { max-width: 1160px; margin: 0 auto; display: flex; align-items: center; gap: 16px; }
.cr-banner-icon { width: 40px; height: 40px; color: var(--accent); flex-shrink: 0; }
.cr-banner-body { flex: 1; min-width: 0; }
.cr-banner-text { margin: 0; font-size: 0.95rem; font-weight: 700; color: var(--dark); }
.cr-banner-bullets { margin: 3px 0 0; font-size: 0.82rem; color: var(--muted); }
.cr-banner-link { font-size: 0.85rem; font-weight: 600; color: var(--accent); text-decoration: none; white-space: nowrap; flex-shrink: 0; }
.cr-banner-link:hover { text-decoration: underline; }

/* ── JOB LIST ── */
.cr-list { list-style: none; margin: 20px auto; padding: 0 24px; max-width: 1000px; display: flex; flex-direction: column; gap: 12px; }
.cr-item { display: block; }
.cr-card { position: relative; display: grid; grid-template-columns: 64px 1fr auto; align-items: start; gap: 18px; padding: 22px 20px; background: #fff; border: 1.5px solid var(--border); border-radius: var(--card-radius); transition: box-shadow 0.15s, border-color 0.15s; }
.cr-card:hover { box-shadow: 0 6px 24px -8px rgba(15, 23, 42, 0.12); border-color: var(--accent-border); }
.cr-card--featured { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent), 0 6px 24px -8px rgba(26, 140, 84, 0.2); }
.cr-featured-badge { position: absolute; top: 0; left: 16px; background: var(--accent); color: #fff; font-size: 0.65rem; font-weight: 800; letter-spacing: 0.1em; padding: 3px 10px; border-radius: 0 0 8px 8px; text-transform: uppercase; }
.cr-card-icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 1.6rem; flex-shrink: 0; margin-top: 4px; overflow: hidden; background: var(--accent-light); border: 1.5px solid var(--accent-border); }
.cr-card-icon--facilitator { background: #ede9fe; border-color: #c4b5fd; }
.cr-card-icon--intern { background: #fef9c3; border-color: #fde047; }
.cr-card-icon--clinician { background: #ffe4e6; border-color: #fca5a5; }
.cr-card-icon-img { width: 100%; height: 100%; object-fit: cover; }
.cr-card-body { min-width: 0; }
.cr-card-title { margin: 0 0 6px; font-size: 1.05rem; font-weight: 700; color: var(--dark); }
.cr-card-meta { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; font-size: 0.8rem; color: var(--muted); margin-bottom: 8px; }
.cr-meta-item { display: inline-flex; align-items: center; gap: 4px; }
.cr-meta-item svg { width: 12px; height: 12px; flex-shrink: 0; }
.cr-card-desc { margin: 0 0 10px; font-size: 0.88rem; color: var(--muted); line-height: 1.5; }
.cr-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.cr-tag { font-size: 0.75rem; font-weight: 500; padding: 3px 10px; border-radius: 99px; background: var(--accent-light); color: var(--accent); border: 1px solid var(--accent-border); }
.cr-card-actions { display: flex; flex-direction: column; gap: 8px; align-items: stretch; min-width: 120px; }
.cr-apply-btn { display: inline-flex; align-items: center; justify-content: center; font-size: 0.88rem; font-weight: 700; padding: 10px 18px; border-radius: 10px; background: var(--accent); color: #fff; text-decoration: none; border: none; cursor: pointer; white-space: nowrap; transition: opacity 0.15s; }
.cr-apply-btn:hover { opacity: 0.88; }
.cr-save-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; font-size: 0.8rem; font-weight: 500; padding: 8px 14px; border-radius: 8px; background: #fff; color: var(--muted); border: 1.5px solid var(--border); cursor: pointer; transition: all 0.12s; white-space: nowrap; }
.cr-save-btn svg { width: 14px; height: 16px; }
.cr-save-btn:hover { border-color: var(--accent); color: var(--accent); }
.cr-save-btn--saved { color: var(--accent); border-color: var(--accent); background: var(--accent-light); }

/* ── PAGINATION ── */
.cr-pagination { max-width: 1000px; margin: 24px auto 48px; padding: 0 24px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
.cr-pagination-count { font-size: 0.85rem; color: var(--muted); margin: 0; }
.cr-pagination-pages { display: flex; align-items: center; gap: 4px; }
.cr-page-btn { width: 34px; height: 34px; border-radius: 8px; font-size: 0.88rem; font-weight: 600; border: 1.5px solid var(--border); background: #fff; color: var(--dark); cursor: pointer; transition: all 0.12s; }
.cr-page-btn:hover { border-color: var(--accent); color: var(--accent); }
.cr-page-btn--active { background: var(--accent); border-color: var(--accent); color: #fff; }
.cr-page-btn--next { font-size: 1.1rem; }
.cr-view-all-link { font-size: 0.85rem; font-weight: 600; color: var(--accent); background: none; border: none; cursor: pointer; padding: 0; }
.cr-view-all-link:hover { text-decoration: underline; }

/* ── MODAL ── */
.cr-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 20px; }
.cr-modal { width: min(960px, 100%); background: #fff; border-radius: 16px; border: 1px solid var(--border); overflow: hidden; display: flex; flex-direction: column; max-height: 90vh; }
.cr-modal-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border); gap: 12px; }
.cr-modal-header h3 { margin: 0; font-size: 1.05rem; }
.cr-modal-close { background: none; border: none; font-size: 1.1rem; cursor: pointer; color: var(--muted); padding: 4px 8px; border-radius: 6px; }
.cr-modal-close:hover { background: var(--border); }
.cr-modal-body { padding: 16px 20px; overflow: auto; flex: 1; }
.cr-modal-desc { margin: 0 0 16px; color: var(--muted); line-height: 1.55; }
.cr-embed-wrap { border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
.cr-embed { width: 100%; min-height: 520px; border: 0; }
.cr-modal-nodoc { color: var(--muted); font-size: 0.85rem; font-style: italic; }
.cr-modal-actions { margin-top: 16px; }

/* ── RESPONSIVE ── */
@media (max-width: 840px) {
  .cr-hero-inner { grid-template-columns: 1fr; }
  .cr-hero-fig { order: -1; }
  .cr-hero-img { aspect-ratio: 2 / 1; border-radius: 20px; }
  .cr-leaf { display: none; }
  .cr-hero-lead { max-width: 100%; }
  .cr-card { grid-template-columns: 48px 1fr; }
  .cr-card-actions { grid-column: 1 / -1; flex-direction: row; }
  .cr-feature-cards { grid-template-columns: 1fr; }
}
@media (max-width: 560px) {
  .cr-nav-inner { flex-direction: column; align-items: flex-start; gap: 10px; }
  .cr-hero { padding: 28px 16px 24px; }
  .cr-list, .cr-pagination { padding: 0 12px; }
  .cr-card { padding: 18px 14px; gap: 12px; grid-template-columns: 1fr; }
  .cr-card-icon { display: none; }
  .cr-card-actions { flex-direction: row; }
  .cr-pill-group { padding-right: 0; border-right: 0; }
  .cr-pagination { flex-direction: column; align-items: flex-start; }
}
</style>
