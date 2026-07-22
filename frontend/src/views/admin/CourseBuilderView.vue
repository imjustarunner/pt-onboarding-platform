<template>
  <div class="course-builder" :class="`viewport-${viewport}`">
    <header class="builder-topbar">
      <div class="top-left">
        <button type="button" class="btn btn-secondary btn-sm" @click="goBack">← Back to Courses</button>
        <div class="title-wrap">
          <h1>{{ module?.title || 'Lesson' }}</h1>
          <span class="status-badge" :class="publishStatus">{{ publishStatus === 'published' ? 'Published' : 'Draft' }}</span>
          <span v-if="moduleVersion" class="version-badge">v{{ moduleVersion }}</span>
        </div>
      </div>
      <div class="top-right">
        <span class="save-status" :class="{ dirty, saving, error: saveError }">
          {{ saveStatusLabel }}
        </span>
        <button type="button" class="btn btn-secondary btn-sm" @click="openPreview">Preview</button>
        <button type="button" class="btn btn-secondary btn-sm" :disabled="saving" @click="saveBlocks(false)">Save</button>
        <button
          type="button"
          class="btn btn-primary btn-sm"
          :disabled="saving"
          @click="publishLesson"
        >
          Publish
        </button>
      </div>
    </header>

    <div v-if="loading" class="builder-loading">Loading course builder…</div>
    <div v-else-if="error" class="builder-error">{{ error }}</div>

    <div v-else class="builder-body">
      <!-- Left: course / lesson outline -->
      <aside class="pane left-pane">
        <div class="pane-header">
          <h2>{{ focusMeta?.name || 'Lesson Outline' }}</h2>
          <p v-if="focusMeta" class="muted">Course lessons</p>
          <p v-else class="muted">Standalone lesson</p>
        </div>
        <ul v-if="outlineLessons.length" class="lesson-list">
          <li
            v-for="lesson in outlineLessons"
            :key="lesson.id"
            :class="{ active: Number(lesson.id) === Number(moduleId) }"
            @click="switchLesson(lesson.id)"
          >
            <span class="lesson-title">{{ lesson.title }}</span>
            <span class="lesson-meta">{{ lesson.estimated_time_minutes ? `${lesson.estimated_time_minutes} min` : 'Lesson' }}</span>
          </li>
        </ul>
        <div v-else class="current-only">
          <div class="lesson-list">
            <div class="active lone">{{ module?.title }}</div>
          </div>
        </div>
        <button
          v-if="focusId"
          type="button"
          class="btn btn-secondary btn-sm add-lesson"
          @click="addLessonToFocus"
        >
          + Add Lesson
        </button>
        <div class="course-meta">
          <div><strong>{{ outlineLessons.length || 1 }}</strong> lessons</div>
          <div><strong>{{ totalEstimated }}</strong> min est.</div>
          <div class="muted">Updated {{ formatUpdated(module?.updated_at) }}</div>
          <router-link
            v-if="module?.agency_id"
            class="analytics-link"
            :to="{ path: '/admin/agency-progress', query: { agencyId: module.agency_id } }"
          >
            View course analytics
          </router-link>
        </div>
      </aside>

      <!-- Center: canvas -->
      <main class="pane center-pane">
        <div class="center-tabs">
          <button type="button" :class="{ active: centerTab === 'build' }" @click="centerTab = 'build'">Build</button>
          <button type="button" :class="{ active: centerTab === 'settings' }" @click="centerTab = 'settings'">Settings</button>
          <div class="viewport-toggles">
            <button type="button" :class="{ active: viewport === 'desktop' }" title="Desktop" @click="viewport = 'desktop'">🖥</button>
            <button type="button" :class="{ active: viewport === 'tablet' }" title="Tablet" @click="viewport = 'tablet'">▤</button>
            <button type="button" :class="{ active: viewport === 'mobile' }" title="Mobile" @click="viewport = 'mobile'">▭</button>
          </div>
        </div>

        <div v-if="centerTab === 'settings'" class="lesson-settings">
          <label>Lesson title</label>
          <input v-model="lessonTitle" type="text" @input="markDirty" />
          <label>Description</label>
          <textarea v-model="lessonDescription" rows="3" @input="markDirty" />
          <label>Estimated minutes</label>
          <input v-model.number="estimatedMinutes" type="number" min="0" @input="markDirty" />
          <button type="button" class="btn btn-primary btn-sm" :disabled="saving" @click="saveLessonMeta">Save lesson settings</button>
        </div>

        <div v-else class="canvas-wrap">
          <div class="canvas">
            <draggable
              v-model="blocks"
              handle=".drag-handle"
              :animation="180"
              tag="div"
              class="blocks-draggable"
              @end="onReorder"
            >
              <div
                v-for="block in blocks"
                :key="block.clientKey"
                class="draggable-block"
              >
                <LessonBlockCanvasItem
                  :block="block"
                  :is-selected="selectedKey === block.clientKey"
                  @select="selectBlock"
                  @update="updateBlockData"
                  @delete="deleteBlock"
                  @duplicate="duplicateBlock"
                  @open-media="openMediaForBlock"
                />
              </div>
            </draggable>

            <div v-if="!blocks.length" class="empty-canvas">
              <h3>Start building this lesson</h3>
              <p>Add content blocks from the library, or generate a draft with AI.</p>
            </div>

            <button type="button" class="add-block-btn" @click="rightTab = 'library'">
              + Add Content Block
            </button>
          </div>
        </div>
      </main>

      <!-- Right: library / settings -->
      <aside class="pane right-pane">
        <div class="right-tabs">
          <button type="button" :class="{ active: rightTab === 'library' }" @click="rightTab = 'library'">Add Blocks</button>
          <button type="button" :class="{ active: rightTab === 'media' }" @click="rightTab = 'media'">Media</button>
          <button type="button" :class="{ active: rightTab === 'saved' }" @click="openSavedLibrary">Saved Blocks</button>
          <button type="button" :class="{ active: rightTab === 'settings' }" @click="rightTab = 'settings'">Block Settings</button>
        </div>

        <div v-if="rightTab === 'library'" class="block-library">
          <button
            v-for="item in PHASE1_BLOCK_LIBRARY"
            :key="item.type"
            type="button"
            class="library-card"
            @click="addBlock(item.type)"
          >
            <strong>{{ item.label }}</strong>
            <span>{{ item.description }}</span>
          </button>
          <button
            v-if="selectedBlock"
            type="button"
            class="btn btn-secondary btn-sm save-lib-btn"
            @click="saveSelectedToLibrary"
          >
            Save selected block to library
          </button>
        </div>

        <div v-else-if="rightTab === 'media'" class="media-pane">
          <MediaLibraryPanel
            :agency-id="module?.agency_id"
            @use="useMediaItem"
            @uploaded="useMediaItem"
          />
        </div>

        <div v-else-if="rightTab === 'saved'" class="block-library saved-library">
          <p v-if="libraryLoading" class="muted">Loading library…</p>
          <p v-else-if="!savedLibraryItems.length" class="muted">No saved blocks yet. Select a block and save it from Add Blocks.</p>
          <button
            v-for="item in savedLibraryItems"
            :key="item.id"
            type="button"
            class="library-card"
            @click="insertFromLibrary(item)"
          >
            <strong>{{ item.title }}</strong>
            <span>{{ item.contentType }}</span>
          </button>
        </div>

        <div v-else-if="rightTab === 'settings'" class="block-settings">
          <template v-if="selectedBlock">
            <div class="settings-tabs">
              <button type="button" :class="{ active: settingsTab === 'content' }" @click="settingsTab = 'content'">Content</button>
              <button type="button" :class="{ active: settingsTab === 'settings' }" @click="settingsTab = 'settings'">Settings</button>
              <button type="button" :class="{ active: settingsTab === 'feedback' }" @click="settingsTab = 'feedback'">Feedback</button>
            </div>

            <div v-if="settingsTab === 'content'" class="settings-body">
              <label>Block title</label>
              <input v-model="selectedBlock.title" type="text" @input="markDirty" />
              <p class="muted">Edit the main content in the canvas. Use this panel for metadata.</p>
              <template v-if="selectedBlock.content_type === 'knowledge_check'">
                <label class="checkbox">
                  <input v-model="selectedBlock.content_data.shuffleOptions" type="checkbox" @change="markDirty" />
                  Shuffle options
                </label>
              </template>
            </div>

            <div v-else-if="settingsTab === 'settings'" class="settings-body">
              <label class="checkbox">
                <input v-model="selectedBlock.settings.required" type="checkbox" @change="markDirty" />
                Required to complete lesson
              </label>
              <p class="muted">Required blocks must be completed before the learner can finish.</p>
            </div>

            <div v-else class="settings-body">
              <label>Explanation / feedback</label>
              <textarea
                v-model="selectedBlock.settings.explanation"
                rows="3"
                placeholder="Shown after the learner answers"
                @input="syncFeedback"
              />
              <label>Correct feedback</label>
              <input v-model="selectedBlock.settings.feedbackCorrect" type="text" @input="markDirty" />
              <label>Incorrect feedback</label>
              <input v-model="selectedBlock.settings.feedbackIncorrect" type="text" @input="markDirty" />
            </div>
          </template>
          <p v-else class="muted pad">Select a block to edit its settings.</p>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { VueDraggableNext as draggable } from 'vue-draggable-next';
