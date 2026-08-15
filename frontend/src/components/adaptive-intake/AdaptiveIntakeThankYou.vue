<template>
  <div class="ai-thankyou">
    <div class="ai-thankyou-hero">
      <div class="ai-thankyou-icon" aria-hidden="true">✓</div>
      <h1 class="ai-thankyou-title">You're all set</h1>
      <p class="ai-thankyou-lead">
        Your interest form was received. Keep this confirmation for your records — our team will follow up within 1–2 business days.
      </p>
    </div>

    <section v-if="portalAccess?.email && !portalDismissed" class="ai-portal-card">
      <h2>Your portal login</h2>
      <p class="ai-portal-why">
        Your username is this email. You can keep it or change it after you sign in.
        You can skip this for now — for medical records we may still need you to have an account.
      </p>
      <dl class="ai-portal-creds">
        <div>
          <dt>Email</dt>
          <dd>{{ portalAccess.email }}</dd>
        </div>
        <div v-if="portalPassword">
          <dt>Password</dt>
          <dd class="ai-portal-password">
            <code>{{ portalPassword }}</code>
            <button type="button" class="ai-link-btn" @click="copyPassword">
              {{ passwordCopied ? 'Copied' : 'Copy' }}
            </button>
          </dd>
        </div>
        <div v-else>
          <dt>Password</dt>
          <dd>Use the password you already have for this email.</dd>
        </div>
      </dl>
      <a class="df-btn df-btn-primary" :href="portalHref">Sign in</a>
      <button type="button" class="df-btn df-btn-secondary" :disabled="loginEmailing" @click="emailLoginDetails">
        {{ loginEmailing ? 'Sending…' : 'Email these login details' }}
      </button>
      <button type="button" class="df-btn df-btn-secondary" @click="portalDismissed = true">I'll do this later</button>
      <p v-if="loginEmailStatus" class="ai-email-copy-status">{{ loginEmailStatus }}</p>
    </section>

    <section v-if="coGuardianInvite?.inviteUrl" class="ai-portal-card">
      <h2>Other guardian</h2>
      <p>Share this private link. They will not see what you submitted.</p>
      <p><code>{{ coGuardianInvite.inviteUrl }}</code></p>
      <p v-if="coGuardianInvite.emailed">We also emailed {{ coGuardianInvite.email }}.</p>
    </section>

    <article class="ai-receipt">
      <header class="ai-receipt-letterhead">
        <img v-if="logoUrl" class="ai-receipt-logo" :src="logoUrl" :alt="agencyName || 'Organization logo'" />
        <div class="ai-receipt-org">
          <strong>{{ agencyName || 'Interest form' }}</strong>
          <span>Interest form confirmation</span>
        </div>
        <div v-if="referenceCode" class="ai-receipt-ref">
          <span>Reference</span>
          <strong>{{ referenceCode }}</strong>
        </div>
      </header>

      <p class="ai-receipt-meta">
        Submitted {{ submittedLabel }}
      </p>

      <section class="ai-receipt-section">
        <h3>About you</h3>
        <dl class="ai-receipt-dl">
          <div v-for="row in aboutRows" :key="row.label">
            <dt>{{ row.label }}</dt>
            <dd>{{ row.value }}</dd>
          </div>
        </dl>
      </section>

      <section v-if="preferenceRows.length" class="ai-receipt-section">
        <h3>Preferences</h3>
        <dl class="ai-receipt-dl">
          <div v-for="row in preferenceRows" :key="row.label">
            <dt>{{ row.label }}</dt>
            <dd>{{ row.value }}</dd>
          </div>
        </dl>
      </section>

      <section v-if="notesRows.length" class="ai-receipt-section">
        <h3>What you shared</h3>
        <dl class="ai-receipt-dl ai-receipt-dl--stack">
          <div v-for="row in notesRows" :key="row.label">
            <dt>{{ row.label }}</dt>
            <dd>{{ row.value }}</dd>
          </div>
        </dl>
      </section>

      <section v-if="acknowledgments.length" class="ai-receipt-acks">
        <h3>You acknowledged</h3>
        <ul>
          <li v-for="(line, i) in acknowledgments" :key="i">{{ line }}</li>
        </ul>
      </section>

      <footer class="ai-receipt-foot">
        This confirmation is for your records. Your information is handled confidentially under HIPAA and applicable privacy laws.
      </footer>
    </article>

    <div class="ai-thankyou-download">
      <p>Download a branded PDF of this confirmation for your records.</p>
      <PhiDownloadNotice />
      <button
        type="button"
        class="df-btn df-btn-primary"
        :disabled="pdfDownloading"
        @click="downloadBrandedPdf"
      >
        {{ pdfDownloading ? 'Preparing PDF…' : (packetClients.length > 1 ? 'Download packets' : 'Download PDF') }}
      </button>
      <div class="ai-email-copy">
        <input v-model="copyEmail" type="email" placeholder="Send a copy to another email" />
        <button type="button" class="df-btn df-btn-secondary" :disabled="emailSending || !copyEmail" @click="emailBrandedPdf">
          {{ emailSending ? 'Sending…' : 'Email PDF' }}
        </button>
      </div>
      <p v-if="emailStatus" class="ai-email-copy-status">{{ emailStatus }}</p>
    </div>
    <p v-if="pdfError" class="ai-thankyou-download-error">{{ pdfError }}</p>

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
import PhiDownloadNotice from './PhiDownloadNotice.vue';

