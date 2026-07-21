<template>
  <div class="sek-page">
    <header class="sek-header">
      <div>
        <p class="eyebrow">School events</p>
        <h1>Staff kiosk</h1>
        <p class="sub">One station for all school events — pick your event, then clock in.</p>
      </div>
      <button v-if="token" type="button" class="btn-ghost" @click="lockStation">Lock</button>
    </header>

    <div v-if="error" class="banner error">{{ error }}</div>
    <div v-if="notice" class="banner ok">{{ notice }}</div>

    <!-- Unlock -->
    <section v-if="!token" class="card unlock-card">
      <label class="lbl">Agency station PIN</label>
      <input
        v-model="pin"
        class="pin-input"
        type="password"
        inputmode="numeric"
        maxlength="6"
        placeholder="••••"
        autocomplete="off"
        @keyup.enter="unlock"
      />
      <button type="button" class="btn-primary" :disabled="busy || pin.length < 4" @click="unlock">
        {{ busy ? 'Unlocking…' : 'Unlock station' }}
      </button>
    </section>

    <!-- Event list -->
    <section v-else-if="!selectedEventId" class="card">
      <div class="row-between">
        <h2>Today’s school events</h2>
        <button type="button" class="btn-ghost" :disabled="busy" @click="loadEvents">Refresh</button>
      </div>
      <div v-if="!events.length" class="empty">No school events in the next couple of days.</div>
      <button
        v-for="e in events"
        :key="e.id"
        type="button"
        class="event-row"
        :class="{ muted: !e.punchAllowedToday }"
        @click="selectEvent(e)"
      >
        <div class="event-main">
          <strong>{{ e.title }}</strong>
          <span class="muted">{{ e.schoolName || 'School' }}</span>
        </div>
        <div class="event-meta">
          <span>{{ formatWhen(e) }}</span>
          <span v-if="reportLabel(e)" class="report">{{ reportLabel(e) }}</span>
        </div>
      </button>
    </section>

    <!-- Staff punch -->
    <section v-else class="card">
      <div class="row-between">
        <button type="button" class="btn-ghost" @click="backToEvents">← Events</button>
        <button type="button" class="btn-ghost" :disabled="busy" @click="loadStaff">Refresh</button>
      </div>
      <h2>{{ selectedMeta?.eventTitle || 'Event' }}</h2>
      <p class="muted">{{ selectedMeta?.schoolName || '' }}</p>
      <p v-if="selectedMeta" class="when">{{ formatWhen(selectedMeta) }}</p>
      <p v-if="selectedMeta && reportLabel(selectedMeta)" class="report">{{ reportLabel(selectedMeta) }}</p>

      <div class="pin-row">
        <input
          v-model="staffPin"
          class="pin-input sm"
          type="password"
          inputmode="numeric"
          maxlength="4"
          placeholder="Staff PIN"
          @keyup.enter="clockInByPin"
        />
        <button type="button" class="btn-primary" :disabled="busy || staffPin.length !== 4" @click="clockInByPin">
          Clock in with PIN
        </button>
      </div>

      <div class="staff-grid">
        <button
          v-for="s in staff"
          :key="s.id"
          type="button"
          class="staff-chip"
          @click="clockInUser(s)"
        >
          <img v-if="s.profilePhotoUrl" :src="s.profilePhotoUrl" alt="" class="avatar" />
          <span v-else class="avatar fallback">{{ initials(s.displayName) }}</span>
          <span class="name">{{ s.displayName }}</span>
        </button>
      </div>

      <div v-if="activeUser" class="active-panel">
        <div class="checkout-bar">
          <span>Clocked in: <strong>{{ activeUser.displayName }}</strong></span>
          <div class="checkout-actions">
            <button
              v-if="!hasPhoto"
              type="button"
              class="btn-ghost"
              :disabled="busy"
              @click="openPhotoCapture('mid_shift')"
            >
              Add event photo
            </button>
            <button type="button" class="btn-primary" :disabled="busy" @click="beginClockOut">
              Clock out
            </button>
          </div>
        </div>

        <div class="photo-reminder" :class="{ done: hasPhoto }">
          <strong v-if="hasPhoto">Marketing photo on file — you’re set for checkout.</strong>
          <template v-else>
            <strong>Reminder:</strong>
            Please take a photo when the table is set up and/or of yourself at the table for social media and marketing.
            You can upload it now, or you’ll be asked again before clocking out.
          </template>
        </div>

        <div v-if="photoPhase" class="photo-panel">
          <h3>{{ photoPhase === 'checkout' ? 'Checkout photo' : 'Event photo' }}</h3>
          <p class="muted">
            Capture the outreach table setup and/or yourself at the table so marketing can share the event.
          </p>

          <div v-if="!photoPreview" class="camera-wrap">
            <video ref="photoVideo" class="camera" autoplay playsinline muted />
            <button type="button" class="btn-primary" :disabled="busy" @click="snapPhoto">Take photo</button>
          </div>
          <div v-else class="preview-wrap">
            <img :src="photoPreview" alt="Event photo preview" class="preview" />
            <div class="preview-actions">
              <button type="button" class="btn-ghost" :disabled="busy" @click="clearPhoto">Retake</button>
              <button
                v-if="photoPhase === 'mid_shift'"
                type="button"
                class="btn-primary"
                :disabled="busy"
                @click="uploadMidShiftPhoto"
              >
                {{ busy ? 'Uploading…' : 'Save photo' }}
              </button>
              <button
                v-else
                type="button"
                class="btn-primary"
                :disabled="busy"
                @click="clockOutWithPhoto"
              >
                {{ busy ? 'Clocking out…' : 'Save photo & clock out' }}
              </button>
            </div>
          </div>

          <div v-if="photoPhase === 'checkout'" class="bypass-box">
            <label class="bypass-check">
              <input v-model="bypassAcknowledged" type="checkbox" />
              <span>
                I understand that I am being asked to provide a photo of this event, and that my team will be notified
                that I was unable to provide one.
              </span>
            </label>
            <button
              type="button"
              class="btn-ghost danger"
              :disabled="busy || !bypassAcknowledged"
              @click="clockOutWithBypass"
            >
              Continue without photo &amp; clock out
            </button>
          </div>

          <button type="button" class="btn-ghost cancel" :disabled="busy" @click="closePhotoCapture">
            {{ photoPhase === 'checkout' ? 'Cancel checkout' : 'Close' }}
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useBrandingStore } from '../../store/branding';
import { ensurePortalSlugResolved } from '../../utils/orgScopedPath';
import {
  formatSchoolEventTimeRange,
  formatSchoolEventReportTime,
  timezoneAbbrevAt
} from '../../utils/timezones';

