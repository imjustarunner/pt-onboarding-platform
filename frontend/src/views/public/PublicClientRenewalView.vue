<template>
  <div class="cr-hub" :style="brandStyle">
    <header class="cr-hub__hero">
      <div v-if="branding?.logoUrl" class="cr-hub__logo-wrap">
        <img :src="branding.logoUrl" alt="" class="cr-hub__logo" />
      </div>
      <p class="cr-hub__brand">{{ branding?.organizationName || branding?.agencyName || 'Client Renewal' }}</p>
      <h1>{{ schoolName || 'Action needed' }}</h1>
      <p v-if="clientInitials" class="cr-hub__sub">For participant {{ clientInitials }}</p>
      <p class="cr-hub__sub">Please complete the items below. Your information stays private.</p>
    </header>

    <div v-if="loading" class="cr-hub__msg">Loading…</div>
    <div v-else-if="fatalError" class="cr-hub__msg cr-hub__msg--err">{{ fatalError }}</div>
    <div v-else-if="optedOut" class="cr-hub__msg">
      You’re opted out of platform emails for this account. No further renewal messages will be sent.
    </div>
    <div v-else-if="completed" class="cr-hub__msg">Thank you — this renewal is complete.</div>

    <template v-else>
      <section class="cr-hub__cards">
        <article v-if="options.verifyContact" class="cr-card" :class="{ 'is-done': progress.verifyContactDone }">
          <header>
            <h2>Verify contact info</h2>
            <span v-if="progress.verifyContactDone" class="cr-pill">Done</span>
          </header>
          <form v-if="!progress.verifyContactDone" class="cr-form" @submit.prevent="saveContact">
            <label>Email <input v-model="contact.email" type="email" required /></label>
            <label>Phone <input v-model="contact.phone" type="tel" /></label>
            <label>First name <input v-model="contact.firstName" type="text" /></label>
            <label>Last name <input v-model="contact.lastName" type="text" /></label>
            <button type="submit" class="btn btn-primary" :disabled="savingContact">
              {{ savingContact ? 'Saving…' : 'Confirm contact' }}
            </button>
            <p v-if="contactError" class="err">{{ contactError }}</p>
          </form>
        </article>

        <article v-if="options.smartRoi" class="cr-card" :class="{ 'is-done': progress.smartRoiDone }">
          <header>
            <h2>Smart School ROI</h2>
            <span v-if="recommended.smartRoi" class="cr-pill cr-pill--rec">Recommended</span>
            <span v-if="progress.smartRoiDone" class="cr-pill">Done</span>
          </header>
          <p>Sign a new release of information for the school team.</p>
          <a
            v-if="stepLinks.smartRoi"
            class="btn btn-primary"
            :href="stepLinks.smartRoi"
            target="_blank"
            rel="noopener"
            @click="markStep('smart_roi')"
          >Open ROI form</a>
          <p v-else class="err">Signing link unavailable — contact support.</p>
        </article>

        <article v-if="options.smartDisclosure" class="cr-card" :class="{ 'is-done': progress.smartDisclosureDone }">
          <header>
            <h2>Smart Disclosure</h2>
            <span v-if="recommended.smartDisclosure" class="cr-pill cr-pill--rec">Recommended</span>
            <span v-if="progress.smartDisclosureDone" class="cr-pill">Done</span>
          </header>
          <p>Review and acknowledge the disclosure statement.</p>
          <a
            v-if="stepLinks.smartDisclosure"
            class="btn btn-primary"
            :href="stepLinks.smartDisclosure"
            target="_blank"
            rel="noopener"
            @click="markStep('smart_disclosure')"
          >Open Disclosure</a>
          <p v-else class="err">Signing link unavailable — contact support.</p>
        </article>

        <article v-if="options.fullPacket" class="cr-card" :class="{ 'is-done': progress.fullPacketDone }">
          <header>
            <h2>Full enrollment packet</h2>
            <span v-if="progress.fullPacketDone" class="cr-pill">Done</span>
          </header>
          <p>
            Complete the {{ options.packetMode === 'office' ? 'office' : 'school' }} renewal packet.
            This updates the existing client record — it does not create a new one.
          </p>
          <a
            v-if="stepLinks.fullPacket"
            class="btn btn-primary"
            :href="stepLinks.fullPacket"
            target="_blank"
            rel="noopener"
            @click="markStep('full_packet')"
          >Open packet</a>
          <p v-else class="err">Packet link unavailable — contact support.</p>
        </article>
      </section>

      <aside class="cr-hub__aside">
        <section class="cr-support">
          <h2>Need help?</h2>
          <form @submit.prevent="submitTicket">
            <label>Subject <input v-model="ticket.subject" type="text" maxlength="255" /></label>
            <label>Message <textarea v-model="ticket.message" rows="4" required maxlength="4000" /></label>
            <button type="submit" class="btn btn-secondary" :disabled="ticketSending">
              {{ ticketSending ? 'Submitting…' : 'Submit support ticket' }}
            </button>
            <p v-if="ticketError" class="err">{{ ticketError }}</p>
            <p v-if="ticketOk" class="ok">Ticket submitted.</p>
          </form>
        </section>

        <section class="cr-optout">
          <h2>No longer interested?</h2>
          <p>Stop platform emails and remove this contact from automated messages.</p>
          <button type="button" class="btn btn-danger-outline" :disabled="optingOut" @click="doOptOut">
            {{ optingOut ? 'Updating…' : 'Remove my contact / stop emails' }}
          </button>
          <p v-if="optOutError" class="err">{{ optOutError }}</p>
        </section>
      </aside>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';

