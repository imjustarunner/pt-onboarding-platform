<template>
  <div class="cr-page" :style="brandStyle">
    <div v-if="loading" class="cr-page__state">Loading…</div>
    <div v-else-if="fatalError" class="cr-page__state cr-page__state--err">{{ fatalError }}</div>
    <div v-else-if="optedOut" class="cr-page__state">
      You’re opted out of platform emails for this account. No further renewal messages will be sent.
    </div>
    <div v-else-if="completed && !hasOpenSteps" class="cr-page__state">
      Thank you — this renewal is complete.
    </div>

    <div v-else class="cr-shell">
      <aside class="cr-side">
        <div class="cr-side__brand">
          <img v-if="branding?.logoUrl" :src="branding.logoUrl" alt="" class="cr-side__logo" />
          <p class="cr-side__agency">{{ agencyLabel }}</p>
          <p v-if="schoolName" class="cr-side__school">Supporting {{ schoolName }}</p>
        </div>

        <h1 class="cr-side__title">Client Renewal</h1>
        <p class="cr-side__lead">Let’s keep your information up to date.</p>
        <p class="cr-side__copy">
          To ensure we continue to serve you well at {{ schoolName || 'your school' }}, please complete
          the following steps. This process typically takes just a few minutes.
        </p>
        <p v-if="clientInitials" class="cr-side__participant">For participant {{ clientInitials }}</p>

        <div class="cr-secure">
          <div class="cr-secure__icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </div>
          <div>
            <strong>Your information is secure</strong>
            <p>Your privacy and security are important to us. All documents are stored securely.</p>
          </div>
        </div>

        <section class="cr-help">
          <h2>Need help?</h2>
          <p v-if="supportEmail">
            <a :href="`mailto:${supportEmail}`">{{ supportEmail }}</a>
          </p>
          <form class="cr-help__form" @submit.prevent="submitTicket">
            <label>Subject <input v-model="ticket.subject" type="text" maxlength="255" /></label>
            <label>Message <textarea v-model="ticket.message" rows="3" required maxlength="4000" /></label>
            <button type="submit" class="cr-btn cr-btn--ghost" :disabled="ticketSending">
              {{ ticketSending ? 'Submitting…' : 'Submit support ticket' }}
            </button>
            <p v-if="ticketError" class="err">{{ ticketError }}</p>
            <p v-if="ticketOk" class="ok">Ticket submitted.</p>
          </form>
          <button type="button" class="cr-optout-link" :disabled="optingOut" @click="doOptOut">
            {{ optingOut ? 'Updating…' : 'Remove my contact / stop emails' }}
          </button>
          <p v-if="optOutError" class="err">{{ optOutError }}</p>
        </section>
      </aside>

      <main class="cr-main">
        <p class="cr-main__kicker">Step-by-step</p>
        <h2 class="cr-main__heading">Please complete all steps below.</h2>

        <ol class="cr-steps">
          <li
            v-for="(step, idx) in visibleSteps"
            :key="step.key"
            class="cr-step"
            :class="{
              'is-done': step.done,
              'is-active': activeStepKey === step.key,
              [`cr-step--${step.tone}`]: true
            }"
          >
            <div class="cr-step__rail">
              <span class="cr-step__num">{{ step.done ? '✓' : idx + 1 }}</span>
            </div>
            <div class="cr-step__body">
              <div class="cr-step__head">
                <h3>{{ step.title }}</h3>
                <span v-if="step.done" class="cr-pill">Done</span>
                <span v-else-if="step.recommended" class="cr-pill cr-pill--rec">Recommended</span>
              </div>
              <p>{{ step.description }}</p>

              <form
                v-if="step.key === 'verify' && !step.done && expandedStep === 'verify'"
                class="cr-form"
                @submit.prevent="saveContact"
              >
                <label>First name <input v-model="contact.firstName" type="text" required /></label>
                <label>Last name <input v-model="contact.lastName" type="text" required /></label>
                <label>Email <input v-model="contact.email" type="email" required /></label>
                <label>Phone <input v-model="contact.phone" type="tel" /></label>
                <label>
                  Relationship to student
                  <select v-model="contact.relationship" required>
                    <option value="">Select…</option>
                    <option value="Parent">Parent</option>
                    <option value="Guardian">Guardian</option>
                    <option value="Grandparent">Grandparent</option>
                    <option value="Foster parent">Foster parent</option>
                    <option value="Other">Other</option>
                  </select>
                </label>
                <label>Your date of birth <input v-model="contact.dateOfBirth" type="date" /></label>
                <label>
                  Preferred language
                  <select v-model="contact.primaryLanguage">
                    <option value="">Select…</option>
                    <option value="English">English</option>
                    <option value="Spanish">Spanish</option>
                    <option value="Other">Other</option>
                  </select>
                </label>
                <label>Mailing street <input v-model="contact.addressStreet" type="text" /></label>
                <label>Apt / unit <input v-model="contact.addressApt" type="text" /></label>
                <div class="cr-form__row">
                  <label>City <input v-model="contact.addressCity" type="text" /></label>
                  <label>State <input v-model="contact.addressState" type="text" maxlength="2" /></label>
                  <label>ZIP <input v-model="contact.addressZip" type="text" maxlength="10" /></label>
                </div>
                <button type="submit" class="cr-btn" :class="`cr-btn--${step.tone}`" :disabled="savingContact">
                  {{ savingContact ? 'Saving…' : 'Confirm contact' }}
                </button>
                <p v-if="contactError" class="err">{{ contactError }}</p>
              </form>

              <button
                v-else-if="step.key === 'verify' && !step.done"
                type="button"
                class="cr-btn"
                :class="`cr-btn--${step.tone}`"
                @click="expandedStep = 'verify'"
              >
                Review &amp; Confirm →
              </button>

              <a
                v-else-if="step.href && !step.done"
                class="cr-btn"
                :class="`cr-btn--${step.tone}`"
                :href="step.href"
                target="_blank"
                rel="noopener"
              >
                {{ step.cta }}
              </a>
              <p v-if="step.href && !step.done" class="hint-inline">
                After you finish signing, return to this page — Done updates when the signature is saved.
              </p>
              <p v-else-if="!step.done && step.needsLink" class="err">
                Signing link unavailable — contact support.
              </p>
            </div>
          </li>

          <li class="cr-step cr-step--done-final">
            <div class="cr-step__rail">
              <span class="cr-step__num">✓</span>
            </div>
            <div class="cr-step__body">
              <h3>All set!</h3>
              <p>
                Once all steps are complete, we’ll be notified and will be in touch if we need anything else.
              </p>
            </div>
          </li>
        </ol>
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';

