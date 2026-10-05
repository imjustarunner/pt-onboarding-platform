<template>
  <section class="card sms-readiness">
    <h3>Campaign registration and consent</h3>
    <p>Each independent practice needs its own Vonage brand. Record approved, linked campaigns here before enabling delivery. Saving these details does not submit a registration to Vonage.</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <label>Sending number
      <select v-model="numberId" @change="selectNumber">
        <option value="">Select a number</option>
        <option v-for="row in rows" :key="row.numberId" :value="row.numberId">{{ row.phoneNumber }} — {{ row.registration ? 'Registration recorded' : 'Not configured' }}</option>
      </select>
    </label>
    <details v-if="numberId" open>
      <summary>Request and track signed SMS consent</summary>
      <p>Send the link by email, show it in person, or include it with onboarding. Do not text an unsigned recipient to request SMS consent. Every recipient or authorized guardian signs their own choices; a parent’s signature does not enroll other contacts.</p>
      <form @submit.prevent="requestSignature">
        <label>Recipient phone<input v-model="signaturePhone" type="tel" required /></label>
        <label>Required signer<select v-model="signerRole"><option value="client">Client receiving the texts</option><option value="guardian">Authorized guardian receiving the texts</option><option value="staff">Staff member receiving the texts</option></select></label>
        <button :disabled="busy">Create consent signing link</button>
      </form>
      <p v-if="signingUrl">Copy and share this private link: <a :href="signingUrl" target="_blank" rel="noopener noreferrer">{{ signingUrl }}</a></p>
      <p><a href="/sms-consent/example/itsco" target="_blank" rel="noopener noreferrer">Open public ITSCO example (no recipient data)</a></p>
      <button type="button" :disabled="busy" @click="load">Refresh consent status</button>
      <table v-if="requests.length">
        <thead><tr><th>Request</th><th>Phone ends in</th><th>Signer</th><th>Signature</th><th>Actions</th></tr></thead>
        <tbody><tr v-for="request in requests" :key="request.id">
          <td>{{ request.id }}</td><td>{{ request.phone_last_four }}</td><td>{{ request.signer_role }}</td>
          <td>{{ request.signed_at ? 'Signed' : new Date(request.expires_at) < new Date() ? 'Expired — issue a new link' : 'Awaiting signature' }}</td>
          <td v-if="request.signed_at"><button type="button" @click="downloadEvidence(request.id)">Review signed evidence</button><label><input v-model="reviewed[request.id]" type="checkbox" /> I reviewed the signed choices and verified the signer’s authority</label> <button type="button" :disabled="busy || !reviewed[request.id]" @click="activateSignature(request.id)">Approve choices and activate</button><span v-if="request.activation_json">Recorded activation results available</span></td><td v-else>Texting remains blocked without consent</td>
        </tr></tbody>
      </table>
    </details>
    <details v-if="numberId && registration.purposes?.includes('marketing')">
      <summary>Send an optional program announcement</summary>
      <form @submit.prevent="sendMarketing">
        <p>This sends one promotional text from the dedicated marketing number. The recipient must have separate signed marketing consent and must not have opted out.</p>
        <label>Recipient phone<input v-model="marketingPhone" type="tel" required /></label>
        <label>Message<textarea v-model="marketingBody" required maxlength="1000" rows="4" /></label>
        <p>{{ registration.brandName }}: {{ marketingBody }} Reply STOP to opt out.</p>
        <button :disabled="busy">Send promotional text</button>
      </form>
    </details>
    <details v-if="numberId">
      <summary>Carrier registration details (platform administrator)</summary>
      <form @submit.prevent="saveRegistration">
        <div class="fields">
          <label v-for="field in registrationFields" :key="field.key">{{ field.label }}
            <input v-model="registration[field.key]" :type="field.url ? 'url' : 'text'" required />
          </label>
        </div>
        <fieldset>
          <legend>Approved message purposes</legend>
          <label v-for="purpose in purposes" :key="purpose.value"><input v-model="registration.purposes" type="checkbox" :value="purpose.value" /> {{ purpose.label }}</label>
        </fieldset>
        <label>Who sends STOP / START / HELP responses?
          <select v-model="registration.keywordOwner"><option value="application">AuricWell</option><option value="vonage">Vonage Opt-Out Assist (verified enabled)</option></select>
        </label>
        <label><input v-model="registration.allowRestart" type="checkbox" /> START / UNSTOP reactivation is documented in the registered message flow</label>
        <label><input v-model="registration.approved" type="checkbox" /> I verified carrier approval in Vonage</label>
        <label><input v-model="registration.numberLinked" type="checkbox" /> I verified this number is linked and active on this campaign</label>
        <button :disabled="busy">Save registration status</button>
      </form>
    </details>
    <details v-if="numberId">
      <summary>Record a recipient’s documented consent</summary>
      <form @submit.prevent="saveConsent">
        <p>Use the recipient’s actual choice and the exact disclosure they saw. A phone number or a staff member’s permission is not recipient consent. Recording an opt-in sends a subscription confirmation.</p>
        <label>Recipient phone<input v-model="consent.phone" type="tel" required placeholder="+1…" /></label>
        <label>Purpose<select v-model="consent.purpose"><option v-for="purpose in purposes" :key="purpose.value" :value="purpose.value">{{ purpose.label }}</option></select></label>
        <label>Recipient choice<select v-model="consent.status"><option value="opted_in">Opted in</option><option value="opted_out">Opted out of this purpose</option></select></label>
        <template v-if="consent.status === 'opted_in'">
          <label>Collection method<select v-model="consent.evidence.source"><option value="paper_form">Signed paper form</option><option value="web_form">Web form</option><option value="preference_center">Recipient preference center</option></select></label>
          <label>Evidence reference<input v-model="consent.evidence.reference" required placeholder="Secure signed form or submission reference" /></label>
          <label>Signed evidence reference<input v-model="consent.evidence.signatureReference" required placeholder="Signed form or signature record" /></label>
          <label><input v-model="consent.evidence.signerVerified" type="checkbox" required /> I verified that the recipient or authorized guardian signed this consent</label>
          <label>Exact disclosure shown or read<textarea v-model="consent.evidence.disclosure" required rows="4" /></label>
          <label>When the recipient consented<input v-model="collectedAt" type="datetime-local" required /></label>
          <label v-if="consent.purpose === 'marketing'"><input v-model="consent.evidence.separateMarketingConsent" type="checkbox" required /> Evidence records separate affirmative written marketing consent</label>
        </template>
        <button :disabled="busy">{{ consent.status === 'opted_in' ? 'Record consent and send confirmation' : 'Record opt-out' }}</button>
      </form>
    </details>
  </section>
