/**
 * Activity tracker: inactivity timeout and presence heartbeat.
 *
 * Inactivity: after INACTIVITY_TIMEOUT with no DOM events (mouse, key, scroll, etc.)
 * while the tab is visible, the user is logged out. The presence heartbeat (every
 * HEARTBEAT_INTERVAL) is treated as activity when it succeeds. When the tab is hidden
 * (user in another window/tab), the inactivity countdown is paused so multiple windows
 * don't cause spurious logouts. visibilitychange restarts the timer when the user
 * returns to the tab.
 */
import { useAuthStore } from '../store/auth';
import api from '../services/api';
import { useAgencyStore } from '../store/agency';

const DEFAULT_INACTIVITY_TIMEOUT_MINUTES = 8;
const DEFAULT_HEARTBEAT_INTERVAL_SECONDS = 30;
const MIN_INACTIVITY_TIMEOUT_MINUTES = 1;
const MAX_INACTIVITY_TIMEOUT_MINUTES = 240;
const MIN_HEARTBEAT_INTERVAL_SECONDS = 10;
const MAX_HEARTBEAT_INTERVAL_SECONDS = 300;
const LAST_ACTIVITY_KEY = 'presence:lastActivityAt';
let activityTimer = null;
let heartbeatTimer = null;
let lastActivityTime = Date.now();
let isTracking = false;

// Events that indicate user activity
const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];

function resetTimer() {
  if (activityTimer) {
    clearTimeout(activityTimer);
    activityTimer = null;
  }

  // Only run the inactivity countdown when this tab/window is visible.
  // When the user has multiple windows open, a hidden tab should not log them out.
  if (isTracking && document.visibilityState === 'visible') {
    activityTimer = setTimeout(() => {
      handleTimeout();
    }, getInactivityTimeoutMs());
  }
}

async function handleTimeout() {
  const authStore = useAuthStore();
  
  if (!authStore.isAuthenticated) {
    return;
  }
  
  try {
    // Get session ID from localStorage
    const sessionId = localStorage.getItem('sessionId');
    
    // Log timeout event to backend
    if (sessionId || authStore.token) {
      try {
        await api.post(
          '/auth/logout',
          { sessionId, reason: 'timeout' },
          { skipAuthRedirect: true }
        );
      } catch (err) {
        if (err?.response?.status !== 401) {
          console.error('Failed to log timeout event:', err);
        }
      }
      
      // Log timeout activity (already logged in logout, but log separately too)
      try {
        const timeoutMinutes = Math.round(getInactivityTimeoutMs() / 60000);
        await api.post(
          '/auth/activity-log',
          {
            actionType: 'timeout',
            sessionId,
            metadata: {
              reason: 'inactivity_timeout',
              timeoutMinutes
            }
          },
          { skipAuthRedirect: true }
        );
      } catch (err) {
        // Ignore errors - logout already logged it
      }
    }
  } catch (err) {
    console.error('Error during timeout handling:', err);
  } finally {
    // Always logout on timeout
    await authStore.logout('timeout', { redirectTo: '/login?timeout=true' });
  }
}

function onActivity() {
  lastActivityTime = Date.now();
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(lastActivityTime));
  } catch {
    // ignore storage issues
  }
  resetTimer();
}

function onStorageActivity(event) {
  if (event?.key !== LAST_ACTIVITY_KEY) return;
  const nextTime = Number(event.newValue);
  if (!Number.isFinite(nextTime) || nextTime <= lastActivityTime) return;
  lastActivityTime = nextTime;
  if (isTracking && document.visibilityState === 'visible') {
    resetTimer();
  }
}

function onVisibilityChange() {
  if (!isTracking) return;

  if (document.visibilityState === 'visible') {
    // User returned to this tab/window – start (or restart) the inactivity countdown.
    resetTimer();
    sendPresenceHeartbeat();
  } else {
    // Tab/window is now hidden (e.g. user switched to another window). Pause the
    // inactivity countdown so multiple windows don't cause logout in the hidden one.
    if (activityTimer) {
      clearTimeout(activityTimer);
      activityTimer = null;
    }
  }
}

async function sendPresenceHeartbeat() {
  const authStore = useAuthStore();
  const agencyStore = useAgencyStore();
  if (!authStore.isAuthenticated) return;
  if (document.visibilityState !== 'visible') return;

  const agencyId = agencyStore.currentAgency?.id || null;
  try {
    await api.post('/presence/heartbeat', {
      agencyId,
      lastActivityAt: new Date(lastActivityTime).toISOString()
    }, { skipGlobalLoading: true });
  } catch {
    // ignore - presence is best-effort
  }
}

export function startActivityTracking({ force = false } = {}) {
  if (isTracking && !force) {
    return; // Already tracking
  }
  if (isTracking) {
    stopActivityTracking();
  }
  
  isTracking = true;
  const storedActivity = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
  lastActivityTime = Number.isFinite(storedActivity) ? storedActivity : Date.now();
  
  // Add event listeners for all activity events
  activityEvents.forEach(event => {
    document.addEventListener(event, onActivity, true);
  });

  // When user returns to tab, reset inactivity timer (avoids logout after background tab)
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('storage', onStorageActivity);

  // Start the timer
  resetTimer();

  // Presence heartbeat (best-effort)
  sendPresenceHeartbeat();
  heartbeatTimer = setInterval(sendPresenceHeartbeat, getHeartbeatIntervalMs());
}

export function stopActivityTracking() {
  if (!isTracking) {
    return; // Not tracking
  }
  
  isTracking = false;
  
  // Remove event listeners
  activityEvents.forEach(event => {
    document.removeEventListener(event, onActivity, true);
  });
  document.removeEventListener('visibilitychange', onVisibilityChange);
  window.removeEventListener('storage', onStorageActivity);

  // Clear the timer
  if (activityTimer) {
    clearTimeout(activityTimer);
    activityTimer = null;
  }

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

export function getLastActivityTime() {
  return lastActivityTime;
}

function getSessionSettings() {
  const agencyStore = useAgencyStore();
  const raw =
    agencyStore.currentAgency?.session_settings_json ??
    agencyStore.currentAgency?.sessionSettings ??
    null;
  if (!raw) return {};
  if (typeof raw === 'object') return raw || {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) || {};
    } catch {
      return {};
    }
  }
  return {};
}

function clampNumber(raw, min, max, fallback) {
  const num = Number(raw);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function getInactivityTimeoutMs() {
  const settings = getSessionSettings();
  const minutes = clampNumber(
    settings.inactivityTimeoutMinutes,
    MIN_INACTIVITY_TIMEOUT_MINUTES,
    MAX_INACTIVITY_TIMEOUT_MINUTES,
    DEFAULT_INACTIVITY_TIMEOUT_MINUTES
  );
  return minutes * 60 * 1000;
}

function getHeartbeatIntervalMs() {
  const settings = getSessionSettings();
  const seconds = clampNumber(
    settings.heartbeatIntervalSeconds,
    MIN_HEARTBEAT_INTERVAL_SECONDS,
    MAX_HEARTBEAT_INTERVAL_SECONDS,
    DEFAULT_HEARTBEAT_INTERVAL_SECONDS
  );
  return seconds * 1000;
}

