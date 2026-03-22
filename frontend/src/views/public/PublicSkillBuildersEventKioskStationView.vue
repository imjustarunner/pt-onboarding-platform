<template>
  <div class="sbe-station">
    <div v-if="!token" class="sbe-station-card">
      <p class="error-box">This station session expired or was not started here.</p>
      <router-link class="btn btn-primary" :to="entryPath">Enter station PIN</router-link>
    </div>
    <div v-else class="sbe-station-inner">
      <header class="sbe-station-head">
        <h1 class="sbe-station-title">{{ eventTitle }}</h1>
        <p class="muted small">Skill Builders time clock</p>
      </header>

      <div v-if="loadError" class="error-box">{{ loadError }}</div>

      <div v-else-if="step === 1" class="sbe-station-card">
        <h2 class="sbe-h2">Clock in or clock out?</h2>
        <div class="sbe-actions">
          <button type="button" class="btn btn-primary sbe-big" @click="startFlow('in')">Clock in</button>
          <button type="button" class="btn btn-secondary sbe-big" @click="startFlow('out')">Clock out</button>
        </div>
      </div>

      <div v-else-if="step === 2 && action === 'in'" class="sbe-station-card">
        <h2 class="sbe-h2">Session (optional)</h2>
        <p class="muted small">Link this punch to a scheduled occurrence, or leave blank.</p>
        <select v-model.number="sessionId" class="input">
          <option :value="0">No specific session</option>
          <option v-for="s in sessionsList" :key="s.id" :value="s.id">
            {{ formatSessionOpt(s) }}
          </option>
        </select>
        <div class="sbe-nav">
          <button type="button" class="btn btn-secondary" @click="step = 1">Back</button>
          <button type="button" class="btn btn-primary" @click="step = 3">Next</button>
        </div>
      </div>

      <div v-else-if="step === 3 && action === 'in'" class="sbe-station-card">
        <h2 class="sbe-h2">Client (optional)</h2>
        <select v-model.number="clientId" class="input">
          <option :value="0">Not tied to a client</option>
          <option v-for="c in roster.clients" :key="c.id" :value="c.id">
            {{ c.initials || c.identifier_code || `Client ${c.id}` }}
          </option>
        </select>
        <div class="sbe-nav">
          <button type="button" class="btn btn-secondary" @click="step = 2">Back</button>
          <button type="button" class="btn btn-primary" @click="step = 4">Next</button>
        </div>
      </div>

      <div v-else-if="step === 4 || (step === 2 && action === 'out')" class="sbe-station-card">
        <h2 class="sbe-h2">{{ action === 'in' ? 'Who is clocking in?' : 'Who is clocking out?' }}</h2>
        <p class="muted small">Enter the 4-digit kiosk PIN from your profile, or tap your name.</p>
        <div v-if="formError" class="error-box">{{ formError }}</div>
        <div class="sbe-pin-row">
          <input
            v-model="staffPin"
            class="input sbe-pin"
            type="password"
            inputmode="numeric"
            maxlength="4"
            placeholder="PIN"
            :disabled="working"
          />
          <button type="button" class="btn btn-primary" :disabled="working || staffPin.length !== 4" @click="submitPin">
            {{ working ? '…' : 'Go' }}
          </button>
        </div>
        <div v-if="roster.providers.length" class="sbe-grid">
          <button
            v-for="p in roster.providers"
            :key="p.id"
            type="button"
            class="sbe-pick"
            :disabled="working"
            @click="pickProvider(p)"
          >
            {{ p.display_name }}
          </button>
        </div>
        <div class="sbe-nav">
          <button type="button" class="btn btn-secondary" @click="goBackFromIdentify">Back</button>
          <router-link class="btn btn-link" :to="entryPath">New station PIN</router-link>
        </div>
      </div>

      <div v-else-if="step === 5" class="sbe-station-card sbe-done">
        <h2 class="sbe-h2">{{ doneTitle }}</h2>
        <p class="muted">{{ doneDetail }}</p>
        <button type="button" class="btn btn-primary" @click="resetFlow">Done</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';

const route = useRoute();
const router = useRouter();

