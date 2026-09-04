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
          @click="mode = t.id"
        >
          {{ t.label }}
        </button>
      </div>

      <div class="lib-modal__body">
        <!-- Upload -->
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

        <!-- Google / Link -->
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
            For Google Docs, Sheets, Slides, or Drive files, set sharing to
            <strong>Anyone with the link can view</strong> so staff can open them in the app viewer.
          </p>
          <div v-if="googlePreview" class="lib-live-preview">
            <div class="lib-live-preview__label">In-app preview</div>
            <iframe :src="googlePreview" title="Google preview" class="lib-live-preview__frame" />
          </div>
        </template>

        <!-- Folder -->
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

        <div v-if="mode !== 'folder'" class="lib-share-modes">
          <span class="lib-scope__label">When you share it, how should people receive it?</span>
          <p class="lib-hint lib-share-modes__hint">
            Choose now so the next step can give personal copies or open collaboration — not only a view link.
          </p>
          <div class="lib-share-modes__grid">
            <button
              type="button"
              class="lib-share-mode"
              :class="{ 'is-active': form.shareMode === 'personal_copy' }"
              @click="form.shareMode = 'personal_copy'"
            >
              <strong>Personal copy</strong>
              <small>Each person gets their own editable copy. Their edits stay private.</small>
            </button>
            <button
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

        <template v-if="mode !== 'folder'">
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
          {{ saving ? 'Saving…' : mode === 'folder' ? 'Create folder' : 'Add resource' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import {
  getGoogleWorkspacePreviewUrl,
  isGoogleWorkspaceUrl
} from '../../utils/googleWorkspacePreview.js';
import {
  uploadLibraryResource,
  addLibraryLink,
  createLibraryFolder
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
  { id: 'link', label: 'Google Doc / Link' },
  { id: 'folder', label: 'Create folder' }
];

const mode = ref(['upload', 'link', 'folder'].includes(props.initialMode) ? props.initialMode : 'link');
const saving = ref(false);
const error = ref('');
const file = ref(null);

const form = reactive({
  name: '',
  url: '',
  description: '',
  categoryId: '',
  folderId: props.defaultFolderId ? String(props.defaultFolderId) : '',
  tags: '',
  featured: false,
  scope: props.canManage ? 'organization' : 'personal',
  shareMode: 'personal_copy'
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

const googlePreview = computed(() => {
  if (mode.value !== 'link') return null;
  if (!isGoogleWorkspaceUrl(form.url)) return null;
  return getGoogleWorkspacePreviewUrl(form.url);
});

function onFile(e) {
  const f = e.target?.files?.[0] || null;
  file.value = f;
  if (f && !form.name) {
    form.name = String(f.name || '').replace(/\.[^.]+$/, '');
  }
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
    emit('created', { kind: 'resource', item, shareMode });
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
  width: min(640px, 100%);
  max-height: min(90vh, 900px);
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
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0.55rem 0.65rem;
  background: #fff;
  cursor: pointer;
}

.lib-scope__opt.is-active {
  border-color: #166534;
  background: #ecfdf5;
}

.lib-scope__opt--mine.is-active {
  border-color: #d97706;
  background: #fffbeb;
}

.lib-scope__opt strong {
  display: block;
  font-size: 0.875rem;
  color: #0f172a;
}

.lib-scope__opt small {
  display: block;
  font-size: 0.75rem;
  color: #64748b;
  margin-top: 0.1rem;
}

.lib-share-modes {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 0.75rem;
  background: #fff;
}

.lib-share-modes__hint {
  margin: -0.25rem 0 0.65rem;
}

.lib-share-modes__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}

.lib-share-mode {
  text-align: left;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 0.65rem 0.75rem;
  background: #f8fafc;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
}

.lib-share-mode:hover {
  border-color: #94a3b8;
  background: #fff;
}

.lib-share-mode.is-active {
  border-color: #166534;
  background: #ecfdf5;
  box-shadow: 0 0 0 1px #16653433;
}

.lib-share-mode--later.is-active {
  border-color: #64748b;
  background: #f1f5f9;
  box-shadow: none;
}

.lib-share-mode strong {
  display: block;
  font-size: 0.82rem;
  color: #0f172a;
  margin-bottom: 0.2rem;
}

.lib-share-mode small {
  display: block;
  font-size: 0.72rem;
  color: #64748b;
  line-height: 1.35;
  font-weight: 500;
}

@media (max-width: 560px) {
  .lib-share-modes__grid {
    grid-template-columns: 1fr;
  }
}

.lib-hint {
  margin: 0;
  font-size: 0.8rem;
  color: #64748b;
  line-height: 1.4;
}

.lib-live-preview {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
}

.lib-live-preview__label {
  padding: 0.4rem 0.7rem;
  font-size: 0.75rem;
  background: #f1f5f9;
  color: #475569;
}

.lib-live-preview__frame {
  width: 100%;
  height: 280px;
  border: 0;
}

.lib-error {
  margin: 0;
  color: #b91c1c;
  font-size: 0.875rem;
}

.lib-modal__foot {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.85rem 1.15rem 1.15rem;
  border-top: 1px solid #e5e7eb;
}

@media (max-width: 640px) {
  .lib-row {
    grid-template-columns: 1fr;
  }
}
</style>
