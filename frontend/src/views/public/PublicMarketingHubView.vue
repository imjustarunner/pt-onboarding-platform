<template>
  <div class="pmh-page">
    <!-- Superadmin: quick path to edit content (does not show to public visitors). -->
    <router-link
      v-if="isSuperAdmin"
      class="pmh-admin-pill"
      to="/admin/public-marketing-pages"
    >
      Edit hub
    </router-link>

    <div v-if="error" class="pmh-fatal">{{ error }}</div>

    <div v-else class="pmh-shell">
      <div class="pmh-ambient" aria-hidden="true">
        <span class="pmh-blob pmh-blob--a" />
        <span class="pmh-blob pmh-blob--b" />
        <span class="pmh-blob pmh-blob--c" />
      </div>

      <header class="pmh-header">
        <div v-if="logoUrl" class="pmh-logo-row">
          <img class="pmh-logo" :src="logoUrl" :alt="`${displayHeadline} logo`" loading="eager" />
        </div>
        <p v-if="partnerLine" class="pmh-partner">
          <span class="pmh-partner-dot" />
          {{ partnerLine }}
        </p>
        <div v-if="heroImageUrl" class="pmh-hero-media">
          <img :src="heroImageUrl" :alt="displayHeadline" loading="lazy" />
        </div>
        <div v-if="parentIntroResolved" class="pmh-intro-card">
          <div class="pmh-intro-icon" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 7 8 11.7z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </div>
          <p class="pmh-intro-text">{{ parentIntroResolved }}</p>
        </div>
      </header>

      <section v-if="whatWeOfferResolved" class="pmh-offer" aria-labelledby="pmh-offer-heading">
        <div class="pmh-offer-card">
          <h2 id="pmh-offer-heading" class="pmh-offer-title">{{ whatWeOfferResolved.title }}</h2>
          <p class="pmh-offer-summary">{{ whatWeOfferResolved.summary }}</p>
          <button
            id="pmh-offer-toggle"
            type="button"
            class="pmh-offer-toggle"
            :aria-expanded="offerExpanded"
            aria-controls="pmh-offer-details"
            @click="offerExpanded = !offerExpanded"
          >
            {{ offerExpanded ? whatWeOfferResolved.collapseLabel : whatWeOfferResolved.expandLabel }}
          </button>
          <Transition name="pmh-offer-reveal">
            <div
              v-show="offerExpanded"
              id="pmh-offer-details"
              class="pmh-offer-details"
              role="region"
              aria-labelledby="pmh-offer-heading"
            >
              <p v-if="whatWeOfferResolved.intro" class="pmh-offer-intro">{{ whatWeOfferResolved.intro }}</p>
              <div class="pmh-offer-grid">
                <article v-for="(it, oi) in whatWeOfferResolved.items" :key="`offer-${oi}`" class="pmh-offer-item">
                  <div class="pmh-offer-media">
                    <img
                      v-if="it.imageUrl"
                      class="pmh-offer-img"
                      :src="it.imageUrl"
                      :alt="it.title"
                      loading="lazy"
                    />
                    <div v-else class="pmh-offer-img-ph" aria-hidden="true" />
                  </div>
                  <h3 class="pmh-offer-item-title">{{ it.title }}</h3>
                  <p class="pmh-offer-item-body">{{ it.body }}</p>
                </article>
              </div>
            </div>
          </Transition>
        </div>
      </section>

      <nav v-if="primaryNav.length" class="pmh-nav" aria-label="Page links">
        <template v-for="(item, i) in primaryNav" :key="`nav-${i}`">
          <a
            v-if="isExternalNavHref(item.href)"
            class="pmh-nav-link"
            :href="String(item.href).trim()"
            target="_blank"
            rel="noopener noreferrer"
            >{{ item.label }}</a
          >
          <router-link v-else class="pmh-nav-link" :to="String(item.href).trim()">{{ item.label }}</router-link>
        </template>
      </nav>

      <div v-if="galleryImages.length" class="pmh-gallery">
        <img
          v-for="(src, gi) in galleryImages"
          :key="`g-${gi}`"
          class="pmh-gallery-img"
          :src="src"
          :alt="`Photo ${gi + 1}`"
          loading="lazy"
        />
      </div>

      <!-- Built-in narrative blocks (override or disable via branding JSON: ctaSection, processSection). -->
      <section v-if="ctaSectionResolved" class="pmh-cta-band" :style="programThemeStyle">
        <p v-if="ctaSectionResolved.eyebrow" class="pmh-cta-eyebrow">{{ ctaSectionResolved.eyebrow }}</p>
        <h2 class="pmh-cta-title">{{ ctaSectionResolved.title }}</h2>
        <p v-if="ctaSectionResolved.subtitle" class="pmh-cta-subtitle">{{ ctaSectionResolved.subtitle }}</p>
        <p class="pmh-cta-body">{{ ctaSectionResolved.body }}</p>
        <p v-if="ctaSectionResolved.disclaimer" class="pmh-cta-disclaimer">{{ ctaSectionResolved.disclaimer }}</p>
        <div class="pmh-cta-actions">
          <div v-if="ctaSectionResolved.partnerBadgeUrl" class="pmh-cta-badge-img-wrap">
            <img
              class="pmh-cta-badge-img"
              :src="ctaSectionResolved.partnerBadgeUrl"
              alt="Partner or Medicaid program"
              loading="lazy"
            />
          </div>
          <div v-else-if="ctaSectionResolved.showPartnerPlaceholder" class="pmh-cta-partner-ph">
            <span class="pmh-cta-partner-ph-line">Medicaid accepted</span>
            <span class="pmh-cta-partner-ph-sub">Add ctaSection.partnerBadgeUrl in branding JSON to show your partner logo.</span>
          </div>
          <div class="pmh-cta-btn-wrap">
            <component
              :is="ctaPrimaryTag"
              class="pmh-cta-primary"
              v-bind="ctaPrimaryBind"
            >
              {{ ctaSectionResolved.primaryLabel }}
            </component>
            <div v-if="ctaSectionResolved.showLimitedBadge" class="pmh-cta-seal" aria-hidden="true">
              <span class="pmh-cta-seal-text">{{ ctaSectionResolved.limitedBadgeText }}</span>
            </div>
          </div>
        </div>
      </section>

      <section v-if="processSectionResolved" class="pmh-process" :style="programThemeStyle">
        <div class="pmh-process-inner">
          <div class="pmh-process-head">
            <h2 class="pmh-process-title">{{ processSectionResolved.title }}</h2>
            <div class="pmh-process-rule" aria-hidden="true" />
          </div>
          <ol class="pmh-process-steps">
            <li v-for="(step, si) in processSectionResolved.steps" :key="`step-${si}`" class="pmh-process-step">
              <span class="pmh-process-n">Step {{ si + 1 }}</span>
              <span class="pmh-process-t">{{ step }}</span>
            </li>
          </ol>
        </div>
      </section>

      <div id="hub-programs" class="pmh-programs-anchor">
        <PublicEventsListing
          v-if="!error"
          :page-title="displayHeadline"
          :page-subtitle="listingSubtitle"
          :events="events"
          :loading="loading"
          :error="''"
          :hub-slug="hubSlug"
          :show-hub-source-chips="true"
          :nearest-cta-label="nearestCtaLabel"
          :nearest-modal-title="nearestModalTitle"
          :nearest-modal-hint="nearestModalHint"
        />
      </div>

      <section v-if="bookingHints.length" class="pmh-section pmh-booking">
        <div class="pmh-section-inner">
          <h2 class="pmh-h2">Request a provider</h2>
          <p class="pmh-muted">
            Each organization may offer public booking. You need the access key from them to complete scheduling (append
            <code>?key=…</code> to the link they provide, or use their full invitation URL).
          </p>
          <ul class="pmh-booking-list">
            <li v-for="h in bookingHints" :key="h.agencyId">
              <router-link class="pmh-link" :to="{ path: `/find-provider/${h.agencyId}` }">{{ h.agencyName }}</router-link>
              <span v-if="!h.publicAvailabilityEnabled" class="pmh-muted"> — public booking not enabled</span>
            </li>
          </ul>
        </div>
      </section>

      <section v-if="metricsBlock" class="pmh-section pmh-metrics">
        <div class="pmh-section-inner">
          <h2 class="pmh-h2">At a glance</h2>
          <p v-if="metricsBlock.disclaimer" class="pmh-muted pmh-disclaimer">{{ metricsBlock.disclaimer }}</p>
          <dl class="pmh-metrics-grid">
            <div v-if="metricsBlock.metrics.providerCount != null" class="pmh-metric">
              <dt>Providers (approx.)</dt>
              <dd>{{ metricsBlock.metrics.providerCount }}</dd>
            </div>
            <div v-if="metricsBlock.metrics.activeClientCount != null" class="pmh-metric">
              <dt>Active clients (non-archived)</dt>
              <dd>{{ metricsBlock.metrics.activeClientCount }}</dd>
            </div>
            <div v-if="metricsBlock.metrics.mileageClaimsSubmittedLast365Days != null" class="pmh-metric">
              <dt>Mileage claims (last 365 days)</dt>
              <dd>{{ metricsBlock.metrics.mileageClaimsSubmittedLast365Days }}</dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import api from '../../services/api';
