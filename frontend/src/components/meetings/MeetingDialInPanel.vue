<template>
  <section v-if="data?.enabled || (data?.isHost && data?.reason) || error" class="meeting-phone" aria-label="Join or invite by phone">
    <details :open="open" @toggle="open = $event.target.open">
      <summary>Join or invite by phone <span v-if="waitingCount">· {{ waitingCount }} waiting</span></summary>
      <p v-if="error" role="alert">{{ error }} <button type="button" @click="load">Retry</button></p>
      <p v-if="!data?.enabled && data?.reason" role="status">{{ data.reason }} <span v-if="data.missing?.length">Missing: {{ data.missing.join(', ') }}.</span></p>
      <template v-if="data?.enabled">
        <label v-if="data.isHost" class="meeting-phone__recipient">Invitation for
          <select v-model="selectedUserId" :disabled="!!busy" @change="selectParticipant">
            <option v-for="person in data.participants" :key="person.id" :value="person.id">{{ person.name }}</option>
          </select>
        </label>
        <template v-if="data.details && !loading">
          <p><a :href="data.details.oneTapUrl">Call {{ data.details.number }}</a><br>
            Personal PIN for {{ data.details.name }}: <strong>{{ data.details.pin }} #</strong>
          </p>
          <p class="meeting-phone__hint">Use your own PIN so attendance and speech are associated with you. If your phone does not enter it automatically, enter the PIN followed by #. Telephone joining opens 15 minutes before the meeting.</p>
          <div class="meeting-phone__actions">
            <button type="button" :disabled="!!busy" @click="copyInvitation">Copy dial-in</button>
            <button type="button" :disabled="!!busy" @click="send('sms')">{{ busy === 'sms' ? 'Sending…' : 'Text dial-in' }}</button>
            <button type="button" :disabled="!!busy" @click="send('email')">{{ busy === 'email' ? 'Sending…' : 'Email dial-in' }}</button>
          </div>
          <p v-if="data.isHost" class="meeting-phone__hint">Joining as host by phone? Press 1 after your PIN to admit invited callers automatically while you are connected, or press 2 to admit them from the app.</p>
        </template>
        <p v-if="loading" role="status">Loading invitation…</p>
        <p v-if="message" role="status">{{ message }}</p>
        <ul v-if="data.calls?.length" class="meeting-phone__calls">
          <li v-for="call in data.calls" :key="call.id">
            <span>{{ call.name }} · {{ callLabel(call) }}</span>
            <div v-if="data.isHost" class="meeting-phone__actions">
              <button v-if="call.state === 'waiting'" type="button" :disabled="!!busy" @click="manage(call, 'admit')">Admit</button>
              <button type="button" :disabled="!!busy" @click="manage(call, 'remove')">Remove phone access</button>
            </div>
          </li>
        </ul>
      </template>
    </details>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({ meetingType: { type: String, required: true }, meetingId: { type: Number, required: true } });
const data = ref(null), selectedUserId = ref(null), open = ref(false), error = ref(''), message = ref(''), busy = ref(''), loading = ref(false);
const base = computed(() => props.meetingType === 'supervision' ? `/supervision/sessions/${props.meetingId}/dial-in` : `/team-meetings/${props.meetingId}/dial-in`);
const waitingCount = computed(() => data.value?.calls?.filter(c => c.state === 'waiting').length || 0);
let generation = 0, timer;
const errorMessage = e => e?.response?.data?.error?.message || e?.response?.data?.message || 'Telephone details could not be loaded. Please try again.';

async function load({ quiet = false } = {}) {
  const ownGeneration = ++generation, url = base.value;
  if (!props.meetingId) return;
  if (!quiet) loading.value = true;
  try {
    const result = await api.get(url, { params: selectedUserId.value ? { userId: selectedUserId.value } : {} });
    if (ownGeneration !== generation) return;
    data.value = result.data;
    selectedUserId.value = result.data.userId || selectedUserId.value;
    error.value = '';
  } catch (e) {
    if (ownGeneration !== generation) return;
    if ([403,404,409,410].includes(e?.response?.status)) { data.value = null; error.value = ''; }
    else error.value = errorMessage(e);
  } finally { if (ownGeneration === generation) loading.value = false; }
}
async function selectParticipant() {
  message.value = ''; data.value = { ...data.value, details: null };
  await load();
}
async function copyInvitation() {
  try { await navigator.clipboard.writeText(data.value.details.text); message.value = 'Copied. Share this invitation only with the named participant.'; }
  catch { message.value = 'Copy is unavailable in this browser. Select and copy the number and PIN above.'; }
}
async function send(channel) {
  if (busy.value || loading.value) return;
  busy.value = channel; message.value = '';
  try {
    const response = await api.post(`${base.value}/send`, { userId: selectedUserId.value, channel, requestKey: crypto.randomUUID() });
    message.value = { redirected: 'Delivery was redirected by the app’s testing settings. It was not sent to this participant.', sent: `${channel === 'sms' ? 'Text' : 'Email'} sent to ${data.value.details.name}.`, pending: 'Delivery is pending. Please check before sending again.', skipped: 'Delivery was skipped by the recipient’s notification settings. You can copy the invitation.', review: 'Delivery could not be confirmed. Please check before sending again.' }[response.data.status] || 'Delivery could not be confirmed.';
  } catch (e) { message.value = errorMessage(e); }
  finally { busy.value = ''; }
}
async function manage(call, action) {
  busy.value = call.id; message.value = '';
  try {
    await api.post(`${base.value}/calls/${call.id}`, { action });
    message.value = action === 'remove' ? 'Phone access removed for this meeting.' : 'Telephone participant admitted.';
    await load({ quiet: true });
  } catch (e) { message.value = errorMessage(e); }
  finally { busy.value = ''; }
}
function callLabel(call) {
  if (call.state === 'waiting') return 'waiting for admission';
  if (call.state === 'connecting') return 'connecting';
  return { active: 'connected · transcription active', connecting: 'connected · starting transcription', unavailable: 'connected · transcription unavailable', off: 'connected · transcription off' }[call.audio_status] || 'connected';
}
watch(() => [props.meetingType, props.meetingId], () => {
  clearInterval(timer); generation++; data.value = null; selectedUserId.value = null; error.value = ''; message.value = '';
  void load(); timer = setInterval(() => { if (data.value?.enabled && !busy.value && !loading.value) void load({ quiet: true }); }, 10000);
}, { immediate: true });
onBeforeUnmount(() => { generation++; clearInterval(timer); });
</script>

<style scoped>
.meeting-phone { margin: 12px 0; padding: 12px 16px; border: 1px solid var(--border-color, #cad6d0); border-radius: 10px; background: var(--bg-surface, #fff); color: var(--text-primary, #253c32); font-size: 14px; }
summary { cursor: pointer; font-weight: 600; }
summary span { color: #a34913; }
p { margin: 10px 0; }
.meeting-phone__hint { font-size: 12px; line-height: 1.5; max-width: 75ch; }
.meeting-phone__recipient { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 12px; }
select, button { font: inherit; border: 1px solid #bacbc1; border-radius: 6px; padding: 7px 10px; background: #fff; color: #253c32; }
button { cursor: pointer; } button:disabled { opacity: .6; cursor: wait; }
.meeting-phone__actions { display: flex; gap: 8px; flex-wrap: wrap; }
.meeting-phone__calls { list-style: none; padding: 0; }
.meeting-phone__calls li { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; border-top: 1px solid #dce4df; padding-top: 10px; margin-top: 10px; }
</style>
