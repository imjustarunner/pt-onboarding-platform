<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
import ConversaBrand from '../conversa/ConversaBrand.vue';
import SecureMessageBanner from '../conversa/SecureMessageBanner.vue';
import EmailDeliveryChoice from '../messages/EmailDeliveryChoice.vue';

const props = defineProps({ agencyId: { type: Number, required: true }, clientId: { type: Number, required: true }, clientName: { type: String, default: '' } });
const emit = defineEmits(['close']);
const basePerson = ref(null); const recipient = ref(null); const recipientKey = ref('');
const method = ref('secure'); const body = ref(''); const subject = ref(''); const error = ref(''); const status = ref('');
const busy = ref(false); const loading = ref(false); const deliveryChoice = ref(null); let request = 0;
const clientKey = computed(() => `client:${props.clientId}@${props.agencyId}`);
const recipients = computed(() => [...new Map([
  ...(basePerson.value ? [{ personKey: clientKey.value, displayName: basePerson.value.displayName, email: basePerson.value.email }] : []),
  ...(basePerson.value?.clientMessaging?.guardians || [])
].filter(p => p.personKey).map(p => [p.personKey, p])).values()]);
const target = computed(() => method.value === 'sms' ? basePerson.value : recipient.value);
const availableMethods = computed(() => ['secure', 'email', 'sms'].map(id => ({ id, label: { secure: 'Secure message', email: 'Email', sms: 'Text' }[id], ...(id === 'sms' ? basePerson.value : recipient.value)?.methods?.find(m => m.id === id) })));
const activeMethod = computed(() => availableMethods.value.find(m => m.id === method.value));
const address = computed(() => method.value === 'sms' ? basePerson.value?.phone : recipient.value?.email);
async function loadRecipient(key) {
  const current = ++request; loading.value = true; error.value = ''; recipient.value = null;
  try {
    const { data } = await api.get(`/messages/hub/people/${encodeURIComponent(key)}`, { params: { agencyId: props.agencyId }, skipGlobalLoading: true });
    if (current !== request) return;
    recipient.value = data.person;
    if (!data.person) error.value = 'This recipient is not available to your account.';
  } catch (e) { if (current === request) error.value = e.response?.data?.error?.message || 'Could not load communication options.'; }
  finally { if (current === request) loading.value = false; }
}
async function load() {
  const current = ++request; loading.value = true; basePerson.value = null; recipient.value = null; error.value = ''; status.value = ''; body.value = ''; subject.value = ''; deliveryChoice.value = null; method.value = 'secure';
  try {
    const { data } = await api.get(`/messages/hub/people/${encodeURIComponent(clientKey.value)}`, { params: { agencyId: props.agencyId }, skipGlobalLoading: true });
    if (current !== request) return;
    basePerson.value = data.person;
    const preferred = data.person?.clientMessaging?.defaultTalkingToPersonKey;
    const key = recipients.value.some(p => p.personKey === preferred) ? preferred : clientKey.value;
    recipientKey.value = key;
    await loadRecipient(key);
  } catch (e) { if (current === request) error.value = e.response?.data?.error?.message || 'Could not load client communications.'; }
  finally { if (current === request) loading.value = false; }
}
function selectMethod(id) { if (busy.value) return; method.value = id; body.value = ''; subject.value = ''; error.value = ''; status.value = ''; deliveryChoice.value = null; }
async function send(choice = null) {
  if (busy.value || loading.value || !body.value.trim() || !activeMethod.value?.available) return;
  busy.value = true; error.value = ''; status.value = '';
  try {
    const { data } = await api.post('/messages/hub/send', {
      agencyId: props.agencyId, personKey: method.value === 'sms' ? clientKey.value : recipientKey.value,
      clientId: props.clientId, method: method.value, body: body.value.trim(), subject: subject.value.trim(),
      mode: 'new', newTopic: true, deliveryChoice: choice
    }, { skipGlobalLoading: true });
    if (data?.error) throw new Error(data.error.message || 'Message was not sent.');
    status.value = data.queued || data.scheduled ? 'Message queued in Conversa. Delivery follows the recipient’s settings.' : 'Message sent through Conversa.';
    body.value = ''; subject.value = ''; deliveryChoice.value = null;
  } catch (e) {
    if (e.response?.data?.error?.code === 'RECIPIENT_AVAILABILITY_CHOICE_REQUIRED') deliveryChoice.value = e.response.data.error.availability;
    else error.value = e.response?.data?.error?.message || e.message || 'Message could not be sent.';
  } finally { busy.value = false; }
}
watch(() => [props.clientId, props.agencyId], load, { immediate: true });
</script>
<template>
  <section class="appointment-conversa conversa-surface" aria-label="Message client from appointment">
    <header><ConversaBrand compact /><button type="button" :disabled="busy" @click="emit('close')">Close messages</button></header>
    <p>For {{ clientName }}. Messages use the client’s existing Conversa conversation and communication permissions.</p>
    <p v-if="loading" role="status">Loading communication options…</p>
    <label v-if="recipients.length > 1 && method !== 'sms'">Recipient
      <select v-model="recipientKey" :disabled="busy || loading" @change="loadRecipient(recipientKey)"><option v-for="person in recipients" :key="person.personKey" :value="person.personKey">{{ person.displayName }}{{ person.email ? ` · ${person.email}` : '' }}</option></select>
    </label>
    <div class="channels" role="group" aria-label="Communication channel"><button v-for="channel in availableMethods" :key="channel.id" type="button" :aria-pressed="method === channel.id" :disabled="busy || loading" @click="selectMethod(channel.id)">{{ channel.label }}</button></div>
    <SecureMessageBanner v-if="method === 'secure'" shared />
    <p v-if="target">{{ method === 'secure' ? 'Shared care conversation' : `To: ${target.displayName || clientName}${address ? ` · ${address}` : ''}` }}</p>
    <p v-if="!loading && !activeMethod?.available" role="status">{{ activeMethod?.reason || 'This channel is not available for this recipient.' }}</p>
    <label v-if="method !== 'sms'">Subject<input v-model="subject" :disabled="busy" maxlength="200" /></label>
    <label>Message<textarea v-model="body" :disabled="busy || loading || !activeMethod?.available" rows="5" maxlength="10000" placeholder="Write to the client or their selected contact…" /></label>
    <p v-if="method === 'sms'" class="hint">Texts follow existing consent and opt-out rules. Use secure messages for private care details.</p>
    <EmailDeliveryChoice :info="deliveryChoice" :busy="busy" @choose="send($event)" @cancel="deliveryChoice = null" />
    <p v-if="error" role="alert">{{ error }}</p><p v-if="status" role="status">{{ status }}</p>
    <button type="button" class="btn btn-primary" :disabled="busy || loading || !body.trim() || !activeMethod?.available" @click="send()">{{ busy ? 'Sending…' : 'Send through Conversa' }}</button>
  </section>
</template>
<style scoped>
.appointment-conversa{border:1px solid var(--border,#dbe4ed);border-radius:12px;padding:16px;margin-top:12px;min-width:0;background:var(--bg-card,#fff)}header,.channels{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}.channels{justify-content:flex-start;margin:12px 0}button{padding:8px 12px;font:inherit;cursor:pointer;border:1px solid #cbd5e1;border-radius:8px;background:var(--bg-card,#fff);color:inherit}button[aria-pressed=true]{background:#dcfce7;border-color:#15803d}button:disabled{opacity:.6;cursor:default}label{display:grid;gap:6px;margin:12px 0}input,textarea,select{font:inherit;padding:10px;border:1px solid #cbd5e1;border-radius:8px;width:100%;box-sizing:border-box}p{font-size:13px;line-height:1.5}p[role=alert]{color:#b91c1c}.hint{color:#64748b}
</style>