import PublicEventsListing from '../../components/public/PublicEventsListing.vue';

const authStore = useAuthStore();
const route = useRoute();
const hubSlug = computed(() => String(route.params.hubSlug || '').trim().toLowerCase());

const isSuperAdmin = computed(() => String(authStore.user?.role || '').toLowerCase() === 'super_admin');

const loading = ref(true);
const error = ref('');
const pageMeta = ref(null);
const events = ref([]);
const bookingHints = ref([]);
const metricsBlock = ref(null);
const offerExpanded = ref(false);

const heroTitle = computed(() => pageMeta.value?.heroTitle || '');
const heroImageUrl = computed(() => pageMeta.value?.heroImageUrl || '');
const pageTitle = computed(() => pageMeta.value?.title || 'Events');

/** Turn slug-like titles (d11summer2025) into readable headlines when admin left title = slug. */
function prettifySlugLike(s) {
  let x = String(s || '').replace(/[-_]+/g, ' ').trim();
  if (!x) return 'Summer programs';
  for (let i = 0; i < 12; i++) {
    const next = x
      .replace(/([a-z]+)([0-9]+)/gi, '$1 $2')
      .replace(/([0-9]+)([a-z]+)/gi, '$1 $2');
    if (next === x) break;
    x = next;
  }
  return x
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (/^\d+$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
}

const displayHeadline = computed(() => {
  const hero = String(heroTitle.value || '').trim();
  if (hero) return hero;
  const raw = String(pageTitle.value || '').trim();
  const slug = hubSlug.value;
  const slugNorm = slug.replace(/[^a-z0-9]/gi, '');
  const rawNorm = raw.replace(/[^a-z0-9]/gi, '');
  if (!raw || rawNorm === slugNorm) return prettifySlugLike(slug);
  return raw;
});

const listingSubtitle = computed(() => pageMeta.value?.heroSubtitle || '');

const hubBranding = computed(() => pageMeta.value?.branding || {});

const partnerLine = computed(() => String(hubBranding.value.partnerLine || '').trim());

const DEFAULT_PARENT_INTRO =
  'Summer mental health programs run at multiple school locations. When sessions are listed below, use your address to find the site closest to your home.';

const parentIntroResolved = computed(() => {
  const custom = String(hubBranding.value.parentIntro || '').trim();
  return custom || DEFAULT_PARENT_INTRO;
});

/** Optional overrides from branding JSON (nearestCtaLabel, nearestModalTitle, nearestModalHint). */
const nearestCtaLabel = computed(() => String(hubBranding.value.nearestCtaLabel || '').trim());
const nearestModalTitle = computed(() => String(hubBranding.value.nearestModalTitle || '').trim());
const nearestModalHint = computed(() => String(hubBranding.value.nearestModalHint || '').trim());

const primaryNav = computed(() => {
  const raw = hubBranding.value.primaryNav;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => ({
      label: String(x?.label || '').trim(),
      href: String(x?.href || '').trim()
    }))
    .filter((x) => x.label && x.href);
});

