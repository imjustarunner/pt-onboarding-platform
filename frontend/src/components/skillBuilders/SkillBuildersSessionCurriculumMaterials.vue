<template>
  <div class="sbep-mat-curr">
    <p class="muted small sbep-mat-curr-lead">
      Each row is one scheduled occurrence (e.g. <strong>Session 1</strong> for a full block, or
      <strong>Session 1.1</strong> / <strong>1.2</strong> when the same day is split). The <strong>program document
      library</strong> is shared across every nested event under this overarching program — upload once, then attach
      here per session or from the program hub.
    </p>
    <div v-if="canManage" class="sbep-mat-curr-toolbar">
      <label class="sbep-mat-lib-title-label muted small">Library title (shown when attaching)</label>
      <input
        v-model="libraryUploadTitle"
        type="text"
        class="input input-sm sbep-mat-lib-title-input"
        maxlength="255"
        placeholder="e.g. Coping skills — week 2"
        :disabled="libraryUploading"
      />
      <div class="sbep-mat-curr-toolbar-row">
        <input
          ref="libraryFileInputRef"
          type="file"
          accept="application/pdf"
          class="sbep-hidden-file"
          @change="onLibraryFileUpload"
        />
        <button
          type="button"
          class="btn btn-primary btn-sm"
          :disabled="libraryUploading"
          @click="triggerLibraryFilePick"
        >
          {{ libraryUploading ? 'Uploading…' : 'Upload PDF to library' }}
        </button>
        <router-link
          v-if="programDocumentsLibraryRoute"
          class="btn btn-secondary btn-sm"
          :to="programDocumentsLibraryRoute"
        >
          Open program document library
        </router-link>
      </div>
      <p class="muted small sbep-mat-lib-title-hint">Optional. If empty, the file name is used in menus.</p>
    </div>
    <div v-if="sessionsLoading" class="muted">Loading sessions…</div>
    <div v-else-if="!sessions.length" class="muted">No sessions in range yet.</div>
    <div v-else class="sbep-mat-curr-table-wrap">
      <table class="sbep-mat-curr-table">
        <thead>
          <tr>
            <th>Session</th>
            <th>Curriculum</th>
            <th>From library</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in sessions" :key="`mat-curr-${s.id}`">
            <td class="sbep-mat-curr-session">{{ formatSessionLabel(s) }}</td>
            <td>
              <span v-if="s.hasCurriculum || s.curriculumFileName" class="sbep-mat-curr-meta">
                {{ s.curriculumFileName || 'PDF on file' }}
                <span v-if="s.curriculumExtractStatus" class="muted small"> · {{ s.curriculumExtractStatus }}</span>
              </span>
              <span v-else class="muted">—</span>
            </td>
            <td class="sbep-mat-curr-lib">
              <template v-if="canManage">
                <div v-if="libraryLoading" class="muted small">Loading…</div>
                <div v-else-if="libraryDocs.length" class="sbep-mat-curr-lib-row">
                  <select v-model="attachPick[s.id]" class="input input-sm sbep-mat-lib-select">
                    <option value="">Choose PDF…</option>
                    <option v-for="d in libraryDocs" :key="`lib-${d.id}`" :value="d.id">{{ libraryDocLabel(d) }}</option>
                  </select>
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    :disabled="attachBusyId === s.id || !attachPick[s.id]"
                    @click="attachFromLibrary(s.id)"
                  >
                    {{ attachBusyId === s.id ? '…' : 'Attach' }}
                  </button>
                </div>
                <span v-else class="muted small">Upload a PDF to the library above, or open the program document library.</span>
              </template>
              <span v-else class="muted small">—</span>
            </td>
            <td class="sbep-mat-curr-actions">
              <input
                :ref="(el) => setFileInputRef(s.id, el)"
                type="file"
                accept="application/pdf"
                class="sbep-hidden-file"
                @change="(ev) => onPickFile(s.id, ev)"
              />
              <template v-if="canManage">
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  :disabled="uploadingId === s.id"
                  @click="triggerPick(s.id)"
                >
                  {{ uploadingId === s.id ? 'Uploading…' : s.hasCurriculum ? 'Replace PDF' : 'Upload PDF' }}
                </button>
                <button
                  v-if="s.hasCurriculum || s.curriculumFileName"
                  type="button"
                  class="btn btn-link btn-sm"
                  @click="openPdf(s.id)"
                >
                  Open
                </button>
                <button
                  v-if="s.hasCurriculum || s.curriculumFileName"
                  type="button"
                  class="btn btn-link btn-sm sbep-mat-curr-remove"
                  :disabled="uploadingId === s.id"
                  @click="removePdf(s.id)"
                >
                  Remove
                </button>
              </template>
              <template v-else>
                <button
                  v-if="s.hasCurriculum || s.curriculumFileName"
                  type="button"
                  class="btn btn-secondary btn-sm"
                  @click="openPdf(s.id)"
                >
                  Open PDF
                </button>
                <span v-else class="muted small">No file</span>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, reactive, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: Number, required: true },
  eventId: { type: Number, required: true },
  sessions: { type: Array, default: () => [] },
  sessionsLoading: { type: Boolean, default: false },
  formatSessionLabel: { type: Function, required: true },
  viewerCaps: { type: Object, default: () => ({}) },
  /** Dashboard route to open Skill Builders hub → Program documents (coordinators). */
  programDocumentsLibraryRoute: { type: Object, default: null }
});

