<template>
  <div class="sbpd">
    <div v-if="!Number.isFinite(agencyNum) || agencyNum <= 0" class="pch-muted">Agency is required.</div>
    <div v-else-if="!Number.isFinite(orgNum) || orgNum <= 0" class="pch-muted">Program organization is required.</div>
    <template v-else>
      <p class="pch-muted sbpd-lead">
        <strong>Upload on this screen</strong> (Step 1) goes into the <strong>program library</strong> — one pool for the
        whole Skill Builders program. Then attach PDFs to sessions from <strong>Step 2 below</strong>, or open any
        nested event in the portal and use <strong>Materials</strong> (same library) or jump from <strong>Schedule</strong>
        to Materials.
      </p>

      <section class="sbpd-card sbpd-card-upload">
        <div class="sbpd-step">Step 1</div>
        <h3 class="sbpd-card-title">Upload PDFs to this program</h3>
        <p class="pch-muted small sbpd-card-desc">
          This is where files are added. Optional title helps you pick the right file when attaching to a date/session.
          Use <strong>Activities</strong> on each PDF to define what can be checked in Clinical Aid when that file is the
          session curriculum.
        </p>
        <label class="sbpd-label">Title (shown in attach menus)</label>
        <input
          v-model="libraryUploadTitle"
          type="text"
          class="input sbpd-select"
          maxlength="255"
          placeholder="e.g. Week 3 — Social skills handout"
          :disabled="libraryUploading"
        />
        <input
          ref="fileInput"
          type="file"
          accept="application/pdf"
          class="sbpd-hidden-file"
          @change="onLibraryFile"
        />
        <div class="sbpd-upload-actions">
          <button
            type="button"
            class="btn btn-primary"
            :disabled="libraryUploading"
            @click="triggerLibraryPick"
          >
            {{ libraryUploading ? 'Uploading…' : 'Upload PDF to program library' }}
          </button>
        </div>
        <p class="pch-muted small sbpd-hint">Leave title blank to use the file name in menus.</p>
        <div v-if="libraryLoading" class="pch-muted small sbpd-lib-status">Loading library…</div>
        <ul v-else-if="libraryDocs.length" class="sbpd-lib-list">
            <li v-for="d in libraryDocs" :key="d.id" class="sbpd-lib-item">
              <div class="sbpd-lib-main">
                <template v-if="editingDocId === d.id">
                  <input
                    v-model="editTitleDraft"
                    type="text"
                    class="input input-sm sbpd-edit-title"
                    maxlength="255"
                    @keydown.enter.prevent="saveDocTitle(d)"
                  />
                  <div class="sbpd-lib-edit-actions">
                    <button type="button" class="btn btn-primary btn-sm" :disabled="titleSavingId === d.id" @click="saveDocTitle(d)">
                      {{ titleSavingId === d.id ? '…' : 'Save' }}
                    </button>
                    <button type="button" class="btn btn-link btn-sm" @click="cancelEditTitle">Cancel</button>
                  </div>
                </template>
                <template v-else>
                  <span class="sbpd-lib-name">{{ docDisplayLabel(d) }}</span>
                  <span v-if="d.displayTitle" class="sbpd-lib-file muted small">{{ d.originalFilename }}</span>
                  <div class="sbpd-lib-row-actions">
                    <button type="button" class="btn btn-link btn-sm" @click="openLibraryActivities(d)">Activities</button>
                    <button type="button" class="btn btn-link btn-sm" @click="startEditTitle(d)">Rename</button>
                    <button
                      type="button"
                      class="btn btn-link btn-sm sbpd-lib-del"
                      :disabled="libraryDeletingId === d.id"
                      @click="deleteLibraryDoc(d)"
                    >
                      {{ libraryDeletingId === d.id ? '…' : 'Remove' }}
                    </button>
                  </div>
                </template>
              </div>
            </li>
          </ul>
        <p v-else class="pch-muted small sbpd-lib-status">No PDFs in this program yet — use the upload button above.</p>
      </section>

      <section class="sbpd-card sbpd-card-attach">
        <div class="sbpd-step">Step 2</div>
        <h3 class="sbpd-card-title">Attach to a nested event session</h3>
        <p class="pch-muted small sbpd-card-desc">
          Pick the company event, then the session (date and time in one list — multiple slots on the same day appear as
          separate rows), then a document from the program library. You can do the same thing from the event portal’s
          <strong>Materials</strong> section instead — one shared library.
        </p>

        <label class="sbpd-label">Nested program event</label>
        <select v-model="selectedEventId" class="input sbpd-select" :disabled="eventsLoading">
          <option :value="null">{{ eventsLoading ? 'Loading…' : 'Select a program event' }}</option>
          <option v-for="ev in programEvents" :key="ev.id" :value="ev.id">{{ ev.title || `Event #${ev.id}` }}</option>
        </select>
        <p v-if="eventsError" class="pch-error sbpd-flash">{{ eventsError }}</p>

        <template v-if="selectedEventId">
          <div v-if="sessionsLoading" class="pch-muted small">Loading sessions…</div>
          <template v-else-if="sortedSessions.length">
            <label class="sbpd-label">Session</label>
            <select v-model="selectedSessionId" class="input sbpd-select">
              <option :value="null">Select date and time</option>
              <option v-for="s in sortedSessions" :key="s.id" :value="s.id">
                {{ formatSessionLabel(s) }}
              </option>
            </select>

            <label class="sbpd-label">Program document</label>
            <select v-model="selectedLibraryId" class="input sbpd-select" :disabled="!libraryDocs.length">
              <option :value="null">{{ libraryDocs.length ? 'Select PDF' : 'Upload a PDF to the library first' }}</option>
              <option v-for="d in libraryDocs" :key="`pick-${d.id}`" :value="d.id">{{ docDisplayLabel(d) }}</option>
            </select>

            <div class="sbpd-actions">
              <button
                type="button"
                class="btn btn-primary btn-sm"
                :disabled="attachBusy || !selectedSessionId || !selectedLibraryId"
                @click="attachToSession"
              >
                {{ attachBusy ? 'Attaching…' : 'Attach to session' }}
              </button>
              <button
                v-if="selectedSessionId"
                type="button"
                class="btn btn-secondary btn-sm"
                @click="activitiesModalOpen = true"
              >
                View activities
              </button>
            </div>
            <p v-if="selectedSessionId" class="pch-muted small sbpd-act-hint">
              Session activities define the checklist for Clinical Aid (H2014). Only activities you check are included in the
              generated note.
            </p>
            <p v-if="attachFlash" class="sbpd-flash sbpd-flash-ok" role="status">{{ attachFlash }}</p>
            <p v-if="attachError" class="sbpd-flash pch-error">{{ attachError }}</p>
          </template>
          <p v-else class="pch-muted small">No materialized sessions for this event yet.</p>
        </template>
        <p v-else class="pch-muted small sbpd-pick-event-hint">
          Choose a nested program event here, or open that event and use <strong>Materials</strong> to attach the same
          library PDFs.
        </p>
      </section>
    </template>

    <SkillBuildersSessionActivitiesModal
      :show="libraryActivitiesModalOpen && libraryActivitiesDocId > 0"
      :agency-id="agencyNum"
      :program-organization-id="orgNum"
      :program-document-id="libraryActivitiesDocId"
      :document-label="libraryActivitiesDocLabel"
      :can-manage="canManageSessionActivities"
      @close="closeLibraryActivities"
    />
    <SkillBuildersSessionActivitiesModal
      :show="activitiesModalOpen && !!selectedSessionId && !!selectedEventId"
      :agency-id="agencyNum"
      :event-id="Number(selectedEventId) || 0"
      :session-id="Number(selectedSessionId) || 0"
      :session-label="activitiesSessionLabelText"
      :can-manage="canManageSessionActivities"
      @close="activitiesModalOpen = false"
    />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import SkillBuildersSessionActivitiesModal from '../skillBuilders/SkillBuildersSessionActivitiesModal.vue';

