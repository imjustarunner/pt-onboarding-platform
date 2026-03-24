<template>
  <div class="pel-root" :style="rootFontStyle">
    <header class="pel-hero">
      <div class="pel-hero-inner">
        <p v-if="showMasthead" class="pel-eyebrow">Official registration</p>
        <div v-if="headerLogoUrl" class="pel-logo-wrap">
          <img class="pel-logo" :src="headerLogoUrl" :alt="headerLogoAlt" loading="eager" />
        </div>
        <h1 class="pel-title">{{ pageTitle }}</h1>
        <p v-if="pageSubtitle" class="pel-subtitle">{{ pageSubtitle }}</p>
        <div v-if="showMasthead" class="pel-hero-rule" aria-hidden="true" />
      </div>
    </header>

    <div v-if="loading" class="pel-loading">Loading…</div>
    <div v-else-if="error" class="pel-error">{{ error }}</div>
    <template v-else>
      <section v-if="showDrivingDistanceCta && canUseNearest" class="pel-drive-cta-wrap">
        <button type="button" class="pel-btn pel-btn-drive" :disabled="nearestLoading" @click="openDriveModal">
          Calculate closest driving distance to your home
        </button>
        <p v-if="originSummary" class="pel-drive-summary">
          Sorted by driving distance from <strong>{{ originSummary }}</strong>.
          <button type="button" class="pel-linkish" @click="clearNearest">Use date order</button>
        </p>
      </section>

      <Teleport to="body">
        <div
          v-if="driveModalOpen"
          class="pel-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pel-drive-modal-title"
          @click.self="closeDriveModal"
        >
          <div class="pel-modal">
            <div class="pel-modal-head">
              <h2 id="pel-drive-modal-title" class="pel-modal-title">Driving distance from your home</h2>
              <button type="button" class="pel-modal-close" aria-label="Close" @click="closeDriveModal">×</button>
            </div>
            <p class="pel-modal-hint">
              Enter your home address. We use Google Maps <strong>driving</strong> routes to each in-person venue
              (event address and session locations) and sort events by shortest drive.
            </p>
            <div class="pel-modal-row">
              <input
                v-model="addressInput"
                class="pel-input"
                type="text"
                inputmode="text"
                autocomplete="street-address"
                placeholder="Street, city, state ZIP"
                aria-label="Your home address"
                @keydown.enter.prevent="runNearest"
              />
            </div>
            <div class="pel-modal-actions">
              <button type="button" class="pel-btn pel-btn-secondary" @click="closeDriveModal">Cancel</button>
              <button type="button" class="pel-btn pel-btn-primary" :disabled="nearestLoading" @click="runNearest">
                {{ nearestLoading ? 'Calculating…' : 'Calculate' }}
              </button>
            </div>
            <p v-if="nearestError" class="pel-finder-err">{{ nearestError }}</p>
          </div>
        </div>
      </Teleport>

      <div class="pel-events">
        <TransitionGroup name="pel-card" tag="ul" class="pel-list">
          <li v-for="(ev, idx) in displayEvents" :key="ev.id" class="pel-item" :style="{ '--stagger': idx }">
            <article class="pel-card">
              <div v-if="ev.publicHeroImageUrl" class="pel-media">
                <img :src="ev.publicHeroImageUrl" :alt="''" loading="lazy" />
              </div>
              <div class="pel-card-body">
                <div class="pel-card-head">
                  <h2 class="pel-card-title">{{ ev.title }}</h2>
                  <span class="pel-badge pel-badge-ready">Open for registration</span>
                </div>
                <p v-if="showHubSourceChips && hubPartnerLabels(ev).length" class="pel-hub-partners">
                  <span v-for="(label, hi) in hubPartnerLabels(ev)" :key="`hp-${ev.id}-${hi}`" class="pel-chip">{{
                    label
                  }}</span>
                </p>
                <p class="pel-when">{{ formatWhen(ev) }}</p>
                <p v-if="ageRangeLabel(ev)" class="pel-age-range">{{ ageRangeLabel(ev) }}</p>
                <p v-if="ev.description" class="pel-desc">{{ ev.description }}</p>
                <p v-if="ev.publicListingDetails" class="pel-extra">{{ ev.publicListingDetails }}</p>
                <div
                  v-if="ev.inPersonPublic && ev.publicLocationAddress"
                  class="pel-venue"
                >
                  <strong>In person</strong>
                  <p class="pel-address">{{ ev.publicLocationAddress }}</p>
                  <a
                    class="pel-maps-link"
                    :href="googleMapsSearchUrl(ev.publicLocationAddress)"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open in Maps
                  </a>
                </div>
                <ul v-if="sessionAddresses(ev).length" class="pel-session-locs">
                  <li v-for="(row, i) in sessionAddresses(ev)" :key="`sl-${ev.id}-${i}`">
                    <span v-if="row.label" class="pel-sess-label">{{ row.label }}</span>
                    <span class="pel-address">{{ row.address }}</span>
                    <a
                      class="pel-maps-link"
                      :href="googleMapsSearchUrl(row.address)"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Maps
                    </a>
                  </li>
                </ul>
                <p
                  v-if="drivingDistanceDisplay(ev) != null"
                  class="pel-distance"
                >
                  ~{{ formatDistanceMi(drivingDistanceDisplay(ev)) }} mi drive
                  <span v-if="ev.drivingDurationText" class="muted"> · {{ ev.drivingDurationText }}</span>
                  <span v-if="ev.nearestVenueLabel" class="muted"> · {{ ev.nearestVenueLabel }}</span>
                </p>
                <div
                  v-if="sanitizedSplash(ev)"
                  class="pel-splash"
                  v-html="sanitizedSplash(ev)"
                />
                <div class="pel-actions">
                  <a class="pel-btn pel-btn-primary" :href="registrationUrl(ev.registrationPublicKey)">
                    Register
                  </a>
                </div>
              </div>
            </article>
          </li>
        </TransitionGroup>
        <div v-if="!displayEvents.length" class="pel-empty-card" role="status">
          <div class="pel-empty-icon" aria-hidden="true">📅</div>
          <h2 class="pel-empty-title">No open programs right now</h2>
          <p class="pel-empty-copy">
            We are not accepting new sign-ups on this page at the moment. New sessions are added here as soon as they open.
          </p>
          <p class="pel-empty-hint muted">
            Check back soon, or return to the main site for other ways to reach us.
          </p>
          <RouterLink v-if="footerHomeSlug" class="pel-btn pel-btn-primary pel-empty-cta" :to="homePath">
            Back to portal home
          </RouterLink>
        </div>
      </div>
    </template>

    <footer v-if="showMasthead" class="pel-footer">
      <div class="pel-footer-inner">
        <RouterLink v-if="footerHomeSlug" class="pel-footer-link" :to="homePath">Portal home</RouterLink>
        <span v-if="footerHomeSlug" class="pel-footer-dot" aria-hidden="true">·</span>
        <span class="pel-footer-note">Secure registration powered by your provider</span>
      </div>
    </footer>
  </div>