const route = useRoute();
const brandingStore = useBrandingStore();

const slug = ref('');
const token = ref('');
const pin = ref('');
const staffPin = ref('');
const busy = ref(false);
const error = ref('');
const notice = ref('');
const events = ref([]);
const selectedEventId = ref(null);
const selectedMeta = ref(null);
const staff = ref([]);
const activeUser = ref(null);
const hasPhoto = ref(false);
const photoPhase = ref(null); // null | 'mid_shift' | 'checkout'
const photoPreview = ref('');
const photoStream = ref(null);
const photoVideo = ref(null);
const bypassAcknowledged = ref(false);

const storageKey = computed(() => `schoolEventsKiosk.${slug.value || 'x'}`);

function authHeaders() {
  return token.value ? { Authorization: `Bearer ${token.value}` } : {};
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return ((parts[0][0] || '') + (parts[parts.length - 1][0] || '')).toUpperCase();
}

function formatWhen(e) {
  return formatSchoolEventTimeRange(e.startsAt || e.starts_at, e.endsAt || e.ends_at, e.timezone);
}

function reportLabel(e) {
  const t = formatSchoolEventReportTime(
    e.employeeReportTime || e.employee_report_time,
    timezoneAbbrevAt(e.startsAt || e.starts_at || new Date(), e.timezone)
  );
  return t ? `Report by ${t}` : '';
}

function resetPhotoUi() {
  stopCamera();
  photoPhase.value = null;
  photoPreview.value = '';
  bypassAcknowledged.value = false;
}

function backToEvents() {
  selectedEventId.value = null;
  staff.value = [];
  activeUser.value = null;
  hasPhoto.value = false;
  resetPhotoUi();
}

function lockStation() {
  token.value = '';
  selectedEventId.value = null;
  staff.value = [];
  activeUser.value = null;
  hasPhoto.value = false;
  resetPhotoUi();
  pin.value = '';
  try {
    sessionStorage.removeItem(storageKey.value);
  } catch {
    /* ignore */
  }
}

