<template>
  <main class="event-page" :style="cssVars">
    <!-- Loading / Error -->
    <div v-if="loading" class="event-centered">
      <div class="event-spinner"></div>
      <p class="muted">Loading event…</p>
    </div>
    <div v-else-if="error" class="event-centered">
      <p class="event-error">{{ error }}</p>
    </div>

    <template v-else-if="event">
      <!-- Hero image -->
      <div v-if="heroImage" class="event-hero" :style="{ backgroundImage: `url(${displayAsset(heroImage)})` }">
        <div class="event-hero-overlay">
          <img v-if="branding.logoUrl" :src="displayAsset(branding.logoUrl)" alt="Logo" class="hero-logo" />
        </div>
      </div>
      <!-- No hero: show branded header bar -->
      <header v-else class="event-header-bar">
        <img v-if="branding.logoUrl" :src="displayAsset(branding.logoUrl)" alt="Logo" class="header-logo" />
        <span class="header-agency">{{ branding.agencyName }}</span>
      </header>

      <div class="event-body">
        <!-- Already-RSVPd banner -->
        <div v-if="rsvpResponse" class="rsvp-banner" :class="`rsvp-banner--${rsvpResponse}`">
          <div class="rsvp-banner-icon">{{ rsvpResponse === 'yes' ? '🎉' : rsvpResponse === 'maybe' ? '🤔' : '😔' }}</div>
          <div>
            <strong class="rsvp-banner-title">{{ rsvpBannerTitle }}</strong>
            <p class="rsvp-banner-body">{{ rsvpBannerBody }}</p>
          </div>
        </div>

        <!-- Event title + type -->
        <div class="event-title-row">
          <div>
            <p class="event-type-label">{{ prettyType }}</p>
            <h1 class="event-title">{{ event.title }}</h1>
          </div>
        </div>

        <!-- Extra images (non-hero) -->
        <div v-if="galleryImages.length" class="event-gallery">
          <img
            v-for="(img, i) in galleryImages"
            :key="`gal-${i}`"
            :src="displayAsset(img)"
            class="event-gallery-img"
            alt=""
          />
        </div>

        <!-- Key details -->
        <div class="event-details-card">
          <div class="detail-row" v-if="event.startsAt">
            <span class="detail-icon">📅</span>
            <div>
              <strong>When</strong>
              <div>{{ formatDateRange(event.startsAt, event.endsAt) }}</div>
            </div>
          </div>
          <div class="detail-row" v-if="event.locationName || event.locationAddress">
            <span class="detail-icon">📍</span>
            <div>
              <strong>Where</strong>
              <div>{{ event.locationName }}</div>
              <div class="muted">{{ event.locationAddress }}</div>
            </div>
          </div>
          <div class="detail-row" v-if="event.locationPhone">
            <span class="detail-icon">📞</span>
            <div>
              <strong>Venue phone</strong>
              <div>{{ event.locationPhone }}</div>
            </div>
          </div>
          <div class="detail-row" v-if="event.rsvpDeadline">
            <span class="detail-icon">⏰</span>
            <div>
              <strong>RSVP by</strong>
              <div>{{ formatDate(event.rsvpDeadline) }}</div>
            </div>
          </div>
          <div class="detail-row" v-if="event.guestPolicy && event.guestPolicy !== 'staff_only'">
            <span class="detail-icon">👥</span>
            <div>
              <strong>Guests</strong>
              <div>{{ prettyGuestPolicy }}</div>
            </div>
          </div>
        </div>

        <!-- Description -->
        <div v-if="event.description || event.splashContent" class="event-section">
          <p v-if="event.description" class="event-description">{{ event.description }}</p>
          <p v-if="event.splashContent" class="event-splash">{{ event.splashContent }}</p>
        </div>

        <!-- Host providing + family note -->
        <div class="event-section" v-if="event.organizerProviding?.length || event.familyProvisionNote">
          <h3 class="section-heading">What's included</h3>
          <div v-if="event.organizerProviding?.length" class="provided-list">
            <span class="provided-chip" v-for="item in event.organizerProviding" :key="item">✓ {{ item }}</span>
          </div>
          <p v-if="event.familyProvisionNote" class="muted">{{ event.familyProvisionNote }}</p>
        </div>

        <!-- Registration form CTA -->
        <div v-if="registrationFormUrl || event.registrationFormUrl" class="event-cta-section event-cta-section--form">
          <p class="cta-section-label">Registration</p>
          <p class="cta-hint" style="margin-bottom: 14px;">
            {{ event.registrationFormTitle ? `"${event.registrationFormTitle}" — ` : '' }}Complete the registration form to confirm your spot and provide any additional details.
          </p>
          <div class="cta-actions">
            <a
              :href="registrationFormUrl || event.registrationFormUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="btn-event btn-event-primary"
            >
              Register now &rarr;
            </a>
          </div>
        </div>

        <!-- Invitation CTA (shown when no registration form or as supplement) -->
        <div class="event-cta-section">
          <div v-if="!rsvpResponse">
            <p class="cta-hint">
              <strong>Received an invitation email?</strong><br />
              Check your email for your personalized RSVP link — click the button inside to confirm your attendance.
            </p>
          </div>
          <div v-else class="cta-confirmed">
            <p class="cta-hint">
              Your RSVP is on file. Use the registration form above to add guest count and meal preferences.
            </p>
          </div>
        </div>

        <!-- Footer -->
        <footer class="event-footer">
          <img v-if="branding.logoUrl" :src="displayAsset(branding.logoUrl)" alt="Logo" class="footer-logo" />
          <span class="footer-agency">{{ branding.agencyName }}</span>
        </footer>
      </div>
    </template>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { toUploadsUrl } from '../../utils/uploadsUrl';
