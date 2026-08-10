<template>
  <div
    v-if="isAuthenticated"
    class="chat-drawer"
    :class="[
      { open: isOpen && !isDragging, dragging: isDragging, 'has-chat': hasActiveChatLocal },
      `dock-${dock.edge}`
    ]"
    :style="drawerStyle"
    @mouseenter="onEnter"
    @mouseleave="onLeave"
  >
    <!-- Rail: icon strip, always visible. Short tap = toggle open. Hold = drag to reposition. -->
    <div
      class="rail"
      :title="railTitle"
      @pointerdown="onRailPointerDown"
    >
      <div class="rail-badge rail-badge-top" :class="{ zero: totalUnread <= 0 }">
        {{ totalUnread }}
      </div>

      <div class="rail-icon">
        <img v-if="iconUrl" :src="iconUrl" alt="Messages" />
        <span v-else class="icon-fallback">Msgs</span>
      </div>

      <div class="rail-badge rail-badge-bottom" :class="{ disabled: needsAgency }">
        {{ loggedInNow }}
      </div>

      <!-- Open-mode toggle on the rail, always reachable -->
      <button
        class="rail-mode-btn"
        :title="openMode === 'hover' ? 'Switch to click-to-open' : 'Switch to hover-to-open'"
        @click.stop="toggleOpenMode"
        @pointerdown.stop
      >
        <span class="rail-mode-icon">{{ openMode === 'hover' ? '↕' : '⊙' }}</span>
      </button>
    </div>

    <div v-if="isDragging" class="dock-hint" aria-live="polite">Snap to any edge</div>

    <div class="panel" :class="{ 'panel--wide': hasActiveChatLocal }">
      <div class="drawer-dash-bar">
        <button type="button" class="drawer-dash-btn" @click="goToMessagesDashboard">
          Messages Dashboard
        </button>
        <button type="button" class="drawer-dash-btn drawer-dash-btn-assistant" @click="openAssistant">
          Assistant
        </button>
        <button
          type="button"
          class="drawer-dash-btn drawer-mode-toggle"
          :title="openMode === 'hover' ? 'Hover to open — click to switch' : 'Click to open — click to switch'"
          @click="toggleOpenMode"
        >
          {{ openMode === 'hover' ? '↕ Hover' : '⊙ Click' }}
        </button>
      </div>
      <MessagesWorkspace ref="workspaceRef" layout="drawer" @unread-change="onUnreadChange" />
    </div>
  </div>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAgencyStore } from '../store/agency';
import { useAuthStore } from '../store/auth';
import { useBrandingStore } from '../store/branding';
import { toUploadsUrl } from '../utils/uploadsUrl';
import { dockToStyle, loadDock, saveDock, snapPointerToEdge } from '../utils/chatDrawerDock';
import MessagesWorkspace from './messages/MessagesWorkspace.vue';

const OPEN_MODE_KEY = 'pt.messages.openMode.v1';

function loadOpenMode() {
  try {
    const v = localStorage.getItem(OPEN_MODE_KEY);
    return v === 'click' ? 'click' : 'hover';
  } catch {
    return 'hover';
  }
}

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const brandingStore = useBrandingStore();

const isAuthenticated = computed(() => authStore.isAuthenticated);
const isOpen = ref(false);
const totalUnread = ref(0);
const loggedInNow = ref(0);
const workspaceRef = ref(null);
const openMode = ref(loadOpenMode());
const isHovering = ref(false);

const hasActiveChatLocal = computed(() => workspaceRef.value?.hasActiveChat ?? false);

const needsAgency = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  if (role === 'super_admin') return false;
  return !agencyStore.currentAgency?.id;
});

const iconUrl = computed(() => {
  const a = agencyStore.currentAgency;
  if (a?.chat_icon_path) return toUploadsUrl(a.chat_icon_path);
  const pb = brandingStore.platformBranding;
  if (pb?.chat_icon_path) return toUploadsUrl(pb.chat_icon_path);
  if (pb?.communications_icon_path) return toUploadsUrl(pb.communications_icon_path);
  if (a?.icon_file_path) return toUploadsUrl(a.icon_file_path);
  if (pb?.master_brand_icon_path) return toUploadsUrl(pb.master_brand_icon_path);
  return null;
});

const dock = ref(loadDock());
const isDragging = ref(false);
const dragPoint = ref(null);
let holdTimer = null;
let activePointerId = null;
let suppressOpenUntil = 0;
let closeTimer = null;

const drawerStyle = computed(() => {
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const panelHeight = isOpen.value
    ? Math.min(vh - 24, Math.max(460, vh * 0.78))
    : 0;
  const panelWidth = isOpen.value
    ? (hasActiveChatLocal.value ? Math.min(720, vw - 56) : Math.min(320, vw - 56))
    : 0;
  return dockToStyle(dock.value, isDragging.value ? dragPoint.value : null, {
    isOpen: isOpen.value,
    panelHeight,
    panelWidth
  });
});

