<template>
  <div class="aal-root" @mouseenter="handleEnter" @mouseleave="handleLeave">
    <button
      type="button"
      class="aal-btn"
      :class="{ 'is-open': open }"
      :aria-expanded="open"
      aria-label="Ask assistant"
      title="Ask anything — hover or ⌘/Ctrl+Shift+A"
      @click="toggle"
      @focus="scheduleOpen"
    >
      <span class="aal-btn-glow" aria-hidden="true" />
      <span class="aal-btn-inner">
        <svg class="aal-ic" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path
            d="M12 3c-4.97 0-9 3.58-9 8 0 1.42.38 2.76 1.05 3.95L3 21l6.02-1.64A8.9 8.9 0 0012 19c4.97 0 9-3.58 9-8s-4.03-8-9-8Z"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linejoin="round"
          />
          <path d="M8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
      </span>
    </button>

    <AskAssistantPanel :open="open" @close="close" />
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import AskAssistantPanel from './AskAssistantPanel.vue';

const OPEN_DELAY_MS = 300;

const open = ref(false);
let hoverOpenTimer = null;

function clearHoverTimer() {
  if (hoverOpenTimer) {
    clearTimeout(hoverOpenTimer);
    hoverOpenTimer = null;
  }
}

function scheduleOpen() {
  if (open.value) return;
  clearHoverTimer();
  hoverOpenTimer = setTimeout(() => {
    open.value = true;
  }, OPEN_DELAY_MS);
}

function handleEnter() {
  scheduleOpen();
}

function handleLeave() {
  if (!open.value) clearHoverTimer();
}

function toggle() {
  clearHoverTimer();
  open.value = !open.value;
}

function close() {
  open.value = false;
}

function handleKeydown(e) {
  const key = String(e.key || '').toLowerCase();
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && key === 'a') {
    e.preventDefault();
    toggle();
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});
onBeforeUnmount(() => {
  clearHoverTimer();
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<style scoped>
.aal-root {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.aal-btn {
  position: relative;
  width: 42px;
  height: 42px;
  padding: 0;
  border: none;
  border-radius: 14px;
  cursor: pointer;
  background: transparent;
  color: #0f766e;
  transition: transform 0.18s cubic-bezier(0.22, 1, 0.36, 1);
}

.aal-btn:hover {
  transform: translateY(-2px);
}

.aal-btn:active {
  transform: translateY(0);
}

.aal-btn-glow {
  position: absolute;
  inset: -2px;
  border-radius: 16px;
  background: linear-gradient(135deg, #0d9488, #2dd4bf, #6366f1);
  opacity: 0.55;
  filter: blur(0);
  transition: opacity 0.2s ease;
  z-index: 0;
}

.aal-btn:hover .aal-btn-glow,
.aal-btn.is-open .aal-btn-glow {
  opacity: 0.95;
}

.aal-btn-inner {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  border-radius: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(165deg, #ffffff 0%, #f0fdfa 100%);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.9) inset,
    0 4px 14px rgba(13, 148, 136, 0.2),
    0 12px 28px -8px rgba(15, 23, 42, 0.12);
  transition:
    background 0.2s ease,
    box-shadow 0.2s ease,
    color 0.2s ease;
}

.aal-btn:hover .aal-btn-inner,
.aal-btn.is-open .aal-btn-inner {
  background: linear-gradient(165deg, #0f766e 0%, #0d9488 55%, #14b8a6 100%);
  color: #fff;
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.12) inset,
    0 6px 20px rgba(13, 148, 136, 0.45);
}

.aal-ic {
  width: 22px;
  height: 22px;
}

.aal-btn:focus-visible {
  outline: 2px solid #0d9488;
  outline-offset: 3px;
}
</style>
