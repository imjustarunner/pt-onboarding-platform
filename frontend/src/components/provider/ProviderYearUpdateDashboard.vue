<template>
  <div class="pyu" :style="brandStyle">
    <div class="pyu__bg" aria-hidden="true" />
    <div v-if="loading" class="pyu__loading">Loading your Year Update…</div>
    <div v-else-if="error" class="pyu__error">
      <p>{{ error }}</p>
      <button type="button" class="btn btn-secondary" @click="load">Retry</button>
    </div>
    <template v-else-if="payload">
      <header class="pyu__top">
        <div>
          <p class="pyu__eyebrow">{{ payload.agency?.name || 'School Year' }} · {{ payload.cycle?.schoolYear }}</p>
          <h1>Provider Year Update</h1>
          <p class="pyu__sub">Complete each section below. Progress is saved as you go.</p>
        </div>
        <div class="pyu__progress-wrap">
          <div class="pyu__progress-label">{{ progressPct }}% complete</div>
          <div class="pyu__progress-bar"><span :style="{ width: progressPct + '%' }" /></div>
          <p v-if="isFinalized" class="pyu__finalized">Completed {{ formatDt(payload.cycle?.finalizedAt) }}</p>
        </div>
      </header>

      <div class="pyu__layout">
        <nav class="pyu__nav" aria-label="Year update sections">
          <button
            v-for="meta in sectionMeta"
            :key="meta.key"
            type="button"
            class="pyu__nav-item"
            :class="{ active: activeSection === meta.key, done: sectionDone(meta.key) }"
            @click="activeSection = meta.key"
          >
            <span class="pyu__nav-dot" />
            <span>
              <strong>{{ meta.shortTitle }}</strong>
              <small>{{ meta.hint }}</small>
            </span>
          </button>
          <button
            v-if="!isFinalized"
            type="button"
            class="btn btn-primary pyu__finalize"
            :disabled="finalizeBusy || !allSectionsDone"
            @click="finalize"
          >
            {{ finalizeBusy ? 'Submitting…' : 'Mark Year Update complete' }}
          </button>
          <p v-if="!allSectionsDone && !isFinalized" class="muted tiny">Complete all sections to finalize.</p>
        </nav>

        <main class="pyu__main">
          <!-- Reminders -->
          <section v-if="activeSection === 'reminders'" class="pyu__panel">
            <h2>Step-by-Step Reminders</h2>
            <p class="muted">The school year is quickly approaching! Mark each item as reviewed or complete.</p>
            <div v-for="(item, idx) in reminderItems" :key="item.key" class="pyu__check-item">
              <div class="pyu__check-head">
                <strong>{{ idx + 1 }}. {{ item.title }}</strong>
                <span class="pill">{{ item.mode === 'reviewed' ? 'Review' : 'Complete' }}</span>
              </div>
              <p>{{ item.body }}</p>
              <div class="pyu__check-actions">
                <label v-if="item.mode === 'reviewed' || item.mode === 'complete'">
                  <input
                    type="checkbox"
                    :checked="item.reviewed || item.completed"
                    :disabled="isFinalized"
                    @change="toggleReminder(item, 'reviewed', $event.target.checked)"
                  />
                  Marked as reviewed
                </label>
                <label v-if="item.mode === 'complete'">
                  <input
                    type="checkbox"
                    :checked="item.completed"
                    :disabled="isFinalized"
                    @change="toggleReminder(item, 'completed', $event.target.checked)"
                  />
                  Marked complete
                </label>
              </div>
            </div>
            <div class="pyu__section-actions">
              <button type="button" class="btn btn-primary" :disabled="isFinalized || saving" @click="completeReminders">
                {{ remindersSectionComplete ? 'Reminders saved ✓' : 'Save & mark reminders complete' }}
              </button>
            </div>
          </section>

          <!-- School events -->
          <section v-else-if="activeSection === 'school_events'" class="pyu__panel">
            <h2>School Events</h2>
            <p class="muted">
              Check back-to-school dates for your schools. Add an event if you learn details. Sign up to staff events —
              time is compensated via the kiosk.
            </p>
            <div class="pyu__info">
              <strong>Kiosk check-in / out:</strong>
              <a :href="kioskUrl" target="_blank" rel="noopener">{{ kioskUrl }}</a>
            </div>

            <div v-for="school in eventsBySchool" :key="school.schoolOrganizationId" class="pyu__school-block">
              <div class="pyu__school-head">
                <h3>{{ school.schoolName }}</h3>
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  :disabled="isFinalized"
                  @click="openAddEvent(school)"
                >
                  + Add Event
                </button>
              </div>
              <div v-if="!(school.events || []).length" class="muted">No events listed yet for this school.</div>
              <ul v-else class="pyu__event-list">
                <li v-for="ev in school.events" :key="ev.id">
                  <div>
                    <strong>{{ ev.title || categoryLabel(ev.category || ev.schoolEventCategory) }}</strong>
                    <span class="muted"> · {{ formatEventWhen(ev) }}</span>
                    <div v-if="ev.category === 'back_to_school' || ev.schoolEventCategory === 'back_to_school'" class="tiny">
                      Back to School
                    </div>
                  </div>
                  <button
                    v-if="canSignUp(ev)"
                    type="button"
                    class="btn btn-primary btn-sm"
                    :disabled="isFinalized || signingUpId === ev.id"
                    @click="signUpForEvent(ev)"
                  >
                    {{ signingUpId === ev.id ? 'Signing up…' : 'Sign up' }}
                  </button>
                </li>
              </ul>
            </div>

            <div class="pyu__section-actions">
              <button type="button" class="btn btn-primary" :disabled="isFinalized || saving" @click="markSectionDone('school_events')">
                Mark events section complete
              </button>
            </div>
          </section>

          <!-- Materials -->
          <section v-else-if="activeSection === 'materials'" class="pyu__panel">
            <h2>Materials Request</h2>
            <p class="muted">Let us know if you need a school cart for back-to-school events. More material options may be added later.</p>
            <label class="pyu__check">
              <input v-model="materialsForm.need_school_cart" type="checkbox" :disabled="isFinalized" />
              I need a school cart
            </label>
            <label class="field">
              <span>Notes (optional)</span>
              <textarea
                v-model="materialsForm.materials_notes"
                rows="3"
                :disabled="isFinalized"
                placeholder="Anything else about materials…"
              />
            </label>
            <div class="pyu__section-actions">
              <button type="button" class="btn btn-primary" :disabled="isFinalized || saving" @click="saveMaterials">
                Save materials request
              </button>
            </div>
          </section>

          <!-- Schedule -->
          <section v-else-if="activeSection === 'provider_schedule'" class="pyu__panel">
            <h2>Provider Schedule</h2>
            <p class="muted">
              Review your days and clients at each school. Assume the same schools/days unless a change has been discussed.
              Request additional school availability below if you need more days.
            </p>
            <div v-if="!(schedule || []).length" class="muted">No active school assignments found.</div>
            <div v-for="school in schedule" :key="school.schoolOrganizationId" class="pyu__school-block">
              <h3>{{ school.schoolName }}</h3>
              <table class="pyu__sched-table">
                <thead>
                  <tr>
                    <th>Day</th>
                    <th>Slots</th>
                    <th>Clients</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="d in school.days || []" :key="d.assignmentId || d.dayOfWeek">
                    <td>{{ d.dayOfWeek }}</td>
                    <td>{{ d.slotsTotal ?? '—' }}</td>
                    <td>{{ d.clientCount == null ? '—' : d.clientCount }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="pyu__avail">
              <h3>Request additional school days</h3>
              <p class="muted tiny">Uses the same Additional School Hours request as My Dashboard.</p>
              <button
                type="button"
                class="btn btn-secondary"
                :disabled="isFinalized"
                @click="showAvailability = !showAvailability"
              >
                {{ showAvailability ? 'Hide availability form' : 'Open additional school availability' }}
              </button>
              <AdditionalAvailabilitySubmit v-if="showAvailability" class="pyu__avail-embed" />
            </div>

            <label class="pyu__check" style="margin-top: 16px;">
              <input v-model="scheduleConfirmed" type="checkbox" :disabled="isFinalized" />
              I reviewed my schools, days, and clients — this looks accurate (or I’ve requested needed changes).
            </label>
            <div class="pyu__section-actions">
              <button
                type="button"
                class="btn btn-primary"
                :disabled="isFinalized || saving || !scheduleConfirmed"
                @click="saveScheduleSection"
              >
                Mark schedule section complete
              </button>
            </div>
          </section>

          <p v-if="saveFlash" class="success-banner">{{ saveFlash }}</p>
          <p v-if="actionError" class="error-banner">{{ actionError }}</p>
        </main>
      </div>
    </template>

    <PostSchoolEventModal
      v-if="addEventSchool"
      :school-organization-id="addEventSchool.schoolOrganizationId"
      :school-name="addEventSchool.schoolName"
      :agency-id="resolvedAgencyId"
      initial-category="back_to_school"
      :locked-category="true"
      @close="addEventSchool = null"
      @saved="onEventSaved"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { SECTION_META } from '../../utils/providerYearUpdate';
import AdditionalAvailabilitySubmit from '../AdditionalAvailabilitySubmit.vue';
import PostSchoolEventModal from '../school/PostSchoolEventModal.vue';

const props = defineProps({
  mode: { type: String, default: 'provider' }, // provider | token | admin
  token: { type: String, default: '' },
  agencyId: { type: [Number, String], default: null },
  initialSection: { type: String, default: '' },
});

const emit = defineEmits(['requires-login', 'loaded']);

const route = useRoute();
const router = useRouter();
const agencyStore = useAgencyStore();

const loading = ref(true);
const saving = ref(false);
const finalizeBusy = ref(false);
const error = ref('');
const actionError = ref('');
const saveFlash = ref('');
const payload = ref(null);
const activeSection = ref('reminders');
const sectionMeta = SECTION_META;
const materialsForm = reactive({ need_school_cart: false, materials_notes: '' });
const scheduleConfirmed = ref(false);
const showAvailability = ref(false);
const addEventSchool = ref(null);
const signingUpId = ref(0);
const reminderItems = ref([]);

const resolvedAgencyId = computed(() => {
  return (
    Number(props.agencyId) ||
    Number(payload.value?.cycle?.agencyId) ||
    Number(agencyStore.currentAgencyId || agencyStore.currentAgency?.id) ||
    0
  );
});

const brandStyle = computed(() => ({
  '--pyu-primary': '#0c4a6e',
  '--pyu-accent': '#c2410c',
}));

const isFinalized = computed(() => payload.value?.cycle?.status === 'finalized');
const schedule = computed(() => payload.value?.schedule || []);
const eventsBySchool = computed(() => payload.value?.eventsBySchool || []);

const kioskUrl = computed(() => {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const slug = payload.value?.agency?.slug || 'itsco';
  return `${origin}/${slug}/school-events/kiosk`;
});

const progressPct = computed(() => {
  const sections = payload.value?.sections || [];
  if (!sections.length) return 0;
  const done = sections.filter((s) => s.reviewed || s.completed).length;
  return Math.round((done / sections.length) * 100);
});

const allSectionsDone = computed(() => {
  const sections = payload.value?.sections || [];
  return sections.length > 0 && sections.every((s) => s.reviewed || s.completed);
});

const remindersSectionComplete = computed(() => sectionDone('reminders'));

function sectionDone(key) {
  const s = (payload.value?.sections || []).find((x) => x.sectionKey === key);
  return Boolean(s?.reviewed || s?.completed);
}

function formatDt(v) {
  if (!v) return '';
  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v);
  }
}

