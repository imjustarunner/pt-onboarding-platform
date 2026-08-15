<template>
  <div
    v-if="showJoinBoot"
    class="ajl-boot"
    :style="{ backgroundImage: `url(${bootThemeUrl})` }"
    aria-hidden="true"
  />
  <AdaptiveJoinLanding
    v-else-if="config && !loadError && !submitted && phase === 'pathway'"
    :config="config"
    :agency-slug="agencySlug"
    :service-type="resolvedServiceType"
    :quick="quickCard"
    :full="fullCard"
    :contact-phone="joinContactPhone"
    :contact-tel="joinContactTel"
    :contact-email="joinContactEmail"
    :can-edit="canEditLanding"
    @continue="onPathwayContinue"
    @contact-support="openJoinSupport"
  />
  <AdaptiveIntakeShell
    v-else-if="!loading || submitted || phase !== 'pathway'"
    class="ai-shell-host--join-flow"
    :branding="config?.branding"
    :program-title="config?.agency?.name || 'Join'"
    :form-title="pageTitle"
    form-subtitle="Adaptive Intake"
    :pathway-badge="pathwayBadge"
    :progress-steps="sidebarSteps"
    :progress-index="stepIndex"
    :sidebar-steps="sidebarSteps"
    :decor-hero-url="decorHero.url"
    :decor-hero-alt="decorHero.alt"
    :decor-hero-frame-style="decorHero.frameStyle"
    :decor-hero-image-position="decorHero.imagePosition"
    :cover-mode="loading || !!loadError || submitted || phase === 'pathway'"
    :wide="phase === 'quick' || submitted"
    :contact-phone-display="joinContactPhone"
    :contact-phone-tel="joinContactTel"
    :contact-email="joinContactEmail"
    :show-contact-support-action="!!joinContactEmail"
    contact-support-label="Send a message"
    :sidebar-editing="editingSidebar"
    @contact-support="openJoinSupport"
    @update-sidebar-label="onSidebarLabel"
  >
    <template #header-left>
      <button
        v-if="phase !== 'pathway' && !submitted"
        type="button"
        class="df-btn df-btn-secondary"
        style="padding: 0.35rem 0.75rem; font-size: 0.85rem;"
        @click="goBack"
      >
        ← Back
      </button>
    </template>

    <div v-if="loading" class="df-loading">Loading…</div>
    <div v-else-if="loadError" class="df-banner df-banner--warn">{{ loadError }}</div>

    <AdaptiveIntakeThankYou
      v-else-if="submitted"
      :agency-slug="agencySlug"
      :agency-name="config?.agency?.name || ''"
      :confirmation="confirmation"
      :support-contact="config?.supportContact"
      :logo-url="thankYouLogoUrl"
    />

    <template v-else-if="phase === 'quick'">
      <div class="ai-join-stage">
      <div v-if="canEditLanding" class="ai-join-devfill">
        <template v-if="!editingSidebar">
          <button type="button" @click="startEditSidebar">Edit side panel</button>
        </template>
        <template v-else>
          <button type="button" @click="cancelEditSidebar">Cancel</button>
          <button type="button" :disabled="savingSidebar" @click="saveSidebarSteps">
            {{ savingSidebar ? 'Saving…' : 'Save side panel' }}
          </button>
        </template>
        <button type="button" @click="devFillQuick">Dev Fill</button>
      </div>
      <div v-if="editingSidebar" class="ai-join-sidebar-editor">
        <strong>Left-side step guide</strong>
        <p>These labels show in the green panel on the left. Change them here, then save.</p>
        <label v-for="(step, i) in sidebarDraft" :key="step.id || i">
          Step {{ i + 1 }}
          <input v-model="step.label" />
        </label>
        <span v-if="sidebarSaveError" class="ai-join-sidebar-error">{{ sidebarSaveError }}</span>
        <span v-if="sidebarSaveOk" class="ai-join-sidebar-ok">{{ sidebarSaveOk }}</span>
      </div>
      <!-- Step: who for + basics -->
      <div v-if="quickStep === 0" class="ai-join-form">
        <h1 class="ai-page-title">Let's get to know you.</h1>
        <p v-if="isCoGuardianInvitee" class="ai-page-lead">
          You are completing your own information. You will not see what the other parent submitted.
          You can edit your name, phone, and email (email is your username).
        </p>
        <p v-else class="ai-page-lead">Just the basics so we can reach you. This only takes a few minutes.</p>
        <p v-if="!isCoGuardianInvitee" class="ai-who-label">Who is this for?</p>
        <div v-if="!isCoGuardianInvitee" class="ai-who-inline">
          <button
            v-for="opt in whoForOptions"
            :key="opt.value"
            type="button"
            class="ai-pathway-card"
            :class="{ 'ai-pathway-card--selected': form.whoFor === opt.value }"
            @click="chooseWhoFor(opt.value)"
          >
            <h2 class="ai-pathway-card-title">{{ opt.label }}</h2>
            <p class="ai-pathway-card-desc">{{ opt.description }}</p>
          </button>
        </div>
        <div class="field-row field-row--compact">
          <DigitalFormField v-model="form.respondent.firstName" label="Your first name" required size="compact" />
          <DigitalFormField v-model="form.respondent.middleName" label="Middle name" size="compact" />
          <DigitalFormField v-model="form.respondent.lastName" label="Your last name" required size="compact" />
        </div>
        <div class="field-row field-row--compact">
          <DigitalFormField
            v-model="form.respondent.email"
            type="email"
            label="Email"
            placeholder="name@gmail.com"
            required
            size="email"
            :email-domain-hints="true"
            :error="fieldErrors.email"
            @blur="validateBasicsField('email')"
          />
          <DigitalFormField v-model="form.respondent.phone" type="tel" label="Phone" required size="xs" :error="fieldErrors.phone" @blur="validateBasicsField('phone')" />
          <DigitalFormField
            v-model="form.birthdate"
            type="date"
            :label="form.whoFor === 'myself' ? 'Date of birth' : 'Dependent date of birth'"
            required
            size="xs"
          />
        </div>
        <DigitalFormField v-model="form.address.street" label="Street address" required />
        <div class="field-row field-row--compact">
          <DigitalFormField v-model="form.address.apt" label="Apartment (if applicable)" size="compact" />
          <DigitalFormField v-model="form.address.zip" label="ZIP" required size="xs" />
          <DigitalFormField v-model="form.address.city" label="City" required size="compact" />
          <DigitalFormField v-model="form.address.state" label="State" required size="xs" />
        </div>
        <template v-if="form.whoFor !== 'myself'">
          <h2 class="ai-dependent-heading">Dependent 1</h2>
          <div class="field-row field-row--compact">
            <DigitalFormField v-model="form.client.firstName" label="First name" required size="compact" />
            <DigitalFormField v-model="form.client.middleName" label="Middle name" size="compact" />
            <div>
              <button
                v-if="form.respondent.lastName"
                type="button"
                class="ai-same-as-me"
                @click="form.client.lastName = form.respondent.lastName"
              >Same as me</button>
              <DigitalFormField v-model="form.client.lastName" label="Last name" required size="compact" />
            </div>
          </div>
          <OtherGuardianIntakeFields
            v-if="!isCoGuardianInvitee"
            class="ai-other-guardian"
            :model="form.otherGuardian"
            :copy="otherGuardianCopy"
            :error="otherGuardianError"
          />
        </template>
      </div>

      <!-- Step: needs -->
      <div v-else-if="quickStep === 1" class="ai-join-form">
        <h1 class="ai-page-title">What support are you looking for?</h1>
        <p class="ai-page-lead">Select all that apply. You can share more detail below.</p>
        <div class="ai-concern-grid">
          <button
            v-for="c in concernOptions"
            :key="c.value"
            type="button"
            class="ai-pathway-card ai-concern-chip"
            :class="{ 'ai-pathway-card--selected': form.concerns.includes(c.value) }"
            @click="toggleConcern(c.value)"
          >
            <strong>{{ c.label }}</strong>
          </button>
        </div>
        <DigitalFormField
          v-model="form.accomplishGoal"
          type="textarea"
          label="What would you like to accomplish?"
          :rows="3"
        />
        <DigitalFormField
          v-model="form.notes"
          type="textarea"
          label="Anything else you'd like us to know? (optional)"
          :rows="3"
        />
      </div>

      <!-- Step: preferences -->
      <div v-else-if="quickStep === 2" class="ai-join-form">
        <h1 class="ai-page-title">Preferences & availability</h1>
        <p class="ai-page-lead">Optional — helps us match format and timing.</p>
        <div class="field-row">
          <DigitalFormField
            v-model="form.preferences.preferredModality"
            type="select"
            label="Preferred format"
            placeholder="No preference"
            :options="modalityOptions"
          />
          <DigitalFormField
            v-model="form.preferences.preferredTimeOfDay"
            type="select"
            label="Preferred time of day"
            placeholder="No preference"
            :options="timeOptions"
          />
        </div>
        <DigitalFormField
          v-model="form.preferences.preferredDaysRaw"
          label="Preferred days (optional)"
          placeholder="e.g. Tuesdays, weekends, Thursday afternoons"
        />
        <DigitalFormField
          v-model="form.preferences.insuranceOrPayment"
          label="Insurance or payment (optional)"
        />
      </div>

      <!-- Step: provider preview -->
      <div v-else-if="quickStep === 3" class="ai-join-form">
        <AdaptiveProviderPreview
          v-model:selected-id="form.preferredProviderUserId"
          :providers="providers"
          :loading="providersLoading"
          :error="providersError"
          @skip="form.preferredProviderUserId = null; quickStep = 4"
        />
      </div>

      <!-- Step: consent / contact permission -->
      <div v-else-if="quickStep === 4" class="ai-join-form">
        <h1 class="ai-page-title">Permission to contact you</h1>
        <p class="ai-page-lead">Please review and accept the following before submitting.</p>
        <div class="ai-consent-box">
          <div class="ai-consent-icon" aria-hidden="true">🔒</div>
          <div class="ai-consent-body">
            <h3 class="ai-consent-heading">Contact authorization</h3>
            <p>
              By submitting this interest form, I authorize {{ config?.agency?.name || 'this organization' }}
              to contact me via phone, email, or text at the information I provided above, for the purpose
              of scheduling services and providing follow-up care coordination.
            </p>
            <p>
              I understand that submitting this form does not guarantee service and does not create a
              treatment relationship. My information will be handled confidentially in accordance with
              HIPAA and applicable privacy laws.
            </p>
            <p class="ai-consent-footnote">
              You may withdraw consent at any time by contacting the organization directly.
            </p>
          </div>
        </div>
        <label class="ai-consent-check">
          <input type="checkbox" v-model="form.consentGiven" />
          <span>I have read and agree to the above authorization</span>
        </label>
      </div>

      <!-- Step: review -->
      <div v-else class="ai-join-form">
        <h1 class="ai-page-title">Review & submit</h1>
        <p class="ai-page-lead">Confirm the details below. Our team will follow up within 1–2 business days.</p>
        <div class="ai-help-card" style="margin-bottom: 1rem;">
          <p><strong>For:</strong> {{ whoForLabel }}</p>
          <p><strong>Contact:</strong> {{ form.respondent.firstName }} {{ form.respondent.lastName }} · {{ form.respondent.email }} · {{ form.respondent.phone }}</p>
          <p v-if="form.whoFor !== 'myself'">
            <strong>Dependent 1:</strong> {{ form.client.firstName }} {{ form.client.middleName }} {{ form.client.lastName }}
          </p>
          <p v-if="form.additionalDependent.enabled">
            <strong>Dependent 2:</strong> {{ form.additionalDependent.firstName }} {{ form.additionalDependent.middleName }} {{ form.additionalDependent.lastName }}
            <span v-if="form.additionalDependent.dateOfBirth"> · {{ formatBirthdate(form.additionalDependent.dateOfBirth) }}</span>
          </p>
          <p v-if="form.birthdate"><strong>Date of birth:</strong> {{ formatBirthdate(form.birthdate) }}</p>
          <p v-if="formattedHomeAddress"><strong>Home address:</strong> {{ formattedHomeAddress }}</p>
          <p v-if="form.concerns.length"><strong>Interests:</strong> {{ concernLabels }}</p>
          <p v-if="form.accomplishGoal"><strong>Goals:</strong> {{ form.accomplishGoal }}</p>
          <p v-if="form.notes"><strong>Additional notes:</strong> {{ form.notes }}</p>
          <p v-if="form.preferences.preferredModality">
            <strong>Format:</strong> {{ modalityLabel(form.preferences.preferredModality) }}
          </p>
          <p v-if="form.preferences.preferredTimeOfDay">
            <strong>Preferred time:</strong> {{ timeLabel(form.preferences.preferredTimeOfDay) }}
          </p>
          <p v-if="form.preferences.preferredDaysRaw">
            <strong>Preferred days:</strong> {{ form.preferences.preferredDaysRaw }}
          </p>
          <p v-if="form.preferences.insuranceOrPayment">
            <strong>Insurance / payment:</strong> {{ form.preferences.insuranceOrPayment }}
          </p>
          <p>
            <strong>Provider:</strong>
            {{ preferredProviderLabel }}
          </p>
          <div v-if="form.consentGiven" class="ai-review-ack">
            <strong>You acknowledged:</strong>
            <ul>
              <li>Contact authorization — the team may reach you by phone, email, or text to schedule and coordinate care.</li>
              <li>This form does not guarantee service or create a treatment relationship.</li>
              <li>Your information will be handled confidentially under HIPAA and applicable privacy laws.</li>
              <li>You may withdraw consent at any time by contacting the organization.</li>
            </ul>
          </div>
        </div>
        <template v-if="form.whoFor !== 'myself'">
          <div v-if="!form.additionalDependent.enabled" class="ai-add-dependent">
            <button type="button" class="df-btn df-btn-secondary" @click="form.additionalDependent.enabled = true">
              + Add another dependent
            </button>
            <p>Only a few extra details — both dependents stay linked to this same contact.</p>
          </div>
          <div v-else class="ai-add-dependent-form">
            <div class="ai-add-dependent-head">
              <h2>Dependent 2</h2>
              <button type="button" class="ai-add-dependent-remove" @click="clearAdditionalDependent">Remove</button>
            </div>
            <div class="field-row field-row--compact">
              <DigitalFormField v-model="form.additionalDependent.firstName" label="First name" required size="compact" />
              <DigitalFormField v-model="form.additionalDependent.middleName" label="Middle name" size="compact" />
              <div>
                <button
                  v-if="form.client.lastName || form.respondent.lastName"
                  type="button"
                  class="ai-same-as-me"
                  @click="form.additionalDependent.lastName = form.client.lastName || form.respondent.lastName"
                >Same as first child</button>
                <DigitalFormField v-model="form.additionalDependent.lastName" label="Last name" required size="compact" />
              </div>
              <DigitalFormField v-model="form.additionalDependent.dateOfBirth" type="date" label="Date of birth" required size="xs" />
            </div>
            <DigitalFormField
              v-model="form.additionalDependent.notes"
              type="textarea"
              label="Anything specific we should know about this dependent? (optional)"
              :rows="2"
            />
          </div>
        </template>
        <div v-if="submitError" class="df-banner df-banner--warn">{{ submitError }}</div>
      </div>

      <div class="df-actions ai-join-actions">
        <button type="button" class="df-btn df-btn-secondary" @click="goBack">Back</button>
        <button
          type="button"
          class="df-btn df-btn-primary"
          :disabled="submitting || !canContinueQuick || (quickStep === 4 && !form.consentGiven)"
          @click="onQuickContinue"
        >
          {{ quickStep >= 5 ? (submitting ? 'Submitting…' : 'Submit interest form') : 'Continue' }}
        </button>
      </div>
      </div>
    </template>
  </AdaptiveIntakeShell>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import OtherGuardianIntakeFields from '../../components/public-intake/OtherGuardianIntakeFields.vue';
