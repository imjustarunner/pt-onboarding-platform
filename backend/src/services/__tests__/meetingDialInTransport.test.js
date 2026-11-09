import { afterEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ sip: vi.fn().mockResolvedValue({ connectionId: 'bridge' }), token: vi.fn().mockReturnValue('short-lived-token') }));
vi.mock('../vonageVideo.service.js', () => ({ default: { getClient: () => ({ video: { initiateSIPCall: m.sip } }), generateToken: m.token } }));
vi.mock('../meetingDialInPolicy.js', () => ({ requireDialInConfiguration: vi.fn(), dialInReadiness: vi.fn(), dialInError: (message) => new Error(message) }));
import { dialInTransport } from '../meetingDialInTransport.service.js';
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it.each([undefined, 'sip:12025550123@meetings.sip-us.vonage.com;transport=tls'])('uses the owned number as the authenticated SIP caller for %s', async uri => {
  vi.stubEnv('MEETING_DIAL_IN_NUMBER', '+12025550123');
  vi.stubEnv('MEETING_DIAL_IN_SIP_URI', uri);
  vi.stubEnv('MEETING_DIAL_IN_SIP_USERNAME', 'bridge-user');
  vi.stubEnv('MEETING_DIAL_IN_SIP_PASSWORD', 'synthetic-password');
  await dialInTransport.connect({ id: 'phone-call', video_session_id: 'same-video-room' }, { userId: 12, name: 'Synthetic participant', isHost: false }, 'one-call-secret');
  expect(m.sip).toHaveBeenCalledWith('same-video-room', { token: 'short-lived-token', sip: {
    uri: uri || 'sip:12025550123@sip-us.vonage.com;transport=tls',
    from: uri ? '12025550123@meetings.sip-us.vonage.com' : '12025550123@sip-us.vonage.com',
    auth: { username: 'bridge-user', password: 'synthetic-password' }, secure: true,
    headers: { 'X-Meeting-Call': 'phone-call', 'X-Meeting-Bridge': 'one-call-secret' }
  } });
});