const route = useRoute();
const token = computed(() => String(route.params.token || '').trim());

const loading = ref(true);
const fatalError = ref('');
const branding = ref(null);
const schoolName = ref('');
const clientInitials = ref('');
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
const contact = reactive({ email: '', phone: '', firstName: '', lastName: '' });
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

const brandStyle = computed(() => {
  const primary = branding.value?.primaryColor || '#0f766e';
  return { '--cr-primary': primary };
});

const apiBase = '/api/public/client-renewal';

function applyPayload(data) {
  branding.value = data.branding || null;
  schoolName.value = data.schoolName || '';
  clientInitials.value = data.clientInitials || '';
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
      lastName: contact.lastName
    });
    if (res.data?.renewal || res.data?.progress) {
      applyPayload({ ...res.data, ...(res.data.renewal ? await refreshQuiet() : res.data) });
    }
    progress.verifyContactDone = true;
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

async function markStep(step) {
  try {
    await axios.post(`${apiBase}/${encodeURIComponent(token.value)}/mark-step`, { step });
    await refreshQuiet();
  } catch {
    // non-blocking — form open is the main action
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
    await axios.post(supportPath.value.startsWith('http')
      ? supportPath.value
      : supportPath.value,
    {
      subject: ticket.subject,
      message: ticket.message,
      question: ticket.message
    });
    ticketOk.value = true;
    ticket.message = '';
  } catch (e) {
    ticketError.value = e?.response?.data?.error?.message || 'Could not submit ticket';
  } finally {
    ticketSending.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.cr-hub {
  min-height: 100vh;
  background: linear-gradient(180deg, color-mix(in srgb, var(--cr-primary, #0f766e) 12%, #f8fafc), #f1f5f9 40%, #fff);
  padding: 28px 16px 64px;
  color: #0f172a;
  font-family: "Source Sans 3", "Segoe UI", sans-serif;
}
.cr-hub__hero {
  max-width: 920px;
  margin: 0 auto 28px;
  text-align: left;
}
.cr-hub__logo { max-height: 56px; max-width: 200px; object-fit: contain; }
.cr-hub__brand {
  font-size: 1.75rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 12px 0 4px;
  color: var(--cr-primary, #0f766e);
}
.cr-hub__hero h1 {
  font-size: clamp(1.6rem, 3vw, 2.2rem);
  margin: 0 0 8px;
  font-weight: 700;
}
.cr-hub__sub { margin: 0 0 4px; color: #475569; }
.cr-hub__msg {
  max-width: 640px;
  margin: 24px auto;
  padding: 20px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
}
.cr-hub__msg--err { color: #b91c1c; }
.cr-hub__cards, .cr-hub__aside {
  max-width: 920px;
  margin: 0 auto;
}
.cr-hub__cards { display: grid; gap: 14px; margin-bottom: 20px; }
.cr-card {
  background: #fff;
  border-radius: 12px;
  padding: 16px 18px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
  border: 1px solid #e2e8f0;
}
.cr-card.is-done { opacity: 0.85; border-color: #a7f3d0; }
.cr-card header { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.cr-card h2 { margin: 0; font-size: 1.1rem; flex: 1; }
.cr-pill {
  font-size: 11px;
  font-weight: 700;
  background: #e2e8f0;
  color: #334155;
  padding: 2px 8px;
  border-radius: 999px;
}
.cr-pill--rec { background: #ffedd5; color: #9a3412; }
.cr-form { display: grid; gap: 8px; margin-top: 10px; max-width: 420px; }
.cr-form label, .cr-support label, .cr-optout label {
  display: grid;
  gap: 4px;
  font-size: 13px;
}
.cr-form input, .cr-support input, .cr-support textarea {
  padding: 8px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font: inherit;
}
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 9px 14px;
  border-radius: 8px;
  border: none;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
  font-size: 14px;
  width: fit-content;
}
.btn-primary { background: var(--cr-primary, #0f766e); color: #fff; }
.btn-secondary { background: #e2e8f0; color: #0f172a; }
.btn-danger-outline {
  background: transparent;
  border: 1px solid #fca5a5;
  color: #b91c1c;
}
.cr-aside { display: grid; gap: 14px; }
.cr-hub__aside { display: grid; gap: 14px; margin-top: 8px; }
.cr-support, .cr-optout {
  background: #fff;
  border-radius: 12px;
  padding: 16px 18px;
  border: 1px solid #e2e8f0;
}
.cr-support form { display: grid; gap: 8px; }
.err { color: #b91c1c; font-size: 13px; margin: 6px 0 0; }
.ok { color: #047857; font-size: 13px; margin: 6px 0 0; }
@media (min-width: 900px) {
  .cr-hub {
    display: grid;
    grid-template-columns: 1fr 320px;
    grid-template-rows: auto auto 1fr;
    column-gap: 20px;
    max-width: 1100px;
    margin: 0 auto;
  }
  .cr-hub__hero { grid-column: 1 / -1; }
  .cr-hub__cards { grid-column: 1; }
  .cr-hub__aside { grid-column: 2; grid-row: 2 / span 2; align-self: start; }
  .cr-hub__msg { grid-column: 1 / -1; }
}
</style>
