<template>
  <section class="day-planner" aria-label="Bulk scheduler">
    <header class="planner-header">
      <div>
        <h2>Bulk scheduler</h2>
        <p>{{ providerLabel || 'My schedule' }}<span v-if="options"> · {{ options.timeZone.replaceAll('_', ' ') }}</span></p>
      </div>
      <label>Schedule date <input v-model.lazy="date" type="date" :min="today" :disabled="busy" /></label>
    </header>

    <p v-if="loading" role="status">Loading booking options…</p>
    <p v-if="optionError" class="error" role="alert">{{ optionError }}</p>

    <template v-if="options">
      <nav class="planner-days" aria-label="Days of the selected week">
        <button v-for="day in week" :key="day" type="button" :aria-current="day === date ? 'date' : undefined"
          :disabled="busy || day < today" @click="date = day">
          <strong>{{ formatDate(day, { weekday: 'short' }) }}</strong> {{ formatDate(day, { month: 'short', day: 'numeric' }) }}
          <span v-if="drafts[day]?.length" class="draft-count">{{ drafts[day].length }}</span>
        </button>
      </nav>

      <div class="planner-roster">
        <div class="roster-heading">
          <h3>Clients</h3>
          <input v-model="search" type="search" placeholder="Find a client…" aria-label="Find a client" />
        </div>
        <p>Drag a client onto a time, or select the client and choose a time.</p>
        <div v-for="group in roster" :key="group.label" class="client-group">
          <h4>{{ group.label }}</h4>
          <div class="client-buttons">
            <button v-for="client in group.clients" :key="client.id" type="button" :draggable="!busy"
              :aria-pressed="selectedClient === client.id" :disabled="busy"
              @click="selectedClient = selectedClient === client.id ? null : client.id"
              @dragstart="startDrag($event, client.id)" @dragend="endDrag">
              {{ client.label }}
            </button>
          </div>
        </div>
        <p v-if="!roster.length">No matching clients in this caseload.</p>
      </div>

      <div class="planner-columns">
        <section class="planner-panel" aria-label="Day timeline">
          <h3>{{ formatDate(date, { weekday: 'long', month: 'long', day: 'numeric' }) }}</h3>
          <p v-if="dayLoading" role="status">Loading calendar…</p>
          <p v-if="dayError" class="error" role="alert">{{ dayError }}</p>
          <div class="planner-times">
            <div v-for="hour in hours" :key="hour[0]" class="planner-hour">
              <span>{{ clockLabel(hour[0]) }}</span>
              <button v-for="time in hour" :key="time" type="button"
                :class="{ occupied: timeTaken(time), 'drop-ready': selectedClient && !timeTaken(time) }"
                :aria-label="`${clockLabel(time)}${timeTaken(time) ? ', occupied' : ''}`"
                :disabled="busy || dayLoading || timeTaken(time)" @click="addAt(time)" @dragover.prevent
                @drop.prevent="dropAt(time)">
                {{ time.slice(3) }}<span v-if="timeTaken(time)" class="sr-only"> occupied</span>
              </button>
            </div>
          </div>
        </section>

        <section class="planner-panel day-draft" aria-label="Appointments to schedule">
          <div class="roster-heading">
            <h3>Appointments to schedule</h3>
            <span v-if="rows.length">{{ rows.length }} visits · {{ durationLabel(totalMinutes) }}</span>
          </div>
          <p v-if="!rows.length" class="empty-draft">Add a client to the timeline to plan this day.</p>
          <article v-for="row in orderedRows" :key="row.rowId" class="draft-row">
            <div class="roster-heading">
              <strong>{{ clientFor(row.clientId)?.label }}</strong>
              <button type="button" class="quiet" :disabled="busy" @click="remove(row)">Remove</button>
            </div>
            <div class="draft-fields">
              <label>Service code
                <select v-model="row.tenantServiceId" :disabled="busy" @change="applyService(row)">
                  <option :value="null">Choose code</option>
                  <option v-for="service in servicesFor(row)" :key="service.id" :value="service.id">{{ service.serviceCode }} · {{ service.name }}</option>
                </select>
              </label>
              <label>Location
                <select v-model="row.serviceLocationId" :disabled="busy" @change="changeLocation(row)">
                  <option :value="null">Choose location</option>
                  <option v-for="location in locationsFor(row.clientId)" :key="location.id" :value="location.id">{{ serviceLocationDisplay(location) }}</option>
                </select>
              </label>
              <label v-if="schoolSlotsFor(row).length > 1">School planning slot
                <select v-model="row.schoolSlotId" :disabled="busy" @change="invalidate">
                  <option :value="null">Choose a school slot</option>
                  <option v-for="slot in schoolSlotsFor(row)" :key="slot.id" :value="slot.id">{{ slot.label }}</option>
                </select>
              </label>
              <label>Start <input v-model="row.startTime" type="time" :disabled="busy" @input="applyService(row)" /></label>
              <label>End <input v-model="row.endTime" type="time" :disabled="busy" @input="invalidate" /></label>
            </div>
            <p v-if="roomsFor(row).length" class="room-note">Assigned room · {{ roomsFor(row).join(', ') }}</p>
            <p v-if="reviewRows[row.rowId]?.status === 'existing'" class="room-note">Already on the calendar</p>
            <p v-for="message in reviewRows[row.rowId]?.errors || []" :key="message" class="error">{{ message }}</p>
            <p v-for="message in reviewRows[row.rowId]?.warnings || []" :key="message" class="warning">{{ message }}</p>
          </article>

          <section v-if="officeRows.length" class="planner-office" aria-label="Office room coverage">
            <h4>Office room coverage</h4>
            <p>{{ officeRows.length }} office visits · {{ durationLabel(officeMinutes) }}
              <span v-if="officeWindow"> · {{ clockLabel(officeWindow.startTime) }}–{{ clockLabel(officeWindow.endTime) }}</span>
            </p>
            <p v-if="coveredOfficeRows">{{ coveredOfficeRows }} {{ coveredOfficeRows === 1 ? 'visit has' : 'visits have' }} an assigned room for the full appointment.</p>
            <button v-if="coveredOfficeRows < officeRows.length" type="button" :disabled="busy || !officeWindow || !!officeRequestId" @click="checkRooms">
              {{ checkingRooms ? 'Checking rooms…' : 'Find a room for the full block' }}
            </button>
            <p v-if="officeRequestId" class="room-note" role="status">Room request #{{ officeRequestId }} is awaiting approval. The room can be used once the request is approved. <button type="button" :disabled="dayLoading || busy" @click="loadDay">Refresh room coverage</button></p>
            <p v-if="roomError" class="error" role="alert">{{ roomError }}</p>
            <template v-if="officeOptions">
              <p v-if="officeOptions.rooms.length" class="room-note">Available for the full block. Room requests use whole-hour windows.</p>
              <p v-else-if="officeOptions.awaiting.length">An office request is already pending for this time.</p>
              <p v-else>No single requestable room covers the full block.</p>
              <div v-for="item in officeOptions.rooms" :key="item.officeId" class="office-option">
                <div>
                  <strong>{{ item.office }}</strong> · {{ item.room }}
                  <small>{{ clockLabel(hourClock(item.startHour)) }}–{{ clockLabel(hourClock(item.endHour)) }} · {{ item.timeZone.replaceAll('_', ' ') }}</small>
                </div>
                <button type="button" :disabled="busy || !!officeRequestId" @click="requestRoom(item)">Request and use this office</button>
              </div>
            </template>
          </section>

          <footer v-if="rows.length" class="planner-footer">
            <p v-if="error" class="error" role="alert">{{ error }}</p>
            <p v-if="summary" role="status">{{ summary.newAppointments }} new · {{ summary.existingAppointments }} already scheduled · {{ summary.blockedRows }} blocked<span v-if="summary.sameDayWarning"> · Same-day visits need review</span></p>
            <label v-if="summary?.sameDayWarning" class="check"><input v-model="acknowledge" type="checkbox" :disabled="busy" /> I reviewed the same-day visits.</label>
            <p v-if="token && uncoveredOfficeRows" class="warning">The room check found gaps. Any uncovered visits will be booked at the selected building. You can wait for approval and check again.</p>
            <div class="planner-actions">
              <button type="button" :disabled="busy" @click="review">{{ previewing ? 'Checking appointments…' : 'Check appointments' }}</button>
              <button v-if="token" type="button" class="primary" :disabled="busy || (summary?.sameDayWarning && !acknowledge)" @click="commit">
                {{ saving ? 'Booking…' : 'Book appointments' }}
              </button>
            </div>
          </footer>
          <p v-if="result" class="room-note" role="status">{{ result }}</p>
        </section>
      </div>
    </template>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import sharedApi from '../../services/api';