import api from '../../services/api';
import { DigitalFormField } from '../../components/digital-form';
import { useAuthStore } from '../../store/auth';
import {
  AdaptiveIntakeShell,
  AdaptiveJoinLanding,
  AdaptiveIntakeThankYou,
  AdaptiveProviderPreview
} from '../../components/adaptive-intake';
import { mergeCareersPageWithDefaults } from '../../utils/careersAssets.js';
import {
  resolveSchoolOnboardingSupportEmail,
  resolveSchoolOnboardingSupportPhone
} from '../../utils/schoolGroupEmailSuggestions.js';
import {
  isValidEmailAddress,
  isValidUsPhone,
  normalizeUsPhoneForSubmit
} from '../../utils/contactInput.js';
import {
  JOIN_BOOT_THEME_URL,
  mergeQuickSidebarSteps,
  restoreJoinWelcomeCopy,
  mergeJoinLayout,
  readJoinLandingCache,
  writeJoinLandingCache
} from '../../utils/joinLandingTemplate.js';
import { lookupUsZipCityState } from '../../utils/usZipAutofill.js';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const agencySlug = computed(() =>
  String(route.params.organizationSlug || route.params.agencySlug || '').trim()
);

const serviceType = computed(() => String(route.params.serviceType || '').trim().toLowerCase());
const resolvedServiceType = computed(() =>
  serviceType.value || String(config.value?.activeService?.serviceType || '').trim().toLowerCase()
);

