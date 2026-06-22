<template>
  <div class="koa-overlay" @click.self="$emit('close')">
    <div class="koa-panel" role="dialog" aria-modal="true" aria-label="Office Availability">

      <!-- Header -->
      <div class="koa-header">
        <div class="koa-header__title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          Office Availability
        </div>
        <button class="koa-header__close" aria-label="Close" @click="$emit('close')">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <!-- Room list -->
      <div v-if="step === 'list'" class="koa-body">
        <p class="koa-body__subtitle">
          Offices with availability remaining today. Select one to reserve it.
        </p>

        <div v-if="loading" class="koa-loading">
          <div class="koa-spinner" />
          <span>Checking availability…</span>
        </div>
        <div v-else-if="rooms.length === 0" class="koa-empty">
          No offices have availability remaining today. Please see the front desk.
        </div>
        <div v-else class="koa-rooms-grid">
          <button
            v-for="room in rooms"
            :key="room.id"
            class="koa-room-card"
            :class="{ 'koa-room-card--now': room.availableNow }"
            @click="selectRoom(room)"
          >
            <div class="koa-room-card__icon" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3" ry="3"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
            </div>
            <div class="koa-room-card__name">{{ room.name }}</div>
            <div v-if="room.roomNumber" class="koa-room-card__number">Office {{ room.roomNumber }}</div>
            <div class="koa-room-card__avail" :class="room.availableNow ? 'koa-room-card__avail--now' : 'koa-room-card__avail--later'">
              {{ room.availableNow ? 'Available Now' : `Available ${formatTime(room.windowStart)}` }}
            </div>
            <div class="koa-room-card__hours">Up to {{ room.maxHours }}h available</div>
          </button>
        </div>

        <button class="koa-btn koa-btn--secondary" style="margin-top: 20px;" @click="$emit('close')">Close</button>
      </div>

      <!-- Duration picker -->
      <div v-else-if="step === 'duration'" class="koa-body">
        <button class="koa-back-btn" @click="step = 'list'">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          Back to rooms
        </button>

        <div class="koa-room-selected">
          <div class="koa-room-selected__icon" aria-hidden="true">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#3a6b7a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3" ry="3"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
          </div>
          <div>
            <div class="koa-room-selected__name">{{ selectedRoom.name }}</div>
            <div v-if="selectedRoom.roomNumber" class="koa-room-selected__number">Office {{ selectedRoom.roomNumber }}</div>
          </div>
        </div>

        <p class="koa-body__subtitle">
          {{ selectedRoom.availableNow ? 'This office is available now.' : `This office becomes available at ${formatTime(selectedRoom.windowStart)}.` }}
          How many hours do you need?
        </p>

        <div class="koa-duration-picker">
          <button
            class="koa-dur-btn"
            :disabled="selectedHours <= 1"
            @click="selectedHours = Math.max(1, selectedHours - 1)"
          >−</button>
          <div class="koa-dur-display">
            <span class="koa-dur-num">{{ selectedHours }}</span>
            <span class="koa-dur-label">{{ selectedHours === 1 ? 'hour' : 'hours' }}</span>
          </div>
          <button
            class="koa-dur-btn"
            :disabled="selectedHours >= selectedRoom.maxHours"
            @click="selectedHours = Math.min(selectedRoom.maxHours, selectedHours + 1)"
          >+</button>
        </div>

        <p class="koa-time-range">
          {{ formatTime(selectedRoom.windowStart) }} – {{ formatEndTime(selectedRoom.windowStart, selectedHours) }}
        </p>

        <button class="koa-btn koa-btn--primary" style="width:100%;margin-top:16px;" @click="step = 'pin'">
          Continue
        </button>
      </div>

      <!-- PIN entry -->
      <div v-else-if="step === 'pin'" class="koa-body">
        <button class="koa-back-btn" @click="step = 'duration'">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          Back
        </button>

        <div class="koa-room-selected">
          <div class="koa-room-selected__icon" aria-hidden="true">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#3a6b7a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3" ry="3"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
          </div>
          <div>
            <div class="koa-room-selected__name">{{ selectedRoom.name }}</div>
            <div class="koa-room-selected__number">
              {{ formatTime(selectedRoom.windowStart) }} – {{ formatEndTime(selectedRoom.windowStart, selectedHours) }}
              &nbsp;·&nbsp; {{ selectedHours }}h
            </div>
          </div>
        </div>

        <p class="koa-body__subtitle" style="margin-bottom:20px;">
          Enter your 4-digit kiosk PIN to confirm this reservation.
        </p>

        <div class="koa-pin-display" aria-label="PIN entered" aria-live="polite">
          <span v-for="i in 4" :key="i" class="koa-pin-dot" :class="{ 'koa-pin-dot--filled': pin.length >= i }" />
        </div>

        <div class="koa-pin-pad">
          <button
            v-for="key in pinKeys"
            :key="key"
            class="koa-pin-key"
            :class="{ 'koa-pin-key--action': key === '⌫' || key === 'Clear' }"
            :disabled="reserving || (key !== '⌫' && key !== 'Clear' && pin.length >= 4)"
            @click="onPinKey(key)"
          >{{ key }}</button>
        </div>

        <div v-if="pinError" class="koa-error">{{ pinError }}</div>

        <button
          class="koa-btn koa-btn--primary"
          style="width:100%;margin-top:16px;"
          :disabled="pin.length < 4 || reserving"
          @click="submitReservation"
        >
          <span v-if="reserving">Reserving…</span>
          <span v-else>Reserve Office</span>
        </button>
      </div>

      <!-- Success -->
      <div v-else class="koa-body koa-body--center">
        <div class="koa-done-icon" aria-hidden="true">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#2e7055" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        </div>
        <h2 class="koa-body__title">Office Reserved!</h2>
        <p class="koa-body__subtitle">
          <strong>{{ reserved.provider.firstName }} {{ reserved.provider.lastName }}</strong>
          has been booked in <strong>{{ reserved.roomName }}</strong><br>
          {{ formatTime(reserved.startAt) }} – {{ formatTime(reserved.endAt) }}
          ({{ reserved.hours }}h)
        </p>
        <button class="koa-btn koa-btn--primary" style="margin-top:24px;" @click="$emit('close')">Done</button>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '../../services/api';

