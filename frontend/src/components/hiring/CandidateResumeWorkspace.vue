<template>
  <div class="resume-workspace" :class="{ 'is-overview': isOverview }">
    <div class="resume-main">
      <div class="resume-toolbar">
        <div class="resume-toolbar-left">
          <h3 class="resume-heading">Resume</h3>
          <span
            v-if="activeResume && parseLabel(activeResume)"
            class="resume-badge"
            :class="parseClass(activeResume)"
            :title="parseTitle(activeResume)"
          >
            {{ parseLabel(activeResume) }}
          </span>
        </div>
        <div class="resume-toolbar-right">
          <button
            v-if="viewerUrl"
            type="button"
            class="btn btn-secondary btn-sm"
            @click="openExternal"
          >
            {{ isOverview ? 'Download' : 'Open' }}
          </button>
          <button
            v-if="!isOverview"
            type="button"
            class="btn btn-secondary btn-sm"
            :class="{ active: showPaste }"
            @click="showPaste = !showPaste"
          >
            {{ showPaste ? 'Hide paste' : 'Paste resume' }}
          </button>
          <button
            v-if="isOverview"
            type="button"
            class="btn btn-secondary btn-sm"
            @click="$emit('goto-tab', 'resume')"
          >
            Full resume
          </button>
        </div>
      </div>

      <div v-if="!isOverview" class="resume-actions">
        <input type="file" ref="fileInput" accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" @change="onFileChange" />
        <input v-model="title" class="input" placeholder="Title (optional)" />
        <button class="btn btn-primary" type="button" :disabled="uploading || !selectedFile" @click="emitUpload">
          {{ uploading ? 'Uploading…' : 'Upload' }}
        </button>
      </div>

      <div v-if="!isOverview && showPaste" class="paste-panel">
        <p class="muted small">
          Use this when a DOCX/PDF can’t be read. Pasted text becomes the resume source for summaries and pre-screen.
        </p>
        <textarea
          v-model="pasteText"
          class="input paste-textarea"
          rows="10"
          placeholder="Paste the full resume text here…"
        />
        <div class="row-actions">
          <button
            type="button"
            class="btn btn-primary"
            :disabled="pasting || !pasteText.trim()"
            @click="emitPaste"
          >
            {{ pasting ? 'Saving…' : 'Save pasted resume' }}
          </button>
        </div>
      </div>

      <div v-if="error" class="error-banner">{{ error }}</div>
      <div v-if="!isOverview && needsTextHint" class="info-banner">
        We couldn’t extract text from the latest resume. Paste the resume text above, or upload a text-based PDF/DOCX.
      </div>

      <div v-if="loading" class="loading">Loading resumes…</div>
      <template v-else>
        <div v-if="!resumes.length" class="empty">
          No resumes uploaded yet.
          <button v-if="isOverview" type="button" class="linkish" style="margin-left:6px;" @click="$emit('goto-tab', 'resume')">
            Upload one
          </button>
        </div>
        <div v-else class="resume-viewer-wrap">
          <div v-if="!isOverview" class="resume-select-row">
            <label class="small">Document</label>
            <select class="input" :value="activeResumeId || ''" @change="onSelectResume">
              <option v-for="r in resumes" :key="r.id" :value="String(r.id)">
                {{ r.title || r.originalName || 'Resume' }} #{{ r.id }}
              </option>
            </select>
            <button type="button" class="btn btn-danger btn-sm" :disabled="!activeResume" @click="$emit('delete', activeResume)">
              Delete
            </button>
          </div>

          <div v-if="viewerLoading" class="loading">Opening resume…</div>
          <iframe
            v-else-if="canEmbed && viewerUrl"
            class="resume-iframe"
            :class="{ compact: isOverview }"
            :src="viewerUrl"
            title="Resume viewer"
          />
          <div v-else-if="viewerUrl" class="viewer-fallback">
            <p class="muted">
              Preview isn’t available for this file type in-browser.
              <button type="button" class="linkish" @click="openExternal">Open in a new tab</button>
              or paste the resume text if extraction failed.
            </p>
          </div>
          <div v-else class="empty">Select a resume to view.</div>
        </div>
      </template>
    </div>

    <aside class="resume-side">
      <section class="side-card">
        <div class="side-card-head">
          <h4>Notes</h4>
          <button type="button" class="linkish" @click="$emit('goto-tab', 'notes')">
            {{ isOverview ? '+ Add Note' : 'Open' }}
          </button>
        </div>
        <div v-if="!(notes || []).length" class="muted small">No notes yet.</div>
        <ul v-else class="side-list">
          <li v-for="n in notesPreview" :key="n.id">
            <div class="side-meta">{{ noteAuthor(n) }} · {{ formatWhen(n.created_at || n.createdAt) }}</div>
            <div class="side-body">{{ truncate(n.message || n.body || n.note_text || '', 140) }}</div>
          </li>
        </ul>
      </section>

      <section class="side-card">
        <div class="side-card-head">
          <h4>{{ isOverview ? 'Assigned Tasks' : 'Tasks' }}</h4>
          <button type="button" class="linkish" @click="$emit('goto-tab', 'tasks')">
            {{ isOverview ? '+ Add Task' : 'Open' }}
          </button>
        </div>
        <div v-if="!(tasks || []).length" class="muted small">No tasks yet.</div>
        <ul v-else class="side-list">
          <li v-for="t in tasksPreview" :key="t.id">
            <div class="side-body">{{ t.title || t.task_title || 'Task' }}</div>
            <div class="side-meta">{{ t.status || 'open' }}{{ t.due_at || t.dueAt ? ` · due ${formatWhen(t.due_at || t.dueAt)}` : '' }}</div>
          </li>
        </ul>
      </section>

      <section v-if="isOverview" class="side-card">
        <div class="side-card-head">
          <h4>Activity</h4>
        </div>
        <div v-if="!(activityItems || []).length" class="muted small">No recent activity.</div>
        <ul v-else class="side-list">
          <li v-for="(a, idx) in activityItems.slice(0, 5)" :key="idx">
            <div class="side-body">{{ a.title }}</div>
            <div class="side-meta">{{ a.meta }}</div>
          </li>
        </ul>
      </section>

      <section v-else class="side-card">
        <div class="side-card-head">
          <h4>Summary</h4>
          <button type="button" class="linkish" @click="$emit('goto-tab', 'resumeSummary')">Open</button>
        </div>
        <div v-if="summaryGenerating" class="muted small">Generating…</div>
        <div v-else-if="summaryError" class="error-banner compact">{{ summaryError }}</div>
        <div v-else-if="!summaryBullets.length" class="muted small">
          No AI summary yet.
          <button type="button" class="btn btn-primary btn-sm" style="margin-top:8px;" :disabled="summaryGenerating" @click="$emit('generate-summary')">
            Generate
          </button>
        </div>
        <ul v-else class="side-list bullets">
          <li v-for="(b, idx) in summaryBullets.slice(0, 4)" :key="idx">{{ b }}</li>
        </ul>
      </section>
    </aside>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';

