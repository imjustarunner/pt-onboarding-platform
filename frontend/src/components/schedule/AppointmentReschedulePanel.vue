<template>
  <div class="session-reschedule" :aria-busy="busy">
    <p v-if="loading" role="status">Loading session…</p>
    <template v-if="info">
      <p>Choose the new time in <strong>{{ info.timeZone }}</strong>.</p>
      <label>New start<input v-model="start" type="datetime-local" :disabled="busy || saved" /></label>
      <label>New end<input v-model="end" type="datetime-local" :disabled="busy || saved" /></label>
      <label v-if="info.hasSeries">Apply this move to
        <select v-model="scope" :disabled="busy || saved">
          <option value="" disabled>Choose which sessions to move</option>
          <option value="single">Just this session — make it one time</option>
          <option v-if="info.canMoveSeries" value="future">This and all future sessions</option>
        </select>
      </label>
      <p v-if="scope === 'single' && info.hasSeries">The other recurring sessions keep their usual times.</p>
      <p v-if="scope === 'future' && info.inPerson">The selected room will be used for the sessions you move. If a reservation is needed, you can request it here.</p>
      <p v-if="checking" role="status">Checking the new time and rooms…</p>
      <template v-if="checked && info.inPerson">
        <label>Office room
          <select v-model.number="roomId" :disabled="busy || saved">
            <option v-for="room in checked.rooms" :key="room.id" :value="room.id">{{ room.label }} · {{ room.needsRequest ? 'Request booking' : 'Your reserved room' }}</option>
          </select>
        </label>
        <p v-if="!checked.rooms.length">{{ checked.requiresReservedRoom
          ? 'Reserve a room at the new time first, or choose a time when you already have a room.' : 'No rooms are available at that time. Choose another time.' }}</p>
        <p v-else-if="needsRequest">This submits a room request. Your current session stays in place until approval.</p>
        <p v-else>Your reserved room will be used for {{ scope === 'future' ? 'the selected time. We’ll also check each following date' : 'this session' }}.</p>
      </template>
      <p v-if="result" role="status">{{ result.pendingApproval ? 'Room request submitted. The original session stays in place until approval.' : scope === 'future' ? 'Sessions moved.' : 'Session moved.' }}</p>
      <button v-else type="button" :disabled="busy || checking || !checked || !scope || (info.inPerson && !roomId) || uncertain" @click="save">
        {{ busy ? 'Saving…' : needsRequest ? 'Request room and move' : 'Move session' }}
      </button>
    </template>
    <p v-if="error" role="alert">{{ error }}</p>
    <button v-if="error && !busy && !uncertain && !saved" type="button" @click="info ? check() : load()">Retry check</button>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import api from '../../services/api.js';
import { toZonedDatetimeLocalValue, wallDatetimeLocalToSummaryIso } from '../../utils/scheduleEventInstants.js';

const props = defineProps({ appointmentId: { type: Number, required: true }, initialStart: { type: String, default: '' }, initialEnd: { type: String, default: '' }, initialTimeZone: { type: String, default: '' } });
const emit = defineEmits(['saved', 'busy']);
const info = ref(null), start = ref(''), end = ref(''), scope = ref(''), roomId = ref(null);
const loading = ref(false), checking = ref(false), busy = ref(false), error = ref(''), checked = ref(null), result = ref(null), uncertain = ref(false);
const saved = computed(() => !!result.value);
const needsRequest = computed(() => checked.value?.rooms?.find(r => r.id === roomId.value)?.needsRequest === true);
let version = 0;
const initialValue = (wall, instant, zone) => wall
  ? props.initialTimeZone ? toZonedDatetimeLocalValue(wallDatetimeLocalToSummaryIso(wall, props.initialTimeZone), zone) : wall.slice(0, 16)
  : toZonedDatetimeLocalValue(instant, zone);
const payload = () => ({ startAt: `${start.value}:00`, endAt: `${end.value}:00` });

async function load() {
  const request = ++version;
  info.value = null; checked.value = null; result.value = null; uncertain.value = false; error.value = ''; loading.value = true;
  try {
    const { data } = await api.get(`/appointments/${props.appointmentId}/reschedule`, { skipGlobalLoading: true });
    if (request !== version) return;
    start.value = initialValue(props.initialStart, data.startAt, data.timeZone);
    end.value = initialValue(props.initialEnd, data.endAt, data.timeZone);
    scope.value = data.hasSeries ? '' : 'single';
    await nextTick();
    if (request !== version) return;
    info.value = data;
    if (props.initialStart) await check();
  } catch (e) { if (request === version) error.value = e.response?.data?.error?.message || 'Could not load this session.'; }
  finally { if (request === version) loading.value = false; }
}

async function check() {
  const request = ++version;
  checked.value = null; roomId.value = null; error.value = '';
  if (!info.value || !start.value || !end.value || saved.value) return;
  checking.value = true;
  try {
    const { data } = await api.post(`/appointments/${props.appointmentId}/reschedule/options`, payload(), { skipGlobalLoading: true });
    if (request !== version) return;
    checked.value = data; roomId.value = data.selectedRoomId;
  } catch (e) { if (request === version) error.value = e.response?.data?.error?.message || 'Could not check the new time.'; }
  finally { if (request === version) { checking.value = false; loading.value = false; } }
}

watch(start, (value, old) => {
  if (!info.value || !old || !value || saved.value) return;
  const duration = new Date(`${end.value}Z`) - new Date(`${old}Z`);
  if (duration > 0) end.value = new Date(+new Date(`${value}Z`) + duration).toISOString().slice(0, 16);
});
watch([start, end], () => { if (info.value && !busy.value && !saved.value) void check(); }, { flush: 'post' });
watch(() => props.appointmentId, load, { immediate: true });

async function save() {
  if (busy.value || !checked.value || !scope.value || uncertain.value || saved.value) return;
  busy.value = true; emit('busy', true); error.value = '';
  try {
    const { data } = await api.post(`/appointments/${props.appointmentId}/reschedule`, { ...payload(), scope: scope.value, roomId: roomId.value,
      expectedStartAt: info.value.startAt, expectedEndAt: info.value.endAt }, { skipGlobalLoading: true });
    result.value = data; emit('saved', { ...data, rescheduled: true });
  } catch (e) {
    uncertain.value = !e.response || Number(e.response.status) >= 500 || !!e.response?.data?.movedEventIds?.length;
    error.value = uncertain.value ? 'The move may have saved. Refresh the schedule before trying again.' : e.response?.data?.error?.message || 'Could not move this session.';
  } finally { busy.value = false; emit('busy', false); }
}
</script>

<style scoped>
.session-reschedule { display: grid; gap: 12px; }
.session-reschedule p { margin: 0; }
label { display: grid; gap: 6px; font-weight: 600; }
input, select { padding: 10px; border: 1px solid #aebdce; border-radius: 8px; font: inherit; background: white; color: #172b45; }
button { padding: 10px 16px; border: 0; border-radius: 8px; background: #0e766e; color: white; font: inherit; cursor: pointer; }
button:disabled { opacity: .5; cursor: default; }
[role="alert"] { color: #b42318; }
</style>