const railTitle = computed(() => {
  const modeHint = openMode.value === 'hover' ? 'hover to open' : 'tap to open';
  if (needsAgency.value) return `Select an agency to use messages — hold & drag to move`;
  return `Messages — ${modeHint} · hold & drag to snap to an edge`;
});

function toggleOpenMode() {
  openMode.value = openMode.value === 'hover' ? 'click' : 'hover';
  try { localStorage.setItem(OPEN_MODE_KEY, openMode.value); } catch { /* ignore */ }
  if (openMode.value === 'click' && !isHovering.value) {
    // Switched to click-only: keep the panel open if it already is, just stop auto-close
  }
}

function onUnreadChange(payload) {
  totalUnread.value = Number(payload?.totalUnread || 0);
  loggedInNow.value = Number(payload?.loggedInNow || 0);
}

function goToMessagesDashboard() {
  const slug = String(route.params?.organizationSlug || '').trim();
  const path = slug ? `/${slug}/messages` : '/messages';
  isOpen.value = false;
  router.push({ path }).catch(() => {});
}

function openAssistant() {
  isOpen.value = true;
  workspaceRef.value?.switchToAssistant?.();
}

const onEnter = () => {
  if (isDragging.value) return;
  if (openMode.value !== 'hover') return;
  if (Date.now() < suppressOpenUntil) return;
  isHovering.value = true;
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
  isOpen.value = true;
};

const onLeave = () => {
  if (isDragging.value) return;
  isHovering.value = false;
  if (openMode.value !== 'hover') return;
  if (closeTimer) clearTimeout(closeTimer);
  closeTimer = setTimeout(() => {
    workspaceRef.value?.closeChat?.();
    isOpen.value = false;
    closeTimer = null;
  }, 220);
};

function clearHoldTimer() {
  if (holdTimer) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }
}

function beginDrag(clientX, clientY) {
  clearHoldTimer();
  workspaceRef.value?.closeChat?.();
  isDragging.value = true;
  isOpen.value = false;
  dragPoint.value = { x: clientX, y: clientY };
  document.body.style.userSelect = 'none';
  document.body.style.cursor = 'grabbing';
}

function onRailPointerDown(e) {
  if (e.button != null && e.button !== 0) return;
  activePointerId = e.pointerId;
  const startX = e.clientX;
  const startY = e.clientY;

  clearHoldTimer();
  holdTimer = setTimeout(() => {
    holdTimer = null;
    beginDrag(startX, startY);
  }, 200);

  const onMove = (ev) => {
    if (activePointerId != null && ev.pointerId !== activePointerId) return;
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    if (!isDragging.value && Math.hypot(dx, dy) > 8) {
      beginDrag(ev.clientX, ev.clientY);
    }
    if (isDragging.value) {
      dragPoint.value = { x: ev.clientX, y: ev.clientY };
      ev.preventDefault();
    }
  };

  const onUp = (ev) => {
    if (activePointerId != null && ev.pointerId !== activePointerId) return;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);

    const wasDragging = isDragging.value;
    clearHoldTimer();
    activePointerId = null;

    if (wasDragging) {
      const next = snapPointerToEdge(ev.clientX, ev.clientY);
      dock.value = next;
      saveDock(next);
      isDragging.value = false;
      dragPoint.value = null;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      suppressOpenUntil = Date.now() + 350;
      ev.preventDefault();
    } else {
      // Short tap on rail → toggle open/closed
      if (Date.now() < suppressOpenUntil) return;
      if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
      isOpen.value = !isOpen.value;
      if (!isOpen.value) workspaceRef.value?.closeChat?.();
    }
  };

  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

// Deep-link: openChat=1 opens the panel
watch(
  () => route.query?.openChat,
  (val) => {
    if (val === '1' || val === 'true') {
      isOpen.value = true;
      const q = { ...route.query };
      delete q.openChat;
      router.replace({ path: route.path, query: q }).catch(() => {});
    }
  },
  { immediate: true }
);

onUnmounted(() => {
  clearHoldTimer();
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
  document.body.style.userSelect = '';
  document.body.style.cursor = '';
});
</script>

<style scoped>
.chat-drawer {
  position: fixed;
  z-index: 1200;
  display: flex;
  align-items: stretch;
  pointer-events: auto;
  max-height: calc(100vh - 24px);
}

.chat-drawer.dock-left {
  flex-direction: row;
}
.chat-drawer.dock-right {
  flex-direction: row-reverse;
}
.chat-drawer.dock-top {
  flex-direction: column;
  max-width: min(360px, 96vw);
}
.chat-drawer.dock-bottom {
  flex-direction: column-reverse;
  max-width: min(360px, 96vw);
}

