<template>
  <section v-if="!preview && clientId" class="notification-setup" :class="{ complete: setup?.complete }" aria-labelledby="notification-setup-title">
    <ConversaEnrollmentHeader heading-id="notification-setup-title" title="Set up your notifications"
      description="Stay connected to your team, with communication choices that work for you."
      :organization-name="organizationName" :status="setup?.complete ? 'Preferences saved' : 'Priority task'" />
    <div class="notification-setup-body">
      <button v-if="setup?.complete" type="button" class="review-settings" @click="expanded = !expanded">{{ expanded ? 'Hide settings' : 'Review settings' }}</button>
    <p v-if="loading" role="status">Checking notification setup…</p>
    <p v-if="error" role="alert">{{ error }} <button type="button" :disabled="busy || loading" @click="load">Try again</button></p>
    <template v-if="setup && (!setup.complete || expanded)">
      <div class="setup-intro"><span class="setup-step">01</span><div><h3>Choose how we reach you</h3><p>Manage reminders and schedule updates for this client. These preferences are yours alone. Text messages are optional.</p></div></div>
      <form @submit.prevent="save">
        <fieldset :disabled="busy || loading"><legend>Your notification choices</legend>
          <div class="channel-choices">
            <label class="channel-choice" :class="{ selected: preferences.channels.email }"><ConversaIcon type="email" :size="23" /><span><strong>Email reminders</strong><small>Appointment details in your inbox</small></span><input v-model="preferences.channels.email" type="checkbox" /></label>
            <label class="channel-choice" :class="{ selected: preferences.channels.sms }"><ConversaIcon type="sms" :size="23" /><span><strong>Text reminders</strong><small>{{ setup.phoneLastFour ? `Your number ending in ${setup.phoneLastFour}` : 'Optional · requires text consent' }}</small></span><input v-model="preferences.channels.sms" type="checkbox" /></label>
          </div>
          <p class="update-label">Choose the updates you want</p>
          <label><input v-model="preferences.optionalRemindersEnabled" type="checkbox" /> Additional appointment reminders</label>
          <label><input v-model="preferences.confirmationRequestsEnabled" type="checkbox" /> Appointment confirmation requests</label>
          <label><input v-model="preferences.providerPushedUpdatesEnabled" type="checkbox" /> Provider schedule updates</label>
          <label><input v-model="preferences.schedulingChangesEnabled" type="checkbox" /> Scheduling changes</label>
          <button type="submit">{{ busy ? 'Saving…' : 'Save notification choices' }}</button>
        </fieldset>
      </form>
      <div v-if="preferences.channels.sms" class="sms-next-step">
        <div class="setup-intro"><span class="setup-step">02</span><div><h3>Review &amp; accept text messaging</h3><p>One more step for your selected text reminders.</p></div></div>
        <p>{{ smsMessage }}</p>
        <button v-if="setup.smsStatus === 'needs_consent'" type="button" :disabled="busy || loading" @click="beginConsent">Save choices &amp; complete text consent</button>
        <a v-if="consentPath" :href="consentPath" target="_blank" rel="noopener">Open your text consent form</a>
        <button v-if="consentPath || setup.smsStatus === 'awaiting_review'" type="button" :disabled="busy || loading" @click="load">Check enrollment status</button>
        <button v-if="['needs_phone','unavailable','stopped'].includes(setup.smsStatus)" type="button" @click="$emit('contact')">Contact your care team</button>
      </div>
    </template>
    <p v-else-if="setup?.complete" class="setup-complete">Your notification choices are saved with Conversa. You can update them here at any time.</p>
    <p v-if="notice" class="setup-notice" role="status">{{ notice }}</p>
    <footer class="setup-footer"><ConversaIcon type="secure" :size="15" /><span>Your organization remains your point of contact. Conversa manages the messaging experience.</span></footer>
    </div>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
import ConversaEnrollmentHeader from '../conversa/ConversaEnrollmentHeader.vue';
import ConversaIcon from '../conversa/ConversaIcon.vue';
const props = defineProps({ clientId: [Number, String], preview: Boolean, organizationName: String });
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
.notification-setup{border:1px solid #cedded;background:white;border-radius:18px;overflow:hidden;margin-bottom:24px;color:#233653;box-shadow:0 8px 30px #183c7010}.notification-setup-body{padding:24px 30px}.notification-setup p{line-height:1.65}.notification-setup fieldset{border:0;padding:0;display:grid;gap:13px;margin:0}.notification-setup legend{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}.notification-setup label{display:flex;align-items:center;gap:10px;font-size:14px}.notification-setup input{accent-color:#155abb;width:18px;height:18px;flex-shrink:0}.setup-intro{display:flex;align-items:flex-start;gap:13px;margin:0 0 20px}.setup-intro h3{margin:0;font-size:17px;letter-spacing:-.02em}.setup-intro p{margin:6px 0 0;font-size:13px;color:#596d85}.setup-step{display:grid;place-items:center;flex:0 0 32px;height:32px;background:#edf3fc;color:#275187;font-size:11px;font-weight:700;border-radius:10px}.channel-choices{display:grid;grid-template-columns:1fr 1fr;gap:12px}.notification-setup .channel-choice{padding:17px 15px;border:1px solid #d6e0ed;border-radius:12px;cursor:pointer;transition:border-color .15s,background .15s;min-width:0}.channel-choice.selected{border-color:#5b8bc7;background:#f5f9ff}.channel-choice>span:nth-child(2){flex:1;min-width:0}.channel-choice strong,.channel-choice small{display:block}.channel-choice strong{font-size:14px}.channel-choice small{font-size:11px;color:#63758c;line-height:1.5;margin-top:4px}.update-label{font-size:11px;color:#60728a;letter-spacing:.07em;text-transform:uppercase;font-weight:650;margin:9px 0 0}.notification-setup button,.notification-setup a{display:inline-block;width:fit-content;max-width:100%;padding:11px 16px;border-radius:9px;border:1px solid #c1d1e6;background:white;color:#244a78;cursor:pointer;margin:4px 8px 4px 0;font:inherit;font-size:13px;text-decoration:none}.notification-setup button[type=submit]{background:#0f3977;border-color:#0f3977;color:white;margin-top:12px;box-shadow:0 3px 8px #143d7620}.notification-setup :is(button,a,input):focus-visible{outline:3px solid #6d9ed6;outline-offset:3px}.notification-setup button:disabled{opacity:.55;cursor:wait}.sms-next-step{border-top:1px solid #e0e8f2;margin-top:24px;padding-top:24px}.sms-next-step>p{font-size:13px;color:#536680}.setup-footer{display:flex;align-items:center;gap:8px;border-top:1px solid #e4ebf4;margin-top:24px;padding-top:16px;color:#62738a;font-size:11px;line-height:1.6}.setup-notice,.setup-complete{padding:14px 16px;background:#f0f7f4;border-radius:9px;color:#295d49;font-size:13px}.review-settings{float:right}.complete .notification-setup-body{padding-top:16px}@media(max-width:600px){.channel-choices{grid-template-columns:1fr}.notification-setup-body{padding:22px 20px}.review-settings{float:none}.notification-setup .channel-choice{padding:16px 13px}}
</style>
