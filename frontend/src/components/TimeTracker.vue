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

const MODULE_IDLE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

const props = defineProps({
  moduleId: {
    type: [String, Number],
    required: true
  },
  enabled: {
    type: Boolean,
    default: true
  }
});

const emit = defineEmits(['time-update']);

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

const logTime = async (durationMinutes) => {
  try {
    await api.post('/progress/time', {
      moduleId: parseInt(props.moduleId),
      sessionStart: new Date(sessionStart.value).toISOString(),
      sessionEnd: new Date().toISOString(),
      durationMinutes
    });
    emit('time-update', durationMinutes);
  } catch (error) {
    console.error('Failed to log time:', error);
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
    
    // Log time every 5 minutes
    const now = Date.now();
    if (now - lastLogTime >= 5 * 60 * 1000) {
      const durationMinutes = Math.floor((now - lastLogTime) / 60000);
      logTime(durationMinutes);
      lastLogTime = now;
    }
  }, 1000);
};

const stopTracking = () => {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    
    // Log final time
    if (sessionStart.value) {
      const durationMinutes = Math.floor((Date.now() - lastLogTime) / 60000);
      if (durationMinutes > 0) {
        logTime(durationMinutes);
      }
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
  idleTimerId = setTimeout(() => {
    // Pause timer on inactivity (separate from global auth timeout)
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

