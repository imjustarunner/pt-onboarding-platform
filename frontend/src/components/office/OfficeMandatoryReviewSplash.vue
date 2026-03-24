<template>
  <Teleport to="body">
    <div
      v-if="showSplash"
      class="office-mandatory-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby="office-mandatory-title"
    >
      <div class="office-mandatory-backdrop" aria-hidden="true" />
      <div class="office-mandatory-panel">
        <div class="office-mandatory-inner">
          <h1 id="office-mandatory-title" class="office-mandatory-title">Office time needs your decision</h1>
          <p class="office-mandatory-lead">
            Booked time in Therapy Notes / your shared calendar does not automatically reserve the office.
            For each slot below, either <strong>book</strong> it in this system, <strong>request an extension</strong> (temporary assignments), or <strong>forfeit</strong> the space.
          </p>

          <div v-if="loadError" class="office-mandatory-error">{{ loadError }}</div>

          <div v-else class="office-mandatory-list">
            <div v-for="it in items" :key="it.standingAssignmentId" class="office-mandatory-card">
              <div class="office-mandatory-row-head">
                <div class="office-mandatory-when">
                  {{ weekdayName(it.weekday) }} · {{ formatHour(it.hour) }}
                </div>
                <div class="office-mandatory-where muted">
                  {{ it.officeName }} · {{ it.roomLabel }}
                </div>
                <div v-if="it.reason === 'temporary_expiring'" class="office-mandatory-badge">
                  Temporary until {{ it.temporaryUntilDate }}
                  <span v-if="it.extensionsUsed"> · {{ it.extensionsUsed }} extension(s) used</span>
                </div>
              </div>

              <div v-if="rowError[it.standingAssignmentId]" class="office-mandatory-error">
                {{ rowError[it.standingAssignmentId] }}
              </div>

              <div v-if="it.reason === 'needs_booking'" class="office-mandatory-actions">
                <div class="office-mandatory-book-row">
                  <label class="office-mandatory-label">Book occurrences</label>
                  <select v-model="bookFreq[it.standingAssignmentId]" class="office-mandatory-select">
                    <option value="WEEKLY">Weekly</option>
                    <option value="BIWEEKLY">Every other week</option>
                    <option value="MONTHLY">Monthly</option>
                  </select>
                  <button
                    type="button"
                    class="btn btn-primary btn-sm"
                    :disabled="!!rowBusy[it.standingAssignmentId]"
                    @click="book(it)"
                  >
                    Book
                  </button>
                </div>
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  :disabled="!!rowBusy[it.standingAssignmentId]"
                  @click="forfeit(it)"
                >
                  Forfeit slot
                </button>
              </div>

              <div v-else class="office-mandatory-actions">
                <button
                  type="button"
                  class="btn btn-primary btn-sm"
                  :disabled="!!rowBusy[it.standingAssignmentId]"
                  @click="extendTemporary(it)"
                >
                  Extend 6 weeks
                </button>
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  :disabled="!!rowBusy[it.standingAssignmentId]"
                  @click="forfeit(it)"
                >
                  Forfeit slot
                </button>
              </div>
            </div>
          </div>

          <div class="office-mandatory-foot-actions">
            <button
              v-if="canRemindLater"
              type="button"
              class="btn btn-secondary btn-sm"
              @click="remindLater"
            >
              Remind me later ({{ 2 - gateState.remindersUsed }} left)
            </button>
            <p class="office-mandatory-foot muted">
              Log out if you cannot complete this now.
              <button type="button" class="btn-link" @click="logout">Sign out</button>
            </p>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useAuthStore } from '../../store/auth';
import api from '../../services/api';
import { officeMandatoryBlocking } from '../../utils/officeMandatoryGate';

const authStore = useAuthStore();

/** Snooze: up to 2 "Remind me later" clicks; each hides the gate for 1 hour. After that, no dismiss. */
const SNOOZE_MS = 60 * 60 * 1000;
const MAX_REMINDERS = 2;

const items = ref([]);
const gateState = ref({ remindersUsed: 0, hiddenUntilTs: 0 });

function gateStorageKey(uid) {
  return `officeMandatoryGate_v1_${uid}`;
}

