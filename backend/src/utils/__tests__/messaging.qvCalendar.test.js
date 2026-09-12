import { describe, it, expect } from 'vitest';
import { quickDayWindow, quickMeetingLink } from '../quickViewCalendar.js';
describe('QV schedule and meeting destinations', () => {
  it('uses local calendar days across both daylight-saving transitions', () => {
    const spring = quickDayWindow('2026-03-08', 'America/Denver');
    const fall = quickDayWindow('2026-11-01', 'America/Denver');
    expect(spring.windowStart.toISOString()).toBe('2026-03-08T07:00:00.000Z');
    expect((spring.windowEnd - spring.windowStart) / 3600000).toBe(23);
    expect((fall.windowEnd - fall.windowStart) / 3600000).toBe(25);
  });
  it('rejects invalid dates and timezones', () => {
    expect(() => quickDayWindow('2026-02-31')).toThrow();
    expect(() => quickDayWindow('2026-09-11', 'invalid')).toThrow();
  });
  it('does not invent a room for an office block or a missing video configuration', () => {
    expect(quickMeetingLink({ id: 1, kind: 'OFFICE', platform_video_link: null })).toBeNull();
    expect(quickMeetingLink({ id: 1, kind: 'TEAM_MEETING', platform_video_link: 1 }, { portalBase: 'https://app.itsco.health' })).toBeNull();
  });
  it('uses the event source, not its label, and exposes host links only to the host', () => {
    const e = { kind: 'TEAM_MEETING', title: 'Supervision discussion', provider_id: 5, host_join_token: 'host-key', participant_join_token: 'guest-key', platform_video_link: 1 };
    expect(quickMeetingLink(e, { viewerId: 5, portalBase: 'https://app.itsco.health' })).toBe('https://app.itsco.health/join/team-meeting/host-key');
    expect(quickMeetingLink(e, { viewerId: 6, portalBase: 'https://app.itsco.health' })).toBe('https://app.itsco.health/join/team-meeting/guest-key');
    expect(quickMeetingLink({ ...e, supervisor_user_id: 5 }, { source: 'supervision', viewerId: 5, portalBase: 'https://app.itsco.health' })).toContain('/join/supervision/host-key');
  });
  it('uses a configured external meeting and rejects unsafe or cancelled links', () => {
    expect(quickMeetingLink({ google_meet_link: 'https://meet.google.com/abc-defg-hij', platform_video_link: 0 })).toBe('https://meet.google.com/abc-defg-hij');
    expect(quickMeetingLink({ google_meet_link: 'javascript:alert(1)' })).toBeNull();
    expect(quickMeetingLink({ kind: 'SUPERVISION', platform_video_link: 1, join_token: 'token' }, { portalBase: 'https://app.itsco.health' })).toBeNull();
    expect(quickMeetingLink({ modality: 'VIRTUAL', google_meet_link: 'https://meet.google.com/abc' }, { source: 'supervision' })).toBe('https://meet.google.com/abc');
    expect(quickMeetingLink({ status: 'CANCELLED', google_meet_link: 'https://meet.google.com/abc-defg-hij' })).toBeNull();
  });
});
