<template>
  <div class="pu-office">
    <p>Review your office reservations. Each row is one hour: cancel individual hours below, or clear all office reservations for this agency from today onward.</p>
    <div v-if="slots.length" class="cancel-panel">
      <button class="danger" :disabled="busy || loading" @click="confirmCancelAll = !confirmCancelAll">Cancel all office reservations — today onward</button>
      <p class="muted">Ends all {{ slots.length }} recurring hourly assignments listed below and cancels their office bookings starting today, using each office’s time zone. Past dates stay unchanged. Client sessions must be handled separately.</p>
      <div v-if="confirmCancelAll">
        <p><strong>Cancel all {{ slots.length }} recurring hourly assignments?</strong> These office hours will become available to other providers. Any assignment with a linked client session or documentation will be kept and reported below.</p>
        <div class="row">
          <button class="danger" :disabled="busy" @click="cancelAllReservations">{{ busy ? 'Cancelling…' : 'Confirm: cancel all from today onward' }}</button>
          <button :disabled="busy" @click="confirmCancelAll = false">Keep reservations</button>
        </div>
      </div>
    </div>
    <ProviderContactHours :base="base" :agency-id="agencyId" :readonly="readonly" />
    <fieldset>
      <legend>Availability and booking preferences</legend>
      <label><input v-model="preferences.inPerson" type="checkbox" /> Available in person</label>
      <label><input v-model="preferences.virtual" type="checkbox" /> Available virtually</label>
      <label><input v-model="preferences.online" type="checkbox" /> Accept online reservations at the hours I open below</label>

      <p class="muted">Your office assignment stays reserved until you release it. Opening booking lets clients request that time; existing client sessions stay protected. Confirming this review applies these booking choices to the office hours below.</p>
      <a :href="myScheduleHref" target="_blank" rel="noopener">Review your full office schedule</a>
    </fieldset>
    <p v-if="loading">Loading assignments…</p>
    <p v-if="error" role="alert" class="err">{{ error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <ul class="slots">
      <li v-for="s in slots" :key="s.id">
        <strong>{{ s.title }}</strong><span>{{ s.when }} ({{ s.timeZone }})</span>
        <div class="row">
          <label>Applies to <select v-model="s.scope"><option value="occurrence">One day; keep recurring assignment</option><option value="future">Selected date and future occurrences</option></select></label>
          <label>Date <input v-model="s.date" type="date" /></label>
        </div>
        <div class="row">
          <button class="danger" :disabled="busy" @click="s.confirmRelease = !s.confirmRelease">Cancel office reservation</button>
          <button :disabled="busy" @click="s.edit = !s.edit">Change recurring time</button>
        </div>
        <div v-if="s.confirmRelease" class="row">
          <span>{{ s.scope === 'future' ? `Cancel this hour from ${s.date} onward and end its recurring assignment? Other providers can reserve it.` : `Cancel this hour on ${s.date} only? Your recurring assignment stays in place.` }}</span>
          <button class="danger" :disabled="busy" @click="act(s, 'forfeit')">{{ s.scope === 'future' ? 'Confirm: cancel this and all following' : 'Confirm: cancel this date only' }}</button>
        </div>
        <p class="muted">Cancel office reservation releases the room for others. It does not cancel a linked client session.</p>
        <div v-if="s.edit" class="row">
          <label>Day <select v-model.number="s.newWeekday"><option v-for="(day,i) in days" :key="day" :value="i">{{ day }}</option></select></label>
          <label>Hour <input v-model.number="s.newHour" type="number" min="0" max="23" /></label>
          <button :disabled="busy" @click="act(s, 'move')">Save or request time change</button>
          <span class="muted">Approval requests keep your current reservation. Use My Schedule to change rooms or move just one occurrence.</span>
        </div>
        <div class="row">
          <label><input v-model="s.inPerson" type="checkbox" :disabled="busy || !preferences.online || !preferences.inPerson" /> Open in person</label>
          <label><input v-model="s.virtual" type="checkbox" :disabled="busy || !preferences.online || !preferences.virtual" /> Open virtually</label>
          <button :disabled="busy" @click="act(s, 'availability')">Save bookable hours</button>
          <span class="muted">Repeats with this assignment. Only unoccupied occurrences become bookable.</span>
        </div>
      </li>
    </ul>
    <p v-if="!loading && !slots.length && !error">No active office assignments for this agency.</p>
    <div class="row">
      <a :href="myScheduleHref" target="_blank" rel="noopener">Open My Schedule</a>
      <button :disabled="busy || loading || !!error" @click="completeReview">Confirm office review and preferences</button>
    </div>
  </div>
</template>
<script setup>
import ProviderContactHours from './ProviderContactHours.vue';
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
const props = defineProps({ agencyId: [Number, String], mode: { type: String, default: 'auth' }, token: String, data: Object, readonly:Boolean });
const emit = defineEmits(['complete']);
const route = useRoute();
const slots = ref([]), loading = ref(false), busy = ref(false), error = ref(''), message = ref('');
const confirmCancelAll = ref(false);
const preferences = reactive({ inPerson: true, virtual: true, online: false, ...(props.data?.preferences || {}) });
let loaded = false;
const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const base = computed(() => props.mode === 'token' ? `/public/provider-update/${encodeURIComponent(props.token)}` : '/provider-update/me');
const myScheduleHref = computed(() => `${route.params.organizationSlug ? `/${route.params.organizationSlug}` : ''}/my-schedule`);
function todayForOffice(slot) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: slot.timeZone, year:'numeric',month:'2-digit',day:'2-digit' }).format(new Date());
}
function nextDate(slot) {
  const today = todayForOffice(slot);
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + (Number(slot.weekday) - date.getUTCDay() + 7) % 7);
  return date.toISOString().slice(0, 10);
}
async function load() {
  loading.value = true;
  try {
    const { data } = await api.get(`${base.value}/office-schedule-review`, { params: { agencyId: props.agencyId } });
    if (!loaded && !props.data?.preferences && (data.items || []).some(s => s.inPerson || s.virtual)) preferences.online = true;
    loaded = true;
    slots.value = (data.items || []).map(s => ({ ...s, savedInPerson: !!s.inPerson, savedVirtual: !!s.virtual, date: nextDate(s), scope: 'occurrence', newWeekday: s.weekday, newHour: s.hour }));
  } catch(e) { error.value = e.response?.data?.error?.message || 'Unable to load office assignments.'; }
  finally { loading.value = false; }
}
async function act(slot, action) {
  busy.value = true; error.value = ''; message.value = '';
  try {
    const { data } = await api.post(`${base.value}/office-assignments/${slot.id}/${action}`, {
      agencyId: props.agencyId, scope: slot.scope, date: slot.date, acknowledged: action === 'forfeit',
      newRoomId: slot.roomId, newWeekday: slot.newWeekday, newHour: slot.newHour,
      inPerson: !!(preferences.online && preferences.inPerson && slot.inPerson), virtual: !!(preferences.online && preferences.virtual && slot.virtual)
    }, { timeout: 30000 });
    message.value = data.message || 'Office hours updated.';
    await load();
  } catch(e) { error.value = e.response?.data?.error?.message || 'The update did not finish. Refresh before trying again.'; }
  finally { busy.value = false; }
}
async function cancelAllReservations() {
  if (busy.value || !confirmCancelAll.value) return;
  busy.value = true; error.value = ''; message.value = '';
  const selected = [...slots.value];
  const failures = [];
  let cancelled = 0;
  try {
    for (const slot of selected) {
      try {
        await api.post(`${base.value}/office-assignments/${slot.id}/forfeit`, {
          agencyId: props.agencyId, scope: 'future', date: todayForOffice(slot), acknowledged: true
        }, { timeout: 30000 });
        cancelled += 1;
      } catch (e) {
        failures.push(`${slot.title}, ${slot.when}: ${e.response?.data?.error?.message || 'Cancellation could not be confirmed. Refresh to check this assignment.'}`);
      }
    }
    message.value = `Cancelled ${cancelled} of ${selected.length} recurring hourly assignments from today onward.`;
    confirmCancelAll.value = false;
    await load();
    if (failures.length) error.value = [error.value, ...failures].filter(Boolean).join('\n');
  } finally { busy.value = false; }
}
async function completeReview() {
  busy.value = true; error.value = '';
  try {
    // Apply these choices to the actual reserved hours before marking the review complete.
    for (const slot of slots.value) {
      const inPerson = !!(preferences.online && preferences.inPerson && slot.inPerson);
      const virtual = !!(preferences.online && preferences.virtual && slot.virtual);
      if (inPerson === slot.savedInPerson && virtual === slot.savedVirtual) continue;
      await api.post(`${base.value}/office-assignments/${slot.id}/availability`, {
        agencyId: props.agencyId,
        inPerson: !!(preferences.online && preferences.inPerson && slot.inPerson),
        virtual: !!(preferences.online && preferences.virtual && slot.virtual)
      });
      slot.savedInPerson = inPerson; slot.savedVirtual = virtual;
    }
    emit('complete', { reviewed: true, preferences: { ...preferences }, slotCount: slots.value.length });
  } catch(e) { error.value = e.response?.data?.error?.message || 'Some hours could not be saved. Review the current settings before confirming.'; }
  finally { busy.value = false; }
}
onMounted(load);
</script>
<style scoped>
.cancel-panel{border:1px solid #fecaca;border-radius:10px;padding:1rem}.danger{color:#b91c1c;border-color:#fecaca}.err{white-space:pre-line}
.pu-office,.slots,fieldset,.slots li{display:grid;gap:.8rem}.slots{list-style:none;padding:0}.slots li,fieldset{border:1px solid #d1d5db;border-radius:10px;padding:1rem}.row{display:flex;flex-wrap:wrap;align-items:center;gap:.7rem}label{display:flex;gap:.4rem;align-items:center}.muted{color:#64748b;font-size:.88rem}.err{color:#b91c1c}button,select,input{padding:.45rem;border:1px solid #94a3b8;border-radius:6px}button{cursor:pointer;background:white}button:disabled{opacity:.5;cursor:default}
</style>
