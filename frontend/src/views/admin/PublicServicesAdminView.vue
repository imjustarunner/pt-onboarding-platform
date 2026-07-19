<template>
  <div class="public-services-admin container">
    <div class="page-header">
      <div>
        <h1>Public Services &amp; Booking</h1>
        <p class="subtitle">Configure which booking finders are active on your public portal pages.</p>
      </div>
      <div class="page-actions">
        <a v-if="agencySlug" :href="`/${agencySlug}/services`" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">
          Preview public hub &rarr;
        </a>
      </div>
    </div>

    <div v-if="loading" class="card">
      <div class="loading">Loading…</div>
    </div>
    <div v-else-if="error" class="card error">{{ error }}</div>

    <template v-else>
      <!-- Status bar -->
      <div class="card status-bar">
        <div class="status-item">
          <span class="status-dot" :class="publicBookingEnabled ? 'dot--on' : 'dot--off'" />
          <span>Public booking is <strong>{{ publicBookingEnabled ? 'enabled' : 'disabled' }}</strong> for this agency</span>
        </div>
        <div v-if="!publicBookingEnabled" class="status-note">
          Enable "Public Availability" in the provider portal settings or contact support to activate public booking.
        </div>
        <div v-else class="status-note">
          Public booking uses <strong>new-client / intake availability</strong> from the practitioner calendar
          (same pool as “available for intake”). Discovery can be required, optional, or off — see settings below.
        </div>
      </div>

      <div class="card discovery-card">
        <h3>Discovery booking</h3>
        <p class="status-note">
          Life coaches typically require a free discovery call first. Consultants can offer discovery optionally
          alongside paid sessions. Customize below for this tenant.
        </p>
        <div class="discovery-grid">
          <label class="toggle-row">
            <input v-model="discoveryForm.enabled" type="checkbox" />
            <span>Enable free discovery booking</span>
          </label>
          <label class="toggle-row">
            <input v-model="discoveryForm.required" type="checkbox" :disabled="!discoveryForm.enabled" />
            <span>Require discovery before paid services</span>
          </label>
          <label>
            Discovery label
            <input v-model="discoveryForm.label" type="text" placeholder="Discovery Call" />
          </label>
          <label>
            Duration (minutes)
            <input v-model.number="discoveryForm.durationMin" type="number" min="10" max="120" step="5" />
          </label>
        </div>
        <button class="btn btn-primary btn-sm" type="button" :disabled="savingDiscovery" @click="saveDiscoverySettings">
          {{ savingDiscovery ? 'Saving…' : 'Save discovery settings' }}
        </button>
      </div>

      <div class="card booking-brand-card">
        <h3>Booking page branding &amp; copy</h3>
        <p class="status-note">
          Pathway stays standard (life coach = 3-step discovery; consultant = services + calendar).
          Logo and brand colors come from Agency branding settings — everything below is editable page copy for this tenant.
        </p>

        <div class="form-group">
          <label>Brand display name <span class="hint">(defaults to agency name)</span></label>
          <input v-model="bookingForm.brandDisplayName" type="text" :placeholder="agencyName || 'Your practice name'" />
        </div>
        <div class="form-row-2">
          <div class="form-group">
            <label>CTA button label</label>
            <input v-model="bookingForm.ctaLabel" type="text" />
          </div>
          <div class="form-group">
            <label>Modality label</label>
            <input v-model="bookingForm.modalityLabel" type="text" placeholder="Virtual (Zoom)" />
          </div>
        </div>
        <div class="form-group">
          <label>Background image URL <span class="hint">(optional; life coach page)</span></label>
          <input v-model="bookingForm.backgroundImageUrl" type="url" placeholder="https://…" />
        </div>

        <h4 class="section-label">Typography &amp; color</h4>
        <p class="status-note">
          These also appear in the live-page editor when you view your public booking page while logged in as the tenant owner.
        </p>
        <div class="form-row-2">
          <div class="form-group">
            <label>Body font</label>
            <select v-model="bookingForm.fontFamily">
              <option v-for="f in fontOptions" :key="`admin-body-${f.id || 'default'}`" :value="f.id">{{ f.label }}</option>
            </select>
          </div>
          <div class="form-group">
            <label>Heading font</label>
            <select v-model="bookingForm.headingFontFamily">
              <option v-for="f in fontOptions" :key="`admin-head-${f.id || 'default'}`" :value="f.id">{{ f.label }}</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Accent color <span class="hint">(overrides agency primary on this page when set)</span></label>
          <div class="color-row">
            <input v-model="bookingForm.accentColor" type="color" class="color-swatch" />
            <input v-model="bookingForm.accentColor" type="text" placeholder="#1b4332" />
          </div>
        </div>

        <label class="toggle-row booking-toggle">
          <input v-model="bookingForm.showNav" type="checkbox" />
          <span>Show top navigation links</span>
        </label>
        <div v-if="bookingForm.showNav" class="form-group">
          <label>Nav links <span class="hint">(one per line: Label | url)</span></label>
          <textarea v-model="navLinksText" rows="4" placeholder="About Me | #booking" />
        </div>

        <h4 class="section-label">Profile defaults</h4>
        <div class="form-row-2">
          <div class="form-group">
            <label>Default title</label>
            <input v-model="bookingForm.providerTitleFallback" type="text" placeholder="Life Coach" />
          </div>
          <div class="form-group">
            <label>Eyebrow / section label</label>
            <input v-model="bookingForm.coachEyebrow" type="text" placeholder="Discovery Call" />
          </div>
        </div>
        <div class="form-group">
          <label>Default bio / tagline <span class="hint">(used if provider profile bio is empty)</span></label>
          <textarea v-model="bookingForm.providerBioFallback" rows="2" />
        </div>
        <div class="form-group">
          <label>Specialties <span class="hint">(one per line)</span></label>
          <textarea v-model="specialtiesText" rows="4" />
        </div>
        <div class="form-group">
          <label>What to expect — title</label>
          <input v-model="bookingForm.whatToExpectTitle" type="text" />
        </div>
        <div class="form-group">
          <label>What to expect — body</label>
          <textarea v-model="bookingForm.whatToExpectBody" rows="2" />
        </div>
        <div class="form-group">
          <label>Closing quote <span class="hint">(step 3 sidebar)</span></label>
          <textarea v-model="bookingForm.coachQuote" rows="2" />
        </div>

        <h4 class="section-label">Hero copy (life coach steps)</h4>
        <div class="form-group">
          <label>Step 1 title</label>
          <input v-model="bookingForm.coachHeroTitles.step1" type="text" />
        </div>
        <div class="form-group">
          <label>Step 1 subtitle</label>
          <textarea v-model="bookingForm.coachHeroSubtitles.step1" rows="2" />
        </div>
        <div class="form-group">
          <label>Step 2 title</label>
          <input v-model="bookingForm.coachHeroTitles.step2" type="text" />
        </div>
        <div class="form-group">
          <label>Step 2 subtitle</label>
          <textarea v-model="bookingForm.coachHeroSubtitles.step2" rows="2" />
        </div>
        <div class="form-group">
          <label>Step 3 title</label>
          <input v-model="bookingForm.coachHeroTitles.step3" type="text" />
        </div>
        <div class="form-group">
          <label>Step 3 subtitle</label>
          <textarea v-model="bookingForm.coachHeroSubtitles.step3" rows="2" />
        </div>

        <h4 class="section-label">Consultant header</h4>
        <div class="form-group">
          <label>Tagline</label>
          <input v-model="bookingForm.consultantTagline" type="text" />
        </div>
        <div class="form-group">
          <label>Benefits <span class="hint">(one per line)</span></label>
          <textarea v-model="consultantBenefitsText" rows="3" />
        </div>

        <h4 class="section-label">Value props</h4>
        <div class="form-group">
          <label>Step 1 row <span class="hint">(Title | body — one per line)</span></label>
          <textarea v-model="valuePropsStep1Text" rows="3" />
        </div>
        <div class="form-group">
          <label>Steps 2–3 row <span class="hint">(Title | body — one per line)</span></label>
          <textarea v-model="valuePropsLaterText" rows="3" />
        </div>
        <div class="form-group">
          <label>Consultant footer props <span class="hint">(Title | body — one per line)</span></label>
          <textarea v-model="valuePropsText" rows="3" />
        </div>

        <h4 class="section-label">Step 3 intake questions</h4>
        <p class="status-note">Defaults match the discovery example. Edit labels, required/optional, options, or hide a question.</p>
        <div v-for="(field, idx) in bookingForm.step3Fields" :key="field.id" class="step3-field-card">
          <div class="form-row-2">
            <div class="form-group">
              <label>Label</label>
              <input v-model="field.label" type="text" />
            </div>
            <div class="form-group">
              <label>Type</label>
              <select v-model="field.type">
                <option value="text">Text</option>
                <option value="email">Email</option>
                <option value="tel">Phone</option>
                <option value="select">Dropdown</option>
                <option value="textarea">Long text</option>
              </select>
            </div>
          </div>
          <div class="form-row-2">
            <label class="toggle-row">
              <input v-model="field.enabled" type="checkbox" />
              <span>Show on booking form</span>
            </label>
            <label class="toggle-row">
              <input v-model="field.required" type="checkbox" :disabled="!field.enabled" />
              <span>Required</span>
            </label>
          </div>
          <div class="form-group">
            <label>Placeholder</label>
            <input v-model="field.placeholder" type="text" />
          </div>
          <div v-if="field.type === 'select'" class="form-group">
            <label>Options <span class="hint">(one per line)</span></label>
            <textarea
              :value="(field.options || []).join('\n')"
              rows="3"
              @input="field.options = String($event.target.value || '').split('\n').map((s) => s.trim()).filter(Boolean)"
            />
          </div>
          <button v-if="idx > 1" type="button" class="btn btn-secondary btn-sm" @click="bookingForm.step3Fields.splice(idx, 1)">
            Remove question
          </button>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" @click="addStep3Field">+ Add question</button>

        <button class="btn btn-primary btn-sm" type="button" :disabled="savingBookingPage" @click="saveBookingPageSettings">
          {{ savingBookingPage ? 'Saving…' : 'Save booking page content' }}
        </button>
      </div>

      <!-- Service type cards -->
      <div v-if="saveSuccess" class="success-banner">{{ saveSuccess }}</div>
      <div v-if="saveError" class="error-banner">{{ saveError }}</div>

      <div v-if="businessTypeGateNote" class="card status-bar">
        <div class="status-note">{{ businessTypeGateNote }}</div>
      </div>

      <div class="service-type-list">
        <div
          v-for="svc in visibleServiceTypeConfigs"
          :key="svc.serviceType"
          class="card service-type-card"
          :class="{ 'service-type-card--active': svc.isEnabled }"
        >
          <div class="stc-header">
            <div class="stc-header-left">
              <div class="stc-icon" :class="`stc-icon--${svc.serviceType}`">
                <svg v-if="svc.serviceType === 'counseling'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" /></svg>
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" /></svg>
              </div>
              <div>
                <h3>{{ serviceTypeTitle(svc.serviceType) }}</h3>
                <p class="stc-type-label">{{ serviceTypeFinderLabel(svc.serviceType) }}</p>
              </div>
            </div>
            <div class="stc-header-right">
              <label class="toggle-switch" :title="svc.isEnabled ? 'Disable this service' : 'Enable this service'">
                <input type="checkbox" v-model="svc.isEnabled" @change="saveServiceType(svc)" :disabled="saving" />
                <span class="toggle-slider" />
              </label>
              <span class="toggle-label">{{ svc.isEnabled ? 'Enabled' : 'Disabled' }}</span>
            </div>
          </div>

          <div v-if="svc.isEnabled" class="stc-body">
            <div class="form-row">
              <div class="form-group">
                <label>Display name <span class="hint">(shown on the hub page button)</span></label>
                <input v-model="svc.displayName" type="text" :placeholder="serviceTypeFinderLabel(svc.serviceType)" />
              </div>
              <div class="form-group">
                <label>Sort order</label>
                <input v-model.number="svc.sortOrder" type="number" min="0" step="1" />
              </div>
            </div>
            <div class="form-group">
              <label>Intro blurb <span class="hint">(shown at top of finder page)</span></label>
              <textarea v-model="svc.introBlurb" rows="3" :placeholder="`A short introduction shown at the top of the ${svc.serviceType} finder…`" />
            </div>
            <div class="form-group">
              <label>Hero image URL <span class="hint">(optional banner for finder page)</span></label>
              <input v-model="svc.heroImageUrl" type="url" placeholder="https://…" />
            </div>
            <div class="stc-actions">
              <button class="btn btn-primary btn-sm" :disabled="saving" @click="saveServiceType(svc)">
                {{ saving ? 'Saving…' : 'Save' }}
              </button>
              <a v-if="agencySlug" :href="previewPath(svc.serviceType)" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm">
                Preview &rarr;
              </a>
            </div>
          </div>
        </div>
      </div>

      <!-- Enrolled providers quick count -->
      <div class="card enrollment-summary">
        <h3>Provider enrollment summary</h3>
        <p class="subtitle">Providers enrolled in each public finder. Manage individual enrollments from each provider's Profile Info tab → Public Listings section.</p>
        <div class="enrollment-grid">
          <div v-for="svc in visibleEnrollmentCounts" :key="svc.serviceType" class="enrollment-item">
            <strong>{{ svc.count }}</strong>
            <span>{{ enrollmentLabel(svc.serviceType) }} enrolled</span>
            <span v-if="previewPath(svc.serviceType) !== '#'">
              <a :href="previewPath(svc.serviceType)" target="_blank" class="enrollment-link">View public page</a>
            </span>
          </div>
        </div>
      </div>

      <!-- Public link share -->
      <div class="card">
        <h3>Share your booking hub</h3>
        <p class="subtitle">Share this link with clients so they can browse and book directly.</p>
        <div class="share-row">
          <input type="text" :value="hubUrl" readonly class="share-input" @click="copyHubUrl" />
          <button class="btn btn-secondary" @click="copyHubUrl">{{ copied ? 'Copied!' : 'Copy link' }}</button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { resolveBookingPageSettings, compactBookingPageForSave } from '../../utils/practitionerBooking.js';
