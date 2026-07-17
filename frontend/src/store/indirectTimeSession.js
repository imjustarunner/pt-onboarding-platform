import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import api from '../services/api';
import { useAuthStore } from './auth';
import { useAgencyStore } from './agency';
import {
  applyClockedInTimeoutOverride,
  clearClockedInTimeoutOverride
} from '../utils/activityTracker';

function isOpenStatus(status) {
  const s = String(status || '');
  return s === 'open' || s === 'on_break';
}

function computeWorkedSeconds(session, nowMs = Date.now()) {
  if (!session?.clockedInAt) return 0;
  const start = new Date(session.clockedInAt).getTime();
  const end = session.clockedOutAt ? new Date(session.clockedOutAt).getTime() : nowMs;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  let breakSecs = Number(session.breakSecondsTotal || 0);
  if (String(session.status || '') === 'on_break' && session.breakStartedAt) {
    const bs = new Date(session.breakStartedAt).getTime();
    if (Number.isFinite(bs) && end > bs) breakSecs += Math.floor((end - bs) / 1000);
  }
  return Math.max(0, Math.floor((end - start) / 1000) - breakSecs);
}

function formatHms(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export const useIndirectTimeSessionStore = defineStore('indirectTimeSession', () => {
  const session = ref(null);
  const loading = ref(false);
  const lastAgencyId = ref(null);
  const tickNow = ref(Date.now());
  /** After clock-out: allow adjusting end time earlier before submit (ISO). */
  const adjustableClockOutAt = ref(null);
  /** Original server clock-out (max allowed when adjusting earlier). */
  const originalClockOutAt = ref(null);
  const pendingAdjustClockOut = ref(false);
  /** Closed session handoff for Log Time after timedown clock-out. */
  const lastClosedSession = ref(null);
  /**
   * Soft session extras (not a separate timer): e.g. Note Aid opened while clocked in.
   * Time still counts on the main clock; we only remember that documentation work happened.
   */
  const noteAidUsedDuringSession = ref(false);
  const noteAidOpenedAt = ref(null);
  let tickTimer = null;
  let pollTimer = null;

  const isHourlyWorker = computed(() => {
    const u = useAuthStore().user || {};
    const raw = u.isHourlyWorker ?? u.is_hourly_worker;
    return raw === true || raw === 1 || raw === '1';
  });

  const agencyId = computed(() => {
    const a = useAgencyStore().currentAgency;
    const n = Number(a?.id || a?.value?.id || 0);
    return Number.isFinite(n) && n > 0 ? n : null;
  });

  const isClockedIn = computed(() => isOpenStatus(session.value?.status));
  const isOnBreak = computed(() => String(session.value?.status || '') === 'on_break');

  const workedSeconds = computed(() => {
    if (!isClockedIn.value) return 0;
    return computeWorkedSeconds(session.value, tickNow.value);
  });

  const formattedElapsed = computed(() => formatHms(workedSeconds.value));

  const statusLabel = computed(() => {
    if (isOnBreak.value) return 'ON BREAK';
    if (isClockedIn.value) return 'CLOCKED IN';
    return '';
  });

  function setSession(next) {
    const st = String(next?.status || '');
    // Keep open/on_break in the global chip; clear after clock-out.
    if (isOpenStatus(st)) {
      session.value = next;
      clearClockOutAdjust();
      try {
        applyClockedInTimeoutOverride();
      } catch {
        /* activity tracker may not be ready */
      }
    } else {
      session.value = null;
      try {
        clearClockedInTimeoutOverride();
      } catch {
        /* ignore */
      }
    }
    syncTimers();
  }

  function clearSession() {
    session.value = null;
    // Keep noteAidUsedDuringSession until submit/reset — clock-out still needs it for the claim payload.
    try {
      clearClockedInTimeoutOverride();
    } catch {
      /* ignore */
    }
    syncTimers();
  }

  function markNoteAidOpened() {
    noteAidUsedDuringSession.value = true;
    if (!noteAidOpenedAt.value) {
      noteAidOpenedAt.value = new Date().toISOString();
    }
  }

  function clearNoteAidSessionFlag() {
    noteAidUsedDuringSession.value = false;
    noteAidOpenedAt.value = null;
  }

  /** Full reset (logout / leave hourly context). */
  function resetAll() {
    clearSession();
    clearNoteAidSessionFlag();
    clearClockOutAdjust();
  }

  function beginClockOutAdjust(closedSession) {
    const outAt = closedSession?.clockedOutAt || new Date().toISOString();
    const original = closedSession?.clockedOutAtOriginal || outAt;
    lastClosedSession.value = closedSession || null;
    originalClockOutAt.value = original;
    adjustableClockOutAt.value = outAt;
    pendingAdjustClockOut.value = true;
  }

  function setAdjustableClockOutAt(iso) {
    adjustableClockOutAt.value = iso || null;
  }

  function clearClockOutAdjust() {
    adjustableClockOutAt.value = null;
    originalClockOutAt.value = null;
    pendingAdjustClockOut.value = false;
    lastClosedSession.value = null;
  }

  /** One-shot handoff to Log Time after timedown clock-out. */
  function takePendingClosedSession() {
    if (!lastClosedSession.value) return null;
    const closed = lastClosedSession.value;
    const adjusted = adjustableClockOutAt.value || closed.clockedOutAt;
    const original = originalClockOutAt.value || closed.clockedOutAt;
    lastClosedSession.value = null;
    pendingAdjustClockOut.value = false;
    // Keep original/adjustable in store briefly so UI can sync; Log Time owns after take.
    return {
      session: {
        ...closed,
        clockedOutAt: adjusted,
        workedSeconds: computeWorkedSeconds({ ...closed, clockedOutAt: adjusted })
      },
      originalClockOutAt: original
    };
  }

  function startTick() {
    if (tickTimer) return;
    tickTimer = setInterval(() => {
      tickNow.value = Date.now();
    }, 1000);
  }

  function stopTick() {
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  }

  function syncTimers() {
    if (isClockedIn.value) startTick();
    else stopTick();
  }

  async function clockIn() {
    const aid = agencyId.value;
    if (!aid) throw new Error('agencyId is required');
    clearNoteAidSessionFlag();
    try {
      sessionStorage.removeItem('itl-note-aid-declined-clockin');
    } catch {
      /* ignore */
    }
    const resp = await api.post('/payroll/me/indirect-time-session/clock-in', { agencyId: aid });
    setSession(resp.data?.session || null);
    return session.value;
  }

  async function clockOutFromTimedown() {
    const aid = agencyId.value;
    if (!aid) throw new Error('agencyId is required');
    const resp = await api.post('/payroll/me/indirect-time-session/clock-out', { agencyId: aid });
    const closed = resp.data?.session || null;
    // Closed session is not kept in the nav chip; hand off to Log Time for adjust/submit.
    session.value = null;
    beginClockOutAdjust(closed);
    try {
      clearClockedInTimeoutOverride();
    } catch {
      /* ignore */
    }
    syncTimers();
    return closed;
  }

  /** Quiet clock-out before inactivity logout (no adjust handoff). */
  async function forceClockOutOnLogout() {
    if (!isClockedIn.value || !agencyId.value) return null;
    try {
      const resp = await api.post(
        '/payroll/me/indirect-time-session/clock-out',
        { agencyId: agencyId.value },
        { skipAuthRedirect: true, skipGlobalLoading: true }
      );
      session.value = null;
      clearClockOutAdjust();
      try {
        clearClockedInTimeoutOverride();
      } catch {
        /* ignore */
      }
      syncTimers();
      return resp.data?.session || null;
    } catch {
      session.value = null;
      syncTimers();
      return null;
    }
  }

  async function refresh({ force = false } = {}) {
    const auth = useAuthStore();
    if (!auth.isAuthenticated) {
      resetAll();
      return null;
    }
    if (!isHourlyWorker.value) {
      resetAll();
      return null;
    }
    const aid = agencyId.value;
    if (!aid) {
      clearSession();
      return null;
    }
    if (!force && loading.value) return session.value;
    loading.value = true;
    lastAgencyId.value = aid;
    try {
      const resp = await api.get('/payroll/me/indirect-time-session', {
        params: { agencyId: aid },
        skipGlobalLoading: true,
        skipAuthRedirect: true
      });
      setSession(resp.data?.session || null);
      return session.value;
    } catch (e) {
      if (e?.response?.status === 403 || e?.response?.status === 401) {
        resetAll();
      }
      return session.value;
    } finally {
      loading.value = false;
    }
  }

  function startPolling() {
    stopPolling();
    refresh({ force: true });
    pollTimer = setInterval(() => {
      refresh({ force: true });
    }, 30000);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    stopTick();
  }

  return {
    session,
    loading,
    isHourlyWorker,
    agencyId,
    isClockedIn,
    isOnBreak,
    workedSeconds,
    formattedElapsed,
    statusLabel,
    adjustableClockOutAt,
    originalClockOutAt,
    pendingAdjustClockOut,
    lastClosedSession,
    noteAidUsedDuringSession,
    noteAidOpenedAt,
    setSession,
    clearSession,
    markNoteAidOpened,
    clearNoteAidSessionFlag,
    resetAll,
    beginClockOutAdjust,
    setAdjustableClockOutAt,
    clearClockOutAdjust,
    takePendingClosedSession,
    clockIn,
    clockOutFromTimedown,
    forceClockOutOnLogout,
    refresh,
    startPolling,
    stopPolling
  };
});
