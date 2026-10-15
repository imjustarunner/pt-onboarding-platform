<template>
  <Teleport :to="modalHost || 'body'" :disabled="!modalHost">
  <div v-if="videos.length" class="how-to-widget">
    <button
      v-show="!open"
      ref="launcher"
      type="button"
      class="how-to-launcher"
      :class="{ 'how-to-launcher--pulse': relevantVideos.length && !hasOpened }"
      aria-controls="how-to-panel"
      :aria-expanded="open"
      @click="openPanel"
    >
      <svg viewBox="0 0 32 32" aria-hidden="true"><rect x="3" y="5" width="26" height="22" rx="7" fill="none" stroke="currentColor" stroke-width="2" /><path d="m13 11 9 5-9 5z" fill="currentColor" /></svg>
      <span>How-to videos</span>
      <span v-if="relevantVideos.length" class="how-to-count">{{ relevantVideos.length }}</span>
    </button>

    <section
      v-if="open"
      id="how-to-panel"
      ref="panel"
      class="how-to-panel"
      :class="{ 'how-to-panel--dragging': dragging, 'how-to-panel--minimized': minimized }"
      :style="positionStyle"
      role="region"
      aria-label="How-to videos"
      @keydown.esc.stop.prevent="closePanel"
    >
      <header class="how-to-header">
        <button
          ref="moveHandle"
          type="button"
          class="how-to-move"
          aria-label="Move video window. Drag or use arrow keys."
          title="Drag to move · Arrow keys also move the window"
          @pointerdown="startDrag"
          @pointermove="moveDrag"
          @pointerup="stopDrag"
          @pointercancel="stopDrag"
          @lostpointercapture="stopDrag"
          @keydown="moveWithKeyboard"
        ><span aria-hidden="true">⠿</span><span class="how-to-heading">{{ minimized && activeVideo ? activeVideo.title : 'How-to videos' }}</span></button>
        <button type="button" class="how-to-action" :aria-label="minimized ? 'Expand video' : 'Minimize video'" :title="minimized ? 'Expand video' : 'Minimize video'" @click="toggleMinimized">{{ minimized ? '▢' : '−' }}</button>
        <button type="button" class="how-to-action" aria-label="Close video" title="Close video" @click="closePanel">×</button>
      </header>

      <div v-show="!minimized" class="how-to-body">
        <template v-if="activeVideo">
          <div class="how-to-video">
            <iframe
              :key="activeVideo.id"
              ref="player"
              :src="playerUrl"
              :title="activeVideo.title"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              referrerpolicy="strict-origin-when-cross-origin"
              allowfullscreen
            />
          </div>
          <div class="how-to-details">
            <strong>{{ activeVideo.title }}</strong>
            <p v-if="activeVideo.description">{{ activeVideo.description }}</p>
            <a :href="activeVideo.watchUrl" target="_blank" rel="noopener noreferrer">Open on YouTube ↗</a>
          </div>
        </template>
        <div v-if="!activeVideo || videos.length > 1" class="how-to-library">
          <p class="how-to-library-label">{{ relevantVideos.length ? 'For this page first' : 'Video library' }}</p>
          <button v-for="video in sortedVideos" :key="video.id" type="button" class="how-to-choice" :aria-pressed="activeVideo?.id === video.id" @click="selectVideo(video)">
            <span class="how-to-choice-play" aria-hidden="true">▶</span>
            <span>{{ video.title }}<small v-if="isRelevant(video)">For this page</small></span>
          </button>
        </div>
        <p class="how-to-hint">Watch and follow along in the app. Drag the top bar to move.</p>
      </div>
    </section>
  </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { HOW_TO_VIDEOS } from '../config/howToVideos';
import { availableHowToVideos, isHowToVideoRelevant } from '../utils/howToVideos';
import { useHowToVideo } from '../composables/useHowToVideo';

