<template>
  <div
    v-if="visible"
    class="itc-wrap"
    :class="[`itc-wrap--${variant}`, { open: menuOpen, break: store.isOnBreak }]"
  >
    <button
      type="button"
      class="itc-chip"
      :class="{ break: store.isOnBreak, hang: variant === 'hang', banner: variant === 'banner' }"
      :title="titleText"
      :aria-label="ariaLabel"
      :aria-expanded="menuOpen ? 'true' : 'false'"
      aria-haspopup="menu"
      @click.stop="toggleMenu"
    >
      <span class="itc-dot" aria-hidden="true" />
      <span class="itc-status">{{ store.statusLabel }}</span>
      <span class="itc-timer" aria-live="polite">{{ store.formattedElapsed }}</span>
      <span v-if="variant === 'hang'" class="itc-hang-cta">{{ store.isOnBreak ? 'Resume / Clock out' : 'Clock out' }}</span>
      <span v-else-if="variant === 'banner'" class="itc-hang-cta">Clock out</span>
    </button>
    <div v-if="menuOpen" class="itc-menu" role="menu" @click.stop>
      <button type="button" role="menuitem" class="itc-menu-item" @click="onOpenLogTime">
        Open Log Time
      </button>
      <button type="button" role="menuitem" class="itc-menu-item" :disabled="busy" @click="onToggleBreak">
        {{ store.isOnBreak ? 'Resume work' : 'Take a break' }}
      </button>
      <button type="button" role="menuitem" class="itc-menu-item itc-menu-item--danger" :disabled="busy" @click="onClockOut">
        Clock out
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useIndirectTimeSessionStore } from '../store/indirectTimeSession';
import { goToLogTime } from '../utils/indirectTimeNav';

defineProps({
  variant: { type: String, default: 'chip' } // chip | hang | banner
});

const emit = defineEmits(['navigated']);

const store = useIndirectTimeSessionStore();
const router = useRouter();
const route = useRoute();
const menuOpen = ref(false);
const busy = ref(false);

const visible = computed(() => store.isClockedIn);

const titleText = computed(() =>
  store.isOnBreak
    ? `On break · ${store.formattedElapsed} — clock out, take a break, or open Log Time`
    : `Clocked in · ${store.formattedElapsed} — clock out, take a break, or open Log Time`
);

const ariaLabel = computed(() =>
  store.isOnBreak
    ? `On break, elapsed ${store.formattedElapsed}. Open clock-out menu.`
    : `Clocked in, elapsed ${store.formattedElapsed}. Open clock-out menu.`
);

function toggleMenu() {
  menuOpen.value = !menuOpen.value;
}

function closeMenu() {
  menuOpen.value = false;
}

function onDocClick() {
  if (menuOpen.value) closeMenu();
}

function onOpenLogTime() {
  closeMenu();
  goToLogTime(router, route);
  emit('navigated');
}

async function onToggleBreak() {
  if (busy.value) return;
  busy.value = true;
  try {
    await store.toggleBreak();
  } finally {
    busy.value = false;
    closeMenu();
  }
}

async function onClockOut() {
  if (busy.value) return;
  busy.value = true;
  try {
    await store.clockOutFromTimedown();
  } finally {
    busy.value = false;
    closeMenu();
    goToLogTime(router, route);
    emit('navigated');
  }
}

onMounted(() => {
  document.addEventListener('click', onDocClick);
});
onUnmounted(() => {
  document.removeEventListener('click', onDocClick);
});
</script>

<style scoped>
.itc-wrap {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
}
.itc-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  border-radius: 999px;
  padding: 6px 12px;
  font-weight: 700;
  font-size: 0.78rem;
  letter-spacing: 0.02em;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  line-height: 1;
  margin-left: 8px;
}
.itc-chip:hover {
  background: rgba(255, 255, 255, 0.22);
}
.itc-chip:focus-visible {
  outline: 2px solid #86efac;
  outline-offset: 2px;
}
.itc-chip.break {
  background: rgba(251, 191, 36, 0.25);
  border-color: rgba(251, 191, 36, 0.55);
}
.itc-chip.hang {
  margin-left: 0;
  border: none;
  border-radius: 0 0 12px 12px;
  background: #14532d;
  padding: 8px 16px 10px;
  box-shadow: 0 4px 12px rgba(20, 83, 45, 0.28);
}
.itc-chip.hang:hover { background: #166534; }
.itc-chip.hang.break { background: #92400e; }
.itc-chip.hang.break:hover { background: #b45309; }
.itc-chip.banner {
  margin-left: 0;
  width: 100%;
  justify-content: flex-start;
  border-radius: 10px;
}
.itc-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #86efac;
  box-shadow: 0 0 0 0 rgba(134, 239, 172, 0.7);
  animation: itc-pulse 1.6s ease-out infinite;
}
.itc-chip.break .itc-dot {
  background: #fbbf24;
  animation: none;
}
.itc-status {
  font-size: 0.68rem;
  letter-spacing: 0.06em;
}
.itc-timer {
  font-variant-numeric: tabular-nums;
  font-size: 0.9rem;
  font-weight: 800;
}
.itc-hang-cta {
  font-size: 0.75rem;
  font-weight: 800;
  opacity: 0.92;
  margin-left: 4px;
}
.itc-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 8px;
  z-index: 80;
  min-width: 180px;
  background: #14532d;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 10px;
  padding: 6px;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.itc-wrap--hang .itc-menu,
.itc-wrap--banner .itc-menu {
  left: 0;
}
.itc-menu-item {
  appearance: none;
  border: 0;
  background: transparent;
  color: #fff;
  text-align: left;
  padding: 8px 10px;
  border-radius: 8px;
  font-weight: 700;
  font-size: 0.82rem;
  cursor: pointer;
}
.itc-menu-item:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
}
.itc-menu-item:disabled {
  opacity: 0.55;
  cursor: wait;
}
.itc-menu-item--danger {
  color: #fecaca;
}
@keyframes itc-pulse {
  0% { box-shadow: 0 0 0 0 rgba(134, 239, 172, 0.55); }
  70% { box-shadow: 0 0 0 8px rgba(134, 239, 172, 0); }
  100% { box-shadow: 0 0 0 0 rgba(134, 239, 172, 0); }
}

@media (max-width: 720px) {
  .itc-wrap--chip .itc-status { display: none; }
  .itc-wrap--chip .itc-chip { padding: 6px 10px; margin-left: 6px; }
}
</style>