</template>

<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';
const props = defineProps({ agencyId: { type: [String, Number], required: true } });
const rows = ref([]), numberId = ref(''), error = ref(''), notice = ref(''), busy = ref(false), collectedAt = ref('');
const requests = ref([]), signaturePhone = ref(''), signerRole = ref('client'), signingUrl = ref('');
const reviewed = ref({});
const marketingPhone = ref(''), marketingBody = ref('');
const purposes = [{ value: 'care', label: 'Client care and two-way support' }, { value: 'reminders', label: 'Appointment reminders' }, { value: 'workforce', label: 'Workforce notifications' }, { value: 'billing', label: 'Optional billing-account notifications' }, { value: 'marketing', label: 'Optional marketing' }, { value: 'account_security', label: 'Account security' }, { value: 'polling', label: 'Optional polls and surveys' }];
const registrationFields = [
  ['legalName', 'Exact legal business name'], ['brandName', 'Client-facing registered brand name'],
  ['brandId', 'Vonage brand ID'], ['campaignId', 'Vonage campaign ID'], ['resellerId', 'Vonage reseller ID (R000000 for a customer campaign)'],
  ['supportContact', 'Public support phone or email'], ['website', 'Practice website', true],
  ['privacyUrl', 'Public privacy policy', true], ['termsUrl', 'Public SMS terms', true], ['evidenceUrl', 'Public opt-in proof (no client data)', true]
].map(([key, label, url]) => ({ key, label, url }));
const blankRegistration = () => ({ purposes: [], keywordOwner: 'application', approved: false, numberLinked: false, allowRestart: false });
const registration = ref(blankRegistration());
const consent = ref({ phone: '', purpose: 'reminders', status: 'opted_in', evidence: { source: 'paper_form', reference: '', signatureReference: '', signerVerified: false, disclosure: '', separateMarketingConsent: false } });
const failure = (e) => { error.value = e.response?.data?.error?.message || e.message || 'Could not save'; };
async function load() {
  try {
    const [registrations, pending] = await Promise.all([
      api.get(`/sms-numbers/agency/${props.agencyId}/registrations`),
      api.get(`/sms-numbers/agency/${props.agencyId}/consent-requests`)
    ]);
    rows.value = registrations.data; requests.value = pending.data;
  }
  catch (e) { failure(e); }
}
async function requestSignature() {
  busy.value = true; error.value = ''; signingUrl.value = '';
  try {
    const { data } = await api.post(`/sms-numbers/agency/${props.agencyId}/consent-requests`, { numberId: Number(numberId.value), phone: signaturePhone.value, signerRole: signerRole.value });
    signingUrl.value = new URL(data.path, window.location.origin).href;
    await load();
  } catch (e) { failure(e); } finally { busy.value = false; }
}
async function downloadEvidence(id) {
  error.value = '';
  try {
    const { data } = await api.get(`/sms-numbers/agency/${props.agencyId}/consent-requests/${id}/evidence`);
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `sms-consent-${id}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) { failure(e); }
}
async function activateSignature(id) {
  busy.value = true; error.value = ''; notice.value = '';
  try {
    await api.post(`/sms-numbers/agency/${props.agencyId}/consent-requests/${id}/review`, { signerVerified: reviewed.value[id] === true });
    notice.value = 'Signed choices activated. Only selected subscriptions receive a confirmation.'; await load();
  } catch (e) { failure(e); } finally { busy.value = false; }
}
async function sendMarketing() {
  busy.value = true; error.value = ''; notice.value = '';
  try {
    await api.post(`/sms-numbers/agency/${props.agencyId}/marketing-send`, { numberId: Number(numberId.value), phone: marketingPhone.value, body: marketingBody.value });
    notice.value = 'Vonage accepted the promotional text. Delivery is confirmed by its receipt.';
    marketingBody.value = '';
  } catch (e) { failure(e); } finally { busy.value = false; }
}
function selectNumber() {
  registration.value = JSON.parse(JSON.stringify(rows.value.find((r) => r.numberId === Number(numberId.value))?.registration || blankRegistration()));
  notice.value = '';
}
async function saveRegistration() {
  busy.value = true; error.value = ''; notice.value = '';
  try {
    await api.put(`/sms-numbers/agency/${props.agencyId}/registrations`, { numberId: Number(numberId.value), registration: registration.value });
    await load(); notice.value = registration.value.approved && registration.value.numberLinked ? 'Registration recorded. Recipient consent is still required before delivery.' : 'Registration saved with delivery disabled.';
  } catch (e) { failure(e); } finally { busy.value = false; }
}
async function saveConsent() {
  busy.value = true; error.value = ''; notice.value = '';
  try {
    await api.post(`/sms-numbers/agency/${props.agencyId}/consents`, { ...consent.value, numberId: Number(numberId.value), evidence: { ...consent.value.evidence, collectedAt: collectedAt.value ? new Date(collectedAt.value).toISOString() : null } });
    notice.value = consent.value.status === 'opted_in' ? 'Consent recorded and confirmation sent.' : 'Opt-out recorded.';
  } catch (e) { failure(e); } finally { busy.value = false; }
}
watch(() => props.agencyId, () => { numberId.value = ''; rows.value = []; requests.value = []; signingUrl.value = ''; error.value = ''; if (props.agencyId) load(); }, { immediate: true });
</script>

<style scoped>
.sms-readiness { padding: 20px; }
.sms-readiness label { display: block; margin: 12px 0; }
.sms-readiness input:not([type=checkbox]), .sms-readiness select, .sms-readiness textarea { display: block; width: 100%; padding: 8px; }
.sms-readiness details { margin-top: 18px; }
.fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
[role=alert] { color: #b91c1c; }
</style>
