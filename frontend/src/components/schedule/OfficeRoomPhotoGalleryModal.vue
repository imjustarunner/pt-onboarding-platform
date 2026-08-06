<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="orp-modal-backdrop"
      role="dialog"
      aria-modal="true"
      :aria-label="`Photos — ${roomLabel}`"
      @click.self="close"
    >
      <div class="orp-modal">
        <header class="orp-modal-head">
          <div>
            <h3 class="orp-modal-title">{{ roomLabel || 'Room photos' }}</h3>
            <p class="orp-modal-sub muted">{{ photos.length }} photo{{ photos.length === 1 ? '' : 's' }}</p>
          </div>
          <button type="button" class="orp-close" aria-label="Close" @click="close">✕</button>
        </header>

        <div v-if="loading" class="orp-empty muted">Loading photos…</div>
        <div v-else-if="error" class="orp-error">{{ error }}</div>
        <div v-else-if="!photos.length" class="orp-empty muted">
          No photos yet{{ canManage ? ' — upload the first one below.' : '.' }}
        </div>
        <div v-else class="orp-grid">
          <div
            v-for="p in photos"
            :key="p.id"
            class="orp-card"
            :class="{ primary: p.isPrimary }"
          >
            <img :src="p.url" :alt="p.caption || roomLabel" class="orp-card-img" @click="lightboxUrl = p.url" />
            <div v-if="canManage" class="orp-card-actions">
              <button
                v-if="!p.isPrimary"
                type="button"
                class="btn btn-secondary btn-sm"
                :disabled="busy"
                @click="setPrimary(p.id)"
              >
                Set primary
              </button>
              <span v-else class="orp-primary-badge">Primary</span>
              <button
                type="button"
                class="btn btn-danger btn-sm"
                :disabled="busy"
                @click="removePhoto(p.id)"
              >
                Delete
              </button>
            </div>
          </div>
        </div>

        <footer v-if="canManage" class="orp-modal-foot">
          <label class="orp-upload btn btn-primary btn-sm">
            {{ uploading ? 'Uploading…' : 'Upload photo' }}
            <input
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              :disabled="uploading || busy"
              hidden
              @change="onFileChange"
            />
          </label>
          <span class="muted" style="font-size: 0.8rem;">PNG, JPEG, GIF, or WebP — max 10 MB</span>
        </footer>
      </div>

      <div v-if="lightboxUrl" class="orp-lightbox" @click="lightboxUrl = ''">
        <img :src="lightboxUrl" alt="Room photo" @click.stop />
        <button type="button" class="orp-close orp-lightbox-close" @click="lightboxUrl = ''">Close</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  officeId: { type: Number, default: 0 },
  roomId: { type: Number, default: 0 },
  roomLabel: { type: String, default: 'Room' }
});

const emit = defineEmits(['close', 'updated']);

const photos = ref([]);
const canManage = ref(false);
const loading = ref(false);
const uploading = ref(false);
const busy = ref(false);
const error = ref('');
const lightboxUrl = ref('');

async function load() {
  const officeId = Number(props.officeId || 0);
  const roomId = Number(props.roomId || 0);
  if (!officeId || !roomId) {
    photos.value = [];
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get(`/offices/${officeId}/rooms/${roomId}/photos`);
    photos.value = Array.isArray(data?.photos) ? data.photos : [];
    canManage.value = !!data?.canManage;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Could not load photos';
    photos.value = [];
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.open, props.officeId, props.roomId],
  ([isOpen]) => {
    if (isOpen) void load();
    else {
      photos.value = [];
      error.value = '';
      lightboxUrl.value = '';
    }
  }
);

function close() {
  emit('close');
}

async function onFileChange(e) {
  const file = e?.target?.files?.[0];
  if (e?.target) e.target.value = '';
  if (!file) return;
  uploading.value = true;
  error.value = '';
  try {
    const fd = new FormData();
    fd.append('photo', file);
    await api.post(`/offices/${props.officeId}/rooms/${props.roomId}/photos`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    await load();
    emit('updated', { roomId: props.roomId, officeId: props.officeId });
  } catch (err) {
    error.value = err?.response?.data?.error?.message || err?.message || 'Upload failed';
  } finally {
    uploading.value = false;
  }
}

async function setPrimary(photoId) {
  busy.value = true;
  error.value = '';
  try {
    await api.put(`/offices/${props.officeId}/rooms/${props.roomId}/photos/${photoId}/set-primary`);
    await load();
    emit('updated', { roomId: props.roomId, officeId: props.officeId });
  } catch (err) {
    error.value = err?.response?.data?.error?.message || err?.message || 'Could not set primary';
  } finally {
    busy.value = false;
  }
}

async function removePhoto(photoId) {
  if (!window.confirm('Delete this photo?')) return;
  busy.value = true;
  error.value = '';
  try {
    await api.delete(`/offices/${props.officeId}/rooms/${props.roomId}/photos/${photoId}`);
    await load();
    emit('updated', { roomId: props.roomId, officeId: props.officeId });
  } catch (err) {
    error.value = err?.response?.data?.error?.message || err?.message || 'Could not delete photo';
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.orp-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10050;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.orp-modal {
  width: min(720px, 100%);
  max-height: min(86vh, 820px);
  overflow: auto;
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.28);
  display: flex;
  flex-direction: column;
}
.orp-modal-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 18px 10px;
  border-bottom: 1px solid #e8eef5;
}
.orp-modal-title { margin: 0; font-size: 1.1rem; }
.orp-modal-sub { margin: 4px 0 0; font-size: 0.85rem; }
.orp-close {
  border: none;
  background: transparent;
  font-size: 1.1rem;
  cursor: pointer;
  color: #64748b;
  padding: 4px 8px;
}
.orp-empty, .orp-error { padding: 24px 18px; }
.orp-error { color: #b91c1c; }
.orp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
  padding: 16px 18px;
}
.orp-card {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
  background: #f8fafc;
}
.orp-card.primary { border-color: #818cf8; box-shadow: 0 0 0 1px #c7d2fe; }
.orp-card-img {
  width: 100%;
  height: 120px;
  object-fit: cover;
  display: block;
  cursor: zoom-in;
  background: #e2e8f0;
}
.orp-card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px;
}
.orp-primary-badge {
  font-size: 0.75rem;
  font-weight: 700;
  color: #4338ca;
  padding: 4px 0;
}
.orp-modal-foot {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 18px 16px;
  border-top: 1px solid #e8eef5;
}
.orp-upload { cursor: pointer; }
.orp-lightbox {
  position: fixed;
  inset: 0;
  z-index: 10060;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.orp-lightbox img {
  max-width: min(960px, 100%);
  max-height: 85vh;
  border-radius: 8px;
}
.orp-lightbox-close {
  position: absolute;
  top: 16px;
  right: 16px;
  color: #fff;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 8px;
}
.muted { color: #64748b; }
</style>
