<template>
  <div
    class="pel-root"
    :class="{
      'pel-root--hub': !!hubSlugNorm,
      'pel-root--hub-suppress-title': suppressPageTitle && !!hubSlugNorm
    }"
    :style="rootFontStyle"
  >
    <header v-if="!hidePelHeader" class="pel-hero">
      <div class="pel-hero-inner">
        <p v-if="showMasthead" class="pel-eyebrow">Official registration</p>
        <div v-if="headerLogoUrl" class="pel-logo-wrap">
          <img class="pel-logo" :src="headerLogoUrl" :alt="headerLogoAlt" loading="eager" />
        </div>
        <h1 v-if="showHubTitle" class="pel-title">{{ pageTitle }}</h1>
        <p v-if="pageSubtitle" class="pel-subtitle">{{ pageSubtitle }}</p>
        <div v-if="showMasthead" class="pel-hero-rule" aria-hidden="true" />
      </div>
    </header>

    <div
      v-if="enrollCrossLinkHref && enrollCrossLinkLabel"
      class="pel-cross-link pel-cross-link--below-hero"
    >
      <RouterLink class="pel-cross-link-a" :to="enrollCrossLinkHref">{{ enrollCrossLinkLabel }}</RouterLink>
    </div>

    <div v-if="loading" class="pel-loading">Loading…</div>
    <div v-else-if="error" class="pel-error">{{ error }}</div>
    <template v-else>
      <div class="pel-events">
        <section v-if="showDrivingDistanceCta && canUseNearest" class="pel-nearest-inline pel-nearest-inline--above-list">
          <div class="pel-nearest-inner">
            <div class="pel-nearest-icon" aria-hidden="true">📍</div>
            <h2 class="pel-nearest-heading">Enter your address to see which event is closest to your home</h2>
            <p class="pel-nearest-sub muted">{{ nearestInlineSubtext }}</p>
            <div class="pel-nearest-controls">
              <input
                ref="nearestInputEl"
                v-model="addressInput"
                class="pel-input"
                type="text"
                inputmode="text"
                autocomplete="street-address"
                placeholder="Street, city, state ZIP"
                aria-label="Your home address"
                @keydown.enter.prevent="runNearest"
              />
              <button type="button" class="pel-btn pel-btn-primary" :disabled="nearestLoading" @click="runNearest">
                {{ nearestLoading ? 'Calculating…' : 'Find' }}
              </button>
            </div>
            <p v-if="originSummary" class="pel-drive-summary pel-drive-summary--inline">
              Sorted by driving distance from <strong>{{ originSummary }}</strong>.
              <button type="button" class="pel-linkish" @click="clearNearest">Use date order</button>
            </p>
            <p v-if="nearestError" class="pel-finder-err">{{ nearestError }}</p>
          </div>
        </section>

        <div
          v-if="hubSlugNorm && (hubAgencyFilterId != null || sessionLabelFilter || distinctHubPartners.length > 1)"
          class="pel-hub-filter-bar"
        >
          <p v-if="distinctHubPartners.length > 1" class="pel-hub-filter-lead muted">
            Tap an agency logo to see only that agency&rsquo;s locations.
          </p>
          <div v-if="distinctHubPartners.length > 1" class="pel-hub-logo-row">
            <button
              v-for="p in distinctHubPartners"
              :key="`hpf-${p.sourceAgencyId}`"
              type="button"
              class="pel-agency-logo-btn pel-agency-logo-btn--bar"
              :class="{ 'pel-agency-logo-btn--active': hubAgencyFilterId === p.sourceAgencyId }"
              :aria-label="`Filter events to ${p.sourceAgencyName} only`"
              @click="toggleAgencyFilter(p.sourceAgencyId)"
            >
              <span class="pel-agency-logo-tip">{{ agencyFilterTipBar(p) }}</span>
              <img
                v-if="p.sourceAgencyLogoUrl"
                :src="p.sourceAgencyLogoUrl"
                :alt="`${p.sourceAgencyName} logo`"
                loading="lazy"
              />
              <span v-else class="pel-agency-fallback">{{ agencyInitials(p.sourceAgencyName) }}</span>
            </button>
          </div>
          <div v-if="hubAgencyFilterId != null || sessionLabelFilter" class="pel-filter-active-row">
            <span v-if="hubAgencyFilterId != null" class="pel-filter-pill">
              Agency filter on
              <button type="button" class="pel-linkish" @click="clearAgencyFilter">Show all agencies</button>
            </span>
            <span v-if="sessionLabelFilter" class="pel-filter-pill">
              {{ sessionLabelFilter }}
              <button type="button" class="pel-linkish" @click="clearSessionFilter">Clear session filter</button>
            </span>
          </div>
        </div>

        <TransitionGroup name="pel-card" tag="ul" class="pel-list">
          <li v-for="(ev, idx) in displayEvents" :key="ev.id" class="pel-item" :style="{ '--stagger': idx }">
            <article class="pel-card">
              <div v-if="showHubSourceChips && hubPartnerEntries(ev).length" class="pel-card-agency-logos">
                <button
                  v-for="(p, pi) in hubPartnerEntries(ev)"
                  :key="`pl-${ev.id}-${pi}`"
                  type="button"
                  class="pel-agency-logo-btn"
                  :class="{ 'pel-agency-logo-btn--active': hubAgencyFilterId === p.sourceAgencyId }"
                  :aria-label="`Filter events to ${p.sourceAgencyName} only`"
                  @click="toggleAgencyFilter(p.sourceAgencyId)"
                >
                  <span class="pel-agency-logo-tip">{{ agencyFilterTipCard(p) }}</span>
                  <img
                    v-if="p.sourceAgencyLogoUrl"
                    :src="p.sourceAgencyLogoUrl"
                    :alt="`${p.sourceAgencyName} logo`"
                    loading="lazy"
                  />
                  <span v-else class="pel-agency-fallback">{{ agencyInitials(p.sourceAgencyName) }}</span>
                </button>
              </div>

              <div class="pel-card-condensed">
                <a
                  v-if="ev.publicHeroImageUrl && primaryMapsQuery(ev)"
                  :href="googleMapsSearchUrl(primaryMapsQuery(ev))"
                  class="pel-thumb-maps"
                  target="_blank"
                  rel="noopener noreferrer"
                  :aria-label="`Open ${locationDisplayName(ev)} in Maps`"
                >
                  <img :src="ev.publicHeroImageUrl" :alt="locationDisplayName(ev)" loading="lazy" />
                </a>
                <div v-else-if="ev.publicHeroImageUrl" class="pel-thumb-maps pel-thumb-maps--static">
                  <img :src="ev.publicHeroImageUrl" :alt="locationDisplayName(ev)" loading="lazy" />
                </div>
                <div class="pel-condensed-main">
                  <div class="pel-condensed-line">
                    <span class="pel-loc-name">{{ locationDisplayName(ev) }}</span>
                    <template v-if="drivingDistanceDisplay(ev) != null">
                      <span class="pel-loc-sep" aria-hidden="true"> — </span>
                      <span class="pel-loc-dist">{{ formatDistanceMi(drivingDistanceDisplay(ev)) }} miles</span>
                    </template>
                    <a
                      class="pel-btn pel-btn-primary pel-btn-register-inline"
                      :href="registrationUrl(ev.registrationPublicKey)"
                    >
                      Register now
                    </a>
                  </div>
                  <p v-if="ev.publicSessionLabel || ev.publicSessionDateRange" class="pel-session-public">
                    <strong v-if="ev.publicSessionLabel">{{ ev.publicSessionLabel }}</strong>
                    <span v-if="ev.publicSessionDateRange" class="muted">
                      <template v-if="ev.publicSessionLabel"> · </template>{{ ev.publicSessionDateRange }}
                    </span>
                    <button
                      v-if="ev.publicSessionLabel"
                      type="button"
                      class="pel-sess-filter-btn"
                      @click="setSessionFilter(ev.publicSessionLabel)"
                    >
                      Show all {{ ev.publicSessionLabel }} locations
                    </button>
                  </p>
                </div>
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
                  <a
                    class="pel-address pel-address-link"
                    :href="googleMapsSearchUrl(ev.publicLocationAddress)"
                    target="_blank"
                    rel="noopener noreferrer"
                  >{{ ev.publicLocationAddress }}</a>
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
                    <a
                      class="pel-address pel-address-link"
                      :href="googleMapsSearchUrl(row.address)"
                      target="_blank"
                      rel="noopener noreferrer"
                    >{{ row.address }}</a>
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
              </div>
            </article>
          </li>
        </TransitionGroup>
        <div v-if="!displayEvents.length" class="pel-empty-card" :class="{ 'pel-empty-card--hub': !!hubSlugNorm }" role="status">
          <template v-if="hubSlugNorm">
            <div class="pel-empty-visual pel-empty-visual--hub" aria-hidden="true" />
            <p class="pel-empty-eyebrow">Coming up</p>
            <h2 class="pel-empty-title">Programs will appear here</h2>
            <p class="pel-empty-copy">
              When summer sessions open for each school location, you&rsquo;ll see them listed below — with dates, locations, and
              registration. Use the <strong>address search</strong> above to sort by driving distance from your home once events
              are posted.
            </p>
            <p class="pel-empty-hint muted">
              Bookmark this page and check back. Questions? Use the links your district or provider shared.
            </p>
          </template>
          <template v-else>
            <div class="pel-empty-icon" aria-hidden="true">📅</div>
            <h2 class="pel-empty-title">No open programs right now</h2>
            <p class="pel-empty-copy">
              We are not accepting new sign-ups on this page at the moment. New sessions are added here as soon as they open.
            </p>
            <p class="pel-empty-hint muted">
              Check back soon, or return to the main site for other ways to reach us.
            </p>
          </template>
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
import { computed, nextTick, ref, watch } from 'vue';
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
  /** When true with hubSlug, hide the duplicate page title (hub shell shows its own h1). */
  suppressPageTitle: { type: Boolean, default: false },
  /** When set, show logo masthead + footer with link to `/{slug}`. */
  footerHomeSlug: { type: String, default: '' },
  /** Show “Official registration” masthead + footer (agency-branded public pages). */
  showPublicShell: { type: Boolean, default: false },
  /** Override main “find nearest” button label (e.g. public marketing hub parent copy). */
  nearestCtaLabel: { type: String, default: '' },
  /** Override modal title for nearest / driving distance. */
  nearestModalTitle: { type: String, default: '' },
  /** Override modal body (plain text; line breaks preserved). */
  nearestModalHint: { type: String, default: '' },
  /** Parent can pre-select a public session label (e.g., Session 1). */
  presetSessionLabel: { type: String, default: '' },
  /** Parent can pre-filter by school/location text. */
  presetLocationQuery: { type: String, default: '' },
  /** Hide the top hero (logo/title) — e.g. when embedded under a parent enroll page. */
  hidePelHeader: { type: Boolean, default: false },
  /** Optional link to program enroll hub (shown on events-only pages). */
  enrollCrossLinkHref: { type: String, default: '' },
  enrollCrossLinkLabel: { type: String, default: '' }
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
const nearestInputEl = ref(null);
/** Hub only: filter listing to one source agency (logo click). */
const hubAgencyFilterId = ref(null);
/** Filter events sharing the same public session label. */
const sessionLabelFilter = ref('');

