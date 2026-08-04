<template>
  <AdaptiveIntakeShell
    :branding="config?.branding"
    :program-title="config?.agency?.name || 'Join'"
    :form-title="pageTitle"
    form-subtitle="Adaptive Intake"
    :pathway-badge="pathwayBadge"
    :progress-steps="sidebarSteps"
    :progress-index="stepIndex"
    :sidebar-steps="sidebarSteps"
    :help-blocks="helpBlocks"
    :cover-mode="loading || !!loadError || submitted"
    :show-top-progress="phase !== 'pathway' && !submitted"
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

    <DigitalFormSuccess
      v-else-if="submitted"
      title="You're all set."
      :body="successBody"
    />

    <AdaptiveIntakePathwayChoice
      v-else-if="phase === 'pathway'"
      v-model="selectedPathway"
      :title="config?.copy?.welcomeTitle"
      :subtitle="config?.copy?.welcomeSubtitle"
      :quick="quickCard"
      :full="fullCard"
      @continue="onPathwayContinue"
    />

    <template v-else-if="phase === 'quick'">
      <!-- Step: who for -->
      <div v-if="quickStep === 0">
        <h1 class="ai-page-title">Who is this for?</h1>
        <p class="ai-page-lead">This helps us set up the right kind of account and follow-up.</p>
        <div class="ai-pathway-grid" style="grid-template-columns: 1fr;">
          <button
            v-for="opt in whoForOptions"
            :key="opt.value"
            type="button"
            class="ai-pathway-card"
            :class="{ 'ai-pathway-card--selected': form.whoFor === opt.value }"
            @click="form.whoFor = opt.value"
          >
            <h2 class="ai-pathway-card-title" style="font-size: 1.05rem;">{{ opt.label }}</h2>
            <p class="ai-pathway-card-desc">{{ opt.description }}</p>
          </button>
        </div>
      </div>

      <!-- Step: basics -->
      <div v-else-if="quickStep === 1">
        <h1 class="ai-page-title">Let's get to know you.</h1>
        <p class="ai-page-lead">Just the basics so we can reach you. This only takes a few minutes.</p>
        <div class="field-row">
          <DigitalFormField v-model="form.respondent.firstName" label="Your first name" required />
          <DigitalFormField v-model="form.respondent.lastName" label="Your last name" required />
        </div>
        <DigitalFormField v-model="form.respondent.email" type="email" label="Email" required />
        <DigitalFormField v-model="form.respondent.phone" type="tel" label="Phone" required />
        <template v-if="form.whoFor !== 'myself'">
          <h2 style="margin: 1.25rem 0 0.5rem; font-size: 1.05rem;">Prospective client</h2>
          <div class="field-row">
            <DigitalFormField v-model="form.client.firstName" label="Client first name" required />
            <DigitalFormField v-model="form.client.lastName" label="Client last name" required />
          </div>
          <DigitalFormField v-model="form.client.ageOrDob" label="Age or date of birth (optional)" />
        </template>
      </div>

      <!-- Step: needs -->
      <div v-else-if="quickStep === 2">
        <h1 class="ai-page-title">What support are you looking for?</h1>
        <p class="ai-page-lead">Select all that apply. You can share more detail below.</p>
        <div class="ai-concern-grid">
          <button
            v-for="c in concernOptions"
            :key="c.value"
            type="button"
            class="ai-pathway-card"
            :class="{ 'ai-pathway-card--selected': form.concerns.includes(c.value) }"
            style="padding: 0.85rem;"
            @click="toggleConcern(c.value)"
          >
            <strong>{{ c.label }}</strong>
          </button>
        </div>
        <DigitalFormField
          v-model="form.notes"
          type="textarea"
          label="Anything else you'd like us to know? (optional)"
          :rows="3"
        />
      </div>

      <!-- Step: preferences -->
      <div v-else-if="quickStep === 3">
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
          placeholder="e.g. Tuesdays, Thursday afternoons"
        />
        <DigitalFormField
          v-model="form.preferences.insuranceOrPayment"
          label="Insurance or payment (optional)"
        />
      </div>

      <!-- Step: provider preview -->
      <div v-else-if="quickStep === 4">
        <AdaptiveProviderPreview
          v-model:selected-id="form.preferredProviderUserId"
          :providers="providers"
          :loading="providersLoading"
          :error="providersError"
          @skip="quickStep = 5"
        />
      </div>

      <!-- Step: review -->
      <div v-else>
        <h1 class="ai-page-title">Review & submit</h1>
        <p class="ai-page-lead">Confirm the details below. Our team will follow up within 1–2 business days.</p>
        <div class="ai-help-card" style="margin-bottom: 1rem;">
          <p><strong>For:</strong> {{ whoForLabel }}</p>
          <p><strong>Contact:</strong> {{ form.respondent.firstName }} {{ form.respondent.lastName }} · {{ form.respondent.email }} · {{ form.respondent.phone }}</p>
          <p v-if="form.whoFor !== 'myself'">
            <strong>Client:</strong> {{ form.client.firstName }} {{ form.client.lastName }}
          </p>
          <p v-if="form.concerns.length"><strong>Interests:</strong> {{ concernLabels }}</p>
          <p v-if="form.preferences.preferredModality">
            <strong>Format:</strong> {{ form.preferences.preferredModality }}
          </p>
        </div>
        <div v-if="submitError" class="df-banner df-banner--warn">{{ submitError }}</div>
      </div>

      <div class="df-actions" style="margin-top: 1.25rem; display: flex; justify-content: space-between; gap: 0.75rem;">
        <button type="button" class="df-btn df-btn-secondary" @click="goBack">Back</button>
        <button
          type="button"
          class="df-btn df-btn-primary"
          :disabled="submitting || !canContinueQuick"
          @click="onQuickContinue"
        >
          {{ quickStep >= 5 ? (submitting ? 'Submitting…' : 'Submit interest form') : 'Continue' }}
        </button>
      </div>
    </template>
  </AdaptiveIntakeShell>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { DigitalFormField, DigitalFormSuccess } from '../../components/digital-form';