import { transitionRequestScope } from '../../utils/transitionRequestScope.js';
import { serviceLocationDisplay } from '../../utils/serviceLocationDisplay.js';

const props = defineProps({
  agencyId: { type: Number, required: true },
  providerId: { type: Number, required: true },
  providerLabel: { type: String, default: '' },
  initialDate: { type: String, default: '' }
});
const emit = defineEmits(['saved', 'busy']);
const api = transitionRequestScope(sharedApi, () => props.agencyId);
const base = '/auricwell-agenda-import/planner';
const durations = { '90832': 30, '90834': 45, '90837': 60 };
const options = ref(null), day = ref(null), date = ref(''), drafts = ref({}), search = ref('');
const selectedClient = ref(null), draggedClient = ref(null);
const loading = ref(false), dayLoading = ref(false), previewing = ref(false), saving = ref(false), checkingRooms = ref(false), requesting = ref(false);
const optionError = ref(''), dayError = ref(''), error = ref(''), roomError = ref(''), result = ref('');
const officeOptions = ref(null), requestedDays = ref({}), reviewRows = ref({}), summary = ref(null), token = ref(null), acknowledge = ref(false);
const busy = computed(() => loading.value || previewing.value || saving.value || checkingRooms.value || requesting.value);
watch(busy, value => emit('busy', value), { flush: 'sync' });
let sequence = 0, dayRequest = 0;
const requestScope = () => ({ agencyId: props.agencyId, providerId: props.providerId });
const message = failure => failure.response?.data?.error?.message || failure.message || 'The schedule could not be updated.';
const addDays = (ymd, count) => new Date(Date.parse(`${ymd}T12:00:00Z`) + count * 86400000).toISOString().slice(0, 10);
const weekday = ymd => new Date(`${ymd}T12:00:00Z`).getUTCDay();
const formatDate = (ymd, format) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString(undefined, { ...format, timeZone: 'UTC' });
const today = computed(() => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit',
  timeZone: options.value?.timeZone || 'America/Denver' }).format(new Date()));