const props = defineProps({
  locationId: { type: [String, Number], required: true },
  timezone:   { type: String, default: 'America/Denver' }
});
defineEmits(['close']);

const step         = ref('list');
const rooms        = ref([]);
const loading      = ref(true);
const selectedRoom = ref(null);
const selectedHours = ref(1);
const pin          = ref('');
const reserving    = ref(false);
const pinError     = ref('');
const reserved     = ref(null);

const pinKeys = ['1','2','3','4','5','6','7','8','9','Clear','0','⌫'];

function formatTime(naiveStr) {
  if (!naiveStr) return '';
  const d = new Date(naiveStr.replace(' ', 'T') + 'Z');
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: props.timezone });
}

function formatEndTime(startStr, hours) {
  if (!startStr) return '';
  const startMs = new Date(startStr.replace(' ', 'T') + 'Z').getTime();
  const endMs   = startMs + hours * 3600_000;
  const d = new Date(endMs);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: props.timezone });
}

async function loadRooms() {
  loading.value = true;
  try {
    const res = await api.get(`/kiosk/${props.locationId}/available-rooms`);
    rooms.value = res.data?.rooms || [];
  } catch {
    rooms.value = [];
  } finally {
    loading.value = false;
  }
}

function selectRoom(room) {
  selectedRoom.value = room;
  selectedHours.value = Math.min(1, room.maxHours);
  pin.value = '';
  pinError.value = '';
  step.value = 'duration';
}

