<template>
  <section class="office-board" :class="{ compact }" aria-labelledby="offices-heading" :aria-busy="loading">
    <div class="board-heading"><div><span class="eyebrow">FIND YOUR WAY</span><h2 id="offices-heading">Our offices</h2></div><div class="legend"><span><i class="green" /> Available</span><span><i class="red" /> Occupied / booked</span></div></div>
    <div class="browse-controls">
      <button aria-label="Previous day" @click="moveDay(-1)">←</button>
      <label>Date<input aria-label="Office date" type="date" :value="date" @change="selectDate($event.target.value)" /></label>
      <button aria-label="Next day" @click="moveDay(1)">→</button>
      <label>Start time<input aria-label="Office time" type="time" :value="time" @change="selectTime($event.target.value)" /></label>
      <div class="minute-shortcuts" aria-label="Start minute shortcuts"><button v-for="minute in ['00','15','30','45']" :key="minute" :aria-label="`Start minute ${minute}`" @click="selectTime(`${time.slice(0,2)}:${minute}`)">:{{ minute }}</button></div>
      <label>End time (optional)<input aria-label="Office end time" type="time" :value="endTime" @change="selectEndTime($event.target.value)" /></label>
      <div v-if="endTime" class="minute-shortcuts" aria-label="End minute shortcuts"><button v-for="minute in ['00','15','30','45']" :key="minute" @click="selectEndTime(`${endTime.slice(0,2)}:${minute}`)">:{{ minute }}</button><button @click="selectEndTime('')">Single time</button></div>
      <button v-if="selectedId" @click="selectedId = null">Clear room selection</button>
      <button class="now-button" :class="{ active: live }" @click="showNow">Now</button>
      <span class="view-label">{{ live ? 'Live schedule' : 'Viewing selected time' }} · {{ timezone }}</span>
    </div>
    <p v-if="error" class="board-error" role="alert">{{ error }} <button @click="load">Try again</button></p>
    <div v-if="loading" class="loading" role="status">Loading offices…</div>
    <div v-else-if="!error && !rooms.length" class="loading">No rooms are listed for this building yet.</div>
    <div v-else-if="!error" class="room-grid">
      <button v-for="room in rooms" :key="room.id" class="room-card" :class="{ occupied: room.occupied, selected: selectedId === room.id }" :aria-expanded="selectedId === room.id" aria-controls="room-details" @click="selectRoom(room.id)">
        <span class="room-top"><span class="room-number">{{ room.roomNumber != null ? `Office ${room.roomNumber}` : room.name }}</span><span class="room-status">{{ room.occupied ? (endTime ? 'Overlap / booked' : 'Occupied') : 'Available' }}</span></span>
        <span class="room-name">{{ room.name }}</span>
        <template v-for="(entry, index) in room.current" :key="index">
          <span v-if="entry.booked" class="current-person"><small>BOOKED WITH</small><KioskPerson v-if="entry.bookedProvider" :person="entry.bookedProvider" /><span v-else>Provider booking</span></span>
          <span v-if="entry.held" class="assignment-label">Office hold</span>
          <span v-if="entry.assignedProvider" class="assignment-label">Assigned to {{ entry.assignedProvider.name }}</span>
          <KioskPerson v-if="!entry.booked && entry.assignedProvider" :person="entry.assignedProvider" />
        </template>
        <span v-if="!room.current.length" class="open-label">{{ endTime ? 'Available for the full time range' : 'No booking at this time' }}</span>
        <span class="view-day">{{ selectedId === room.id ? 'Close details −' : 'View the day ↗' }}</span>
      </button>
    </div>
    <section v-if="selectedRoom && !loading && !error" id="room-details" class="room-details" aria-labelledby="room-detail-title">
      <header><div><span class="eyebrow">{{ formattedDate }}</span><h3 id="room-detail-title">{{ selectedRoom.roomNumber != null ? `Office ${selectedRoom.roomNumber}` : selectedRoom.name }} · Day schedule</h3></div><button aria-label="Close office details" @click="selectedId = null">×</button></header>
      <div class="reservation">
        <p v-if="!selectedRoom.occupied">Reserve this office for yourself today. Select a start and end time; no approval is needed for same-day reservations.</p>
        <button v-if="allowBooking && !selectedRoom.occupied" :disabled="booking || !endTime" @click="bookRoom">{{ booking ? 'Reserving…' : 'Book this time for me' }}</button>
        <a v-else-if="!selectedRoom.occupied" :href="bookingLink">Staff · Book this office</a>
        <p v-if="bookingMessage" role="status">{{ bookingMessage }}</p>
      </div>
      <div class="day-navigation"><button @click="moveDay(-1)">← Previous day</button><button @click="moveDay(1)">Next day →</button></div>
      <div v-if="!selectedRoom.assignments.length" class="no-schedule">Available all day. No assignments or bookings are listed.</div>
      <div v-for="(entry, index) in selectedRoom.assignments" :key="index" class="day-entry" :class="{ booked: entry.booked || entry.held, current: entry.status === 'current' }">
        <div class="entry-time"><strong>{{ formatKioskTime(entry.startAt) }} – {{ formatKioskTime(entry.endAt) }}</strong><span v-if="entry.status === 'current'">At selected time</span></div>
        <div class="entry-people"><div v-if="entry.assignedProvider"><small>ASSIGNED TO</small><KioskPerson :person="entry.assignedProvider" /></div><div v-if="entry.booked"><small>BOOKED WITH</small><KioskPerson v-if="entry.bookedProvider" :person="entry.bookedProvider" /><span v-else>Provider booking</span></div><span v-if="entry.held">Office hold</span></div>
        <span class="entry-state">{{ entry.booked ? 'Booked' : entry.held ? 'Held' : 'Assigned · available' }}</span>
      </div>
    </section>
    <p class="board-note">Colors reflect bookings or holds anywhere in the selected time range. An assignment identifies who holds that office time; it is separate from a booking. Please wait in the lobby for your provider.</p>
  </section>