const galleryImages = computed(() => {
  const g = hubBranding.value.gallery;
  if (!Array.isArray(g)) return [];
  return g.map((s) => String(s).trim()).filter(Boolean);
});

const logoUrl = computed(() => String(hubBranding.value.logoUrl || '').trim());

/** Brick accent for CTA strip + process band; override with branding.programThemePrimary. */
const programThemeStyle = computed(() => {
  const primary = String(hubBranding.value.programThemePrimary || '#a32623').trim();
  return { '--pmh-program-primary': primary };
});

const DEFAULT_CTA_SECTION = {
  eyebrow: 'Interested in learning more?',
  title: 'Choose your preferred school site',
  subtitle: '',
  body:
    'We believe in making mental healthcare accessible to everyone, especially those who face the most significant barriers. To uphold this commitment, we specifically reserve a portion of our program spots for clients with Medicaid. All other insurance types are grouped together for the remaining available spots. Our approach is designed to balance the need to provide care to those with the least access while serving the broader community within our resource constraints.',
  disclaimer:
    'Participation in these programs is based on eligibility. Completing registration does not guarantee enrollment.',
  primaryLabel: 'Choose your school site',
  primaryHref: '#hub-programs',
  partnerBadgeUrl: '',
  showLimitedBadge: true,
  limitedBadgeText: 'Limited space available!',
  showPartnerPlaceholder: false
};

const DEFAULT_PROCESS_STEPS = [
  'Choose your site and session.',
  'Complete the digital registration form and intake documentation through the portal in advance of your assessment or intake visit.',
  'Receive contact from a staff member to schedule an intake appointment with a licensed clinician; you may also receive a portal invitation.',
  'Participate in assessment/intake with a licensed clinician.',
  'Receive notification of eligibility for enrollment or referrals to outside organizations or community resources.',
  'If selected, complete final registration documents and any additional documentation necessary—either at an in-person sign-up date or by sending completed documents to your point of contact.',
  'Receive confirmation of attendance with final instructions!'
];