const baseEventList = computed(() =>
  Array.isArray(rankedEvents.value) ? rankedEvents.value : props.events || []
);

const displayEvents = computed(() => {
  let list = [...(baseEventList.value || [])];
  const aid = hubAgencyFilterId.value;
  if (aid != null && Number(aid) > 0) {
    list = list.filter((ev) =>
      (Array.isArray(ev.hubSourcePartners) ? ev.hubSourcePartners : []).some(
        (p) => Number(p.sourceAgencyId) === Number(aid)
      )
    );
  }
  const sl = String(sessionLabelFilter.value || '').trim();
  if (sl) {
    list = list.filter((ev) => String(ev.publicSessionLabel || '').trim() === sl);
  }
  const locQuery = String(props.presetLocationQuery || '').trim().toLowerCase();
  if (locQuery) {
    list = list.filter((ev) => {
      const fields = [
        ev?.publicLocationAddress,
        ev?.nearestVenueLabel,
        ev?.title,
        ...(Array.isArray(ev?.sessionLocations) ? ev.sessionLocations.map((s) => `${s?.label || ''} ${s?.address || ''}`) : [])
      ];
      return fields.some((v) => String(v || '').toLowerCase().includes(locQuery));
    });
  }
  return list;
});

const nearestAgencySlug = computed(() => String(props.nearestAgencySlug || '').trim().toLowerCase());
const hubSlugNorm = computed(() => String(props.hubSlug || '').trim().toLowerCase());

