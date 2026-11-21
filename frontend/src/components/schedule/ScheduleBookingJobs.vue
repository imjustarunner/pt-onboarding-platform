<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { AURICWELL_MARK_URL } from '../../constants/auricwellBrand';
import { parseScheduleUtcInstant } from '../../utils/scheduleEventInstants';
import api from '../../services/api';
import { officeBookingProgressText } from '../../utils/ownedOfficeBooking.js';
const props = defineProps({ actorUserId: { type: Number, default: 0 } });
const emit = defineEmits(['completed', 'write-note']);
const jobs = ref([]), error = ref('');
const active = computed(() => jobs.value.filter(job => ['queued','processing'].includes(job.status)));
let generation = 0, timer, busy = false;
const completed = new Set(), dismissed = new Set(), receiptTimers = new Set();
function canWriteNote(job) {
  const appointment = job.result?.appointment;
  const end = parseScheduleUtcInstant(appointment?.endAt);
  return job.status === 'completed' && job.result?.appointmentIds?.length === 1
    && !!appointment && Number(appointment.providerUserId) === props.actorUserId
    && !['learning','tutoring'].includes(appointment.businessType) && end && +end <= Date.now();
}
function dismiss(id) {
  dismissed.add(id); jobs.value = jobs.value.filter(job => job.id !== id);
  try { localStorage.setItem(`schedule.booking-jobs.dismissed:${props.actorUserId}`, JSON.stringify([...dismissed].slice(-100))); } catch { /* optional persistence */ }
}
function track(job, { notify = true, restore = false } = {}) {
  if (restore) { dismissed.delete(job?.id); completed.delete(job?.id); }
  if (!job?.id || dismissed.has(job.id)) return;
  jobs.value = [...jobs.value.filter(item => item.id !== job.id), job];
  if (job.status === 'completed' && !completed.has(job.id)) {
    completed.add(job.id); if (notify) emit('completed', job);
    if (!canWriteNote(job)) {
      const receiptTimer = setTimeout(() => { receiptTimers.delete(receiptTimer); dismiss(job.id); }, 10000);
      receiptTimers.add(receiptTimer);
    }
  }
}
async function check() {
  if (busy || !props.actorUserId || !active.value.length) return;
  const current = generation; busy = true;
  try {
    const results = await Promise.all(active.value.map(job => api.get(`/office-schedule/booking-jobs/${encodeURIComponent(job.id)}`, { skipGlobalLoading: true, timeout: 15000 })));
    if (current !== generation) return;
    for (const response of results) track(response.data.job);
    error.value = '';
  } catch { if (current === generation) error.value = 'Progress is temporarily unavailable. Your booking continues in the background; it has not been submitted again.'; }
  finally { if (current === generation) busy = false; }
}
watch(() => props.actorUserId, async id => {
  const current = ++generation; clearInterval(timer); for (const receipt of receiptTimers) clearTimeout(receipt); receiptTimers.clear();
  jobs.value = []; error.value = ''; busy = false; completed.clear(); dismissed.clear();
  if (!id) return;
  try { for (const key of JSON.parse(localStorage.getItem(`schedule.booking-jobs.dismissed:${id}`) || '[]')) dismissed.add(key); } catch { /* optional persistence */ }
  try {
    const { data } = await api.get('/office-schedule/booking-jobs', { skipGlobalLoading: true, timeout: 15000 });
    if (current !== generation) return;
    for (const job of data.jobs || []) track(job, { notify: false });
  } catch { /* A newly accepted booking is still tracked immediately. */ }
  if (current === generation) timer = setInterval(check, 2000);
}, { immediate: true });
onBeforeUnmount(() => { generation++; clearInterval(timer); for (const receipt of receiptTimers) clearTimeout(receipt); });
defineExpose({ track });
</script>
<template>
 <section v-if="jobs.length" class="schedule-booking-jobs" aria-label="Session booking progress">
  <article v-for="job in jobs" :key="job.id" :class="['booking-job',`booking-job--${job.status}`]">
   <div role="status" aria-live="polite">
    <strong>{{ job.status === 'completed' ? `${job.completed || job.total} sessions scheduled` : job.status === 'failed' ? 'Session booking needs attention' : `Scheduling ${job.total} session${job.total === 1 ? '' : 's'}` }}</strong>
    <p v-if="job.status === 'failed'">{{ job.error || 'Scheduling paused. Refresh the schedule and retry the same booking to continue safely.' }}</p>
    <p v-else-if="job.status !== 'completed'">{{ officeBookingProgressText(job) }} You can keep using your schedule.</p>
   </div>
   <progress v-if="['queued','processing'].includes(job.status)" :value="job.completed" :max="job.total || 1" :aria-label="officeBookingProgressText(job)" />
   <button v-if="canWriteNote(job)" class="booking-job-note" type="button" @click="emit('write-note', job.result.appointment)"><img :src="AURICWELL_MARK_URL" alt="" /> Write note</button>
   <button v-if="!['queued','processing'].includes(job.status)" type="button" @click="dismiss(job.id)" aria-label="Dismiss booking result">×</button>
  </article>
  <p v-if="error" role="status" class="booking-job-error">{{ error }} <button type="button" @click="check">Check progress</button></p>
 </section>
</template>
<style scoped>
.schedule-booking-jobs{margin:8px 12px;display:grid;gap:6px}.booking-job{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid #c6dbea;background:#f2f8fc;border-radius:10px;color:#24445d;font-size:12px}.booking-job p{margin:3px 0 0;line-height:1.45}.booking-job progress{width:120px;flex-shrink:0;accent-color:#167b80}.booking-job--completed{background:#edf8f1;border-color:#a3d3b8;color:#17623e}.booking-job--failed{background:#fff6eb;border-color:#edc28d;color:#855017}.booking-job button{background:transparent;border:0;font:inherit;font-size:20px;cursor:pointer;color:inherit}.booking-job-error{font-size:12px;color:#855017}.booking-job-error button{font:inherit}@media(max-width:600px){.booking-job{flex-wrap:wrap}.booking-job progress{width:100%}}
.booking-job .booking-job-note{display:inline-flex;align-items:center;gap:6px;font:inherit;font-weight:650}.booking-job-note img{width:22px;height:22px}
</style>