import api from '../../services/api';
import LessonBlockCanvasItem from '../../components/admin/courseBuilder/LessonBlockCanvasItem.vue';
import MediaLibraryPanel from '../../components/admin/courseBuilder/MediaLibraryPanel.vue';
import {
  PHASE1_BLOCK_LIBRARY,
  apiRowToBlock,
  blockToApiPayload,
  defaultBlockData,
  defaultBlockSettings
} from '../../utils/trainingBlockTypes.js';

const route = useRoute();
const router = useRouter();

const moduleId = computed(() => route.params.id);
const loading = ref(true);
const error = ref('');
const module = ref(null);
const blocks = ref([]);
const deletedIds = ref([]);
const selectedKey = ref(null);
const dirty = ref(false);
const saving = ref(false);
const saveError = ref(false);
const lastSavedAt = ref(null);
const centerTab = ref('build');
const rightTab = ref('library');
const settingsTab = ref('content');
const viewport = ref('desktop');
const focusId = ref(null);
const focusMeta = ref(null);
const outlineLessons = ref([]);
const lessonTitle = ref('');
const lessonDescription = ref('');
const estimatedMinutes = ref(null);
const publishStatus = ref('draft');
const moduleVersion = ref(null);
const savedLibraryItems = ref([]);
const libraryLoading = ref(false);