function loadGateFromLs() {
  const uid = authStore.user?.id;
  if (!uid) return;
  try {
    const raw = localStorage.getItem(gateStorageKey(uid));
    if (!raw) {
      gateState.value = { remindersUsed: 0, hiddenUntilTs: 0 };
      return;
    }
    const o = JSON.parse(raw);
    gateState.value = {
      remindersUsed: Math.min(MAX_REMINDERS, Number(o.remindersUsed) || 0),
      hiddenUntilTs: Number(o.hiddenUntilTs) || 0
    };
  } catch {
    gateState.value = { remindersUsed: 0, hiddenUntilTs: 0 };
  }
}

function saveGateToLs() {
  const uid = authStore.user?.id;
  if (!uid) return;
  localStorage.setItem(gateStorageKey(uid), JSON.stringify(gateState.value));
}

function clearGateStorage() {
  const uid = authStore.user?.id;
  if (!uid) return;
  localStorage.removeItem(gateStorageKey(uid));
}

const snoozedActive = computed(() => {
  const { hiddenUntilTs } = gateState.value;
  if (!hiddenUntilTs) return false;
  return Date.now() < hiddenUntilTs;
});

/** Splash visible: pending items and not inside a snooze window */
const showSplash = computed(() => items.value.length > 0 && !snoozedActive.value);

const canRemindLater = computed(() => gateState.value.remindersUsed < MAX_REMINDERS);

watch(
  showSplash,
  (v) => {
    officeMandatoryBlocking.value = v;
    if (typeof document === 'undefined') return;
    document.body.style.overflow = v ? 'hidden' : '';
  },
  { immediate: true }
);
const loadError = ref('');
const rowError = ref({});
const rowBusy = ref({});
const bookFreq = ref({});

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function weekdayName(w) {
  const n = Number(w);
  return WEEKDAYS[n] || String(w);
}

function formatHour(h) {
  const n = Number(h);
  if (!Number.isFinite(n)) return '';
  const ampm = n >= 12 ? 'PM' : 'AM';
  const h12 = n % 12 === 0 ? 12 : n % 12;
  return `${h12}:00 ${ampm}`;
}

function addDaysYmd(ymd, days) {
  const m = String(ymd || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(ymd || '').slice(0, 10);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

function remindLater() {
  gateState.value = {
    remindersUsed: Math.min(MAX_REMINDERS, gateState.value.remindersUsed + 1),
    hiddenUntilTs: Date.now() + SNOOZE_MS
  };
  saveGateToLs();
}

async function load() {
  loadError.value = '';
  loadGateFromLs();
  try {
    const { data } = await api.get('/office-schedule/me/mandatory-review', { skipGlobalLoading: true });
    const list = Array.isArray(data?.items) ? data.items : [];
    if (list.length === 0) {
      clearGateStorage();
      gateState.value = { remindersUsed: 0, hiddenUntilTs: 0 };
    }
    items.value = list;
    for (const it of list) {
      const id = it.standingAssignmentId;
      if (bookFreq.value[id] == null) {
        const def =
          String(it.assignedFrequency || '').toUpperCase() === 'BIWEEKLY' ? 'BIWEEKLY' : 'WEEKLY';
        bookFreq.value[id] = def;
      }
    }
  } catch (e) {
    loadError.value = e.response?.data?.error?.message || 'Could not load office requirements.';
    items.value = [];
  }
}

async function book(it) {
  const id = it.standingAssignmentId;
  rowError.value = { ...rowError.value, [id]: '' };
  rowBusy.value = { ...rowBusy.value, [id]: true };
  try {
    const freq = String(bookFreq.value[id] || 'WEEKLY').toUpperCase();
    const start = String(it.suggestedBookingStartDate || '').slice(0, 10);
    const until = addDaysYmd(start, 364);
    await api.post(`/office-slots/${it.officeLocationId}/assignments/${id}/booking-plan`, {
      bookedFrequency: freq,
      bookingStartDate: start,
      bookedOccurrenceCount: 6,
      recurringUntilDate: until
    });
    await load();
  } catch (e) {
    rowError.value = {
      ...rowError.value,
      [id]: e.response?.data?.error?.message || 'Could not save booking.'
    };
  } finally {
    rowBusy.value = { ...rowBusy.value, [id]: false };
  }
}

async function forfeit(it) {
  const id = it.standingAssignmentId;
  // eslint-disable-next-line no-alert
  if (!window.confirm('Forfeit this office slot for all future dates? This cannot be undone from here.')) return;
  rowError.value = { ...rowError.value, [id]: '' };
  rowBusy.value = { ...rowBusy.value, [id]: true };
  try {
    await api.post(`/office-slots/${it.officeLocationId}/assignments/${id}/forfeit`, {
      acknowledged: true,
      scope: 'future'
    });
    await load();
  } catch (e) {
    rowError.value = {
      ...rowError.value,
      [id]: e.response?.data?.error?.message || 'Could not forfeit.'
    };
  } finally {
    rowBusy.value = { ...rowBusy.value, [id]: false };
  }
}

async function extendTemporary(it) {
  const id = it.standingAssignmentId;
  rowError.value = { ...rowError.value, [id]: '' };
  rowBusy.value = { ...rowBusy.value, [id]: true };
  try {
    await api.post(`/office-slots/${it.officeLocationId}/assignments/${id}/extend-temporary`, {});
    await load();
  } catch (e) {
    rowError.value = {
      ...rowError.value,
      [id]: e.response?.data?.error?.message || 'Could not extend.'
    };
  } finally {
    rowBusy.value = { ...rowBusy.value, [id]: false };
  }
}

function logout() {
  authStore.logout();
}

let pollTimer = null;
onMounted(() => {
  load();
  pollTimer = setInterval(load, 45000);
});

onUnmounted(() => {
  officeMandatoryBlocking.value = false;
  if (pollTimer) clearInterval(pollTimer);
  if (typeof document !== 'undefined') document.body.style.overflow = '';
});

watch(
  () => authStore.user?.id,
  () => {
    loadGateFromLs();
    load();
  }
);
</script>

<style scoped>
.office-mandatory-root {
  position: fixed;
  inset: 0;
  z-index: 9000;
  display: flex;
  align-items: stretch;
  justify-content: center;
  padding: 0;
  font-family: inherit;
}

.office-mandatory-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.88);
  backdrop-filter: blur(2px);
}