const props = defineProps({
  role: { type: String, default: '' },
  agencyId: { type: [String, Number], default: null }
});
const route = useRoute();
const { request, modalHost } = useHowToVideo();
let opener = null;
const videos = computed(() => availableHowToVideos(HOW_TO_VIDEOS, props));
const isRelevant = (video) => isHowToVideoRelevant(video, route);
const relevantVideos = computed(() => videos.value.filter(isRelevant));
const sortedVideos = computed(() => [...relevantVideos.value, ...videos.value.filter((video) => !isRelevant(video))]);
const open = ref(false);
const minimized = ref(false);
const hasOpened = ref(false);
const activeId = ref(null);
const activeVideo = computed(() => videos.value.find((video) => video.id === activeId.value));
const playerUrl = computed(() => {
  if (!activeVideo.value) return '';
  const url = new URL(activeVideo.value.embedUrl);
  url.searchParams.set('origin', window.location.origin);
  return url.toString();
});
const launcher = ref(null);
const panel = ref(null);
const player = ref(null);
const moveHandle = ref(null);
const position = ref(null);
const dragging = ref(false);
let drag = null;
let resizeObserver;
const positionStyle = computed(() => position.value ? { left: `${position.value.x}px`, top: `${position.value.y}px`, bottom: 'auto' } : {});

