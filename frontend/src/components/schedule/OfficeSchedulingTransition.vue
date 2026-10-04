<template>
  <section class="office-transition" aria-label="Office scheduling transition">
    <h2>Office scheduling transition</h2>
    <p>Now: assigned offices are automatically booked. After each agency’s transition date: assignments reserve the room; only actual appointments book time. Google Calendar is optional.</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <div class="controls">
      <label>Agency <select v-model="selected" :disabled="busy" @change="resetPreview"><option value="">Select agency</option><option v-for="a in agencies" :key="a.agencyId" :value="a.agencyId">{{ a.name }} — {{ a.transitionDate || 'Automatic office booking' }}</option></select></label>
      <label>Appointment-based scheduling starts <input v-model="date" type="date" :disabled="busy" @change="preview = null" /></label>
      <button :disabled="busy || !selected" @click="loadPreview">Preview transition</button>
    </div>
    <p>Applies at midnight in each office’s time zone. Leave the date blank to keep automatic office booking. Once the transition begins, it cannot be moved here.</p>
    <div v-if="preview" class="preview">
      <strong>{{ date ? `Transition on ${date}` : 'Keep automatic office booking' }}</strong>
      <p>{{ preview.assignmentCount }} recurring hourly assignments. {{ preview.protectedAppointmentCount }} upcoming appointment records remain intact. Past dates are preserved.</p>
      <p v-if="preview.missingAgencyCount" role="alert">{{ preview.missingAgencyCount }} assignments in shared buildings need an agency assigned before you can schedule this transition.</p>
      <p v-else>Unused-time tracking starts no earlier than the transition date: warning at 2 weeks, re-request at 4 weeks, then 2 business days to respond. Weekends and agency holidays do not count. Cancellations and no-shows count as use.</p>
      <p>Interior hours stay assigned without re-requesting when qualifying appointment use exists on both sides in the same continuous office block. Unused hours at the ends follow the normal review and release rules. If an interior hour becomes an unused end, its review clock restarts.</p>
      <button :disabled="busy || (!!date && preview.missingAgencyCount > 0)" @click="save">{{ busy ? 'Saving…' : 'Confirm scheduling policy' }}</button>
    </div>
    <h3>Requests to keep office time</h3>
    <p v-if="!pending.length">No pending requests.</p>
    <div v-for="r in pending" :key="r.id" class="review">
      <span>{{ r.providerName }} · {{ r.officeName }} · {{ r.roomName }} · {{ days[r.weekday] }} {{ r.hour }}:00–{{ Number(r.hour) + 1 }}:00</span>
      <button :disabled="busy" @click="decide(r.id, 'approve')">Approve — restart 4-week review</button>
      <button :disabled="busy" @click="decide(r.id, 'deny')">Decline — send new release deadline</button>
    </div>
  </section>
</template>
<script setup>
import { onMounted, ref } from 'vue';
import api from '../../services/api';
const agencies = ref([]), selected = ref(''), date = ref(''), preview = ref(null), pending = ref([]), busy = ref(false), error = ref(''), message = ref('');
const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
async function load() {
  const [policies, reviews] = await Promise.all([api.get('/office-schedule/scheduling-policies'), api.get('/office-schedule/usage-reviews', { params: { reviewAll: true } })]);
  agencies.value = policies.data.items; pending.value = reviews.data.items.filter(r => r.status === 'pending');
}
function resetPreview() { preview.value = null; date.value = agencies.value.find(a => a.agencyId === selected.value)?.transitionDate || ''; }
async function perform(fn) {
  if (busy.value) return; busy.value = true; error.value = ''; message.value = '';
  try { await fn(); } catch (e) { error.value = e.response?.data?.error?.message || 'Unable to update office scheduling. Please try again.'; }
  finally { busy.value = false; }
}
const loadPreview = () => perform(async () => { preview.value = (await api.get(`/office-schedule/scheduling-policies/${selected.value}/preview`)).data; });
const save = () => perform(async () => {
  await api.put(`/office-schedule/scheduling-policies/${selected.value}`, { transitionDate: date.value || null, confirmed: true });
  message.value = date.value ? `Transition scheduled for ${date.value}.` : 'Automatic office booking remains enabled.';
  preview.value = null; await load();
});
const decide = (id, decision) => perform(async () => { await api.post(`/office-schedule/usage-reviews/${id}/decision`, { decision }); await load(); });
onMounted(() => perform(load));
</script>
<style scoped>
.office-transition{margin:0 0 16px;padding:18px;border:1px solid #94a3b8;border-radius:12px;background:var(--bg,#fff)}h2{font-size:1.2rem;margin:0 0 8px}p{line-height:1.5}.controls,.review{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin:12px 0}label{display:grid;gap:5px}input,select,button{padding:8px;border:1px solid #94a3b8;border-radius:6px;font:inherit}button{cursor:pointer}button:disabled{opacity:.5}.preview{padding:12px;border:1px solid #94a3b8;border-radius:8px}[role=alert]{color:#b91c1c}
</style>
