<template>
  <details class="referral-composer" @toggle="onToggle">
    <summary>Find and email referral options</summary>
    <p class="hint">Choose someone to help, select referral options, then review the email before sending.</p>
    <fieldset class="composer-fields" :disabled="busy || !options">
      <section aria-label="Recipient">
        <h3>Who are these referrals for?</h3>
        <label v-if="options?.canEmailNewPerson">Recipient type
          <select v-model="recipientMode"><option value="existing">Someone in the system</option><option value="new">New person — email from support</option></select>
        </label>
        <template v-if="recipientMode === 'existing'">
          <form @submit.prevent="searchPeople">
            <label>Find a person<input v-model="recipientQuery" maxlength="254" placeholder="Name or email address" /></label>
            <button class="btn btn-secondary" :disabled="recipientQuery.trim().length < 2">Search people</button>
          </form>
          <label v-for="person in people" :key="person.personKey" class="match">
            <input type="radio" name="referral-recipient" :value="person.personKey" v-model="recipientKey" @change="choosePerson(person)" />
            <span><strong>{{ person.name }}</strong><br>{{ person.email }}<small v-if="person.relationship">{{ person.relationship }}</small></span>
          </label>
          <p v-if="peopleSearched && !people.length" class="hint">No people with an email address found in your access scope.<template v-if="options?.canEmailNewPerson"> Choose “New person” to email someone who contacted support.</template></p>
          <p v-if="recipientKey" class="hint">Selected: {{ name || to }} · {{ to }}</p>
        </template>
        <div v-else class="fields">
          <label>Recipient email<input v-model="to" type="email" maxlength="254" placeholder="person@example.com" /></label>
          <label>First name (optional)<input v-model="name" maxlength="100" /></label>
          <p class="hint">No account or client record is required. Replies go to the shared support inbox.</p>
        </div>
        <label v-if="options?.canSendAsSupport && recipientMode === 'existing'">Send as
          <select v-model="senderMode"><option value="personal">Me — use my Messages sender</option><option value="support">Support team</option></select>
        </label>
      </section>
      <section aria-label="Referral selection">
        <h3>Choose referral options</h3>
        <label>Selection method<select v-model="selectionMode"><option value="match">Match services</option><option value="manual">Browse directory</option></select></label>
        <form v-if="selectionMode === 'match'" @submit.prevent="findMatches(false)">
          <label>What services are needed?<input v-model="request" maxlength="500" placeholder="For example: a psychologist or psychiatrist" /></label>
          <fieldset><legend>Services (optional)</legend>
            <label v-for="service in services" :key="service.id" class="service-check"><input type="checkbox" v-model="selectedServices" :value="service.id" /> {{ service.label }}</label>
          </fieldset>
          <div class="fields"><label>Location (optional)<input v-model="location" placeholder="Colorado Springs" /></label>
            <label>Insurance (optional)<input v-model="insurance" placeholder="Plan name" /></label></div>
          <div class="fields"><label>Age (optional)<input v-model="age" type="number" min="0" max="120" /></label>
            <label>Language (optional)<input v-model="language" maxlength="80" placeholder="Spanish" /></label>
            <label>Appointment format<select v-model="appointmentFormat"><option value="">Any</option><option value="telehealth">Telehealth</option><option value="in_person">In person</option></select></label></div>
          <div class="actions"><button class="btn btn-secondary">Find options</button><button type="button" class="btn btn-primary" @click="findMatches(true)">Auto-select matches</button></div>
        </form>
        <form v-else @submit.prevent="browseDirectory">
          <label>Search referrals<input v-model="directoryQuery" placeholder="Practice or referral name" /></label>
          <button class="btn btn-secondary">Browse referrals</button>
        </form>
        <p class="hint">Matching uses recorded directory information. Confirm availability and coverage directly with each practice.</p>
        <p v-if="searched && !matches.length">No matching referrals found. Adjust the filters or browse the directory.</p>
        <p v-if="warning" class="hint">{{ warning }}</p>
        <label v-for="entry in matches" :key="entry.id" class="match">
          <input type="checkbox" v-model="selectedEntries" :value="entry.id" :disabled="selectedEntries.length >= 6 && !selectedEntries.includes(entry.id)" />
          <span><strong>{{ entry.organization_name || entry.name }}</strong><br>{{ entry.phone || 'Phone not recorded' }} · {{ entry.address || 'Location not recorded' }}<small v-if="entry.matchedServices?.length">Matched: {{ entry.matchedServices.map(serviceLabel).join(', ') }}</small></span>
        </label>
        <p v-if="matches.length" class="hint">{{ selectedEntries.length }} selected · Choose up to six. You can change any automatic selection.</p>
      </section>
      <button type="button" class="btn btn-primary" :disabled="!canPreview" @click="previewEmail">Preview email</button>
    </fieldset>
    <section v-if="preview" class="preview" aria-label="Referral email preview">
      <p><strong>From:</strong> {{ preview.from }}<br><strong>Replies to:</strong> {{ preview.replyTo }}<br><strong>To:</strong> {{ preview.to }}<br><strong>Subject:</strong> {{ preview.subject }}</p>
      <p class="hint">Your agency’s email branding and {{ preview.senderMode === 'support' ? 'support' : 'personal' }} signature are applied when sending.</p>
      <pre>{{ preview.text }}</pre>
      <button type="button" class="btn btn-primary" :disabled="busy || sendAttempted" @click="sendEmail">{{ preview.senderMode === 'support' ? 'Send from support' : 'Send referral email' }}</button>
    </section>
    <p v-if="busy" role="status">Working…</p><p v-if="error" role="alert">{{ error }}</p><p v-if="result" role="status">{{ result }}</p>
    <button v-if="!options && !busy" type="button" class="btn btn-secondary" @click="initialize">Load referral email options</button>
  </details>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
