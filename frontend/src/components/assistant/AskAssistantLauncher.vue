<template>
  <div class="aal-root" @mouseenter="handleEnter" @mouseleave="handleLeave">
    <button
      type="button"
      class="aal-icon-btn"
      :class="{ 'is-open': open }"
      :aria-expanded="open"
      aria-label="Ask assistant"
      title="Ask anything (hover or ⌘/Ctrl+Shift+A)"
      @click="toggle"
      @focus="scheduleOpen"
    >
      <span aria-hidden="true">?</span>
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
  hoverOpenTimer = setTimeout(() => { open.value = true; }, OPEN_DELAY_MS);
}

function handleEnter() { scheduleOpen(); }

function handleLeave() {
  // Only cancel the pending open if the drawer hasn't opened yet. Once the
  // panel is open we leave it alone — users may have moved into the panel's
  // own area and should close it explicitly via ✕ or Escape.
  if (!open.value) clearHoverTimer();
}

function toggle() {
  clearHoverTimer();
  open.value = !open.value;
}

function close() { open.value = false; }

function handleKeydown(e) {
  const key = String(e.key || '').toLowerCase();
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && key === 'a') {
    e.preventDefault();
    toggle();
  }
}

onMounted(() => { window.addEventListener('keydown', handleKeydown); });
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
.aal-icon-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid var(--border, #d1d5db);
  background: var(--surface, #fff);
  color: var(--text, #111);
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.12s ease, background-color 0.12s ease, box-shadow 0.12s ease;
}
.aal-icon-btn:hover,
.aal-icon-btn.is-open {
  background: var(--primary, #2563eb);
  color: #fff;
  border-color: transparent;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.35);
}
.aal-icon-btn:focus-visible {
  outline: 2px solid var(--primary, #2563eb);
  outline-offset: 2px;
}
</style>