const props = defineProps({
  agencySlug: { type: String, required: true },
  agencyName: { type: String, default: '' },
  confirmation: { type: Object, default: null },
  supportContact: { type: Object, default: null },
  logoUrl: { type: String, default: '' }
});

const supportForm = reactive({
  name: '',
  email: '',
  message: ''
});
const supportSending = ref(false);
const supportSent = ref(false);
const supportError = ref('');
const pdfDownloading = ref(false);
const pdfError = ref('');
const portalDismissed = ref(false);
const loginEmailing = ref(false);
const loginEmailStatus = ref('');
const copyEmail = ref('');
const emailSending = ref(false);
const emailStatus = ref('');
const passwordCopied = ref(false);

const referenceCode = computed(() => props.confirmation?.identifierCode || '');
const summary = computed(() => props.confirmation?.summary || {});
const packetClients = computed(() => {
  const listed = Array.isArray(props.confirmation?.packetClients) ? props.confirmation.packetClients : [];
  if (listed.length) return listed;
  return [{
    clientId: props.confirmation?.clientId || null,
    identifierCode: referenceCode.value,
    initials: '',
    dateOfBirth: summary.value?.birthdate || '',
    clientName: summary.value?.clientName || ''
  }];
});
const portalAccess = computed(() => props.confirmation?.portalAccess || props.confirmation?.temporaryAccess || null);
const coGuardianInvite = computed(() => props.confirmation?.coGuardianInvite || null);
const portalPassword = computed(() =>
  String(portalAccess.value?.password || portalAccess.value?.temporaryPassword || '').trim()
);
const portalHref = computed(() => {
  const slug = String(props.agencySlug || '').trim();
  return slug ? `/${encodeURIComponent(slug)}/login` : '/login';
});
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
  return ext ? `${formatPhone(phone)} ext. ${ext}` : formatPhone(phone);
});
const supportPhoneTel = computed(() => {
  const digits = String(supportPhone.value || '').replace(/\D/g, '');
  return digits ? `tel:${digits}` : '#';
});

const submittedLabel = computed(() => {
  const raw = props.confirmation?.submittedAt;
  if (!raw) return 'just now';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return String(raw);
  return date.toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' });
});

const acknowledgments = computed(() =>
  Array.isArray(summary.value.acknowledgments) ? summary.value.acknowledgments.filter(Boolean) : []
);

const aboutRows = computed(() => {
  const s = summary.value || {};
  return [
    s.whoForLabel ? { label: 'This is for', value: s.whoForLabel } : null,
    s.contactName ? { label: 'Contact', value: s.contactName } : null,
    s.contactEmail ? { label: 'Email', value: s.contactEmail } : null,
    s.contactPhone ? { label: 'Phone', value: formatPhone(s.contactPhone) } : null,
    s.clientName && s.whoForLabel && s.whoForLabel !== 'Myself' ? { label: 'Dependent', value: s.clientName } : null,
    s.birthdate ? { label: 'Date of birth', value: formatDate(s.birthdate) } : null,
    s.homeAddress ? { label: 'Home address', value: s.homeAddress } : null
  ].filter(Boolean);
});

const preferenceRows = computed(() => {
  const s = summary.value || {};
  return [
    s.serviceType ? { label: 'Service', value: s.serviceType } : null,
    s.preferredProvider ? { label: 'Provider', value: s.preferredProvider } : null,
    s.preferredModality ? { label: 'Preferred format', value: s.preferredModality } : null,
    s.preferredTimeOfDay ? { label: 'Preferred time', value: s.preferredTimeOfDay } : null,
    Array.isArray(s.preferredDays) && s.preferredDays.length
      ? { label: 'Preferred days', value: s.preferredDays.join(', ') }
      : null,
    s.insuranceOrPayment ? { label: 'Insurance / payment', value: s.insuranceOrPayment } : null
  ].filter(Boolean);
});