const monday = computed(() => date.value ? addDays(date.value, -((weekday(date.value) + 6) % 7)) : '');
const week = computed(() => monday.value ? Array.from({ length: 7 }, (_, index) => addDays(monday.value, index)) : []);
const toMinutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
const hourClock = hour => `${String(hour).padStart(2, '0')}:00`;
const toClock = mins => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
const clockLabel = value => {
  const hour = Number(value.slice(0, 2));
  return `${hour % 12 || 12}:${value.slice(3, 5)} ${hour >= 12 && hour < 24 ? 'PM' : 'AM'}`;
};
const durationLabel = minutes => `${Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)}h ` : ''}${minutes % 60 || !minutes ? `${minutes % 60}m` : ''}`.trim();
const hours = Array.from({ length: 13 }, (_, index) => [0, 15, 30, 45].map(minute => toClock((index + 7) * 60 + minute)));
const rows = computed(() => drafts.value[date.value] || []);
const orderedRows = computed(() => [...rows.value].sort((a, b) => a.startTime.localeCompare(b.startTime)));
const clientFor = id => options.value?.clients.find(client => client.id === id);
const serviceFor = id => options.value?.services.find(service => service.id === id);
const locationFor = id => options.value?.locations.find(location => location.id === id);
const modality = location => location && (['02', '10'].includes(String(location.placeOfService)) ? 'TELEHEALTH' : 'IN_PERSON');
const locationsFor = clientId => options.value.locations.filter(location => !location.schoolId || clientFor(clientId).schools.some(school => school.id === location.schoolId));
const schoolSlotsFor = row => options.value.schoolSlots.filter(slot => slot.clientId === row.clientId
  && slot.weekday === weekdayName.value && slot.schoolId === locationFor(row.serviceLocationId)?.schoolId);
const servicesFor = row => {
  const setting = modality(locationFor(row.serviceLocationId));
  return options.value.services.filter(service => !setting || ['EITHER', setting].includes(service.modality));
};
const weekdayName = computed(() => date.value ? new Date(`${date.value}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }) : '');
function schoolIdsToday(client) {
  const slotSchools = options.value.schoolSlots.filter(slot => slot.weekday === weekdayName.value && slot.clientId === client.id).map(slot => slot.schoolId);
  return client.schools.filter(school => slotSchools.includes(school.id) || school.days.includes(weekdayName.value)).map(school => school.id);
}
const roster = computed(() => {
  const source = options.value?.clients.filter(client => client.label.toLowerCase().includes(search.value.trim().toLowerCase())) || [];
  const assigned = source.filter(client => schoolIdsToday(client).length);
  const office = source.filter(client => !client.schools.length || String(locationFor(client.defaultLocationId)?.placeOfService) === '11');
  const rest = source.filter(client => !assigned.includes(client) && !office.includes(client));
  return [
    { label: `${weekdayName.value} school roster`, clients: assigned },
    { label: 'Office clients', clients: office.filter(client => !assigned.includes(client)) },
    { label: 'Other clients', clients: rest }
  ].filter(group => group.clients.length);
});
const minutesFor = row => Math.max(0, toMinutes(row.endTime) - toMinutes(row.startTime)) || 0;
const totalMinutes = computed(() => rows.value.reduce((sum, row) => sum + minutesFor(row), 0));
const officeRows = computed(() => orderedRows.value.filter(row => String(locationFor(row.serviceLocationId)?.placeOfService) === '11'));
const officeMinutes = computed(() => officeRows.value.reduce((sum, row) => sum + minutesFor(row), 0));
const officeWindow = computed(() => officeRows.value.length && officeRows.value.every(row => minutesFor(row))
  ? { startTime: officeRows.value[0].startTime, endTime: officeRows.value.map(row => row.endTime).sort().at(-1) } : null);