const emit = defineEmits(['refresh-sessions']);

const uploadingId = ref(null);
/** @type {Record<number, HTMLInputElement | null>} */
const fileInputRefs = ref({});
const libraryDocs = ref([]);
const libraryLoading = ref(false);
const libraryUploading = ref(false);
const libraryUploadTitle = ref('');
const libraryFileInputRef = ref(null);

function libraryDocLabel(d) {
  return String(d?.displayLabel || d?.originalFilename || '').trim() || 'Document';
}
const attachBusyId = ref(null);
/** @type {Record<number, number | null>} */
const attachPick = reactive({});

function triggerLibraryFilePick() {
  libraryFileInputRef.value?.click();
}

async function onLibraryFileUpload(ev) {
  const input = ev.target;
  const f = input?.files?.[0];
  if (!f || !props.agencyId || !props.eventId) return;
  libraryUploading.value = true;
  try {
    const fd = new FormData();
    fd.append('file', f);
    fd.append('agencyId', String(props.agencyId));
    const t = String(libraryUploadTitle.value || '').trim();
    if (t) fd.append('title', t.slice(0, 255));
    await api.post(`/skill-builders/events/${props.eventId}/program-documents`, fd, { skipGlobalLoading: true });
    libraryUploadTitle.value = '';
    await loadLibrary();
  } catch (e) {
    window.alert(e.response?.data?.error?.message || e.message || 'Upload failed');
  } finally {
    libraryUploading.value = false;
    input.value = '';
  }
}

async function loadLibrary() {
  if (!props.agencyId || !props.eventId) return;
  libraryLoading.value = true;
  try {
    const res = await api.get(`/skill-builders/events/${props.eventId}/program-documents`, {
      params: { agencyId: props.agencyId },
      skipGlobalLoading: true
    });
    libraryDocs.value = Array.isArray(res.data?.documents) ? res.data.documents : [];
  } catch {
    libraryDocs.value = [];
  } finally {
    libraryLoading.value = false;
  }
}

watch(
  () => [props.eventId, props.agencyId],
  () => {
    loadLibrary();
  },
  { immediate: true }
);