</template>
<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import api from '../../services/api';
import { formatKioskTime } from '../../utils/kioskTime';
import KioskPerson from './KioskPerson.vue';
const props = defineProps({ locationId: { type: [Number, String], required: true }, compact: { type: Boolean, default: false }, allowBooking: {type:Boolean,default:false}, initialSelection: {type:Object,default:()=>({})} });
const rooms = ref([]), timezone = ref('America/Denver'), date = ref(''), time = ref(''), endTime = ref('');
const selectedId = ref(Number(props.initialSelection.roomId) || null), live = ref(!props.initialSelection.date), loading = ref(true), error = ref('');
date.value = props.initialSelection.date || ''; time.value = props.initialSelection.time || ''; endTime.value = props.initialSelection.endTime || '';
const booking = ref(false), bookingMessage = ref('');
const bookingLink = computed(() => `/office-booking/${props.locationId}?${new URLSearchParams({date:date.value,time:time.value,endTime:endTime.value,roomId:String(selectedId.value)})}`);
async function bookRoom() {
  if (booking.value || !selectedId.value || !endTime.value) return;
  booking.value = true; bookingMessage.value = '';
  try {
    const {data} = await api.post(`/office-schedule/locations/${props.locationId}/same-day-booking`,{roomId:selectedId.value,date:date.value,time:time.value,endTime:endTime.value});
    if (!data?.ok || data.kind !== 'auto_booked') throw new Error('Unconfirmed reservation');
    bookingMessage.value = 'Booked. This office is reserved for you for the selected time.'; await load();
  } catch(e) { bookingMessage.value = e.response?.data?.error?.message || 'The reservation could not be confirmed. Please refresh and try again.'; }
  finally { booking.value = false; }
}
const selectedRoom = computed(() => rooms.value.find(room => room.id === selectedId.value));
const formattedDate = computed(() => date.value ? new Date(`${date.value}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '');
let generation = 0, timer;
async function load({ background = false } = {}) {
  const request = ++generation;
  if (!background) loading.value = true; error.value = '';
  try {
    const { data } = await api.get(`/kiosk/${props.locationId}/office-directory`, { params: live.value ? {} : { date: date.value, time: time.value, ...(endTime.value ? { endTime: endTime.value } : {}) } });
    if (request !== generation) return;
    if ((endTime.value && data.endTime !== endTime.value) || !data.date || !data.time || !Array.isArray(data.rooms) || data.rooms.some(room => typeof room.occupied !== 'boolean' || !Array.isArray(room.current) || !Array.isArray(room.assignments))) throw new Error('Incomplete availability response');
    rooms.value = data.rooms || []; timezone.value = data.timezone; date.value = data.date; time.value = data.time;
    loading.value = false;
    if (selectedId.value && !background) { await nextTick(); if (request === generation) revealDetails(); }
  } catch { if (request === generation) { rooms.value = []; error.value = 'Office availability couldn’t load. Please retry or ask the office team.'; } }
  finally { if (request === generation) loading.value = false; }
}
function revealDetails() { document.getElementById('room-details')?.scrollIntoView?.({ block: 'start' }); }
async function selectRoom(id) { selectedId.value = selectedId.value === id ? null : id; if (selectedId.value) { await nextTick(); revealDetails(); } }
function selectDate(value) { if (!value) return; date.value = value; live.value = false; load(); }
function selectEndTime(value) { endTime.value = value; live.value = false; load(); }
function selectTime(value) { if (!value) return; time.value = value; live.value = false; load(); }
function moveDay(amount) { if (!date.value) return; const day = new Date(`${date.value}T12:00:00Z`); day.setUTCDate(day.getUTCDate() + amount); selectDate(day.toISOString().slice(0, 10)); }
function showNow() { endTime.value = ''; live.value = true; load(); }
watch(() => props.locationId, () => { selectedId.value = null; rooms.value = []; showNow(); });
onMounted(() => { load(); timer = setInterval(() => load({ background: true }), 60_000); });
onUnmounted(() => { generation++; clearInterval(timer); });
</script>
<style scoped>
.reservation{margin:12px 0;padding:16px;background:#edf3e8;border-radius:12px;font-size:13px}.reservation button,.reservation a{display:inline-block;padding:14px;border:0;border-radius:10px;background:#24443d;color:white;text-decoration:none}.reservation button:disabled{opacity:.5}
.minute-shortcuts{display:flex;gap:4px;flex-wrap:wrap}.minute-shortcuts button{padding:8px;min-width:44px}
.office-board{margin:26px 0 36px}.board-heading,.room-details header{display:flex;justify-content:space-between;align-items:center;gap:15px}.eyebrow{font-size:10px;letter-spacing:1.8px;color:#677961;font-weight:700}h2{font-weight:500;font-size:28px;margin:7px 0 18px}.legend{display:flex;gap:15px;font-size:11px}.legend span{display:flex;align-items:center;gap:6px}.legend i{width:9px;height:9px;border-radius:50%}.green{background:#4d8969}.red{background:#bc655f}.browse-controls{display:flex;align-items:end;gap:10px;flex-wrap:wrap;margin-bottom:18px}.browse-controls label{display:grid;gap:5px;font-size:10px;color:#596b60}.browse-controls input,button{font:inherit;color:inherit}.browse-controls input{background:#fffef9;border:1px solid #ced8cb;border-radius:9px;padding:10px;min-height:44px;font-size:13px;max-width:170px}button{cursor:pointer}.browse-controls button,.day-navigation button,.room-details header button,.board-error button{border:1px solid #ccd7c8;background:#fffdf6;border-radius:9px;min-height:44px;padding:10px 15px}.now-button.active{background:#24443d;color:white}.view-label{font-size:10px;margin:auto 0 12px auto;color:#63746b}.room-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.room-card{text-align:left;border:1px solid #b9d7c2;background:#e8f2e7;border-radius:17px;padding:17px;display:flex;flex-direction:column;gap:10px;min-height:155px;min-width:0;box-shadow:0 2px 3px #294e3705}.room-card.occupied{background:#f7e7e2;border-color:#e1b9b0}.room-card.selected{outline:2px solid #24443d;outline-offset:2px}.room-top{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}.room-number{font-size:18px;font-weight:650;letter-spacing:-.5px}.room-status{font-size:10px;background:#fff9;padding:5px 7px;border-radius:6px;color:#326044}.occupied .room-status{color:#8f3d36}.room-name{font-size:10px;color:#617064}.current-person{display:grid;gap:7px}.current-person small,.entry-people small{display:block;font-size:8px;letter-spacing:1px;margin-bottom:5px}.assignment-label,.open-label{font-size:11px;line-height:1.4;color:#526557}.occupied .assignment-label{color:#765950}.view-day{margin-top:auto;padding-top:4px;font-size:10px;font-weight:600}.room-details{border:1px solid #d2dacb;background:#fffef9;border-radius:20px;margin-top:22px;padding:24px}.room-details h3{font-size:23px;font-weight:500;margin:8px 0 15px}.day-navigation{display:flex;gap:10px;margin:8px 0 20px}.day-navigation button{font-size:12px}.day-entry{display:grid;grid-template-columns:170px 1fr auto;align-items:center;gap:18px;background:#eef5ec;border-left:3px solid #7aa180;padding:17px;border-radius:8px;margin:8px 0}.day-entry.booked{background:#f9ede8;border-left-color:#bd7770}.day-entry.current{outline:2px solid #78856c}.entry-time{display:grid;gap:6px;font-size:12px}.entry-time span{font-size:10px;color:#60705e}.entry-people{display:flex;gap:28px;flex-wrap:wrap}.entry-state{font-size:10px}.board-note{font-size:11px;line-height:1.7;color:#637367;margin:15px 0 0;max-width:850px}.board-error{background:#fff2dd;padding:22px;border-radius:14px;color:#835729}.loading,.no-schedule{padding:25px;color:#63746b;font-size:13px}button:focus-visible,input:focus-visible{outline:3px solid #ad8038;outline-offset:3px}@media(min-width:1400px){.room-grid{grid-template-columns:repeat(5,minmax(0,1fr))}}@media(max-width:1000px){.room-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.day-entry{grid-template-columns:140px 1fr}.entry-state{grid-column:2}}@media(max-width:650px){.room-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.board-heading{align-items:start;flex-direction:column;gap:0}.legend{margin:0 0 18px}.view-label{width:100%;margin:0}.room-card{padding:13px}.room-number{font-size:17px}.browse-controls{gap:7px}.browse-controls input{max-width:150px}.room-details{padding:16px}.day-entry{grid-template-columns:1fr}.entry-state{grid-column:auto}.entry-people{gap:16px}}

.compact .room-grid{grid-template-columns:repeat(7,minmax(0,1fr));gap:9px}.compact .room-card{min-height:106px;padding:12px;gap:7px}.compact .room-number{font-size:15px}.compact .room-status{font-size:9px;padding:4px}.compact .room-name,.compact .current-person>small,.compact .view-day{display:none}.compact .open-label,.compact .assignment-label{font-size:10px}.compact .room-card :deep(.agency){display:none}.compact .room-card :deep(.photo),.compact .room-card :deep(.initials){width:25px;height:25px;flex-basis:25px;border-radius:7px;font-size:10px}.compact .room-card :deep(.identity strong){font-size:11px}.compact .room-card :deep(.kiosk-person){gap:6px}.compact .board-note{max-width:none}.compact .board-heading h2{font-size:23px}@media(max-width:1100px){.compact .room-grid{grid-template-columns:repeat(5,minmax(0,1fr))}}@media(max-width:650px){.compact .room-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.compact .room-card{padding:10px;min-height:90px}.compact .room-card :deep(.photo),.compact .room-card :deep(.initials){display:none}.compact .room-top{gap:5px}.compact .room-number{font-size:14px}}
</style>
