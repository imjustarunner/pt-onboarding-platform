<template>
  <div class="focus-music-track-art" :class="{ small }">
    <img v-if="artUrl" :src="artUrl" :alt="`${title} artwork`" />
    <span v-else aria-hidden="true">♪</span>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { trackArtUrl } from '../../utils/focusMusicTrackDisplay.js';

const props = defineProps({
  track: { type: Object, default: null },
  title: { type: String, default: '' },
  small: { type: Boolean, default: false }
});

const artUrl = computed(() => trackArtUrl(props.track));
const title = computed(() => props.title || props.track?.title || 'Track');
</script>

<style scoped>
.focus-music-track-art {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: #1f2937;
  display: grid;
  place-items: center;
  overflow: hidden;
  flex-shrink: 0;
}

.focus-music-track-art.small {
  width: 44px;
  height: 44px;
}

.focus-music-track-art img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