async function attachFromLibrary(sessionId) {
  const lid = Number(attachPick[sessionId]);
  if (!Number.isFinite(lid) || lid <= 0 || !props.agencyId || !props.eventId) return;
  attachBusyId.value = sessionId;
  try {
    await api.post(
      `/skill-builders/events/${props.eventId}/sessions/${sessionId}/curriculum-from-library`,
      { agencyId: props.agencyId, libraryDocumentId: lid },
      { skipGlobalLoading: true }
    );
    emit('refresh-sessions');
  } catch (e) {
    window.alert(e.response?.data?.error?.message || e.message || 'Attach failed');
  } finally {
    attachBusyId.value = null;
  }
}

const canManage = computed(() => {
  const v = props.viewerCaps;
  return !!(v?.isAssignedProvider || v?.canManageTeamSchedules || v?.canManageCompanyEvent);
});

function setFileInputRef(sessionId, el) {
  if (el && el instanceof HTMLInputElement) {
    fileInputRefs.value[sessionId] = el;
  } else if (!el) {
    delete fileInputRefs.value[sessionId];
  }
}

function triggerPick(sessionId) {
  const el = fileInputRefs.value[sessionId];
  el?.click();
}

async function onPickFile(sessionId, ev) {
  const input = ev.target;
  const f = input?.files?.[0];
  if (!f || !props.agencyId) return;
  uploadingId.value = sessionId;
  try {
    const fd = new FormData();
    fd.append('file', f);
    fd.append('agencyId', String(props.agencyId));
    await api.post(`/skill-builders/events/${props.eventId}/sessions/${sessionId}/curriculum`, fd, {
      skipGlobalLoading: true
    });
    emit('refresh-sessions');
  } catch (e) {
    window.alert(e.response?.data?.error?.message || e.message || 'Upload failed');
  } finally {
    uploadingId.value = null;
    input.value = '';
  }
}

function curriculumUrl(sessionId) {
  const base = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
  return `${base}/skill-builders/events/${props.eventId}/sessions/${sessionId}/curriculum?agencyId=${props.agencyId}`;
}

function openPdf(sessionId) {
  window.open(curriculumUrl(sessionId), '_blank', 'noopener,noreferrer');
}

async function removePdf(sessionId) {
  if (!window.confirm('Remove curriculum PDF for this session?')) return;
  try {
    await api.delete(`/skill-builders/events/${props.eventId}/sessions/${sessionId}/curriculum`, {
      data: { agencyId: props.agencyId },
      skipGlobalLoading: true
    });
    emit('refresh-sessions');
  } catch (e) {
    window.alert(e.response?.data?.error?.message || e.message || 'Failed');
  }
}
</script>

<style scoped>
.sbep-mat-curr-lead {
  margin: 0 0 14px;
  line-height: 1.45;
}
.sbep-mat-curr-toolbar {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  margin: 0 0 16px;
  max-width: 36rem;
}
.sbep-mat-lib-title-label {
  margin: 0;
}
.sbep-mat-lib-title-input {
  width: 100%;
}
.sbep-mat-lib-title-hint {
  margin: 0;
}
.sbep-mat-curr-toolbar-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.sbep-mat-curr-table-wrap {
  overflow-x: auto;
}
.sbep-mat-curr-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
}
.sbep-mat-curr-table th,
.sbep-mat-curr-table td {
  text-align: left;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border, #e2e8f0);
  vertical-align: top;
}
.sbep-mat-curr-table th {
  font-weight: 700;
  color: var(--text-secondary, #64748b);
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
.sbep-mat-curr-session {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.sbep-mat-curr-lib {
  min-width: 200px;
  max-width: 280px;
  vertical-align: top;
}
.sbep-mat-curr-lib-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.sbep-mat-lib-select {
  flex: 1 1 120px;
  min-width: 0;
  font-size: 0.82rem;
}
.sbep-mat-curr-actions {
  white-space: nowrap;
}
.sbep-mat-curr-actions .btn + .btn {
  margin-left: 4px;
}
.sbep-mat-curr-remove {
  color: #b91c1c;
}
.sbep-hidden-file {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}
.sbep-mat-curr-meta {
  font-size: 0.86rem;
}
</style>