function onPinKey(key) {
  if (key === '⌫') { pin.value = pin.value.slice(0, -1); }
  else if (key === 'Clear') { pin.value = ''; }
  else if (pin.value.length < 4) { pin.value += key; }
  pinError.value = '';
}

async function submitReservation() {
  if (pin.value.length < 4) return;
  reserving.value = true;
  pinError.value = '';
  try {
    const res = await api.post(`/kiosk/${props.locationId}/reserve-by-pin`, {
      roomId:      selectedRoom.value.id,
      pin:         pin.value,
      windowStart: selectedRoom.value.windowStart,
      hours:       selectedHours.value
    });
    reserved.value = res.data?.event;
    step.value = 'done';
  } catch (e) {
    if (e?.response?.status === 401) {
      pinError.value = 'Invalid PIN. Please try again.';
    } else if (e?.response?.status === 409) {
      pinError.value = 'That room is no longer available. Please go back and choose another.';
    } else {
      pinError.value = e?.response?.data?.error?.message || 'Reservation failed. Please see the front desk.';
    }
    pin.value = '';
  } finally {
    reserving.value = false;
  }
}

onMounted(loadRooms);
</script>

<style scoped>
.koa-overlay {
  position: fixed; inset: 0;
  background: rgba(20, 40, 55, 0.6);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000; padding: 20px;
}
.koa-panel {
  background: #fff; border-radius: 20px;
  width: 100%; max-width: 580px; max-height: 90dvh;
  overflow-y: auto; box-shadow: 0 24px 60px rgba(0,0,0,0.25);
}