const DEFAULT_PROCESS_SECTION = {
  title: 'How do I sign up — what is the process?',
  steps: DEFAULT_PROCESS_STEPS
};

const DEFAULT_WHAT_WE_OFFER_ITEMS = [
  {
    title: 'Strategies to decrease anxiety',
    body:
      'Our staff will work with your child to develop specific skills to reduce barriers to change and decrease symptom severity to improve functioning across the lifespan.',
    imageUrl: ''
  },
  {
    title: 'Developing positive attachments',
    body:
      'We will promote positive attachments, effective caregiver and authority figure interactions, and self confidence through the development and maintenance of appropriate social relationships and attachment styles.',
    imageUrl: ''
  },
  {
    title: 'Comprehensive emotional support',
    body:
      'We are committed to enhancing and promoting therapeutic interventions to address specific needs and create an open environment designed to decrease isolation and withdrawal while promoting healthy coping strategies.',
    imageUrl: ''
  },
  {
    title: 'Skills to improve impulse control',
    body:
      'We design, implement, and practice evidenced-based skill development oriented towards increasing emotion identification and regulation while enhancing strengths and limiting poor interpersonal interactions.',
    imageUrl: ''
  }
];

const DEFAULT_WHAT_WE_OFFER = {
  title: 'What we offer',
  summary:
    'School-based summer mental health programs with therapeutic activities in small, age-appropriate groups—focused on skills, emotional support, and practical strategies for kids and families.',
  intro:
    'The summer programs involve therapeutic activities designed to reduce and resolve the identified barriers in your children’s lives by improving social functioning, promoting skill development and training, and implementing and practicing strategies to reduce symptoms and improve emotion regulation in age appropriate groups of up to 9 participants per group!',
  expandLabel: 'Show more info',
  collapseLabel: 'Show less',
  items: DEFAULT_WHAT_WE_OFFER_ITEMS
};

const whatWeOfferResolved = computed(() => {
  const b = hubBranding.value;
  if (b.whatWeOfferSection === false) return null;
  const o = typeof b.whatWeOfferSection === 'object' && b.whatWeOfferSection ? b.whatWeOfferSection : {};
  const rawItems = Array.isArray(o.items) ? o.items : null;
  let items = DEFAULT_WHAT_WE_OFFER_ITEMS;
  if (rawItems) {
    const mapped = rawItems
      .map((x) => ({
        title: String(x?.title || '').trim(),
        body: String(x?.body || '').trim(),
        imageUrl: String(x?.imageUrl || '').trim()
      }))
      .filter((x) => x.title && x.body);
    if (mapped.length) items = mapped;
  }
  return { ...DEFAULT_WHAT_WE_OFFER, ...o, items };
});

const ctaSectionResolved = computed(() => {
  const b = hubBranding.value;
  if (b.ctaSection === false) return null;
  const o = typeof b.ctaSection === 'object' && b.ctaSection ? b.ctaSection : {};
  return { ...DEFAULT_CTA_SECTION, ...o };
});

const processSectionResolved = computed(() => {
  const b = hubBranding.value;
  if (b.processSection === false) return null;
  const o = typeof b.processSection === 'object' && b.processSection ? b.processSection : {};
  const rawSteps = Array.isArray(o.steps) ? o.steps : null;
  const steps =
    rawSteps && rawSteps.length
      ? rawSteps.map((s) => String(s).trim()).filter(Boolean)
      : DEFAULT_PROCESS_STEPS;
  return { ...DEFAULT_PROCESS_SECTION, ...o, steps };
});

const ctaPrimaryTag = computed(() => {
  if (!ctaSectionResolved.value) return 'a';
  const href = String(ctaSectionResolved.value.primaryHref || '#hub-programs').trim();
  if (
    /^https?:\/\//i.test(href) ||
    href.startsWith('#') ||
    href.startsWith('mailto:') ||
    href.startsWith('tel:')
  ) {
    return 'a';
  }
  return 'router-link';
});

const ctaPrimaryBind = computed(() => {
  if (!ctaSectionResolved.value) return {};
  const href = String(ctaSectionResolved.value.primaryHref || '#hub-programs').trim();
  if (
    /^https?:\/\//i.test(href) ||
    href.startsWith('#') ||
    href.startsWith('mailto:') ||
    href.startsWith('tel:')
  ) {
    return { href };
  }
  return { to: href };
});

function isExternalNavHref(href) {
  const h = String(href || '').trim();
  return /^https?:\/\//i.test(h) || h.startsWith('mailto:') || h.startsWith('tel:');
}

