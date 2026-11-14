import { expect, it } from 'vitest';
import { scheduleClientFace, scheduleClientInitials } from '../scheduleClientNames.js';
import { schoolClosureBlocks } from '../schoolClosureBlocks.js';

const session = { kind: 'sevt', clientId: 42, isClientSession: true, clientName: 'Jane Doe', title: 'Jane Doe visit', shortLabel: 'Jane Doe', schedulingNoteSnippet: 'Ask Jane Doe', appointmentId: 71, startAt: '2026-11-10T10:00:00', locationLabel: 'Virtual' };
it('hides client names and free text on the face while retaining editor identity', () => {
  const hidden = scheduleClientFace(session, 'hidden', '10–11 AM');
  expect([hidden.shortLabel, hidden.title, hidden.displayClientName, hidden.schedulingNoteSnippet].join(' ')).not.toMatch(/Jane|Doe|42/);
  expect(hidden).toMatchObject({ clientId: 42, appointmentId: 71, clientName: 'Jane Doe', displayClientName: 'Client' });
  expect(hidden.shortLabel).toContain('10–11 AM');
  expect(scheduleClientFace(session, 'initials').shortLabel).toContain('JD session');
  expect(scheduleClientFace(session, 'full').title).toContain('Jane Doe');
  expect(session.schedulingNoteSnippet).toBe('Ask Jane Doe');
});
it('handles last-name-first, Unicode and missing names without deriving initials from free text', () => {
  expect(scheduleClientInitials('Doe, Jane')).toBe('JD');
  expect(scheduleClientInitials('Élodie Núñez')).toBe('ÉN');
  expect(scheduleClientFace({ ...session, clientName: '' }, 'initials').title).not.toContain('Jane');
  expect(scheduleClientInitials('Client #42')).toBe('');
  const meeting = { kind: 'sevt', title: 'Casey Smith · Team meeting' };
  expect(scheduleClientFace(meeting, 'hidden').title).toBe(meeting.title);
  expect(scheduleClientFace({ kind: 'gevt', title: 'Jane Doe appointment' }, 'initials').title).toBe('Google event');
  expect(scheduleClientFace({ kind: 'peerbusy', peerActivityType: 'session', title: 'Jane Doe appointment' }, 'hidden').title).toBe('Client session');
});
it('deduplicates district slivers, keeps school closures, and excludes other dates and partial days', () => {
  const district = { eventId: 1, agencyId: 2, schoolOrgId: 20, date: '2026-11-10', scope: 'district', districtName: 'D11', fullDay: true, kind: 'no_school', reason: 'Snow day' };
  const rows = [district, { ...district, schoolOrgId: 21 }, { ...district, eventId: 2, schoolOrgId: 22, schoolName: 'North', scope: 'school' }, { ...district, eventId: 3, fullDay: false }, { ...district, eventId: 4, date: '2026-11-11' }];
  const blocks = schoolClosureBlocks(rows, [], '2026-11-10');
  expect(blocks).toHaveLength(2);
  expect(blocks.map(b => b.shortLabel)).toEqual(['D11 · No school', 'North · No school']);
  expect(blocks[0].title).toContain('Snow day');
});

it('uses the canonical full name even when an old title still contains initials', () => {
  const result = scheduleClientFace({kind:'sevt',isClientSession:true,clientId:42,clientName:'Jane Doe',shortLabel:'JD session',title:'JD session',locationLabel:'Windchime · Office #10'}, 'full', '3–4 PM');
  expect(result.shortLabel).toContain('Jane Doe'); expect(result.title).toContain('Windchime · Office #10');
});
