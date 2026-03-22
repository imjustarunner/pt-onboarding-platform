<template>
  <div class="sbep-mat-curr">
    <p class="muted small sbep-mat-curr-lead">
      Upload one PDF per session date. The server extracts text for Note Aid (H2014 group notes). Families can open the
      same PDF from the guardian portal when enabled.
    </p>
    <div v-if="sessionsLoading" class="muted">Loading sessions…</div>
    <div v-else-if="!sessions.length" class="muted">No sessions in range yet.</div>
    <div v-else class="sbep-mat-curr-table-wrap">
      <table class="sbep-mat-curr-table">
        <thead>
          <tr>
            <th>Session</th>
            <th>Curriculum</th>
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
import { ref, computed } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: Number, required: true },
  eventId: { type: Number, required: true },
  sessions: { type: Array, default: () => [] },
  sessionsLoading: { type: Boolean, default: false },
  formatSessionLabel: { type: Function, required: true },
  viewerCaps: { type: Object, default: () => ({}) }
});

const emit = defineEmits(['refresh-sessions']);

const uploadingId = ref(null);
/** @type {Record<number, HTMLInputElement | null>} */
const fileInputRefs = ref({});

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