import {
  AdaptiveIntakeShell,
  AdaptiveIntakePathwayChoice,
  AdaptiveProviderPreview
} from '../../components/adaptive-intake';

const route = useRoute();
const router = useRouter();
const agencySlug = computed(() =>
  String(route.params.organizationSlug || route.params.agencySlug || '').trim()
);

const loading = ref(true);
const loadError = ref('');
const config = ref(null);
const phase = ref('pathway');
const selectedPathway = ref('');
const quickStep = ref(0);
const submitting = ref(false);
const submitError = ref('');
const submitted = ref(false);
const confirmation = ref(null);

const providers = ref([]);
const providersLoading = ref(false);
const providersError = ref('');

const form = reactive({
  whoFor: 'child',
  respondent: { firstName: '', lastName: '', email: '', phone: '' },
  client: { firstName: '', lastName: '', ageOrDob: '' },
  concerns: [],
  notes: '',
  preferences: {
    preferredModality: '',
    preferredTimeOfDay: '',
    preferredDaysRaw: '',
    insuranceOrPayment: ''
  },
  preferredProviderUserId: null
});

const whoForOptions = [
  { value: 'myself', label: 'Myself', description: 'I will be the client receiving services.' },
  {
    value: 'child',
    label: 'My child / dependent',
    description: 'I am a parent or guardian completing this for my child or dependent.'
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
  { value: 'school', label: 'School-based' },
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
  return [
    { id: 'who', label: 'Who is this for?' },
    { id: 'basics', label: 'Basic Information' },
    { id: 'needs', label: 'What support?' },
    { id: 'prefs', label: 'Preferences' },
    { id: 'providers', label: 'Provider preview' },
    { id: 'review', label: 'Review & Submit' }
  ];
});

const stepIndex = computed(() => {
  if (phase.value === 'pathway') return 0;
  return Math.min(quickStep.value, sidebarSteps.value.length - 1);
});

