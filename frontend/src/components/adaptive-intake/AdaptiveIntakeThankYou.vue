<template>
  <div class="ai-thankyou">
    <div class="ai-thankyou-hero">
      <div class="ai-thankyou-icon" aria-hidden="true">✓</div>
      <h1 class="ai-thankyou-title">Thank you!</h1>
      <p class="ai-thankyou-lead">
        Your interest form has been submitted successfully. We appreciate you taking the time to share this information with us.
      </p>
      <p v-if="referenceCode" class="ai-thankyou-ref">Reference: <strong>{{ referenceCode }}</strong></p>
    </div>

    <div class="ai-thankyou-grid">
      <div v-for="item in highlights" :key="item.title" class="ai-thankyou-card">
        <div class="ai-thankyou-card-icon" aria-hidden="true">{{ item.icon }}</div>
        <strong>{{ item.title }}</strong>
        <p>{{ item.body }}</p>
      </div>
    </div>

    <section class="ai-thankyou-next">
      <h2>What happens next?</h2>
      <ol class="ai-thankyou-timeline">
        <li v-for="step in nextSteps" :key="step.title">
          <strong>{{ step.title }}</strong>
          <span>{{ step.body }}</span>
        </li>
      </ol>
    </section>

    <div class="ai-thankyou-download">
      <p>You can save your interest form summary for your records.</p>
      <button type="button" class="df-btn df-btn-secondary" @click="downloadSummary">
        Download summary
      </button>
    </div>

    <section class="ai-thankyou-support">
      <h2>Questions in the meantime?</h2>
      <div v-if="supportPhone || supportEmail" class="ai-thankyou-contact">
        <a v-if="supportPhone" :href="supportPhoneTel">{{ supportPhoneDisplay }}</a>
        <span v-if="supportPhone && supportEmail"> · </span>
        <a v-if="supportEmail" :href="`mailto:${supportEmail}`">{{ supportEmail }}</a>
      </div>
      <form class="ai-thankyou-form" @submit.prevent="submitSupport">
        <DigitalFormField v-model="supportForm.name" label="Your name" required />
        <DigitalFormField v-model="supportForm.email" type="email" label="Email" required />
        <DigitalFormField
          v-model="supportForm.message"
          type="textarea"
          label="How can we help?"
          :rows="4"
          required
        />
        <div v-if="supportError" class="df-banner df-banner--warn">{{ supportError }}</div>
        <div v-if="supportSent" class="df-banner df-banner--success">Message sent. Our team will follow up soon.</div>
        <button type="submit" class="df-btn df-btn-primary" :disabled="supportSending">
          {{ supportSending ? 'Sending…' : 'Contact support' }}
        </button>
      </form>
    </section>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import api from '../../services/api';
import { DigitalFormField } from '../digital-form';

const props = defineProps({
  agencySlug: { type: String, required: true },
  agencyName: { type: String, default: '' },
  confirmation: { type: Object, default: null },
  supportContact: { type: Object, default: null }
});

const supportForm = reactive({
  name: '',
  email: '',
  message: ''
});
const supportSending = ref(false);
const supportSent = ref(false);
const supportError = ref('');

const referenceCode = computed(() => props.confirmation?.identifierCode || '');
const summary = computed(() => props.confirmation?.summary || {});
const supportEmail = computed(
  () => props.supportContact?.email || props.confirmation?.supportContact?.email || ''
);
const supportPhone = computed(
  () => props.supportContact?.phone || props.confirmation?.supportContact?.phone || ''
);
const supportPhoneDisplay = computed(() => {
  const phone = supportPhone.value;
  const ext = props.supportContact?.phoneExtension || props.confirmation?.supportContact?.phoneExtension;
  if (!phone) return '';
  return ext ? `${phone} ext. ${ext}` : phone;
});
const supportPhoneTel = computed(() => {
  const digits = String(supportPhone.value || '').replace(/\D/g, '');
  return digits ? `tel:${digits}` : '#';
});

watch(
  () => props.confirmation?.summary,
  (summaryValue) => {
    if (!summaryValue) return;
    if (!supportForm.name && summaryValue.contactName) supportForm.name = summaryValue.contactName;
    if (!supportForm.email && summaryValue.contactEmail) supportForm.email = summaryValue.contactEmail;
  },
  { immediate: true }
);

const highlights = [
  {
    icon: '✉',
    title: 'Confirmation received',
    body: 'We have your interest form on file and will review it shortly.'
  },
  {
    icon: '◎',
    title: 'Personalized match',
    body: 'Our team uses your preferences to find the right provider fit.'
  },
  {
    icon: '📞',
    title: 'We’ll reach out',
    body: 'Expect a call or email within 1–2 business days.'
  },
  {
    icon: '💬',
    title: 'We’re here to help',
    body: 'Reach out anytime using the contact options below.'
  }
];