const notesRows = computed(() => {
  const s = summary.value || {};
  return [
    Array.isArray(s.concerns) && s.concerns.length ? { label: 'Interests', value: s.concerns.join(', ') } : null,
    s.accomplishGoal ? { label: 'Goals', value: s.accomplishGoal } : null,
    s.notes ? { label: 'Additional notes', value: s.notes } : null
  ].filter(Boolean);
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

function formatPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return String(value || '').trim();
}

function formatDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00` : raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

async function copyPassword() {
  if (!portalPassword.value) return;
  try {
    await navigator.clipboard.writeText(portalPassword.value);
    passwordCopied.value = true;
    setTimeout(() => { passwordCopied.value = false; }, 2000);
  } catch {
    passwordCopied.value = false;
  }
}

async function emailLoginDetails() {
  loginEmailStatus.value = '';
  loginEmailing.value = true;
  try {
    await api.post(`/public/adaptive-intake/${encodeURIComponent(props.agencySlug)}/portal-login-email`, {
      email: portalAccess.value?.email,
      username: portalAccess.value?.email,
      temporaryPassword: portalPassword.value || null,
      portalPath: portalHref.value
    });
    loginEmailStatus.value = 'Login details sent. Keep that email private.';
  } catch (err) {
    loginEmailStatus.value = err?.response?.data?.error?.message || 'Unable to send login details.';
  } finally {
    loginEmailing.value = false;
  }
}

async function messageFromPdfError(err) {
  const data = err?.response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text());
      return parsed?.error?.message || 'Unable to download PDF';
    } catch {
      return err?.response?.status === 503
        ? 'The branded PDF could not be created right now. Please try again.'
        : 'Unable to download PDF';
    }
  }
  return err?.response?.data?.error?.message || err?.message || 'Unable to download PDF';
}

async function downloadBrandedPdf() {
  pdfError.value = '';
  pdfDownloading.value = true;
  try {
    for (const packet of packetClients.value) {
      const resp = await api.post(
        `/public/adaptive-intake/${encodeURIComponent(props.agencySlug)}/summary-pdf`,
        {
          identifierCode: packet.identifierCode || referenceCode.value || null,
          clientId: packet.clientId || props.confirmation?.clientId || null,
          submittedAt: props.confirmation?.submittedAt || null,
          initials: packet.initials,
          dateOfBirth: packet.dateOfBirth || summary.value?.birthdate,
          clientName: packet.clientName || summary.value?.clientName,
          summary: {
            ...summary.value,
            clientName: packet.clientName || summary.value?.clientName,
            birthdate: packet.dateOfBirth || summary.value?.birthdate,
            acknowledgments: acknowledgments.value
          }
        },
        { responseType: 'blob', timeout: 120000, skipGlobalLoading: true }
      );
      const blob = resp.data instanceof Blob ? resp.data : new Blob([resp.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const tenant = String(props.agencyName || props.agencySlug || 'intake').trim() || 'intake';
      const dob = String(packet.dateOfBirth || summary.value?.birthdate || '').replace(/[^0-9]/g, '');
      anchor.href = url;
      anchor.download = `${[tenant, packet.initials, dob].filter(Boolean).join('-').replace(/[^a-zA-Z0-9._-]+/g, '-')}.pdf`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  } catch (err) {
    pdfError.value = await messageFromPdfError(err);
  } finally {
    pdfDownloading.value = false;
  }
}

async function emailBrandedPdf() {
  emailStatus.value = '';
  emailSending.value = true;
  try {
    for (const packet of packetClients.value) {
      await api.post(
        `/public/adaptive-intake/${encodeURIComponent(props.agencySlug)}/summary-pdf/email`,
        {
          email: String(copyEmail.value || '').trim(),
          identifierCode: packet.identifierCode || referenceCode.value || null,
          clientId: packet.clientId || props.confirmation?.clientId || null,
          submittedAt: props.confirmation?.submittedAt || null,
          initials: packet.initials,
          dateOfBirth: packet.dateOfBirth || summary.value?.birthdate,
          clientName: packet.clientName || summary.value?.clientName,
          summary: {
            ...summary.value,
            clientName: packet.clientName || summary.value?.clientName,
            birthdate: packet.dateOfBirth || summary.value?.birthdate,
            acknowledgments: acknowledgments.value
          }
        },
        { skipGlobalLoading: true }
      );
    }
    emailStatus.value = 'Sent. Remind them this file contains protected health information.';
  } catch (err) {
    emailStatus.value = err?.response?.data?.error?.message || 'Unable to send that copy right now.';
  } finally {
    emailSending.value = false;
  }
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
  max-width: 760px;
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
  margin: 0 auto;
  max-width: 36rem;
  color: var(--df-muted);
}

.ai-portal-card {
  background: #f4faf6;
  border: 1px solid #cfe3d6;
  border-radius: 16px;
  padding: 1.15rem 1.25rem 1.25rem;
}

.ai-portal-card h2,
.ai-thankyou-next h2,
.ai-thankyou-support h2 {
  margin: 0 0 0.45rem;
  font-size: 1.1rem;
}

.ai-portal-why {
  margin: 0 0 0.85rem;
  color: #34564a;
  font-size: 0.92rem;
  line-height: 1.45;
}

.ai-portal-creds {
  margin: 0 0 1rem;
  display: grid;
  gap: 0.65rem;
}

.ai-portal-creds div {
  display: grid;
  gap: 0.15rem;
}

.ai-portal-creds dt {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #5b7168;
}

.ai-portal-creds dd {
  margin: 0;
  font-weight: 600;
}

.ai-portal-password {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  flex-wrap: wrap;
}

.ai-portal-password code {
  font-size: 0.95rem;
  background: #fff;
  border: 1px solid #d7e6dc;
  border-radius: 8px;
  padding: 0.25rem 0.5rem;
}

.ai-link-btn {
  border: 0;
  background: transparent;
  color: var(--df-primary);
  font-weight: 700;
  cursor: pointer;
}

.ai-receipt {
  background: #fff;
  border: 1px solid #d7e2db;
  border-radius: 18px;
  padding: 1.35rem 1.4rem 1.15rem;
  box-shadow: 0 10px 28px rgba(22, 50, 74, 0.06);
}

.ai-receipt-letterhead {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  padding-bottom: 0.9rem;
  border-bottom: 2px solid var(--df-primary, #1b3d2f);
}

.ai-receipt-logo {
  width: 64px;
  height: auto;
  object-fit: contain;
}

.ai-receipt-org {
  display: grid;
  gap: 0.1rem;
  min-width: 0;
}

.ai-receipt-org strong {
  font-size: 1.15rem;
}

.ai-receipt-org span {
  color: var(--df-muted);
  font-size: 0.88rem;
}

.ai-receipt-ref {
  margin-left: auto;
  text-align: right;
}

.ai-receipt-ref span {
  display: block;
  font-size: 0.72rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--df-muted);
}

.ai-receipt-ref strong {
  font-size: 1.15rem;
  letter-spacing: 0.04em;
}

.ai-receipt-meta {
  margin: 0.75rem 0 0;
  color: var(--df-muted);
  font-size: 0.9rem;
}

.ai-receipt-section h3,
.ai-receipt-acks h3 {
  margin: 1.15rem 0 0.45rem;
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--df-primary, #1b3d2f);
}

.ai-receipt-dl {
  margin: 0;
}

.ai-receipt-dl > div {
  display: grid;
  grid-template-columns: 11rem minmax(0, 1fr);
  gap: 0.5rem;
  padding: 0.45rem 0;
  border-bottom: 1px solid #eef3f0;
}

.ai-receipt-dl dt {
  color: #5b7168;
  font-weight: 600;
  font-size: 0.88rem;
}

.ai-receipt-dl dd {
  margin: 0;
}

.ai-receipt-dl--stack > div {
  grid-template-columns: 1fr;
  gap: 0.2rem;
}

.ai-receipt-acks {
  margin-top: 1rem;
  background: #f4faf6;
  border: 1px solid #cfe3d6;
  border-radius: 12px;
  padding: 0.85rem 1rem 0.95rem;
}

.ai-receipt-acks ul {
  margin: 0;
  padding-left: 1.15rem;
}

.ai-receipt-acks li {
  margin: 0.35rem 0;
  font-size: 0.92rem;
  line-height: 1.45;
}

.ai-receipt-foot {
  margin-top: 1.1rem;
  font-size: 0.78rem;
  color: #5b7168;
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
.ai-email-copy {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  width: 100%;
}
.ai-email-copy input {
  flex: 1 1 12rem;
  min-height: 2.4rem;
  border: 1px solid #d7e3dc;
  border-radius: 10px;
  padding: 0.35rem 0.65rem;
}
.ai-email-copy-status {
  width: 100%;
  margin: 0;
  font-size: 0.85rem;
  color: #35584a;
}

.ai-thankyou-download-error {
  margin: -0.75rem 0 0;
  color: #b42318;
  font-size: 0.9rem;
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
  .ai-thankyou-grid,
  .ai-receipt-dl > div {
    grid-template-columns: 1fr;
  }
  .ai-receipt-letterhead {
    flex-wrap: wrap;
  }
  .ai-receipt-ref {
    margin-left: 0;
    text-align: left;
  }
}
</style>