const authStore = useAuthStore();

const props = defineProps({
  agencyId: { type: [Number, String], required: true },
  organizationId: { type: [Number, String], required: true }
});

const agencyNum = computed(() => Number(props.agencyId));
const orgNum = computed(() => Number(props.organizationId));

const eventsLoading = ref(false);
const eventsError = ref('');
const programEvents = ref([]);
const selectedEventId = ref(null);

const sessionsLoading = ref(false);
const sessions = ref([]);
const selectedSessionId = ref(null);

const libraryLoading = ref(false);
const libraryDocs = ref([]);
const libraryUploading = ref(false);
const libraryUploadTitle = ref('');
const libraryDeletingId = ref(null);
const fileInput = ref(null);
const editingDocId = ref(null);
const editTitleDraft = ref('');
const titleSavingId = ref(null);

const selectedLibraryId = ref(null);
const attachBusy = ref(false);
const attachFlash = ref('');
const attachError = ref('');
const activitiesModalOpen = ref(false);
const libraryActivitiesModalOpen = ref(false);
const libraryActivitiesDocId = ref(0);
const libraryActivitiesDocLabel = ref('');

const canManageSessionActivities = computed(() => {
  const r = String(authStore.user?.role || '').toLowerCase();
  if (['super_admin', 'admin', 'staff', 'support'].includes(r)) return true;
  if (
    authStore.user?.has_skill_builder_coordinator_access === true ||
    authStore.user?.has_skill_builder_coordinator_access === 1 ||
    String(authStore.user?.has_skill_builder_coordinator_access || '').toLowerCase() === 'true'
  ) {
    return true;
  }
  return ['provider', 'provider_plus', 'intern', 'intern_plus', 'clinical_practice_assistant'].includes(r);
});