const distinctHubPartners = computed(() => {
  if (!hubSlugNorm.value) return [];
  const map = new Map();
  for (const ev of props.events || []) {
    for (const p of hubPartnerEntries(ev)) {
      const id = Number(p.sourceAgencyId);
      if (!id) continue;
      if (!map.has(id)) map.set(id, { ...p, sourceAgencyId: id });
    }
  }
  return [...map.values()].sort((a, b) =>
    String(a.sourceAgencyName || '').localeCompare(String(b.sourceAgencyName || ''), undefined, {
      sensitivity: 'base'
    })
  );
});

const showHubTitle = computed(
  () => !(props.suppressPageTitle === true && !!hubSlugNorm.value) && String(props.pageTitle || '').trim()
);

const nearestInlineSubtext = computed(() => {
  const o = String(props.nearestModalHint || '').trim();
  if (o) return o.split('\n')[0].replace(/<[^>]+>/g, '').trim().slice(0, 220);
  if (hubSlugNorm.value) {
    return 'We use Google Maps driving routes to sort programs by shortest drive to each listed school or venue.';
  }
  return 'We use Google Maps driving routes to each in-person venue and sort events by shortest drive.';
});

const canUseNearest = computed(() => {
  if (hubSlugNorm.value) return true;
  if (props.usePortalProgramNearest) {
    return !!(String(props.portalProgramPortalSlug || '').trim() && String(props.portalProgramProgramSlug || '').trim());
  }
  return !!nearestAgencySlug.value;
});