const route = useRoute();
const token = computed(() => String(route.params.token || '').trim());

const loading = ref(true);
const fatalError = ref('');
const branding = ref(null);
const schoolName = ref('');
const agencyName = ref('');
const clientInitials = ref('');
const supportEmail = ref('support@itsco.health');
const options = reactive({
  verifyContact: false,
  smartRoi: false,
  smartDisclosure: false,
  fullPacket: false,
  packetMode: null
});
const recommended = reactive({ smartRoi: false, smartDisclosure: false });
const progress = reactive({
  verifyContactDone: false,
  smartRoiDone: false,
  smartDisclosureDone: false,
  fullPacketDone: false
});
const stepLinks = reactive({ smartRoi: null, smartDisclosure: null, fullPacket: null });
const contact = reactive({
  email: '',
  phone: '',
  firstName: '',
  lastName: '',
  relationship: '',
  dateOfBirth: '',
  primaryLanguage: '',
  addressStreet: '',
  addressApt: '',
  addressCity: '',
  addressState: '',
  addressZip: ''
});
const savingContact = ref(false);
const contactError = ref('');
const optedOut = ref(false);
const completed = ref(false);
const optingOut = ref(false);
const optOutError = ref('');
const ticket = reactive({ subject: '', message: '' });
const ticketSending = ref(false);
const ticketError = ref('');
const ticketOk = ref(false);
const supportPath = ref('');
const expandedStep = ref('');

const brandStyle = computed(() => {
  const primary = branding.value?.primaryColor || '#0f4c81';
  const accent = branding.value?.accentColor || '#0f766e';
  const gold = '#b08d57';
  return {
    '--cr-primary': primary,
    '--cr-accent': accent,
    '--cr-gold': gold
  };
});