function clampPosition(x, y) {
  const bounds = panel.value?.getBoundingClientRect();
  if (!bounds) return;
  position.value = {
    x: Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8)),
    y: Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8))
  };
}
function keepInView() {
  if (!panel.value) return;
  const bounds = panel.value.getBoundingClientRect();
  clampPosition(bounds.left, bounds.top);
}
async function openPanel() {
  open.value = true;
  minimized.value = false;
  hasOpened.value = true;
  if (!activeVideo.value) {
    const candidates = relevantVideos.value.length ? relevantVideos.value : videos.value;
    if (candidates.length === 1) activeId.value = candidates[0].id;
  }
  await nextTick();
  keepInView();
  resizeObserver?.observe(panel.value);
  moveHandle.value?.focus();
}
async function closePanel() {
  const wasOpen = open.value;
  resizeObserver?.disconnect();
  stopDrag();
  open.value = false; // Removing the iframe also stops playback.
  await nextTick();
  if (wasOpen) (opener?.isConnected ? opener : launcher.value)?.focus();
  opener = null;
}
function toggleMinimized() {
  minimized.value = !minimized.value;
  if (minimized.value) {
    player.value?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }), 'https://www.youtube-nocookie.com');
  }
  nextTick(keepInView);
}
function selectVideo(video) {
  activeId.value = video.id;
  nextTick(keepInView);
}
function startDrag(event) {
  if (event.button !== 0 || !panel.value) return;
  const bounds = panel.value.getBoundingClientRect();
  drag = { pointerId: event.pointerId, x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  dragging.value = true;
  event.currentTarget.setPointerCapture(event.pointerId);
}
function moveDrag(event) {
  if (drag?.pointerId !== event.pointerId) return;
  clampPosition(event.clientX - drag.x, event.clientY - drag.y);
}
function stopDrag() {
  const pointerId = drag?.pointerId;
  drag = null;
  dragging.value = false;
  if (pointerId != null && moveHandle.value?.hasPointerCapture(pointerId)) moveHandle.value.releasePointerCapture(pointerId);
}
function moveWithKeyboard(event) {
  const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (!directions[event.key]) return;
  event.preventDefault();
  const bounds = panel.value.getBoundingClientRect();
  const step = event.shiftKey ? 40 : 16;
  clampPosition(bounds.left + directions[event.key][0] * step, bounds.top + directions[event.key][1] * step);
}
// Switching tenants/roles must not leave a previous audience's video playing.
watch(() => [props.agencyId, props.role], () => { closePanel(); activeId.value = null; });
watch(request, (value) => {
  if (!value || !videos.value.some((video) => video.id === value.id)) return;
  opener = value.opener;
  activeId.value = value.id;
  openPanel();
});
watch(modalHost, () => nextTick(keepInView));
onMounted(() => {
  window.addEventListener('resize', keepInView);
  if (typeof ResizeObserver !== 'undefined') resizeObserver = new ResizeObserver(keepInView);
});
onUnmounted(() => {
  window.removeEventListener('resize', keepInView);
  resizeObserver?.disconnect();
});
</script>

<style scoped>
.how-to-launcher, .how-to-panel { position: fixed; z-index: 8800; font-family: inherit; }
.how-to-launcher { left: max(20px, env(safe-area-inset-left)); bottom: calc(88px + env(safe-area-inset-bottom)); display: flex; align-items: center; gap: 9px; min-height: 48px; padding: 8px 16px 8px 10px; border: 1px solid #a5b4fc; border-radius: 28px; background: #3730a3; color: white; font-size: 14px; font-weight: 700; box-shadow: 0 4px 18px #312e8140; cursor: pointer; }
.how-to-launcher svg { width: 30px; height: 30px; }
.how-to-count { display: grid; place-items: center; min-width: 22px; height: 22px; border-radius: 50%; background: #fff; color: #3730a3; font-size: 12px; }
.how-to-launcher--pulse { animation: how-to-pulse 2.4s ease-out 5; }
@keyframes how-to-pulse { 0%, 100% { box-shadow: 0 4px 18px #312e8140, 0 0 0 0 #6366f150; } 65% { box-shadow: 0 4px 18px #312e8140, 0 0 0 10px #6366f100; } }
.how-to-panel { left: 20px; bottom: calc(88px + env(safe-area-inset-bottom)); width: min(400px, calc(100vw - 16px)); max-height: calc(100dvh - 16px); display: flex; flex-direction: column; overflow: hidden; background: #fff; color: #1e293b; border: 1px solid #c7d2fe; border-radius: 16px; box-shadow: 0 16px 48px #0f172a40; }
.how-to-header { display: flex; align-items: center; flex-shrink: 0; padding: 5px 6px; background: #312e81; color: #fff; }
.how-to-move { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; padding: 6px; min-height: 38px; border: 0; background: transparent; color: inherit; font: inherit; font-weight: 700; text-align: left; cursor: grab; touch-action: none; user-select: none; }
.how-to-heading { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.how-to-action { flex: 0 0 38px; height: 38px; border: 0; border-radius: 8px; background: transparent; color: inherit; font-size: 24px; cursor: pointer; }
.how-to-action:hover { background: #ffffff26; }
.how-to-body { overflow-y: auto; overscroll-behavior: contain; }
.how-to-video { aspect-ratio: 16 / 9; min-height: 200px; background: #0f172a; }
.how-to-video iframe { display: block; width: 100%; height: 100%; min-height: 200px; border: 0; }
.how-to-panel--dragging { user-select: none; }
.how-to-panel--dragging iframe { pointer-events: none; }
.how-to-panel--dragging .how-to-move { cursor: grabbing; }
.how-to-details { padding: 12px 16px 8px; }
.how-to-details strong { display: block; font-size: 15px; }
.how-to-details p { margin: 5px 0; font-size: 13px; }
.how-to-details a { display: inline-block; margin-top: 7px; color: #4338ca; font-size: 13px; }
.how-to-library { padding: 8px 12px; max-height: 180px; overflow-y: auto; }
.how-to-library-label { margin: 2px 4px 8px; color: #64748b; font-size: 12px; font-weight: 600; }
.how-to-choice { display: flex; align-items: center; gap: 10px; width: 100%; margin-top: 4px; padding: 10px; border: 1px solid transparent; border-radius: 9px; background: #f8fafc; color: #1e293b; font: inherit; font-size: 13px; text-align: left; cursor: pointer; }
.how-to-choice:hover, .how-to-choice[aria-pressed="true"] { background: #eef2ff; border-color: #a5b4fc; }
.how-to-choice-play { color: #4338ca; }
.how-to-choice small { display: block; margin-top: 3px; color: #4338ca; font-size: 11px; }
.how-to-hint { margin: 0; padding: 10px 16px 12px; color: #64748b; font-size: 12px; line-height: 1.4; }
.how-to-widget button:focus-visible, .how-to-widget a:focus-visible { outline: 3px solid #f59e0b; outline-offset: -3px; }
@media (prefers-reduced-motion: reduce) { .how-to-launcher--pulse { animation: none; } }
@media (max-width: 480px) { .how-to-launcher { left: 12px; padding-right: 12px; font-size: 13px; } }
</style>
