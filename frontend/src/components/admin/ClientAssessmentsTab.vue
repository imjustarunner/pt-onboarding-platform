<template>
  <div class="cad-tab">
    <div class="head">
      <h3>Assessments</h3>
      <select v-model="assignFamily" class="form-input family-select">
        <option disabled value="">Assign assessment…</option>
        <option v-for="t in assessmentTools" :key="t.id" :value="t.id">{{ t.title }}</option>
      </select>
      <button
        type="button"
        class="btn primary"
        :disabled="assigning || !assignFamily || !agencyId"
        @click="assign"
      >
        {{ assigning ? 'Creating…' : 'Assign' }}
      </button>
    </div>

    <p v-if="error" class="err">{{ error }}</p>
    <p v-if="notice" class="ok">{{ notice }}</p>
    <p v-if="lastLink" class="link-row">
      Share link:
      <a :href="lastLink" target="_blank" rel="noopener">{{ lastLink }}</a>
      <button type="button" class="btn ghost" @click="copyLink">Copy</button>
    </p>

    <p v-if="loading" class="muted">Loading…</p>

    <template v-else>
      <h4 class="subhead">Assigned / completed</h4>
      <ul class="list">
        <li v-for="a in assessments" :key="`${a.family}-${a.id}`" class="row">
          <div>
            <strong>{{ a.title }}</strong>
            <span class="badge">{{ a.status }}</span>
            <div class="meta">
              Created {{ formatWhen(a.createdAt) }}
              <template v-if="a.completedAt"> · Completed {{ formatWhen(a.completedAt) }}</template>
            </div>
          </div>
          <div class="actions">
            <button
              v-if="a.accessToken"
              type="button"
              class="btn ghost"
              @click="openAssessment(a)"
            >
              Open
            </button>
          </div>
        </li>
        <li v-if="!assessments.length" class="muted">No assessments assigned yet.</li>
      </ul>

      <h4 class="subhead">Deliverables</h4>
      <ul class="list">
        <li v-for="d in deliverables" :key="d.id" class="row deliverable">
          <div>
            <strong>{{ d.title }}</strong>
            <span class="badge" :class="{ warn: !d.sharedWithClient }">
              {{ d.sharedWithClient ? 'Shared' : 'Unshared' }}
            </span>
            <div class="meta">
              {{ familyLabel(d.assessmentFamily) }} · {{ d.kind }} · v{{ d.version }}
              · Updated {{ formatWhen(d.updatedAt) }}
            </div>
          </div>
          <div class="actions wrap">
            <button type="button" class="btn ghost" @click="openEditor(d)">Edit</button>
            <button type="button" class="btn ghost" @click="download(d, 'pdf')">PDF</button>
            <button type="button" class="btn ghost" @click="download(d, 'docx')">DOCX</button>
            <button type="button" class="btn ghost" @click="download(d, 'txt')">TXT</button>
            <button type="button" class="btn ghost" @click="download(d, 'google_doc')">Google Doc</button>
            <label class="btn ghost file-btn">
              Replace
              <input type="file" hidden @change="(e) => onReplaceFile(d, e)" />
            </label>
            <button
              type="button"
              class="btn ghost"
              @click="d.sharedWithClient ? unshare(d) : share(d)"
            >
              {{ d.sharedWithClient ? 'Unshare' : 'Share' }}
            </button>
          </div>
        </li>
        <li v-if="!deliverables.length" class="muted">
          No deliverables yet. Complete a client-linked assessment to generate Results + Action Plan.
        </li>
      </ul>
    </template>

    <div v-if="editing" class="editor-modal" @click.self="editing = null">
      <div class="editor-panel" role="dialog" aria-modal="true">
        <div class="editor-head">
          <h3>Edit deliverable</h3>
          <button type="button" class="btn ghost" @click="editing = null">✕</button>
        </div>
        <input v-model="editTitle" class="form-input" placeholder="Title" />
        <RichTextEditor :content="editContent" @update="onEditorUpdate" />
        <div class="editor-foot">
          <button type="button" class="btn ghost" @click="editing = null">Cancel</button>
          <button type="button" class="btn primary" :disabled="saving" @click="saveEditor">
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import api from '../../services/api';
import { ASSESSMENT_TOOLS, getAssessmentTokenUrl } from '../../navigation/toolsCatalog.js';
import RichTextEditor from './RichTextEditor.vue';