let autosaveTimer = null;
let clientSeq = 0;

const selectedBlock = computed(() =>
  blocks.value.find((b) => b.clientKey === selectedKey.value) || null
);

const totalEstimated = computed(() => {
  const fromOutline = outlineLessons.value.reduce(
    (sum, l) => sum + (Number(l.estimated_time_minutes) || 0),
    0
  );
  return fromOutline || Number(estimatedMinutes.value) || 0;
});

const saveStatusLabel = computed(() => {
  if (saving.value) return 'Saving…';
  if (saveError.value) return 'Save failed';
  if (dirty.value) return 'Unsaved changes';
  if (lastSavedAt.value) return 'Saved';
  return 'All changes saved';
});

function markDirty() {
  dirty.value = true;
  saveError.value = false;
  scheduleAutosave();
}

function scheduleAutosave() {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    if (dirty.value) saveBlocks(true);
  }, 1200);
}

function selectBlock(key) {
  selectedKey.value = key;
  rightTab.value = 'settings';
}

function updateBlockData(clientKey, data) {
  const block = blocks.value.find((b) => b.clientKey === clientKey);
  if (!block) return;
  block.content_data = { ...data };
  if (data.title != null) block.title = data.title;
  markDirty();
}

function onReorder() {
  markDirty();
}

function addBlock(type) {
  clientSeq += 1;
  const block = {
    id: null,
    clientKey: `new-${Date.now()}-${clientSeq}`,
    content_type: type,
    title: defaultBlockData(type).title || '',
    content_data: defaultBlockData(type),
    settings: defaultBlockSettings(type),
    order_index: blocks.value.length
  };
  blocks.value.push(block);
  selectedKey.value = block.clientKey;
  rightTab.value = 'settings';
  markDirty();
}