const agencyLabel = computed(
  () =>
    String(agencyName.value || branding.value?.agencyName || branding.value?.organizationName || 'ITSCO').trim()
    || 'ITSCO'
);

const visibleSteps = computed(() => {
  const steps = [];
  if (options.verifyContact) {
    steps.push({
      key: 'verify',
      markKey: 'verify_contact',
      title: 'Verify Your Information',
      description:
        'Please review and confirm your contact information, relationship, and mailing address to ensure everything is accurate and up to date.',
      done: progress.verifyContactDone,
      tone: 'navy',
      cta: 'Review & Confirm →'
    });
  }
  if (options.smartRoi) {
    steps.push({
      key: 'roi',
      markKey: 'smart_roi',
      title: 'Sign Updated Smart School ROI',
      description:
        'Please review and electronically sign the updated Smart School Release of Information (ROI).',
      done: progress.smartRoiDone,
      recommended: recommended.smartRoi,
      href: stepLinks.smartRoi,
      needsLink: true,
      tone: 'teal',
      cta: 'Review & Sign →'
    });
  }
  if (options.smartDisclosure) {
    steps.push({
      key: 'disclosure',
      markKey: 'smart_disclosure',
      title: 'Sign Updated Smart Disclosure',
      description: 'Please review and electronically sign the updated Smart Disclosure.',
      done: progress.smartDisclosureDone,
      recommended: recommended.smartDisclosure,
      href: stepLinks.smartDisclosure,
      needsLink: true,
      tone: 'gold',
      cta: 'Review & Sign →'
    });
  }
  if (options.fullPacket) {
    const mode = options.packetMode === 'office' ? 'office' : 'school';
    steps.push({
      key: 'packet',
      markKey: 'full_packet',
      title: 'Complete Enrollment Packet Renewal',
      description: `Please complete the ${mode} enrollment packet renewal. This updates the existing client record.`,
      done: progress.fullPacketDone,
      href: stepLinks.fullPacket,
      needsLink: true,
      tone: 'navy',
      cta: 'Open Packet →'
    });
  }
  return steps;
});

const hasOpenSteps = computed(() => visibleSteps.value.some((s) => !s.done));

const activeStepKey = computed(() => {
  const next = visibleSteps.value.find((s) => !s.done);
  return next?.key || '';
});

const apiBase = '/api/public/client-renewal';

function applyPayload(data) {
  branding.value = data.branding || null;
  schoolName.value = data.schoolName || '';
  agencyName.value = data.agencyName || data.branding?.agencyName || '';
  clientInitials.value = data.clientInitials || '';
  supportEmail.value = data.supportEmail || 'support@itsco.health';
  Object.assign(options, data.options || {});
  Object.assign(recommended, data.recommended || {});
  Object.assign(progress, data.progress || {});
  Object.assign(stepLinks, data.stepLinks || {});
  supportPath.value = data.supportTicketPath || `${apiBase}/${encodeURIComponent(token.value)}/support-tickets`;
  if (data.contactPrefill) {
    contact.email = data.contactPrefill.email || '';
    contact.phone = data.contactPrefill.phone || '';
    contact.firstName = data.contactPrefill.firstName || '';
    contact.lastName = data.contactPrefill.lastName || '';
    contact.relationship = data.contactPrefill.relationship || '';
    contact.dateOfBirth = data.contactPrefill.dateOfBirth
      ? String(data.contactPrefill.dateOfBirth).slice(0, 10)
      : '';
    contact.primaryLanguage = data.contactPrefill.primaryLanguage || '';
    contact.addressStreet = data.contactPrefill.addressStreet || '';
    contact.addressApt = data.contactPrefill.addressApt || '';
    contact.addressCity = data.contactPrefill.addressCity || '';
    contact.addressState = data.contactPrefill.addressState || '';
    contact.addressZip = data.contactPrefill.addressZip || '';
  }
  const st = String(data.status || '');
  optedOut.value = st === 'opted_out';
  completed.value = st === 'completed';
}

async function load() {
  loading.value = true;
  fatalError.value = '';
  try {
    const res = await axios.get(`${apiBase}/${encodeURIComponent(token.value)}`);
    applyPayload(res.data || {});
    if (String(route.query.optOut || '') === '1') {
      await doOptOut();
    }
  } catch (e) {
    fatalError.value = e?.response?.data?.error?.message || 'This renewal link is invalid or expired.';
  } finally {
    loading.value = false;
  }
}