async function unlock() {
  try {
    busy.value = true;
    error.value = '';
    notice.value = '';
    const res = await api.post(
      `/public/school-events/agency/${encodeURIComponent(slug.value)}/kiosk/unlock`,
      { pin: pin.value },
      { skipAuthRedirect: true, skipGlobalLoading: true }
    );
    token.value = res.data?.token || '';
    if (!token.value) throw new Error('No token');
    try {
      sessionStorage.setItem(storageKey.value, token.value);
    } catch {
      /* ignore */
    }
    pin.value = '';
    await loadEvents();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Unlock failed';
  } finally {
    busy.value = false;
  }
}

async function loadEvents() {
  try {
    busy.value = true;
    error.value = '';
    const res = await api.get(
      `/public/school-events/agency/${encodeURIComponent(slug.value)}/kiosk/events`,
      { headers: authHeaders(), skipAuthRedirect: true, skipGlobalLoading: true }
    );
    events.value = Array.isArray(res.data?.events) ? res.data.events : [];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load events';
    if (e?.response?.status === 401) lockStation();
  } finally {
    busy.value = false;
  }
}

async function selectEvent(e) {
  selectedEventId.value = e.id;
  activeUser.value = null;
  hasPhoto.value = false;
  resetPhotoUi();
  await loadStaff();
}

async function loadStaff() {
  if (!selectedEventId.value) return;
  try {
    busy.value = true;
    error.value = '';
    const res = await api.get(
      `/public/school-events/agency/${encodeURIComponent(slug.value)}/kiosk/events/${selectedEventId.value}/staff`,
      { headers: authHeaders(), skipAuthRedirect: true, skipGlobalLoading: true }
    );
    selectedMeta.value = res.data || null;
    staff.value = Array.isArray(res.data?.staff) ? res.data.staff : [];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load staff';
  } finally {
    busy.value = false;
  }
}

async function refreshPhotoStatus(userId) {
  if (!userId || !selectedEventId.value) {
    hasPhoto.value = false;
    return;
  }
  try {
    const res = await api.get(
      `/public/school-events/agency/${encodeURIComponent(slug.value)}/kiosk/events/${selectedEventId.value}/staff/${userId}/photo-status`,
      { headers: authHeaders(), skipAuthRedirect: true, skipGlobalLoading: true }
    );
    hasPhoto.value = !!res.data?.hasPhoto;
  } catch {
    hasPhoto.value = false;
  }
}

async function clockInUser(s) {
  try {
    busy.value = true;
    error.value = '';
    notice.value = '';
    resetPhotoUi();
    const res = await api.post(
      `/public/school-events/agency/${encodeURIComponent(slug.value)}/kiosk/events/${selectedEventId.value}/checkin/employee`,
      { userId: s.id },
      { headers: authHeaders(), skipAuthRedirect: true, skipGlobalLoading: true }
    );
    activeUser.value = { id: s.id, displayName: s.displayName };
    notice.value = res.data?.alreadyClockedIn
      ? `${s.displayName} was already clocked in.`
      : `${s.displayName} clocked in.`;
    await refreshPhotoStatus(s.id);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Clock-in failed';
  } finally {
    busy.value = false;
  }
}

async function clockInByPin() {
  try {
    busy.value = true;
    error.value = '';
    notice.value = '';
    resetPhotoUi();
    const res = await api.post(
      `/public/school-events/agency/${encodeURIComponent(slug.value)}/kiosk/events/${selectedEventId.value}/checkin/employee-pin`,
      { pin: staffPin.value },
      { headers: authHeaders(), skipAuthRedirect: true, skipGlobalLoading: true }
    );
    activeUser.value = {
      id: res.data?.userId,
      displayName: res.data?.displayName || 'Staff'
    };
    notice.value = res.data?.alreadyClockedIn
      ? `${activeUser.value.displayName} was already clocked in.`
      : `${activeUser.value.displayName} clocked in.`;
    staffPin.value = '';
    await refreshPhotoStatus(activeUser.value.id);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Clock-in failed';
  } finally {
    busy.value = false;
  }
}

async function startCamera() {
  stopCamera();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false
    });
    photoStream.value = stream;
    await nextTick();
    if (photoVideo.value) photoVideo.value.srcObject = stream;
  } catch {
    error.value = 'Camera unavailable — you can still continue without a photo at checkout.';
  }
}

function stopCamera() {
  if (photoStream.value) {
    photoStream.value.getTracks().forEach((t) => t.stop());
    photoStream.value = null;
  }
  if (photoVideo.value) photoVideo.value.srcObject = null;
}