import { buildPublicIntakeUrl } from '../../utils/publicIntakeUrl';

const route = useRoute();
const eventId = computed(() => Number(route.params.eventId) || 0);

const loading = ref(true);
const error = ref('');
const event = ref(null);
const branding = ref({ agencyName: '', logoUrl: '', colorPalette: null, themeSettings: null });

/** RSVP response stored in localStorage after employee responds via email token. */
const rsvpResponse = ref('');
const rsvpName = ref('');

const displayAsset = (value) => {
  const s = String(value || '').trim();
  if (!s) return '';
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  return toUploadsUrl(s);
};

const allImages = computed(() => {
  const out = [];
  if (event.value?.publicHeroImageUrl) out.push(event.value.publicHeroImageUrl);
  if (event.value?.eventImageUrl) out.push(event.value.eventImageUrl);
  if (Array.isArray(event.value?.eventImageUrls)) {
    for (const u of event.value.eventImageUrls) {
      const s = String(u || '').trim();
      if (s && !out.includes(s)) out.push(s);
    }
  }
  return [...new Set(out)].filter(Boolean);
});

const heroImage = computed(() => allImages.value[0] || '');
const galleryImages = computed(() => allImages.value.slice(1));

const cssVars = computed(() => {
  const cp = branding.value?.colorPalette || {};
  const ts = branding.value?.themeSettings || {};
  const out = {};
  if (cp.primary) out['--ep-primary'] = cp.primary;
  if (cp.secondary) out['--ep-secondary'] = cp.secondary;
  if (ts.fontFamily) out['font-family'] = ts.fontFamily;
  return out;
});

/** Full public URL for the linked Smart Registration digital form, if one exists. */
const registrationFormUrl = computed(() => {
  const key = String(event.value?.registrationFormPublicKey || '').trim();
  return key ? buildPublicIntakeUrl(key) : '';
});

const prettyType = computed(() => {
  const t = String(event.value?.eventType || '').toLowerCase();
  const map = {
    staff_event: 'Staff event',
    staff_get_together: 'Staff get-together',
    company_event: 'Company event',
    team_building: 'Team building',
    celebration: 'Celebration',
    meeting: 'Meeting',
    training: 'Training'
  };
  return map[t] || t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
});

const prettyGuestPolicy = computed(() => {
  const p = String(event.value?.guestPolicy || '');
  return { staff_only: 'Staff only', plus_one: 'Plus one welcome', family: 'Families welcome', open: 'Open to all' }[p] || p;
});

const formatDateRange = (start, end) => {
  if (!start) return '';
  const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' };
  const s = new Date(start).toLocaleString(undefined, opts);
  if (!end) return s;
  const e = new Date(end);
  const sameDay = new Date(start).toDateString() === e.toDateString();
  if (sameDay) {
    const timeOpts = { hour: 'numeric', minute: '2-digit' };
    return `${s} – ${e.toLocaleTimeString(undefined, timeOpts)}`;
  }
  return `${s} – ${new Date(end).toLocaleString(undefined, opts)}`;
};

const formatDate = (value) => {
  if (!value) return '';
  return new Date(value).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
};

const rsvpBannerTitle = computed(() => {
  const name = rsvpName.value ? `, ${rsvpName.value}` : '';
  if (rsvpResponse.value === 'yes') return `Can't wait to see you there${name}! 🎉`;
  if (rsvpResponse.value === 'maybe') return `We hope you can make it${name}!`;
  if (rsvpResponse.value === 'no') return `Sorry you can't join us${name}.`;
  return '';
});

const rsvpBannerBody = computed(() => {
  if (rsvpResponse.value === 'yes') return 'Your RSVP is confirmed. See you at the event!';
  if (rsvpResponse.value === 'maybe') return 'You\'ve been marked as "maybe." We\'ll save a spot just in case.';
  if (rsvpResponse.value === 'no') return 'Thanks for letting us know. We\'ll miss you!';
  return '';
});

const loadStoredRsvp = () => {
  try {
    const stored = localStorage.getItem(`rsvp_event_${eventId.value}`);
    if (!stored) return;
    const data = JSON.parse(stored);
    rsvpResponse.value = String(data.response || '').toLowerCase();
    rsvpName.value = String(data.name || '').trim();
  } catch { /* ignore */ }
};

