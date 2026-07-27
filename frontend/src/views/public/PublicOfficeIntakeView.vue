<template>
  <div class="poi-page">
    <div class="poi-card">
      <template v-if="loadingAgency">
        <p class="muted">Loading…</p>
      </template>
      <template v-else-if="agencyError">
        <p class="error">{{ agencyError }}</p>
      </template>
      <template v-else-if="submitted">
        <h1>Thanks, {{ form.firstName || 'friend' }}!</h1>
        <p>
          We received your request{{ confirmation?.identifierCode ? ` (reference #${confirmation.identifierCode})` : '' }}.
          Someone from {{ agency?.name || 'our office' }} will reach out to confirm your appointment.
        </p>
      </template>
      <template v-else>
        <h1>Request an appointment{{ agency?.name ? ` — ${agency.name}` : '' }}</h1>
        <p class="muted">Tell us a bit about what you're looking for and your preferred day/time — we'll follow up to schedule.</p>

        <form class="poi-form" @submit.prevent="submit">
          <div class="field-row">
            <label class="field">
              <span class="label">First name</span>
              <input v-model="form.firstName" class="input" required />
            </label>
            <label class="field">
              <span class="label">Last name</span>
              <input v-model="form.lastName" class="input" required />
            </label>
          </div>

          <label class="field">
            <span class="label">Phone number</span>
            <input v-model="form.contactPhone" class="input" type="tel" required />
          </label>

          <label class="field">
            <span class="label">What brings you in?</span>
            <textarea v-model="form.presentingConcern" rows="3" placeholder="A short description is helpful but optional"></textarea>
          </label>

          <div class="field-row">
            <label class="field">
              <span class="label">Preferred time of day</span>
              <select v-model="form.preferredTimeOfDay" class="select">
                <option value="">No preference</option>
                <option value="morning">Morning</option>
                <option value="afternoon">Afternoon</option>
                <option value="evening">Evening</option>
              </select>
            </label>
            <label class="field">
              <span class="label">Preferred format</span>
              <select v-model="form.preferredModality" class="select">
                <option value="">No preference</option>
                <option value="in_person">In person</option>
                <option value="virtual">Virtual</option>
                <option value="either">Either</option>
              </select>
            </label>
          </div>

          <label class="field">
            <span class="label">Preferred days (optional)</span>
            <input v-model="preferredDaysRaw" class="input" placeholder="e.g. Tuesdays, Thursday afternoons" />
          </label>

          <label class="field">
            <span class="label">Insurance or payment method (optional)</span>
            <input v-model="form.insuranceOrPayment" class="input" />
          </label>

          <div v-if="submitError" class="error">{{ submitError }}</div>

          <button type="submit" class="btn btn-primary" :disabled="submitting">
            {{ submitting ? 'Submitting…' : 'Request appointment' }}
          </button>
        </form>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';

const route = useRoute();
const agencySlug = computed(() => String(route.params.organizationSlug || route.params.agencySlug || '').trim());

const loadingAgency = ref(true);
const agencyError = ref('');
const agency = ref(null);

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

async function loadAgency() {
  loadingAgency.value = true;
  agencyError.value = '';
  try {
    const res = await api.get(`/public/office-intake/${encodeURIComponent(agencySlug.value)}`);
    agency.value = res.data?.agency || null;
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
.poi-page {
  min-height: 100vh;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 40px 16px;
  background: var(--bg, #f8fafc);
}
.poi-card {
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 6px 24px rgba(15, 23, 42, 0.08);
  padding: 28px;
  width: 100%;
  max-width: 560px;
}
.poi-form {
  display: grid;
  gap: 14px;
  margin-top: 16px;
}
.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.field {
  display: grid;
  gap: 6px;
}
.label {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary, #64748b);
}
.input,
.select,
textarea {
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 10px;
  padding: 10px 12px;
  font: inherit;
  width: 100%;
}
textarea {
  resize: vertical;
}
.error {
  color: #c33;
}
.muted {
  color: var(--text-secondary, #64748b);
}
@media (max-width: 480px) {
  .field-row {
    grid-template-columns: 1fr;
  }
}
</style>