/** All sessions for the selected event, ordered by calendar date then start time (multiple slots per day stay distinct). */
const sortedSessions = computed(() => {
  const list = [...sessions.value];
  return list.sort((a, b) => {
    const da = String(a.sessionDate || a.session_date || '').slice(0, 10);
    const db = String(b.sessionDate || b.session_date || '').slice(0, 10);
    if (da !== db) return da.localeCompare(db);
    const ta = String(a.startTime || a.start_time || '').slice(0, 8);
    const tb = String(b.startTime || b.start_time || '').slice(0, 8);
    if (ta !== tb) return ta.localeCompare(tb);
    return Number(a.id) - Number(b.id);
  });
});

async function loadProgramEvents() {
  eventsError.value = '';
  programEvents.value = [];
  const aid = agencyNum.value;
  const oid = orgNum.value;
  if (!Number.isFinite(aid) || aid <= 0 || !Number.isFinite(oid) || oid <= 0) return;
  eventsLoading.value = true;
  try {
    const res = await api.get('/availability/admin/program-company-events', {
      params: { agencyId: aid, organizationId: oid },
      skipGlobalLoading: true
    });
    programEvents.value = Array.isArray(res.data?.events) ? res.data.events : [];
  } catch (e) {
    eventsError.value = e.response?.data?.error?.message || e.message || 'Failed to load events';
    programEvents.value = [];
  } finally {
    eventsLoading.value = false;
  }
}

function ymdToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function ymdAddDays(ymd, delta) {
  const [y, mo, da] = String(ymd || '').split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, da));
  if (!Number.isFinite(dt.getTime())) return ymdToday();
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

async function loadSessionsForEvent() {
  sessions.value = [];
  selectedSessionId.value = null;
  const eid = selectedEventId.value;
  const aid = agencyNum.value;
  if (!eid || !Number.isFinite(aid) || aid <= 0) return;
  sessionsLoading.value = true;
  try {
    const ev = programEvents.value.find((x) => Number(x.id) === Number(eid));
    let from = ymdAddDays(ymdToday(), -7);
    let to = ymdAddDays(ymdToday(), 365);
    const sd = ev?.skillsGroupStartDate != null ? String(ev.skillsGroupStartDate).slice(0, 10) : '';
    const ed = ev?.skillsGroupEndDate != null ? String(ev.skillsGroupEndDate).slice(0, 10) : '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(sd) && sd < from) from = sd;
    if (/^\d{4}-\d{2}-\d{2}$/.test(ed) && ed > to) to = ed;
    const res = await api.get(`/skill-builders/events/${eid}/sessions`, {
      params: { agencyId: aid, from, to },
      skipGlobalLoading: true
    });
    sessions.value = Array.isArray(res.data?.sessions) ? res.data.sessions : [];
  } catch {
    sessions.value = [];
  } finally {
    sessionsLoading.value = false;
  }
}

async function loadLibrary() {
  libraryDocs.value = [];
  const pid = orgNum.value;
  const aid = agencyNum.value;
  if (!Number.isFinite(pid) || pid <= 0 || !Number.isFinite(aid) || aid <= 0) return;
  libraryLoading.value = true;
  try {
    const res = await api.get(`/skill-builders/program-organizations/${pid}/program-documents`, {
      params: { agencyId: aid },
      skipGlobalLoading: true
    });
    libraryDocs.value = Array.isArray(res.data?.documents) ? res.data.documents : [];
  } catch {
    libraryDocs.value = [];
  } finally {
    libraryLoading.value = false;
  }
}