const props = defineProps({ agencyId: { type: [String, Number], required: true } });
const services = ref([]), options = ref(null), recipientMode = ref('existing'), senderMode = ref('personal');
const recipientQuery = ref(''), recipientKey = ref(''), people = ref([]), peopleSearched = ref(false);
const to = ref(''), name = ref(''), selectionMode = ref('match'), directoryQuery = ref('');
const request = ref(''), selectedServices = ref([]), location = ref(''), insurance = ref('');
const age = ref(''), language = ref(''), appointmentFormat = ref('');
const matches = ref([]), selectedEntries = ref([]), searched = ref(false), warning = ref('');
const busy = ref(false), preview = ref(null), error = ref(''), result = ref(''), sendAttempted = ref(false);
let generation = 0, revision = 0;
const canPreview = computed(() => !!to.value && (recipientMode.value === 'new' || !!recipientKey.value) && selectedEntries.value.length > 0 && selectedEntries.value.length <= 6);
const serviceLabel = id => services.value.find(s => s.id === id)?.label || id;
function invalidate() { revision++; preview.value = null; result.value = ''; sendAttempted.value = false; }
watch([to, name, recipientKey, senderMode, selectedEntries], invalidate, { deep: true, flush: 'sync' });
watch([request, selectedServices, location, insurance, age, language, appointmentFormat, selectionMode, directoryQuery], () => {
  matches.value = []; selectedEntries.value = []; searched.value = false; warning.value = ''; invalidate();
}, { deep: true, flush: 'sync' });
watch(recipientMode, () => { to.value = ''; name.value = ''; recipientKey.value = ''; if (recipientMode.value === 'new') senderMode.value = 'support'; invalidate(); });
watch(() => props.agencyId, () => {
  generation++; invalidate(); options.value = null; people.value = []; peopleSearched.value = false; recipientQuery.value = ''; recipientKey.value = '';
  to.value = ''; name.value = ''; matches.value = []; selectedEntries.value = []; searched.value = false; warning.value = ''; busy.value = false; error.value = '';
  recipientMode.value = 'existing'; senderMode.value = 'personal'; initialize();
});
async function run(fn) {
  if (busy.value) return;
  const scope = generation; error.value = ''; busy.value = true;
  try { await fn(() => scope === generation); }
  catch (e) { if (scope === generation) error.value = e.response?.data?.error?.message || 'The request could not be completed.'; }
  finally { if (scope === generation) busy.value = false; }
}
function onToggle(event) { if (event.target.open && !options.value) initialize(); }
async function initialize() {
  await run(async current => {
    const [catalog, access] = await Promise.all([
      api.get('/referral-directory/services', { params: { agencyId: props.agencyId } }),
      api.get('/referral-directory/outreach/options', { params: { agencyId: props.agencyId } })
    ]);
    if (!current()) return;
    services.value = catalog.data.services; options.value = access.data; senderMode.value = access.data.defaultSenderMode;
  });
}
async function searchPeople() {
  if (recipientQuery.value.trim().length < 2) return;
  await run(async current => {
    const { data } = await api.get('/referral-directory/outreach/recipients', { params: { agencyId: props.agencyId, q: recipientQuery.value.trim() } });
    if (!current()) return;
    people.value = data.recipients; peopleSearched.value = true;
  });
}
function choosePerson(person) { recipientKey.value = person.personKey; to.value = person.email; name.value = (person.name || '').slice(0, 100); }
async function findMatches(autoSelect) {
  const version = revision;
  await run(async current => {
    const { data } = await api.post('/referral-directory/match', { agencyId: props.agencyId, services: selectedServices.value, request: request.value,
      location: location.value, insurance: insurance.value, age: age.value, language: language.value, appointmentFormat: appointmentFormat.value });
    if (!current() || version !== revision) return;
    matches.value = data.entries; warning.value = data.warning; selectedEntries.value = autoSelect ? data.suggestedEntryIds || [] : []; searched.value = true;
  });
}
async function browseDirectory() {
  const version = revision;
  await run(async current => {
    const { data } = await api.get('/referral-directory/entries', { params: { agencyId: props.agencyId, search: directoryQuery.value.trim(), limit: 1000 } });
    if (!current() || version !== revision) return;
    matches.value = data.entries; selectedEntries.value = []; searched.value = true; warning.value = '';
  });
}
async function previewEmail() {
  if (!canPreview.value) return;
  const version = revision;
  await run(async current => {
    const { data } = await api.post('/referral-directory/outreach/preview', { agencyId: props.agencyId, to: to.value, name: name.value,
      personKey: recipientMode.value === 'existing' ? recipientKey.value : null, senderMode: senderMode.value, entryIds: selectedEntries.value });
    if (!current() || version !== revision) return;
    preview.value = data; sendAttempted.value = false;
  });
}
async function sendEmail() {
  if (!preview.value || sendAttempted.value || busy.value) return;
  sendAttempted.value = true;
  await run(async current => {
    const { data } = await api.post(`/referral-directory/outreach/${preview.value.id}/send`, { agencyId: props.agencyId });
    if (!current()) return;
    const destination = data.ticketId ? `support ticket #${data.ticketId}` : data.conversationId ? `Messages conversation #${data.conversationId}` : 'Messages';
    result.value = data.status === 'sent' ? `Email sent. Replies will appear in ${destination}.`
      : data.status === 'queued' ? `Email queued. Follow its delivery in ${destination}.`
      : `Delivery status: ${data.status}. Check ${destination} before sending again.`;
  });
}
</script>
<style scoped>
.referral-composer{border:1px solid var(--border,#dce2e8);border-radius:12px;padding:20px;margin:16px 0;background:var(--card-bg,#fff)}summary{font-weight:650;cursor:pointer}h3{font-size:1rem;margin-top:24px}form{margin:12px 0}label{display:block;margin:10px 0}input:not([type=checkbox]):not([type=radio]),select{display:block;width:100%;padding:10px;border:1px solid #b6c3d1;border-radius:6px;box-sizing:border-box;background:var(--card-bg,#fff);color:inherit}fieldset{min-width:0;border:1px solid #dce2e8;border-radius:8px;margin:16px 0}.composer-fields{border:0;padding:0}.service-check{display:inline-block;margin:6px 16px 6px 0}.fields,.actions{display:flex;gap:12px;flex-wrap:wrap}.fields label{flex:1;min-width:160px}.match{display:flex;gap:10px;align-items:flex-start;padding:10px;border-bottom:1px solid #dce2e8;overflow-wrap:anywhere}.match input{flex-shrink:0}.match small{display:block;margin-top:4px}.hint{font-size:13px;color:var(--text-secondary,#526174)}.preview{margin-top:20px;padding:18px;background:var(--bg-secondary,#f6f8fb);border-radius:8px;overflow-wrap:anywhere}pre{white-space:pre-wrap;font:inherit;line-height:1.6}button{white-space:normal}
</style>