const props = defineProps({
  resumes: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  uploading: { type: Boolean, default: false },
  pasting: { type: Boolean, default: false },
  error: { type: String, default: '' },
  notes: { type: Array, default: () => [] },
  tasks: { type: Array, default: () => [] },
  activityItems: { type: Array, default: () => [] },
  summaryBullets: { type: Array, default: () => [] },
  summaryError: { type: String, default: '' },
  summaryGenerating: { type: Boolean, default: false },
  variant: { type: String, default: 'full' },
  resolveViewerUrl: { type: Function, required: true }
});

const emit = defineEmits(['upload', 'paste', 'delete', 'goto-tab', 'generate-summary']);
const isOverview = computed(() => String(props.variant || 'full') === 'overview');

const fileInput = ref(null);
const selectedFile = ref(null);
const title = ref('');
const pasteText = ref('');
const showPaste = ref(false);
const activeResumeId = ref(null);
const viewerUrl = ref('');
const viewerMime = ref('');
const viewerLoading = ref(false);

const activeResume = computed(() => (props.resumes || []).find((r) => Number(r.id) === Number(activeResumeId.value)) || null);

const canEmbed = computed(() => {
  const mt = String(viewerMime.value || activeResume.value?.mimeType || activeResume.value?.mime_type || '').toLowerCase();
  return mt === 'application/pdf' || mt.startsWith('text/');
});

const needsTextHint = computed(() => {
  const r = activeResume.value;
  if (!r) return false;
  const status = String(r.resumeParseStatus || '').toLowerCase();
  return status === 'failed' || status === 'no_text' || status === 'unsupported';
});

const notesPreview = computed(() => (props.notes || []).slice(0, isOverview.value ? 2 : 3));
const tasksPreview = computed(() => (props.tasks || []).slice(0, isOverview.value ? 3 : 3));

watch(
  () => props.resumes,
  async (list) => {
    if (!list?.length) {
      activeResumeId.value = null;
      viewerUrl.value = '';
      return;
    }
    const stillThere = list.some((r) => Number(r.id) === Number(activeResumeId.value));
    if (!stillThere) activeResumeId.value = list[0].id;
    await loadViewer();
  },
  { immediate: true }
);