.chat-drawer.dragging {
  z-index: 1400;
  opacity: 0.96;
  transition: none;
}

.dock-hint {
  position: absolute;
  left: 50%;
  top: -28px;
  transform: translateX(-50%);
  white-space: nowrap;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  background: rgba(15, 23, 42, 0.85);
  border-radius: 999px;
  padding: 4px 10px;
  pointer-events: none;
}
.chat-drawer.dock-top .dock-hint {
  top: auto;
  bottom: -28px;
}

/* Rail */
.rail {
  width: 44px;
  background: transparent;
  color: white;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 6px;
  gap: 6px;
  cursor: grab;
  touch-action: none;
  flex-shrink: 0;
}
.chat-drawer.dragging .rail {
  cursor: grabbing;
}
.chat-drawer.dock-top .rail,
.chat-drawer.dock-bottom .rail {
  flex-direction: row;
  width: auto;
  min-width: 120px;
  height: 44px;
}

.rail-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: visible;
}
.rail-icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.icon-fallback {
  font-size: 11px;
  font-weight: 800;
}

.rail-badge {
  font-size: 11px;
  font-weight: 900;
  border-radius: 999px;
  padding: 2px 6px;
  line-height: 1.2;
  background: rgba(15, 23, 42, 0.65);
  color: #fff;
}
.rail-badge-top {
  background: rgba(239, 68, 68, 0.9);
}
.rail-badge-top.zero {
  background: rgba(15, 23, 42, 0.35);
  color: rgba(255, 255, 255, 0.85);
}
.rail-badge-bottom {
  background: rgba(34, 197, 94, 0.35);
  border: 1px solid rgba(34, 197, 94, 0.45);
  color: #dcfce7;
}
.rail-badge-bottom.disabled {
  opacity: 0.55;
  background: rgba(148, 163, 184, 0.12);
  border-color: rgba(148, 163, 184, 0.3);
  color: #e2e8f0;
}

/* Rail open-mode toggle button */
.rail-mode-btn {
  background: rgba(15, 23, 42, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 999px;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  color: rgba(255, 255, 255, 0.9);
  transition: background 120ms;
}
.rail-mode-btn:hover {
  background: rgba(15, 23, 42, 0.55);
}
.rail-mode-icon {
  font-size: 13px;
  line-height: 1;
  pointer-events: none;
}

/* Panel */
.panel {
  width: 0;
  height: 0;
  max-height: 0;
  overflow: hidden;
  background: white;
  transition: width 180ms ease, max-height 180ms ease, height 180ms ease;
  display: flex;
  flex-direction: column;
  border-radius: 0 12px 12px 0;
  box-shadow: 2px 0 24px rgba(15, 23, 42, 0.1);
}
.chat-drawer.dock-right .panel {
  border-radius: 12px 0 0 12px;
  box-shadow: -2px 0 24px rgba(15, 23, 42, 0.1);
}

.chat-drawer.open .panel {
  width: 320px;
  height: clamp(460px, 78vh, calc(100vh - 24px));
  max-height: calc(100vh - 24px);
  border-right: 1px solid var(--border);
  overflow: hidden;
}

/* Expanded panel: list (280px) + chat (~440px) side by side */
.chat-drawer.open .panel.panel--wide {
  width: min(720px, calc(100vw - 56px));
}

.chat-drawer.dock-right.open .panel {
  border-right: none;
  border-left: 1px solid var(--border);
}
.chat-drawer.dock-top.open .panel,
.chat-drawer.dock-bottom.open .panel {
  width: min(360px, 96vw);
  border-right: 1px solid var(--border);
}

/* Dash bar */
.drawer-dash-bar {
  flex-shrink: 0;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border, #e2e8f0);
  background: #f8fafc;
  display: flex;
  gap: 6px;
  align-items: center;
}
.drawer-dash-btn {
  flex: 1;
  border: 1px solid var(--border, #e2e8f0);
  background: #fff;
  border-radius: 8px;
  padding: 7px 8px;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
  color: var(--primary, #2563eb);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.drawer-dash-btn:hover {
  border-color: var(--primary, #2563eb);
  background: color-mix(in srgb, var(--primary, #2563eb) 8%, #fff);
}
.drawer-dash-btn-assistant {
  color: var(--primary, #0d9488);
}
.drawer-dash-btn-assistant:hover {
  border-color: var(--primary, #0d9488);
  background: color-mix(in srgb, var(--primary, #0d9488) 8%, #fff);
}

/* Open-mode toggle in the dash bar */
.drawer-mode-toggle {
  flex: none;
  min-width: 0;
  font-size: 11px;
  font-weight: 800;
  color: #64748b;
  border-color: #e2e8f0;
  padding: 7px 10px;
  letter-spacing: 0.01em;
}
.drawer-mode-toggle:hover {
  border-color: #94a3b8;
  background: #f1f5f9;
  color: #334155;
}
</style>