import { CAREERS_FONT_OPTIONS } from '../../utils/careersAssets.js';

const route = useRoute();
const agencyStore = useAgencyStore();
const fontOptions = CAREERS_FONT_OPTIONS;

const agencySlug = computed(() =>
  String(route.params.organizationSlug || agencyStore.currentAgency?.slug || '').trim()
);

const loading = ref(false);
const error = ref('');
const saving = ref(false);
const saveSuccess = ref('');
const saveError = ref('');
const copied = ref(false);
const publicBookingEnabled = ref(false);
const agencyId = ref(null);
const agencyName = ref('');
const orgType = ref('life_coach');
const savingDiscovery = ref(false);
const savingBookingPage = ref(false);
const discoveryForm = ref({
  enabled: true,
  required: false,
  label: 'Discovery Call',
  durationMin: 20
});
const existingFeatureFlags = ref({});
const bookingForm = ref(resolveBookingPageSettings('life_coach'));

const specialtiesText = computed({
  get: () => (bookingForm.value.specialties || []).join('\n'),
  set: (v) => {
    bookingForm.value.specialties = String(v || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  }
});
const consultantBenefitsText = computed({
  get: () => (bookingForm.value.consultantBenefits || []).join('\n'),
  set: (v) => {
    bookingForm.value.consultantBenefits = String(v || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  }
});
const navLinksText = computed({
  get: () =>
    (bookingForm.value.navLinks || [])
      .map((l) => `${l.label} | ${l.href || '#booking'}`)
      .join('\n'),
  set: (v) => {
    bookingForm.value.navLinks = String(v || '')
      .split('\n')
      .map((line) => {
        const [label, href] = line.split('|').map((s) => s.trim());
        return label ? { label, href: href || '#booking' } : null;
      })
      .filter(Boolean);
  }
});

function valuePropsToText(list) {
  return (list || []).map((v) => `${v.title || ''} | ${v.body || ''}`).join('\n');
}
function textToValueProps(v) {
  return String(v || '')
    .split('\n')
    .map((line) => {
      const [title, ...rest] = line.split('|').map((s) => s.trim());
      if (!title) return null;
      return { title, body: rest.join(' | ').trim() };
    })
    .filter(Boolean);
}
const valuePropsStep1Text = computed({
  get: () => valuePropsToText(bookingForm.value.valuePropsStep1),
  set: (v) => {
    bookingForm.value.valuePropsStep1 = textToValueProps(v);
  }
});
const valuePropsLaterText = computed({
  get: () => valuePropsToText(bookingForm.value.valuePropsLater),
  set: (v) => {
    bookingForm.value.valuePropsLater = textToValueProps(v);
  }
});
const valuePropsText = computed({
  get: () => valuePropsToText(bookingForm.value.valueProps),
  set: (v) => {
    bookingForm.value.valueProps = textToValueProps(v);
  }
});

const SERVICE_TYPE_DEFS = ['counseling', 'tutoring', 'evaluation', 'coaching', 'consulting'];
const allowedPublicServiceTypes = ref([...SERVICE_TYPE_DEFS]);
const businessTypeGateNote = ref('');

const visibleServiceTypeConfigs = computed(() => {
  const allowed = new Set(allowedPublicServiceTypes.value || []);
  if (!allowed.size) return [];
  // Before capabilities load, allowed is the full SERVICE_TYPE_DEFS list.
  return serviceTypeConfigs.value.filter((svc) => allowed.has(svc.serviceType));
});

const visibleEnrollmentCounts = computed(() => {
  const allowed = new Set(allowedPublicServiceTypes.value || []);
  if (!allowed.size) return [];
  return (enrollmentCounts.value || []).filter((svc) => allowed.has(svc.serviceType));
});

function serviceTypeTitle(t) {
  const map = {
    counseling: 'Counseling',
    tutoring: 'Tutoring',
    evaluation: 'Evaluation',
    coaching: 'Life Coaching',
    consulting: 'Consulting'
  };
  return map[t] || t;
}

function serviceTypeFinderLabel(t) {
  const map = {
    counseling: 'Find a Counselor',
    tutoring: 'Find a Tutor',
    evaluation: 'Find an Evaluator',
    coaching: 'Book Discovery / Coaching',
    consulting: 'Book Consulting'
  };
  return map[t] || t;
}

function enrollmentLabel(t) {
  const map = {
    counseling: 'Counselor(s)',
    tutoring: 'Tutor(s)',
    evaluation: 'Evaluator(s)',
    coaching: 'Coach(es)',
    consulting: 'Consultant(s)'
  };
  return map[t] || 'Provider(s)';
}

function previewPath(t) {
  if (!agencySlug.value) return '#';
  if (t === 'counseling') return `/${agencySlug.value}/find-counselor`;
  if (t === 'tutoring') return `/${agencySlug.value}/find-tutor`;
  if (t === 'coaching') return `/${agencySlug.value}/find-coach`;
  if (t === 'consulting') return `/${agencySlug.value}/find-consultant`;
  return `/${agencySlug.value}/services`;
}

const serviceTypeConfigs = ref(
  SERVICE_TYPE_DEFS.map((serviceType) => ({
    serviceType,
    isEnabled: false,
    displayName: '',
    introBlurb: '',
    heroImageUrl: '',
    sortOrder: SERVICE_TYPE_DEFS.indexOf(serviceType)
  }))
);

const enrollmentCounts = ref(
  SERVICE_TYPE_DEFS.map((serviceType) => ({ serviceType, count: 0 }))
);

const hubUrl = computed(() => {
  if (!agencySlug.value) return '';
  return `${window.location.origin}/${agencySlug.value}/services`;
});

async function load() {
  if (!agencySlug.value) return;
  loading.value = true;
  error.value = '';
  try {
    const [hubRes, ...enrollRes] = await Promise.all([
      api.get(`/public/agency-services/${encodeURIComponent(agencySlug.value)}`, { skipAuthRedirect: true }).catch(() => null),
      ...SERVICE_TYPE_DEFS.map((st) =>
        api.get(`/public/agency-services/${encodeURIComponent(agencySlug.value)}/enrollment?serviceType=${st}`, { skipAuthRedirect: true }).catch(() => null)
      )
    ]);

    // Hub + service types
    const existingTypes = hubRes?.data?.serviceTypes || [];
    publicBookingEnabled.value = !!hubRes?.data;
    agencyId.value = hubRes?.data?.agency?.id || null;
    agencyName.value = hubRes?.data?.agency?.name || '';
    orgType.value = hubRes?.data?.agency?.organizationType || 'life_coach';
    const disc = hubRes?.data?.discoverySettings;
    if (disc) {
      discoveryForm.value = {
        enabled: !!disc.discoveryBookingEnabled,
        required: !!disc.discoveryBookingRequired,
        label: disc.discoveryLabel || 'Discovery Call',
        durationMin: Number(disc.discoveryDurationMin || 20)
      };
    }
    bookingForm.value = hubRes?.data?.bookingPage || resolveBookingPageSettings(orgType.value);
    // Keep other feature flags when saving discovery settings
    try {
      if (agencyId.value) {
        const agencyRes = await api.get(`/agencies/${agencyId.value}`);
        const raw = agencyRes.data?.feature_flags || agencyRes.data?.featureFlags || {};
        existingFeatureFlags.value = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
      }
    } catch {
      existingFeatureFlags.value = {};
    }

    for (const svc of serviceTypeConfigs.value) {
      const existing = existingTypes.find((st) => st.serviceType === svc.serviceType);
      if (existing) {
        svc.isEnabled = true;
        svc.displayName = existing.displayName || '';
        svc.introBlurb = existing.introBlurb || '';
        svc.heroImageUrl = existing.heroImageUrl || '';
        svc.sortOrder = existing.sortOrder ?? SERVICE_TYPE_DEFS.indexOf(svc.serviceType);
      }
    }

    allowedPublicServiceTypes.value = [...SERVICE_TYPE_DEFS];
    businessTypeGateNote.value = '';
    if (agencyId.value) {
      try {
        const capRes = await api.get(`/tenant-booking/agencies/${agencyId.value}/capabilities`, {
          params: { ensureDefaults: 'true' }
        });
        const allowed = capRes.data?.capabilities?.allowedPublicServiceTypes || [];
        const enabledTypes = capRes.data?.capabilities?.enabledBusinessTypes || [];
        if (enabledTypes.length) {
          allowedPublicServiceTypes.value = allowed.length ? allowed : [];
          businessTypeGateNote.value = allowed.length
            ? `Public finders are limited to your enabled tenant service types (${enabledTypes.join(', ')}): ${allowed.join(', ')}.`
            : `No public finders are available for the enabled tenant service types (${enabledTypes.join(', ')}). Add counseling/learning/coaching/consulting types in Agency Management.`;
        }
      } catch {
        /* keep full list if capabilities unavailable */
      }
    }

    // Enrollment counts
    enrollRes.forEach((res, idx) => {
      const enrollments = res?.data?.enrollments || [];
      enrollmentCounts.value[idx].count = enrollments.filter((e) => e.is_active).length;
    });
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load settings.';
  } finally {
    loading.value = false;
  }
}

async function saveServiceType(svc) {
  saving.value = true;
  saveSuccess.value = '';
  saveError.value = '';
  try {
    if (!agencySlug.value) throw new Error('No agency selected');
    await api.post(
      `/public/agency-services/${encodeURIComponent(agencySlug.value)}/service-types`,
      {
        serviceType: svc.serviceType,
        displayName: svc.displayName || null,
        introBlurb: svc.introBlurb || null,
        heroImageUrl: svc.heroImageUrl || null,
        isEnabled: svc.isEnabled,
        sortOrder: svc.sortOrder ?? 0
      },
      { skipAuthRedirect: true }
    );
    saveSuccess.value = 'Settings saved.';
    setTimeout(() => (saveSuccess.value = ''), 3000);
  } catch (e) {
    saveError.value = e.response?.data?.error?.message || 'Failed to save settings.';
  } finally {
    saving.value = false;
  }
}

async function saveDiscoverySettings() {
  if (!agencyId.value) {
    saveError.value = 'Agency id not loaded — open this page from a tenant context.';
    return;
  }
  savingDiscovery.value = true;
  saveSuccess.value = '';
  saveError.value = '';
  try {
    await api.put(`/agencies/${agencyId.value}`, {
      featureFlags: {
        ...(existingFeatureFlags.value || {}),
        discoveryBookingEnabled: !!discoveryForm.value.enabled,
        discoveryBookingRequired: !!discoveryForm.value.required,
        discoveryLabel: discoveryForm.value.label || 'Discovery Call',
        discoveryDurationMin: Number(discoveryForm.value.durationMin || 20)
      }
    });
    existingFeatureFlags.value = {
      ...(existingFeatureFlags.value || {}),
      discoveryBookingEnabled: !!discoveryForm.value.enabled,
      discoveryBookingRequired: !!discoveryForm.value.required,
      discoveryLabel: discoveryForm.value.label || 'Discovery Call',
      discoveryDurationMin: Number(discoveryForm.value.durationMin || 20)
    };
    saveSuccess.value = 'Discovery settings saved.';
    setTimeout(() => (saveSuccess.value = ''), 3000);
  } catch (e) {
    saveError.value = e.response?.data?.error?.message || 'Failed to save discovery settings.';
  } finally {
    savingDiscovery.value = false;
  }
}

async function saveBookingPageSettings() {
  if (!agencyId.value) {
    saveError.value = 'Agency id not loaded — open this page from a tenant context.';
    return;
  }
  savingBookingPage.value = true;
  saveSuccess.value = '';
  saveError.value = '';
  try {
    const payload = compactBookingPageForSave(orgType.value, bookingForm.value);
    await api.put(`/agencies/${agencyId.value}`, {
      publicBookingSettings: payload
    });
    bookingForm.value = resolveBookingPageSettings(orgType.value, payload);
    saveSuccess.value = 'Booking page content saved.';
    setTimeout(() => (saveSuccess.value = ''), 3000);
  } catch (e) {
    saveError.value = e.response?.data?.error?.message || 'Failed to save booking page content.';
  } finally {
    savingBookingPage.value = false;
  }
}

function addStep3Field() {
  if (!Array.isArray(bookingForm.value.step3Fields)) bookingForm.value.step3Fields = [];
  bookingForm.value.step3Fields.push({
    id: `custom_${Date.now().toString(36)}`,
    type: 'text',
    label: 'New question',
    required: false,
    enabled: true,
    placeholder: '',
    options: []
  });
}

async function copyHubUrl() {
  if (!hubUrl.value) return;
  try {
    await navigator.clipboard.writeText(hubUrl.value);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  } catch {
    // fallback — select text
  }
}

onMounted(load);
</script>

<style scoped>
.public-services-admin {
  padding: 1.5rem;
  max-width: 900px;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}
.page-header h1 { margin: 0 0 0.25rem; font-size: 1.5rem; font-weight: 700; }
.subtitle { color: var(--text-secondary, #6b7280); font-size: 0.875rem; margin: 0; }

.card {
  background: var(--bg, #fff);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 0.875rem;
  padding: 1.25rem;
}

.loading { color: var(--text-secondary, #6b7280); font-size: 0.875rem; }
.error { color: #dc2626; font-size: 0.875rem; }
.success-banner { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; border-radius: 0.5rem; padding: 0.625rem 1rem; font-size: 0.875rem; }
.error-banner { background: #fee2e2; color: #dc2626; border: 1px solid #fecaca; border-radius: 0.5rem; padding: 0.625rem 1rem; font-size: 0.875rem; }

/* Status bar */
.status-bar { padding: 0.875rem 1.25rem; }
.discovery-card h3 { margin: 0 0 0.5rem; }
.booking-brand-card h3 { margin: 0 0 0.5rem; }
.booking-brand-card .form-group { margin-top: 0.75rem; }
.booking-brand-card .section-label {
  margin: 1.25rem 0 0.35rem;
  font-size: 0.92rem;
  font-weight: 700;
  color: #111827;
}
.form-row-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}
.booking-toggle { margin: 0.85rem 0 0.35rem; }
.step3-field-card {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 0.75rem;
  margin: 0.65rem 0;
  display: grid;
  gap: 0.5rem;
  background: #fafafa;
}
.discovery-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  margin: 0.85rem 0 1rem;
}
.discovery-grid label { display: grid; gap: 0.3rem; font-size: 0.82rem; font-weight: 700; color: #475569; }
.discovery-grid input[type='text'],
.discovery-grid input[type='number'] {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 0.45rem 0.55rem;
  font: inherit;
}
.toggle-row {
  display: flex !important;
  flex-direction: row !important;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600 !important;
}
@media (max-width: 700px) {
  .discovery-grid, .form-row-2 { grid-template-columns: 1fr; }
}
.status-item { display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; }
.status-dot { width: 10px; height: 10px; border-radius: 50%; }
.dot--on { background: #16a34a; }
.dot--off { background: #9ca3af; }
.status-note { font-size: 0.8rem; color: #9ca3af; margin-top: 0.35rem; }
.color-row {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}
.color-swatch {
  width: 2.5rem;
  height: 2.25rem;
  padding: 0;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
}

/* Service type list */
.service-type-list { display: flex; flex-direction: column; gap: 1rem; }
.service-type-card { transition: border-color 0.15s; }
.service-type-card--active { border-color: #6366f1; }

.stc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
.stc-header-left { display: flex; align-items: center; gap: 0.875rem; }
.stc-icon {
  width: 2.75rem; height: 2.75rem;
  border-radius: 0.625rem;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.stc-icon svg { width: 1.375rem; height: 1.375rem; }
.stc-icon--counseling { background: #e8f4f0; color: #3d6b5f; }
.stc-icon--tutoring { background: #eff6ff; color: #1e3a5f; }
.stc-header h3 { font-size: 1rem; font-weight: 700; margin: 0 0 0.15rem; }
.stc-type-label { font-size: 0.8rem; color: #9ca3af; margin: 0; }
.stc-header-right { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; }
.toggle-label { font-size: 0.8125rem; color: #6b7280; }

/* Toggle switch */
.toggle-switch { position: relative; display: inline-flex; align-items: center; cursor: pointer; }
.toggle-switch input { opacity: 0; width: 0; height: 0; position: absolute; }
.toggle-slider {
  width: 2.5rem; height: 1.375rem;
  background: #d1d5db;
  border-radius: 1rem;
  transition: background 0.2s;
  flex-shrink: 0;
}
.toggle-slider::after {
  content: '';
  position: absolute;
  width: 1rem; height: 1rem;
  background: #fff;
  border-radius: 50%;
  top: 3px; left: 3px;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}
.toggle-switch input:checked + .toggle-slider { background: #6366f1; }
.toggle-switch input:checked + .toggle-slider::after { transform: translateX(1.125rem); }

/* Form */
.stc-body { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #f3f4f6; display: flex; flex-direction: column; gap: 0.875rem; }
.form-row { display: grid; grid-template-columns: 1fr auto; gap: 0.75rem; align-items: end; }
.form-group { display: flex; flex-direction: column; gap: 0.3rem; }
.form-group label { font-size: 0.8125rem; font-weight: 500; color: #374151; }
.hint { font-size: 0.75rem; font-weight: 400; color: #9ca3af; }
.form-group input, .form-group textarea {
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  padding: 0.45rem 0.75rem;
  font-size: 0.875rem;
  outline: none;
  transition: border-color 0.15s;
  background: #fff;
  width: 100%;
  box-sizing: border-box;
}
.form-group input:focus, .form-group textarea:focus { border-color: #6366f1; }
.stc-actions { display: flex; gap: 0.5rem; }

/* Enrollment summary */
.enrollment-summary h3 { font-size: 1rem; font-weight: 700; margin: 0 0 0.35rem; }
.enrollment-grid { display: flex; gap: 2rem; flex-wrap: wrap; margin-top: 0.875rem; }
.enrollment-item { display: flex; flex-direction: column; gap: 0.2rem; }
.enrollment-item strong { font-size: 1.75rem; font-weight: 800; color: #111827; line-height: 1; }
.enrollment-item span { font-size: 0.8125rem; color: #6b7280; }
.enrollment-link { color: #6366f1; text-decoration: none; font-size: 0.75rem; }
.enrollment-link:hover { text-decoration: underline; }

/* Share */
.share-row { display: flex; gap: 0.5rem; margin-top: 0.75rem; }
.share-input {
  flex: 1;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  background: #f9fafb;
  outline: none;
  cursor: pointer;
  color: #374151;
}

/* Buttons */
.btn { padding: 0.5rem 1rem; border-radius: 0.5rem; font-size: 0.875rem; font-weight: 500; cursor: pointer; border: none; text-decoration: none; display: inline-flex; align-items: center; }
.btn-primary { background: #4338ca; color: #fff; }
.btn-primary:hover:not(:disabled) { background: #3730a3; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary { background: #fff; border: 1px solid #e5e7eb; color: #374151; }
.btn-secondary:hover { border-color: #d1d5db; background: #f9fafb; }
.btn-sm { padding: 0.375rem 0.75rem; font-size: 0.8125rem; }
</style>