const loading = ref(true);
const loadError = ref('');
const cachedJoin = readJoinLandingCache(
  String(route.params.organizationSlug || route.params.agencySlug || '').trim(),
  String(route.params.serviceType || 'counseling').trim().toLowerCase() || 'counseling'
);
if (cachedJoin?.copy) {
  cachedJoin.copy = restoreJoinWelcomeCopy(cachedJoin.copy, cachedJoin.agency?.name);
  if (cachedJoin.copy.layout) cachedJoin.copy.layout = mergeJoinLayout(cachedJoin.copy.layout);
}
const config = ref((cachedJoin?.agency || cachedJoin?.pathways) ? cachedJoin : null);
const thankYouLogoUrl = computed(() => {
  const branding = config.value?.branding || {};
  const fromApi = String(
    branding.logoUrl
    || branding.agencyLogoUrl
    || branding.organizationLogoUrl
    || config.value?.agency?.logo_url
    || config.value?.agency?.logoUrl
    || ''
  ).trim();
  if (fromApi) return fromApi;
  if (String(agencySlug.value || '').toLowerCase() === 'itsco') {
    return '/assets/provider-action/itsco-logo.png';
  }
  return '';
});
const bootThemeUrl = computed(() =>
  String(config.value?.themeImageUrl || JOIN_BOOT_THEME_URL).trim()
);
const phase = ref('pathway');
const selectedPathway = ref('');
const quickStep = ref(0);
const submitting = ref(false);
const submitError = ref('');
const submitted = ref(false);
const confirmation = ref(null);
const editingSidebar = ref(false);
const savingSidebar = ref(false);
const sidebarSaveError = ref('');
const sidebarSaveOk = ref('');
const sidebarDraft = ref([]);
const showJoinBoot = computed(() =>
  !config.value && loading.value && !loadError.value && !submitted.value && phase.value === 'pathway'
);
const isCoGuardianInvitee = computed(() => Boolean(String(route.query.coGuardian || '').trim()));
const otherGuardianError = ref('');
const otherGuardianCopy = {
  title: 'Custody & other guardian',
  lead: 'If another parent has legal rights, our team will reach out so they can complete their own intake. They will not see what you submit.',
  ageOfConsentNote: 'We follow applicable Colorado law and professional ethics. In Colorado, a minor 12 or older may be able to consent to psychotherapy in some situations. This is information, not legal advice.',
  noEmailWarning: 'We reach out on your behalf. A correct email is best; if you only have a phone number, our team will call to complete their intake.',
  resources: [
    {
      label: 'Colorado age of consent for psychotherapy (CSI / GT alert, 2019)',
      url: 'https://resources.csi.state.co.us/wp-content/uploads/2022/07/GT-Alert_Colorado-Lowers-Age-of-Consent-for-Psychotherapy-Services-to-12-Years-Old.pdf'
    },
    {
      label: 'Colorado HB17-1320 (related bill history)',
      url: 'https://leg.colorado.gov/bills/hb17-1320'
    }
  ],
  rightsLabel: 'Another parent/guardian with legal rights who will complete their own intake?',
  selectOption: 'Select',
  yes: 'Yes — send them their intake',
  no: 'No other guardian with those rights',
  firstName: 'First name',
  lastName: 'Last name',
  email: 'Email (becomes their username)',
  phone: 'Phone',
  relationship: 'Relationship',
  reachOutNote: 'We will reach out to them on your behalf. Please provide their correct email (best) or phone. If you do not have either, upload any court documents you have. Missing contact information can delay start of care.',
  courtDocsLabel: 'Upload court documents (encrypted)',
  courtDocsHelp: 'Files are stored encrypted.',
  viewConsentDetails: 'View custody and consent details',
  chooseFiles: 'Choose Files',
  noFileChosen: 'No file chosen',
  firstPlaceholder: 'First',
  lastPlaceholder: 'Last',
  relationshipPlaceholder: 'e.g., Co-parent, Guardian',
  emailPlaceholder: 'name@email.com',
  phonePlaceholder: '(555) 123-4567',
  close: 'Close'
};

