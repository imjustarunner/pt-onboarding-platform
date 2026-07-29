<template>
  <div class="cc-assess-tab">
    <div class="cc-enc-toolbar">
      <div class="cc-enc-toolbar__meta">
        <h3>Assessments &amp; Evaluations</h3>
        <p>Assign tools from the catalog, track completion, and manage client deliverables.</p>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" :disabled="loading" @click="load">
        {{ loading ? 'Loading…' : 'Refresh' }}
      </button>
    </div>

    <p v-if="error" class="cc-assess-error">{{ error }}</p>
    <p v-if="notice" class="cc-assess-notice">{{ notice }}</p>
    <p v-if="lastLink" class="cc-assess-link-row">
      Share link:
      <a :href="lastLink" target="_blank" rel="noopener">{{ lastLink }}</a>
      <button type="button" class="cc-btn-soft cc-assess-copy" @click="copyLink">Copy</button>
    </p>

    <div class="cc-enc-kpi-row">
      <div class="cc-enc-kpi">
        <div class="cc-enc-kpi__label">Assigned</div>
        <div class="cc-enc-kpi__value">{{ assessments.length }}</div>
      </div>
      <div class="cc-enc-kpi">
        <div class="cc-enc-kpi__label">Completed</div>
        <div class="cc-enc-kpi__value cc-enc-kpi__value--ok">{{ completedCount }}</div>
      </div>
      <div class="cc-enc-kpi">
        <div class="cc-enc-kpi__label">Deliverables</div>
        <div class="cc-enc-kpi__value">{{ deliverables.length }}</div>
      </div>
      <div class="cc-enc-kpi">
        <div class="cc-enc-kpi__label">In catalog</div>
        <div class="cc-enc-kpi__value">{{ assessmentTools.length }}</div>
      </div>
    </div>

    <section class="cc-assess-panel">
      <div class="cc-assess-panel__head">
        <h4>Assessment catalog</h4>
        <div class="cc-assess-filters">
          <input
            v-model="search"
            type="search"
            class="cc-enc-search"
            placeholder="Search assessments…"
            aria-label="Search assessments"
          />
          <select v-model="filterKind" class="cc-assess-select" aria-label="Filter by type">
            <option value="all">All types</option>
            <option value="clinical">Clinical</option>
            <option value="non_clinical">Non-clinical</option>
          </select>
        </div>
      </div>

      <div v-if="loading" class="muted">Loading assigned assessments…</div>
      <div v-else class="cc-assess-grid">
        <ToolCard
          v-for="tool in filteredTools"
          :key="tool.id"
          :title="tool.title"
          :little-name="tool.littleName || ''"
          :description="tool.description"
          :tags="toolTags(tool)"
          :meta="toolMeta(tool)"
          icon="◎"
          :show-edit="false"
          :show-duplicate="false"
          :show-copy="false"
          :show-assign="true"
          open-label="Preview"
          @open="openGuestPreview(tool)"
          @assign="assignTool(tool)"
        />
        <p v-if="!filteredTools.length" class="cc-assess-empty">No assessments match your search.</p>
      </div>
    </section>

    <section class="cc-assess-panel">
      <h4>Assigned / completed</h4>
      <ul class="cc-assess-list">
        <li v-for="a in assessments" :key="`${a.family}-${a.id}`" class="cc-assess-row">
          <div>
            <strong>{{ a.title }}</strong>
            <span class="cc-assess-badge" :class="statusClass(a.status)">{{ formatStatus(a.status) }}</span>
            <div class="cc-assess-meta">
              Created {{ formatWhen(a.createdAt) }}
              <template v-if="a.completedAt"> · Completed {{ formatWhen(a.completedAt) }}</template>
            </div>
          </div>
          <div class="cc-assess-actions">
            <button
              v-if="a.accessToken"
              type="button"
              class="cc-btn-soft"
              @click="openAssessment(a)"
            >
              Open
            </button>
          </div>
        </li>
        <li v-if="!loading && !assessments.length" class="muted">
          No assessments assigned yet. Pick a tool from the catalog above and click Assign.
        </li>
      </ul>
    </section>

    <section class="cc-assess-panel">
      <h4>Deliverables</h4>
      <ul class="cc-assess-list">
        <li v-for="d in deliverables" :key="d.id" class="cc-assess-row cc-assess-row--deliverable">
          <div>
            <strong>{{ d.title }}</strong>
            <span class="cc-assess-badge" :class="{ 'cc-assess-badge--warn': !d.sharedWithClient }">
              {{ d.sharedWithClient ? 'Shared' : 'Unshared' }}
            </span>
            <div class="cc-assess-meta">
              {{ familyLabel(d.assessmentFamily) }} · {{ d.kind }} · v{{ d.version }}
              · Updated {{ formatWhen(d.updatedAt) }}
            </div>
          </div>
          <div class="cc-assess-actions cc-assess-actions--wrap">
            <button type="button" class="cc-btn-soft" @click="openEditor(d)">Edit</button>
            <button type="button" class="cc-btn-soft" @click="download(d, 'pdf')">PDF</button>
            <button type="button" class="cc-btn-soft" @click="download(d, 'docx')">DOCX</button>
            <button type="button" class="cc-btn-soft" @click="download(d, 'txt')">TXT</button>
            <button type="button" class="cc-btn-soft" @click="download(d, 'google_doc')">Google Doc</button>
            <label class="cc-btn-soft cc-assess-file-btn">
              Replace
              <input type="file" hidden @change="(e) => onReplaceFile(d, e)" />
            </label>
            <button type="button" class="cc-btn-soft" @click="d.sharedWithClient ? unshare(d) : share(d)">
              {{ d.sharedWithClient ? 'Unshare' : 'Share' }}
            </button>
          </div>
        </li>
        <li v-if="!loading && !deliverables.length" class="muted">
          No deliverables yet. Complete a client-linked assessment to generate Results + Action Plan.
        </li>
      </ul>
    </section>

    <div v-if="editing" class="cc-assess-editor-modal" @click.self="editing = null">
      <div class="cc-assess-editor-panel" role="dialog" aria-modal="true">
        <div class="cc-assess-editor-head">
          <h3>Edit deliverable</h3>
          <button type="button" class="cc-btn-soft" @click="editing = null">✕</button>
        </div>
        <input v-model="editTitle" class="cc-assess-input" placeholder="Title" />
        <RichTextEditor :content="editContent" @update="onEditorUpdate" />
        <div class="cc-assess-editor-foot">
          <button type="button" class="cc-btn-soft" @click="editing = null">Cancel</button>
          <button type="button" class="cc-btn-primary" :disabled="saving" @click="saveEditor">
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
import {
  ASSESSMENT_TOOLS,
  CLINICAL_KIND_LABELS,
  getAssessmentTokenUrl
} from '../../navigation/toolsCatalog.js';
import ToolCard from '../tools/ToolCard.vue';
import RichTextEditor from './RichTextEditor.vue';
import '../../styles/client-encounters-tab.css';

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
const search = ref('');
const filterKind = ref('all');
const editing = ref(null);
const editTitle = ref('');
const editHtml = ref('');
const editContent = reactive({ content: '' });

