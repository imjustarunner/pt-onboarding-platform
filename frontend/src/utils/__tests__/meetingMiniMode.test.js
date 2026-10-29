import { afterEach, describe, expect, it, vi } from 'vitest';
import { canUseMeetingMiniMode } from '../meetingMiniMode.js';
import { useActiveMeeting } from '../../composables/useActiveMeeting.js';
afterEach(() => { useActiveMeeting().clearMiniMode(); vi.unstubAllGlobals(); });
describe('in-app meeting mini mode', () => {
  it.each([390, 768, 1440])('allows a retained session at width %s', width => {
    vi.stubGlobal('innerWidth', width);
    expect(canUseMeetingMiniMode()).toBe(true);
    const meeting = useActiveMeeting();
    expect(meeting.setMiniMode({ meetingPath: '/join/supervision/9' })).toBe(true);
    expect(meeting.state).toMatchObject({ active: true, meetingPath: '/join/supervision/9' });
  });
  it('does not create a mini without a route to retain', () => {
    expect(useActiveMeeting().setMiniMode({ token: 'not-a-new-session' })).toBe(false);
  });
});
