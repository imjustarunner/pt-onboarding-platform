<template>
  <button v-if="video" type="button" class="how-to-inline" :class="{ 'how-to-inline--pulse': !opened }" :aria-label="`Watch how-to video: ${video.title}`" @click="play">
    <svg viewBox="0 0 28 28" aria-hidden="true"><rect x="2" y="4" width="24" height="20" rx="6" fill="none" stroke="currentColor" stroke-width="2" /><path d="m11 9 8 5-8 5z" fill="currentColor" /></svg>
    <span>How-to video</span>
  </button>
</template>

<script setup>
import { computed, ref } from 'vue';
import { HOW_TO_VIDEOS } from '../config/howToVideos';
import { useHowToVideo } from '../composables/useHowToVideo';

const props = defineProps({ videoId: { type: String, required: true } });
const video = computed(() => HOW_TO_VIDEOS.find((item) => item.id === props.videoId));
const opened = ref(false);
const { openVideo } = useHowToVideo();
function play(event) {
  opened.value = true;
  openVideo(props.videoId, event.currentTarget);
}
</script>

<style scoped>
.how-to-inline { display: inline-flex; align-items: center; justify-content: center; gap: 7px; flex-shrink: 0; min-height: 38px; padding: 5px 12px 5px 8px; border: 1px solid #a5b4fc; border-radius: 20px; background: #3730a3; color: white; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
.how-to-inline svg { width: 25px; height: 25px; }
.how-to-inline--pulse { animation: how-to-inline-pulse 2.4s ease-out 5; }
.how-to-inline:hover { background: #312e81; }
.how-to-inline:focus-visible { outline: 3px solid #f59e0b; outline-offset: 3px; }
@keyframes how-to-inline-pulse { 0%, 100% { box-shadow: 0 0 0 0 #6366f150; } 65% { box-shadow: 0 0 0 8px #6366f100; } }
@media (prefers-reduced-motion: reduce) { .how-to-inline--pulse { animation: none; } }
</style>
