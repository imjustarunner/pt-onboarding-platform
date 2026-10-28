import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveSupervisionAccess, supervisionAccessFor, attachSupervisionAccess, supervisionAccountJoinUrl } from '../supervisionInvitationAccess';
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); history.replaceState(null,'','/'); });
const save = (id = 92) => saveSupervisionAccess({ sessionId: id, token: 'session-only', expiresAt: Date.now() + 60000 });
describe('personal supervision credential routing', () => {
  it('creates a shareable account link without carrying the sender’s identity',()=>{
    expect(supervisionAccountJoinUrl(92,'https://tenant.example')).toBe('https://tenant.example/join/supervision/92?account=1');
    expect(supervisionAccountJoinUrl('personal-token')).toBe('');
  });
  it('ignores a cached personal grant when following a shared account link',()=>{
    save();history.replaceState(null,'','/join/supervision/92?account=1');
    expect(attachSupervisionAccess({url:'/supervision/sessions/92/video-token'}).headers).toBeUndefined();
    expect(attachSupervisionAccess({url:'/meeting-agendas',params:{meetingType:'supervision_session',meetingId:92}}).headers).toBeUndefined();
  });
  it('always uses account authentication for calendar RSVP edits',()=>{
    save();
    expect(attachSupervisionAccess({url:'/supervision/sessions/92/rsvp',method:'post'}).headers).toBeUndefined();
    expect(attachSupervisionAccess({url:'/supervision/sessions/92/rsvp',method:'get'}).headers).toBeUndefined();
  });
  it('attaches a grant only to its session requests', () => {
    save();
    expect(attachSupervisionAccess({ url: '/supervision/sessions/92/video-token' })).toMatchObject({ headers: { 'X-Supervision-Access': 'session-only' }, skipAuthRedirect: true });
    for (const url of ['/users', '/supervision/sessions/91/video-token', 'https://external.example/supervision/sessions/92/video-token', '//external.example/supervision/sessions/92/video-token']) {
      expect(attachSupervisionAccess({ url }).headers).toBeUndefined();
    }
  });
  it('expires credentials and removes stored access', () => {
    vi.useFakeTimers(); save(93); vi.advanceTimersByTime(60001);
    expect(supervisionAccessFor(93)).toBeNull(); expect(sessionStorage.getItem('supervision-personal-access:93')).toBeNull();
  });
  it('works for this tab when browser storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage blocked'); });
    save(94); expect(supervisionAccessFor(94).token).toBe('session-only');
  });
  it('uses the meeting id and type for agenda access', () => {
    save();
    expect(attachSupervisionAccess({ url: '/meeting-agendas', params: { meetingType: 'supervision_session', meetingId: 92 } }).headers).toEqual({ 'X-Supervision-Access': 'session-only' });
    expect(attachSupervisionAccess({ url: '/meeting-agendas', params: { meetingType: 'team_meeting', meetingId: 92 } }).headers).toBeUndefined();
  });
});
