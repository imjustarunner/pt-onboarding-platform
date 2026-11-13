import { expect, it } from 'vitest';
import { interviewJoinUrl, interviewRsvpUrl } from '../interviewJoinUrl.js';
import { interviewCalendarJoinUrl, interviewCalendarEventId } from '../interviewCalendarLink.js';

it('keeps the opaque invitation under the interview agency on PlotLine', () => {
  expect(interviewJoinUrl('itsco', 's'.repeat(32))).toBe(`https://plotlinepo.com/interview/itsco/video/${'s'.repeat(32)}`);
  expect(interviewJoinUrl('../other', 'token')).toBeNull();
});
it('uses the same RSVP route for branded and legacy invitations', () => {
  expect(interviewRsvpUrl('https://plotlinepo.com/interview/itsco/video/opaque?x=1')).toBe('https://plotlinepo.com/interview-rsvp/opaque');
  expect(interviewRsvpUrl('https://tenant.example/join/team-meeting/opaque')).toBe('https://tenant.example/interview-rsvp/opaque');
});
it('keeps calendar guests on PlotLine without disclosing the applicant invitation', () => {
  const url = new URL(interviewCalendarJoinUrl(interviewJoinUrl('itsco', 'candidate-secret'), 42));
  expect(url.origin).toBe('https://plotlinepo.com');
  expect(url.pathname).toMatch(/^\/interview\/itsco\/video\/c-/);
  expect(url.toString()).not.toContain('candidate-secret');
  expect(interviewCalendarEventId(url.pathname.split('/').pop())).toBe(42);
});