const nextSteps = [
  { title: 'Review', body: 'Our team reviews your information.' },
  { title: 'Match', body: 'We identify the best provider and format for you.' },
  { title: 'Connect', body: 'We reach out to schedule or answer questions.' },
  { title: 'Get started', body: 'Begin services when you are ready.' }
];

function buildSummaryText() {
  const s = summary.value || {};
  const lines = [
    `${props.agencyName || 'Interest form'} — submission summary`,
    referenceCode.value ? `Reference: ${referenceCode.value}` : null,
    props.confirmation?.submittedAt ? `Submitted: ${props.confirmation.submittedAt}` : null,
    '',
    s.whoForLabel ? `For: ${s.whoForLabel}` : null,
    s.contactName ? `Contact: ${s.contactName}` : null,
    s.contactEmail ? `Email: ${s.contactEmail}` : null,
    s.contactPhone ? `Phone: ${s.contactPhone}` : null,
    s.clientName && s.whoForLabel !== 'Myself' ? `Client: ${s.clientName}` : null,
    s.birthdate ? `Date of birth: ${s.birthdate}` : null,
    s.homeAddress ? `Home address: ${s.homeAddress}` : null,
    s.concerns?.length ? `Interests: ${s.concerns.join(', ')}` : null,
    s.accomplishGoal ? `Goals: ${s.accomplishGoal}` : null,
    s.notes ? `Additional notes: ${s.notes}` : null,
    s.preferredModality ? `Preferred format: ${s.preferredModality}` : null,
    s.preferredTimeOfDay ? `Preferred time: ${s.preferredTimeOfDay}` : null,
    s.preferredDays?.length ? `Preferred days: ${s.preferredDays.join(', ')}` : null,
    s.insuranceOrPayment ? `Insurance / payment: ${s.insuranceOrPayment}` : null
  ].filter(Boolean);
  return lines.join('\n');
}

function downloadSummary() {
  const blob = new Blob([buildSummaryText()], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `interest-form-summary${referenceCode.value ? `-${referenceCode.value}` : ''}.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function submitSupport() {
  supportError.value = '';
  supportSending.value = true;
  try {
    await api.post(`/public/adaptive-intake/${encodeURIComponent(props.agencySlug)}/support-inquiry`, {
      name: supportForm.name.trim(),
      email: supportForm.email.trim(),
      message: supportForm.message.trim(),
      referenceCode: referenceCode.value || null,
      clientId: props.confirmation?.clientId || null
    });
    supportSent.value = true;
    supportForm.message = '';
  } catch (e) {
    supportError.value = e?.response?.data?.error?.message || 'Unable to send your message right now.';
  } finally {
    supportSending.value = false;
  }
}
</script>

<style scoped>
.ai-thankyou {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  max-width: 720px;
}

.ai-thankyou-hero {
  text-align: center;
}

.ai-thankyou-icon {
  width: 4rem;
  height: 4rem;
  margin: 0 auto 0.75rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--df-primary) 14%, #fff);
  color: var(--df-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.75rem;
  font-weight: 700;
}

.ai-thankyou-title {
  margin: 0 0 0.35rem;
  font-size: 2rem;
}

.ai-thankyou-lead {
  margin: 0;
  color: var(--df-muted);
}

.ai-thankyou-ref {
  margin: 0.75rem 0 0;
  font-size: 0.92rem;
}

.ai-thankyou-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

.ai-thankyou-card {
  background: #fff;
  border: 1px solid var(--df-border);
  border-radius: 14px;
  padding: 0.85rem;
}

.ai-thankyou-card-icon {
  font-size: 1.1rem;
  margin-bottom: 0.35rem;
}

.ai-thankyou-card p {
  margin: 0.35rem 0 0;
  color: var(--df-muted);
  font-size: 0.9rem;
}

.ai-thankyou-next h2,
.ai-thankyou-support h2 {
  margin: 0 0 0.65rem;
  font-size: 1.1rem;
}

.ai-thankyou-timeline {
  margin: 0;
  padding-left: 1.2rem;
  display: grid;
  gap: 0.55rem;
}

.ai-thankyou-timeline li {
  display: grid;
  gap: 0.1rem;
}

.ai-thankyou-timeline span {
  color: var(--df-muted);
  font-size: 0.92rem;
}

.ai-thankyou-download {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.85rem 1rem;
  border-radius: 14px;
  background: color-mix(in srgb, var(--df-border) 35%, #fff);
}

.ai-thankyou-download p {
  margin: 0;
  color: var(--df-muted);
}

.ai-thankyou-support {
  padding-top: 0.25rem;
}

.ai-thankyou-contact {
  margin-bottom: 0.85rem;
}

.ai-thankyou-contact a {
  color: var(--df-primary);
}

.ai-thankyou-form {
  display: grid;
  gap: 0.65rem;
}

@media (max-width: 640px) {
  .ai-thankyou-grid {
    grid-template-columns: 1fr;
  }
}
</style>