function docDisplayLabel(d) {
  return String(d?.displayLabel || d?.originalFilename || '').trim() || 'Document';
}

function triggerLibraryPick() {
  fileInput.value?.click();
}

async function onLibraryFile(ev) {
  const input = ev.target;
  const f = input?.files?.[0];
  const pid = orgNum.value;
  const aid = agencyNum.value;
  if (!f || !Number.isFinite(pid) || pid <= 0 || !Number.isFinite(aid) || aid <= 0) return;
  libraryUploading.value = true;
  try {
    const fd = new FormData();
    fd.append('file', f);
    fd.append('agencyId', String(aid));
    const t = String(libraryUploadTitle.value || '').trim();
    if (t) fd.append('title', t.slice(0, 255));
    await api.post(`/skill-builders/program-organizations/${pid}/program-documents`, fd, { skipGlobalLoading: true });
    libraryUploadTitle.value = '';
    await loadLibrary();
  } catch (e) {
    window.alert(e.response?.data?.error?.message || e.message || 'Upload failed');
  } finally {
    libraryUploading.value = false;
    input.value = '';
  }
}

function startEditTitle(d) {
  editingDocId.value = d.id;
  editTitleDraft.value = d.displayTitle != null ? String(d.displayTitle) : '';
}

function cancelEditTitle() {
  editingDocId.value = null;
  editTitleDraft.value = '';
}

async function saveDocTitle(d) {
  const pid = orgNum.value;
  const aid = agencyNum.value;
  if (!d?.id || !Number.isFinite(pid) || pid <= 0 || !Number.isFinite(aid) || aid <= 0) return;
  titleSavingId.value = d.id;
  try {
    await api.patch(
      `/skill-builders/program-organizations/${pid}/program-documents/${d.id}`,
      { agencyId: aid, title: editTitleDraft.value.trim() },
      { skipGlobalLoading: true }
    );
    editingDocId.value = null;
    editTitleDraft.value = '';
    await loadLibrary();
  } catch (e) {
    window.alert(e.response?.data?.error?.message || e.message || 'Could not save title');
  } finally {
    titleSavingId.value = null;
  }
}

async function deleteLibraryDoc(d) {
  const pid = orgNum.value;
  const aid = agencyNum.value;
  if (!d?.id || !Number.isFinite(pid) || pid <= 0 || !Number.isFinite(aid) || aid <= 0) return;
  if (!window.confirm(`Remove “${docDisplayLabel(d)}” from the library? Session copies already attached stay on file.`)) {
    return;
  }
  libraryDeletingId.value = d.id;
  try {
    await api.delete(`/skill-builders/program-organizations/${pid}/program-documents/${d.id}`, {
      params: { agencyId: aid },
      skipGlobalLoading: true
    });
    if (Number(selectedLibraryId.value) === Number(d.id)) selectedLibraryId.value = null;
    await loadLibrary();
  } catch (e) {
    window.alert(e.response?.data?.error?.message || e.message || 'Failed');
  } finally {
    libraryDeletingId.value = null;
  }
}

function formatHm(t) {
  return String(t || '').slice(0, 5) || '—';
}