/* Header */
.koa-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 24px 18px; border-bottom: 1px solid #eaeff3;
}
.koa-header__title {
  display: flex; align-items: center; gap: 10px;
  font-size: 18px; font-weight: 800; color: #1a2f3a;
}
.koa-header__close {
  background: none; border: none; cursor: pointer;
  color: #8aa3b0; padding: 4px; border-radius: 8px; line-height: 1;
  transition: color 0.1s, background 0.1s;
}
.koa-header__close:hover { color: #1a2f3a; background: #f0f4f6; }

/* Body */
.koa-body { padding: 24px; }
.koa-body--center { display: flex; flex-direction: column; align-items: center; text-align: center; }
.koa-body__title { font-size: 22px; font-weight: 800; color: #1a2f3a; margin: 0 0 8px; }
.koa-body__subtitle { font-size: 14px; color: #4a6070; margin: 0 0 8px; line-height: 1.5; }

/* Rooms grid */
.koa-rooms-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
}
.koa-room-card {
  display: flex; flex-direction: column; align-items: center; gap: 5px;
  padding: 18px 12px 14px; border: 2px solid #e2ecf0; border-radius: 14px;
  background: #fff; cursor: pointer; text-align: center;
  transition: border-color 0.12s, box-shadow 0.12s, transform 0.1s;
}
.koa-room-card:hover {
  border-color: #3a6b7a;
  box-shadow: 0 4px 16px rgba(58,107,122,0.12);
  transform: translateY(-2px);
}
.koa-room-card--now { border-color: #3a6b7a; background: #f3f9f7; }
.koa-room-card__icon { color: #3a6b7a; }
.koa-room-card__name { font-size: 14px; font-weight: 700; color: #1a2f3a; line-height: 1.3; }
.koa-room-card__number { font-size: 12px; color: #6b8494; }
.koa-room-card__avail {
  font-size: 11px; border-radius: 8px; padding: 2px 10px; font-weight: 600;
}
.koa-room-card__avail--now  { background: #eef6f3; color: #2e7055; }
.koa-room-card__avail--later { background: #fdf3e5; color: #a0640a; }
.koa-room-card__hours { font-size: 11px; color: #8aa3b0; }

/* Duration picker */
.koa-duration-picker {
  display: flex; align-items: center; justify-content: center; gap: 20px;
  margin: 20px 0 8px;
}
.koa-dur-btn {
  width: 52px; height: 52px; border-radius: 50%;
  border: 2px solid #c8dde4; background: #fff;
  font-size: 26px; font-weight: 700; color: #1e3a4a; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.1s, border-color 0.1s;
  line-height: 1;
}
.koa-dur-btn:hover:not(:disabled) { background: #eef6f8; border-color: #3a6b7a; }
.koa-dur-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.koa-dur-display { text-align: center; min-width: 70px; }
.koa-dur-num { font-size: 48px; font-weight: 900; color: #1e3a4a; display: block; line-height: 1; }
.koa-dur-label { font-size: 14px; color: #6b8494; font-weight: 600; }
.koa-time-range {
  text-align: center; font-size: 16px; font-weight: 700; color: #3a6b7a;
  margin: 4px 0 0; letter-spacing: 0.3px;
}

/* Back button */
.koa-back-btn {
  display: flex; align-items: center; gap: 6px; background: none; border: none;
  cursor: pointer; font-size: 14px; color: #3a6b7a; font-weight: 600;
  margin-bottom: 18px; padding: 0;
}
.koa-back-btn:hover { color: #1e3a4a; }

/* Room selected */
.koa-room-selected {
  display: flex; align-items: center; gap: 14px;
  background: #f3f8fa; border: 1.5px solid #c8dde4;
  border-radius: 12px; padding: 14px 16px; margin-bottom: 20px;
}
.koa-room-selected__name { font-size: 17px; font-weight: 700; color: #1a2f3a; }
.koa-room-selected__number { font-size: 13px; color: #6b8494; }

/* PIN pad */
.koa-pin-display { display: flex; justify-content: center; gap: 16px; margin-bottom: 24px; }
.koa-pin-dot {
  width: 18px; height: 18px; border-radius: 50%;
  border: 2px solid #c8dde4; background: transparent;
  transition: background 0.15s, border-color 0.15s;
}
.koa-pin-dot--filled { background: #1e3a4a; border-color: #1e3a4a; }
.koa-pin-pad {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;
  max-width: 280px; margin: 0 auto 8px;
}
.koa-pin-key {
  padding: 18px 10px; border: 1.5px solid #e2ecf0; border-radius: 12px;
  background: #fff; font-size: 22px; font-weight: 700; color: #1a2f3a;
  cursor: pointer; transition: background 0.1s, border-color 0.1s; line-height: 1;
}
.koa-pin-key:hover:not(:disabled) { background: #f0f7fa; border-color: #3a6b7a; }
.koa-pin-key:disabled { opacity: 0.35; cursor: not-allowed; }
.koa-pin-key--action { font-size: 18px; color: #3a6b7a; }

/* Buttons */
.koa-btn {
  padding: 12px 28px; border-radius: 10px; font-size: 15px; font-weight: 700;
  cursor: pointer; border: none; transition: opacity 0.12s, background 0.12s;
}
.koa-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.koa-btn--primary { background: #1e3a4a; color: #fff; }
.koa-btn--primary:hover:not(:disabled) { background: #2d5265; }
.koa-btn--secondary { background: #e8edf2; color: #2a4a5a; }
.koa-btn--secondary:hover:not(:disabled) { background: #dae3ea; }

/* Misc */
.koa-loading, .koa-empty {
  padding: 32px 0; text-align: center; color: #7a9aaa;
  display: flex; flex-direction: column; align-items: center; gap: 10px;
}
.koa-spinner {
  width: 32px; height: 32px; border: 3px solid #dde6eb;
  border-top-color: #3a6b7a; border-radius: 50%;
  animation: koa-spin 0.7s linear infinite;
}
@keyframes koa-spin { to { transform: rotate(360deg); } }
.koa-error {
  margin-top: 10px; color: #c0392b; font-size: 14px;
  background: #fdf0ee; border-radius: 8px; padding: 10px 14px; text-align: center;
}
.koa-done-icon { margin-bottom: 16px; }
</style>