function formatEventWhen(ev) {
  const start = ev.startsAt || ev.starts_at;
  if (!start) return 'Date TBD';
  try {
    return new Date(start).toLocaleString();
  } catch {
    return String(start);
  }
}

function categoryLabel(c) {
  const map = {
    back_to_school: 'Back to School',
    open_house: 'Open House',
    first_day: 'First Day of School',
  };
  return map[String(c || '').toLowerCase()] || c || 'School event';
}

function canSignUp(ev) {
  const cat = String(ev.category || ev.schoolEventCategory || '').toLowerCase();
  if (['holiday', 'day_off', 'first_day', 'fall_check_in', 'spring'].includes(cat)) return false;
  return Boolean(ev.id && (ev.staffingEnabled || ev.staffing_enabled || cat === 'back_to_school' || true));
}

function applyPayload(data) {
  payload.value = data;
  const rem = data.reminders?.items || data.reminderDefaults || [];
  reminderItems.value = rem.map((item) => ({
    key: item.key,
    title: item.title,
    body: item.body,
    mode: item.mode || 'complete',
    reviewed: Boolean(item.reviewed),
    completed: Boolean(item.completed),
  }));
  const mat = data.materials || {};
  materialsForm.need_school_cart = Boolean(mat.need_school_cart || mat.needSchoolCart);
  materialsForm.materials_notes = mat.materials_notes || mat.materialsNotes || '';
  const schedData = (data.sections || []).find((s) => s.sectionKey === 'provider_schedule')?.data;
  scheduleConfirmed.value = Boolean(schedData?.confirmed);
  emit('loaded', data);
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    if (props.mode === 'token' && props.token) {
      const res = await api.get(`/public/provider-year-update/${encodeURIComponent(props.token)}`);
      if (res.data?.requiresLogin) {
        emit('requires-login', res.data);
        error.value = res.data.loginHint || 'Sign in to continue.';
        return;
      }
      applyPayload(res.data);
    } else {
      const agencyId = resolvedAgencyId.value;
      if (!agencyId) throw new Error('Agency context required');
      const res = await api.get('/provider-year-update/me', { params: { agencyId } });
      if (res.data?.available === false) {
        error.value =
          res.data.reason === 'not_pushed'
            ? 'Provider Year Update has not been pushed yet.'
            : 'No school assignments found for your account.';
        return;
      }
      applyPayload(res.data);
    }
    const fromQuery = String(props.initialSection || route.query.section || '').trim();
    if (fromQuery && SECTION_META.some((m) => m.key === fromQuery)) {
      activeSection.value = fromQuery;
    }
  } catch (e) {
    if (e?.response?.data?.wrongUser) {
      error.value = e.response.data.error?.message || 'This link belongs to a different provider.';
    } else {
      error.value = e?.response?.data?.error?.message || e.message || 'Failed to load';
    }
  } finally {
    loading.value = false;
  }
}

