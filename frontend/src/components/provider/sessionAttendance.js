import { reactive } from 'vue';
import api from '../../services/api';

// Calendar cards and the daily review share one request per agency and provider.
// Keep scopes separate when a user signs out or changes organizations.
const entries = new Map();
export function attendanceState(agencyId, userId) {
  const key = `${Number(agencyId)}:${Number(userId)}`;
  if (!entries.has(key)) entries.set(key, reactive({
    enabled: false, sessions: [], timezone: 'America/Denver', deferred: new Set(),
    loadedAt: 0, pending: null, error: '', revision: 0, busy: new Set()
  }));
  return entries.get(key);
}

// Invalidate once before mounted views refresh. An older in-flight response must
// never restore a prompt after a note, cancellation, or attendance decision saved.
if (typeof window !== 'undefined') window.addEventListener('session-attendance-changed', () => {
  for (const state of entries.values()) { state.revision++; state.loadedAt = 0; state.pending = null; }
});

export async function refreshAttendance(agencyId, userId, { force = false } = {}) {
  const state = attendanceState(agencyId, userId);
  if (!agencyId || !userId) return state;
  if (state.pending) return state.pending;
  if (!force && Date.now() - state.loadedAt < 45000) return state;
  const revision = state.revision;
  state.pending = (async () => {
    try {
      const { data } = await api.get('/family-billing/provider/copay-attendance', {
        params: { agencyId: Number(agencyId) }, skipGlobalLoading: true
      });
      if (revision !== state.revision) return state;
      state.enabled = data.enabled === true;
      state.sessions = data.sessions || [];
      state.timezone = data.timezone || 'America/Denver';
      state.loadedAt = Date.now(); state.error = '';
    } catch (error) {
      if (revision === state.revision) state.error = error.response?.data?.error?.message || 'Attendance could not be refreshed. Please retry.';
    } finally {
      if (revision === state.revision) state.pending = null;
    }
    return state;
  })();
  return state.pending;
}