const assessmentTools = computed(() => ASSESSMENT_TOOLS);

const completedCount = computed(() =>
  assessments.value.filter((a) => String(a.status || '').toLowerCase() === 'completed').length
);

const filteredTools = computed(() => {
  let list = assessmentTools.value;
  if (filterKind.value !== 'all') {
    list = list.filter((t) => t.clinicalKind === filterKind.value);
  }
  const q = String(search.value || '').trim().toLowerCase();
  if (!q) return list;
  return list.filter((t) => {
    const hay = [
      t.title,
      t.littleName,
      t.description,
      t.population,
      ...(t.tags || [])
    ].join(' ').toLowerCase();
    return hay.includes(q);
  });
});

function apiErrorMessage(e, fallback) {
  const err = e?.response?.data?.error;
  if (typeof err === 'string') return err;
  if (err?.message) return err.message;
  return e?.message || fallback;
}

function familyLabel(family) {
  const id = String(family || '').replace(/_/g, '-');
  return ASSESSMENT_TOOLS.find((t) => t.id === id)?.title || family;
}

function formatWhen(d) {
  if (!d) return '—';
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? String(d) : x.toLocaleString();
}

function formatStatus(status) {
  const s = String(status || 'pending').replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function statusClass(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'completed') return 'cc-assess-badge--ok';
  if (s === 'in_progress' || s === 'started') return 'cc-assess-badge--active';
  return '';
}

function toolTags(tool) {
  const tags = [CLINICAL_KIND_LABELS[tool.clinicalKind] || 'Assessment'];
  if (tool.tags?.length) tags.push(tool.tags[0]);
  return tags;
}

function toolMeta(tool) {
  return [tool.durationEstimate, tool.population].filter(Boolean);
}