function deleteBlock(clientKey) {
  const idx = blocks.value.findIndex((b) => b.clientKey === clientKey);
  if (idx < 0) return;
  const [removed] = blocks.value.splice(idx, 1);
  if (removed?.id) deletedIds.value.push(removed.id);
  if (selectedKey.value === clientKey) selectedKey.value = null;
  markDirty();
}

function duplicateBlock(clientKey) {
  const src = blocks.value.find((b) => b.clientKey === clientKey);
  if (!src) return;
  clientSeq += 1;
  const copy = {
    id: null,
    clientKey: `new-${Date.now()}-${clientSeq}`,
    content_type: src.content_type,
    title: src.title,
    content_data: JSON.parse(JSON.stringify(src.content_data || {})),
    settings: JSON.parse(JSON.stringify(src.settings || defaultBlockSettings(src.content_type))),
    order_index: blocks.value.length
  };
  const idx = blocks.value.findIndex((b) => b.clientKey === clientKey);
  blocks.value.splice(idx + 1, 0, copy);
  selectedKey.value = copy.clientKey;
  markDirty();
}

function syncFeedback() {
  if (selectedBlock.value?.content_type === 'knowledge_check') {
    selectedBlock.value.content_data.explanation =
      selectedBlock.value.settings.explanation || '';
  }
  markDirty();
}

async function loadModule() {
  loading.value = true;
  error.value = '';
  try {
    const id = moduleId.value;
    const [modRes, contentRes] = await Promise.all([
      api.get(`/modules/${id}`),
      api.get(`/modules/${id}/content`)
    ]);
    module.value = modRes.data;
    lessonTitle.value = modRes.data.title || '';
    lessonDescription.value = modRes.data.description || '';
    estimatedMinutes.value = modRes.data.estimated_time_minutes ?? null;
    publishStatus.value = modRes.data.publish_status || (modRes.data.is_active ? 'published' : 'draft');
    moduleVersion.value = modRes.data.version || null;
    focusId.value = modRes.data.track_id || null;

    blocks.value = (contentRes.data || []).map((row, i) => apiRowToBlock(row, i));
    deletedIds.value = [];
    dirty.value = false;
    selectedKey.value = blocks.value[0]?.clientKey || null;

    if (focusId.value) {
      await loadFocusOutline(focusId.value);
    } else {
      focusMeta.value = null;
      outlineLessons.value = [];
    }
  } catch (err) {
    console.error(err);
    error.value = err?.response?.data?.error?.message || 'Failed to load lesson';
  } finally {
    loading.value = false;
  }
}

async function loadFocusOutline(id) {
  try {
    const [focusRes, stepsRes] = await Promise.all([
      api.get(`/training-focuses/${id}`).catch(() => api.get(`/tracks/${id}`)),
      api.get(`/training-focuses/${id}/steps`)
    ]);
    focusMeta.value = focusRes.data;
    const steps = stepsRes.data?.steps || stepsRes.data || [];
    outlineLessons.value = steps
      .filter((s) => s.step_type === 'module' || s.type === 'module')
      .map((s) => ({
        id: s.reference_id || s.module_id || s.referenceId,
        title: s.title || s.module_title || s.name || 'Lesson',
        estimated_time_minutes: s.estimated_time_minutes || s.estimatedTimeMinutes || null
      }))
      .filter((l) => l.id);
  } catch (err) {
    console.warn('Focus outline unavailable', err);
    focusMeta.value = null;
    outlineLessons.value = [];
  }
}

