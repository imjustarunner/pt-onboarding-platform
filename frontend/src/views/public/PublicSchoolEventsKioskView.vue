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
    <section v-else-if="!selectedEventId" class="card events-card">
      <div class="row-between">
        <div>
          <h2>{{ listHeading }}</h2>
          <p v-if="agendaMode && !showUpcomingAgenda" class="list-sub">
            Showing events open for clock-in today. Use the button to preview the full upcoming agenda.
          </p>
        </div>
        <div class="list-actions">
          <button
            v-if="agendaMode"
            type="button"
            class="btn-toggle"
            :class="{ active: showUpcomingAgenda }"
            @click="showUpcomingAgenda = !showUpcomingAgenda"
          >
            {{ showUpcomingAgenda ? 'Today only' : 'Show upcoming agenda' }}
          </button>
          <button type="button" class="btn-ghost" :disabled="busy" @click="loadEvents">Refresh</button>
        </div>
      </div>
      <p v-if="agendaMode && showUpcomingAgenda" class="agenda-note">
        Admin agenda — future events are listed in date order. Staff can clock in only on the event date.
      </p>
      <div v-if="!displayedEvents.length" class="empty">
        {{ emptyListMessage }}
      </div>
      <div v-else class="agenda-list">
        <article
          v-for="e in displayedEvents"
          :key="e.id"
          class="agenda-item"
          :class="{ upcoming: !e.punchAllowedToday, punchable: e.punchAllowedToday }"
        >
          <div class="agenda-main">
            <div class="agenda-head">
              <strong class="agenda-title">{{ e.title }}</strong>
              <span v-if="e.punchAllowedToday" class="status-tag open">Open for clock-in</span>
              <span v-else class="status-tag upcoming">Upcoming</span>
            </div>
            <div class="agenda-details">
              <span><strong>School:</strong> {{ e.schoolName || 'Unassigned' }}</span>
              <span><strong>When:</strong> {{ formatWhen(e) }}</span>
              <span v-if="reportLabel(e)"><strong>Report:</strong> {{ reportLabel(e) }}</span>
              <span><strong>Type:</strong> {{ eventTypeLabel(e) }}</span>
              <span><strong>Status:</strong> {{ formatEventStatus(e) }}</span>
            </div>
            <div class="agenda-staff">
              <strong>Assigned staff:</strong>
              <span v-if="!(e.assignedStaff || []).length" class="muted">None yet</span>
              <span v-else class="staff-names">{{ assignedStaffLabel(e) }}</span>
            </div>
          </div>
          <div v-if="e.punchAllowedToday" class="agenda-action">
            <button type="button" class="btn-primary btn-clock" @click="selectEvent(e)">
              Clock in
            </button>
          </div>
        </article>
      </div>
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

      <div v-if="!punchAllowedOnSelectedEvent" class="preview-only">
        <p>
          This event is not open for clock-in yet. Assigned staff can check in and out here on the event date.
        </p>
        <h3>Assigned staff</h3>
        <div v-if="!staff.length" class="empty">No staff assigned yet.</div>
        <ul v-else class="staff-preview">
          <li v-for="s in staff" :key="s.id">{{ s.displayName }}</li>
        </ul>
      </div>

      <template v-else>
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
      </template>
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
const agendaMode = ref(false);
const showUpcomingAgenda = ref(false);
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

const punchAllowedOnSelectedEvent = computed(() => !!selectedMeta.value?.punchAllowedToday);

const displayedEvents = computed(() => {
  if (agendaMode.value && showUpcomingAgenda.value) return events.value;
  return events.value.filter((e) => e.punchAllowedToday);
});

const listHeading = computed(() => {
  if (agendaMode.value && showUpcomingAgenda.value) return 'Upcoming school events';
  return 'Today’s school events';
});

const emptyListMessage = computed(() => {
  if (agendaMode.value && showUpcomingAgenda.value) return 'No upcoming school events scheduled.';
  if (agendaMode.value) return 'No school events open for clock-in today.';
  return 'No school events today.';
});