async function loadAll() {
  const slug = hubSlug.value;
  if (!slug) {
    error.value = 'Invalid page.';
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = '';
  metricsBlock.value = null;
  try {
    const [pageRes, evRes, bookRes] = await Promise.all([
      api.get(`/public/marketing-pages/${encodeURIComponent(slug)}`, { skipGlobalLoading: true, skipAuthRedirect: true }),
      api.get(`/public/marketing-pages/${encodeURIComponent(slug)}/events`, { skipGlobalLoading: true, skipAuthRedirect: true }),
      api.get(`/public/marketing-pages/${encodeURIComponent(slug)}/booking-hints`, {
        skipGlobalLoading: true,
        skipAuthRedirect: true
      })
    ]);
    pageMeta.value = pageRes.data?.page || null;
    events.value = Array.isArray(evRes.data?.events) ? evRes.data.events : [];
    bookingHints.value = Array.isArray(bookRes.data?.bookingHints) ? bookRes.data.bookingHints : [];

    if (pageMeta.value?.metricsEnabled) {
      try {
        const mRes = await api.get(`/public/marketing-pages/${encodeURIComponent(slug)}/metrics`, {
          skipGlobalLoading: true,
          skipAuthRedirect: true
        });
        if (mRes.data?.ok && mRes.data?.metrics) {
          metricsBlock.value = { metrics: mRes.data.metrics, disclaimer: mRes.data.disclaimer || '' };
        }
      } catch {
        metricsBlock.value = null;
      }
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load page.';
    pageMeta.value = null;
    events.value = [];
    bookingHints.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(loadAll);
watch(hubSlug, () => {
  offerExpanded.value = false;
  loadAll();
});
</script>

<style scoped>
.pmh-page {
  /* Hub design system — inherited by embedded PublicEventsListing */
  --hub-font-display: 'Plus Jakarta Sans', Inter, system-ui, sans-serif;
  --hub-font-body: Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --hub-text: #111827;
  --hub-text-muted: #4b5563;
  --hub-text-soft: #64748b;
  /* Slate eyebrows — no green/teal */
  --hub-eyebrow: #64748b;
  /* Brick red system only (links, icons, pills) */
  --hub-link: #a32623;
  --hub-link-dark: #7a1f1d;
  --hub-brand: #a32623;
  --hub-surface: #ffffff;
  --hub-border: rgba(15, 23, 42, 0.06);
  --hub-radius-lg: 20px;
  --hub-radius-md: 14px;
  --hub-radius-sm: 10px;
  --hub-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.07), 0 8px 10px -6px rgba(15, 23, 42, 0.045);
  --hub-shadow-brand: 0 14px 36px rgba(163, 38, 35, 0.22);
  --pmh-surface: var(--hub-surface);
  --pmh-text: var(--hub-text);
  --pmh-muted: var(--hub-text-muted);
  --pmh-accent: var(--hub-brand);
  --pmh-shadow-soft: var(--hub-shadow);
  --pmh-radius-lg: var(--hub-radius-lg);
  min-height: 100vh;
  min-height: 100dvh;
  font-family: var(--hub-font-body);
  color: var(--hub-text);
  position: relative;
  padding-bottom: env(safe-area-inset-bottom, 0);
  isolation: isolate;
  background:
    radial-gradient(110% 55% at 50% -8%, rgba(163, 38, 35, 0.06) 0%, transparent 52%),
    radial-gradient(70% 45% at 95% 12%, rgba(120, 113, 108, 0.05) 0%, transparent 48%),
    linear-gradient(180deg, #f6f4f2 0%, #f3f1ef 45%, #eeebe8 100%);
}

.pmh-page::after {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  opacity: 0.35;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='72' height='72' viewBox='0 0 72 72'%3E%3Ccircle fill='%2394a3b8' fill-opacity='0.09' cx='1.5' cy='1.5' r='1'/%3E%3C/svg%3E");
}

.pmh-ambient {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
}

.pmh-blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(56px);
  opacity: 0.55;
}

.pmh-blob--a {
  width: min(100vw, 420px);
  height: min(100vw, 420px);
  top: -120px;
  right: -80px;
  background: radial-gradient(circle at 30% 30%, rgba(163, 38, 35, 0.2), rgba(163, 38, 35, 0.04));
}

.pmh-blob--b {
  width: min(90vw, 320px);
  height: min(90vw, 320px);
  top: 40%;
  left: -100px;
  background: radial-gradient(circle at 50% 50%, rgba(180, 83, 9, 0.1), transparent);
}

.pmh-blob--c {
  width: 240px;
  height: 240px;
  bottom: 10%;
  right: -40px;
  background: radial-gradient(circle at 50% 50%, rgba(120, 53, 45, 0.14), transparent);
}

.pmh-admin-pill {
  position: fixed;
  top: max(12px, env(safe-area-inset-top, 12px));
  right: max(12px, env(safe-area-inset-right, 12px));
  z-index: 50;
  display: inline-flex;
  align-items: center;
  padding: 10px 16px;
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  color: #fff;
  background: linear-gradient(135deg, #b03a37 0%, #7a1f1d 100%);
  border-radius: 999px;
  text-decoration: none;
  box-shadow: 0 8px 28px rgba(122, 31, 29, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.2);
}
.pmh-admin-pill:active {
  transform: scale(0.98);
}

.pmh-shell {
  position: relative;
  z-index: 1;
  max-width: 42rem;
  margin: 0 auto;
  padding-bottom: 8px;
}

.pmh-header {
  padding: max(16px, env(safe-area-inset-top, 16px)) 18px 0;
}

.pmh-logo-row {
  display: flex;
  justify-content: center;
  margin-bottom: 14px;
}

.pmh-logo {
  max-height: 56px;
  max-width: min(100%, 280px);
  width: auto;
  height: auto;
  object-fit: contain;
}

.pmh-partner {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  margin: 0 0 16px;
  padding: 8px 14px;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-family: var(--hub-font-display);
  color: var(--hub-link-dark);
  text-align: center;
  line-height: 1.35;
  background: var(--hub-surface);
  border: 1px solid rgba(163, 38, 35, 0.2);
  border-radius: 999px;
  box-shadow: var(--hub-shadow);
  backdrop-filter: blur(10px);
}

.pmh-partner-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: linear-gradient(135deg, #c43532, #a32623);
  box-shadow: 0 0 0 3px rgba(163, 38, 35, 0.22);
  flex-shrink: 0;
}

.pmh-hero-media {
  margin: 0 0 16px;
  border-radius: var(--hub-radius-lg);
  overflow: hidden;
  box-shadow: var(--hub-shadow);
  border: 1px solid var(--hub-border);
}

.pmh-hero-media img {
  width: 100%;
  max-height: min(52vh, 340px);
  object-fit: cover;
  display: block;
}

.pmh-intro-card {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  padding: 18px 20px;
  margin-bottom: 4px;
  background: var(--hub-surface);
  border: 1px solid var(--hub-border);
  border-radius: var(--hub-radius-lg);
  box-shadow: var(--hub-shadow);
  backdrop-filter: blur(12px);
}

.pmh-intro-icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--hub-radius-sm);
  color: var(--hub-brand);
  background: linear-gradient(145deg, rgba(163, 38, 35, 0.12), rgba(163, 38, 35, 0.04));
  border: 1px solid rgba(163, 38, 35, 0.22);
}

.pmh-intro-icon svg {
  display: block;
}

.pmh-intro-text {
  margin: 0;
  font-size: 0.9375rem;
  line-height: 1.6;
  color: var(--hub-text-muted);
  font-weight: 500;
}

.pmh-fatal {
  padding: 48px 20px;
  text-align: center;
  color: #991b1b;
  background: #fef2f2;
  font-size: 1rem;
  line-height: 1.5;
}

.pmh-nav {
  padding: 10px 18px 14px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: center;
}

.pmh-nav-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 0 18px;
  font-size: 0.9375rem;
  font-weight: 700;
  font-family: var(--hub-font-display);
  color: var(--hub-link-dark);
  background: var(--hub-surface);
  border: 1px solid rgba(163, 38, 35, 0.22);
  border-radius: var(--hub-radius-md);
  text-decoration: none;
  box-shadow: var(--hub-shadow);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.pmh-nav-link:hover {
  background: #fff;
  box-shadow: 0 12px 28px rgba(163, 38, 35, 0.12);
  transform: translateY(-1px);
}

.pmh-gallery {
  padding: 4px 16px 12px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
}

.pmh-gallery-img {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: var(--hub-radius-sm);
  display: block;
  border: 1px solid var(--hub-border);
}

.pmh-offer {
  margin: 16px 16px 0;
}

.pmh-offer-card {
  padding: 22px 20px 20px;
  background: var(--hub-surface);
  border: 1px solid var(--hub-border);
  border-radius: var(--hub-radius-lg);
  box-shadow: var(--hub-shadow);
}

.pmh-offer-title {
  margin: 0 0 12px;
  font-size: 1.35rem;
  font-weight: 800;
  font-family: var(--hub-font-display);
  letter-spacing: -0.03em;
  color: var(--hub-text);
  line-height: 1.2;
}

.pmh-offer-summary {
  margin: 0 0 16px;
  font-size: 0.9375rem;
  line-height: 1.6;
  color: var(--hub-text-muted);
}

.pmh-offer-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0 18px;
  font-size: 0.9375rem;
  font-weight: 700;
  font-family: var(--hub-font-display);
  color: var(--hub-link);
  background: transparent;
  border: 1px solid rgba(163, 38, 35, 0.35);
  border-radius: var(--hub-radius-md);
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.pmh-offer-toggle:hover {
  background: rgba(163, 38, 35, 0.06);
  border-color: rgba(163, 38, 35, 0.5);
}

.pmh-offer-toggle:focus-visible {
  outline: 2px solid rgba(163, 38, 35, 0.45);
  outline-offset: 2px;
}

.pmh-offer-details {
  margin-top: 20px;
  padding-top: 4px;
  border-top: 1px solid var(--hub-border);
}

.pmh-offer-intro {
  margin: 16px 0 22px;
  font-size: 0.875rem;
  line-height: 1.65;
  color: var(--hub-text-muted);
}

.pmh-offer-grid {
  display: grid;
  gap: 22px;
  grid-template-columns: 1fr;
}

@media (min-width: 520px) {
  .pmh-offer-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 900px) {
  .pmh-offer-grid {
    grid-template-columns: repeat(4, 1fr);
    gap: 18px;
  }
}

.pmh-offer-item {
  margin: 0;
}

.pmh-offer-media {
  margin-bottom: 12px;
  border-radius: var(--hub-radius-sm);
  overflow: hidden;
  border: 1px solid rgba(15, 23, 42, 0.85);
}

.pmh-offer-img {
  width: 100%;
  aspect-ratio: 3 / 4;
  object-fit: cover;
  display: block;
}

.pmh-offer-img-ph {
  width: 100%;
  aspect-ratio: 3 / 4;
  background: linear-gradient(160deg, #f4f0ee 0%, #ebe5e2 45%, #e2d9d6 100%);
}

.pmh-offer-item-title {
  margin: 0 0 8px;
  font-size: 0.9375rem;
  font-weight: 800;
  font-family: var(--hub-font-display);
  letter-spacing: -0.02em;
  color: var(--hub-text);
  line-height: 1.3;
}

.pmh-offer-item-body {
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.55;
  color: var(--hub-text-muted);
}

.pmh-offer-reveal-enter-active,
.pmh-offer-reveal-leave-active {
  transition: opacity 0.22s ease;
}

.pmh-offer-reveal-enter-from,
.pmh-offer-reveal-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .pmh-offer-reveal-enter-active,
  .pmh-offer-reveal-leave-active {
    transition: none;
  }
}

.pmh-programs-anchor {
  scroll-margin-top: 1rem;
  margin-top: 8px;
  padding: 8px 0 0;
}

.pmh-cta-band {
  margin: 16px 16px 0;
  padding: 22px 20px 24px;
  text-align: center;
  background: var(--hub-surface);
  border: 1px solid var(--hub-border);
  border-radius: var(--hub-radius-lg);
  border-top: 4px solid var(--pmh-program-primary, var(--hub-brand));
  box-shadow: var(--hub-shadow);
}

.pmh-cta-eyebrow {
  margin: 0 0 8px;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-family: var(--hub-font-display);
  color: var(--hub-eyebrow);
}

.pmh-cta-title {
  margin: 0 0 12px;
  font-size: 1.25rem;
  font-weight: 800;
  font-family: var(--hub-font-display);
  letter-spacing: -0.02em;
  color: var(--hub-text);
  line-height: 1.25;
}

.pmh-cta-subtitle {
  margin: -4px 0 12px;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--hub-text-muted);
}

.pmh-cta-body {
  margin: 0 0 14px;
  font-size: 0.875rem;
  line-height: 1.65;
  color: var(--hub-text-muted);
  text-align: left;
}

.pmh-cta-disclaimer {
  margin: 0 0 20px;
  font-size: 0.8125rem;
  font-weight: 700;
  line-height: 1.5;
  color: var(--pmh-program-primary, var(--hub-brand));
  text-align: left;
}

.pmh-cta-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 16px 20px;
}

