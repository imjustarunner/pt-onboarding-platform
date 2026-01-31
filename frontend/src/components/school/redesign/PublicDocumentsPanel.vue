<template>
  <div class="public-docs">
    <div class="public-docs-header">
      <div>
        <h2 style="margin:0;">Docs / Links</h2>
        <div class="muted" style="margin-top: 4px;">
          Shared to <strong>school staff</strong>, <strong>assigned providers</strong>, and <strong>agency staff/admin/support</strong> with access to this school.
          Do not upload PHI.
        </div>
      </div>
      <button class="btn btn-secondary btn-sm" type="button" @click="load" :disabled="loading">
        {{ loading ? 'Loading…' : 'Refresh' }}
      </button>
    </div>

    <div v-if="error" class="error" style="margin-top: 10px;">{{ error }}</div>

    <div class="add-panels">
      <div class="card">
        <div class="card-header" style="display:flex; align-items:center; justify-content: space-between; gap: 10px;">
          <h3 style="margin:0;">Add file</h3>
        </div>
        <div class="form-grid public-docs-form-grid">
          <div class="form-group">
            <label>Title</label>
            <input v-model="newDoc.title" type="text" placeholder="e.g. 2026 District Calendar" :disabled="uploading" />
          </div>
          <div class="form-group">
            <label>Category</label>
            <select v-model="newDoc.categoryKey" :disabled="uploading">
              <option value="">General</option>
              <option value="district_calendar">District calendar</option>
              <option value="school_calendar">School calendar</option>
              <option value="bell_schedule">Bell schedule</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div class="form-group">
            <label>File</label>
            <input ref="newFileInput" type="file" @change="onPickNewFile" :disabled="uploading" />
            <small class="form-help">PDF, JPG, PNG, DOCX, XLSX (max 15MB).</small>
          </div>
          <div class="form-group form-group-full" style="display:flex; gap: 8px; align-items:center;">
            <button class="btn btn-primary btn-sm" type="button" @click="upload" :disabled="uploading || !newFile">
              {{ uploading ? 'Uploading…' : 'Upload' }}
            </button>
            <div v-if="uploadError" class="error" style="margin:0;">{{ uploadError }}</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header" style="display:flex; align-items:center; justify-content: space-between; gap: 10px;">
          <h3 style="margin:0;">Add link</h3>
        </div>
        <div class="form-grid public-docs-form-grid">
          <div class="form-group">
            <label>Title</label>
            <input v-model="newLink.title" type="text" placeholder="e.g. District calendar (web)" :disabled="linkSaving" />
          </div>
          <div class="form-group">
            <label>Category</label>
            <select v-model="newLink.categoryKey" :disabled="linkSaving">
              <option value="">General</option>
              <option value="district_calendar">District calendar</option>
              <option value="school_calendar">School calendar</option>
              <option value="bell_schedule">Bell schedule</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div class="form-group">
            <label>URL</label>
            <input v-model="newLink.linkUrl" type="url" placeholder="https://…" :disabled="linkSaving" />
            <small class="form-help">Must be http(s). Consider using a share link.</small>
          </div>
          <div class="form-group form-group-full" style="display:flex; gap: 8px; align-items:center;">
            <button class="btn btn-primary btn-sm" type="button" @click="createLink" :disabled="linkSaving || !newLink.linkUrl">
              {{ linkSaving ? 'Saving…' : 'Add link' }}
            </button>
            <div v-if="linkError" class="error" style="margin:0;">{{ linkError }}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top: 12px;">
      <div class="card-header" style="display:flex; align-items:center; justify-content: space-between; gap: 10px;">
        <h3 style="margin:0;">Library</h3>
        <div class="muted" style="font-size: 12px;">{{ docs.length }} item(s)</div>
      </div>

      <div v-if="loading" class="loading" style="margin-top: 10px;">Loading documents…</div>
      <div v-else-if="!docs.length" class="empty-state" style="margin-top: 10px;">
        No documents yet.
      </div>
      <div v-else class="table-wrap" style="margin-top: 10px;">
        <table class="table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Category</th>
              <th>Updated</th>
              <th class="right"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in docs" :key="d.id">
              <td>
                <template v-if="editingId === d.id">
                  <div class="edit-stack">
                    <input v-model="editDraft.title" type="text" />
                    <div v-if="String(d.kind || '').toLowerCase() === 'link'" class="edit-subrow">
                      <div class="edit-subrow-label muted">URL</div>
                      <input v-model="editDraft.linkUrl" type="url" placeholder="https://…" />
                    </div>
                  </div>
                </template>
                <template v-else>
                  <strong>{{ d.title || d.original_filename || `Document #${d.id}` }}</strong>
                  <div class="muted" style="font-size: 12px; margin-top: 2px;">
                    <span v-if="String(d.kind || '').toLowerCase() === 'link'">{{ d.link_url || '—' }}</span>
                    <span v-else>{{ d.original_filename || '—' }}</span>
                  </div>
                </template>
              </td>
              <td>
                <template v-if="editingId === d.id">
                  <select v-model="editDraft.categoryKey">
                    <option value="">General</option>
                    <option value="district_calendar">District calendar</option>
                    <option value="school_calendar">School calendar</option>
                    <option value="bell_schedule">Bell schedule</option>
                    <option value="other">Other</option>
                  </select>
                </template>
                <template v-else>
                  <span class="muted">{{ formatCategory(d.category_key) }}</span>
                </template>
              </td>
              <td class="muted">{{ formatDate(d.updated_at) }}</td>
              <td class="right">
                <a
                  v-if="String(d.kind || '').toLowerCase() === 'link' && d.link_url"
                  class="btn btn-secondary btn-sm"
                  :href="d.link_url"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open
                </a>
                <a
                  v-else
                  class="btn btn-secondary btn-sm"
                  :href="toUploadsUrl(d.file_path)"
                  target="_blank"
                  rel="noreferrer"
                >
                  View
                </a>
                <button class="btn btn-secondary btn-sm" type="button" @click="printItem(d)">
                  Print
                </button>
                <a
                  v-if="String(d.kind || '').toLowerCase() !== 'link' && d.file_path"
                  class="btn btn-secondary btn-sm"
                  :href="toUploadsUrl(d.file_path)"
                  download
                  rel="noreferrer"
                >
                  Download
                </a>
                <button
                  v-if="editingId !== d.id"
                  class="btn btn-secondary btn-sm"
                  type="button"
                  @click="startEdit(d)"
                >
                  Edit
                </button>
                <button
                  v-if="editingId === d.id"
                  class="btn btn-primary btn-sm"
                  type="button"
                  @click="saveMeta(d)"
                  :disabled="savingId === d.id"
                >
                  {{ savingId === d.id ? 'Saving…' : 'Save' }}
                </button>
                <button
                  v-if="editingId === d.id"
                  class="btn btn-secondary btn-sm"
                  type="button"
                  @click="cancelEdit"
                  :disabled="savingId === d.id"
                >
                  Cancel
                </button>

                <label class="btn btn-secondary btn-sm" style="cursor:pointer;">
                  <template v-if="String(d.kind || '').toLowerCase() !== 'link'">
                    {{ replacingId === d.id ? 'Replacing…' : 'Replace' }}
                    <input
                      type="file"
                      style="display:none;"
                      :disabled="replacingId === d.id"
                      @change="onReplaceFile(d, $event)"
                    />
                  </template>
                </label>

                <button
                  class="btn btn-danger btn-sm"
                  type="button"
                  @click="remove(d)"
                  :disabled="deletingId === d.id"
                >
                  {{ deletingId === d.id ? 'Deleting…' : 'Delete' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '../../../services/api';
import { toUploadsUrl } from '../../../utils/uploadsUrl';

const props = defineProps({
  schoolOrganizationId: { type: [Number, String], required: true }
});

const docs = ref([]);
const loading = ref(false);
const error = ref('');

const newDoc = ref({ title: '', categoryKey: '' });
const newFileInput = ref(null);
const newFile = ref(null);
const uploading = ref(false);
const uploadError = ref('');

const newLink = ref({ title: '', categoryKey: '', linkUrl: '' });
const linkSaving = ref(false);
const linkError = ref('');

const editingId = ref(null);
const editDraft = ref({ title: '', categoryKey: '' });
const savingId = ref(null);
const replacingId = ref(null);
const deletingId = ref(null);

const formatDate = (iso) => {
  const s = String(iso || '').trim();
  if (!s) return '—';
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleString();
  } catch {
    return s;
  }
};

const formatCategory = (k) => {
  const v = String(k || '').trim();
  if (!v) return 'General';
  if (v === 'district_calendar') return 'District calendar';
  if (v === 'school_calendar') return 'School calendar';
  if (v === 'bell_schedule') return 'Bell schedule';
  return v;
};

const openPrintWindow = ({ url, title }) => {
  const href = String(url || '').trim();
  if (!href) return;

  // Same-origin wrapper so users can print PDFs/images reliably.
  // For cross-origin links that block iframes, the user can still click Open.
  const w = window.open('', '_blank', 'noopener,noreferrer');
  if (!w) return;

  const safeTitle = String(title || 'Document')
    .replace(/[<>]/g, '')
    .slice(0, 140);
  const safeUrl = href.replace(/"/g, '&quot;');

  w.document.open();
  w.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
    <style>
      html, body { height: 100%; margin: 0; }
      .bar { display: flex; gap: 8px; align-items: center; padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; }
      .bar .title { font-weight: 700; font-size: 14px; color: #111827; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .bar a, .bar button { font-size: 13px; padding: 6px 10px; border-radius: 8px; border: 1px solid #d1d5db; background: #fff; color: #111827; text-decoration: none; cursor: pointer; }
      .note { padding: 10px 12px; font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; font-size: 12px; color: #6b7280; border-bottom: 1px solid #f3f4f6; }
      .frame { width: 100%; height: calc(100% - 92px); border: 0; }
      @media print { .bar, .note { display: none; } .frame { height: 100%; } }
    </style>
  </head>
  <body>
    <div class="bar">
      <div class="title">${safeTitle}</div>
      <a href="${safeUrl}" target="_blank" rel="noreferrer">Open</a>
      <a href="${safeUrl}" target="_blank" rel="noreferrer" download>Download</a>
      <button onclick="window.print()">Print</button>
    </div>
    <div class="note">If this content does not display below, the source site may block embedding. Use “Open” then print from your browser.</div>
    <iframe class="frame" src="${safeUrl}" title="${safeTitle}"></iframe>
  </body>
</html>`);
  w.document.close();
};

const printItem = (d) => {
  const kind = String(d?.kind || '').toLowerCase();
  const title = d?.title || d?.original_filename || `Document #${d?.id || ''}`;
  const url = kind === 'link' ? d?.link_url : toUploadsUrl(d?.file_path);
  openPrintWindow({ url, title });
};

const load = async () => {
  try {
    loading.value = true;
    error.value = '';
    const r = await api.get(`/school-portal/${props.schoolOrganizationId}/public-documents`, { params: { _ts: Date.now() } });
    docs.value = Array.isArray(r.data?.documents) ? r.data.documents : [];
  } catch (e) {
    docs.value = [];
    error.value = e.response?.data?.error?.message || 'Failed to load documents';
  } finally {
    loading.value = false;
  }
};

const onPickNewFile = (evt) => {
  const f = evt?.target?.files?.[0] || null;
  newFile.value = f;
};

const upload = async () => {
  if (!newFile.value) return;
  try {
    uploading.value = true;
    uploadError.value = '';
    const fd = new FormData();
    fd.append('file', newFile.value);
    fd.append('title', String(newDoc.value.title || '').trim());
    fd.append('categoryKey', String(newDoc.value.categoryKey || '').trim());
    await api.post(`/school-portal/${props.schoolOrganizationId}/public-documents`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    newDoc.value = { title: '', categoryKey: '' };
    newFile.value = null;
    if (newFileInput.value) newFileInput.value.value = '';
    await load();
  } catch (e) {
    uploadError.value = e.response?.data?.error?.message || 'Failed to upload';
  } finally {
    uploading.value = false;
  }
};

const createLink = async () => {
  const linkUrl = String(newLink.value.linkUrl || '').trim();
  if (!linkUrl) return;
  try {
    linkSaving.value = true;
    linkError.value = '';
    await api.post(`/school-portal/${props.schoolOrganizationId}/public-documents`, {
      title: String(newLink.value.title || '').trim(),
      categoryKey: String(newLink.value.categoryKey || '').trim(),
      linkUrl
    });
    newLink.value = { title: '', categoryKey: '', linkUrl: '' };
    await load();
  } catch (e) {
    linkError.value = e.response?.data?.error?.message || 'Failed to add link';
  } finally {
    linkSaving.value = false;
  }
};

const startEdit = (d) => {
  editingId.value = d.id;
  editDraft.value = {
    title: d.title || '',
    categoryKey: d.category_key || '',
    linkUrl: d.link_url || ''
  };
};

const cancelEdit = () => {
  editingId.value = null;
  editDraft.value = { title: '', categoryKey: '' };
};

const saveMeta = async (d) => {
  if (!d?.id) return;
  try {
    savingId.value = d.id;
    const payload = {
      title: String(editDraft.value.title || '').trim(),
      categoryKey: String(editDraft.value.categoryKey || '').trim()
    };
    if (String(d.kind || '').toLowerCase() === 'link') {
      payload.linkUrl = String(editDraft.value.linkUrl || '').trim();
    }
    await api.put(`/school-portal/${props.schoolOrganizationId}/public-documents/${d.id}`, payload);
    await load();
    cancelEdit();
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to save');
  } finally {
    savingId.value = null;
  }
};

const onReplaceFile = async (d, evt) => {
  const f = evt?.target?.files?.[0] || null;
  if (!f || !d?.id) return;
  try {
    replacingId.value = d.id;
    const fd = new FormData();
    fd.append('file', f);
    await api.put(`/school-portal/${props.schoolOrganizationId}/public-documents/${d.id}/file`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    await load();
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to replace file');
  } finally {
    replacingId.value = null;
    // reset input
    try { evt.target.value = ''; } catch { /* ignore */ }
  }
};

const remove = async (d) => {
  if (!d?.id) return;
  const label = d.title || d.original_filename || `Document #${d.id}`;
  const ok = window.confirm(`Delete "${label}"? This cannot be undone.`);
  if (!ok) return;
  try {
    deletingId.value = d.id;
    await api.delete(`/school-portal/${props.schoolOrganizationId}/public-documents/${d.id}`);
    await load();
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to delete');
  } finally {
    deletingId.value = null;
  }
};

onMounted(load);
</script>

<style scoped>
.public-docs {
  width: 100%;
  max-width: none;
  margin: 0;
}

.add-panels {
  margin-top: 12px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  align-items: start;
}
@media (min-width: 980px) {
  .add-panels {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
}

.public-docs-form-grid {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) 180px minmax(220px, 1fr);
  gap: 8px;
  margin-top: 8px;
}
@media (max-width: 980px) {
  .public-docs-form-grid {
    grid-template-columns: 1fr;
  }
}

.public-docs-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}
.muted {
  color: var(--text-secondary);
}

/* Make this panel compact (forms + table) without affecting the rest of the app */
.public-docs :deep(.card) {
  padding: 12px !important;
}
.public-docs :deep(.card-header) {
  padding: 0 !important;
  margin-bottom: 8px;
}
.public-docs :deep(.card-header h3) {
  font-size: 14px;
}

.public-docs :deep(.form-grid) {
  gap: 8px !important;
  margin-top: 8px !important;
}
.public-docs :deep(.form-group) {
  margin: 0 !important;
}
.public-docs :deep(.form-group label) {
  font-size: 12px;
  margin-bottom: 4px;
}
.public-docs :deep(.form-help) {
  font-size: 11px;
  margin-top: 4px;
}

.public-docs :deep(input),
.public-docs :deep(select),
.public-docs :deep(textarea) {
  font-size: 13px;
  padding: 6px 10px;
  min-height: 32px;
}
.public-docs :deep(textarea) {
  min-height: 80px;
}

/* Compact the library table rows */
.public-docs .table th,
.public-docs .table td {
  padding: 8px 10px;
  line-height: 1.2;
}
.public-docs .table th {
  font-size: 12px;
}
.public-docs .table td {
  font-size: 13px;
  vertical-align: top;
}
.public-docs .table strong {
  font-size: 13px;
  font-weight: 700;
}
.public-docs .table .muted {
  font-size: 11px !important;
}

.public-docs .table input,
.public-docs .table select {
  font-size: 13px;
  padding: 6px 8px;
  min-height: 30px;
}

.public-docs .btn.btn-sm {
  padding: 4px 8px;
  font-size: 12px;
}

.public-docs td.right {
  white-space: nowrap;
}
.public-docs td.right .btn {
  margin-left: 6px;
}
.public-docs td.right .btn:first-child {
  margin-left: 0;
}

.edit-stack {
  display: grid;
  gap: 6px;
}
.edit-subrow {
  display: grid;
  grid-template-columns: 46px 1fr;
  gap: 8px;
  align-items: center;
}
.edit-subrow-label {
  font-size: 11px;
  font-weight: 600;
}
</style>