async function saveContact() {
  contactError.value = '';
  savingContact.value = true;
  try {
    const res = await axios.post(`${apiBase}/${encodeURIComponent(token.value)}/verify-contact`, {
      email: contact.email,
      phone: contact.phone,
      firstName: contact.firstName,
      lastName: contact.lastName,
      relationship: contact.relationship,
      dateOfBirth: contact.dateOfBirth,
      primaryLanguage: contact.primaryLanguage,
      addressStreet: contact.addressStreet,
      addressApt: contact.addressApt,
      addressCity: contact.addressCity,
      addressState: contact.addressState,
      addressZip: contact.addressZip
    });
    applyPayload(res.data || {});
    progress.verifyContactDone = true;
    expandedStep.value = '';
  } catch (e) {
    contactError.value = e?.response?.data?.error?.message || 'Could not save contact';
  } finally {
    savingContact.value = false;
  }
}

async function refreshQuiet() {
  try {
    const res = await axios.get(`${apiBase}/${encodeURIComponent(token.value)}`);
    applyPayload(res.data || {});
    return res.data;
  } catch {
    return {};
  }
}

function onVisibility() {
  if (document.visibilityState === 'visible') {
    refreshQuiet();
  }
}

async function doOptOut() {
  optOutError.value = '';
  optingOut.value = true;
  try {
    await axios.post(`${apiBase}/${encodeURIComponent(token.value)}/opt-out`, {});
    optedOut.value = true;
  } catch (e) {
    optOutError.value = e?.response?.data?.error?.message || 'Could not opt out';
  } finally {
    optingOut.value = false;
  }
}

async function submitTicket() {
  ticketError.value = '';
  ticketOk.value = false;
  ticketSending.value = true;
  try {
    await axios.post(supportPath.value, {
      subject: ticket.subject,
      message: ticket.message,
      question: ticket.message,
      email: contact.email || undefined,
      name: [contact.firstName, contact.lastName].filter(Boolean).join(' ') || undefined
    });
    ticketOk.value = true;
    ticket.message = '';
  } catch (e) {
    ticketError.value = e?.response?.data?.error?.message || 'Could not submit ticket';
  } finally {
    ticketSending.value = false;
  }
}

onMounted(() => {
  load();
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('focus', refreshQuiet);
});

onUnmounted(() => {
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('focus', refreshQuiet);
});
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Source+Sans+3:wght@400;600;700&display=swap');

