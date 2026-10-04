<template>
  <section v-if="items.length || error" class="office-usage" aria-label="Office assignment review">
    <h2>Office assignment reviews</h2>
    <p v-if="error" role="alert">{{ error }}</p>
    <div v-for="r in items" :key="r.id" class="review">
      <strong>{{ r.officeName }} · {{ r.roomName }} · {{ days[r.weekday] }} {{ r.hour }}:00–{{ Number(r.hour) + 1 }}:00</strong>
      <p v-if="r.status === 'protected_interior'">Protected interior hour — stays assigned while there is qualifying appointment use on both sides in this continuous office block. No re-request is needed.</p>
      <p v-else-if="r.status === 'warning'">No appointment for two weeks. At four weeks, you will need to request to keep this office time. Cancellations and no-shows count as use.</p>
      <p v-else-if="r.status === 'pending'">Request submitted. Your assignment is protected while approval is pending.</p>
      <template v-else>
        <p>No appointment for four weeks. Request to keep this office time by the end of {{ r.deadlineDate }} ({{ r.timezone }}), or it will be released for others.</p>
        <button :disabled="busy" @click="request(r.id)">{{ busy ? 'Submitting…' : 'Request to keep this office time' }}</button>
      </template>
    </div>
  </section>
</template>
<script setup>
import { ref, onMounted } from 'vue';
import api from '../../services/api';
const items = ref([]), error = ref(''), busy = ref(false);
const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
async function load() { items.value = (await api.get('/office-schedule/usage-reviews')).data.items; }
async function request(id) {
  if (busy.value) return; busy.value = true; error.value = '';
  try { await api.post(`/office-schedule/usage-reviews/${id}/request`); await load(); }
  catch (e) { error.value = e.response?.data?.error?.message || 'Unable to submit the request. Please try again.'; }
  finally { busy.value = false; }
}
onMounted(() => load().catch(() => { error.value = 'Office assignment reviews could not be loaded. Refresh to check your deadlines.'; }));
</script>
<style scoped>
.office-usage{margin:0 0 16px;padding:18px;border:1px solid #d97706;border-radius:12px}.review{margin:12px 0}h2{font-size:1.2rem}button{padding:8px 12px;cursor:pointer}[role=alert]{color:#b91c1c}
</style>