const officeRequestKey = computed(() => officeWindow.value && `${date.value}:${officeWindow.value.startTime}:${officeWindow.value.endTime}`);
const officeRequestId = computed(() => requestedDays.value[officeRequestKey.value]);
const coveredOfficeRows = computed(() => officeRows.value.filter(row => roomsFor(row).length).length);
const uncoveredOfficeRows = computed(() => officeRows.value.filter(row => !roomsFor(row).length && reviewRows.value[row.rowId]?.status !== 'existing').length);

function timeTaken(time) {
  return [...(day.value?.busy || []), ...rows.value.map(row => ({ start: row.startTime, end: row.endTime }))]
    .some(range => range.start <= time && time < range.end);
}
function roomsFor(row) {
  const reviewed = reviewRows.value[row.rowId]?.officeRooms;
  if (Array.isArray(reviewed)) return [...new Set(reviewed.map(room => room.label))];
  return [...new Set((day.value?.reservations || []).filter(item => item.officeId === locationFor(row.serviceLocationId)?.officeId
    && item.start <= row.startTime && item.end >= row.endTime && row.endTime > row.startTime).map(item => item.room))];
}
function invalidate() {
  token.value = null; summary.value = null; reviewRows.value = {}; acknowledge.value = false;
  officeOptions.value = null; roomError.value = ''; result.value = ''; error.value = '';
}
function applyService(row) {
  const service = serviceFor(row.tenantServiceId);
  const duration = durations[service?.serviceCode] || Number(service?.defaultDurationMinutes);
  if (row.startTime && duration && toMinutes(row.startTime) + duration < 1440) row.endTime = toClock(toMinutes(row.startTime) + duration);
  else row.endTime = '';
  invalidate();
}
function changeLocation(row) {
  row.schoolSlotId = null;
  if (!servicesFor(row).some(service => service.id === row.tenantServiceId)) {
    row.tenantServiceId = null;
    row.endTime = '';
  }
  invalidate();
}
function initialLocation(client, time) {
  const locations = locationsFor(client.id);
  const schools = schoolIdsToday(client);
  const saved = locationFor(client.defaultLocationId);
  if (schools.length === 1) return (locations.find(location => location.schoolId === schools[0] && location.id === saved?.id)
    || locations.find(location => location.schoolId === schools[0]))?.id;
  if (schools.length > 1) return schools.includes(saved?.schoolId) ? saved.id : null;
  if (client.schools.length && saved?.schoolId) return saved.id;
  if (saved && !saved.schoolId && String(saved.placeOfService) !== '11') return saved.id;
  const offices = locations.filter(location => String(location.placeOfService) === '11');
  const assigned = [...new Set((day.value?.reservations || []).filter(item => item.start <= time && time < item.end).map(item => item.officeId))];
  return (offices.find(location => location.id === saved?.id && assigned.includes(location.officeId))
    || (assigned.length === 1 && offices.find(location => location.officeId === assigned[0]))
    || offices.find(location => location.id === saved?.id)
    || offices.find(location => location.officeId && location.officeId === client.defaultOfficeId)
    || (offices.length === 1 && offices[0]))?.id ?? null;
}
function addAt(time, id = selectedClient.value) {
  const client = clientFor(id);
  if (!client || !date.value || date.value < today.value || busy.value || dayLoading.value || timeTaken(time)) return;
  const row = { rowId: `visit-${++sequence}`, clientId: client.id, date: date.value,
    startTime: time, endTime: '', schoolSlotId: null, serviceLocationId: initialLocation(client, time) ?? null, tenantServiceId: null };
  const services = servicesFor(row);
  const defaults = services.filter(service => service.serviceCode === '90834');
  row.tenantServiceId = (defaults.length === 1 ? defaults[0].id : services.length === 1 ? services[0].id : null);
  applyService(row);
  drafts.value[date.value] = [...rows.value, row];
  selectedClient.value = null;
}
function remove(row) {
  drafts.value[date.value] = rows.value.filter(item => item !== row);
  invalidate();
}
function startDrag(event, id) {
  if (!event.dataTransfer) return;
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setData('text/plain', String(id));
  draggedClient.value = id;
}
function endDrag() { draggedClient.value = null; }
function dropAt(time) {
  if (draggedClient.value) addAt(time, draggedClient.value);
  endDrag();
}
function payload() {
  return { ...requestScope(), date: date.value, timeZone: options.value.timeZone, weekStart: monday.value,
    rows: rows.value.map(row => ({ ...row, modality: modality(locationFor(row.serviceLocationId)) })) };
}
async function loadDay() {
  const id = ++dayRequest;
  day.value = null; dayError.value = '';
  if (!options.value || !date.value) return;
  dayLoading.value = true;
  try {
    const response = await api.get(`${base}/day`, { params: { ...requestScope(), date: date.value }, skipGlobalLoading: true });
    if (id === dayRequest) day.value = response.data;
  } catch (failure) {
    if (id === dayRequest) dayError.value = message(failure);
  } finally { if (id === dayRequest) dayLoading.value = false; }
}
watch(date, () => { invalidate(); selectedClient.value = null; void loadDay(); }, { flush: 'sync' });
onBeforeUnmount(() => { dayRequest++; emit('busy', false); });
async function loadOptions() {
  loading.value = true;
  try {
    const response = await api.get(`${base}/options`, { params: requestScope(), skipGlobalLoading: true });
    options.value = response.data;
    date.value = /^\d{4}-\d{2}-\d{2}$/.test(props.initialDate) && props.initialDate >= today.value ? props.initialDate : today.value;
  } catch (failure) { optionError.value = message(failure); }
  finally { loading.value = false; }
}
void loadOptions();

