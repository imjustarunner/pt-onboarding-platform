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
        <button type="button" class="btn-ghost" @click="selectedEventId = null; staff = []">← Events</button>
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

      <div v-if="activeUser" class="checkout-bar">
        <span>Clocked in: <strong>{{ activeUser.displayName }}</strong></span>
        <button type="button" class="btn-primary" :disabled="busy" @click="clockOut">Clock out</button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
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

function lockStation() {
  token.value = '';
  selectedEventId.value = null;
  staff.value = [];
  activeUser.value = null;
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

async function clockInUser(s) {
  try {
    busy.value = true;
    error.value = '';
    notice.value = '';
    const res = await api.post(
      `/public/school-events/agency/${encodeURIComponent(slug.value)}/kiosk/events/${selectedEventId.value}/checkin/employee`,
      { userId: s.id },
      { headers: authHeaders(), skipAuthRedirect: true, skipGlobalLoading: true }
    );
    activeUser.value = { id: s.id, displayName: s.displayName };
    notice.value = res.data?.alreadyClockedIn
      ? `${s.displayName} was already clocked in.`
      : `${s.displayName} clocked in.`;
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
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Clock-in failed';
  } finally {
    busy.value = false;
  }
}

async function clockOut() {
  if (!activeUser.value?.id) return;
  try {
    busy.value = true;
    error.value = '';
    notice.value = '';
    const res = await api.post(
      `/public/school-events/agency/${encodeURIComponent(slug.value)}/kiosk/events/${selectedEventId.value}/checkout/employee`,
      { userId: activeUser.value.id },
      { headers: authHeaders(), skipAuthRedirect: true, skipGlobalLoading: true }
    );
    const hours = res.data?.workedHours != null ? Number(res.data.workedHours).toFixed(2) : null;
    notice.value = hours
      ? `${activeUser.value.displayName} clocked out (${hours}h — posts as indirect when cap is 0).`
      : `${activeUser.value.displayName} clocked out.`;
    activeUser.value = null;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Clock-out failed';
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
.checkout-bar {
  margin-top: 1.1rem;
  padding: 0.85rem;
  border-radius: 12px;
  background: #ecfdf5;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
}
.checkout-bar .btn-primary {
  width: auto;
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
</style>
