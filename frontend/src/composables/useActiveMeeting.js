/** Mini changes presentation only; MeetingRouteHost retains the original live room. */
import { reactive, readonly } from 'vue';
import { canUseMeetingMiniMode } from '../utils/meetingMiniMode.js';

const state = reactive({ active: false, connected: false, meetingPath: '' });
export function useActiveMeeting() {
  function setMiniMode({ meetingPath } = {}) {
    if (!canUseMeetingMiniMode() || !meetingPath) return false;
    state.meetingPath = meetingPath;
    state.connected = true;
    state.active = true;
    return true;
  }
  function clearMiniMode() {
    state.active = false;
    state.connected = false;
    state.meetingPath = '';
  }
  return { state: readonly(state), setMiniMode, clearMiniMode };
}
