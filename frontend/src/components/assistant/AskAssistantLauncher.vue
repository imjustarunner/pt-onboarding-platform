<template>
  <div class="aal-root" @mouseenter="handleEnter" @mouseleave="handleLeave">
    <Transition name="aal-pop">
      <div v-if="showModeMenu && !open" class="aal-mode-menu" role="menu" @mousedown.prevent>
        <button type="button" class="aal-mode-btn aal-mode-btn--nav" role="menuitem" @click="openNav">
          <span class="aal-mode-btn-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" stroke-linecap="round" />
            </svg>
          </span>
          <span class="aal-mode-btn-text">
            <strong>Quick Nav</strong>
            <span>Jump to pages instantly — no database lookup</span>
          </span>
        </button>
        <button type="button" class="aal-mode-btn aal-mode-btn--ask" role="menuitem" @click="openAskPanel">
          <span class="aal-mode-btn-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 3c-4.97 0-9 3.58-9 8 0 1.42.38 2.76 1.05 3.95L3 21l6.02-1.64A8.9 8.9 0 0012 19c4.97 0 9-3.58 9-8s-4.03-8-9-8Z" stroke-linejoin="round" />
            </svg>
          </span>
          <span class="aal-mode-btn-text">
            <strong>Ask</strong>
            <span>Schedules, who's in, availability, coverage</span>
          </span>
        </button>
      </div>
    </Transition>

    <button
      type="button"
      class="aal-btn"
      :class="{ 'is-open': open }"
      :aria-expanded="open"
      aria-label="Assistant — Quick Nav or Ask"
      title="Quick Nav or Ask — ⌘/Ctrl+K"
      @click="onLauncherClick"
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

    <AskAssistantPanel :open="open" @close="closeAssistant" />
  </div>
</template>

<script setup>
import { onBeforeUnmount, ref, watch } from 'vue';
import AskAssistantPanel from './AskAssistantPanel.vue';
import { useUserPreferencesStore } from '../../store/userPreferences';
import { useAskAssistant } from '../../composables/useAskAssistant';
import { useCommandPalette } from '../../composables/useCommandPalette';

const HOVER_DELAY_MS = 280;

const prefsStore = useUserPreferencesStore();
const { open, close: closeAssistant, toggle: toggleAssistant, openAsk } = useAskAssistant();
const { openPalette } = useCommandPalette();

const showModeMenu = ref(false);
let hoverTimer = null;

function clearHoverTimer() {
  if (hoverTimer) {
    clearTimeout(hoverTimer);
    hoverTimer = null;
  }
}

function handleEnter() {
  if (open.value) return;
  if (prefsStore.navHoverMenusEnabled === false) return;
  clearHoverTimer();
  hoverTimer = setTimeout(() => {
    showModeMenu.value = true;
  }, HOVER_DELAY_MS);
}

function handleLeave() {
  clearHoverTimer();
  if (!open.value) showModeMenu.value = false;
}

watch(open, (isOpen) => {
  if (isOpen) showModeMenu.value = false;
});

function openNav() {
  clearHoverTimer();
  showModeMenu.value = false;
  openPalette('nav');
}

function openAskPanel() {
  clearHoverTimer();
  showModeMenu.value = false;
  openAsk('', 'ask');
}

function onLauncherClick() {
  clearHoverTimer();
  showModeMenu.value = false;
  openPalette(null);
}

onBeforeUnmount(() => {
  clearHoverTimer();
});
</script>

<style scoped>
.aal-root {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.aal-mode-menu {
  position: absolute;
  bottom: calc(100% + 10px);
  right: 0;
  width: 280px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  box-shadow: 0 20px 48px rgba(15, 23, 42, 0.16);
  z-index: 50;
}

.aal-mode-btn {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: 100%;
  padding: 12px;
  border-radius: 12px;
  border: 2px solid transparent;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.aal-mode-btn--nav {
  background: linear-gradient(135deg, #f0fdfa, #ecfeff);
  border-color: #99f6e4;
}
.aal-mode-btn--nav:hover { border-color: #0d9488; background: #ccfbf1; }

.aal-mode-btn--ask {
  background: linear-gradient(135deg, #f5f3ff, #ede9fe);
  border-color: #c4b5fd;
}
.aal-mode-btn--ask:hover { border-color: #7c3aed; background: #ddd6fe; }

.aal-mode-btn-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.aal-mode-btn--nav .aal-mode-btn-icon { background: #ccfbf1; color: #0f766e; }
.aal-mode-btn--ask .aal-mode-btn-icon { background: #ddd6fe; color: #6d28d9; }
.aal-mode-btn-icon svg { width: 18px; height: 18px; }

.aal-mode-btn-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.aal-mode-btn-text strong { font-size: 13px; color: #0f172a; }
.aal-mode-btn-text span { font-size: 11px; color: #64748b; line-height: 1.35; }

.aal-pop-enter-active,
.aal-pop-leave-active { transition: opacity 0.15s ease, transform 0.15s ease; }
.aal-pop-enter-from,
.aal-pop-leave-to { opacity: 0; transform: translateY(6px); }

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
  background: linear-gradient(135deg, #0d9488, #2dd4bf, #7c3aed);
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
  background: linear-gradient(165deg, #0f766e 0%, #0d9488 45%, #7c3aed 100%);
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
