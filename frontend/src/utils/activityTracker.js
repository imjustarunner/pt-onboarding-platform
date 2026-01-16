import { useAuthStore } from '../store/auth';
import api from '../services/api';
import { useAgencyStore } from '../store/agency';

const INACTIVITY_TIMEOUT = 8 * 60 * 1000; // 8 minutes in milliseconds
const HEARTBEAT_INTERVAL = 30 * 1000; // 30s
let activityTimer = null;
let heartbeatTimer = null;
let lastActivityTime = Date.now();
let isTracking = false;

// Events that indicate user activity
const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];

function resetTimer() {
  lastActivityTime = Date.now();
  
  if (activityTimer) {
    clearTimeout(activityTimer);
  }
  
  if (isTracking) {
    activityTimer = setTimeout(() => {
      handleTimeout();
    }, INACTIVITY_TIMEOUT);
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
        await api.post('/auth/logout', {
          sessionId,
          reason: 'timeout'
        });
      } catch (err) {
        console.error('Failed to log timeout event:', err);
      }
      
      // Log timeout activity (already logged in logout, but log separately too)
      try {
        await api.post('/auth/activity-log', {
          actionType: 'timeout',
          sessionId,
          metadata: {
            reason: 'inactivity_timeout',
            timeoutMinutes: 8
          }
        });
      } catch (err) {
        // Ignore errors - logout already logged it
      }
    }
  } catch (err) {
    console.error('Error during timeout handling:', err);
  } finally {
    // Always logout on timeout
    await authStore.logout('timeout');
    
    // Redirect to login
    if (window.location.pathname !== '/login') {
      window.location.href = '/login?timeout=true';
    }
  }
}

function onActivity() {
  resetTimer();
}

async function sendPresenceHeartbeat() {
  const authStore = useAuthStore();
  const agencyStore = useAgencyStore();
  if (!authStore.isAuthenticated) return;

  const agencyId = agencyStore.currentAgency?.id || null;
  try {
    await api.post('/presence/heartbeat', {
      agencyId,
      lastActivityAt: new Date(lastActivityTime).toISOString()
    });
  } catch {
    // ignore - presence is best-effort
  }
}

export function startActivityTracking() {
  if (isTracking) {
    return; // Already tracking
  }
  
  isTracking = true;
  lastActivityTime = Date.now();
  
  // Add event listeners for all activity events
  activityEvents.forEach(event => {
    document.addEventListener(event, onActivity, true);
  });
  
  // Start the timer
  resetTimer();

  // Presence heartbeat (best-effort)
  sendPresenceHeartbeat();
  heartbeatTimer = setInterval(sendPresenceHeartbeat, HEARTBEAT_INTERVAL);
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