.office-mandatory-panel {
  position: relative;
  z-index: 1;
  flex: 1;
  overflow: auto;
  display: flex;
  justify-content: center;
  padding: 24px 16px 48px;
}

.office-mandatory-inner {
  width: min(720px, 100%);
  background: var(--bg, #fff);
  color: var(--text-primary, #0f172a);
  border-radius: 16px;
  padding: 22px 20px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
}

.office-mandatory-title {
  margin: 0 0 10px 0;
  font-size: 1.35rem;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.office-mandatory-lead {
  margin: 0 0 18px 0;
  line-height: 1.5;
  font-size: 0.95rem;
  color: var(--text-secondary, #475569);
}

.muted {
  color: var(--text-secondary, #64748b);
  font-size: 0.9rem;
}

.office-mandatory-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.office-mandatory-card {
  border: 1px solid var(--border, rgba(0, 0, 0, 0.1));
  border-radius: 12px;
  padding: 12px 14px;
  background: var(--bg-alt, #f8fafc);
}

.office-mandatory-when {
  font-weight: 700;
  font-size: 1rem;
}

.office-mandatory-where {
  margin-top: 2px;
}

.office-mandatory-badge {
  margin-top: 6px;
  font-size: 0.85rem;
  color: #b45309;
  font-weight: 600;
}

.office-mandatory-actions {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.office-mandatory-book-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  flex: 1;
  min-width: 200px;
}

.office-mandatory-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-secondary, #64748b);
}

.office-mandatory-select {
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid var(--border, #cbd5e1);
  background: var(--bg, #fff);
  font-size: 0.9rem;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 0.85rem;
}

.office-mandatory-error {
  color: #b91c1c;
  font-size: 0.88rem;
  margin: 6px 0;
}

.office-mandatory-foot-actions {
  margin-top: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-start;
}

.office-mandatory-foot {
  margin: 0;
  font-size: 0.85rem;
}

.btn-link {
  background: none;
  border: none;
  padding: 0;
  color: var(--link-color, #2563eb);
  cursor: pointer;
  text-decoration: underline;
  font: inherit;
}
</style>