</template>

<script setup>
import DOMPurify from 'dompurify';
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { buildPublicIntakeUrl } from '../../utils/publicIntakeUrl';
import api from '../../services/api';
import { useBrandingStore } from '../../store/branding';

const props = defineProps({
  pageTitle: { type: String, default: 'Upcoming events' },
  pageSubtitle: { type: String, default: '' },
  events: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  /** Parent agency slug for POST …/agency/:slug/events/nearest (open-events / agency-first URLs). */
  nearestAgencySlug: { type: String, default: '' },
  /** When true, use portal program nearest (merged listing) instead of agency-wide nearest. */
  usePortalProgramNearest: { type: Boolean, default: false },
  portalProgramPortalSlug: { type: String, default: '' },
  portalProgramProgramSlug: { type: String, default: '' },
  /** Public marketing hub slug for POST `/public/marketing-pages/:slug/events/nearest`. */
  hubSlug: { type: String, default: '' },
  /** Show partner agency chips when events include `hubSourcePartners` (marketing hub). */
  showHubSourceChips: { type: Boolean, default: false },
  /** When set, show logo masthead + footer with link to `/{slug}`. */
  footerHomeSlug: { type: String, default: '' },
  /** Show “Official registration” masthead + footer (agency-branded public pages). */
  showPublicShell: { type: Boolean, default: false }
});