const props = defineProps({
  clientId: { type: [Number, String], required: true },
  agencyId: { type: [Number, String], required: true },
  organizationSlug: { type: String, default: '' }
});

const loading = ref(false);
const assigning = ref(false);
const saving = ref(false);
const error = ref('');
const notice = ref('');
const lastLink = ref('');
const assessments = ref([]);
const deliverables = ref([]);
const assignFamily = ref('');
const editing = ref(null);
const editTitle = ref('');
const editHtml = ref('');
const editContent = reactive({ content: '' });

const assessmentTools = computed(() => ASSESSMENT_TOOLS);

function familyLabel(family) {
  const id = String(family || '').replace(/_/g, '-');
  return ASSESSMENT_TOOLS.find((t) => t.id === id)?.title || family;
}

function formatWhen(d) {
  if (!d) return '—';
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? String(d) : x.toLocaleString();
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get(`/assessment-deliverables/clients/${props.clientId}`);
    assessments.value = res.data?.assessments || [];
    deliverables.value = res.data?.deliverables || [];
  } catch (e) {
    error.value = e?.response?.data?.error || e.message || 'Could not load assessments';
  } finally {
    loading.value = false;
  }
}

async function assign() {
  if (!assignFamily.value || !props.agencyId) return;
  assigning.value = true;
  error.value = '';
  notice.value = '';
  try {
    const res = await api.post('/assessment-deliverables/assign', {
      family: assignFamily.value,
      clientId: Number(props.clientId),
      agencyId: Number(props.agencyId),
      organizationSlug: props.organizationSlug || ''
    });
    const token = res.data?.accessToken;
    const tool = ASSESSMENT_TOOLS.find((t) => t.id === assignFamily.value);
    lastLink.value = token
      ? getAssessmentTokenUrl(
          window.location.origin,
          tool?.path || `/${assignFamily.value}`,
          token,
          props.organizationSlug
        )
      : `${window.location.origin}${res.data?.brandedPath || res.data?.shortPath || ''}`;
    notice.value = 'Assessment assigned — copy the link below';
    await load();
  } catch (e) {
    error.value = e?.response?.data?.error || e.message || 'Assign failed';
  } finally {
    assigning.value = false;
  }
}

function openAssessment(a) {
  if (!a.accessToken) return;
  const path = `/${String(a.catalogId || a.family).replace(/_/g, '-')}`;
  const url = getAssessmentTokenUrl(
    window.location.origin,
    path,
    a.accessToken,
    props.organizationSlug
  );
  window.open(url, '_blank', 'noopener');
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(lastLink.value);
    notice.value = 'Link copied';
  } catch {
    notice.value = 'Copy manually from the link above';
  }
}

function openEditor(d) {
  editing.value = d;
  editTitle.value = d.title || '';
  editHtml.value = d.htmlBody || '';
  editContent.content = d.htmlBody || '';
}

function onEditorUpdate({ content }) {
  editHtml.value = content;
}

async function saveEditor() {
  if (!editing.value) return;
  saving.value = true;
  error.value = '';
  try {
    await api.patch(`/assessment-deliverables/${editing.value.id}`, {
      title: editTitle.value,
      htmlBody: editHtml.value
    });
    notice.value = 'Deliverable saved';
    editing.value = null;
    await load();
  } catch (e) {
    error.value = e?.response?.data?.error || e.message || 'Save failed';
  } finally {
    saving.value = false;
  }
}

