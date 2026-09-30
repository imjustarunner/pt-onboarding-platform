import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), channel: vi.fn(), sender: vi.fn(), email: vi.fn(), dispatch: vi.fn(), push: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { getConnection: async () => mocks } }));
vi.mock('../notificationDispatcher.service.js', () => ({ default: { dispatchForNotification: mocks.dispatch, dispatchPushForNotification: mocks.push } }));
vi.mock('../notificationPreferences.service.js', () => ({ isNotificationChannelEnabled: mocks.channel }));
vi.mock('../emailSenderIdentityResolver.service.js', () => ({ resolvePreferredSenderIdentityForAgency: mocks.sender }));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({ sendEmailFromIdentity: mocks.email }));
import { recordOfficeKioskCheckin } from '../officeKioskCheckin.service.js';
let event, existing, alert, failNotification;
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-30T01:00:00Z')); // Still September 29 in Denver.
  event = { id: 9, office_location_id: 3, room_id: 4, booked_provider_id: 7, status: 'BOOKED', start_at: '2026-09-30 01:00:00', end_at: '2026-09-30 02:00:00', timezone: 'America/Denver', agency_id: 2, location_name: 'North Office', room_number: '204', email: 'provider@example.test', role: 'provider' };
  existing = []; alert = []; failNotification = false;
  mocks.channel.mockResolvedValue(false);
  mocks.execute.mockImplementation(async (sql) => {
    if (sql.includes('FROM office_events')) return [[event].filter(Boolean)];
    if (sql.includes('SELECT id FROM office_event_checkins')) return [existing];
    if (sql.includes('SELECT id, agency_id FROM notifications')) return [alert];
    if (sql.includes('SELECT ua.agency_id')) return [[{ agency_id: 2 }]];
    if (sql.includes('INSERT INTO notifications') && failNotification) throw new Error('Notification write failed');
    return [{ insertId: 12 }];
  });
});
afterEach(() => vi.useRealTimers());
const checkIn = () => recordOfficeKioskCheckin({ locationId: 3, eventId: 9, providerId: 7 });
describe('office arrival atomicity and privacy', () => {
  it('commits arrival and provider alert together, using the office day and timezone', async () => {
    const result = await checkIn();
    expect(result.notification.inApp).toBe(true);
    expect(mocks.commit).toHaveBeenCalledOnce();
    const call = mocks.execute.mock.calls.find(([sql]) => sql.includes('INSERT INTO notifications'));
    expect(call[1]).toEqual([expect.stringContaining('7:00 PM MDT'), 7, 2, 12]);
    expect(call[1][0]).toContain('Office 204');
    expect(result).not.toHaveProperty('checkin');
    expect(mocks.email).not.toHaveBeenCalled();
  });
  it('does not duplicate alerts or email on a repeated arrival', async () => {
    existing = [{ id: 12 }]; alert = [{ id: 13 }];
    expect((await checkIn()).alreadyCheckedIn).toBe(true);
    expect(mocks.execute.mock.calls.some(([sql]) => sql.includes('INSERT'))).toBe(false);
    expect(mocks.dispatch).not.toHaveBeenCalled(); expect(mocks.email).not.toHaveBeenCalled();
  });
  it('rolls back the arrival if the inbox alert cannot be saved', async () => {
    failNotification = true; await expect(checkIn()).rejects.toThrow('Notification write failed');
    expect(mocks.rollback).toHaveBeenCalledOnce(); expect(mocks.commit).not.toHaveBeenCalled(); expect(mocks.release).toHaveBeenCalledOnce();
  });
  it.each(['cancelled', 'other day', 'reassigned', 'other location'])('rejects a %s appointment', async (reason) => {
    if (reason === 'cancelled') event.status = 'CANCELLED';
    if (reason === 'other day') { event.start_at = '2026-09-28 15:00:00'; event.end_at = '2026-09-28 16:00:00'; }
    if (reason === 'reassigned') event.booked_provider_id = 88;
    if (reason === 'other location') event = null;
    await expect(checkIn()).rejects.toHaveProperty('status', reason === 'other location' ? 404 : 409);
    expect(mocks.commit).not.toHaveBeenCalled();
  });
  it('queues fallback atomically without sending immediate email or SMS', async () => {
    expect((await checkIn()).notification.email).toBe('queued');
    const insert=mocks.execute.mock.calls.find(([sql])=>sql.includes('INSERT INTO office_arrival_deliveries'));
    expect(insert[0]).toContain('INTERVAL 90 SECOND');
    expect(insert[1]).toEqual([12,7,2]);
    expect(mocks.email).not.toHaveBeenCalled();expect(mocks.dispatch).not.toHaveBeenCalled();
  });
  it('rejects a stale client when the next hourly window begins',async()=>{
    vi.setSystemTime(new Date('2026-09-30T01:31:00Z'));
    await expect(checkIn()).rejects.toHaveProperty('status',409);
    expect(mocks.commit).not.toHaveBeenCalled();
  });
  it('rolls back when the durable fallback cannot be saved',async()=>{
    const base=mocks.execute.getMockImplementation();mocks.execute.mockImplementation((sql,args)=>{
      if(sql.includes('INSERT INTO office_arrival_deliveries'))throw new Error('Queue unavailable');return base(sql,args);
    });
    await expect(checkIn()).rejects.toThrow('Queue unavailable');expect(mocks.rollback).toHaveBeenCalledOnce();
  });
  it('records the displayed hour of a multi-hour assignment, not its block start',async()=>{
    event.start_at='2026-09-29 23:00:00';event.end_at='2026-09-30 04:00:00';event.status='ASSIGNED';
    await recordOfficeKioskCheckin({locationId:3,eventId:9,providerId:7,appointmentStartAt:'2026-09-30T01:00:00.000Z'});
    const insert=mocks.execute.mock.calls.find(([sql])=>sql.includes('INSERT INTO office_event_checkins'));
    expect(insert[1].at(-1)).toBe('2026-09-30 01:00:00');
    expect(mocks.execute.mock.calls.find(([sql])=>sql.includes('UPDATE office_event_checkins'))[1]).toEqual(['2026-09-29 23:00:00',9]);
    expect(mocks.execute.mock.calls.find(([sql])=>sql.includes('INSERT INTO notifications'))[1][0]).toContain('7:00 PM MDT');
  });
  it('does not silently check a stale selection into the next hour of the same block',async()=>{
    event.start_at='2026-09-29 23:00:00';event.end_at='2026-09-30 04:00:00';
    vi.setSystemTime(new Date('2026-09-30T01:31:00Z'));
    await expect(recordOfficeKioskCheckin({locationId:3,eventId:9,providerId:7,appointmentStartAt:'2026-09-30T01:00:00.000Z'})).rejects.toHaveProperty('status',409);
    expect(mocks.commit).not.toHaveBeenCalled();
  });
});

it('does not create another feedback receipt when a different visitor retries an already checked-in slot',async()=>{
 existing=[{id:12}];alert=[{id:13,agency_id:2}];const base=mocks.execute.getMockImplementation();
 mocks.execute.mockImplementation((sql,args)=>sql.includes('SELECT id FROM office_client_checkin_submissions')?Promise.resolve([[]]):base(sql,args));
 const result=await recordOfficeKioskCheckin({locationId:3,eventId:9,providerId:7,submissionKey:'1ccab28e-45d3-4409-9cef-083bdd1905cd',respondentType:'adult_self'});
 expect(result.alreadyCheckedIn).toBe(true);expect(result.submission).toBeUndefined();expect(mocks.execute.mock.calls.some(([sql])=>sql.includes('INSERT'))).toBe(false);
 expect(mocks.execute.mock.calls.find(([sql])=>sql.includes('SELECT id FROM office_event_checkins'))[1]).toEqual([3,7,'2026-09-30 01:00:00']);
});
