<template>
  <section class="card platform-integrations">
    <span class="eyebrow">Platform superadmin · all AuricWell practices</span>
    <h2>Virtual sessions, client texting and fax</h2>
    <p>These choices apply across AuricWell. Practice admins and individual providers cannot override them.</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="notice" class="notice" role="status">{{ notice }}</p>
    <form v-if="form" @submit.prevent="save">
      <fieldset>
        <legend>Scheduled virtual sessions</legend>
        <label>Video service<select v-model="form.videoProvider">
          <option value="google_meet">Google Meet — opens in a new tab</option>
          <option value="vonage">Vonage — video inside AuricWell</option>
          <option value="disabled">Virtual sessions off</option>
        </select></label>
        <label>Google Workspace organizer<input v-model="form.googleOrganizer" type="email" required autocomplete="off" /></label>
        <p class="muted">Use an account in the Workspace organization covered by your signed BAA. Each appointment gets its own room. Existing invitations keep their original video service; new appointments use this choice.</p>
        <p v-if="!state.googleCredentialsConfigured" class="notice">Google connection credentials still need to be installed on the server.</p>
        <p v-if="form.videoProvider === 'vonage' && !state.vonageVideoApproved" class="notice">Vonage clinical video readiness must be enabled on the server before sessions can use it.</p>
        <label class="check-row"><input v-model="form.emailReminders" type="checkbox" /><span><strong>Email appointment links and reminders</strong><small>Confirmation, one day before, and one hour before. Late bookings receive only the currently due message.</small></span></label>
      </fieldset>
      <fieldset>
        <legend>Always-available virtual offices</legend>
        <label class="check-row"><input v-model="form.alwaysAvailableOffice" type="checkbox" /><span><strong>Allow permanent office rooms</strong><small>Off hides the office button and blocks existing office links. Scheduled appointments remain available. Turn this on only when the native office video service is ready.</small></span></label>
      </fieldset>
      <fieldset>
        <legend>Patient texting · agency campaigns</legend>
        <label>Send client texts through<select v-model="form.smsProvider">
          <option value="disabled">Off — email only</option><option value="notifyre">Notifyre</option><option value="vonage">Vonage Campaign 1</option>
        </select></label>
        <p>Campaign 2 workforce messages use their existing setup. This switch changes AuricWell client texts. Failed sends do not automatically switch carriers.</p>
        <h3>Notifyre connection</h3>
        <label>Executed Notifyre BAA reference<input v-model="form.notifyre.baaReference" placeholder="Agreement date or internal document reference" /></label>
        <p v-if="form.notifyre.apiTokenManaged" class="muted">API token is configured in Google Secret Manager.</p>
        <label v-else>Notifyre API token<input v-model="form.notifyre.apiToken" type="password" autocomplete="new-password" :placeholder="form.notifyre.hasApiToken ? 'Saved securely — leave blank to keep' : 'From Notifyre Settings → Developer'" /></label>
        <label v-if="!form.notifyre.apiTokenManaged" class="check-row"><input v-model="form.notifyre.removeToken" type="checkbox" /><span>Remove the saved Notifyre token</span></label>
        <ClientMessagingSetup :settings="form" :practices="state.practices" :busy="busy" @verify="verify" @verify-fax="verifyFax" />
        <h3>Vonage Campaign 1 connection</h3>
        <div class="integration-grid">
          <label>Registered patient SMS number<input v-model="form.vonage.from" type="tel" placeholder="+17195550123" /></label>
          <label>Campaign 1 registration ID<input v-model="form.vonage.campaignId" autocomplete="off" /></label>
        </div>
        <p class="muted">Uses the existing Vonage server credentials, carrier registration, consent and opt-out checks. Patient SMS readiness must be enabled before switching. A different sender or campaign requires the recipient's preferences to be reviewed again.</p>
      </fieldset>
      <button :disabled="busy">{{ busy ? 'Saving…' : 'Save platform settings' }}</button>
    </form>
  </section>
</template>
<script setup>
import { ref, onMounted } from 'vue';
import { api } from './api';
import ClientMessagingSetup from './ClientMessagingSetup.vue';
const emit = defineEmits(['changed']);
const state = ref({}), form = ref(null), busy = ref(false), error = ref(''), notice = ref('');
function accept(value) { state.value = value; form.value = structuredClone(value.settings); form.value.notifyre.apiToken = ''; form.value.notifyre.webhookSecret = ''; form.value.clientMessaging ||= {routes:[]}; }
async function run(fn) { busy.value = true; error.value = ''; notice.value = ''; try { await fn(); } catch(e) { error.value = e.message; } finally { busy.value = false; } }
const save = () => run(async () => { accept(await api('/platform/integrations', { method: 'PUT', body: { revision: state.value.revision, settings: form.value } })); notice.value = 'Platform settings saved for all AuricWell practices.'; emit('changed'); });
const verify = (practiceId) => run(async () => { accept(await api(`/platform/integrations/${form.value.smsProvider==='vonage'?'vonage':'notifyre'}/verify`, { method: 'POST', body: {practiceId} })); notice.value = 'Agency numbers verified. Signed webhooks and campaign approval must also be ready before texting.'; });
const verifyFax = (practiceId) => run(async () => { accept(await api('/platform/integrations/notifyre/fax/verify', {method:'POST',body:{practiceId}})); notice.value='Primary fax number verified. Enable fax sending, save, and test incoming and outgoing faxes before clinical use.'; });
onMounted(() => run(async () => accept(await api('/platform/integrations'))));
</script>
<style scoped>
.platform-integrations fieldset{border:1px solid #d4ddd5;border-radius:14px;padding:22px;margin:20px 0;min-width:0}.platform-integrations legend{font-weight:700;padding:0 8px}.integration-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.check-row{display:flex;flex-direction:row;align-items:flex-start;gap:12px;margin:18px 0;cursor:pointer}.check-row input{width:20px;height:20px;flex:0 0 20px;margin:3px 0}.check-row small{display:block;font-weight:400;margin-top:6px;line-height:1.5}.platform-integrations li{margin:10px 0}.platform-integrations input,.platform-integrations select{max-width:100%}@media(max-width:700px){.integration-grid{grid-template-columns:1fr}}
</style>
