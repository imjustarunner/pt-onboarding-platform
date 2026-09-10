<template>
  <div class="lib-modal-backdrop" @click.self="$emit('close')">
    <div class="lib-modal" role="dialog" aria-modal="true" aria-labelledby="lib-add-title">
      <header class="lib-modal__head">
        <h2 id="lib-add-title">Add Resource</h2>
        <button type="button" class="lib-modal__x" aria-label="Close" @click="$emit('close')">×</button>
      </header>

      <div class="lib-modal__tabs">
        <button
          v-for="t in tabs"
          :key="t.id"
          type="button"
          class="lib-modal__tab"
          :class="{ 'is-active': mode === t.id }"
          @click="setMode(t.id)"
        >
          {{ t.label }}
        </button>
      </div>

      <div class="lib-modal__body">
        <template v-if="mode === 'upload'">
          <label class="lib-field">
            <span>File</span>
            <input type="file" @change="onFile" />
          </label>
          <label class="lib-field">
            <span>Resource name</span>
            <input v-model="form.name" type="text" placeholder="Suggested from filename" />
          </label>
        </template>

        <template v-else-if="mode === 'upload_folder'">
          <label class="lib-field">
            <span>Folder</span>
            <input type="file" webkitdirectory multiple @change="onFolderFiles" />
          </label>
          <p class="lib-hint">
            Uploads the selected folder as nested subfolders and files under the destination folder below.
            All files are view-only.
          </p>
          <p v-if="folderFiles.length" class="lib-hint">
            {{ folderFiles.length }} file{{ folderFiles.length === 1 ? '' : 's' }} selected
          </p>
        </template>

        <template v-else-if="mode === 'link'">
          <label class="lib-field">
            <span>Resource name</span>
            <input v-model="form.name" type="text" placeholder="e.g. Safety Plan Template" />
          </label>
          <label class="lib-field">
            <span>URL</span>
            <input
              v-model="form.url"
              type="url"
              placeholder="https://docs.google.com/document/d/… or any https link"
            />
          </label>
          <p class="lib-hint">
            Links and Google Docs are view-only in the Library. For editable personal copies or collaboration,
            use <strong>Create branded document</strong>.
          </p>
          <div v-if="googlePreview" class="lib-live-preview">
            <div class="lib-live-preview__label">In-app preview</div>
            <iframe :src="googlePreview" title="Google preview" class="lib-live-preview__frame" />
          </div>
        </template>

        <template v-else-if="mode === 'branded'">
          <label class="lib-field">
            <span>Document name</span>
            <input v-model="form.name" type="text" placeholder="e.g. Safety Plan" />
          </label>
          <label class="lib-field">
            <span>Letterhead</span>
            <select v-model="form.letterheadTemplateId">
              <option value="">Default / none</option>
              <option v-for="lh in letterheads" :key="lh.id" :value="String(lh.id)">
                {{ lh.name }}{{ lh.isPlatform ? ' (platform)' : '' }}
              </option>
            </select>
          </label>
          <div class="lib-branded-editor">
            <HtmlDocumentBuilder v-model="form.bodyHtml" :paper-mode="true" />
          </div>
        </template>

        <template v-else>
          <label class="lib-field">
            <span>Folder name</span>
            <input v-model="form.name" type="text" placeholder="e.g. Care Documents, Research Articles" />
          </label>
          <label class="lib-field">
            <span>Description (optional)</span>
            <textarea v-model="form.description" rows="2" />
          </label>
        </template>

        <div class="lib-scope">
          <span class="lib-scope__label">Who is this for?</span>
          <div class="lib-scope__options">
            <label
              v-if="canManage"
              class="lib-scope__opt"
              :class="{ 'is-active': form.scope === 'organization' }"
            >
              <input v-model="form.scope" type="radio" value="organization" />
              <span>
                <strong>Everyone</strong>
                <small>Shared with the whole organization</small>
              </span>
            </label>
            <label class="lib-scope__opt lib-scope__opt--mine" :class="{ 'is-active': form.scope === 'personal' }">
              <input v-model="form.scope" type="radio" value="personal" />
              <span>
                <strong>Just me</strong>
                <small>Personal — you can share the folder later</small>
              </span>
            </label>
          </div>
        </div>

        <div v-if="showsShareModes" class="lib-share-modes">
          <span class="lib-scope__label">When you share it, how should people receive it?</span>
          <p class="lib-hint lib-share-modes__hint">
            <template v-if="isEditableMode">
              Branded documents can be shared as personal copies, collaboration on the master, or view-only.
            </template>
            <template v-else>
              Uploaded files and links are view-only (they are not editable in the app).
            </template>
          </p>
          <div class="lib-share-modes__grid">
            <button
              v-if="isEditableMode"
              type="button"
              class="lib-share-mode"
              :class="{ 'is-active': form.shareMode === 'personal_copy' }"
              @click="form.shareMode = 'personal_copy'"
            >
              <strong>Personal copy</strong>
              <small>Each person gets their own editable copy. Their edits stay private.</small>
            </button>
            <button
              v-if="isEditableMode"
              type="button"
              class="lib-share-mode"
              :class="{ 'is-active': form.shareMode === 'collaborate' }"
              @click="form.shareMode = 'collaborate'"
            >
              <strong>Collaborate</strong>
              <small>Same shared document — permitted people edit the master together.</small>
            </button>
            <button
              type="button"
              class="lib-share-mode"
              :class="{ 'is-active': form.shareMode === 'view_only' }"
              @click="form.shareMode = 'view_only'"
            >
              <strong>View only</strong>
              <small>Same document — they can open it, but cannot edit the master.</small>
            </button>
            <button
              type="button"
              class="lib-share-mode lib-share-mode--later"
              :class="{ 'is-active': form.shareMode === 'later' }"
              @click="form.shareMode = 'later'"
            >
              <strong>Distribute later</strong>
              <small>Just add it to the Library for now. You can distribute anytime.</small>
            </button>
          </div>
        </div>

        <template v-if="showsMetadata">
          <div class="lib-ai-row">
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              :disabled="aiBusy"
              @click="runAiSuggest"
            >
              {{ aiBusy ? 'Suggesting…' : 'Use AI suggestion' }}
            </button>
            <button
              v-if="aiApplied"
              type="button"
              class="btn btn-ghost btn-sm"
              @click="clearAiSuggest"
            >
              Clear AI suggestion
            </button>
          </div>
          <label class="lib-field">
            <span>Description</span>
            <textarea v-model="form.description" rows="2" placeholder="When should this be used?" />
          </label>
          <div class="lib-row">
            <label class="lib-field">
              <span>Category</span>
              <select v-model="form.categoryId">
                <option value="">None</option>
                <option v-for="c in categories" :key="c.id" :value="String(c.id)">{{ c.name }}</option>
              </select>
            </label>
            <label class="lib-field">
              <span>Folder</span>
              <select v-model="form.folderId">
                <option value="">None</option>
                <option v-for="f in folders" :key="f.id" :value="String(f.id)">
                  {{ f.name }}{{ f.scope === 'personal' || f.isMine ? ' (mine)' : '' }}
                </option>
              </select>
            </label>
          </div>
          <label class="lib-field">
            <span>Tags (comma-separated)</span>
            <input v-model="form.tags" type="text" placeholder="Crisis, School, Intake" />
          </label>
          <label v-if="canManage && form.scope === 'organization'" class="lib-check">
            <input v-model="form.featured" type="checkbox" />
            Featured resource
          </label>
        </template>

        <p v-if="error" class="lib-error">{{ error }}</p>
      </div>

      <footer class="lib-modal__foot">
        <button type="button" class="btn btn-secondary" :disabled="saving" @click="$emit('close')">
          Cancel
        </button>
        <button type="button" class="btn btn-primary" :disabled="saving" @click="submit">
          {{ saving ? 'Saving…' : submitLabel }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import {
  getGoogleWorkspacePreviewUrl,
  isGoogleWorkspaceUrl
} from '../../utils/googleWorkspacePreview.js';
import HtmlDocumentBuilder from '../documents/HtmlDocumentBuilder.vue';
import {
  uploadLibraryResource,
  uploadLibraryBatch,
  addLibraryLink,
  createLibraryFolder,
  createLibraryBrandedDoc,
  suggestLibraryMetadata,
  fetchLibraryLetterheads
} from '../../services/library.js';

const props = defineProps({
  categories: { type: Array, default: () => [] },
  folders: { type: Array, default: () => [] },
  defaultFolderId: { type: [String, Number], default: '' },
  initialMode: { type: String, default: 'link' },
  canManage: { type: Boolean, default: false }
});

const emit = defineEmits(['close', 'created']);

const tabs = [
  { id: 'upload', label: 'Upload file' },
  { id: 'upload_folder', label: 'Upload folder' },
  { id: 'link', label: 'Google Doc / Link' },
  { id: 'branded', label: 'Create branded document' },
  { id: 'folder', label: 'Create folder' }
];

const mode = ref(
  tabs.some((t) => t.id === props.initialMode) ? props.initialMode : 'link'
);
const saving = ref(false);
const aiBusy = ref(false);
const aiApplied = ref(false);
const error = ref('');
const file = ref(null);
const folderFiles = ref([]);
const letterheads = ref([]);
const aiSnapshot = ref(null);

const form = reactive({
  name: '',
  url: '',
  description: '',
  categoryId: '',
  folderId: props.defaultFolderId ? String(props.defaultFolderId) : '',
  tags: '',
  featured: false,
  scope: props.canManage ? 'organization' : 'personal',
  shareMode: 'view_only',
  bodyHtml: '<p></p>',
  letterheadTemplateId: ''
});

const isEditableMode = computed(() => mode.value === 'branded');
const showsShareModes = computed(() => !['folder', 'upload_folder'].includes(mode.value));
const showsMetadata = computed(() => mode.value !== 'folder');
const submitLabel = computed(() => {
  if (mode.value === 'folder') return 'Create folder';
  if (mode.value === 'upload_folder') return 'Upload folder';
  if (mode.value === 'branded') return 'Save document';
  return 'Add resource';
});

watch(
  () => props.defaultFolderId,
  (v) => {
    if (v) form.folderId = String(v);
  }
);

watch(
  () => props.canManage,
  (v) => {
    if (!v) form.scope = 'personal';
  },
  { immediate: true }
);

watch(isEditableMode, (editable) => {
  if (!editable && ['personal_copy', 'collaborate'].includes(form.shareMode)) {
    form.shareMode = 'view_only';
  }
  if (editable && form.shareMode === 'view_only') {
    form.shareMode = 'personal_copy';
  }
}, { immediate: true });

const googlePreview = computed(() => {
  if (mode.value !== 'link') return null;
  if (!isGoogleWorkspaceUrl(form.url)) return null;
  return getGoogleWorkspacePreviewUrl(form.url);
});

onMounted(async () => {
  try {
    letterheads.value = await fetchLibraryLetterheads();
  } catch {
    letterheads.value = [];
  }
});

function setMode(id) {
  mode.value = id;
  error.value = '';
}

function onFile(e) {
  const f = e.target?.files?.[0] || null;
  file.value = f;
  if (f && !form.name) {
    form.name = String(f.name || '').replace(/\.[^.]+$/, '');
  }
}

function onFolderFiles(e) {
  folderFiles.value = Array.from(e.target?.files || []);
}

async function runAiSuggest() {
  error.value = '';
  aiBusy.value = true;
  try {
    let suggestion;
    if (mode.value === 'upload' && file.value) {
      const fd = new FormData();
      fd.append('file', file.value);
      if (form.name) fd.append('name', form.name);
      suggestion = await suggestLibraryMetadata(fd);
    } else {
      suggestion = await suggestLibraryMetadata({
        name: form.name,
        filename: file.value?.name || '',
        url: form.url || '',
        textExcerpt: mode.value === 'branded'
          ? String(form.bodyHtml || '').replace(/<[^>]+>/g, ' ').slice(0, 6000)
          : ''
      });
    }
    if (!aiSnapshot.value) {
      aiSnapshot.value = {
        description: form.description,
        categoryId: form.categoryId,
        tags: form.tags
      };
    }
    if (suggestion?.description) form.description = suggestion.description;
    if (suggestion?.categoryId != null) form.categoryId = String(suggestion.categoryId);
    if (Array.isArray(suggestion?.tags) && suggestion.tags.length) {
      form.tags = suggestion.tags.join(', ');
    }
    aiApplied.value = true;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'AI suggestion failed';
  } finally {
    aiBusy.value = false;
  }
}

function clearAiSuggest() {
  if (aiSnapshot.value) {
    form.description = aiSnapshot.value.description;
    form.categoryId = aiSnapshot.value.categoryId;
    form.tags = aiSnapshot.value.tags;
  }
  aiSnapshot.value = null;
  aiApplied.value = false;
}

async function submit() {
  error.value = '';
  saving.value = true;
  try {
    const shareMode = ['personal_copy', 'collaborate', 'view_only'].includes(form.shareMode)
      ? form.shareMode
      : null;

    if (mode.value === 'folder') {
      if (!form.name.trim()) throw new Error('Folder name is required');
      const folder = await createLibraryFolder({
        name: form.name.trim(),
        description: form.description || null,
        parentFolderId: form.folderId || null,
        scope: form.scope
      });
      emit('created', { kind: 'folder', item: folder });
      emit('close');
      return;
    }

    if (mode.value === 'upload_folder') {
      if (!folderFiles.value.length) throw new Error('Choose a folder to upload');
      const fd = new FormData();
      fd.append('scope', form.scope);
      if (form.folderId) fd.append('folderId', form.folderId);
      if (form.categoryId) fd.append('categoryId', form.categoryId);
      for (const f of folderFiles.value) {
        fd.append('files', f);
        fd.append('relativePath', f.webkitRelativePath || f.name);
      }
      const result = await uploadLibraryBatch(fd);
      emit('created', { kind: 'batch', item: result, shareMode: 'view_only' });
      emit('close');
      return;
    }

    if (mode.value === 'upload') {
      if (!file.value) throw new Error('Choose a file to upload');
      const fd = new FormData();
      fd.append('file', file.value);
      fd.append('name', form.name.trim() || file.value.name);
      fd.append('scope', form.scope);
      if (form.description) fd.append('description', form.description);
      if (form.categoryId) fd.append('categoryId', form.categoryId);
      if (form.folderId) fd.append('folderId', form.folderId);
      if (form.tags) fd.append('tags', form.tags);
      if (form.featured && form.scope === 'organization') fd.append('featured', '1');
      const item = await uploadLibraryResource(fd);
      emit('created', { kind: 'resource', item, shareMode: shareMode === 'view_only' ? shareMode : 'view_only' });
      emit('close');
      return;
    }

    if (mode.value === 'branded') {
      if (!form.name.trim()) throw new Error('Document name is required');
      if (!String(form.bodyHtml || '').replace(/<[^>]+>/g, '').trim()) {
        throw new Error('Add some document content');
      }
      const item = await createLibraryBrandedDoc({
        name: form.name.trim(),
        bodyHtml: form.bodyHtml,
        letterheadTemplateId: form.letterheadTemplateId || null,
        description: form.description || null,
        categoryId: form.categoryId || null,
        folderId: form.folderId || null,
        scope: form.scope,
        tags: form.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        featured: form.scope === 'organization' && form.featured
      });
      emit('created', { kind: 'resource', item, shareMode });
      emit('close');
      return;
    }

    if (!form.name.trim()) throw new Error('Resource name is required');
    if (!form.url.trim()) throw new Error('URL is required');
    const item = await addLibraryLink({
      name: form.name.trim(),
      url: form.url.trim(),
      description: form.description || null,
      categoryId: form.categoryId || null,
      folderId: form.folderId || null,
      scope: form.scope,
      tags: form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      featured: form.scope === 'organization' && form.featured
    });
    emit('created', { kind: 'resource', item, shareMode: 'view_only' });
    emit('close');
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Could not save';
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.lib-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.lib-modal {
  width: min(820px, 100%);
  max-height: min(92vh, 960px);
  overflow: auto;
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.25);
}

.lib-modal__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.15rem;
  border-bottom: 1px solid #e5e7eb;
}

.lib-modal__head h2 {
  margin: 0;
  font-size: 1.15rem;
}

.lib-modal__x {
  border: 0;
  background: transparent;
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  color: #64748b;
}

.lib-modal__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  padding: 0.75rem 1.15rem 0;
}