const showDrivingDistanceCta = computed(() => {
  if (!canUseNearest.value) return false;
  // Marketing hub: always show address search (backend geocodes text addresses; useful when only one event or coords not saved yet)
  if (hubSlugNorm.value) return true;
  return (props.events || []).some((ev) => {
    if (!ev?.inPersonPublic) return false;
    if (ev.publicLocationLat != null && ev.publicLocationLng != null) return true;
    if (String(ev.publicLocationAddress || '').trim()) return true;
    const sessions = Array.isArray(ev.sessionLocations) ? ev.sessionLocations : [];
    return sessions.some((s) => String(s?.address || '').trim());
  });
});

watch(
  () => props.events,
  () => {
    rankedEvents.value = null;
    nearestError.value = '';
    originSummary.value = '';
    hubAgencyFilterId.value = null;
    sessionLabelFilter.value = '';
  }
);

watch(
  () => String(props.presetSessionLabel || '').trim(),
  (next) => {
    sessionLabelFilter.value = next;
  },
  { immediate: true }
);

function hubPartnerEntries(ev) {
  const raw = ev?.hubSourcePartners;
  if (!Array.isArray(raw) || !raw.length) return [];
  return raw;
}

function toggleAgencyFilter(id) {
  const n = Number(id);
  if (!Number.isFinite(n) || n <= 0) return;
  hubAgencyFilterId.value = hubAgencyFilterId.value === n ? null : n;
}

function clearAgencyFilter() {
  hubAgencyFilterId.value = null;
}

function setSessionFilter(label) {
  sessionLabelFilter.value = String(label || '').trim();
}

function clearSessionFilter() {
  sessionLabelFilter.value = '';
}

function agencyInitials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function agencyFilterTipBar(p) {
  const n = String(p?.sourceAgencyName || '').trim() || 'this agency';
  return `Show events from ${n}`;
}

function agencyFilterTipCard(p) {
  const n = String(p?.sourceAgencyName || '').trim() || 'this agency';
  return `Show only ${n}`;
}

function primaryMapsQuery(ev) {
  if (ev?.inPersonPublic && ev?.publicLocationAddress) return String(ev.publicLocationAddress).trim();
  const sessions = sessionAddresses(ev);
  if (sessions[0]?.address) return String(sessions[0].address).trim();
  return '';
}