const brandingStore = useBrandingStore();

const showMasthead = computed(() => props.showPublicShell === true);

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

const footerHomeSlug = computed(() => String(props.footerHomeSlug || '').trim());
const homePath = computed(() => `/${footerHomeSlug.value}`);

const addressInput = ref('');
const nearestLoading = ref(false);
const nearestError = ref('');
const originSummary = ref('');
const rankedEvents = ref(null);
const driveModalOpen = ref(false);

const displayEvents = computed(() =>
  Array.isArray(rankedEvents.value) ? rankedEvents.value : props.events
);

const nearestAgencySlug = computed(() => String(props.nearestAgencySlug || '').trim().toLowerCase());
const hubSlugNorm = computed(() => String(props.hubSlug || '').trim().toLowerCase());

const canUseNearest = computed(() => {
  if (hubSlugNorm.value) return true;
  if (props.usePortalProgramNearest) {
    return !!(String(props.portalProgramPortalSlug || '').trim() && String(props.portalProgramProgramSlug || '').trim());
  }
  return !!nearestAgencySlug.value;
});

const showDrivingDistanceCta = computed(
  () =>
    canUseNearest.value &&
    (props.events || []).some((ev) => {
      if (!ev?.inPersonPublic) return false;
      if (ev.publicLocationLat != null && ev.publicLocationLng != null) return true;
      const sessions = Array.isArray(ev.sessionLocations) ? ev.sessionLocations : [];
      return sessions.some((s) => String(s?.address || '').trim());
    })
);

watch(
  () => props.events,
  () => {
    rankedEvents.value = null;
    nearestError.value = '';
    originSummary.value = '';
  }
);

function openDriveModal() {
  nearestError.value = '';
  driveModalOpen.value = true;
}

function closeDriveModal() {
  if (nearestLoading.value) return;
  driveModalOpen.value = false;
}

function formatWhen(ev) {
  const a = new Date(ev?.startsAt || 0);
  const b = new Date(ev?.endsAt || 0);
  if (!Number.isFinite(a.getTime())) return '';
  const opt = { dateStyle: 'medium', timeStyle: 'short' };
  try {
    const endPart = Number.isFinite(b.getTime()) ? b.toLocaleString(undefined, opt) : '';
    return `${a.toLocaleString(undefined, opt)}${endPart ? ` – ${endPart}` : ''} (${ev.timezone || 'UTC'})`;
  } catch {
    return '';
  }
}

function hubPartnerLabels(ev) {
  if (!props.showHubSourceChips) return [];
  const raw = ev?.hubSourcePartners;
  if (!Array.isArray(raw) || !raw.length) return [];
  const names = raw
    .map((p) => String(p?.sourceAgencyName || '').trim())
    .filter(Boolean);
  return [...new Set(names)];
}

function ageRangeLabel(ev) {
  const min = ev?.publicAgeMin != null ? Number(ev.publicAgeMin) : null;
  const max = ev?.publicAgeMax != null ? Number(ev.publicAgeMax) : null;
  const minOk = Number.isFinite(min) && min >= 0;
  const maxOk = Number.isFinite(max) && max >= 0;
  if (!minOk && !maxOk) return 'Ages: any';
  if (minOk && maxOk) return `Ages: ${min}–${max}`;
  if (minOk) return `Ages: ${min}+`;
  return `Ages: up to ${max}`;
}

function drivingDistanceDisplay(ev) {
  const d = ev?.drivingDistanceMeters ?? ev?.distanceMeters;
  return d != null && Number.isFinite(Number(d)) ? Number(d) : null;
}

function registrationUrl(publicKey) {
  return buildPublicIntakeUrl(publicKey);
}