async function review() {
  previewing.value = true;
  error.value = ''; token.value = null; acknowledge.value = false; reviewRows.value = {}; summary.value = null;
  try {
    const { data } = await api.post(`${base}/preview`, payload(), { timeout: 60000 });
    reviewRows.value = Object.fromEntries(data.rows.map(row => [row.rowId, row]));
    summary.value = data.summary;
    token.value = data.previewToken;
  } catch (failure) { error.value = message(failure); }
  finally { previewing.value = false; }
}
async function commit() {
  saving.value = true;
  error.value = '';
  try {
    const { data } = await api.post(`${base}/commit`, {
      ...payload(), previewToken: token.value, confirm: true, acknowledgeSameDayServices: acknowledge.value
    }, { timeout: 120000 });
    if (!data.complete) {
      error.value = [data.error, data.message].filter(Boolean).join(' ');
      return;
    }
    drafts.value[date.value] = [];
    invalidate();
    const appointmentRefs = (data.appointments || []).filter(item => !item.existing && item.id > 0).map(item => `#${item.id}`);
    result.value = `Booked ${data.createdCount} new ${data.createdCount === 1 ? 'appointment' : 'appointments'} · ${data.existingCount} already on the calendar.`;
    if (appointmentRefs.length) result.value += ` Appointment ${appointmentRefs.length === 1 ? 'number' : 'numbers'} ${appointmentRefs.join(', ')}.`;
    if (data.officeRoomsBooked || data.officeVisitsWithoutRoom) result.value += ` ${data.officeRoomsBooked} with a room · ${data.officeVisitsWithoutRoom} awaiting a room.`;
    void loadDay();
    emit('saved', data);
  } catch (failure) { error.value = message(failure); }
  finally { saving.value = false; token.value = null; }
}
async function checkRooms() {
  checkingRooms.value = true;
  roomError.value = ''; officeOptions.value = null;
  try {
    const { data } = await api.get(`${base}/office-options`, { params: {
      ...requestScope(), date: date.value, ...officeWindow.value
    }, timeout: 60000 });
    officeOptions.value = data;
  } catch (failure) { roomError.value = message(failure); }
  finally { checkingRooms.value = false; }
}
async function requestRoom(item) {
  requesting.value = true;
  roomError.value = '';
  try {
    const { data } = await api.post('/availability/office-requests', {
      ...requestScope(), preferredOfficeIds: [item.officeId], preferredRoomIds: [item.roomId], requirePreferredRoom: true,
      requestedFrequency: 'ONCE', requestedStartDate: item.date,
      slots: [{ weekday: item.weekday, startHour: item.startHour, endHour: item.endHour, roomId: item.roomId }]
    });
    requestedDays.value[officeRequestKey.value] = data.id || data.request?.id;
    // Keep a clinician's explicit billing location when it already points at this building.
    for (const row of officeRows.value) {
      if (locationFor(row.serviceLocationId)?.officeId === item.officeId) continue;
      const choices = locationsFor(row.clientId).filter(location => location.officeId === item.officeId && String(location.placeOfService) === '11');
      row.serviceLocationId = choices.length === 1 ? choices[0].id : null;
    }
    invalidate();
  } catch (failure) { roomError.value = message(failure); }
  finally { requesting.value = false; }
}
</script>