watch(needsTextHint, (v) => {
  if (v) showPaste.value = true;
});

function onFileChange(e) {
  selectedFile.value = e?.target?.files?.[0] || null;
}

function onSelectResume(e) {
  activeResumeId.value = e?.target?.value || null;
  loadViewer();
}

async function loadViewer() {
  viewerUrl.value = '';
  viewerMime.value = '';
  if (!activeResume.value) return;
  viewerLoading.value = true;
  try {
    const data = await props.resolveViewerUrl(activeResume.value);
    viewerUrl.value = data?.url || '';
    viewerMime.value = data?.mimeType || activeResume.value.mimeType || activeResume.value.mime_type || '';
  } catch {
    viewerUrl.value = '';
  } finally {
    viewerLoading.value = false;
  }
}

function openExternal() {
  if (viewerUrl.value) window.open(viewerUrl.value, '_blank', 'noopener,noreferrer');
}

function emitUpload() {
  emit('upload', { file: selectedFile.value, title: title.value });
  selectedFile.value = null;
  title.value = '';
  if (fileInput.value) fileInput.value.value = '';
}

function emitPaste() {
  const text = pasteText.value.trim();
  if (!text) return;
  emit('paste', { resumeText: text, title: title.value || 'Resume (pasted text)' });
  pasteText.value = '';
}

function parseLabel(r) {
  const status = String(r?.resumeParseStatus || '').trim().toLowerCase();
  if (!status) return null;
  if (status === 'completed') return 'Text extracted';
  if (status === 'no_text') return 'No text';
  if (status === 'failed') return 'Extract failed';
  if (status === 'pending') return 'Extracting…';
  return status;
}

function parseClass(r) {
  const status = String(r?.resumeParseStatus || '').trim().toLowerCase();
  if (status === 'completed') return 'ok';
  if (status === 'no_text' || status === 'failed') return 'bad';
  return 'muted';
}

function parseTitle(r) {
  return r?.resumeParseError || r?.resumeParseMethod || '';
}

function noteAuthor(n) {
  const name = [n.author_first_name || n.first_name, n.author_last_name || n.last_name].filter(Boolean).join(' ');
  return name || n.author_name || 'Note';
}

function formatWhen(v) {
  if (!v) return '';
  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v);
  }
}

function truncate(s, n) {
  const t = String(s || '');
  return t.length > n ? `${t.slice(0, n)}…` : t;
}
</script>

<style scoped>
.resume-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 16px;
  align-items: start;
}
.resume-workspace.is-overview {
  grid-template-columns: minmax(0, 1.6fr) 300px;
}
@media (max-width: 960px) {
  .resume-workspace,
  .resume-workspace.is-overview { grid-template-columns: 1fr; }
}
.resume-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.resume-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.resume-toolbar-left, .resume-toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.resume-heading {
  margin: 0;
  font-size: 1.05rem;
}
.resume-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.resume-actions .input { max-width: 220px; }
.paste-panel {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 10px;
  padding: 12px;
  background: var(--surface-muted, #fafafa);
}
.paste-textarea {
  width: 100%;
  min-height: 160px;
  margin: 8px 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}
.resume-viewer-wrap {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
}
.resume-select-row {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 10px;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  flex-wrap: wrap;
}
.resume-select-row .input { flex: 1; min-width: 160px; }
.resume-iframe {
  width: 100%;
  min-height: 640px;
  border: 0;
  background: #f3f4f6;
}
.resume-iframe.compact {
  min-height: 520px;
}
.viewer-fallback { padding: 24px; }
.resume-side {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.side-card {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 12px;
  padding: 12px;
  background: #fff;
}
.side-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.side-card-head h4 {
  margin: 0;
  font-size: 0.95rem;
}
.side-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.side-list.bullets {
  list-style: disc;
  padding-left: 18px;
}
.side-meta {
  font-size: 11px;
  color: #6b7280;
}
.side-body {
  font-size: 13px;
  line-height: 1.35;
}
.linkish {
  background: none;
  border: 0;
  color: #5b21b6;
  cursor: pointer;
  padding: 0;
  font-size: 12px;
  text-decoration: underline;
}
.resume-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #e5e7eb;
}
.resume-badge.ok { background: #d1fae5; color: #065f46; }
.resume-badge.bad { background: #fee2e2; color: #991b1b; }
.resume-badge.muted { background: #f3f4f6; color: #4b5563; }
.error-banner.compact { font-size: 12px; padding: 8px; }
.btn-sm.active { outline: 2px solid #7c3aed; }
.row-actions { display: flex; gap: 8px; flex-wrap: wrap; }
</style>