const pathwayBadge = computed(() => {
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

const quickCard = computed(() => ({
  title: config.value?.copy?.quickTitle || 'Quick Prospective',
  tagline: 'A short form to get you started.',
  description: 'Perfect if you are exploring services and want our team to follow up.',
  duration: '~ 5–10 min',
  bullets: ['Basic contact information', 'Reason for seeking support', 'Preferred communication'],
  cta: 'Start Quick Intake →',
  footer: 'You can add more details later.'
}));

const fullCard = computed(() => ({
  title: config.value?.copy?.fullTitle || 'In-Depth Intake Packet',
  tagline: 'A comprehensive intake experience.',
  description: 'Best when you are ready to provide full information for personalized care.',
  duration: '~ 25–35 min',
  bullets: ['All basic information', 'Detailed history & concerns', 'Documents & signatures'],
  cta: 'Start Full Intake →',
  footer: 'More complete = better personalized care.',
  enabled: !!config.value?.pathways?.full?.enabled,
  disabledReason: config.value?.pathways?.full?.disabledReason
}));

const helpBlocks = computed(() => {
  if (phase.value === 'pathway') {
    return [
      {
        id: 'next',
        icon: '📅',
        title: 'What happens next?',
        bullets: [
          'Our team reviews your information',
          'We reach out about next steps',
          'No commitment required to explore'
        ]
      },
      {
        id: 'why',
        icon: '💚',
        title: 'Why we ask',
        body: 'A little information helps us match you with the right resources and providers.'
      }
    ];
  }
  if (quickStep.value === 2) {
    return [
      {
        id: 'why',
        icon: '?',
        title: 'Why we ask',
        body: 'Understanding your needs helps us prepare a helpful follow-up conversation.'
      },
      {
        id: 'control',
        icon: '🔒',
        title: "You're in control",
        body: 'You can skip details you are not ready to share and add more later.'
      }
    ];
  }
  return [
    {
      id: 'safe',
      icon: '🛡️',
      title: 'Confidential & secure',
      body: 'Your responses are encrypted and only shared with your care team.'
    }
  ];
});

const canContinueQuick = computed(() => {
  if (quickStep.value === 0) return !!form.whoFor;
  if (quickStep.value === 1) {
    const r = form.respondent;
    if (!r.firstName.trim() || !r.lastName.trim() || !r.email.trim() || !r.phone.trim()) return false;
    if (form.whoFor !== 'myself') {
      if (!form.client.firstName.trim() || !form.client.lastName.trim()) return false;
    }
    return true;
  }
  return true;
});

const successBody = computed(() => {
  const code = confirmation.value?.identifierCode;
  return `Thanks for reaching out. We've received your interest form${
    code ? ` (ref ${code})` : ''
  }. Our team will follow up within 1–2 business days.`;
});

function toggleConcern(value) {
  const i = form.concerns.indexOf(value);
  if (i >= 0) form.concerns.splice(i, 1);
  else form.concerns.push(value);
}

function goBack() {
  if (phase.value === 'quick' && quickStep.value > 0) {
    quickStep.value -= 1;
    return;
  }
  phase.value = 'pathway';
  quickStep.value = 0;
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
    const clientPayload =
      form.whoFor === 'myself'
        ? {
            firstName: form.respondent.firstName,
            lastName: form.respondent.lastName
          }
        : { ...form.client };

    const { data } = await api.post(`/public/adaptive-intake/${agencySlug.value}/quick`, {
      whoFor: form.whoFor,
      respondent: form.respondent,
      client: clientPayload,
      concerns: form.concerns,
      notes: form.notes,
      preferredProviderUserId: form.preferredProviderUserId,
      preferences: {
        preferredModality: form.preferences.preferredModality || null,
        preferredTimeOfDay: form.preferences.preferredTimeOfDay || null,
        preferredDays,
        insuranceOrPayment: form.preferences.insuranceOrPayment || null
      }
    });
    confirmation.value = data?.confirmation || null;
    submitted.value = true;
  } catch (e) {
    submitError.value = e?.response?.data?.error?.message || e?.message || 'Unable to submit';
  } finally {
    submitting.value = false;
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
    const { data } = await api.get(`/public/adaptive-intake/${agencySlug.value}`);
    config.value = data;
    providers.value = data?.providerPreview || [];
  } catch (e) {
    loadError.value = e?.response?.data?.error?.message || 'Unable to load intake.';
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}
.ai-concern-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.65rem;
  margin-bottom: 1rem;
}
@media (max-width: 640px) {
  .field-row {
    grid-template-columns: 1fr;
  }
}
</style>