function locationDisplayName(ev) {
  if (ev?.nearestVenueLabel && drivingDistanceDisplay(ev) != null) {
    return String(ev.nearestVenueLabel).trim();
  }
  const addr = String(ev?.publicLocationAddress || '').trim();
  if (addr) {
    const first = addr.split(',')[0].trim();
    if (first) return first;
  }
  const sessions = sessionAddresses(ev);
  if (sessions[0]?.label) return String(sessions[0].label).trim();
  if (sessions[0]?.address) {
    const f = String(sessions[0].address).split(',')[0].trim();
    if (f) return f;
  }
  return String(ev?.title || 'Program').trim();
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

async function focusNearestInput() {
  await nextTick();
  const el = nearestInputEl.value;
  if (el && typeof el.focus === 'function') el.focus();
}

defineExpose({ focusNearestInput });
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

.pel-empty-card--hub {
  position: relative;
  overflow: hidden;
}

.pel-empty-visual--hub {
  width: 100%;
  max-width: 200px;
  aspect-ratio: 1;
  margin: 0 auto 16px;
  border-radius: 50%;
  background:
    radial-gradient(circle at 30% 30%, rgba(163, 38, 35, 0.18) 0%, transparent 55%),
    radial-gradient(circle at 70% 60%, rgba(180, 83, 9, 0.12) 0%, transparent 50%),
    linear-gradient(145deg, #faf6f4 0%, #fef8f7 100%);
  border: 1px solid rgba(148, 163, 184, 0.22);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
}

.pel-empty-eyebrow {
  margin: 0 0 8px;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #64748b;
  text-align: center;
}

.pel-empty-card--hub .pel-empty-title {
  font-family: 'Plus Jakarta Sans', Inter, system-ui, sans-serif;
  font-weight: 800;
  letter-spacing: -0.03em;
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

.pel-root--hub .pel-input:focus {
  outline: 2px solid rgba(163, 38, 35, 0.45);
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

.pel-cross-link {
  max-width: 920px;
  margin: 0 auto 16px;
  padding: 0 20px;
  text-align: center;
}
.pel-cross-link--below-hero {
  margin-top: -4px;
}
.pel-cross-link-a {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--primary, #15803d);
  text-decoration: underline;
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

/* Public marketing hub: inherits --hub-* tokens from PublicMarketingHubView .pmh-page */
.pel-root--hub {
  min-height: auto;
  background: transparent;
  color: var(--hub-text, #111827);
  font-family: var(--hub-font-display, 'Plus Jakarta Sans', Inter, system-ui, sans-serif);
}

.pel-root--hub .pel-hero {
  padding: clamp(8px, 2vw, 16px) 16px clamp(12px, 3vw, 20px);
}

.pel-root--hub-suppress-title .pel-hero {
  padding-top: clamp(4px, 1vw, 10px);
  padding-bottom: clamp(8px, 2vw, 14px);
}

.pel-root--hub .pel-hero::before {
  display: none;
}

.pel-root--hub .pel-title {
  font-family: var(--hub-font-display, 'Plus Jakarta Sans', Inter, system-ui, sans-serif);
  font-weight: 800;
  letter-spacing: -0.045em;
  font-size: clamp(1.6rem, 5.8vw, 2.05rem);
  line-height: 1.12;
  color: var(--hub-text, #111827);
}

.pel-root--hub .pel-subtitle {
  color: var(--hub-text-muted, #4b5563);
  line-height: 1.55;
  font-family: var(--hub-font-body, Inter, system-ui, sans-serif);
  font-weight: 500;
}

.pel-root--hub .pel-logo {
  filter: none;
}

.pel-root--hub .pel-loading {
  color: var(--hub-text-soft, #64748b);
}

.pel-root--hub .pel-error {
  color: #b91c1c;
}

.pel-root--hub .pel-drive-summary {
  color: var(--hub-text-muted, #4b5563);
}

.pel-root--hub .pel-chip {
  background: rgba(163, 38, 35, 0.09);
  color: var(--hub-link-dark, #7a1f1d);
  border: 1px solid rgba(163, 38, 35, 0.22);
  font-family: var(--hub-font-body, Inter, sans-serif);
}

.pel-root--hub .pel-card {
  background: var(--hub-surface, #fff);
  border: 1px solid var(--hub-border, rgba(15, 23, 42, 0.06));
  border-radius: var(--hub-radius-lg, 20px);
  box-shadow: var(--hub-shadow, 0 10px 25px -5px rgba(15, 23, 42, 0.07));
  backdrop-filter: none;
  overflow: visible;
}

.pel-root--hub .pel-card-title {
  color: var(--hub-text, #111827);
  font-family: var(--hub-font-display, 'Plus Jakarta Sans', Inter, sans-serif);
}

.pel-root--hub .pel-badge-ready {
  background: rgba(163, 38, 35, 0.1);
  color: var(--hub-link-dark, #7a1f1d);
  border: 1px solid rgba(163, 38, 35, 0.28);
}

.pel-root--hub .pel-when {
  color: var(--hub-text-muted, #4b5563);
  font-family: var(--hub-font-body, Inter, sans-serif);
}

.pel-root--hub .pel-age-range {
  color: var(--hub-link-dark, #7a1f1d);
}

.pel-root--hub .pel-desc,
.pel-root--hub .pel-extra {
  color: var(--hub-text-muted, #4b5563);
}

.pel-root--hub .pel-venue {
  background: #f8fafc;
  border-color: var(--hub-border, rgba(15, 23, 42, 0.06));
  border-radius: var(--hub-radius-md, 14px);
}

.pel-root--hub .pel-venue strong {
  color: var(--hub-text, #111827);
}

.pel-root--hub .pel-address {
  color: #334155;
}

.pel-root--hub .pel-maps-link {
  color: var(--hub-link, #a32623);
}

.pel-root--hub .pel-session-locs li {
  color: var(--hub-text-muted, #4b5563);
}

.pel-root--hub .pel-sess-label {
  color: var(--hub-text, #111827);
}

.pel-root--hub .pel-distance {
  color: var(--hub-link-dark, #7a1f1d);
}

.pel-root--hub .pel-splash {
  color: var(--hub-text-muted, #4b5563);
}

.pel-root--hub .muted {
  color: var(--hub-text-soft, #64748b);
}

.pel-root--hub .pel-empty-card {
  background: var(--hub-surface, #fff);
  border: 1px solid var(--hub-border, rgba(15, 23, 42, 0.06));
  color: var(--hub-text-muted, #4b5563);
  border-radius: var(--hub-radius-lg, 20px);
  box-shadow: var(--hub-shadow, 0 10px 25px -5px rgba(15, 23, 42, 0.07));
  padding: clamp(32px, 6vw, 44px) clamp(22px, 5vw, 32px);
}

.pel-root--hub .pel-empty-title {
  font-family: var(--hub-font-display, 'Plus Jakarta Sans', Inter, system-ui, sans-serif);
  font-size: clamp(1.3rem, 4.2vw, 1.55rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--hub-text, #111827);
}

.pel-root--hub .pel-empty-copy {
  font-size: 0.9375rem;
  line-height: 1.55;
  color: var(--hub-text-muted, #4b5563);
  font-family: var(--hub-font-body, Inter, sans-serif);
}

.pel-root--hub .pel-empty-copy strong {
  color: var(--hub-text, #111827);
  font-weight: 700;
}

.pel-root--hub .pel-empty-hint {
  color: var(--hub-text-soft, #64748b);
  font-family: var(--hub-font-body, Inter, sans-serif);
}

.pel-root--hub .pel-empty-eyebrow {
  color: var(--hub-eyebrow, #64748b);
  letter-spacing: 0.14em;
  font-family: var(--hub-font-display, 'Plus Jakarta Sans', Inter, sans-serif);
}

.pel-root--hub .pel-empty-visual--hub {
  max-width: 200px;
  aspect-ratio: 1;
  margin: 0 auto 20px;
  border-radius: 50%;
  background:
    radial-gradient(circle at 28% 28%, rgba(163, 38, 35, 0.16) 0%, transparent 52%),
    radial-gradient(circle at 72% 38%, rgba(180, 83, 9, 0.11) 0%, transparent 52%),
    radial-gradient(circle at 48% 72%, rgba(127, 29, 29, 0.09) 0%, transparent 48%),
    linear-gradient(155deg, #faf6f4 0%, #fef3f2 42%, #f5f0ee 100%);
  border: 1px solid rgba(148, 163, 184, 0.2);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.9),
    var(--hub-shadow, 0 8px 24px rgba(15, 23, 42, 0.06));
}

.pel-root--hub .pel-btn-drive {
  border-radius: var(--hub-radius-md, 14px);
  background: linear-gradient(135deg, var(--hub-brand, #a32623) 0%, var(--hub-link-dark, #7a1f1d) 100%);
  color: #fff;
  font-family: var(--hub-font-display, 'Plus Jakarta Sans', Inter, sans-serif);
  box-shadow: 0 10px 25px -5px rgba(122, 31, 29, 0.32), 0 8px 10px -6px rgba(122, 31, 29, 0.18);
}

.pel-root--hub .pel-btn-drive:hover:not(:disabled) {
  filter: brightness(1.03);
}

.pel-root--hub .pel-btn-primary {
  border-radius: var(--hub-radius-md, 14px);
  background: linear-gradient(135deg, var(--hub-brand, #a32623) 0%, var(--hub-link-dark, #7a1f1d) 100%);
  color: #fff;
  font-family: var(--hub-font-display, 'Plus Jakarta Sans', Inter, sans-serif);
  box-shadow: 0 8px 22px rgba(122, 31, 29, 0.28);
}

.pel-root--hub .pel-btn-primary:hover:not(:disabled) {
  filter: brightness(1.03);
}

.pel-root--hub .pel-modal-backdrop {
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(10px);
}

.pel-root--hub .pel-modal {
  background: var(--hub-surface, #fff);
  border: 1px solid var(--hub-border, rgba(15, 23, 42, 0.08));
  border-radius: var(--hub-radius-lg, 20px);
  box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.16);
}

.pel-root--hub .pel-modal-title {
  color: var(--hub-text, #111827);
  font-family: var(--hub-font-display, 'Plus Jakarta Sans', Inter, sans-serif);
}

.pel-root--hub .pel-modal-hint {
  color: var(--hub-text-muted, #4b5563);
  font-family: var(--hub-font-body, Inter, sans-serif);
}

.pel-root--hub .pel-modal-hint :deep(strong) {
  color: var(--hub-text, #111827);
}

.pel-root--hub .pel-modal-close {
  background: #f1f5f9;
  color: #475569;
  border-radius: var(--hub-radius-sm, 10px);
}

.pel-root--hub .pel-modal-close:hover {
  background: #e2e8f0;
}

.pel-root--hub .pel-finder-err {
  color: #b91c1c;
}

.pel-root--hub .pel-linkish {
  color: var(--hub-link, #a32623);
}

.pel-root--hub .pel-btn-secondary {
  background: #f1f5f9;
  color: #334155;
  border: 1px solid rgba(15, 23, 42, 0.1);
  border-radius: var(--hub-radius-sm, 10px);
  font-family: var(--hub-font-display, 'Plus Jakarta Sans', Inter, sans-serif);
}

.pel-root--hub .pel-btn-secondary:hover:not(:disabled) {
  background: #e2e8f0;
}

/* Inline address search (above event list on hub) */
.pel-nearest-inline {
  max-width: min(40rem, 100%);
  margin: 0 auto;
  padding: 0 16px clamp(28px, 6vw, 48px);
  width: 100%;
}

.pel-nearest-inline--above-list {
  padding-top: 0;
  padding-bottom: clamp(12px, 3vw, 20px);
  margin-bottom: clamp(8px, 2vw, 16px);
}

.pel-nearest-inner {
  text-align: center;
  padding: clamp(20px, 4vw, 28px) clamp(18px, 3vw, 24px);
  border-radius: 20px;
  background: rgba(15, 23, 42, 0.55);
  border: 1px solid rgba(199, 210, 254, 0.22);
  backdrop-filter: blur(8px);
}

.pel-nearest-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  margin: 0 auto 12px;
  border-radius: 14px;
  background: rgba(244, 114, 182, 0.15);
  font-size: 1.35rem;
}

.pel-nearest-heading {
  margin: 0 0 10px;
  font-size: clamp(1.05rem, 3.2vw, 1.2rem);
  font-weight: 800;
  line-height: 1.35;
  color: #fff;
}

.pel-nearest-sub {
  margin: 0 0 16px;
  font-size: 0.88rem;
  line-height: 1.5;
  max-width: 32rem;
  margin-left: auto;
  margin-right: auto;
}

.pel-nearest-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
  align-items: stretch;
}

.pel-nearest-controls .pel-input {
  flex: 1 1 220px;
  min-width: 0;
}

.pel-nearest-controls .pel-btn {
  flex: 0 0 auto;
  min-width: 120px;
}

.pel-drive-summary--inline {
  margin-top: 14px;
}

.pel-hub-filter-bar {
  margin-bottom: 18px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.35);
  border: 1px solid rgba(199, 210, 254, 0.15);
  overflow: visible;
}

.pel-hub-filter-lead {
  margin: 0 0 10px;
  font-size: 0.82rem;
  text-align: center;
}

.pel-hub-logo-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
  margin-bottom: 8px;
  overflow: visible;
}

.pel-filter-active-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: center;
  font-size: 0.85rem;
  color: #c7d2fe;
}

.pel-filter-pill {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.pel-card-agency-logos {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 12px 0;
  justify-content: flex-end;
  overflow: visible;
  position: relative;
  z-index: 2;
}

.pel-agency-logo-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.08);
  cursor: pointer;
  overflow: visible;
  flex-shrink: 0;
  transition:
    border-color 0.15s ease,
    transform 0.15s ease;
}

.pel-agency-logo-tip {
  position: absolute;
  z-index: 40;
  left: 50%;
  bottom: calc(100% + 10px);
  transform: translate3d(-50%, 6px, 0);
  padding: 7px 12px;
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1.35;
  letter-spacing: 0.02em;
  text-align: center;
  color: #f8fafc;
  white-space: normal;
  max-width: min(220px, 72vw);
  hyphens: auto;
  background: linear-gradient(155deg, #334155 0%, #0f172a 100%);
  border-radius: 10px;
  box-shadow:
    0 10px 28px rgba(15, 23, 42, 0.38),
    0 0 0 1px rgba(255, 255, 255, 0.1);
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition:
    opacity 0.07s ease-out,
    transform 0.07s ease-out,
    visibility 0s linear 0.08s;
}

.pel-agency-logo-tip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  margin-left: -7px;
  border: 7px solid transparent;
  border-top-color: #0f172a;
}

.pel-agency-logo-btn:hover .pel-agency-logo-tip,
.pel-agency-logo-btn:focus-visible .pel-agency-logo-tip {
  opacity: 1;
  visibility: visible;
  transform: translate3d(-50%, 0, 0);
  transition:
    opacity 0.06s ease-out,
    transform 0.06s ease-out,
    visibility 0s;
}

@media (prefers-reduced-motion: reduce) {
  .pel-agency-logo-tip,
  .pel-agency-logo-btn:hover .pel-agency-logo-tip,
  .pel-agency-logo-btn:focus-visible .pel-agency-logo-tip {
    transition: none;
  }
}

.pel-agency-logo-btn:hover {
  transform: translateY(-1px);
  border-color: rgba(165, 180, 252, 0.5);
}

.pel-agency-logo-btn--active {
  border-color: #a5b4fc;
  box-shadow: 0 0 0 2px rgba(129, 140, 248, 0.35);
}

.pel-agency-logo-btn img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.pel-agency-logo-btn--bar {
  width: 48px;
  height: 48px;
}

.pel-agency-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 0.7rem;
  font-weight: 800;
  color: #e2e8f0;
}

.pel-card-condensed {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(199, 210, 254, 0.12);
}

.pel-thumb-maps {
  flex-shrink: 0;
  width: 88px;
  height: 88px;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid rgba(199, 210, 254, 0.25);
  align-self: center;
}

.pel-thumb-maps img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.pel-thumb-maps--static {
  pointer-events: none;
}

.pel-condensed-main {
  flex: 1;
  min-width: 0;
  text-align: left;
}

.pel-condensed-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}

.pel-loc-name {
  font-weight: 800;
  font-size: 1rem;
  color: #fff;
}

.pel-loc-dist {
  font-weight: 700;
  color: #c7d2fe;
  font-size: 0.95rem;
}

.pel-btn-register-inline {
  margin-left: auto;
  min-height: 40px;
  padding: 8px 16px;
  font-size: 0.9rem;
  border-radius: 10px;
}

.pel-session-public {
  margin: 10px 0 0;
  font-size: 0.86rem;
  line-height: 1.45;
  color: #e2e8f0;
}

.pel-sess-filter-btn {
  display: block;
  margin-top: 6px;
  padding: 0;
  border: none;
  background: none;
  color: #a5b4fc;
  font-size: 0.82rem;
  font-weight: 600;
  text-decoration: underline;
  cursor: pointer;
}

.pel-address-link {
  color: inherit;
  text-decoration: underline;
  display: inline;
}

.pel-address-link:hover {
  color: #a5b4fc;
}

/* Hub light theme */
.pel-root--hub .pel-nearest-inner {
  background: var(--hub-surface, #fff);
  border: 1px solid var(--hub-border, rgba(15, 23, 42, 0.08));
  box-shadow: var(--hub-shadow, 0 10px 25px -5px rgba(15, 23, 42, 0.07));
}

.pel-root--hub .pel-nearest-heading {
  color: var(--hub-text, #111827);
  font-family: var(--hub-font-display, 'Plus Jakarta Sans', Inter, sans-serif);
}

.pel-root--hub .pel-nearest-sub {
  color: var(--hub-text-muted, #4b5563);
}

.pel-root--hub .pel-hub-filter-bar {
  background: var(--hub-surface-muted, #fafafa);
  border-color: var(--hub-border, rgba(15, 23, 42, 0.06));
}

.pel-root--hub .pel-filter-active-row {
  color: var(--hub-text-muted, #4b5563);
}

.pel-root--hub .pel-loc-name {
  color: var(--hub-text, #111827);
}

.pel-root--hub .pel-loc-dist {
  color: var(--hub-text-muted, #4b5563);
}

.pel-root--hub .pel-session-public {
  color: var(--hub-text, #111827);
}

.pel-root--hub .pel-card-condensed {
  border-bottom-color: var(--hub-border, rgba(15, 23, 42, 0.06));
}

.pel-root--hub .pel-agency-logo-btn {
  background: #f8fafc;
  border: 1px solid rgba(15, 23, 42, 0.08);
}

.pel-root--hub .pel-agency-fallback {
  color: var(--hub-text-muted, #64748b);
}
</style>
