<template>
  <article class="card">
    <div class="delivery-heading"><h2>Appointment reminders</h2><button class="outline" @click="$emit('close')">Close</button></div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="notice" class="notice" role="status">{{ notice }}</p>
    <p>Links go to the client’s saved contact details. A submitted message has been accepted for sending; it does not confirm the recipient received it.</p>
    <p v-if="!rows.length">No reminders have been submitted. Video appointments need a signed telehealth consent and a saved email or enabled text preference. Upcoming appointments are checked every minute.</p>
    <div v-for="r in rows" :key="r.id" class="delivery-row">
      <strong>{{ r.channel === 'sms' ? 'Text message' : 'Email' }} · {{ labels[r.status] || r.status }}</strong>
      <span>{{ new Date(r.created_at).toLocaleString() }}</span>
      <template v-if="r.status === 'needs_review' || (r.status === 'sending' && Date.now() - new Date(r.updated_at).getTime() > 300000)">
        <p>Check the sending account’s activity before retrying. The response was uncertain, so the message may already have been sent.</p>
        <label class="delivery-check"><input type="checkbox" v-model="confirmed[r.id]" /> I checked that this message was not sent.</label>
        <button class="outline" :disabled="busy || !confirmed[r.id]" @click="retry(r)">Allow another attempt</button>
      </template>
    </div>
    <button class="outline" :disabled="busy" @click="run(load)">Refresh</button>
  </article>
</template>
<script setup>
import { ref, onMounted } from 'vue';
import { api } from './api';
const props = defineProps({ base: String, appointmentId: String });
defineEmits(['close']);
const rows = ref([]), confirmed = ref({}), error = ref(''), notice = ref(''), busy = ref(false);
const labels = { submitted: 'Submitted', sending: 'Sending', needs_review: 'Check delivery', cancelled: 'Cancelled' };
async function run(fn) { busy.value = true; error.value = ''; try { await fn(); } catch(e) { error.value = e.message; } finally { busy.value = false; } }
async function load() { rows.value = await api(`${props.base}/appointments/${props.appointmentId}/deliveries`); }
const retry = r => run(async () => {
  await api(`${props.base}/appointments/${props.appointmentId}/deliveries/${r.id}/retry`, { method: 'POST', body: { confirmedNotSent: confirmed.value[r.id] === true } });
  notice.value = 'Another attempt is allowed when a reminder is next due for this appointment.'; await load();
});
onMounted(() => run(load));
</script>
<style scoped>
.delivery-heading{display:flex;justify-content:space-between;align-items:center;gap:16px}.delivery-row{display:grid;gap:10px;padding:18px 0;border-bottom:1px solid #d4ddd5;margin-bottom:16px}.delivery-check{display:flex;flex-direction:row;gap:10px;align-items:center}.delivery-check input{width:20px;height:20px;flex:0 0 20px}.delivery-row button{justify-self:start}
</style>
