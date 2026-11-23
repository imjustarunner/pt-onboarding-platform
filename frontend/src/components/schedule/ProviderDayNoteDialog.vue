<script setup>
import { onMounted, ref } from 'vue';
import api from '../../services/api';

const props = defineProps({
  providerId: { type: Number, required: true },
  date: { type: String, required: true },
  timeZone: { type: String, default: 'America/Denver' },
  agencyIds: { type: Array, default: () => [] }
});
const emit = defineEmits(['close']);

const clients = ref([]);
const senderAddresses = ref([]);
const subject = ref('');
const text = ref('');
const loading = ref(false);
const sending = ref(false);
const error = ref('');
const notice = ref('');

async function load() {
  loading.value = true;
  error.value = '';
  const agencies = [...new Set(props.agencyIds.map(Number).filter(id => id > 0))];
  const found = [];
  const senders = new Set();
  try {
    for (const agencyId of agencies) {
      const { data } = await api.get(`/users/${props.providerId}/day-note`, {
        params: { agencyId, date: props.date, timeZone: props.timeZone },
        skipGlobalLoading: true
      });
      if (data.fromEmail) senders.add(data.fromEmail);
      for (const client of data.clients || []) {
        if (!found.some(item => item.clientId === client.clientId && item.agencyId === agencyId)) {
          found.push({ ...client, agencyId });
        }
      }
    }
    clients.value = found;
    senderAddresses.value = [...senders];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Could not load the people on this day.';
  } finally {
    loading.value = false;
  }
}

async function send() {
  if (sending.value || notice.value) return;
  sending.value = true;
  error.value = '';
  notice.value = '';
  const agencies = [...new Set(clients.value.map(client => Number(client.agencyId)).filter(id => id > 0))];
  let sent = 0;
  let skipped = 0;
  let unconfirmed = 0;
  const errors = [];
  try {
    for (const agencyId of agencies) {
      try {
        const { data } = await api.post(`/users/${props.providerId}/day-note`, {
          agencyId,
          date: props.date,
          timeZone: props.timeZone,
          subject: subject.value,
          text: text.value
        }, { skipGlobalLoading: true });
        sent += Number(data.sent || 0);
        skipped += Number(data.skipped || 0);
        unconfirmed += Number(data.unconfirmed || 0);
      } catch (e) {
        if (e.response?.status >= 400 && e.response.status < 500) {
          errors.push(e.response.data?.error?.message || 'Could not send this note.');
        } else {
          unconfirmed += clients.value.filter(client => Number(client.agencyId) === agencyId).length;
        }
      }
    }
    if (sent || skipped || unconfirmed || !errors.length) {
      notice.value = [
        `Confirmed sent for ${sent} ${sent === 1 ? 'client' : 'clients'}.`,
        skipped ? `${skipped} skipped.` : '',
        unconfirmed ? `Check delivery for ${unconfirmed} before trying again.` : ''
      ].filter(Boolean).join(' ');
    }
    error.value = [...new Set(errors)].join(' ');
  } finally {
    sending.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="modal-backdrop modal-backdrop--request" @click.self="emit('close')">
    <div class="modal day-note" role="dialog" aria-modal="true" aria-labelledby="day-note-title">
      <div class="modal-head">
        <h3 id="day-note-title">Email this day</h3>
        <button class="btn btn-secondary" type="button" @click="emit('close')">Close</button>
      </div>
      <p v-if="loading">Loading the people on this day…</p>
      <p v-else-if="clients.length">This note goes to {{ clients.length }} {{ clients.length === 1 ? 'client' : 'clients' }} on {{ date }}: {{ clients.map(client => client.clientName).join(', ') }}.</p>
      <p v-else>No clients are on this day.</p>
      <p v-if="clients.length">Each eligible contact receives a separate Bcc email<span v-if="senderAddresses.length"> from {{ senderAddresses.join(', ') }}</span>.</p>
      <form @submit.prevent="send">
        <label>Subject<input v-model="subject" type="text" maxlength="200" required :disabled="sending || !clients.length" /></label>
        <label>Message<textarea v-model="text" rows="4" maxlength="4000" required :disabled="sending || !clients.length" placeholder="Write a note. This does not cancel the day." /></label>
        <button type="submit" :disabled="sending || loading || !clients.length || !!notice">{{ sending ? 'Sending…' : 'Send note' }}</button>
      </form>
      <p v-if="notice" role="status">{{ notice }}</p>
      <p v-if="error" role="alert">{{ error }}</p>
    </div>
  </div>
</template>

<style scoped>
.day-note { display: grid; gap: 12px; max-width: 560px; }
.day-note p, .day-note label { margin: 0; }
label { display: grid; gap: 6px; }
input, textarea { width: 100%; box-sizing: border-box; font: inherit; padding: 8px; }
button { font: inherit; cursor: pointer; padding: 8px 10px; border-radius: 7px; border: 1px solid #cbd5e1; background: #fff; justify-self: start; }
p[role="alert"] { color: #b91c1c; }
</style>
