<template>
  <div v-if="showSplit" ref="rootEl" class="logout-split" :class="{ open: menuOpen }">
    <button type="button" class="logout-split-main btn btn-secondary" @click="onLogout">
      Logout
    </button>
    <button
      type="button"
      class="logout-split-caret btn btn-secondary"
      aria-label="Logout or set timeout status"
      aria-haspopup="menu"
      :aria-expanded="menuOpen ? 'true' : 'false'"
      @click.stop="toggleMenu"
    >
      ▾
    </button>
    <Teleport to="body">
      <div
        v-if="menuOpen"
        class="logout-split-menu"
        role="menu"
        :style="menuStyle"
        @click.stop
      >
        <button type="button" class="logout-split-item" role="menuitem" @click="onLogout">
          <span class="logout-split-item-title">Log out</span>
          <span class="logout-split-item-sub">End session now</span>
        </button>
        <button type="button" class="logout-split-item" role="menuitem" @click="onTimeout">
          <span class="logout-split-item-title">Set timeout / Away</span>
          <span class="logout-split-item-sub">Stay signed in up to 2 hours with a status</span>
        </button>
      </div>
    </Teleport>
  </div>
  <button v-else type="button" class="btn btn-secondary" @click="onLogout">Logout</button>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { useAuthStore } from '../store/auth';
import { usePresenceSessionStore } from '../store/presenceSession';
import { canToggleDirectoryAudience, isPrivilegedPresenceRole } from '../utils/presenceStatus';

const emit = defineEmits(['logout', 'timeout']);

const authStore = useAuthStore();
const presenceSession = usePresenceSessionStore();
const menuOpen = ref(false);
const rootEl = ref(null);
const menuStyle = ref({});

const showSplit = computed(() => {
  const role = authStore.user?.role;
  return isPrivilegedPresenceRole(role) || canToggleDirectoryAudience(role);
});

function placeMenu() {
  const el = rootEl.value;
  if (!el || typeof el.getBoundingClientRect !== 'function') return;
  const rect = el.getBoundingClientRect();
  const gap = 6;
  const menuMinWidth = 240;
  const estimatedHeight = 120;
  const spaceBelow = window.innerHeight - rect.bottom - gap;
  const openUp = spaceBelow < estimatedHeight && rect.top > spaceBelow;
  const right = Math.max(8, window.innerWidth - rect.right);
  const width = Math.max(menuMinWidth, rect.width);
  menuStyle.value = {
    position: 'fixed',
    right: `${right}px`,
    left: 'auto',
    width: `${Math.min(width, window.innerWidth - 16)}px`,
    zIndex: 12000,
    ...(openUp
      ? { bottom: `${window.innerHeight - rect.top + gap}px`, top: 'auto' }
      : { top: `${rect.bottom + gap}px`, bottom: 'auto' })
  };
}

async function toggleMenu() {
  menuOpen.value = !menuOpen.value;
  if (menuOpen.value) {
    await nextTick();
    placeMenu();
  }
}

function onLogout() {
  menuOpen.value = false;
  emit('logout');
}

function onTimeout() {
  menuOpen.value = false;
  presenceSession.openManualTimeoutPrompt();
  emit('timeout');
}

function onDocClick(e) {
  if (!menuOpen.value) return;
  const el = e.target;
  if (el && typeof el.closest === 'function') {
    if (el.closest('.logout-split') || el.closest('.logout-split-menu')) return;
  }
  menuOpen.value = false;
}

function onViewportChange() {
  if (menuOpen.value) placeMenu();
}

onMounted(() => {
  document.addEventListener('click', onDocClick);
  window.addEventListener('resize', onViewportChange);
  window.addEventListener('scroll', onViewportChange, true);
});
onUnmounted(() => {
  document.removeEventListener('click', onDocClick);
  window.removeEventListener('resize', onViewportChange);
  window.removeEventListener('scroll', onViewportChange, true);
});
</script>

<style scoped>
.logout-split {
  position: relative;
  display: inline-flex;
  align-items: stretch;
  border-radius: 8px;
  overflow: visible;
}
.logout-split.mobile-logout {
  width: 100%;
  display: flex;
}
.logout-split.mobile-logout .logout-split-main {
  flex: 1;
}
.logout-split-main {
  border-top-right-radius: 0 !important;
  border-bottom-right-radius: 0 !important;
  border-right: none !important;
  margin: 0;
}
.logout-split-caret {
  border-top-left-radius: 0 !important;
  border-bottom-left-radius: 0 !important;
  padding-left: 8px !important;
  padding-right: 8px !important;
  min-width: 28px;
  margin: 0;
  border-left: 1px solid rgba(255, 255, 255, 0.25) !important;
}
</style>

<style>
/* Teleported menu — unscoped so body portal keeps styles */
.logout-split-menu {
  min-width: 240px;
  background: #fff;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.16);
  padding: 6px;
}
.logout-split-item {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  text-align: left;
  border: none;
  background: transparent;
  border-radius: 8px;
  padding: 10px 12px;
  cursor: pointer;
  color: var(--text-primary, #1a3d2b);
}
.logout-split-item:hover {
  background: #f0fdf4;
}
.logout-split-item-title {
  font-size: 13px;
  font-weight: 750;
}
.logout-split-item-sub {
  font-size: 11px;
  font-weight: 550;
  color: var(--text-secondary, #64748b);
}
</style>