.pmh-cta-badge-img-wrap {
  flex: 0 0 auto;
  max-width: 200px;
}

.pmh-cta-badge-img {
  width: 100%;
  height: auto;
  display: block;
  border-radius: 8px;
  border: 1px solid rgba(15, 23, 42, 0.1);
  background: #f1f5f9;
}

.pmh-cta-partner-ph {
  flex: 0 1 180px;
  padding: 10px 12px;
  text-align: left;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  border-radius: 10px;
}

.pmh-cta-partner-ph-line {
  display: block;
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #334155;
}

.pmh-cta-partner-ph-sub {
  display: block;
  margin-top: 6px;
  font-size: 0.6875rem;
  line-height: 1.4;
  color: #94a3b8;
}

.pmh-cta-btn-wrap {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 14px;
}

.pmh-cta-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 52px;
  padding: 0 28px;
  font-size: 1rem;
  font-weight: 800;
  font-family: var(--hub-font-display);
  letter-spacing: -0.01em;
  color: #fff;
  text-decoration: none;
  background: var(--pmh-program-primary, var(--hub-brand));
  border: none;
  border-radius: var(--hub-radius-md);
  box-shadow: var(--hub-shadow-brand);
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.pmh-cta-primary:hover {
  box-shadow: 0 16px 40px rgba(163, 38, 35, 0.32);
  transform: translateY(-1px);
}

