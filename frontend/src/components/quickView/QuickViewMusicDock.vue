<template>
  <div v-if="visible" class="qv-music">
    <button type="button" class="qv-music-toggle" :aria-expanded="open" @click="open = !open">
      <span class="dot" :class="{ on: playing }" />
      <span class="label">{{ playing ? (current?.title || 'Focus music') : 'Focus music' }}</span>
      <span class="chev">{{ open ? '▾' : '▴' }}</span>
    </button>
    <div v-if="open" class="qv-music-panel">
      <p v-if="loadError" class="muted">{{ loadError }}</p>
      <template v-else>
        <div class="now">
          <strong>{{ current?.title || 'Pick a track' }}</strong>
          <small>{{ current?.artist || '' }}</small>
        </div>
        <div class="controls">
          <button type="button" class="qv-btn ghost sm" @click="prev" :disabled="!tracks.length">Prev</button>
          <button type="button" class="qv-btn primary sm" @click="togglePlay" :disabled="!tracks.length">
            {{ playing ? 'Pause' : 'Play' }}
          </button>
          <button type="button" class="qv-btn ghost sm" @click="next" :disabled="!tracks.length">Next</button>
        </div>
        <select v-model="selectedId" class="track-select" @change="onSelect">
          <option disabled value="">Tracks</option>
          <option v-for="t in tracks" :key="t.id" :value="t.id">{{ t.title }}</option>
        </select>
      </template>
    </div>
    <audio ref="audioEl" preload="none" @ended="next" @play="playing = true" @pause="playing = false" />
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue';
import axios from 'axios';

const props = defineProps({
  apiBase: { type: String, required: true },
  authHeaders: { type: Function, required: true },
  visible: { type: Boolean, default: true }
});

const open = ref(false);
const tracks = ref([]);
const selectedId = ref('');
const current = ref(null);
const playing = ref(false);
const loadError = ref('');
const audioEl = ref(null);
let idx = 0;

async function loadCatalog() {
  loadError.value = '';
  try {
    const { data } = await axios.get(`${props.apiBase}/focus-music/catalog`, {
      headers: props.authHeaders(),
      withCredentials: true
    });
    tracks.value = data.tracks || [];
    if (tracks.value.length) {
      idx = 0;
      current.value = tracks.value[0];
      selectedId.value = current.value.id;
    }
  } catch (e) {
    loadError.value = e?.response?.data?.error?.message || 'Focus music unavailable';
    tracks.value = [];
  }
}

function applySrc() {
  const el = audioEl.value;
  if (!el || !current.value?.streamUrl) return;
  el.src = current.value.streamUrl;
}

async function togglePlay() {
  const el = audioEl.value;
  if (!el || !current.value) return;
  if (!el.src || el.src.indexOf(current.value.id) < 0) applySrc();
  if (playing.value) {
    el.pause();
  } else {
    try {
      await el.play();
    } catch {
      loadError.value = 'Could not start playback';
    }
  }
}

function setTrack(i) {
  if (!tracks.value.length) return;
  idx = ((i % tracks.value.length) + tracks.value.length) % tracks.value.length;
  current.value = tracks.value[idx];
  selectedId.value = current.value.id;
  applySrc();
  if (playing.value) {
    audioEl.value?.play().catch(() => {});
  }
}

function next() {
  setTrack(idx + 1);
}
function prev() {
  setTrack(idx - 1);
}
function onSelect() {
  const i = tracks.value.findIndex((t) => t.id === selectedId.value);
  if (i >= 0) setTrack(i);
}

watch(() => props.visible, (v) => {
  if (!v && playing.value) audioEl.value?.pause();
});

onMounted(() => {
  if (props.visible) loadCatalog();
});
onUnmounted(() => {
  audioEl.value?.pause();
});

defineExpose({ loadCatalog });
</script>

<style scoped>
.qv-music {
  position: sticky;
  bottom: 0;
  z-index: 40;
  border-top: 1px solid #1e293b;
  background: #0b1220;
  padding: 0 0 env(safe-area-inset-bottom, 0);
}
.qv-music-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border: none;
  background: transparent;
  color: #e2e8f0;
  font-weight: 700;
  cursor: pointer;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #475569;
}
.dot.on {
  background: var(--qv-primary, #22c55e);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--qv-primary, #22c55e) 25%, transparent);
}
.label { flex: 1; text-align: left; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chev { color: #94a3b8; font-size: 12px; }
.qv-music-panel {
  padding: 0 16px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.now strong { display: block; font-size: 14px; }
.now small { color: #94a3b8; font-size: 12px; }
.controls { display: flex; gap: 8px; align-items: center; }
.controls .qv-btn.primary { width: auto; min-width: 72px; }
.track-select {
  width: 100%;
  padding: 10px;
  border-radius: 10px;
  border: 1px solid #334155;
  background: #1e293b;
  color: #f8fafc;
}
.muted { color: #94a3b8; font-size: 13px; margin: 0; }
.qv-btn { border: none; border-radius: 10px; padding: 12px 14px; font-weight: 700; cursor: pointer; }
.qv-btn.primary { background: var(--qv-primary, #166534); color: #fff; }
.qv-btn.ghost { background: transparent; color: #cbd5e1; }
.qv-btn.sm { padding: 6px 10px; font-size: 12px; }
</style>