async function saveBlocks(isAutosave = false) {
  if (saving.value) return;
  saving.value = true;
  saveError.value = false;
  try {
    const id = moduleId.value;
    for (const delId of deletedIds.value) {
      await api.delete(`/modules/${id}/content/${delId}`);
    }
    deletedIds.value = [];

    for (let i = 0; i < blocks.value.length; i++) {
      const block = blocks.value[i];
      const payload = blockToApiPayload(block, i);
      if (block.id) {
        await api.put(`/modules/${id}/content/${block.id}`, payload);
      } else {
        const res = await api.post(`/modules/${id}/content`, payload);
        block.id = res.data.id;
        block.clientKey = `block-${res.data.id}`;
      }
    }
    dirty.value = false;
    lastSavedAt.value = new Date();
    if (selectedKey.value?.startsWith('new-')) {
      selectedKey.value = blocks.value.find((b) => b.clientKey === selectedKey.value)?.clientKey
        || blocks.value[0]?.clientKey
        || null;
    }
  } catch (err) {
    console.error(err);
    saveError.value = true;
    if (!isAutosave) {
      alert(err?.response?.data?.error?.message || 'Failed to save blocks');
    }
  } finally {
    saving.value = false;
  }
}

async function saveLessonMeta() {
  saving.value = true;
  try {
    const res = await api.put(`/modules/${moduleId.value}`, {
      title: lessonTitle.value,
      description: lessonDescription.value,
      estimatedTimeMinutes: estimatedMinutes.value,
      publishStatus: publishStatus.value
    });
    module.value = res.data;
    dirty.value = false;
    lastSavedAt.value = new Date();
  } catch (err) {
    alert(err?.response?.data?.error?.message || 'Failed to save lesson settings');
  } finally {
    saving.value = false;
  }
}

async function publishLesson() {
  await saveBlocks(false);
  if (saveError.value) return;
  try {
    saving.value = true;
    const res = await api.put(`/modules/${moduleId.value}`, {
      title: lessonTitle.value || module.value?.title,
      description: lessonDescription.value,
      estimatedTimeMinutes: estimatedMinutes.value,
      publishStatus: 'published',
      isActive: true,
      bumpVersion: true
    });
    module.value = res.data;
    publishStatus.value = 'published';
    moduleVersion.value = res.data.version || moduleVersion.value;
    lastSavedAt.value = new Date();
  } catch (err) {
    alert(err?.response?.data?.error?.message || 'Failed to publish');
  } finally {
    saving.value = false;
  }
}

async function openSavedLibrary() {
  rightTab.value = 'saved';
  libraryLoading.value = true;
  try {
    const agencyId = module.value?.agency_id || undefined;
    const res = await api.get('/training-content-library', {
      params: agencyId ? { agencyId } : {}
    });
    savedLibraryItems.value = Array.isArray(res.data) ? res.data : [];
  } catch (err) {
    console.error(err);
    savedLibraryItems.value = [];
  } finally {
    libraryLoading.value = false;
  }
}

async function saveSelectedToLibrary() {
  const block = selectedBlock.value;
  if (!block) return;
  try {
    await api.post('/training-content-library', {
      agencyId: module.value?.agency_id || null,
      title: block.title || `${block.content_type} block`,
      contentType: block.content_type,
      contentData: block.content_data || {},
      settings: block.settings || null
    });
    alert('Saved to content library');
    if (rightTab.value === 'saved') await openSavedLibrary();
  } catch (err) {
    alert(err?.response?.data?.error?.message || 'Failed to save to library');
  }
}

async function insertFromLibrary(item) {
  try {
    const res = await api.post(`/modules/${moduleId.value}/content/from-library`, {
      libraryItemId: item.id,
      orderIndex: blocks.value.length
    });
    const row = res.data;
    const block = apiRowToBlock(row, blocks.value.length);
    blocks.value.push(block);
    selectedKey.value = block.clientKey;
    rightTab.value = 'settings';
    dirty.value = false;
  } catch (err) {
    alert(err?.response?.data?.error?.message || 'Failed to insert from library');
  }
}

function openMediaForBlock(kind) {
  rightTab.value = 'media';
  // kind reserved for future filter handoff
  void kind;
}