async function saveSection(sectionKey, data, { reviewed = true, completed = true } = {}) {
  saving.value = true;
  actionError.value = '';
  saveFlash.value = '';
  try {
    const agencyId = resolvedAgencyId.value;
    let res;
    if (props.mode === 'token' && props.token) {
      res = await api.put(`/public/provider-year-update/${encodeURIComponent(props.token)}/sections/${sectionKey}`, {
        data,
        reviewed,
        completed,
      });
    } else {
      res = await api.put(`/provider-year-update/me/sections/${sectionKey}`, {
        agencyId,
        data,
        reviewed,
        completed,
      });
    }
    if (res.data?.sections) {
      payload.value = { ...payload.value, sections: res.data.sections };
    }
    saveFlash.value = 'Saved.';
    setTimeout(() => {
      saveFlash.value = '';
    }, 2000);
  } catch (e) {
    actionError.value = e?.response?.data?.error?.message || e.message || 'Save failed';
  } finally {
    saving.value = false;
  }
}

async function toggleReminder(item, field, checked) {
  item[field] = checked;
  if (field === 'completed' && checked) item.reviewed = true;
  await saveSection(
    'reminders',
    { items: reminderItems.value },
    { reviewed: false, completed: false }
  );
}

async function completeReminders() {
  const items = reminderItems.value;
  for (const item of items) {
    if (item.mode === 'reviewed' && !item.reviewed && !item.completed) {
      actionError.value = `Please review: ${item.title}`;
      return;
    }
    if (item.mode === 'complete' && !item.completed) {
      actionError.value = `Please complete: ${item.title}`;
      return;
    }
  }
  await saveSection('reminders', { items }, { reviewed: true, completed: true });
}