async function download(d, format) {
  error.value = '';
  notice.value = '';
  try {
    if (format === 'google_doc') {
      const res = await api.post(`/assessment-deliverables/${d.id}/export`, { format });
      const url = res.data?.googleDocUrl;
      if (url) {
        window.open(url, '_blank', 'noopener');
        notice.value = 'Google Doc created';
        await load();
      } else {
        error.value = 'Google Doc export did not return a URL';
      }
      return;
    }
    const res = await api.post(
      `/assessment-deliverables/${d.id}/export`,
      { format },
      { responseType: 'blob' }
    );
    const blob = new Blob([res.data], {
      type: res.headers['content-type'] || 'application/octet-stream'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(d.title || 'deliverable').replace(/\s+/g, '_')}.${format === 'txt' ? 'txt' : format}`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    error.value = e?.response?.data?.error || e.message || 'Export failed';
  }
}

async function share(d) {
  try {
    await api.post(`/assessment-deliverables/${d.id}/share`);
    notice.value = 'Shared with client';
    await load();
  } catch (e) {
    error.value = e?.response?.data?.error || e.message || 'Share failed';
  }
}

async function unshare(d) {
  try {
    await api.post(`/assessment-deliverables/${d.id}/unshare`);
    notice.value = 'Unshared';
    await load();
  } catch (e) {
    error.value = e?.response?.data?.error || e.message || 'Unshare failed';
  }
}

async function onReplaceFile(d, event) {
  const file = event?.target?.files?.[0];
  event.target.value = '';
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  try {
    await api.post(`/assessment-deliverables/${d.id}/replace`, fd);
    notice.value = 'File replace recorded (version bumped)';
    await load();
  } catch (e) {
    error.value = e?.response?.data?.error || e.message || 'Replace failed';
  }
}

onMounted(load);
watch(() => props.clientId, load);
</script>

<style scoped>
.cad-tab { display: flex; flex-direction: column; gap: 0.75rem; }
.head { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
.head h3 { margin: 0; flex: 1; min-width: 8rem; }
.family-select { max-width: 16rem; }
.subhead { margin: 1rem 0 0.35rem; font-size: 0.95rem; }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
.row {
  display: flex; justify-content: space-between; gap: 0.75rem; align-items: flex-start;
  padding: 0.75rem; border: 1px solid #e5e0d8; border-radius: 8px; background: #fff;
}
.actions { display: flex; gap: 0.35rem; flex-shrink: 0; }
.actions.wrap { flex-wrap: wrap; max-width: 28rem; justify-content: flex-end; }
.meta { font-size: 0.8rem; color: #666; margin-top: 0.2rem; }
.badge {
  display: inline-block; margin-left: 0.4rem; font-size: 0.7rem; padding: 0.1rem 0.4rem;
  border-radius: 999px; background: #e8f0ec; color: #1b4332; vertical-align: middle;
}
.badge.warn { background: #f5ebe0; color: #7a4a1e; }
.muted { color: #777; }
.err { color: #b00020; }
.ok { color: #1b4332; }
.link-row { font-size: 0.85rem; word-break: break-all; }
.btn {
  border: 1px solid #ccc; background: #f7f7f7; border-radius: 6px; padding: 0.35rem 0.65rem;
  cursor: pointer; font-size: 0.8rem;
}
.btn.primary { background: #2c4a3e; color: #fff; border-color: #2c4a3e; }
.btn.ghost { background: transparent; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.file-btn { display: inline-flex; align-items: center; }
.form-input {
  border: 1px solid #ccc; border-radius: 6px; padding: 0.4rem 0.55rem; font-size: 0.9rem;
}
.editor-modal {
  position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 1000;
  display: flex; align-items: center; justify-content: center; padding: 1rem;
}
.editor-panel {
  background: #fff; border-radius: 10px; width: min(880px, 100%); max-height: 90vh;
  overflow: auto; padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem;
}
.editor-head, .editor-foot { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
</style>
