<template>
  <section class="opening-picker" aria-label="Available times">
    <h2>Find a time that works</h2>
    <p>Choose a published opening to hold it for 15 minutes while you continue. An appointment is only confirmed by the team.</p>
    <div class="opening-controls">
      <label>Session format<select v-model="format" @change="load"><option value="IN_PERSON">In person</option><option value="VIRTUAL">Telehealth</option></select></label>
      <label>Week of<input v-model="week" type="date" :min="today" @change="load" /></label>
    </div>
    <p class="opening-timezone">Times shown in {{ timezone }}.</p>
    <p v-if="loading" role="status">Checking current openings…</p>
    <p v-if="error" role="alert">{{ error }} <button type="button" @click="load">Try again</button></p>
    <div v-if="hold" class="opening-held" role="status">
      <strong>{{ active ? 'Temporarily held' : 'Your hold has expired' }}</strong>
      <p>{{ dateTime(hold.startAt) }}</p>
      <p>{{ active ? `Expires at ${time(hold.expiresAt)}. This is not a booking.` : 'This time is no longer held. Check availability to choose again.' }}</p>
      <button v-if="active" type="button" :disabled="busy" @click="release">Release this time</button>
    </div>
    <div v-if="!loading" class="opening-days">
      <div v-for="[day, times] in days" :key="day" class="opening-day"><h3>{{ day }}</h3>
        <button v-for="slot in times" :key="`${slot.startAt}-${slot.endAt}`" type="button" :disabled="busy || active" @click="select(slot)">{{ time(slot.startAt) }}</button>
      </div>
    </div>
    <p v-if="!loading && !error && !days.length && !active">No published openings for this week and format. Try another week or continue with a provider preference.</p>
  </section>
</template>
<script setup>
import { computed, onUnmounted, ref, watch } from 'vue';
import api from '../../services/api';
const props = defineProps({ agencySlug: { type: String, required: true }, providerId: { type: Number, required: true }, serviceType: { type: String, default: 'counseling' } });
const emit = defineEmits(['hold']);
const today = new Date().toLocaleDateString('en-CA');
const week = ref(today), format = ref('IN_PERSON'), loading = ref(false), busy = ref(false), error = ref(''), slots = ref([]), hold = ref(null), clock = ref(Date.now());
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const active = computed(() => !!hold.value && +new Date(hold.value.expiresAt) > clock.value);
const key = computed(() => `provider-hold:${props.agencySlug}`);
const base = computed(() => `/public/agency-services/${encodeURIComponent(props.agencySlug)}`);
const days = computed(() => {
  const groups = new Map();
  for (const slot of slots.value.filter(s => +new Date(s.startAt) > clock.value)) {
    const day = new Date(slot.startAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(slot);
  }
  return [...groups];
});
const time = value => new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const dateTime = value => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
let generation = 0;
async function load() {
  const id = ++generation; loading.value = true; error.value = ''; slots.value = [];
  try {
    const { data } = await api.get(`${base.value}/providers/${props.providerId}/slots`, { params: { serviceType: props.serviceType, programType: format.value, weekStart: week.value, bookingMode: 'NEW_CLIENT' }, skipAuthRedirect: true });
    if (id === generation) slots.value = data.slots || [];
  } catch (e) { if (id === generation) error.value = e.response?.data?.error?.message || 'Could not check openings.'; }
  finally { if (id === generation) loading.value = false; }
}
function save(value) { hold.value = value; try { if (value) sessionStorage.setItem(key.value, JSON.stringify(value)); else sessionStorage.removeItem(key.value); } catch {} emit('hold', value); }
async function release() {
  busy.value = true; error.value = '';
  try { await api.post(`${base.value}/release-hold`, { token: hold.value?.token }, { skipAuthRedirect: true }); save(null); await load(); }
  catch { error.value = 'Could not release the hold. It will still expire automatically.'; }
  finally { busy.value = false; }
}
async function select(slot) {
  busy.value = true; error.value = '';
  try {
    // Only one held selection per browser/agency. Never put its bearer token in a URL.
    let previous; try { previous = JSON.parse(sessionStorage.getItem(key.value) || 'null'); } catch {}
    if (previous?.token) await api.post(`${base.value}/release-hold`, { token: previous.token }, { skipAuthRedirect: true });
    const { data } = await api.post(`${base.value}/providers/${props.providerId}/holds`, { startAt: slot.startAt, endAt: slot.endAt, modality: format.value, serviceType: props.serviceType }, { skipAuthRedirect: true });
    save(data.hold); await load();
  } catch (e) { error.value = e.response?.data?.error?.message || 'Could not hold this opening. Please refresh availability.'; }
  finally { busy.value = false; }
}
watch(() => [props.agencySlug, props.providerId, props.serviceType], () => {
  hold.value = null;
  try { const saved = JSON.parse(sessionStorage.getItem(key.value) || 'null'); if (saved?.providerId === props.providerId && saved?.serviceType === props.serviceType) { hold.value = saved; format.value = saved.modality || 'IN_PERSON'; } } catch {}
  emit('hold', active.value ? hold.value : null); load();
}, { immediate: true });
const timer = setInterval(() => { clock.value = Date.now(); }, 1000);
watch(active, (value, before) => { if (!value && before) { emit('hold', null); load(); } });
onUnmounted(() => { clearInterval(timer); generation++; });
</script>
<style scoped>
.opening-picker{color:#193d42}.opening-picker h2{font-size:1.45rem;margin:0 0 12px}.opening-picker p{line-height:1.6;color:#506570}.opening-controls{display:grid;grid-template-columns:1fr 1fr;gap:12px}.opening-controls label{display:grid;gap:8px;font-weight:600;font-size:.85rem}.opening-controls input,.opening-controls select{min-width:0;width:100%;box-sizing:border-box;padding:12px;border:1px solid #d6e2de;border-radius:8px;background:#fff;color:inherit}.opening-timezone{font-size:.8rem}.opening-days{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px}.opening-day{border:1px solid #dbe5e0;padding:10px;border-radius:10px}.opening-day h3{font-size:.8rem;text-align:center}.opening-picker button{min-height:42px;border:1px solid #b9d5cb;border-radius:7px;color:var(--agency-primary-color,#125c49);background:#eff7f2;padding:8px 12px;cursor:pointer}.opening-day button{display:block;width:100%;margin-top:8px}.opening-picker button:disabled{opacity:.5;cursor:default}.opening-held{background:#e8f5ed;border:1px solid #99c7ab;border-radius:10px;padding:16px;margin:16px 0}.opening-picker :focus-visible{outline:3px solid #247969;outline-offset:3px}@media(max-width:420px){.opening-controls{grid-template-columns:1fr}}
</style>