function otherGuardianContactOk() {
  const rights = String(form.otherGuardian.hasLegalRights || '').trim().toLowerCase();
  if (!rights) return false;
  if (rights !== 'yes' && rights !== 'shared') return true;
  const emailOk = String(form.otherGuardian.email || '').includes('@');
  const phoneOk = String(form.otherGuardian.phone || '').replace(/\D/g, '').length >= 7;
  const filesOk = Array.isArray(form.otherGuardian.courtFiles) && form.otherGuardian.courtFiles.length > 0;
  return emailOk || phoneOk || filesOk;
}

const fieldErrors = reactive({
  email: '',
  phone: ''
});

const providers = ref([]);
const providersLoading = ref(false);
const providersError = ref('');

const form = reactive({
  whoFor: 'child',
  respondent: { firstName: '', middleName: '', lastName: '', email: '', phone: '' },
  client: { firstName: '', middleName: '', lastName: '' },
  birthdate: '',
  address: { street: '', apt: '', city: '', state: '', zip: '' },
  additionalDependent: {
    enabled: false,
    firstName: '',
    middleName: '',
    lastName: '',
    dateOfBirth: '',
    notes: ''
  },
  otherGuardian: {
    hasLegalRights: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    relationship: '',
    courtFiles: []
  },
  concerns: [],
  accomplishGoal: '',
  notes: '',
  preferences: {
    preferredModality: '',
    preferredTimeOfDay: '',
    preferredDaysRaw: '',
    insuranceOrPayment: ''
  },
  preferredProviderUserId: null,
  consentGiven: false
});

const whoForOptions = [
  { value: 'myself', label: 'Myself', description: 'I will be the client receiving services.' },
  {
    value: 'child',
    label: 'My dependent',
    description: 'I am a parent or guardian completing this for a dependent.'
  },
  {
    value: 'legal',
    label: 'Someone I have legal authority for',
    description: 'I am completing this for someone I have legal authority to care for.'
  }
];

const modalityOptions = [
  { value: 'in_person', label: 'In person' },
  { value: 'virtual', label: 'Virtual' },
  { value: 'either', label: 'No preference' }
];

const timeOptions = [
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
  { value: 'flexible', label: 'Flexible' }
];

const sidebarSteps = computed(() => {
  if (phase.value === 'pathway') {
    return [
      { id: 'start', label: 'Get Started' },
      { id: 'about', label: 'About You' },
      { id: 'prefs', label: 'Preferences' },
      { id: 'review', label: 'Review & Submit' }
    ];
  }
  if (editingSidebar.value && sidebarDraft.value.length) return sidebarDraft.value;
  return mergeQuickSidebarSteps(config.value?.copy?.quickSidebarSteps);
});

const stepIndex = computed(() => {
  if (phase.value === 'pathway') return 0;
  return Math.min(quickStep.value, sidebarSteps.value.length - 1);
});

const pathwayBadge = computed(() => {
  const svc = config.value?.activeService?.displayName;
  if (svc) return svc;
  if (phase.value === 'quick') return config.value?.copy?.quickTitle || 'Quick Prospective';
  if (selectedPathway.value === 'full') return config.value?.copy?.fullTitle || 'In-Depth Intake';
  return '';
});

const pageTitle = computed(() => {
  if (submitted.value) return 'Thank you';
  if (phase.value === 'quick') return sidebarSteps.value[quickStep.value]?.label || 'Quick Prospective';
  return 'Get Started';
});

const concernOptions = computed(() => config.value?.concernOptions || []);

const whoForLabel = computed(
  () => whoForOptions.find((o) => o.value === form.whoFor)?.label || form.whoFor
);

const concernLabels = computed(() =>
  form.concerns
    .map((v) => concernOptions.value.find((c) => c.value === v)?.label || v)
    .join(', ')
);

const formattedHomeAddress = computed(() => {
  const a = form.address || {};
  const line1 = [a.street, a.apt].map((v) => String(v || '').trim()).filter(Boolean).join(', ');
  const line2 = [a.city, a.state, a.zip].map((v) => String(v || '').trim()).filter(Boolean).join(', ');
  return [line1, line2].filter(Boolean).join(', ');
});

const preferredProviderLabel = computed(() => {
  if (!form.preferredProviderUserId) return 'Let the team choose / first available';
  const match = (providers.value || []).find((p) => Number(p.id) === Number(form.preferredProviderUserId));
  return match?.displayName || match?.name || 'Preferred provider selected';
});

