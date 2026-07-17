<template>
  <button
    v-if="visible"
    type="button"
    class="itc-chip"
    :class="{ break: store.isOnBreak }"
    :title="titleText"
    :aria-label="ariaLabel"
    @click="goToLogTime"
  >
    <span class="itc-dot" aria-hidden="true" />
    <span class="itc-status">{{ store.statusLabel }}</span>
    <span class="itc-timer" aria-live="polite">{{ store.formattedElapsed }}</span>
  </button>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useIndirectTimeSessionStore } from '../store/indirectTimeSession';
import { getDashboardRoute } from '../utils/router';

const store = useIndirectTimeSessionStore();
const router = useRouter();
const route = useRoute();

const visible = computed(() => store.isClockedIn);

const titleText = computed(() =>
  store.isOnBreak
    ? `On break · ${store.formattedElapsed} — open Log Time`
    : `Clocked in · ${store.formattedElapsed} — open Log Time`
);

const ariaLabel = computed(() =>
  store.isOnBreak
    ? `On break, elapsed ${store.formattedElapsed}. Open Log Time.`
    : `Clocked in, elapsed ${store.formattedElapsed}. Open Log Time.`
);

function goToLogTime() {
  const base = getDashboardRoute() || '/dashboard';
  const path = typeof base === 'string' ? base : (base?.path || '/dashboard');
  const cur = String(route.path || '').replace(/\/$/, '') || '/';
  const want = String(path || '').replace(/\/$/, '') || '/';
  const query = { ...(route.query || {}), tab: 'log_time' };
  if (cur === want) {
    router.replace({ path: want, query }).catch(() => {});
  } else {
    router.push({ path: want, query }).catch(() => {});
  }
}
</script>

<style scoped>
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
@keyframes itc-pulse {
  0% { box-shadow: 0 0 0 0 rgba(134, 239, 172, 0.55); }
  70% { box-shadow: 0 0 0 8px rgba(134, 239, 172, 0); }
  100% { box-shadow: 0 0 0 0 rgba(134, 239, 172, 0); }
}

@media (max-width: 720px) {
  .itc-status { display: none; }
  .itc-chip { padding: 6px 10px; margin-left: 6px; }
}
</style>
