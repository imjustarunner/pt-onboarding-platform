<template>
  <DigitalFormShell
    class="poi-page"
    :branding="formBranding"
    :program-title-override="agency?.name || 'Office Intake'"
    form-subtitle="Request an appointment"
    :progress-steps="progressSteps"
    :progress-index="progressIndex"
    :cover-mode="loadingAgency || !!agencyError || submitted"
  >
    <div v-if="loadingAgency" class="df-loading">Loading…</div>
    <div v-else-if="agencyError" class="df-banner df-banner--warn">{{ agencyError }}</div>

    <DigitalFormSuccess
      v-else-if="submitted"
      :title="`Thanks, ${form.firstName || 'friend'}!`"
      :body="successBody"
    />

    <template v-else>
      <h1 class="df-title">Request an appointment{{ agency?.name ? ` — ${agency.name}` : '' }}</h1>
      <p class="df-subtitle">
        Tell us a bit about what you're looking for and your preferred day/time — we'll follow up to schedule.
      </p>

      <form class="poi-form" @submit.prevent="submit">
        <div class="field-row">
          <DigitalFormField v-model="form.firstName" type="text" label="First name" required />
          <DigitalFormField v-model="form.lastName" type="text" label="Last name" required />
        </div>

        <DigitalFormField v-model="form.contactPhone" type="tel" label="Phone number" required />

        <DigitalFormField
          v-model="form.presentingConcern"
          type="textarea"
          label="What brings you in?"
          placeholder="A short description is helpful but optional"
          :rows="3"
        />

        <div class="field-row">
          <DigitalFormField
            v-model="form.preferredTimeOfDay"
            type="select"
            label="Preferred time of day"
            placeholder="No preference"
            :options="timeOfDayOptions"
          />
          <DigitalFormField
            v-model="form.preferredModality"
            type="select"
            label="Preferred format"
            placeholder="No preference"
            :options="modalityOptions"
          />
        </div>

        <DigitalFormField
          v-model="preferredDaysRaw"
          type="text"
          label="Preferred days (optional)"
          placeholder="e.g. Tuesdays, Thursday afternoons"
        />

        <DigitalFormField
          v-model="form.insuranceOrPayment"
          type="text"
          label="Insurance or payment method (optional)"
        />

        <div v-if="submitError" class="df-banner df-banner--warn">{{ submitError }}</div>

        <div class="df-actions df-actions--end">
          <button type="submit" class="df-btn df-btn-primary" :disabled="submitting">
            {{ submitting ? 'Submitting…' : 'Request appointment' }}
          </button>
        </div>
      </form>
    </template>
  </DigitalFormShell>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import {
  DigitalFormShell,
  DigitalFormField,
  DigitalFormSuccess
} from '../../components/digital-form';

const route = useRoute();
const agencySlug = computed(() => String(route.params.organizationSlug || route.params.agencySlug || '').trim());

const loadingAgency = ref(true);
const agencyError = ref('');
const agency = ref(null);
const formBranding = ref(null);

const progressSteps = [
  { id: 'form', label: 'Request' },
  { id: 'done', label: 'Done' }
];
const progressIndex = computed(() => (submitted.value ? 1 : 0));

const form = reactive({
  firstName: '',
  lastName: '',
  contactPhone: '',
  presentingConcern: '',
  preferredTimeOfDay: '',
  preferredModality: '',
  insuranceOrPayment: ''
});
const preferredDaysRaw = ref('');
const submitting = ref(false);
const submitError = ref('');
const submitted = ref(false);
const confirmation = ref(null);

const timeOfDayOptions = [
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' }
];

const modalityOptions = [
  { value: 'in_person', label: 'In person' },
  { value: 'virtual', label: 'Virtual' },
  { value: 'either', label: 'Either' }
];

const successBody = computed(() => {
  const ref = confirmation.value?.identifierCode
    ? ` (reference #${confirmation.value.identifierCode})`
    : '';
  const office = agency.value?.name || 'our office';
  return `We received your request${ref}. Someone from ${office} will reach out to confirm your appointment.`;
});

async function loadAgency() {
  loadingAgency.value = true;
  agencyError.value = '';
  try {
    const res = await api.get(`/public/office-intake/${encodeURIComponent(agencySlug.value)}`);
    agency.value = res.data?.agency || null;
    formBranding.value = res.data?.branding || null;
  } catch (e) {
    agencyError.value = e?.response?.data?.error?.message || 'This intake link is not available.';
  } finally {
    loadingAgency.value = false;
  }
}

async function submit() {
  submitting.value = true;
  submitError.value = '';
  try {
    const res = await api.post(`/public/office-intake/${encodeURIComponent(agencySlug.value)}`, {
      ...form,
      preferredDays: preferredDaysRaw.value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    });
    confirmation.value = res.data?.confirmation || null;
    submitted.value = true;
  } catch (e) {
    submitError.value = e?.response?.data?.error?.message || e?.message || 'Failed to submit. Please try again.';
  } finally {
    submitting.value = false;
  }
}

onMounted(loadAgency);
</script>

<style scoped>
.df-loading {
  padding: 2rem 0;
  color: var(--df-muted);
  text-align: center;
}
.poi-form {
  display: grid;
  gap: 4px;
  margin-top: 8px;
}
.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
@media (max-width: 480px) {
  .field-row {
    grid-template-columns: 1fr;
  }
}
</style>
