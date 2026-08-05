/**
 * Global singleton that tracks an active team meeting in "mini" mode.
 * When the user collapses a meeting to the floating bar, the connection
 * params are stored here so FloatingMeetingBar can re-subscribe without
 * needing the full JoinTeamMeetingView route to remain mounted.
 */
import { reactive, readonly } from 'vue';

const state = reactive({
  active: false,
  token: '',
  vonageSessionId: '',
  applicationId: '',
  roomName: '',
  eventId: null,
  meetingPath: '',
  meetingTitle: 'Meeting',
});

export function useActiveMeeting() {
  function setMiniMode(params = {}) {
    state.active = true;
    state.token = String(params.token || '');
    state.vonageSessionId = String(params.vonageSessionId || '');
    state.applicationId = String(params.applicationId || '');
    state.roomName = String(params.roomName || '');
    state.eventId = params.eventId || null;
    state.meetingPath = String(params.meetingPath || '/dashboard');
    state.meetingTitle = String(params.meetingTitle || 'Meeting');
  }

  function clearMiniMode() {
    state.active = false;
    state.token = '';
    state.vonageSessionId = '';
    state.applicationId = '';
    state.roomName = '';
    state.eventId = null;
    state.meetingPath = '';
    state.meetingTitle = 'Meeting';
  }

  return { state: readonly(state), setMiniMode, clearMiniMode };
}