function useMediaItem(item) {
  if (!item) return;
  const url = item.publicUrl || item.externalUrl;
  if (!url) return;
  const kind = item.mediaKind || 'video';
  const selected = selectedBlock.value;
  if (selected && ['video', 'image', 'pdf'].includes(selected.content_type)) {
    if (selected.content_type === 'video' || (kind === 'video' && selected.content_type === 'video')) {
      selected.content_data.videoUrl = url;
      selected.content_data.mediaLibraryId = item.id;
      if (item.title) selected.title = item.title;
    } else if (selected.content_type === 'image' || kind === 'image') {
      selected.content_data.imageUrl = url;
      selected.content_data.mediaLibraryId = item.id;
      if (item.title) selected.title = item.title;
    } else if (selected.content_type === 'pdf' || kind === 'pdf') {
      selected.content_data.fileUrl = url;
      selected.content_data.googleUrl = url;
      selected.content_data.mediaLibraryId = item.id;
      if (item.title) selected.title = item.title;
    }
    markDirty();
    rightTab.value = 'settings';
    return;
  }
  // No compatible block selected — add a new one
  const type = kind === 'pdf' ? 'pdf' : kind === 'image' ? 'image' : 'video';
  addBlock(type);
  const block = blocks.value[blocks.value.length - 1];
  if (!block) return;
  block.title = item.title || block.title;
  if (type === 'video') {
    block.content_data.videoUrl = url;
    block.content_data.mediaLibraryId = item.id;
  } else if (type === 'image') {
    block.content_data.imageUrl = url;
    block.content_data.mediaLibraryId = item.id;
  } else {
    block.content_data.fileUrl = url;
    block.content_data.googleUrl = url;
    block.content_data.mediaLibraryId = item.id;
  }
  markDirty();
}

function openPreview() {
  const org = route.params.organizationSlug;
  const path = org
    ? `/${org}/module/${moduleId.value}`
    : `/module/${moduleId.value}`;
  window.open(`${path}?preview=1`, '_blank');
}

function goBack() {
  const org = route.params.organizationSlug;
  router.push(org ? `/${org}/admin/modules` : '/admin/modules');
}

async function switchLesson(id) {
  if (Number(id) === Number(moduleId.value)) return;
  if (dirty.value) {
    const ok = confirm('Save changes before switching lessons?');
    if (ok) await saveBlocks(false);
  }
  const org = route.params.organizationSlug;
  router.push(org ? `/${org}/admin/modules/${id}/builder` : `/admin/modules/${id}/builder`);
}

async function addLessonToFocus() {
  if (!focusId.value) return;
  const title = prompt('New lesson title');
  if (!title?.trim()) return;
  try {
    const createRes = await api.post('/modules', {
      title: title.trim(),
      description: '',
      trackId: focusId.value,
      agencyId: module.value?.agency_id || undefined,
      isActive: false,
      publishStatus: 'draft',
      estimatedTimeMinutes: 5
    });
    const newId = createRes.data.id;
    try {
      await api.post(`/training-focuses/${focusId.value}/steps`, {
        stepType: 'module',
        referenceId: newId
      });
    } catch {
      // step API shape may vary; module track_id still links it
    }
    await switchLesson(newId);
  } catch (err) {
    alert(err?.response?.data?.error?.message || 'Failed to add lesson');
  }
}

function formatUpdated(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  } catch {
    return '—';
  }
}

watch(moduleId, () => loadModule());

onMounted(loadModule);
onBeforeUnmount(() => {
  if (autosaveTimer) clearTimeout(autosaveTimer);
});
</script>

