import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), release: vi.fn(), occupants: [], guestStatus: 'waiting', sessionType: 'individual' }));
vi.mock('../meetingJoinPolicy.service.js', () => ({ canJoinSupervision: async () => true }));
vi.mock('../../config/database.js', () => ({ default: { getConnection: async () => ({ execute: m.execute, release: m.release }) } }));
import { reserveSupervisionCalendarGuest, reserveSupervisionJoin } from '../supervisionJoinCapacity.service.js';
beforeEach(() => {
  vi.clearAllMocks(); m.occupants = ['user-7', 'user-8']; m.guestStatus = 'waiting'; m.sessionType = 'individual';
  m.execute.mockImplementation(async sql => {
    if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
    if (sql.includes('SELECT * FROM supervision_sessions')) return [[{ id: 9, session_type: m.sessionType, supervisor_user_id: 7 }]];
    if (sql.includes('SELECT * FROM meeting_calendar_guests')) return [[{ id: 4, status: m.guestStatus, credential_hash: 'a'.repeat(64), display_name: 'Guest' }]];
    if (sql.includes('SELECT p.join_identity')) return [m.occupants.map(join_identity => ({ join_identity }))];
    if (sql.includes('SELECT UNIX_TIMESTAMP')) return [[{ reserved_at: Math.floor(Date.now() / 1000) }]];
    return [[]];
  });
});
it('admits one guest alongside the supervisor and supervisee', async () => {
  expect(await reserveSupervisionCalendarGuest({ sessionId: 9, guestId: 4, hostUserId: 7 })).toMatchObject({ activeCount: 3, maxParticipants: 3, status: 'admitted' });
});
it('keeps the supervisee’s place when the supervisor and a guest arrive first', async () => {
  m.occupants = ['user-7', 'calendar-guest-4'];
  await expect(reserveSupervisionJoin({ sessionId: 9, userId: 8, joinIdentity: 'user-8' })).resolves.toMatchObject({ activeCount: 3 });
});
it('rejects a second guest and a third credited account', async () => {
  m.occupants.push('calendar-guest-3');
  await expect(reserveSupervisionCalendarGuest({ sessionId: 9, guestId: 4, hostUserId: 7 })).rejects.toMatchObject({ status: 409 });
  await expect(reserveSupervisionJoin({ sessionId: 9, userId: 10, joinIdentity: 'user-10' })).rejects.toMatchObject({ status: 409 });
});
it('does not let an unadmitted guest reserve the extra place', async () => {
  await expect(reserveSupervisionCalendarGuest({ sessionId: 9, guestId: 4, credentialHash: 'a'.repeat(64) })).rejects.toMatchObject({ status: 403 });
});
it.each([['group',24],['triadic',3]])('preserves the existing %s room capacity',async (type,limit)=>{
  m.sessionType=type; m.occupants=Array.from({length:limit},(_,index)=>`user-${index+1}`);
  await expect(reserveSupervisionCalendarGuest({sessionId:9,guestId:4,hostUserId:7})).rejects.toMatchObject({status:409});
});