function googleMapsSearchUrl(address) {
  const q = encodeURIComponent(String(address || '').trim());
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

function sanitizedSplash(ev) {
  const raw = ev?.splashContent;
  if (!raw || !String(raw).trim()) return '';
  return DOMPurify.sanitize(String(raw), {
    USE_PROFILES: { html: true }
  });
}

function sessionAddresses(ev) {
  const sessions = Array.isArray(ev?.sessionLocations) ? ev.sessionLocations : [];
  return sessions.filter((s) => String(s?.address || '').trim());
}

function formatDistanceMi(meters) {
  const mi = Number(meters) / 1609.34;
  if (!Number.isFinite(mi)) return '—';
  return mi < 10 ? mi.toFixed(1) : String(Math.round(mi));
}

async function runNearest() {
  const addr = String(addressInput.value || '').trim();
  if (!addr) {
    nearestError.value = 'Enter your address.';
    return;
  }
  let url;
  if (hubSlugNorm.value) {
    url = `/public/marketing-pages/${encodeURIComponent(hubSlugNorm.value)}/events/nearest`;
  } else if (props.usePortalProgramNearest) {
    const p = String(props.portalProgramPortalSlug || '').trim();
    const pr = String(props.portalProgramProgramSlug || '').trim();
    if (!p || !pr) return;
    url = `/public/skill-builders/portal/${encodeURIComponent(p)}/programs/${encodeURIComponent(pr)}/events/nearest`;
  } else {
    const slug = nearestAgencySlug.value;
    if (!slug) return;
    url = `/public/skill-builders/agency/${encodeURIComponent(slug)}/events/nearest`;
  }
  nearestLoading.value = true;
  nearestError.value = '';
  try {
    const res = await api.post(url, { address: addr }, { skipGlobalLoading: true });
    rankedEvents.value = Array.isArray(res.data?.events) ? res.data.events : [];
    originSummary.value = String(res.data?.origin?.formattedAddress || addr).trim();
    driveModalOpen.value = false;
  } catch (e) {
    rankedEvents.value = null;
    nearestError.value = e.response?.data?.error?.message || e.message || 'Could not calculate driving distances.';
  } finally {
    nearestLoading.value = false;
  }
}

function clearNearest() {
  rankedEvents.value = null;
  originSummary.value = '';
  nearestError.value = '';
}
</script>

<style scoped>
.pel-root {
  --pel-p: var(--agency-primary-color, #312e81);
  --pel-s: var(--agency-secondary-color, #0f172a);
  --pel-a: var(--agency-accent-color, #6366f1);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(165deg, var(--pel-p) 0%, var(--pel-s) 52%, #070b14 100%);
  color: #e2e8f0;
}

.pel-hero {
  padding: clamp(24px, 5vw, 40px) 16px clamp(18px, 4vw, 28px);
  text-align: center;
  position: relative;
  overflow: hidden;
}

.pel-hero::before {
  content: '';
  position: absolute;
  inset: -50% -30% auto;
  height: 140%;
  background: radial-gradient(
    ellipse at 50% 0%,
    color-mix(in srgb, var(--pel-a) 38%, transparent),
    transparent 58%
  );
  pointer-events: none;
  animation: pel-shimmer 10s ease-in-out infinite alternate;
}

@supports not (background: color-mix(in srgb, red, red)) {
  .pel-hero::before {
    background: radial-gradient(ellipse at 50% 0%, rgba(129, 140, 248, 0.38), transparent 58%);
  }
}

.pel-eyebrow {
  margin: 0 0 14px;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.72);
}

.pel-logo-wrap {
  margin: 0 auto 18px;
  max-width: min(220px, 72vw);
}

.pel-logo {
  display: block;
  max-height: clamp(52px, 14vw, 88px);
  width: auto;
  max-width: 100%;
  margin: 0 auto;
  object-fit: contain;
  filter: drop-shadow(0 12px 28px rgba(0, 0, 0, 0.35));
}

.pel-hero-rule {
  width: min(200px, 50%);
  height: 3px;
  margin: 22px auto 0;
  border-radius: 999px;
  background: linear-gradient(90deg, transparent, var(--pel-a), transparent);
  opacity: 0.85;
}

@keyframes pel-shimmer {
  from {
    opacity: 0.65;
  }
  to {
    opacity: 1;
  }
}

.pel-hero-inner {
  position: relative;
  max-width: 40rem;
  margin: 0 auto;
}

.pel-title {
  margin: 0 0 10px;
  font-size: clamp(1.5rem, 5vw, 2rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  color: #fff;
  line-height: 1.15;
}

.pel-subtitle {
  margin: 0;
  font-size: clamp(0.95rem, 3vw, 1.05rem);
  line-height: 1.5;
  color: #c7d2fe;
}

.pel-hub-partners {
  margin: 0 0 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pel-chip {
  display: inline-block;
  font-size: 0.75rem;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(99, 102, 241, 0.35);
  color: #e0e7ff;
  border: 1px solid rgba(165, 180, 252, 0.4);
}

.pel-loading,
.pel-error {
  max-width: min(48rem, 100%);
  margin: 0 auto;
  padding: 24px 16px 48px;
  text-align: center;
}

.pel-error {
  color: #fecaca;
}

.pel-empty-card {
  max-width: min(36rem, 100%);
  margin: 0 auto;
  padding: clamp(28px, 5vw, 40px) clamp(20px, 4vw, 28px);
  text-align: center;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(199, 210, 254, 0.2);
  border-radius: 20px;
  backdrop-filter: blur(10px);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
}

.pel-empty-icon {
  font-size: 2.25rem;
  line-height: 1;
  margin-bottom: 12px;
  filter: grayscale(0.2);
}

.pel-empty-title {
  margin: 0 0 10px;
  font-size: 1.25rem;
  font-weight: 800;
  color: #fff;
  letter-spacing: -0.02em;
}

.pel-empty-copy {
  margin: 0 0 10px;
  font-size: 0.95rem;
  line-height: 1.55;
  color: #cbd5e1;
}

.pel-empty-hint {
  margin: 0 0 20px;
  font-size: 0.88rem;
  line-height: 1.5;
}

.pel-empty-cta {
  text-decoration: none;
}

.pel-drive-cta-wrap {
  max-width: min(48rem, 100%);
  margin: 0 auto;
  padding: 0 16px 20px;
  text-align: center;
}

.pel-drive-summary {
  margin: 14px 0 0;
  font-size: 0.88rem;
  color: #c7d2fe;
  line-height: 1.5;
}

.pel-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10050;
  background: rgba(15, 23, 42, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px 16px;
  backdrop-filter: blur(6px);
}

.pel-modal {
  width: 100%;
  max-width: 26rem;
  background: linear-gradient(165deg, #1e293b 0%, #0f172a 100%);
  border: 1px solid rgba(199, 210, 254, 0.28);
  border-radius: 18px;
  padding: 20px 20px 22px;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.45);
}

.pel-modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.pel-modal-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 800;
  color: #fff;
  line-height: 1.25;
}

.pel-modal-close {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.1);
  color: #e2e8f0;
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
}

.pel-modal-close:hover {
  background: rgba(255, 255, 255, 0.16);
}

.pel-modal-hint {
  margin: 0 0 14px;
  font-size: 0.86rem;
  line-height: 1.5;
  color: #a5b4fc;
}

.pel-modal-row {
  margin-bottom: 14px;
}

.pel-modal-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}

.pel-input {
  width: 100%;
  min-height: 48px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: rgba(255, 255, 255, 0.96);
  color: #0f172a;
  font-size: 16px;
  box-sizing: border-box;
}

.pel-input:focus {
  outline: 2px solid #818cf8;
  outline-offset: 0;
}

.pel-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 12px 20px;
  border-radius: 12px;
  font-weight: 700;
  font-size: 1rem;
  text-decoration: none;
  border: none;
  cursor: pointer;
  transition:
    transform 0.15s ease,
    box-shadow 0.2s ease;
}

.pel-btn-drive {
  width: 100%;
  max-width: 100%;
  background: linear-gradient(135deg, var(--pel-a, #6366f1) 0%, var(--pel-p, #4f46e5) 100%);
  color: #fff;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}

.pel-btn-drive:hover:not(:disabled) {
  transform: translateY(-1px);
}

.pel-btn-drive:disabled {
  opacity: 0.65;
  cursor: wait;
}

.pel-btn-primary {
  background: linear-gradient(135deg, var(--pel-a, #6366f1) 0%, var(--pel-p, #4f46e5) 100%);
  color: #fff;
}

.pel-btn-secondary {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.25);
  white-space: nowrap;
}

.pel-btn-secondary:disabled,
.pel-btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pel-finder-err {
  margin: 12px 0 0;
  font-size: 0.88rem;
  color: #fecaca;
}

.pel-linkish {
  margin-left: 6px;
  padding: 0;
  border: none;
  background: none;
  color: #fff;
  text-decoration: underline;
  font-size: inherit;
  cursor: pointer;
}

.pel-events {
  flex: 1;
  max-width: min(48rem, 100%);
  margin: 0 auto;
  padding: 0 16px clamp(32px, 8vw, 56px);
  width: 100%;
}

.pel-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.pel-item {
  margin-bottom: 18px;
  animation: pel-rise 0.5s ease backwards;
  animation-delay: calc(var(--stagger, 0) * 0.05s);
}

@keyframes pel-rise {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.pel-card {
  background: rgba(15, 23, 42, 0.55);
  border: 1px solid rgba(199, 210, 254, 0.22);
  border-radius: 18px;
  overflow: hidden;
  backdrop-filter: blur(8px);
}

.pel-media img {
  display: block;
  width: 100%;
  max-height: 200px;
  object-fit: cover;
}

.pel-card-body {
  padding: 16px 16px 18px;
}

.pel-card-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}

.pel-card-title {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 800;
  color: #fff;
  line-height: 1.25;
  flex: 1;
  min-width: 0;
}

.pel-badge {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 5px 10px;
  border-radius: 999px;
}

.pel-badge-ready {
  background: rgba(52, 211, 153, 0.2);
  color: #6ee7b7;
  border: 1px solid rgba(52, 211, 153, 0.35);
}

.pel-when {
  margin: 0 0 6px;
  font-size: 0.92rem;
  color: #c7d2fe;
}

.pel-age-range {
  margin: 0 0 8px;
  font-size: 0.88rem;
  font-weight: 600;
  color: #e9d5ff;
}

.pel-desc,
.pel-extra {
  margin: 0 0 10px;
  font-size: 0.9rem;
  line-height: 1.55;
  color: #cbd5e1;
}

.pel-venue {
  margin: 10px 0;
  padding: 12px;
  border-radius: 12px;
  background: rgba(30, 41, 59, 0.65);
  border: 1px solid rgba(148, 163, 184, 0.2);
}

.pel-venue strong {
  display: block;
  margin-bottom: 6px;
  color: #f1f5f9;
}

.pel-address {
  margin: 0 0 8px;
  font-size: 0.88rem;
  color: #e2e8f0;
}

.pel-maps-link {
  font-size: 0.85rem;
  font-weight: 600;
  color: #a5b4fc;
}

.pel-session-locs {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
}

.pel-session-locs li {
  margin-bottom: 8px;
  font-size: 0.86rem;
  color: #cbd5e1;
}

.pel-sess-label {
  display: block;
  font-weight: 600;
  color: #e2e8f0;
  margin-bottom: 2px;
}

.pel-distance {
  margin: 10px 0 0;
  font-size: 0.9rem;
  font-weight: 600;
  color: #fde68a;
}

.pel-splash {
  margin-top: 12px;
  font-size: 0.88rem;
  line-height: 1.5;
  color: #cbd5e1;
}

.pel-actions {
  margin-top: 16px;
}

.muted {
  color: #94a3b8;
  font-weight: 500;
}

.pel-footer {
  margin-top: auto;
  padding: 20px 16px 28px;
  border-top: 1px solid rgba(148, 163, 184, 0.12);
  background: linear-gradient(180deg, transparent, rgba(0, 0, 0, 0.2));
}

.pel-footer-inner {
  max-width: min(48rem, 100%);
  margin: 0 auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px 12px;
  font-size: 0.8rem;
  color: #94a3b8;
}

.pel-footer-link {
  color: #c7d2fe;
  font-weight: 600;
  text-decoration: none;
}

.pel-footer-link:hover {
  text-decoration: underline;
}

.pel-footer-dot {
  opacity: 0.5;
}

.pel-footer-note {
  opacity: 0.9;
}
</style>
