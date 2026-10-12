import { it, expect, vi } from 'vitest';
import { assertAppointmentWindowAvailable } from '../appointmentConflict.service.js';

const row = { providerUserId: 9, startAt: '2026-10-13 19:00:00', endAt: '2026-10-13 20:00:00' };
function database({ kind, table, name = 'Lindsey', googleEventId = null }) {
  return { execute: vi.fn(async sql => {
    if (sql.includes('FROM users')) return [[{ first_name: name, last_name: 'Byers' }]];
    if (kind && sql.includes('FROM provider_schedule_events p')) return [[{
      id: 5, kind, all_day: 0, start_at: row.startAt, end_at: row.endAt,
      google_event_id: googleEventId, title: 'Private event title', description: 'Private notes'
    }]];
    if (table && sql.includes(`FROM ${table}`)) return [[{ id: 4 }]];
    return [[]];
  }) };
}
it.each([
  ['PERSONAL_EVENT', 'a personal event'], ['SCHEDULE_HOLD', 'a schedule hold'],
  ['TEAM_MEETING', 'a team meeting'], ['HUDDLE', 'a huddle'], ['INDIRECT_SERVICES', 'indirect-service time']
])('identifies the person and local %s conflict without exposing private contents', async (kind, label) => {
  const db = database({kind});
  await expect(assertAppointmentWindowAvailable(db,row)).rejects.toMatchObject({
    status:409, code:'PROVIDER_TIME_CONFLICT',
    message:`Lindsey Byers has ${label} saved in the app during this time. Update that entry or choose another time.`
  });
  expect(db.execute.mock.calls[3][0]).not.toMatch(/title|description/);
});
it.each([
  ['appointments','a client appointment'], ['office_events','a client room reservation'], ['supervision_sessions','a supervision session']
])('identifies a conflict in %s', async (table,label) => {
  await expect(assertAppointmentWindowAvailable(database({table}),row)).rejects.toThrow(`Lindsey Byers has ${label} saved in the app`);
});
it('keeps an app meeting protected even when it has a Google copy', async () => {
  await expect(assertAppointmentWindowAvailable(database({kind:'TEAM_MEETING',googleEventId:'synced-google-copy'}),row)).rejects.toThrow('a team meeting saved in the app');
});
it('keeps the conflict enforced if the display name lookup fails', async () => {
  const db=database({kind:'SCHEDULE_HOLD'});const execute=db.execute.getMockImplementation();
  db.execute.mockImplementation((sql,...args)=>sql.includes('FROM users')?Promise.reject(new Error('name unavailable')):execute(sql,...args));
  await expect(assertAppointmentWindowAvailable(db,row)).rejects.toThrow('Provider #9 has a schedule hold saved in the app');
});