const consentAcknowledgmentLines = [
  'Contact authorization — the team may reach you by phone, email, or text to schedule and coordinate care.',
  'This form does not guarantee service or create a treatment relationship.',
  'Your information will be handled confidentially under HIPAA and applicable privacy laws.',
  'You may withdraw consent at any time by contacting the organization.'
];

function modalityLabel(value) {
  return modalityOptions.find((o) => o.value === value)?.label || value;
}

function timeLabel(value) {
  return timeOptions.find((o) => o.value === value)?.label || value;
}

function formatBirthdate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parsed = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

const quickCard = computed(() => {
  const c = config.value?.copy || {};
  return {
    title: c.quickTitle || 'Quick Prospective',
    tagline: c.quickTagline || 'A short form to get you started.',
    description: c.quickDescription || 'Perfect if you are exploring services and want our team to follow up.',
    duration: c.quickDuration || '5–10 min',
    bullets: c.quickBullets || ['Basic contact information', 'Reason for seeking support', 'Preferred communication'],
    cta: c.quickCta || 'Start Quick Intake →',
    footer: c.quickFooter || 'You can add more details later.'
  };
});

const fullCard = computed(() => {
  const c = config.value?.copy || {};
  return {
    title: c.fullTitle || 'In-Depth Intake Packet',
    tagline: c.fullTagline || 'A comprehensive intake experience.',
    description: c.fullDescription || 'Best when you are ready to provide full information for personalized care.',
    duration: c.fullDuration || '25–35 min',
    bullets: c.fullBullets || ['All basic information', 'Detailed history & concerns', 'Documents & signatures'],
    cta: c.fullCta || 'Start Full Intake →',
    footer: c.fullFooter || 'More complete = better personalized care.',
    enabled: !!config.value?.pathways?.full?.enabled,
    disabledReason: config.value?.pathways?.full?.disabledReason
  };
});

const decorHero = computed(() => {
  if (phase.value === 'quick' || submitted.value) {
    return { url: '', alt: '', frameStyle: 'preframed', imagePosition: 'center center' };
  }
  const slug = config.value?.agency?.slug || agencySlug.value;
  const name = config.value?.agency?.name || '';
  const page = mergeCareersPageWithDefaults(config.value?.decorHero || {}, { slug, agencyName: name });
  return {
    url: String(page.heroImageUrl || '').trim(),
    alt: String(page.heroImageAlt || `${name || 'Organization'} intake`).trim(),
    frameStyle: String(page.heroFrameStyle || 'preframed').trim().toLowerCase(),
    imagePosition: String(page.heroImagePosition || 'center center').trim()
  };
});

const joinSupportAgency = computed(() => ({
  slug: config.value?.agency?.slug || agencySlug.value,
  portal_url: config.value?.agency?.slug || agencySlug.value,
  phone: config.value?.supportContact?.phone || config.value?.agency?.phone,
  phone_number: config.value?.supportContact?.phone || config.value?.agency?.phone,
  phoneExtension: config.value?.supportContact?.phoneExtension,
  phone_extension: config.value?.supportContact?.phoneExtension,
  supportEmail: config.value?.supportContact?.email,
  onboarding_team_email: config.value?.agency?.onboarding_team_email
}));
const joinContactEmail = computed(() =>
  resolveSchoolOnboardingSupportEmail(joinSupportAgency.value)
  || String(config.value?.supportContact?.email || '').trim()
);
const joinContactPhoneInfo = computed(() => resolveSchoolOnboardingSupportPhone(joinSupportAgency.value));
const joinContactPhone = computed(() => joinContactPhoneInfo.value?.display || '');
const joinContactTel = computed(() => String(joinContactPhoneInfo.value?.tel || '').replace(/^tel:/, ''));

const canEditLanding = computed(() => {
  if (!authStore.isAuthenticated) return false;
  const user = authStore.user;
  const role = String(user?.role || '').toLowerCase();
  if (role !== 'admin' && role !== 'super_admin' && role !== 'support') return false;
  if (role === 'super_admin') return true;
  const agencyId = Number(config.value?.agency?.id || 0);
  if (!agencyId) return false;
  const lists = [user?.agencyIds, user?.agencies];
  try {
    const stored = JSON.parse(localStorage.getItem('userAgencies') || 'null');
    if (stored) lists.push(stored);
  } catch { /* ignore */ }
  return lists.some((list) =>
    Array.isArray(list) && list.some((a) => Number(a?.id ?? a) === agencyId)
  );
});

function openJoinSupport() {
  if (!agencySlug.value) return;
  router.push(`/${encodeURIComponent(agencySlug.value)}/support?topic=intake_join`);
}

const canContinueQuick = computed(() => {
  if (quickStep.value === 0) {
    if (!form.whoFor) return false;
    const r = form.respondent;
    if (!r.firstName.trim() || !r.lastName.trim() || !r.email.trim() || !r.phone.trim()) return false;
    if (!isValidEmailAddress(r.email) || !isValidUsPhone(r.phone)) return false;
    if (!form.birthdate.trim()) return false;
    if (!form.address.street.trim() || !form.address.city.trim() || !form.address.state.trim() || !form.address.zip.trim()) return false;
    if (form.whoFor !== 'myself') {
      if (!form.client.firstName.trim()) return false;
      if (!isCoGuardianInvitee.value && !form.client.lastName.trim()) return false;
      if (!isCoGuardianInvitee.value) {
        if (!otherGuardianContactOk()) return false;
      }
    }
    return true;
  }
  if (quickStep.value === 5 && form.whoFor !== 'myself' && form.additionalDependent.enabled) {
    return !!form.additionalDependent.firstName.trim()
      && !!form.additionalDependent.lastName.trim()
      && !!form.additionalDependent.dateOfBirth.trim();
  }
  return true;
});

function validateBasicsField(field) {
  if (field === 'email') {
    const email = form.respondent.email.trim();
    if (!email) {
      fieldErrors.email = 'Email is required.';
    } else if (!isValidEmailAddress(email)) {
      fieldErrors.email = 'Enter a valid email (e.g. name@gmail.com).';
    } else {
      fieldErrors.email = '';
    }
    return;
  }
  if (field === 'phone') {
    const phone = form.respondent.phone.trim();
    if (!phone) {
      fieldErrors.phone = 'Phone is required.';
    } else if (!isValidUsPhone(phone)) {
      fieldErrors.phone = 'Enter a valid 10-digit US phone number.';
    } else {
      fieldErrors.phone = '';
    }
  }
}