.pmh-cta-seal {
  width: 5.25rem;
  height: 5.25rem;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  text-align: center;
  background: linear-gradient(145deg, #fbbf24 0%, #d97706 100%);
  clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%);
  transform: rotate(8deg);
  filter: drop-shadow(0 4px 8px rgba(180, 83, 9, 0.35));
}

.pmh-cta-seal-text {
  display: block;
  max-width: 7em;
  font-size: 0.5625rem;
  font-weight: 900;
  line-height: 1.25;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #1c1917;
  transform: rotate(-8deg);
}

.pmh-process {
  margin: 16px 16px 0;
  padding: 24px 20px 28px;
  color: #fff;
  background: var(--pmh-program-primary, var(--hub-brand));
  border-radius: var(--hub-radius-lg);
  box-shadow: var(--hub-shadow-brand);
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.pmh-process-inner {
  display: grid;
  gap: 20px;
  align-items: start;
}

@media (min-width: 768px) {
  .pmh-process-inner {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.35fr);
    gap: 28px;
  }
}

.pmh-process-head {
  position: relative;
}

.pmh-process-title {
  margin: 0;
  font-size: clamp(1.125rem, 3.5vw, 1.35rem);
  font-weight: 900;
  font-family: var(--hub-font-display);
  line-height: 1.2;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: #fff;
}

