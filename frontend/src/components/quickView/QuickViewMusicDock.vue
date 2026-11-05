<template>
  <div v-if="visible" class="qv-music" :class="{ 'qv-music-inline': inline }">
    <button type="button" class="qv-music-toggle" :aria-expanded="open" :aria-controls="panelId" @click="open = !open">
      <span class="music-symbol" aria-hidden="true"><Music2 :size="19" /></span>
      <span class="label">{{ playing ? (current?.title || 'Focus music') : 'Focus music' }}<small>{{ playing ? 'Now playing' : 'A little space to focus' }}</small></span>
      <span v-if="playing" class="dot on" aria-hidden="true" />
      <ChevronDown :size="18" class="chev" :class="{ expanded: open }" aria-hidden="true" />
    </button>
    <div v-show="open" :id="panelId" class="qv-music-panel" role="region" aria-label="Focus music player">
      <p v-if="loadError" class="muted" role="status">{{ loadError }}</p>
      <template v-else>
        <div class="now">
          <strong>{{ current?.title || 'Pick a track' }}</strong>
          <small>{{ current?.artist || '' }}</small>
        </div>
        <div class="controls">
          <button type="button" class="qv-btn ghost sm" @click="prev" :disabled="!tracks.length" aria-label="Previous track"><SkipBack :size="17" aria-hidden="true" /></button>
          <button type="button" class="qv-btn primary sm" @click="togglePlay" :disabled="!tracks.length">
            <component :is="playing ? Pause : Play" :size="16" aria-hidden="true" />
            {{ playing ? 'Pause' : 'Play' }}
          </button>
          <button type="button" class="qv-btn ghost sm" @click="next" :disabled="!tracks.length" aria-label="Next track"><SkipForward :size="17" aria-hidden="true" /></button>
        </div>
        <select v-model="selectedId" class="track-select" aria-label="Choose focus music track" @change="onSelect">
          <option disabled value="">Tracks</option>
          <option v-for="t in tracks" :key="t.id" :value="t.id">{{ t.title }}</option>
        </select>
      </template>
    </div>
    <audio ref="audioEl" preload="none" @ended="next" @play="playing = true" @pause="playing = false" />
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref, useId, watch } from 'vue';
import { ChevronDown, Music2, Pause, Play, SkipBack, SkipForward } from '@lucide/vue';
import axios from 'axios';

const props = defineProps({
  apiBase: { type: String, required: true },
  authHeaders: { type: Function, required: true },
  visible: { type: Boolean, default: true },
  inline: { type: Boolean, default: false }
});

const panelId = `qv-music-${useId()}`;
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
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 40;
  border-top: 1px solid var(--qv-border, #e3eaf3);
  background: var(--qv-surface, #fff);
  padding: 0 0 env(safe-area-inset-bottom, 0);
  color: var(--qv-text, #172b4d);
  font-family: inherit;
}
.qv-music-inline {
  position: static;
  z-index: auto;
  width: 100%;
  border: 1px solid var(--qv-border, #e3eaf3);
  border-radius: 16px;
  padding: 0;
  overflow: hidden;
}
.qv-music-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 66px;
  padding: 14px 16px;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.music-symbol { display: grid; place-items: center; width: 38px; height: 38px; flex-shrink: 0; border-radius: 12px; background: #eef4ff; color: #2563eb; }
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #a1afc1;
  flex-shrink: 0;
}
.dot.on {
  background: #22976a;
  box-shadow: 0 0 0 3px #e5f5ee;
}
.label { flex: 1; min-width: 0; text-align: left; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.label small { display: block; margin-top: 4px; color: var(--qv-muted, #62748e); font-size: 12px; font-weight: 400; }
.chev { color: var(--qv-muted, #62748e); flex-shrink: 0; transition: transform .18s ease; }
.chev.expanded { transform: rotate(180deg); }
.qv-music-panel {
  padding: 0 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.now strong { display: block; font-size: 14px; color: var(--qv-text, #172b4d); }
.now small { color: var(--qv-muted, #62748e); font-size: 12px; }
.controls { display: flex; gap: 8px; align-items: center; }
.controls .qv-btn.primary { width: auto; min-width: 72px; }
.track-select {
  width: 100%;
  min-height: 44px;
  padding: 10px;
  border-radius: 10px;
  border: 1px solid var(--qv-border, #e3eaf3);
  background: var(--qv-surface, #fff);
  color: var(--qv-text, #172b4d);
  font: inherit;
}
.muted { color: var(--qv-muted, #62748e); font-size: 13px; margin: 0; }
.qv-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 44px; min-width: 44px; border: none; border-radius: 10px; padding: 12px 14px; font: inherit; font-weight: 700; cursor: pointer; }
.qv-btn.primary { background: var(--qv-primary, #2563eb); color: #fff; }
.qv-btn.ghost { background: #f4f7fb; color: var(--qv-text, #172b4d); }
.qv-btn.sm { padding: 8px 12px; font-size: 13px; }
button:disabled { opacity: .45; cursor: default; }
button:focus-visible, select:focus-visible { outline: 3px solid #93b8fd; outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) { .chev { transition: none; } }
</style>