function validateBasicsFields() {
  validateBasicsField('email');
  validateBasicsField('phone');
  return !fieldErrors.email && !fieldErrors.phone;
}

function startEditSidebar() {
  sidebarDraft.value = mergeQuickSidebarSteps(config.value?.copy?.quickSidebarSteps);
  editingSidebar.value = true;
  sidebarSaveError.value = '';
  sidebarSaveOk.value = '';
}

function cancelEditSidebar() {
  editingSidebar.value = false;
  sidebarDraft.value = [];
  sidebarSaveError.value = '';
}

function onSidebarLabel({ index, label }) {
  if (!sidebarDraft.value[index]) return;
  sidebarDraft.value[index] = { ...sidebarDraft.value[index], label };
}

async function saveSidebarSteps() {
  const slug = agencySlug.value;
  if (!slug) {
    sidebarSaveError.value = 'Unable to save.';
    return;
  }
  savingSidebar.value = true;
  sidebarSaveError.value = '';
  try {
    const steps = mergeQuickSidebarSteps(sidebarDraft.value);
    const existing = { ...(config.value?.copy || {}), quickSidebarSteps: steps };
    const { data } = await api.patch(`/public/adaptive-intake/${encodeURIComponent(slug)}/landing`, {
      serviceType: resolvedServiceType.value || serviceType.value || 'counseling',
      copy: existing
    }, { skipGlobalLoading: true });
    if (config.value) {
      config.value.copy = { ...(config.value.copy || {}), ...(data?.copy || existing), quickSidebarSteps: steps };
      writeJoinLandingCache(slug, resolvedServiceType.value || serviceType.value || 'counseling', config.value);
    }
    editingSidebar.value = false;
    sidebarSaveOk.value = 'Saved.';
    setTimeout(() => { sidebarSaveOk.value = ''; }, 4000);
  } catch (e) {
    sidebarSaveError.value = e?.response?.data?.error?.message || e?.message || 'Could not save.';
  } finally {
    savingSidebar.value = false;
  }
}

function chooseWhoFor(value) {
  form.whoFor = value;
}

function clearAdditionalDependent() {
  form.additionalDependent.enabled = false;
  form.additionalDependent.firstName = '';
  form.additionalDependent.middleName = '';
  form.additionalDependent.lastName = '';
  form.additionalDependent.dateOfBirth = '';
  form.additionalDependent.notes = '';
}

watch(() => form.address.zip, async (zip) => {
  const found = await lookupUsZipCityState(zip);
  if (!found) return;
  form.address.city = found.city || form.address.city;
  form.address.state = found.state || form.address.state;
});

const DEV_FILL_PEOPLE = [
  { first: 'Noah', last: 'Haddad', child: 'Amira', dob: '1985-10-24' },
  { first: 'Renee', last: 'Salazar', child: 'Mateo', dob: '1991-03-08' },
  { first: 'Curtis', last: 'Whitfield', child: 'June', dob: '1978-07-19' }
];

function devFillQuick() {
  const person = DEV_FILL_PEOPLE[Math.floor(Math.random() * DEV_FILL_PEOPLE.length)];
  const stamp = Math.floor(Math.random() * 90) + 10;
  form.whoFor = form.whoFor || 'myself';
  Object.assign(form.respondent, {
    firstName: person.first,
    middleName: '',
    lastName: person.last,
    email: `${person.first}.${person.last}${stamp}@example.com`.toLowerCase(),
    phone: '7195557878'
  });
  form.client.firstName = person.child;
  form.client.middleName = '';
  form.client.lastName = person.last;
  form.birthdate = person.dob;
  Object.assign(form.address, {
    street: '412 Cascade Avenue',
    apt: 'Unit 3',
    city: 'Colorado Springs',
    state: 'CO',
    zip: '80903'
  });
  if (!form.concerns.length) {
    const first = concernOptions.value[0]?.value;
    if (first) form.concerns.push(first);
  }
  form.accomplishGoal = 'I want steadier routines and better ways to handle stress before it builds up.';
  form.notes = 'Weekday afternoons are easiest for us, and we would rather meet in person to start.';
  Object.assign(form.preferences, {
    preferredModality: 'in_person',
    preferredTimeOfDay: 'afternoon',
    preferredDaysRaw: 'Tuesdays, Thursdays',
    insuranceOrPayment: 'Aetna PPO'
  });
  form.consentGiven = true;
  validateBasicsFields();
}

function toggleConcern(value) {
  const i = form.concerns.indexOf(value);
  if (i >= 0) form.concerns.splice(i, 1);
  else form.concerns.push(value);
}

function joinWelcomePath() {
  const slug = agencySlug.value;
  const svc = resolvedServiceType.value || serviceType.value || 'counseling';
  if (!slug) return '';
  if (route.params.organizationSlug) {
    return `/${encodeURIComponent(slug)}/join/${encodeURIComponent(svc)}`;
  }
  return `/join/${encodeURIComponent(slug)}/${encodeURIComponent(svc)}`;
}

function goBack() {
  if (phase.value === 'quick' && quickStep.value > 0) {
    quickStep.value -= 1;
    return;
  }
  if (phase.value === 'quick') {
    phase.value = 'pathway';
    quickStep.value = 0;
    return;
  }
  const welcome = joinWelcomePath();
  if (welcome && route.path !== welcome) {
    router.push(welcome);
  }
}

function onPathwayContinue(pathway) {
  if (pathway === 'full') {
    const key = config.value?.pathways?.full?.publicKey;
    if (!key) return;
    router.push(`/intake/${key}`);
    return;
  }
  phase.value = 'quick';
  quickStep.value = 0;
  loadProviders();
}

async function loadProviders() {
  providersLoading.value = true;
  providersError.value = '';
  try {
    const { data } = await api.get(`/public/adaptive-intake/${agencySlug.value}/providers`);
    providers.value = data?.providers || config.value?.providerPreview || [];
  } catch (e) {
    providers.value = config.value?.providerPreview || [];
    if (!providers.value.length) {
      providersError.value = e?.response?.data?.error?.message || '';
    }
  } finally {
    providersLoading.value = false;
  }
}

async function onQuickContinue() {
  if (quickStep.value === 0) {
    if (!validateBasicsFields()) return;
    if (form.whoFor !== 'myself' && !isCoGuardianInvitee.value && !otherGuardianContactOk()) {
      otherGuardianError.value = 'Please enter their email or phone so we can reach out on your behalf.';
      return;
    }
    otherGuardianError.value = '';
  }
  if (quickStep.value < 5) {
    quickStep.value += 1;
    return;
  }
  await submitQuick();
}