.pmh-process-rule {
  margin-top: 14px;
  height: 2px;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.85) 0%, rgba(255, 255, 255, 0.2) 100%);
  border-radius: 2px;
  position: relative;
}

.pmh-process-rule::after {
  content: '';
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 0;
  height: 0;
  border-top: 6px solid transparent;
  border-bottom: 6px solid transparent;
  border-left: 10px solid rgba(255, 255, 255, 0.85);
}

@media (min-width: 768px) {
  .pmh-process-rule {
    margin-top: 18px;
  }
}

.pmh-process-steps {
  margin: 0;
  padding: 0;
  list-style: none;
  counter-reset: pmh-step;
}

.pmh-process-step {
  display: grid;
  gap: 4px;
  padding: 12px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.18);
}

.pmh-process-step:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.pmh-process-n {
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(254, 243, 199, 0.95);
}

.pmh-process-t {
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.55;
  color: #fff;
}

.pmh-section {
  background: var(--hub-surface);
  color: var(--hub-text);
  border: 1px solid var(--hub-border);
  border-radius: var(--hub-radius-lg);
  box-shadow: var(--hub-shadow);
  padding: 24px 20px 28px;
  margin: 16px 16px 0;
}

.pmh-section-inner {
  max-width: 40rem;
  margin: 0 auto;
}

.pmh-h2 {
  margin: 0 0 12px;
  font-size: 1.125rem;
  font-weight: 800;
  font-family: var(--hub-font-display);
  color: var(--hub-text);
  letter-spacing: -0.02em;
}

.pmh-muted {
  margin: 0 0 12px;
  color: var(--hub-text-muted);
  font-size: 0.875rem;
  line-height: 1.55;
}

.pmh-muted code {
  font-size: 0.8em;
  background: #f1f5f9;
  padding: 2px 6px;
  border-radius: 4px;
  color: var(--hub-text);
}

.pmh-disclaimer {
  font-size: 0.8125rem;
  opacity: 0.95;
}

.pmh-booking-list {
  margin: 0;
  padding-left: 1.2rem;
  color: var(--hub-text-muted);
}

.pmh-link {
  color: var(--hub-link);
  font-weight: 700;
}

.pmh-metrics-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  margin: 0;
}

.pmh-metric {
  background: #f8fafc;
  border: 1px solid var(--hub-border);
  border-radius: var(--hub-radius-sm);
  padding: 12px 14px;
}

.pmh-metric dt {
  margin: 0;
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--hub-text-soft);
}

.pmh-metric dd {
  margin: 6px 0 0;
  font-size: 1.25rem;
  font-weight: 800;
  font-family: var(--hub-font-display);
  color: var(--hub-text);
}

@media (min-width: 640px) {
  .pmh-shell {
    max-width: 48rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pmh-nav-link:hover {
    transform: none;
  }
}
</style>