function wallHmToDisplay(hm) {
  const s = String(hm || '').slice(0, 5);
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return s === '—' ? '' : s;
  const h = parseInt(m[1], 10);
  const mi = parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return s;
  const d = new Date(2000, 0, 1, h, mi, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formatDateDisplay(raw) {
  const s = String(raw || '').trim();
  if (!s) return '—';
  const ymd = s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    const [y, mo, da] = ymd.split('-').map(Number);
    const d = new Date(y, mo - 1, da);
    if (Number.isFinite(d.getTime())) {
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    }
    return ymd;
  }
  return s;
}

function formatSessionLabel(s) {
  const datePart = formatDateDisplay(s.sessionDate || s.session_date);
  const dayAbbr = String(s.weekday || '').slice(0, 3);
  const st = wallHmToDisplay(formatHm(s.startTime));
  const et = wallHmToDisplay(formatHm(s.endTime));
  const timePart = `${dayAbbr} ${st}–${et}`;
  if (s.sessionLabel) {
    return `${s.sessionLabel} · ${datePart} · ${timePart}`;
  }
  return `${datePart} · ${timePart}`;
}

const activitiesSessionLabelText = computed(() => {
  const sid = selectedSessionId.value;
  const s = sortedSessions.value.find((x) => Number(x.id) === Number(sid));
  return s ? formatSessionLabel(s) : '';
});

function openLibraryActivities(d) {
  libraryActivitiesDocId.value = Number(d?.id) || 0;
  libraryActivitiesDocLabel.value = docDisplayLabel(d);
  libraryActivitiesModalOpen.value = true;
}

function closeLibraryActivities() {
  libraryActivitiesModalOpen.value = false;
  libraryActivitiesDocId.value = 0;
  libraryActivitiesDocLabel.value = '';
}

async function attachToSession() {
  attachError.value = '';
  attachFlash.value = '';
  const eid = selectedEventId.value;
  const sid = selectedSessionId.value;
  const lid = selectedLibraryId.value;
  const aid = agencyNum.value;
  if (!eid || !sid || !lid || !Number.isFinite(aid) || aid <= 0) return;
  attachBusy.value = true;
  try {
    await api.post(
      `/skill-builders/events/${eid}/sessions/${sid}/curriculum-from-library`,
      { agencyId: aid, libraryDocumentId: lid },
      { skipGlobalLoading: true }
    );
    attachFlash.value = 'Curriculum attached for that session.';
    window.setTimeout(() => {
      attachFlash.value = '';
    }, 5000);
  } catch (e) {
    attachError.value = e.response?.data?.error?.message || e.message || 'Attach failed';
  } finally {
    attachBusy.value = false;
  }
}

watch(
  () => [props.agencyId, props.organizationId],
  async () => {
    selectedEventId.value = null;
    selectedSessionId.value = null;
    selectedLibraryId.value = null;
    sessions.value = [];
    await loadProgramEvents();
    await loadLibrary();
  },
  { immediate: true }
);

watch(selectedEventId, async (id) => {
  selectedSessionId.value = null;
  attachError.value = '';
  attachFlash.value = '';
  sessions.value = [];
  if (!id) return;
  await loadSessionsForEvent();
});
</script>

<style scoped>
.sbpd {
  max-width: 40rem;
}
.sbpd-lead {
  margin: 0 0 18px;
  line-height: 1.45;
}
.sbpd-card {
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 14px;
  padding: 16px 18px 18px;
  margin-bottom: 18px;
  background: var(--pch-surface, #fff);
}
.sbpd-card-upload {
  border-color: #86efac;
  background: linear-gradient(180deg, #f0fdf4 0%, #fff 56px);
}
.sbpd-card-attach {
  border-color: var(--border, #e2e8f0);
}
.sbpd-step {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--primary, #15803d);
  margin-bottom: 6px;
}
.sbpd-card-title {
  margin: 0 0 8px;
  font-size: 1.08rem;
  font-weight: 700;
  color: var(--text-primary, #0f172a);
}
.sbpd-card-desc {
  margin: 0 0 14px;
  line-height: 1.45;
}
.sbpd-upload-actions {
  margin-top: 12px;
}
.sbpd-lib-status {
  margin-top: 14px;
}
.sbpd-label {
  display: block;
  font-size: 0.78rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary, #64748b);
  margin: 12px 0 6px;
}
.sbpd-select {
  width: 100%;
  max-width: 100%;
}
.sbpd-pick-event-hint {
  margin-top: 10px;
}
.sbpd-hint {
  margin: 6px 0 0;
}
.sbpd-lib-main {
  flex: 1;
  min-width: 0;
}
.sbpd-lib-name {
  display: block;
  font-weight: 600;
}
.sbpd-lib-file {
  display: block;
  margin-top: 2px;
  word-break: break-word;
}
.sbpd-lib-row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  margin-top: 6px;
}
.sbpd-edit-title {
  width: 100%;
  max-width: 100%;
  margin-bottom: 6px;
}
.sbpd-lib-edit-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.sbpd-hidden-file {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}
.sbpd-lib-list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
}
.sbpd-lib-item {
  padding: 10px 0;
  border-bottom: 1px solid var(--border, #e2e8f0);
  font-size: 0.9rem;
}
.sbpd-lib-del {
  color: #b91c1c;
}
.sbpd-actions {
  margin-top: 14px;
}
.sbpd-flash {
  margin: 10px 0 0;
  font-size: 0.88rem;
}
.sbpd-flash-ok {
  color: var(--primary, #15803d);
}
</style>