async function openPhotoCapture(phase) {
  error.value = '';
  notice.value = '';
  photoPreview.value = '';
  bypassAcknowledged.value = false;
  photoPhase.value = phase;
  await startCamera();
}

function closePhotoCapture() {
  resetPhotoUi();
}

function snapPhoto() {
  if (!photoVideo.value) return;
  const v = photoVideo.value;
  const canvas = document.createElement('canvas');
  canvas.width = v.videoWidth || 1280;
  canvas.height = v.videoHeight || 720;
  canvas.getContext('2d').drawImage(v, 0, 0);
  photoPreview.value = canvas.toDataURL('image/jpeg', 0.85);
  stopCamera();
}

async function clearPhoto() {
  photoPreview.value = '';
  await startCamera();
}

async function uploadMidShiftPhoto() {
  if (!activeUser.value?.id || !photoPreview.value) return;
  try {
    busy.value = true;
    error.value = '';
    notice.value = '';
    await api.post(
      `/public/school-events/agency/${encodeURIComponent(slug.value)}/kiosk/events/${selectedEventId.value}/photo`,
      { userId: activeUser.value.id, photoBase64: photoPreview.value },
      { headers: authHeaders(), skipAuthRedirect: true, skipGlobalLoading: true }
    );
    hasPhoto.value = true;
    notice.value = 'Event photo saved. Marketing has been notified.';
    resetPhotoUi();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Photo upload failed';
  } finally {
    busy.value = false;
  }
}

async function beginClockOut() {
  if (!activeUser.value?.id) return;
  error.value = '';
  notice.value = '';
  await refreshPhotoStatus(activeUser.value.id);
  if (hasPhoto.value) {
    await clockOut({});
    return;
  }
  await openPhotoCapture('checkout');
}

async function clockOutWithPhoto() {
  if (!photoPreview.value) return;
  await clockOut({ photoBase64: photoPreview.value });
}

async function clockOutWithBypass() {
  if (!bypassAcknowledged.value) return;
  await clockOut({ bypassPhoto: true, bypassAcknowledged: true });
}

async function clockOut(extra = {}) {
  if (!activeUser.value?.id) return;
  try {
    busy.value = true;
    error.value = '';
    notice.value = '';
    const res = await api.post(
      `/public/school-events/agency/${encodeURIComponent(slug.value)}/kiosk/events/${selectedEventId.value}/checkout/employee`,
      { userId: activeUser.value.id, ...extra },
      { headers: authHeaders(), skipAuthRedirect: true, skipGlobalLoading: true }
    );
    const hours = res.data?.workedHours != null ? Number(res.data.workedHours).toFixed(2) : null;
    const photoNote = res.data?.photoBypassed
      ? ' Marketing was notified that no photo was provided.'
      : res.data?.photoProvided
        ? ' Marketing photo recorded.'
        : '';
    notice.value = hours
      ? `${activeUser.value.displayName} clocked out (${hours}h — posts as indirect).${photoNote}`
      : `${activeUser.value.displayName} clocked out.${photoNote}`;
    activeUser.value = null;
    hasPhoto.value = false;
    resetPhotoUi();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Clock-out failed';
    if (e?.response?.data?.error?.code === 'SCHOOL_EVENT_PHOTO_REQUIRED' && photoPhase.value !== 'checkout') {
      await openPhotoCapture('checkout');
    }
  } finally {
    busy.value = false;
  }
}

onMounted(async () => {
  slug.value = await ensurePortalSlugResolved(route.params, brandingStore);
  try {
    const saved = sessionStorage.getItem(storageKey.value);
    if (saved) {
      token.value = saved;
      await loadEvents();
    }
  } catch {
    /* ignore */
  }
});

onBeforeUnmount(() => {
  stopCamera();
});
</script>