<style scoped>
.day-planner {
  --planner-ink: var(--text-primary, #142d4e);
  --planner-muted: var(--text-secondary, #52667c);
  --planner-line: var(--border, #d6e1ed);
  --planner-accent: var(--settings-action, #214e7b);
  --planner-card: var(--bg-card, #fff);
  --planner-wash: var(--bg-alt, #f3f7fb);
  color: var(--planner-ink);
  background: var(--planner-card);
  border: 1px solid var(--planner-line);
  border-radius: 16px;
  padding: clamp(14px, 2vw, 26px);
  margin: 12px 0 20px;
}
.planner-header, .roster-heading, .office-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
h2, h3, h4, p { margin: 0; }
.planner-header p, .planner-roster p, .planner-panel > p, .planner-office p, .room-note { margin-top: 6px; color: var(--planner-muted); }
.planner-header h2 { font-size: clamp(1.3rem, 2vw, 1.8rem); }
.planner-days, .client-buttons, .planner-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.planner-days { margin: 16px 0; }
.planner-days button { min-width: 106px; font-size: .85rem; }
.planner-days strong { display: block; }
.draft-count { margin-left: 5px; padding: 1px 5px; border: 1px solid currentColor; border-radius: 12px; font-size: .7rem; }
button, input, select { font: inherit; color: inherit; }
button, input:not([type=checkbox]), select {
  background: var(--planner-card);
  border: 1px solid var(--planner-line);
  border-radius: 8px;
  padding: 7px 11px;
}
button { cursor: pointer; }
button:disabled { cursor: default; opacity: .58; }
button:not(:disabled):hover { border-color: var(--planner-accent); }
[aria-current=date], [aria-pressed=true], button.primary { color: white; background: var(--planner-accent); border-color: var(--planner-accent); }
.planner-roster, .planner-panel { padding: 14px; border: 1px solid var(--planner-line); border-radius: 12px; }
.planner-roster { background: var(--planner-wash); }
.client-group h4 { margin: 10px 0 5px; font-size: .82rem; }
.client-buttons { max-height: 140px; overflow: auto; padding: 2px; }
.client-buttons button { font-size: .85rem; cursor: grab; }
.planner-columns { display: grid; grid-template-columns: minmax(245px, 1fr) minmax(0, 1.8fr); gap: 14px; margin-top: 14px; align-items: start; }
.planner-times { margin-top: 12px; }
.planner-hour { display: grid; grid-template-columns: 6.3ch repeat(4, minmax(0, 1fr)); gap: 4px; margin-bottom: 4px; align-items: center; }
.planner-hour span { font-size: .78rem; color: var(--planner-muted); }
.planner-hour button { font-size: .8rem; padding: 5px 1px; }
.planner-hour .occupied { background: var(--planner-wash); text-decoration: line-through; }
.planner-hour .drop-ready { border-color: var(--planner-accent); }
.draft-row, .planner-office, .planner-footer { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--planner-line); }
.draft-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 6px; }
label { display: grid; gap: 4px; font-size: .82rem; font-weight: 600; }
label select, label input:not([type=checkbox]) { width: 100%; box-sizing: border-box; }
button.quiet { font-size: .8rem; padding: 4px 8px; }
.planner-actions, .office-option, .planner-office button, .check { margin-top: 8px; }
.office-option small { display: block; color: var(--planner-muted); }
.check { display: flex; align-items: center; }
.error { color: var(--danger, #b42318) !important; }
.warning { color: var(--warning-text, #8c4b07); }
.planner-footer p + p { margin-top: 6px; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
@media (max-width: 740px) {
  .planner-columns { grid-template-columns: 1fr; }
  .planner-panel { padding: 10px; }
}
</style>
