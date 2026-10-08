<template>
  <section class="calendar-sharing">
    <h2>{{ family ? 'Share our family calendar' : 'My calendar subscription' }}</h2>
    <p v-if="family">Create a shared Google calendar for your household, or subscribe from your calendar app. Linked parents are added automatically.</p>
    <template v-else>
      <p>See this organization’s work schedule in Google Calendar, Apple Calendar, or Outlook with a private, read-only subscription. No Google connection or SSO account is needed.</p>
      <p>Includes dates and times, session or meeting type, client initials, office location, and your personal meeting link when available. Full client names, clinical notes, diagnoses, and private event details are never shared. Meeting links require you to sign in with your invited account.</p>
    </template>
    <p>Make schedule changes in this app. Your calendar app controls how often subscriptions refresh, so updates may take time to appear.</p>
    <p v-if="googleEnabled">Google copies refresh about every five minutes.</p>
    <p v-if="family">Events created directly in the shared Google calendar also appear in Family. To include your primary Google calendar, select it under “Bring in a Google calendar.”</p>
    <label v-if="family" class="details"><input type="checkbox" :checked="status.details" @change="details($event.target.checked)" :disabled="busy" /> Share event titles, family members and locations (otherwise “Personal event”)</label>
    <div class="actions">
      <button type="button" @click="issue" :disabled="busy">{{ status.hasSubscription ? 'Replace subscription link' : 'Create subscription link' }}</button>
      <button v-if="status.hasSubscription" type="button" @click="revoke" :disabled="busy">Revoke subscription</button>
      <template v-if="googleEnabled">
        <button v-if="!status.googleCalendarId" type="button" @click="act('google')" :disabled="busy">Create shared Google calendar</button>
        <template v-else>
          <a :href="status.googleAddUrl" target="_blank" rel="noopener noreferrer">Add to Google Calendar ↗</a>
          <button type="button" @click="act('sync')" :disabled="busy">Sync now</button>
        </template>
      </template>
    </div>
    <div v-if="link" class="subscription">
      <label>Private subscription link<input readonly :value="link" @focus="$event.target.select()" /></label>
      <button type="button" @click="copy">Copy link</button>
    </div>
    <p v-else-if="status.hasSubscription">Your existing link is active. For privacy, it is shown only when created. Replace it if you need a new copy, then update your calendar subscription.</p>
    <details class="instructions">
      <summary>How to add the subscription</summary>
      <ul>
        <li><strong>Google Calendar (on a computer):</strong> Other calendars → + → From URL. Paste your link and add the calendar.</li>
        <li><strong>Apple Calendar:</strong> Add Subscription Calendar (iPhone/iPad) or File → New Calendar Subscription (Mac), then paste your link.</li>
        <li><strong>Outlook on the web:</strong> Add calendar → Subscribe from web, then paste your link.</li>
      </ul>
      <p>Choose a subscription so future changes appear. Downloading or importing a file creates a one-time copy.</p>
    </details>
    <p>Keep this link private: anyone with it can read the shared schedule details. Replacing or revoking it stops future access through the old link; it does not erase copies already downloaded to a calendar.</p>
    <template v-if="googleEnabled && status.googleCalendarId">
      <h3>Who can see this calendar</h3>
      <ul><li v-for="reader in status.readers" :key="reader.email">{{ reader.email }} <small v-if="reader.managed_member">Linked account</small><button v-else type="button" :disabled="busy" @click="remove(reader.email)">Remove</button></li></ul>
      <form @submit.prevent="add"><label>Personal or additional Google account<input type="email" v-model="email" required placeholder="you@gmail.com" /></label><button :disabled="busy">Give read access</button></form>
      <p>After adding an account, open “Add to Google Calendar” while signed in to that account.</p>
      <p v-if="!status.lastSyncedAt">The first sync is preparing your calendar. This can take a few minutes.</p>
      <small v-if="status.lastSyncedAt">Last synced {{ new Date(status.lastSyncedAt).toLocaleString() }}</small>
    </template>
    <p v-if="!googleEnabled && status.googleCalendarId">Your previous app-managed Google copy is being retired. Add the subscription link above to keep receiving schedule updates.</p>
    <button v-if="status.googleCalendarId" class="stop" type="button" @click="stop" :disabled="busy">Stop Google sharing</button>
    <p v-if="busy" role="status">Updating calendar…</p>
    <p v-if="message" role="status">{{ message }}</p>
    <p v-if="error || (googleEnabled && status.lastError)" role="alert">{{ error || status.lastError }}</p>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import workApi from '../services/api';