function openGuestPreview(tool) {
  const slug = String(props.organizationSlug || '').trim();
  const base = String(tool.path || `/${tool.id}`).trim();
  const path = slug ? `/${slug}${base}` : base;
  window.open(path, '_blank', 'noopener');
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get(`/assessment-deliverables/clients/${props.clientId}`);
    assessments.value = res.data?.assessments || [];
    deliverables.value = res.data?.deliverables || [];
  } catch (e) {
    error.value = apiErrorMessage(e, 'Could not load assessments');
  } finally {
    loading.value = false;
  }
}

async function assignTool(tool) {
  if (!tool?.id || !props.agencyId) return;
  assigning.value = true;
  error.value = '';
  notice.value = '';
  try {
    const res = await api.post('/assessment-deliverables/assign', {
      family: tool.id,
      clientId: Number(props.clientId),
      agencyId: Number(props.agencyId),
      organizationSlug: props.organizationSlug || ''
    });
    const token = res.data?.accessToken;
    lastLink.value = token
      ? getAssessmentTokenUrl(
          window.location.origin,
          tool.path || `/${tool.id}`,
          token,
          props.organizationSlug
        )
      : `${window.location.origin}${res.data?.brandedPath || res.data?.shortPath || ''}`;
    notice.value = `${tool.title} assigned — copy the link below to share with the client`;
    await load();
  } catch (e) {
    error.value = apiErrorMessage(e, 'Assign failed');
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
    error.value = apiErrorMessage(e, 'Save failed');
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
    error.value = apiErrorMessage(e, 'Export failed');
  }
}

async function share(d) {
  try {
    await api.post(`/assessment-deliverables/${d.id}/share`);
    notice.value = 'Shared with client';
    await load();
  } catch (e) {
    error.value = apiErrorMessage(e, 'Share failed');
  }
}

async function unshare(d) {
  try {
    await api.post(`/assessment-deliverables/${d.id}/unshare`);
    notice.value = 'Unshared';
    await load();
  } catch (e) {
    error.value = apiErrorMessage(e, 'Unshare failed');
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
    error.value = apiErrorMessage(e, 'Replace failed');
  }
}

onMounted(load);
watch(() => props.clientId, load);
</script>

<style scoped>
.cc-assess-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.cc-assess-panel {
  padding: 14px 16px;
  border-radius: 12px;
  background: var(--cc-card, #fff);
  border: 1px solid color-mix(in srgb, var(--cc-accent, var(--accent)) 14%, var(--cc-border, #e2e8f0));
}

.cc-assess-panel h4 {
  margin: 0 0 12px;
  font-size: 16px;
  font-weight: 800;
  color: var(--cc-secondary, var(--secondary, #1d2633));
}

.cc-assess-panel__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.cc-assess-panel__head h4 {
  margin: 0;
}

.cc-assess-filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  min-width: min(100%, 360px);
}

.cc-assess-select {
  border: 1px solid var(--cc-border, #e2e8f0);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
  background: #fff;
}

.cc-assess-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
}

.cc-assess-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cc-assess-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  padding: 12px;
  border: 1px solid var(--cc-border, #e2e8f0);
  border-radius: 10px;
  background: #fff;
}

.cc-assess-meta {
  font-size: 12px;
  color: var(--text-secondary, #64748b);
  margin-top: 4px;
}

.cc-assess-badge {
  display: inline-block;
  margin-left: 8px;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
  background: #e8f0ec;
  color: #1b4332;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  vertical-align: middle;
}

.cc-assess-badge--ok { background: #dcfce7; color: #166534; }
.cc-assess-badge--active { background: #dbeafe; color: #1e40af; }
.cc-assess-badge--warn { background: #fef3c7; color: #92400e; }

.cc-assess-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.cc-assess-actions--wrap {
  flex-wrap: wrap;
  max-width: 28rem;
  justify-content: flex-end;
}

.cc-assess-actions .cc-btn-soft,
.cc-assess-copy {
  width: auto;
  padding: 6px 10px;
  font-size: 12px;
}

.cc-assess-error { color: #b91c1c; font-size: 13px; margin: 0; }
.cc-assess-notice { color: #166534; font-size: 13px; margin: 0; }
.cc-assess-link-row { font-size: 13px; word-break: break-all; margin: 0; }
.cc-assess-empty { grid-column: 1 / -1; color: var(--text-secondary, #64748b); }
.cc-assess-file-btn { display: inline-flex; align-items: center; cursor: pointer; }

.cc-assess-input {
  border: 1px solid var(--cc-border, #e2e8f0);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 14px;
}

.cc-assess-editor-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.cc-assess-editor-panel {
  background: #fff;
  border-radius: 12px;
  width: min(880px, 100%);
  max-height: 90vh;
  overflow: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cc-assess-editor-head,
.cc-assess-editor-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.muted { color: var(--text-secondary, #64748b); }
</style>