async function submitQuick() {
  submitting.value = true;
  submitError.value = '';
  try {
    const preferredDays = String(form.preferences.preferredDaysRaw || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const respondent = {
      ...form.respondent,
      email: form.respondent.email.trim(),
      phone: normalizeUsPhoneForSubmit(form.respondent.phone)
    };
    if (isCoGuardianInvitee.value) {
      const token = String(route.query.coGuardian || '').trim();
      const { data } = await api.post(`/public/adaptive-intake/co-guardian/${encodeURIComponent(token)}/quick`, {
        contact: respondent,
        answers: {
          whoFor: form.whoFor,
          respondent,
          client: { ...form.client },
          birthdate: form.birthdate,
          homeAddress: formattedHomeAddress.value,
          address: { ...form.address },
          concerns: form.concerns,
          accomplishGoal: form.accomplishGoal.trim() || null,
          notes: form.notes,
          preferences: {
            preferredModality: form.preferences.preferredModality || null,
            preferredTimeOfDay: form.preferences.preferredTimeOfDay || null,
            preferredDays,
            insuranceOrPayment: form.preferences.insuranceOrPayment || null
          }
        }
      });
      confirmation.value = data?.confirmation || null;
      submitted.value = true;
      return;
    }
    const clientPayload =
      form.whoFor === 'myself'
        ? {
            firstName: form.respondent.firstName,
            middleName: form.respondent.middleName,
            lastName: form.respondent.lastName
          }
        : { ...form.client };

    const additionalDependents =
      form.whoFor !== 'myself' && form.additionalDependent.enabled
        ? [{
            firstName: form.additionalDependent.firstName,
            middleName: form.additionalDependent.middleName,
            lastName: form.additionalDependent.lastName,
            dateOfBirth: form.additionalDependent.dateOfBirth,
            notes: form.additionalDependent.notes
          }]
        : [];

    const { data } = await api.post(`/public/adaptive-intake/${agencySlug.value}/quick`, {
      serviceType: serviceType.value || config.value?.activeService?.serviceType || null,
      whoFor: form.whoFor,
      respondent: {
        ...form.respondent,
        email: form.respondent.email.trim(),
        phone: normalizeUsPhoneForSubmit(form.respondent.phone)
      },
      client: clientPayload,
      birthdate: form.birthdate,
      homeAddress: formattedHomeAddress.value,
      address: { ...form.address },
      concerns: form.concerns,
      accomplishGoal: form.accomplishGoal.trim() || null,
      notes: form.notes,
      preferredProviderUserId: form.preferredProviderUserId,
      preferences: {
        preferredModality: form.preferences.preferredModality || null,
        preferredTimeOfDay: form.preferences.preferredTimeOfDay || null,
        preferredDays,
        insuranceOrPayment: form.preferences.insuranceOrPayment || null
      },
      consentGiven: form.consentGiven,
      acknowledgments: form.consentGiven ? consentAcknowledgmentLines : [],
      additionalDependents
    });
    confirmation.value = data?.confirmation || null;
    submitted.value = true;
    const rights = form.otherGuardian.hasLegalRights;
    const otherEmailOk = String(form.otherGuardian.email || '').includes('@');
    const otherPhoneOk = String(form.otherGuardian.phone || '').replace(/\D/g, '').length >= 7;
    if (
      !isCoGuardianInvitee.value
      && form.whoFor !== 'myself'
      && (rights === 'yes' || rights === 'shared')
      && (otherEmailOk || otherPhoneOk)
    ) {
      const clientIds = (data?.confirmation?.packetClients || [])
        .map((row) => Number(row.clientId))
        .filter(Boolean);
      if (clientIds.length) {
        try {
          const inviteResp = await api.post(`/public/adaptive-intake/${agencySlug.value}/co-guardian-invite`, {
            source: 'quick',
            clientIds,
            sendEmail: otherEmailOk,
            otherGuardian: {
              ...form.otherGuardian,
              legalAuthority: rights,
              sendInvite: true
            }
          });
          confirmation.value = {
            ...confirmation.value,
            coGuardianInvite: inviteResp.data
          };
        } catch {
          /* invite is optional — form already submitted */
        }
      }
    }
  } catch (e) {
    submitError.value = e?.response?.data?.error?.message || e?.message || 'Unable to submit';
  } finally {
    submitting.value = false;
  }
}

async function applyCoGuardianInviteFromQuery() {
  const token = String(route.query.coGuardian || '').trim();
  if (!token) return;
  try {
    const { data } = await api.get(`/public/adaptive-intake/co-guardian/${encodeURIComponent(token)}`);
    const invite = data?.invite;
    if (!invite) return;
    phase.value = 'quick';
    selectedPathway.value = 'quick';
    form.whoFor = 'child';
    if (invite.contact) {
      if (invite.contact.firstName) form.respondent.firstName = invite.contact.firstName;
      if (invite.contact.lastName) form.respondent.lastName = invite.contact.lastName;
      if (invite.contact.email) form.respondent.email = invite.contact.email;
      if (invite.contact.phone) form.respondent.phone = invite.contact.phone;
    }
    const deps = Array.isArray(invite.dependents) ? invite.dependents : [];
    if (deps[0]?.firstName) form.client.firstName = deps[0].firstName;
    if (deps[1]?.firstName) {
      form.additionalDependent.enabled = true;
      form.additionalDependent.firstName = deps[1].firstName;
    }
  } catch {
    /* keep the normal join flow */
  }
}

onMounted(async () => {
  loading.value = true;
  loadError.value = '';
  try {
    if (!agencySlug.value) {
      loadError.value = 'Missing organization.';
      return;
    }
    const params = serviceType.value ? { serviceType: serviceType.value } : {};
    const { data } = await api.get(`/public/adaptive-intake/${agencySlug.value}`, {
      params,
      skipGlobalLoading: true
    });
    config.value = data;
    if (config.value?.copy) {
      config.value.copy = restoreJoinWelcomeCopy(config.value.copy, config.value.agency?.name);
      if (config.value.copy.layout) {
        config.value.copy.layout = mergeJoinLayout(config.value.copy.layout);
      }
    }
    writeJoinLandingCache(agencySlug.value, resolvedServiceType.value || serviceType.value || 'counseling', data);
    providers.value = data?.providerPreview || [];

    await applyCoGuardianInviteFromQuery();

    const services = Array.isArray(data?.intakeServices) ? data.intakeServices : [];
    if (!isCoGuardianInvitee.value && services.length > 1 && !data?.activeService && !serviceType.value) {
      await router.replace(joinWelcomePath() || `/join/${encodeURIComponent(agencySlug.value)}/counseling`);
      return;
    }
    if (services.length === 0) {
      loadError.value = 'No intake services are available right now.';
    }
  } catch (e) {
    loadError.value = e?.response?.data?.error?.message || 'Unable to load intake.';
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.ajl-boot {
  min-height: 100dvh;
  background-size: cover;
  background-position: center;
  background-color: #0f3d3a;
}
.ai-join-stage {
  width: 100%;
  max-width: none;
}
.ai-join-form {
  width: 100%;
}
.ai-join-actions {
  margin-top: 1.5rem;
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
}
.ai-join-devfill {
  position: relative;
  z-index: 50;
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 0.5rem;
}
.ai-join-sidebar-editor {
  position: relative;
  z-index: 40;
  margin-bottom: 1rem;
  padding: 0.85rem 1rem;
  border: 1px dashed #94a3b8;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.95);
  display: grid;
  gap: 0.45rem;
}
.ai-join-sidebar-editor strong {
  font-size: 0.92rem;
}
.ai-join-sidebar-editor p {
  margin: 0;
  font-size: 0.82rem;
  color: #475569;
}
.ai-join-sidebar-editor label {
  display: grid;
  gap: 0.2rem;
  font-size: 0.75rem;
  font-weight: 700;
  color: #334155;
}
.ai-join-sidebar-editor input {
  font: inherit;
  font-weight: 500;
  padding: 0.35rem 0.5rem;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
}
.ai-join-sidebar-error {
  color: #b42318;
  font-size: 0.8rem;
}
.ai-join-sidebar-ok {
  color: #166534;
  font-size: 0.8rem;
}
.ai-join-devfill button {
  border: 1px dashed #94a3b8;
  background: #fff;
  border-radius: 999px;
  padding: 0.3rem 0.8rem;
  font-size: 0.75rem;
  font-weight: 700;
  color: #334155;
  cursor: pointer;
}
.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}
.field-row--compact {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem 0.75rem;
  align-items: flex-end;
}
.field-row--compact :deep(.df-field) {
  margin-bottom: 0.35rem;
}
.ai-who-label {
  margin: 0 0 0.45rem;
  font-size: 0.82rem;
  font-weight: 700;
  color: #35584a;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.ai-who-inline {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
.ai-who-inline .ai-pathway-card {
  flex: 1 1 10.5rem;
  max-width: 16.5rem;
  padding: 0.55rem 0.7rem;
  text-align: left;
}
.ai-who-inline .ai-pathway-card-title {
  font-size: 0.95rem;
  margin: 0;
}
.ai-who-inline .ai-pathway-card-desc {
  font-size: 0.78rem;
  margin: 0.2rem 0 0;
}
.ai-dependent-heading {
  margin: 1rem 0 0.4rem;
  font-size: 1.02rem;
}
.ai-same-as-me {
  display: inline-block;
  margin: 0 0 0.2rem;
  border: 0;
  background: none;
  padding: 0;
  color: var(--df-primary, #1b3d2f);
  font-size: 0.78rem;
  font-weight: 700;
  text-decoration: underline;
  cursor: pointer;
}
.ai-add-dependent {
  margin-top: 1rem;
}
.ai-add-dependent p {
  margin: 0.4rem 0 0;
  font-size: 0.85rem;
  color: #64748b;
}
.ai-add-dependent-form {
  margin-top: 1rem;
  padding: 0.75rem 0.85rem;
  border: 1px solid #d7e3dc;
  border-radius: 12px;
}
.ai-add-dependent-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.45rem;
}
.ai-add-dependent-head h2 {
  margin: 0;
  font-size: 1.02rem;
}
.ai-add-dependent-remove {
  border: 0;
  background: none;
  color: #64748b;
  font-weight: 700;
  cursor: pointer;
}
.field-row--address {
  grid-template-columns: 1.4fr 0.8fr;
}
.ai-join-form :deep(.ai-pathway-card--selected),
.ai-join-form :deep(.ai-concern-chip.ai-pathway-card--selected) {
  background: var(--df-primary, #1b3d2f);
  border-color: var(--df-primary, #1b3d2f);
  color: #fff;
  box-shadow: 0 0 0 1px var(--df-primary, #1b3d2f);
}
.ai-join-form :deep(.ai-pathway-card--selected .ai-pathway-card-title),
.ai-join-form :deep(.ai-pathway-card--selected .ai-pathway-card-desc),
.ai-join-form :deep(.ai-concern-chip.ai-pathway-card--selected strong) {
  color: #fff;
}
.ai-review-ack {
  margin-top: 0.85rem;
  padding-top: 0.75rem;
  border-top: 1px solid #e5e7eb;
}
.ai-review-ack ul {
  margin: 0.4rem 0 0;
  padding-left: 1.15rem;
}
.ai-other-guardian {
  margin-top: 0.75rem;
}
.ai-concern-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.65rem;
  margin-bottom: 1rem;
}
.ai-concern-grid .ai-concern-chip {
  text-align: center;
  align-items: center;
  justify-content: center;
  padding: 0.55rem 0.65rem;
  min-height: 0;
}
.ai-concern-grid .ai-concern-chip strong {
  font-size: 0.92rem;
  line-height: 1.25;
}
@media (max-width: 640px) {
  .field-row,
  .field-row--address {
    grid-template-columns: 1fr;
  }
}
/* Consent step */
.ai-consent-box {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 12px;
  padding: 1.2rem 1.25rem;
  margin-bottom: 1.2rem;
}
.ai-consent-icon {
  font-size: 1.5rem;
  flex-shrink: 0;
  margin-top: 0.1rem;
}
.ai-consent-heading {
  font-size: 1rem;
  font-weight: 700;
  margin: 0 0 0.6rem;
}
.ai-consent-body p {
  margin: 0 0 0.65rem;
  font-size: 0.9rem;
  line-height: 1.6;
  color: #1a2f2a;
}
.ai-consent-footnote {
  font-size: 0.8rem !important;
  color: #4b5563 !important;
}
.ai-consent-check {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
  color: #111827;
}
.ai-consent-check input[type="checkbox"] {
  width: 1.1rem;
  height: 1.1rem;
  margin-top: 0.15rem;
  accent-color: var(--primary, #2d6a4f);
  flex-shrink: 0;
  cursor: pointer;
}
</style>