.lib-modal__tab {
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  border-radius: 8px;
  padding: 0.45rem 0.75rem;
  font-size: 0.85rem;
  cursor: pointer;
}

.lib-modal__tab.is-active {
  background: #166534;
  border-color: #166534;
  color: #fff;
}

.lib-modal__body {
  padding: 1rem 1.15rem;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.lib-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.85rem;
  color: #334155;
}

.lib-field input,
.lib-field select,
.lib-field textarea {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 0.55rem 0.7rem;
  font: inherit;
}

.lib-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.lib-check {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
}

.lib-hint {
  margin: 0;
  font-size: 0.8rem;
  color: #64748b;
  line-height: 1.4;
}

.lib-ai-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.lib-branded-editor {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
  max-height: 360px;
  overflow-y: auto;
}

.lib-scope {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 0.75rem;
  background: #f8fafc;
}

.lib-scope__label {
  display: block;
  font-size: 0.8rem;
  font-weight: 650;
  color: #475569;
  margin-bottom: 0.55rem;
}

.lib-scope__options {
  display: grid;
  gap: 0.45rem;
}

.lib-scope__opt {
  display: flex;
  gap: 0.65rem;
  align-items: flex-start;
  padding: 0.55rem 0.65rem;
  border-radius: 8px;
  border: 1px solid transparent;
  cursor: pointer;
}

