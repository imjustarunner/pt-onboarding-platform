<template>
  <Teleport to="body">
    <div v-if="active" class="away-session-overlay" data-pt-away-session="1" role="status" aria-live="polite">
      <div class="away-session-card">
        <div class="away-eyebrow">Away — signed in</div>
        <h2 class="away-title">{{ label }}</h2>
        <p class="away-sub">
          Session stays open while you are away. When the timer ends we will ask for your status again.
        </p>
        <div class="away-countdown" aria-label="Time remaining">
          <span class="away-countdown-label">Returns in</span>
          <span class="away-countdown-value">{{ clock }}</span>
        </div>
        <button type="button" class="away-btn" :disabled="busy" @click="onBack">
          I'm back
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue';
import { usePresenceSessionStore } from '../store/presenceSession';
import { clearSessionExtendPause, resetActivityTimer } from '../utils/activityTracker';
import { AWAY_REASONS } from '../utils/presenceStatus';

const presenceSession = usePresenceSessionStore();
const nowMs = ref(Date.now());
const busy = ref(false);
let tick = null;

const untilMs = computed(() => {
  const raw = presenceSession.sessionExtendUntil;
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
});

const active = computed(() => untilMs.value > nowMs.value);

const remainingSec = computed(() => Math.max(0, Math.ceil((untilMs.value - nowMs.value) / 1000)));

const clock = computed(() => {
  const s = remainingSec.value;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  return `${m}:${String(r).padStart(2, '0')}`;
});

const label = computed(() => {
  const fromStore = presenceSession.myStatusLabel || presenceSession.myReason;
  if (fromStore) {
    const match = AWAY_REASONS.find((r) => r.id === presenceSession.myReason);
    return match?.label || String(fromStore);
  }
  return 'Away';
});

function startTick() {
  if (tick) return;
  tick = window.setInterval(() => {
    nowMs.value = Date.now();
  }, 250);
}

function stopTick() {
  if (!tick) return;
  clearInterval(tick);
  tick = null;
}

watch(
  active,
  (on) => {
    if (on) startTick();
    else stopTick();
  },
  { immediate: true }
);

onUnmounted(stopTick);

async function onBack() {
  busy.value = true;
  try {
    await presenceSession.clearAway();
    clearSessionExtendPause({ reschedule: true });
    resetActivityTimer();
  } finally {
    busy.value = false;
  }
}
</script>

<style>
.away-session-overlay {
  position: fixed;
  inset: 0;
  z-index: 2147482900;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(12, 28, 22, 0.72);
  backdrop-filter: blur(6px);
}
.away-session-card {
  width: min(440px, 100%);
  background: #f7faf7;
  border-radius: 18px;
  padding: 28px 26px 22px;
  box-shadow: 0 22px 50px rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(34, 80, 50, 0.14);
  text-align: center;
}
.away-eyebrow {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #0f766e;
  margin-bottom: 8px;
}
.away-title {
  margin: 0 0 10px;
  font-size: 1.45rem;
  font-weight: 800;
  color: #1a3d2b;
}
.away-sub {
  margin: 0 0 20px;
  font-size: 0.92rem;
  line-height: 1.45;
  color: #3d5c4a;
}
.away-countdown {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0 0 20px;
  padding: 16px;
  border-radius: 14px;
  background: linear-gradient(135deg, #ecfdf5 0%, #f0fdfa 100%);
  border: 1px solid #99f6e4;
}
.away-countdown-label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #0f766e;
}
.away-countdown-value {
  font-size: 2.6rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
  color: #134e4a;
  line-height: 1;
}
.away-btn {
  width: 100%;
  border: none;
  border-radius: 12px;
  padding: 12px 14px;
  font-size: 0.95rem;
  font-weight: 750;
  cursor: pointer;
  background: #1f5c3d;
  color: #fff;
}
.away-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