function authHeaders() {
  const headers = token.value ? { Authorization: `Bearer ${token.value}` } : {};
  // Station PIN JWT occupies Authorization; pass the logged-in user session separately
  // so admin/super_admin agenda mode can resolve on the server.
  try {
    const demoToken = sessionStorage.getItem('__pt_demo_window_token__');
    const userToken = demoToken || localStorage.getItem('authToken');
    if (userToken) headers['X-User-Authorization'] = `Bearer ${userToken}`;
  } catch {
    /* cookie auth still works in browsers */
  }
  return headers;
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

function eventTypeLabel(e) {
  const map = {
    school_back_to_school: 'Back to School',
    school_fall_check_in: 'Fall School Check-in',
    school_spring_event: 'Spring School Check-in',
    school_first_day: 'First Day of School',
    school_open_house: 'Open House',
    school_resource_fair: 'Resource Fair',
    school_family_night: 'Family Night',
    school_orientation: 'Orientation',
    school_holiday: 'Holiday',
    school_day_off: 'Day off',
    school_other: 'School Event'
  };
  return map[e.eventType] || e.eventType || 'Event';
}

function formatEventStatus(e) {
  const s = String(e.schoolEventStatus || 'scheduled').toLowerCase();
  if (s === 'canceled' || s === 'cancelled') return 'Canceled';
  if (s === 'rescheduled') return 'Rescheduled';
  return 'Scheduled';
}

function assignedStaffLabel(e) {
  return (e.assignedStaff || []).map((s) => s.displayName).filter(Boolean).join(', ');
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
    agendaMode.value = !!res.data?.agendaMode;
    if (!agendaMode.value) showUpcomingAgenda.value = false;
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
  selectedMeta.value = { ...e };
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
    if (selectedMeta.value && res.data?.punchAllowedToday === false) {
      selectedMeta.value = { ...selectedMeta.value, punchAllowedToday: false };
    }
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
.events-card {
  max-width: none;
  width: 100%;
}
.unlock-card {
  max-width: 360px;
}
.list-sub {
  margin: 0.35rem 0 0;
  color: #64748b;
  font-size: 0.92rem;
}
.list-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}
.btn-toggle {
  border: 1px solid #99f6e4;
  border-radius: 10px;
  padding: 0.55rem 0.85rem;
  font-weight: 700;
  cursor: pointer;
  background: #fff;
  color: #0f766e;
  white-space: nowrap;
}
.btn-toggle.active {
  background: #0f766e;
  color: #fff;
  border-color: #0f766e;
}
.agenda-list {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  margin-top: 0.5rem;
}
.agenda-item {
  display: flex;
  justify-content: space-between;
  align-items: stretch;
  gap: 1rem;
  padding: 1rem 1.1rem;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fafafa;
}
.agenda-item.punchable {
  background: #f0fdfa;
  border-color: #99f6e4;
}
.agenda-item.upcoming {
  background: #f8fafc;
}
.agenda-main {
  flex: 1;
  min-width: 0;
}
.agenda-head {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  flex-wrap: wrap;
  margin-bottom: 0.55rem;
}
.agenda-title {
  font-size: 1.05rem;
}
.status-tag {
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.18rem 0.45rem;
  border-radius: 999px;
}
.status-tag.open {
  background: #ccfbf1;
  color: #0f766e;
}
.status-tag.upcoming {
  background: #e0e7ff;
  color: #4338ca;
}
.agenda-details {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.35rem 1.25rem;
  font-size: 0.92rem;
  color: #334155;
  margin-bottom: 0.55rem;
}
.agenda-details strong {
  color: #64748b;
  font-weight: 700;
}
.agenda-staff {
  font-size: 0.92rem;
  color: #334155;
  line-height: 1.4;
}
.staff-names {
  color: #0f172a;
}
.agenda-action {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
.btn-clock {
  width: auto;
  min-width: 7rem;
  white-space: nowrap;
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
  max-width: none;
  width: 100%;
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
.agenda-note {
  margin: 0 0 0.85rem;
  padding: 0.65rem 0.75rem;
  border-radius: 10px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1e40af;
  font-size: 0.9rem;
  line-height: 1.35;
}
.future-tag {
  display: none;
}
.preview-only {
  margin-top: 1rem;
  padding: 0.95rem;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}
.preview-only h3 {
  margin: 0.85rem 0 0.45rem;
  font-size: 0.95rem;
}
.staff-preview {
  margin: 0;
  padding-left: 1.2rem;
  color: #334155;
}
.staff-preview li {
  margin: 0.25rem 0;
}
@media (max-width: 720px) {
  .agenda-item {
    flex-direction: column;
  }
  .agenda-action {
    width: 100%;
  }
  .btn-clock {
    width: 100%;
  }
  .list-actions {
    width: 100%;
    justify-content: flex-start;
  }
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
