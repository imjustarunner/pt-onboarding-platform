<template>
  <section v-if="!preview && clientId" class="notification-setup" :class="{ complete: setup?.complete }" aria-labelledby="notification-setup-title">
    <header><div><span class="setup-badge">{{ setup?.complete ? 'Completed' : 'Priority task' }}</span><h2 id="notification-setup-title">Set up your notifications</h2></div>
      <button v-if="setup?.complete" type="button" @click="expanded = !expanded">{{ expanded ? 'Hide settings' : 'Review settings' }}</button>
    </header>
    <p v-if="loading" role="status">Checking notification setup…</p>
    <p v-if="error" role="alert">{{ error }} <button type="button" :disabled="busy || loading" @click="load">Try again</button></p>
    <template v-if="setup && (!setup.complete || expanded)">
      <p>Choose how you hear about appointments and schedule changes for this client. These choices apply only to you. You can complete this task without choosing texts.</p>
      <form @submit.prevent="save">
        <fieldset :disabled="busy || loading"><legend>Your notification choices</legend>
          <label><input v-model="preferences.channels.email" type="checkbox" /> Email reminders</label>
          <label><input v-model="preferences.channels.sms" type="checkbox" /> Text reminders<span v-if="setup.phoneLastFour"> to my number ending in {{ setup.phoneLastFour }}</span></label>
          <label><input v-model="preferences.optionalRemindersEnabled" type="checkbox" /> Additional appointment reminders</label>
          <label><input v-model="preferences.confirmationRequestsEnabled" type="checkbox" /> Appointment confirmation requests</label>
          <label><input v-model="preferences.providerPushedUpdatesEnabled" type="checkbox" /> Provider schedule updates</label>
          <label><input v-model="preferences.schedulingChangesEnabled" type="checkbox" /> Scheduling changes</label>
          <button type="submit">{{ busy ? 'Saving…' : 'Save notification choices' }}</button>
        </fieldset>
      </form>
      <div v-if="preferences.channels.sms" class="sms-next-step">
        <h3>Text enrollment</h3>
        <p>{{ smsMessage }}</p>
        <button v-if="setup.smsStatus === 'needs_consent'" type="button" :disabled="busy || loading" @click="beginConsent">Save choices &amp; complete text consent</button>
        <a v-if="consentPath" :href="consentPath" target="_blank" rel="noopener">Open your text consent form</a>
        <button v-if="consentPath || setup.smsStatus === 'awaiting_review'" type="button" :disabled="busy || loading" @click="load">Check enrollment status</button>
        <button v-if="['needs_phone','unavailable','stopped'].includes(setup.smsStatus)" type="button" @click="$emit('contact')">Contact your care team</button>
      </div>
    </template>
    <p v-else-if="setup?.complete">Your notification choices are saved. You can update them here at any time.</p>
    <p v-if="notice" role="status">{{ notice }}</p>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
const props = defineProps({ clientId: [Number, String], preview: Boolean });
defineEmits(['contact']);
const setup = ref(null), preferences = ref(null), loading = ref(false), busy = ref(false), error = ref(''), notice = ref(''), expanded = ref(false), consentPath = ref('');
let sequence = 0;
const smsMessage = computed(() => ({
  needs_consent: 'Complete the consent form to request text reminders. Your care team will review it before activation. Message and data rates may apply. Reply STOP to stop texts.',
  needs_phone: 'Your account needs a valid phone number. Ask your care team to update it before enrolling in texts.',
  unavailable: 'Text enrollment is not available for this program yet. Your care team can help; email choices can still be saved.',
  stopped: 'Texts are currently stopped for your number. Ask your care team for the program’s re-enrollment instructions.',
  awaiting_review: 'Your signed consent is waiting for care-team review. Text enrollment will be complete after activation.',
  enrolled: 'Your text reminder consent is recorded. Delivery follows your saved choices.'
}[setup.value?.smsStatus] || 'Checking text enrollment…'));
async function refresh(own) {
  const { data } = await api.get(`/guardian-portal/clients/${props.clientId}/notification-setup`, { skipGlobalLoading: true });
  if (own === sequence) { setup.value = data; preferences.value = structuredClone(data.preferences); }
}
async function load() {
  const own = ++sequence; setup.value = null; preferences.value = null; error.value = ''; notice.value = ''; loading.value = false;
  if (!props.clientId || props.preview) return;
  loading.value = true;
  try { await refresh(own); }
  catch (e) { if (own === sequence) error.value = e.response?.data?.error?.message || 'Notification setup could not be loaded.'; }
  finally { if (own === sequence) loading.value = false; }
}
async function saveChoices(own, clientId) {
  await api.put(`/guardian-portal/clients/${clientId}/reminder-preferences`, preferences.value);
  if (own !== sequence) return false;
  await refresh(own);
  return own === sequence;
}
async function save() {
  if (busy.value) return;
  const own = sequence, clientId = props.clientId; busy.value = true; error.value = ''; notice.value = '';
  try { if (await saveChoices(own, clientId)) notice.value = setup.value.complete ? 'Notification setup is complete.' : 'Choices saved. Complete the text enrollment step below.'; }
  catch (e) { if (own === sequence) error.value = e.response?.data?.error?.message || 'Your choices could not be saved.'; }
  finally { busy.value = false; }
}
async function beginConsent() {
  if (busy.value) return;
  const own = sequence, clientId = props.clientId; busy.value = true; error.value = '';
  try {
    if (!await saveChoices(own, clientId)) return;
    const { data } = await api.post(`/guardian-portal/clients/${clientId}/notification-setup/sms-consent`);
    if (own === sequence) { consentPath.value = data.path; notice.value = 'Open the consent form below, then check enrollment status when you return.'; }
  } catch (e) { if (own === sequence) error.value = e.response?.data?.error?.message || 'The consent form could not be opened.'; }
  finally { busy.value = false; }
}
watch(() => [props.clientId, props.preview], () => { consentPath.value = ''; expanded.value = false; load(); }, { immediate: true });
</script>
<style scoped>
.notification-setup{border:2px solid var(--portal-accent,#2459ad);background:#f4f8ff;border-radius:12px;padding:22px;margin-bottom:22px;color:#233653}.notification-setup.complete{border:1px solid #cbdccd;background:#f6faf6}.notification-setup header{display:flex;justify-content:space-between;align-items:center;gap:16px}.notification-setup h2{margin:6px 0;font-size:21px}.setup-badge{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em}.notification-setup p{line-height:1.6}.notification-setup fieldset{border:0;padding:0;display:grid;gap:12px}.notification-setup legend{font-weight:600;margin-bottom:12px}.notification-setup label{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.notification-setup button,.notification-setup a{display:inline-block;width:fit-content;padding:10px 14px;border-radius:7px;border:1px solid #9cafc8;background:white;color:#193c74;cursor:pointer;margin:4px 8px 4px 0;font:inherit}.notification-setup button[type=submit]{background:var(--portal-accent,#2459ad);color:white}.sms-next-step{border-top:1px solid #c5d5e9;margin-top:18px;padding-top:8px}
</style>