import axios from 'axios';
const props = defineProps({ householdId: [Number, String], agencyId: [Number, String] });
const family = computed(() => !!props.householdId);
const familyApi = axios.create({ baseURL: '/api/family', withCredentials: true });
const api = computed(() => family.value ? familyApi : workApi);
const status = ref({ readers: [] }), busy = ref(false), error = ref(''), message = ref(''), link = ref(''), email = ref('');
const googleEnabled = computed(() => family.value || status.value.googleEnabled === true);
const path = computed(() => `/calendar-sharing/${family.value ? `family/${props.householdId}` : `work/${props.agencyId}`}`);
let generation = 0;
async function run(operation) {
  if (busy.value) return;
  const current = generation, endpoint = path.value, client = api.value;
  busy.value = true; error.value = ''; message.value = '';
  try {
    const result = await operation(client, endpoint);
    if (current !== generation) return;
    // Keep a freshly issued secret visible even if refreshing status fails.
    if (result?.url) { link.value = result.url; status.value.hasSubscription = true; }
    if (result?.revoked) { link.value = ''; status.value.hasSubscription = false; message.value = 'Subscription revoked.'; }
    const response = await client.get(endpoint);
    if (current === generation) status.value = response.data;
  } catch (e) {
    if (current === generation) error.value = e.response?.data?.error?.message || 'Could not update the calendar. Please try again.';
  } finally { if (current === generation) busy.value = false; }
}
const act = action => run((client, endpoint) => client.post(`${endpoint}/${action}`));
const details = value => run((client, endpoint) => client.put(`${endpoint}/details`, { details: value }));
async function issue() {
  if (status.value.hasSubscription && !window.confirm('Replace the old subscription link? Existing subscriptions must use the new link.')) return;
  await run(async (client, endpoint) => (await client.post(`${endpoint}/subscription`)).data);
}
async function revoke() {
  await run(async (client, endpoint) => { await client.delete(`${endpoint}/subscription`); return { revoked: true }; });
}
const add = () => run((client, endpoint) => client.post(`${endpoint}/readers`, { email: email.value }));
const remove = email => run((client, endpoint) => client.delete(`${endpoint}/readers`, { data: { email } }));
async function stop() {
  if (!window.confirm('Delete the Google copy and remove its readers? Events in this app remain.')) return;
  await run((client, endpoint) => client.delete(`${endpoint}/google`));
}
async function copy() {
  try { await navigator.clipboard.writeText(link.value); message.value = 'Link copied.'; }
  catch { message.value = 'Select and copy the link above.'; }
}
watch(path, () => {
  generation++; busy.value = false; link.value = ''; email.value = ''; status.value = { readers: [] };
  run(async () => {});
}, { immediate: true });
</script>
<style scoped>
.calendar-sharing{--share-ink:var(--ink,#25313c);padding:24px;margin:20px 0;border:1px solid var(--line,#d6d5ce);border-radius:16px;background:var(--surface,#fffdf8);color:var(--share-ink);max-width:950px}.calendar-sharing h2{font-size:20px;margin:0 0 12px}.calendar-sharing p{font-size:14px;line-height:1.6}.calendar-sharing label{display:flex;flex-direction:column;gap:6px;font-size:14px}.calendar-sharing label.details{flex-direction:row;align-items:center;margin:16px 0}.calendar-sharing input,.calendar-sharing button,.calendar-sharing a{font:inherit;padding:10px;border:1px solid #979ca5;border-radius:8px;background:var(--surface,#fffdf8);color:var(--share-ink)}.calendar-sharing button,.calendar-sharing a{cursor:pointer;background:var(--soft,#eeeaf8);font-size:14px}.actions,form{display:flex;flex-wrap:wrap;gap:10px;align-items:end}.subscription{margin:20px 0}.subscription input{width:100%;box-sizing:border-box}.calendar-sharing li{margin:10px 0;overflow-wrap:anywhere}.calendar-sharing small{margin:0 10px;color:var(--muted,#56616c)}.stop{display:block;margin-top:18px}.calendar-sharing button:disabled{opacity:.6}.instructions{margin-top:18px}.instructions summary{cursor:pointer;font-weight:600}
</style>