const load = async () => {
  if (!eventId.value) { error.value = 'Invalid event link.'; loading.value = false; return; }
  loading.value = true;
  error.value = '';
  try {
    const resp = await api.get(`/company-events/public/${eventId.value}`, { skipAuthRedirect: true });
    event.value = resp.data?.event || null;
    branding.value = resp.data?.branding || branding.value;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'This event could not be loaded.';
  } finally {
    loading.value = false;
  }
};

onMounted(async () => {
  loadStoredRsvp();
  await load();
});
</script>

<style scoped>
:root {
  --ep-primary: #15803d;
  --ep-secondary: #1D2633;
}
.event-page {
  min-height: 100vh;
  background: #f7fafc;
  font-family: inherit;
}

/* Hero */
.event-hero {
  width: 100%;
  height: clamp(200px, 38vw, 420px);
  background-size: cover;
  background-position: center;
  position: relative;
}
.event-hero-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.42) 100%);
  display: flex;
  align-items: flex-end;
  padding: 24px;
}
.hero-logo { height: 52px; object-fit: contain; background: rgba(255,255,255,.85); border-radius: 8px; padding: 6px 10px; }

/* Fallback header */
.event-header-bar {
  background: var(--ep-secondary, #1D2633);
  color: #fff;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 24px;
}
.header-logo { height: 40px; object-fit: contain; }
.header-agency { font-size: 1.1rem; font-weight: 700; letter-spacing: .02em; }

/* Body */
.event-body {
  max-width: 780px;
  margin: 0 auto;
  padding: 28px 20px 60px;
}

/* RSVP Banner */
.rsvp-banner {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  border-radius: 10px;
  padding: 16px 20px;
  margin-bottom: 24px;
}
.rsvp-banner--yes  { background: #f0fdf4; border: 1.5px solid #86efac; }
.rsvp-banner--maybe { background: #fffbeb; border: 1.5px solid #fde68a; }
.rsvp-banner--no   { background: #fef2f2; border: 1.5px solid #fca5a5; }
.rsvp-banner-icon  { font-size: 2rem; line-height: 1; }
.rsvp-banner-title { font-size: 1.1rem; font-weight: 700; color: #1e293b; }
.rsvp-banner-body  { margin: 4px 0 0; color: #475569; font-size: 0.95rem; }

/* Title row */
.event-title-row {
  margin-bottom: 20px;
}
.event-type-label {
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: var(--ep-primary, #15803d);
  margin: 0 0 4px;
}
.event-title {
  font-size: clamp(1.6rem, 4vw, 2.4rem);
  font-weight: 800;
  color: #0f172a;
  margin: 0;
  line-height: 1.15;
}

/* Gallery */
.event-gallery {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 24px;
}
.event-gallery-img {
  height: 160px;
  width: auto;
  border-radius: 8px;
  object-fit: cover;
  flex: 1 1 220px;
  max-width: 100%;
}

/* Details card */
.event-details-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 20px;
  display: grid;
  gap: 14px;
  margin-bottom: 24px;
}
.detail-row {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}
.detail-icon { font-size: 1.25rem; line-height: 1.4; flex-shrink: 0; }
.detail-row strong { font-size: 0.82rem; text-transform: uppercase; letter-spacing: .06em; color: #64748b; display: block; margin-bottom: 2px; }

/* Sections */
.event-section { margin-bottom: 24px; }
.section-heading { font-size: 1rem; font-weight: 700; margin: 0 0 10px; color: #0f172a; }
.event-description, .event-splash { color: #334155; line-height: 1.6; margin: 0 0 8px; }
.provided-list { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.provided-chip {
  background: #f0fdf4;
  border: 1px solid #86efac;
  color: #166534;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 0.9rem;
}

/* CTA */
.event-cta-section {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 16px;
  text-align: center;
}
.event-cta-section--form {
  border-color: var(--ep-primary, #15803d);
  background: #f0fdf4;
}
.cta-section-label {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: var(--ep-primary, #15803d);
  margin: 0 0 6px;
}
.cta-hint { color: #475569; line-height: 1.55; margin: 0; }
.cta-actions { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
.btn-event {
  display: inline-block;
  padding: 12px 28px;
  border-radius: 8px;
  font-weight: 700;
  font-size: 1rem;
  text-decoration: none;
  cursor: pointer;
  border: none;
  transition: opacity .15s;
}
.btn-event:hover { opacity: .88; }
.btn-event-primary { background: var(--ep-primary, #15803d); color: #fff; }

/* Footer */
.event-footer { display: flex; align-items: center; justify-content: center; gap: 12px; padding-top: 16px; border-top: 1px solid #e2e8f0; }
.footer-logo { height: 32px; object-fit: contain; }
.footer-agency { font-size: 0.9rem; color: #64748b; }

/* Utility */
.muted { color: #64748b; font-size: 0.9rem; }
.event-centered { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 60vh; gap: 16px; }
.event-spinner { width: 36px; height: 36px; border: 3px solid #e2e8f0; border-top-color: var(--ep-primary, #15803d); border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.event-error { color: #b91c1c; font-size: 1rem; }
</style>
