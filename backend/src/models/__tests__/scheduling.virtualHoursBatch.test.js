import { beforeEach, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ execute: vi.fn(), getConnection: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: db }));
import VirtualHours from '../ProviderVirtualWorkingHours.model.js';
beforeEach(() => { vi.clearAllMocks(); });
it('reads hundreds of permitted agencies in one provider-scoped query without losing recurrence', async () => {
  db.execute.mockResolvedValue([[{ id: 9, agency_id: 22, day_of_week: 'Tuesday', start_time: '09:00:00', end_time: '11:00:00', session_type: 'BOTH', frequency: 'BIWEEKLY', start_date: '2026-10-13', excluded_dates_json: '["2026-10-27"]' }]]);
  const ids = Array.from({ length: 300 }, (_, i) => i + 1);
  const rows = await VirtualHours.listForProvider({ agencyIds: ids, providerId: 7 });
  expect(db.execute).toHaveBeenCalledTimes(1);
  expect(db.execute.mock.calls[0][0]).toContain('AND provider_id = ?');
  expect(db.execute.mock.calls[0][1]).toEqual([...ids, 7]);
  expect(rows[0]).toMatchObject({ agencyId: 22, frequency: 'BIWEEKLY', startDate: '2026-10-13', excludedDates: ['2026-10-27'], availableForIntake: true });
});
it('does not query for an empty scope or invalid provider', async () => {
  expect(await VirtualHours.listForProvider({ agencyIds: [], providerId: 7 })).toEqual([]);
  expect(await VirtualHours.listForProvider({ agencyIds: [2], providerId: 0 })).toEqual([]);
  expect(db.execute).not.toHaveBeenCalled();
});
it('preserves single-agency callers and tenant restrictions on a legacy schema', async () => {
  db.execute.mockRejectedValueOnce({ code: 'ER_BAD_FIELD_ERROR' }).mockResolvedValueOnce([[{ id: 1, agency_id: 2, day_of_week: 'Monday', start_time: '08:00:00', end_time: '09:00:00' }]]);
  const rows = await VirtualHours.listForProvider({ agencyId: 2, providerId: 7 });
  expect(rows[0]).toMatchObject({ agencyId: 2, dayOfWeek: 'Monday', startTime: '08:00', frequency: 'WEEKLY' });
  for (const [sql, params] of db.execute.mock.calls) {
    expect(sql).toContain('WHERE agency_id IN (?) AND provider_id = ?');
    expect(params).toEqual([2, 7]);
  }
});

it('invalidates reminders in the same transaction as replacing published hours', async () => {
  const conn={beginTransaction:vi.fn(),execute:vi.fn(async sql=>sql.startsWith('SELECT')?[[]]:[{}]),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};
  db.getConnection.mockResolvedValue(conn);
  await VirtualHours.replaceForProvider({agencyId:2,providerId:7,rows:[{dayOfWeek:'Thursday',startTime:'08:00',endTime:'09:00',sessionType:'INTAKE'}]});
  const index=conn.execute.mock.calls.findIndex(([sql])=>sql.startsWith('UPDATE provider_availability_reminders'));
  expect(index).toBeGreaterThan(-1);expect(conn.execute.mock.calls[index][1]).toEqual([7]);
  expect(conn.execute.mock.invocationCallOrder[index]).toBeLessThan(conn.commit.mock.invocationCallOrder[0]);
});
it('publishes new-client hours and opens only the waitlisted virtual format in one transaction',async()=>{
 const policy={seesClients:true,inPerson:true,virtual:true,acceptingNewClients:true,intakeStatusByFormat:{VIRTUAL:'waitlist',IN_PERSON:'accepting',SCHOOL:'unavailable'}};
 const conn={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async sql=>sql.includes('FROM users')?[[{id:7,sees_clients:1}]]:sql.includes('FROM provider_public_profiles')?[[{public_details_json:{availabilityByAgency:{2:policy}}}]]:[{}])};
 db.getConnection.mockResolvedValue(conn);
 await VirtualHours.replaceForProvider({agencyId:2,providerId:7,rows:[{dayOfWeek:'Thursday',startTime:'08:00',endTime:'09:00',sessionType:'INTAKE'}]});
 const change=conn.execute.mock.calls.find(([sql])=>sql.includes('INSERT INTO provider_public_profiles'));
 expect(JSON.parse(change[1][1]).availabilityByAgency[2].intakeStatusByFormat).toEqual({VIRTUAL:'accepting',IN_PERSON:'accepting',SCHOOL:'unavailable'});expect(conn.commit).toHaveBeenCalledOnce();
});
it('does not reopen waitlists when saving current-client-only hours or clearing all hours',async()=>{
 for(const rows of [[],[{dayOfWeek:'Thursday',startTime:'08:00',endTime:'09:00',sessionType:'REGULAR'}]]){
 const conn={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async()=>[{}])};db.getConnection.mockResolvedValue(conn);
 await VirtualHours.replaceForProvider({agencyId:2,providerId:7,rows});expect(conn.execute.mock.calls.some(([sql])=>sql.includes('provider_public_profiles'))).toBe(false);
 }
});
it('rolls back the opening when its profile transition fails',async()=>{
 const conn={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async sql=>{if(sql.includes('FROM users'))throw Error('profile unavailable');return [{}];})};db.getConnection.mockResolvedValue(conn);
 await expect(VirtualHours.replaceForProvider({agencyId:2,providerId:7,rows:[{dayOfWeek:'Thursday',startTime:'08:00',endTime:'09:00',sessionType:'INTAKE'}]})).rejects.toThrow('profile unavailable');expect(conn.commit).not.toHaveBeenCalled();expect(conn.rollback).toHaveBeenCalledOnce();
});
