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
  joinIdentity: '',
  localName: 'You',
  startMuted: true,
  startVideoOff: true,
  isHostOrCohost: false,
  screenShareMode: 'restricted',
  canShareScreen: false,
  canGrantScreenShare: false,
  transcriptionActive: false,
});
let returnMedia = null;

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
    state.joinIdentity = String(params.joinIdentity || '');
    state.localName = String(params.localName || 'You');
    state.startMuted = params.startMuted !== false;
    state.startVideoOff = params.startVideoOff !== false;
    state.isHostOrCohost = !!params.isHostOrCohost;
    state.screenShareMode = params.screenShareMode || 'restricted';
    state.canShareScreen = !!params.canShareScreen;
    state.canGrantScreenShare = !!params.canGrantScreenShare;
    state.transcriptionActive = !!params.transcriptionActive;
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
    state.joinIdentity = '';
  }

  function saveReturnMedia(path, preferences) { returnMedia = { path, preferences }; }
  function takeReturnMedia(path) {
    const preferences = returnMedia?.path === path ? returnMedia.preferences : null;
    returnMedia = null;
    return preferences;
  }
  return { state: readonly(state), setMiniMode, clearMiniMode, saveReturnMedia, takeReturnMedia };
}