<style scoped>
.course-builder {
  min-height: calc(100vh - 64px);
  display: flex;
  flex-direction: column;
  background: var(--bg-alt);
  color: var(--text-primary);
}
.builder-topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 12px 20px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 20;
}
.top-left, .top-right { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.title-wrap { display: flex; align-items: center; gap: 10px; }
.title-wrap h1 { font-size: 1.1rem; margin: 0; font-family: var(--font-header); }
.status-badge {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--bg-alt);
  color: var(--text-secondary);
}
.status-badge.published { background: color-mix(in srgb, var(--success) 20%, transparent); color: var(--success); }
.status-badge.draft { background: color-mix(in srgb, var(--warning) 22%, transparent); color: #8a6a00; }
.version-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--bg-alt);
  color: var(--text-secondary);
}
.save-lib-btn { margin-top: 12px; width: 100%; }
.media-pane { padding: 12px; overflow: auto; }
.save-status { font-size: 12px; color: var(--text-secondary); }
.save-status.dirty { color: var(--warning); }
.save-status.saving { color: var(--accent); }
.save-status.error { color: var(--error); }
.builder-loading, .builder-error { padding: 48px; text-align: center; }
.builder-error { color: var(--error); }
.builder-body {
  flex: 1;
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr) 300px;
  min-height: 0;
}
.pane { min-height: 0; overflow: auto; }
.left-pane, .right-pane {
  background: var(--bg);
  border-right: 1px solid var(--border);
  padding: 16px;
}
.right-pane { border-right: none; border-left: 1px solid var(--border); }
.pane-header h2 { font-size: 0.95rem; margin: 0 0 4px; }
.muted { color: var(--text-secondary); font-size: 12px; }
.lesson-list { list-style: none; margin: 12px 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.lesson-list li, .lesson-list .lone {
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid transparent;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.lesson-list li:hover { background: var(--bg-alt); }
.lesson-list li.active, .lesson-list .lone.active {
  background: color-mix(in srgb, var(--primary) 14%, transparent);
  border-color: color-mix(in srgb, var(--primary) 35%, transparent);
}
.lesson-title { font-weight: 600; font-size: 13px; }
.lesson-meta { font-size: 11px; color: var(--text-secondary); }
.add-lesson { width: 100%; margin-top: 8px; }
.course-meta {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}
.analytics-link { color: var(--accent); font-weight: 600; text-decoration: none; margin-top: 8px; }
.center-pane { padding: 0 0 32px; }
.center-tabs, .right-tabs, .settings-tabs {
  display: flex;
  gap: 4px;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
  position: sticky;
  top: 0;
  z-index: 5;
}
.center-tabs button, .right-tabs button, .settings-tabs button {
  border: none;
  background: transparent;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  color: var(--text-secondary);
}
.center-tabs button.active, .right-tabs button.active, .settings-tabs button.active {
  background: color-mix(in srgb, var(--primary) 16%, transparent);
  color: var(--secondary);
}
.viewport-toggles { margin-left: auto; display: flex; gap: 4px; }
.viewport-toggles button {
  width: 36px;
  height: 32px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  cursor: pointer;
}
.viewport-toggles button.active { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 12%, transparent); }
.canvas-wrap { display: flex; justify-content: center; padding: 20px 16px; }
.canvas {
  width: 100%;
  max-width: 760px;
  transition: max-width 0.2s;
}
.viewport-tablet .canvas { max-width: 640px; }
.viewport-mobile .canvas { max-width: 390px; }
.empty-canvas {
  text-align: center;
  padding: 48px 24px;
  background: var(--bg);
  border: 1px dashed var(--border);
  border-radius: 12px;
  margin-bottom: 12px;
}
.add-block-btn {
  width: 100%;
  padding: 14px;
  border: 1px dashed var(--border);
  border-radius: 10px;
  background: var(--bg);
  font-weight: 600;
  cursor: pointer;
  color: var(--text-secondary);
}
.add-block-btn:hover { border-color: var(--primary); color: var(--secondary); }
.block-library {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 12px 0;
}
.library-card {
  text-align: left;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
  background: var(--bg);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.library-card:hover { border-color: var(--primary); background: var(--bg-alt); }
.library-card strong { font-size: 12px; }
.library-card span { font-size: 11px; color: var(--text-secondary); line-height: 1.3; }
.settings-body { display: flex; flex-direction: column; gap: 8px; padding: 12px 0; }
.settings-body label { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
.settings-body input, .settings-body textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font: inherit;
}
.checkbox { display: flex; align-items: center; gap: 8px; color: var(--text-primary) !important; }
.pad { padding: 16px 0; }
.lesson-settings {
  max-width: 640px;
  margin: 24px auto;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.lesson-settings input, .lesson-settings textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font: inherit;
}
@media (max-width: 1100px) {
  .builder-body { grid-template-columns: 220px minmax(0, 1fr); }
  .right-pane { display: none; }
}
@media (max-width: 800px) {
  .builder-body { grid-template-columns: 1fr; }
  .left-pane { display: none; }
}
</style>
