import { expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
import { appointmentVideoRoomMode } from '../../utils/appointmentVideoPolicy.js';
import { appointmentCalendarFallbacks } from '../appointmentCalendarFallback.service.js';

it.each(['mental_health', 'healthcare', null])('uses a distinct appointment room for virtual %s sessions even with a legacy personal-room choice', businessType => {
  expect(appointmentVideoRoomMode({ modality: 'TELEHEALTH', businessType, videoRoomMode: 'my_room' })).toBe('unique_session');
});
it('keeps the separate tutoring room policy scoped to learning appointments', () => {
  expect(appointmentVideoRoomMode({ modality: 'VIRTUAL', businessType: 'tutoring', videoRoomMode: 'my_room' })).toBe('my_room');
});
it('shows a saved appointment whose calendar facet did not save, using its canonical appointment ID and UTC time', async () => {
  const db = { execute: vi.fn().mockResolvedValue([[{ id: 18141, agency_id: 2, provider_user_id: 501, status: 'scheduled', modality: 'TELEHEALTH',
    start_at: '2026-11-20 00:00:00', end_at: '2026-11-20 01:00:00', source_timezone: 'America/Denver', client_id: 8, clinical_session_id: 77 }]]) };
  const events = await appointmentCalendarFallbacks({ providerId: 501, agencyId: 2, windowStart: '2026-11-16 00:00:00', windowEnd: '2026-11-23 00:00:00', canEdit: true }, db);
  expect(events).toMatchObject([{ id: -18141, appointmentId: 18141, providerId: 501, clinicalSessionId: 77, clientId: 8, startAt: '2026-11-20T00:00:00.000Z', canReschedule: true }]);
  expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('a.start_at<? AND a.end_at>?'), [501, 0, 2, '2026-11-23 00:00:00', '2026-11-16 00:00:00']);
});
it('preserves read-only access on the fallback entry and keeps the query inside the requested provider and window', async () => {
  const db = { execute: vi.fn().mockResolvedValue([[{ id: 3, start_at: '2026-11-20 00:00:00', end_at: '2026-11-20 01:00:00', status: 'completed' }]]) };
  const events = await appointmentCalendarFallbacks({ providerId: 7, agencyId: 2, allAgencies: true, windowStart: 'start', windowEnd: 'end' }, db);
  expect(events[0]).toMatchObject({ canEdit: false, canReschedule: false });
  expect(db.execute.mock.calls[0][1]).toEqual([7, 1, 2, 'end', 'start']);
});

it('retains an authorized external meeting choice for learning while requiring office rooms for counseling',()=>{
 expect(appointmentVideoRoomMode({modality:'TELEHEALTH',businessType:'tutoring',videoRoomMode:'external'})).toBe('external');
 expect(appointmentVideoRoomMode({modality:'TELEHEALTH',businessType:'mental_health',videoRoomMode:'external'})).toBe('unique_session');
});

it('keeps archived appointments hidden even when their calendar facet is missing',async()=>{
 const db={execute:vi.fn(async sql=>sql.includes('FROM appointments a')
  ? [[{id:3,status:'scheduled',start_at:'2026-11-20 00:00:00',end_at:'2026-11-20 01:00:00'}]]
  : [[{resource_type:'appointment',resource_id:3,archive_id:14,archived_at:'2026-11-18 00:00:00'}]])};
 expect(await appointmentCalendarFallbacks({providerId:7,agencyId:2,windowStart:'start',windowEnd:'end'},db)).toEqual([]);
});
