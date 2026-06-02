<template>
  <div class="time-tracker">
    <div class="time-display">
      <span class="time-label">Time in session:</span>
      <span class="time-value">{{ formatTime(sessionTime) }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import api from '../services/api';

const MODULE_IDLE_TIMEOUT_MS = 3 * 60 * 1000;
const LOG_INTERVAL_MS = 5 * 60 * 1000;

const props = defineProps({
  focusId: { type: [String, Number], required: true },
  stepId: { type: [String, Number], required: true },
  agencyId: { type: [String, Number], required: true },
  enabled: { type: Boolean, default: true },
  disableIdleTimeout: { type: Boolean, default: false },
  moduleId: { type: [String, Number], default: null }
});

const emit = defineEmits(['time-update', 'session-seconds']);

const sessionTime = ref(0);
const sessionStart = ref(null);
let intervalId = null;
let lastLogTime = Date.now();
let idleTimerId = null;

const formatTime = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
};

const logTime = async (durationSeconds) => {
  try {
    const safeSeconds = Math.max(0, Math.floor(Number(durationSeconds || 0)));
    if (safeSeconds <= 0) return;

    await api.post(`/training-focuses/${props.focusId}/steps/${props.stepId}/time`, {
      agencyId: parseInt(props.agencyId, 10),
      sessionStart: new Date(sessionStart.value).toISOString(),
      sessionEnd: new Date().toISOString(),
      durationSeconds: safeSeconds
    });

    if (props.moduleId) {
      await api.post('/progress/time', {
        moduleId: parseInt(props.moduleId, 10),
        sessionStart: new Date(sessionStart.value).toISOString(),
        sessionEnd: new Date().toISOString(),
        durationSeconds: safeSeconds
      }).catch(() => {});
    }

    emit('time-update', safeSeconds);
  } catch (error) {
    console.error('Failed to log focus step time:', error);
  }
};

const flushElapsed = () => {
  if (!sessionStart.value) return;
  const now = Date.now();
  const durationSeconds = Math.floor((now - lastLogTime) / 1000);
  if (durationSeconds > 0) {
    logTime(durationSeconds);
    lastLogTime = now;
  }
};

const startTracking = () => {
  if (!props.enabled) return;
  if (!sessionStart.value) {
    sessionStart.value = Date.now();
    lastLogTime = Date.now();
  }
  if (intervalId) return;
  intervalId = setInterval(() => {
    sessionTime.value += 1;
    emit('session-seconds', sessionTime.value);
    if (Date.now() - lastLogTime >= LOG_INTERVAL_MS) {
      flushElapsed();
    }
  }, 1000);
};

const stopTracking = () => {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  flushElapsed();
};

const resetIdleTimer = () => {
  if (props.disableIdleTimeout) return;
  if (idleTimerId) clearTimeout(idleTimerId);
  idleTimerId = setTimeout(() => {
    stopTracking();
  }, MODULE_IDLE_TIMEOUT_MS);
};

const handleActivity = () => {
  if (!props.enabled) return;
  if (!intervalId && sessionStart.value) {
    startTracking();
  } else if (!sessionStart.value) {
    sessionStart.value = Date.now();
    lastLogTime = Date.now();
    startTracking();
  }
  resetIdleTimer();
};

const handleVisibility = () => {
  if (document.hidden) {
    stopTracking();
  } else if (props.enabled) {
    handleActivity();
  }
};

watch(() => props.enabled, (val) => {
  if (val) handleActivity();
  else stopTracking();
});

onMounted(() => {
  if (props.enabled) handleActivity();
  ['mousemove', 'keydown', 'scroll', 'touchstart', 'click'].forEach((evt) => {
    window.addEventListener(evt, handleActivity, { passive: true });
  });
  document.addEventListener('visibilitychange', handleVisibility);
});

onUnmounted(() => {
  stopTracking();
  if (idleTimerId) clearTimeout(idleTimerId);
  ['mousemove', 'keydown', 'scroll', 'touchstart', 'click'].forEach((evt) => {
    window.removeEventListener(evt, handleActivity);
  });
  document.removeEventListener('visibilitychange', handleVisibility);
});
</script>

<style scoped>
.time-tracker {
  margin: 12px 0;
  padding: 8px 12px;
  background: #f0f4f8;
  border-radius: 6px;
  display: inline-block;
}

.time-label {
  font-size: 13px;
  color: var(--text-secondary);
  margin-right: 8px;
}

.time-value {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
</style>
