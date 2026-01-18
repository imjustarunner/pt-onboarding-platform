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

const MODULE_IDLE_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
const LOG_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const props = defineProps({
  moduleId: {
    type: [String, Number],
    required: true
  },
  enabled: {
    type: Boolean,
    default: true
  },
  disableIdleTimeout: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['time-update', 'session-seconds']);

const sessionTime = ref(0); // in seconds
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
    await api.post('/progress/time', {
      moduleId: parseInt(props.moduleId),
      sessionStart: new Date(sessionStart.value).toISOString(),
      sessionEnd: new Date().toISOString(),
      durationSeconds: safeSeconds
    });
    emit('time-update', safeSeconds);
  } catch (error) {
    console.error('Failed to log time:', error);
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
  if (!props.enabled) {
    return;
  }
  sessionStart.value = Date.now();
  lastLogTime = Date.now();
  
  intervalId = setInterval(() => {
    sessionTime.value++;
    // Lightweight sync so parent can compute thresholds (e.g., expected time warnings).
    if (sessionTime.value % 10 === 0) emit('session-seconds', sessionTime.value);
    
    // Log time every 5 minutes
    const now = Date.now();
    if (now - lastLogTime >= LOG_INTERVAL_MS) {
      flushElapsed();
    }
  }, 1000);
};

const stopTracking = () => {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    
    // Log final time
    if (sessionStart.value) {
      flushElapsed();
    }
  }
};

const clearIdleTimer = () => {
  if (idleTimerId) {
    clearTimeout(idleTimerId);
    idleTimerId = null;
  }
};

const armIdleTimer = () => {
  clearIdleTimer();
  if (!props.enabled) return;
  if (props.disableIdleTimeout) return;
  idleTimerId = setTimeout(() => {
    // On inactivity: flush logged time and pause timer (separate from global auth timeout)
    stopTracking();
  }, MODULE_IDLE_TIMEOUT_MS);
};

// Track visibility changes
const handleVisibilityChange = () => {
  if (document.hidden) {
    stopTracking();
  } else {
    startTracking();
    armIdleTimer();
  }
};

// Events that indicate in-module activity
const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
const handleActivity = () => {
  if (!props.enabled) return;
  // If we were paused due to inactivity, resume.
  if (!intervalId) {
    startTracking();
  }
  armIdleTimer();
};

onMounted(() => {
  if (props.enabled) {
    startTracking();
  }
  document.addEventListener('visibilitychange', handleVisibilityChange);
  activityEvents.forEach(evt => document.addEventListener(evt, handleActivity, true));
  armIdleTimer();
});

onUnmounted(() => {
  stopTracking();
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  activityEvents.forEach(evt => document.removeEventListener(evt, handleActivity, true));
  clearIdleTimer();
});

watch(() => props.enabled, (enabled) => {
  if (enabled) {
    startTracking();
    armIdleTimer();
  } else {
    stopTracking();
    clearIdleTimer();
  }
});

watch(() => props.disableIdleTimeout, () => {
  // If idle timeout becomes disabled (e.g., video page), clear any pending timer.
  // If it becomes enabled again, re-arm.
  if (props.disableIdleTimeout) clearIdleTimer();
  else armIdleTimer();
});
</script>

<style scoped>
.time-tracker {
  background: var(--bg-alt);
  padding: 16px 20px;
  border-radius: 8px;
  margin-bottom: 24px;
  text-align: center;
  border: 2px solid var(--border);
}

.time-display {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
}

.time-label {
  color: var(--text-secondary);
  font-weight: 600;
  text-transform: uppercase;
  font-size: 12px;
  letter-spacing: 0.05em;
}

.time-value {
  color: var(--primary);
  font-size: 24px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
</style>

