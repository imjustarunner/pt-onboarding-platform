<template>
  <div class="media-panel">
    <div class="upload-box">
      <h4>Upload media</h4>
      <p class="muted">MP4 / WebM / MOV videos, PDFs, or images you produce in-house. Stored in your training media library.</p>
      <input ref="fileInput" type="file" accept="video/*,application/pdf,image/*" hidden @change="onFile" />
      <button type="button" class="btn btn-primary btn-sm" :disabled="uploading" @click="fileInput?.click()">
        {{ uploading ? 'Uploading…' : 'Upload video or file' }}
      </button>
      <div class="or-row">
        <input v-model="externalUrl" type="url" placeholder="Or paste YouTube / Vimeo / file URL" />
        <button type="button" class="btn btn-secondary btn-sm" :disabled="!externalUrl || uploading" @click="addExternal">
          Save URL
        </button>
      </div>
    </div>

    <div class="filters">
      <button type="button" :class="{ active: kindFilter === '' }" @click="kindFilter = ''">All</button>
      <button type="button" :class="{ active: kindFilter === 'video' }" @click="kindFilter = 'video'">Videos</button>
      <button type="button" :class="{ active: kindFilter === 'pdf' }" @click="kindFilter = 'pdf'">PDFs</button>
      <button type="button" :class="{ active: kindFilter === 'image' }" @click="kindFilter = 'image'">Images</button>
    </div>

    <div v-if="loading" class="muted pad">Loading library…</div>
    <div v-else-if="!filtered.length" class="muted pad">No media yet. Upload your first video above.</div>
    <ul v-else class="media-list">
      <li v-for="item in filtered" :key="item.id">
        <div class="meta">
          <strong>{{ item.title }}</strong>
          <span>{{ item.mediaKind }} · {{ formatSize(item.sizeBytes) }}</span>
        </div>
        <div class="actions">
          <button type="button" class="btn btn-primary btn-sm" @click="$emit('use', item)">Use</button>
          <button type="button" class="btn btn-secondary btn-sm" @click="remove(item)">Delete</button>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import api from '../../../services/api';

const props = defineProps({
  agencyId: { type: [Number, String], default: null }
});

const emit = defineEmits(['use', 'uploaded']);

const fileInput = ref(null);
const items = ref([]);
const loading = ref(false);
const uploading = ref(false);
const kindFilter = ref('');
const externalUrl = ref('');

const filtered = computed(() =>
  kindFilter.value ? items.value.filter((i) => i.mediaKind === kindFilter.value) : items.value
);

function formatSize(bytes) {
  if (!bytes) return 'URL';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function load() {
  loading.value = true;
  try {
    const res = await api.get('/training-media', {
      params: props.agencyId ? { agencyId: props.agencyId } : {}
    });
    items.value = Array.isArray(res.data) ? res.data : [];
  } catch {
    items.value = [];
  } finally {
    loading.value = false;
  }
}

async function onFile(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  uploading.value = true;
  try {
    const form = new FormData();
    form.append('file', file);
    form.append('title', file.name.replace(/\.[^.]+$/, ''));
    if (props.agencyId) form.append('agencyId', String(props.agencyId));
    const res = await api.post('/training-media/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    items.value = [res.data, ...items.value];
    emit('uploaded', res.data);
  } catch (err) {
    alert(err?.response?.data?.error?.message || 'Upload failed');
  } finally {
    uploading.value = false;
  }
}

async function addExternal() {
  const url = externalUrl.value.trim();
  if (!url) return;
  uploading.value = true;
  try {
    const res = await api.post('/training-media/external', {
      title: 'External video',
      mediaKind: 'video',
      externalUrl: url,
      agencyId: props.agencyId || null
    });
    items.value = [res.data, ...items.value];
    externalUrl.value = '';
    emit('uploaded', res.data);
  } catch (err) {
    alert(err?.response?.data?.error?.message || 'Failed to save URL');
  } finally {
    uploading.value = false;
  }
}

async function remove(item) {
  if (!confirm(`Remove “${item.title}” from the library?`)) return;
  try {
    await api.delete(`/training-media/${item.id}`);
    items.value = items.value.filter((i) => i.id !== item.id);
  } catch (err) {
    alert(err?.response?.data?.error?.message || 'Failed to delete');
  }
}

onMounted(load);
defineExpose({ load });
</script>

<style scoped>
.media-panel { display: flex; flex-direction: column; gap: 12px; }
.upload-box {
  padding: 12px;
  border: 1px dashed var(--border);
  border-radius: 10px;
  background: var(--bg);
}
.upload-box h4 { margin: 0 0 6px; font-size: 13px; }
.muted { color: var(--text-secondary); font-size: 12px; margin: 0 0 10px; line-height: 1.4; }
.or-row { display: flex; gap: 6px; margin-top: 10px; }
.or-row input {
  flex: 1;
  min-width: 0;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font: inherit;
}
.filters { display: flex; gap: 4px; flex-wrap: wrap; }
.filters button {
  border: none;
  background: transparent;
  padding: 6px 10px;
  border-radius: 999px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}
.filters button.active {
  background: color-mix(in srgb, var(--primary) 16%, transparent);
  color: var(--secondary);
}
.media-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.media-list li {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
}
.meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.meta strong { font-size: 13px; }
.meta span { font-size: 11px; color: var(--text-secondary); }
.actions { display: flex; gap: 4px; flex-shrink: 0; align-items: center; }
.pad { padding: 8px; }
</style>