async function saveMaterials() {
  await saveSection(
    'materials',
    {
      need_school_cart: Boolean(materialsForm.need_school_cart),
      materials_notes: String(materialsForm.materials_notes || ''),
    },
    { reviewed: true, completed: true }
  );
}

async function markSectionDone(key) {
  const existing = (payload.value?.sections || []).find((s) => s.sectionKey === key)?.data || {};
  await saveSection(key, existing, { reviewed: true, completed: true });
}

async function saveScheduleSection() {
  await saveSection(
    'provider_schedule',
    { confirmed: true, confirmedAt: new Date().toISOString() },
    { reviewed: true, completed: true }
  );
}

function openAddEvent(school) {
  addEventSchool.value = school;
}

async function onEventSaved() {
  addEventSchool.value = null;
  await load();
}

async function signUpForEvent(ev) {
  signingUpId.value = ev.id;
  actionError.value = '';
  try {
    const sessions = ev.sessions || ev.sessionDates || ev.session_dates || [];
    const sessionDateId =
      sessions[0]?.sessionDateId ||
      sessions[0]?.id ||
      ev.sessionDateId ||
      ev.primarySessionDateId ||
      null;
    if (!sessionDateId) {
      // Open staffing panel path — try request without session if API allows, else guide user
      actionError.value =
        'Open this event from your school portal Events tab to pick a session and sign up.';
      return;
    }
    await api.post(
      `/company-events/${ev.id}/session-requests`,
      {
        agencyId: resolvedAgencyId.value,
        sessionDateId,
        requestType: 'regular',
      },
      { skipGlobalLoading: true }
    );
    saveFlash.value = 'Sign-up submitted. An admin will review it.';
    await load();
  } catch (e) {
    actionError.value = e?.response?.data?.error?.message || e.message || 'Could not sign up';
  } finally {
    signingUpId.value = 0;
  }
}