const slug = computed(() => String(route.params.organizationSlug || '').trim());
const eventId = computed(() => Number(route.params.eventId));

const token = ref('');
const eventTitle = ref('Skill Builders event');
const loadError = ref('');
const roster = ref({ providers: [], clients: [] });
const sessions = ref([]);

const step = ref(1);
const action = ref('in');
const sessionId = ref(0);
const clientId = ref(0);
const staffPin = ref('');
const formError = ref('');
const working = ref(false);
const doneTitle = ref('');
const doneDetail = ref('');

const entryPath = computed(() => `/${slug.value}/kiosk`);

function storageKey() {
  return `skillBuildersEventKiosk:${slug.value}`;
}

function readStoredSession() {
  try {
    const raw = sessionStorage.getItem(storageKey());
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o?.token || !o?.eventId) return null;
    if (Number(o.eventId) !== eventId.value) return null;
    return o;
  } catch {
    return null;
  }
}

function authHeaders() {
  return { Authorization: `Bearer ${token.value}` };
}

const todayYmd = () => new Date().toISOString().slice(0, 10);

function addDaysYmd(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const sessionsList = computed(() => {
  const list = Array.isArray(sessions.value) ? [...sessions.value] : [];
  return list.sort((a, b) => String(a.sessionDate).localeCompare(String(b.sessionDate)));
});

function formatSessionOpt(s) {
  const d = String(s.sessionDate || '').slice(0, 10);
  return `${d} · ${s.weekday} · ${formatHm(s.startTime)}–${formatHm(s.endTime)}`;
}

function formatHm(t) {
  return String(t || '').slice(0, 5) || '—';
}

async function loadAll() {
  loadError.value = '';
  if (!slug.value || !eventId.value) {
    loadError.value = 'Invalid link.';
    return;
  }
  const s = readStoredSession();
  if (!s) {
    token.value = '';
    return;
  }
  token.value = s.token;
  try {
    const [metaRes, rosterRes, sessRes] = await Promise.all([
      api.get(
        `/public/skill-builders/agency/${encodeURIComponent(slug.value.toLowerCase())}/kiosk/events/${eventId.value}/meta`,
        { headers: authHeaders(), skipGlobalLoading: true, skipAuthRedirect: true }
      ),
      api.get(
        `/public/skill-builders/agency/${encodeURIComponent(slug.value.toLowerCase())}/kiosk/events/${eventId.value}/roster`,
        { headers: authHeaders(), skipGlobalLoading: true, skipAuthRedirect: true }
      ),
      api.get(
        `/public/skill-builders/agency/${encodeURIComponent(slug.value.toLowerCase())}/kiosk/events/${eventId.value}/sessions`,
        {
          headers: authHeaders(),
          params: { from: todayYmd(), to: addDaysYmd(todayYmd(), 60) },
          skipGlobalLoading: true,
          skipAuthRedirect: true
        }
      )
    ]);
    eventTitle.value = metaRes.data?.eventTitle || 'Skill Builders event';
    roster.value = {
      providers: Array.isArray(rosterRes.data?.providers) ? rosterRes.data.providers : [],
      clients: Array.isArray(rosterRes.data?.clients) ? rosterRes.data.clients : []
    };
    sessions.value = Array.isArray(sessRes.data?.sessions) ? sessRes.data.sessions : [];
  } catch (e) {
    if (e.response?.status === 401) {
      sessionStorage.removeItem(storageKey());
      token.value = '';
      loadError.value = 'Session expired. Enter the station PIN again.';
      return;
    }
    loadError.value = e.response?.data?.error?.message || e.message || 'Failed to load event';
  }
}

function startFlow(dir) {
  action.value = dir;
  formError.value = '';
  staffPin.value = '';
  if (dir === 'out') {
    step.value = 2;
    sessionId.value = 0;
    clientId.value = 0;
  } else {
    step.value = 2;
    sessionId.value = 0;
    clientId.value = 0;
  }
}

function goBackFromIdentify() {
  formError.value = '';
  staffPin.value = '';
  if (action.value === 'out') step.value = 1;
  else if (step.value === 4) step.value = 3;
}

function resetFlow() {
  step.value = 1;
  action.value = 'in';
  sessionId.value = 0;
  clientId.value = 0;
  staffPin.value = '';
  formError.value = '';
  doneTitle.value = '';
  doneDetail.value = '';
}

async function submitPin() {
  const pin = staffPin.value.replace(/\D/g, '').slice(0, 4);
  if (pin.length !== 4) return;
  formError.value = '';
  working.value = true;
  try {
    const res = await api.post(
      `/public/skill-builders/agency/${encodeURIComponent(slug.value.toLowerCase())}/kiosk/events/${eventId.value}/identify`,
      { pin },
      { headers: authHeaders(), skipGlobalLoading: true, skipAuthRedirect: true }
    );
    const uid = Number(res.data?.userId);
    if (!uid) {
      formError.value = 'Could not identify user.';
      return;
    }
    await runClock(uid);
  } catch (e) {
    formError.value = e.response?.data?.error?.message || e.message || 'Identify failed';
  } finally {
    working.value = false;
  }
}

async function pickProvider(p) {
  await runClock(Number(p.id));
}

async function runClock(userId) {
  formError.value = '';
  working.value = true;
  try {
    if (action.value === 'in') {
      const body = {
        userId,
        sessionId: sessionId.value > 0 ? sessionId.value : undefined,
        clientId: clientId.value > 0 ? clientId.value : undefined
      };
      await api.post(
        `/public/skill-builders/agency/${encodeURIComponent(slug.value.toLowerCase())}/kiosk/events/${eventId.value}/clock-in`,
        body,
        { headers: authHeaders(), skipGlobalLoading: true, skipAuthRedirect: true }
      );
      doneTitle.value = 'Clocked in';
      doneDetail.value = 'Your time was recorded for this program event.';
    } else {
      await api.post(
        `/public/skill-builders/agency/${encodeURIComponent(slug.value.toLowerCase())}/kiosk/events/${eventId.value}/clock-out`,
        { userId },
        { headers: authHeaders(), skipGlobalLoading: true, skipAuthRedirect: true }
      );
      doneTitle.value = 'Clocked out';
      doneDetail.value = 'Your time was recorded. Payroll details may appear after processing.';
    }
    step.value = 5;
    return true;
  } catch (e) {
    formError.value = e.response?.data?.error?.message || e.message || 'Clock failed';
    return false;
  } finally {
    working.value = false;
  }
}

watch(
  () => [route.params.organizationSlug, route.params.eventId],
  () => {
    token.value = '';
    loadAll();
  }
);

onMounted(() => {
  loadAll();
});
</script>

<style scoped>
.sbe-station {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px 16px 48px;
}
.sbe-station-head {
  margin-bottom: 20px;
}
.sbe-station-title {
  margin: 0 0 4px;
  font-size: 1.35rem;
  font-weight: 800;
  color: var(--primary, #0f766e);
}
.sbe-station-card {
  background: var(--surface, #fff);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 14px;
  padding: 20px 18px;
  margin-bottom: 16px;
}
.sbe-h2 {
  margin: 0 0 12px;
  font-size: 1.1rem;
}
.sbe-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.sbe-big {
  padding: 14px 18px;
  font-size: 1.05rem;
}
.sbe-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-top: 16px;
}
.sbe-pin-row {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}
.sbe-pin {
  flex: 1;
  max-width: 200px;
  font-size: 1.2rem;
  letter-spacing: 0.15em;
  text-align: center;
}
.sbe-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 10px;
  margin-top: 16px;
}
.sbe-pick {
  padding: 12px 10px;
  border-radius: 10px;
  border: 1px solid var(--border, #e2e8f0);
  background: var(--surface-2, #f8fafc);
  font-weight: 700;
  cursor: pointer;
  text-align: center;
}
.sbe-pick:hover:not(:disabled) {
  border-color: var(--primary, #0f766e);
}
.sbe-done {
  text-align: center;
}
.muted {
  color: #64748b;
}
.small {
  font-size: 0.88rem;
}
.btn-link {
  background: none;
  border: none;
  color: var(--primary, #0f766e);
  text-decoration: underline;
  cursor: pointer;
  padding: 8px 0;
}
</style>
