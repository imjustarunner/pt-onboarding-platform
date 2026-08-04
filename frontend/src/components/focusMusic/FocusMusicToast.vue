<template>
  <div
    v-if="track"
    class="focus-music-toast"
    role="region"
    aria-label="Focus music player"
  >
    <button type="button" class="focus-music-toast-main" @click="$emit('open-modal')">
      <FocusMusicTrackArt :track="track" small />
      <div class="focus-music-toast-meta">
        <strong>{{ track.title }}</strong>
        <span v-if="subtitle">{{ subtitle }}</span>
      </div>
    </button>
    <div class="focus-music-toast-controls">
      <button type="button" :title="playing ? 'Pause' : 'Play'" @click.stop="$emit('toggle-play')">
        {{ playing ? '⏸' : '▶' }}
      </button>
      <button type="button" title="Next track" @click.stop="$emit('next')">⏭</button>
      <button type="button" title="End focus music" class="end-btn" @click.stop="$emit('end')">■</button>
      <button type="button" title="Open Focus Music" @click.stop="$emit('open-modal')">⋯</button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import FocusMusicTrackArt from './FocusMusicTrackArt.vue';
import { trackSubtitle } from '../../utils/focusMusicTrackDisplay.js';

const props = defineProps({
  track: { type: Object, default: null },
  playlistName: { type: String, default: '' },
  playing: { type: Boolean, default: false }
});

defineEmits(['toggle-play', 'next', 'open-modal', 'end']);

const subtitle = computed(() => props.playlistName || trackSubtitle(props.track));
</script>

<style scoped>
.focus-music-toast {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 11050;
  display: flex;
  align-items: center;
  gap: 8px;
  background: #111827;
  color: #f9fafb;
  border: 1px solid #374151;
  border-radius: 999px;
  padding: 6px 8px 6px 6px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.28);
  max-width: min(420px, calc(100vw - 32px));
}

.focus-music-toast-main {
  display: flex;
  align-items: center;
  gap: 10px;
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  min-width: 0;
  padding: 0;
}

.focus-music-toast-meta {
  min-width: 0;
  text-align: left;
}

.focus-music-toast-meta strong,
.focus-music-toast-meta span {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
}

.focus-music-toast-meta span {
  color: #9ca3af;
  font-size: 0.78rem;
}

.end-btn { color: #fca5a5 !important; }
.focus-music-toast-controls {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.focus-music-toast-controls button {
  width: 32px;
  height: 32px;
  border-radius: 999px;
  border: none;
  background: #1f2937;
  color: #f3f4f6;
  cursor: pointer;
}
</style>