async function finalize() {
  finalizeBusy.value = true;
  actionError.value = '';
  try {
    let res;
    if (props.mode === 'token' && props.token) {
      res = await api.post(`/public/provider-year-update/${encodeURIComponent(props.token)}/finalize`);
    } else {
      res = await api.post('/provider-year-update/me/finalize', {
        agencyId: resolvedAgencyId.value,
      });
    }
    applyPayload(res.data);
    saveFlash.value = 'Year Update marked complete. Thank you!';
  } catch (e) {
    actionError.value = e?.response?.data?.error?.message || e.message || 'Could not finalize';
  } finally {
    finalizeBusy.value = false;
  }
}

watch(
  () => route.query.section,
  (s) => {
    const key = String(s || '').trim();
    if (key && SECTION_META.some((m) => m.key === key)) activeSection.value = key;
  }
);

watch(activeSection, (key) => {
  if (route.query.section !== key && props.mode !== 'token') {
    router.replace({ query: { ...route.query, section: key } }).catch(() => {});
  }
});

onMounted(load);

defineExpose({ load, reload: load });
</script>

<style scoped>
.pyu {
  position: relative;
  min-height: 70vh;
  color: #0f172a;
  --pyu-primary: #0c4a6e;
}
.pyu__bg {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(248, 250, 252, 0.92), rgba(241, 245, 249, 0.96)),
    url('/assets/school-reinit/itsco-school-update-background.png') center / cover no-repeat;
  z-index: 0;
  pointer-events: none;
}
.pyu__loading,
.pyu__error,
.pyu__top,
.pyu__layout {
  position: relative;
  z-index: 1;
}
.pyu__top {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
  padding: 20px 20px 8px;
  max-width: 1100px;
  margin: 0 auto;
}
.pyu__eyebrow {
  margin: 0;
  font-size: 0.8rem;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.pyu__top h1 {
  margin: 4px 0;
  color: var(--pyu-primary);
  font-size: 1.75rem;
}
.pyu__sub {
  margin: 0;
  color: #475569;
  max-width: 36rem;
}
.pyu__progress-wrap {
  min-width: 180px;
}
.pyu__progress-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--pyu-primary);
}
.pyu__progress-bar {
  height: 8px;
  background: #e2e8f0;
  border-radius: 999px;
  overflow: hidden;
  margin-top: 6px;
}
.pyu__progress-bar span {
  display: block;
  height: 100%;
  background: var(--pyu-primary);
}
.pyu__finalized {
  margin: 6px 0 0;
  font-size: 0.8rem;
  color: #166534;
}
.pyu__layout {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: 18px;
  max-width: 1100px;
  margin: 0 auto;
  padding: 12px 20px 40px;
}
.pyu__nav {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pyu__nav-item {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  text-align: left;
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 12px;
  padding: 10px 12px;
  cursor: pointer;
}
.pyu__nav-item.active {
  border-color: var(--pyu-primary);
  box-shadow: 0 0 0 1px var(--pyu-primary);
}
.pyu__nav-item.done .pyu__nav-dot {
  background: #16a34a;
}
.pyu__nav-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #cbd5e1;
  margin-top: 4px;
  flex-shrink: 0;
}
.pyu__nav-item strong {
  display: block;
  font-size: 0.9rem;
}
.pyu__nav-item small {
  color: #64748b;
  font-size: 0.75rem;
}
.pyu__finalize {
  margin-top: 10px;
}
.pyu__main {
  min-width: 0;
}
.pyu__panel {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 18px 20px;
  box-shadow: 0 2px 12px rgba(15, 23, 42, 0.05);
}
.pyu__panel h2 {
  margin: 0 0 6px;
  color: var(--pyu-primary);
}
.pyu__check-item {
  border-top: 1px solid #f1f5f9;
  padding: 14px 0;
}
.pyu__check-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
  margin-bottom: 6px;
}
.pyu__check-item p {
  margin: 0 0 10px;
  line-height: 1.45;
  color: #334155;
}
.pyu__check-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  font-size: 0.9rem;
}
.pyu__section-actions {
  margin-top: 16px;
  display: flex;
  gap: 10px;
}
.pyu__info {
  background: #f8fafc;
  border-radius: 10px;
  padding: 10px 12px;
  margin: 12px 0;
  font-size: 0.9rem;
}
.pyu__info a {
  color: var(--pyu-accent, #c2410c);
  word-break: break-all;
}
.pyu__school-block {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px 14px;
  margin: 12px 0;
}
.pyu__school-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.pyu__school-head h3,
.pyu__school-block h3 {
  margin: 0;
  font-size: 1.05rem;
}
.pyu__event-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.pyu__event-list li {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
  padding: 8px 0;
  border-top: 1px solid #f1f5f9;
}
.pyu__sched-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}
.pyu__sched-table th,
.pyu__sched-table td {
  text-align: left;
  padding: 6px 8px;
  border-bottom: 1px solid #f1f5f9;
}
.pyu__check {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin: 10px 0;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 12px 0;
}
.field textarea {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
}
.pill {
  font-size: 0.7rem;
  font-weight: 600;
  background: #ffedd5;
  color: #9a3412;
  padding: 2px 8px;
  border-radius: 999px;
}
.pyu__avail {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid #e2e8f0;
}
.pyu__avail-embed {
  margin-top: 12px;
}
.success-banner {
  margin-top: 12px;
  background: #dcfce7;
  color: #166534;
  padding: 8px 10px;
  border-radius: 8px;
}
.error-banner,
.pyu__error {
  margin-top: 12px;
  background: #fee2e2;
  color: #991b1b;
  padding: 10px 12px;
  border-radius: 8px;
}
.muted { color: #64748b; }
.tiny { font-size: 0.8rem; }
@media (max-width: 800px) {
  .pyu__layout {
    grid-template-columns: 1fr;
  }
}
</style>