.cr-page {
  min-height: 100vh;
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--cr-primary) 12%, #fff), transparent 40%),
    linear-gradient(135deg, #f4f7fb 0%, #eef2f6 45%, #f7f4ef 100%);
  color: #152238;
  font-family: 'Source Sans 3', 'Segoe UI', sans-serif;
}
.cr-page__state {
  max-width: 640px;
  margin: 48px auto;
  padding: 24px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(21, 34, 56, 0.08);
}
.cr-page__state--err { color: #b91c1c; }
.cr-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(280px, 420px) minmax(0, 1fr);
}
.cr-side {
  background: #fff;
  padding: 36px 32px 48px;
  border-right: 1px solid #e5e9f0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.cr-side__logo {
  max-height: 56px;
  max-width: 180px;
  object-fit: contain;
  margin-bottom: 8px;
}
.cr-side__agency {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--cr-gold);
}
.cr-side__school {
  margin: 0;
  color: #5b6b7c;
  font-size: 0.95rem;
}
.cr-side__title {
  margin: 18px 0 0;
  font-family: 'Cormorant Garamond', Georgia, serif;
  font-size: clamp(2.4rem, 4vw, 3.2rem);
  line-height: 1.05;
  color: var(--cr-primary);
  border-bottom: 2px solid var(--cr-gold);
  padding-bottom: 10px;
  width: fit-content;
}
.cr-side__lead {
  margin: 8px 0 0;
  font-size: 1.15rem;
  font-weight: 700;
  color: #1b2a3a;
}
.cr-side__copy,
.cr-side__participant {
  margin: 0;
  color: #5b6b7c;
  line-height: 1.55;
}
.cr-secure {
  display: flex;
  gap: 12px;
  margin-top: 10px;
  padding: 14px;
  background: #f3f5f8;
  border-radius: 10px;
}
.cr-secure__icon {
  color: var(--cr-primary);
  flex: 0 0 auto;
}
.cr-secure strong { display: block; margin-bottom: 4px; }
.cr-secure p { margin: 0; font-size: 0.92rem; color: #5b6b7c; }
.cr-help {
  margin-top: auto;
  padding-top: 18px;
  border-top: 1px solid #e5e9f0;
}
.cr-help h2 {
  margin: 0 0 8px;
  font-size: 1rem;
}
.cr-help a { color: var(--cr-primary); }
.cr-help__form {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}
.cr-help__form label {
  display: grid;
  gap: 4px;
  font-size: 13px;
}
.cr-help__form input,
.cr-help__form textarea,
.cr-form input {
  padding: 8px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font: inherit;
}
.cr-optout-link {
  margin-top: 12px;
  background: none;
  border: none;
  color: #b91c1c;
  text-decoration: underline;
  cursor: pointer;
  font: inherit;
  padding: 0;
  text-align: left;
}
.cr-main {
  padding: 40px 36px 64px;
}
.cr-main__kicker {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.78rem;
  font-weight: 700;
  color: #6b7c8f;
}
.cr-main__heading {
  margin: 6px 0 28px;
  font-size: 1.35rem;
  color: #1b2a3a;
}
.cr-steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0;
}
.cr-step {
  display: grid;
  grid-template-columns: 44px 1fr;
  gap: 16px;
  position: relative;
  padding-bottom: 28px;
}
.cr-step:not(:last-child)::before {
  content: '';
  position: absolute;
  left: 21px;
  top: 44px;
  bottom: 0;
  width: 2px;
  background: #d7deea;
}
.cr-step__num {
  width: 44px;
  height: 44px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: #fff;
  background: var(--cr-primary);
}
.cr-step--teal .cr-step__num { background: var(--cr-accent); }
.cr-step--gold .cr-step__num { background: var(--cr-gold); }
.cr-step.is-done .cr-step__num,
.cr-step--done-final .cr-step__num {
  background: #94a3b8;
}
.cr-step__body {
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid #e5e9f0;
  border-radius: 14px;
  padding: 16px 18px;
}
.cr-step__head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.cr-step__head h3,
.cr-step__body h3 {
  margin: 0;
  font-size: 1.15rem;
}
.cr-step__body p {
  margin: 8px 0 0;
  color: #5b6b7c;
  line-height: 1.5;
}
.cr-pill {
  font-size: 11px;
  font-weight: 700;
  background: #e2e8f0;
  color: #334155;
  padding: 2px 8px;
  border-radius: 999px;
}
.cr-pill--rec { background: #ffedd5; color: #9a3412; }
.cr-form {
  display: grid;
  gap: 8px;
  margin-top: 12px;
  max-width: 480px;
}
.cr-form__row {
  display: grid;
  grid-template-columns: 1.4fr 0.6fr 0.8fr;
  gap: 8px;
}
.cr-form label {
  display: grid;
  gap: 4px;
  font-size: 13px;
}
.cr-form select {
  padding: 8px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font: inherit;
  background: #fff;
}
.hint-inline {
  margin: 10px 0 0;
  font-size: 12px;
  color: #64748b;
}
.cr-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-top: 12px;
  padding: 10px 16px;
  border: none;
  border-radius: 8px;
  font-weight: 700;
  cursor: pointer;
  text-decoration: none;
  color: #fff;
  width: fit-content;
  background: var(--cr-primary);
}
.cr-btn--navy { background: var(--cr-primary); }
.cr-btn--teal { background: var(--cr-accent); }
.cr-btn--gold { background: var(--cr-gold); }
.cr-btn--ghost {
  background: #e8eef5;
  color: #1b2a3a;
}
.err { color: #b91c1c; font-size: 13px; margin: 6px 0 0; }
.ok { color: #047857; font-size: 13px; margin: 6px 0 0; }

@media (max-width: 900px) {
  .cr-shell { grid-template-columns: 1fr; }
  .cr-side { border-right: none; border-bottom: 1px solid #e5e9f0; }
  .cr-main { padding: 28px 18px 48px; }
}
</style>