<style scoped>
.sek-page {
  min-height: 100vh;
  padding: 1.25rem 1.25rem 2.5rem;
  background: linear-gradient(160deg, #ecfdf5 0%, #f8fafc 45%, #eef2ff 100%);
  color: #0f172a;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
}
.sek-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1rem;
}
.eyebrow {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.72rem;
  font-weight: 800;
  color: #0f766e;
}
h1 {
  margin: 0.2rem 0;
  font-size: 1.6rem;
}
h2, h3 {
  margin: 0.35rem 0;
}
.sub, .muted, .when {
  color: #64748b;
  margin: 0.2rem 0;
}
.card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 1.1rem 1.2rem;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
  max-width: 720px;
}
.unlock-card {
  max-width: 360px;
}
.lbl {
  display: block;
  font-weight: 700;
  margin-bottom: 0.4rem;
}
.pin-input {
  width: 100%;
  font-size: 1.4rem;
  letter-spacing: 0.3em;
  text-align: center;
  padding: 0.7rem;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  margin-bottom: 0.75rem;
}
.pin-input.sm {
  font-size: 1.1rem;
  letter-spacing: 0.2em;
  margin-bottom: 0;
}
.btn-primary, .btn-ghost {
  border: none;
  border-radius: 10px;
  padding: 0.65rem 1rem;
  font-weight: 700;
  cursor: pointer;
}
.btn-primary {
  background: #0f766e;
  color: #fff;
  width: 100%;
}
.btn-primary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.btn-ghost {
  background: transparent;
  color: #0f766e;
  border: 1px solid #99f6e4;
}
.btn-ghost.danger {
  color: #b45309;
  border-color: #fcd34d;
  width: 100%;
  margin-top: 0.65rem;
}
.btn-ghost.cancel {
  width: 100%;
  margin-top: 0.75rem;
}
.btn-ghost:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.row-between {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}
.event-row {
  width: 100%;
  text-align: left;
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.85rem 0.7rem;
  border: 0;
  border-bottom: 1px solid #e2e8f0;
  background: transparent;
  cursor: pointer;
}
.event-row:hover {
  background: #f0fdfa;
}
.event-main {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.event-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.2rem;
  font-size: 0.85rem;
  color: #475569;
}
.report {
  color: #b45309;
  font-weight: 700;
  font-size: 0.85rem;
}
.pin-row {
  display: flex;
  gap: 0.5rem;
  margin: 1rem 0;
}
.pin-row .btn-primary {
  width: auto;
  white-space: nowrap;
}
.staff-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.65rem;
}
.staff-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  padding: 0.7rem;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
  cursor: pointer;
}
.avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
}
.avatar.fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #ccfbf1;
  color: #0f766e;
  font-weight: 800;
}
.name {
  font-size: 0.85rem;
  font-weight: 600;
  text-align: center;
}
.active-panel {
  margin-top: 1.1rem;
}
.checkout-bar {
  padding: 0.85rem;
  border-radius: 12px;
  background: #ecfdf5;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.checkout-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.checkout-actions .btn-primary,
.checkout-actions .btn-ghost {
  width: auto;
}
.photo-reminder {
  margin-top: 0.75rem;
  padding: 0.85rem 0.95rem;
  border-radius: 12px;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  color: #9a3412;
  font-size: 0.95rem;
  line-height: 1.4;
}
.photo-reminder.done {
  background: #ecfdf5;
  border-color: #99f6e4;
  color: #065f46;
}
.photo-panel {
  margin-top: 0.85rem;
  padding: 1rem;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
}
.camera-wrap, .preview-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}
.camera, .preview {
  width: 100%;
  max-height: 320px;
  object-fit: cover;
  border-radius: 12px;
  background: #0f172a;
}
.preview-actions {
  display: flex;
  gap: 0.5rem;
}
.preview-actions .btn-primary,
.preview-actions .btn-ghost {
  width: auto;
  flex: 1;
}
.bypass-box {
  margin-top: 1rem;
  padding-top: 0.85rem;
  border-top: 1px dashed #cbd5e1;
}
.bypass-check {
  display: flex;
  gap: 0.65rem;
  align-items: flex-start;
  font-size: 0.92rem;
  line-height: 1.35;
  color: #334155;
}
.bypass-check input {
  margin-top: 0.2rem;
}
.banner {
  max-width: 720px;
  margin-bottom: 0.75rem;
  padding: 0.65rem 0.85rem;
  border-radius: 10px;
}
.banner.error {
  background: #fef2f2;
  color: #b91c1c;
}
.banner.ok {
  background: #ecfdf5;
  color: #065f46;
}
.empty {
  color: #64748b;
  padding: 1rem 0;
}
@media (max-width: 560px) {
  .checkout-bar {
    flex-direction: column;
    align-items: stretch;
  }
  .checkout-actions {
    flex-direction: column;
  }
  .checkout-actions .btn-primary,
  .checkout-actions .btn-ghost {
    width: 100%;
  }
}
</style>