.lib-scope__opt.is-active {
  border-color: #86efac;
  background: #f0fdf4;
}

.lib-scope__opt small {
  display: block;
  color: #64748b;
  font-size: 0.75rem;
}

.lib-share-modes__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}

.lib-share-mode {
  text-align: left;
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 10px;
  padding: 0.65rem 0.75rem;
  cursor: pointer;
}

.lib-share-mode strong {
  display: block;
  font-size: 0.85rem;
  margin-bottom: 0.25rem;
}

.lib-share-mode small {
  display: block;
  color: #64748b;
  font-size: 0.72rem;
  line-height: 1.35;
}

.lib-share-mode.is-active {
  border-color: #16a34a;
  background: #f0fdf4;
}

.lib-live-preview__label {
  font-size: 0.75rem;
  color: #64748b;
  margin-bottom: 0.35rem;
}

.lib-live-preview__frame {
  width: 100%;
  height: 180px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

.lib-error {
  color: #b91c1c;
  font-size: 0.85rem;
  margin: 0;
}

.lib-modal__foot {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.85rem 1.15rem 1.1rem;
  border-top: 1px solid #e5e7eb;
}

@media (max-width: 640px) {
  .lib-row,
  .lib-share-modes__grid {
    grid-template-columns: 1fr;
  }
}
</style>
