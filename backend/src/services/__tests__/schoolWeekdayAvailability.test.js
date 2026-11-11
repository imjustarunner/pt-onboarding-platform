import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../notificationDispatcher.service.js', () => ({ default: { dispatchPushForNotification: vi.fn(async () => ({ dispatched: false })) } }));
import { SCHOOL_WEEKDAYS, schoolBasedFocus, schoolWeekdayContext } from '../../utils/schoolWeekdayAvailability.js';
import { readSchoolWeekdays, writeSchoolWeekdays, requestSchoolWeekdayUpdates, updateSchoolProviderFocus,markSchoolWeekdaysOpened } from '../schoolWeekdayAvailability.service.js';
import Dispatcher from '../notificationDispatcher.service.js';
const choices = () => Object.fromEntries(SCHOOL_WEEKDAYS.map(day => [day, true]));
const assigned = [{ provider_user_id: 7, school_organization_id: 10, school_name: 'Cedar', day_of_week: 'Monday' }];
let details, events, db;
beforeEach(() => {
  vi.clearAllMocks(); details = { anotherFeature: 'keep', schoolWeekdaysByAgency: { 3: { days: { Tuesday: false } } } }; events = [];
  db = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), getConnection: async () => db, execute: vi.fn(async (sql, args) => {
    if (sql.includes('SELECT DISTINCT u.id')) return [[{ id: 7, service_focus: 'School-Based Counseling' }]];
    if (sql.includes('SELECT u.id,u.service_focus')) return [[{ id: 7, service_focus: 'School-Based Counseling', public_details_json: details }]];
    if (sql.includes('FROM provider_school_assignments psa')) return [assigned];
    if (sql.includes('SELECT public_details_json')) return [[{ public_details_json: details }]];
    if (sql.includes('INSERT INTO provider_public_profiles')) {
      const value = JSON.parse(args[1]);
      for (const [agency, record] of Object.entries(value.schoolWeekdaysByAgency)) details.schoolWeekdaysByAgency[agency] = { ...details.schoolWeekdaysByAgency[agency], ...record };
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('INSERT INTO notifications')) { events.push(args); return [{ insertId: 1 }]; }
    if (sql.includes('SELECT * FROM notifications')) return [[{ id: 1, user_id: 7 }]];
    if (sql.includes('SELECT enabled FROM school_weekday_followup_settings')) return [[]];
    if (sql.includes('FOR UPDATE')) return [[{ id: 7 }]];
    throw new Error(`Unexpected query: ${sql}`);
  }) };
});
describe('school weekday availability', () => {
  it('recognizes school-based categories without including other services', () => {
    expect(schoolBasedFocus('Office-Based Counseling; School-Based Counseling')).toBe(true);
    expect(schoolBasedFocus('School Based')).toBe(true);
    expect(schoolBasedFocus('School & Office-Based Counseling')).toBe(true);
    expect(schoolBasedFocus('School and Office Based Counseling')).toBe(true);
    expect(schoolBasedFocus('Office-Based Counseling')).toBe(false);
  });
  it('defaults school providers to available, reserves assigned days even over a saved refusal, and scopes records by agency', () => {
    const person = { service_focus: 'School-Based Counseling', public_details_json: { schoolWeekdaysByAgency: { 2: { days: { Monday: false, Tuesday: false } }, 3: { days: { Friday: false } } } } };
    const context = schoolWeekdayContext(person, [{ schoolName: 'Cedar', days: ['Monday'] }], 2);
    expect(context.days.map(day => day.status)).toEqual(['assigned', 'unavailable', 'available', 'available', 'available']);
    expect(context.days[0].available).toBe(true);
    expect(schoolWeekdayContext({ service_focus: 'Office-Based Counseling' }, [{days:['Monday']}], 2).eligible).toBe(false);
    expect(schoolWeekdayContext({ service_focus: 'School-Based Counseling', is_demo: 1 }, [], 2).eligible).toBe(false);
    expect(schoolWeekdayContext({ service_focus: 'School-Based Counseling', agency_feature_flags: {qaSandbox:{syntheticOnly:true}} }, [], 450).eligible).toBe(false);
  });
  it('persists school choices without altering other agency records or profile features', async () => {
    const result = await writeSchoolWeekdays({ providerId: 7, agencyId: 2, actorId: 7, days: { ...choices(), Tuesday: false } }, db);
    expect(result.days[1].status).toBe('unavailable');
    expect(details.anotherFeature).toBe('keep');
    expect(details.schoolWeekdaysByAgency[3].days.Tuesday).toBe(false);
    expect(db.commit).toHaveBeenCalledOnce();
    expect((await readSchoolWeekdays(7, 2, db)).days[0].schools[0].schoolName).toBe('Cedar');
  });
  it('rejects unavailable assigned days and malformed choices before writing', async () => {
    await expect(writeSchoolWeekdays({ providerId: 7, agencyId: 2, actorId: 7, days: { ...choices(), Monday: false } }, db)).rejects.toThrow('Assigned school days');
    expect(db.rollback).toHaveBeenCalledOnce();
    expect(details.schoolWeekdaysByAgency[2]).toBeUndefined();
    await expect(writeSchoolWeekdays({ days: { Monday: 'true' } }, db)).rejects.toThrow('all five weekdays');
  });
  it('keeps a request pending until a successful save and skips duplicate requests', async () => {
    const first = await requestSchoolWeekdayUpdates({ agencyId: 2, actorId: 99 }, db);
    expect(first).toEqual({ requested: [7], failed: [], skipped: [] });
    expect(events).toHaveLength(1); expect(Dispatcher.dispatchPushForNotification).toHaveBeenCalledOnce();
    expect((await readSchoolWeekdays(7, 2, db)).pending).toBe(true);
    expect((await requestSchoolWeekdayUpdates({ agencyId: 2, actorId: 99 }, db)).skipped).toEqual([7]);
    await writeSchoolWeekdays({ providerId: 7, agencyId: 2, actorId: 7, days: choices() }, db);
    expect((await readSchoolWeekdays(7, 2, db)).pending).toBe(false);
  });
  it('reports partial failure so retries can finish without duplicating successful recipients', async () => {
    db.execute.mockRejectedValueOnce(new Error('offline'));
    await expect(requestSchoolWeekdayUpdates({ agencyId: 2, actorId: 99 }, db)).rejects.toThrow('offline');
  });
});

it('updates service focuses without overwriting concurrent changes and rejects demos',async()=>{
 const db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn().mockResolvedValueOnce([[{service_focus:'Office-Based Counseling',is_demo:0}]]).mockResolvedValueOnce([{affectedRows:1}])};const database={getConnection:async()=>db};
 const body={providerId:7,agencyId:2,serviceFocus:'Office-Based Counseling; School-Based Counseling',expectedServiceFocus:'Office-Based Counseling'};
 expect(await updateSchoolProviderFocus(body,database)).toEqual({serviceFocus:body.serviceFocus});expect(db.execute).toHaveBeenLastCalledWith('UPDATE users SET service_focus=? WHERE id=?',[body.serviceFocus,7]);
 db.execute.mockResolvedValueOnce([[{service_focus:'Changed',is_demo:0}]]);await expect(updateSchoolProviderFocus(body,database)).rejects.toThrow('changed while');
 db.execute.mockResolvedValueOnce([[{service_focus:'Office-Based Counseling',is_demo:1}]]);await expect(updateSchoolProviderFocus(body,database)).rejects.toThrow('Non-demo provider');
});

it('registers an in-app and push-capable school update notification',async()=>{
 const {getNotificationCatalogEntry}=await import('../notificationCatalog.service.js');
 expect(getNotificationCatalogEntry('school_weekday_availability_requested').capabilities).toMatchObject({inApp:true,push:true});
});

it('never requests another reply after available or unavailable answers',async()=>{
 details.schoolWeekdaysByAgency[2]={days:{...choices(),Tuesday:false},updatedAt:'2026-11-08T00:00:00.000Z'};
 expect((await requestSchoolWeekdayUpdates({agencyId:2,actorId:99},db)).skipped).toEqual([7]);
 expect(events).toHaveLength(0);expect(Dispatcher.dispatchPushForNotification).not.toHaveBeenCalled();
});
it('does not request availability from providers assigned on all five weekdays',()=>{
 expect(schoolWeekdayContext({service_focus:'School-Based Counseling'},[{days:SCHOOL_WEEKDAYS}],2).needsResponse).toBe(false);
 expect(schoolWeekdayContext({service_focus:'School-Based Counseling'},[{days:['Monday']}],2).needsResponse).toBe(true);
});

it('reminds unanswered assigned-school providers after a day and then deduplicates retries',async()=>{
 details.schoolWeekdaysByAgency[2]={requestedAt:'2026-11-01T00:00:00.000Z'};
 expect((await requestSchoolWeekdayUpdates({agencyId:2,actorId:99},db)).requested).toEqual([7]);
 expect((await requestSchoolWeekdayUpdates({agencyId:2,actorId:99},db)).skipped).toEqual([7]);
 expect(Dispatcher.dispatchPushForNotification).toHaveBeenCalledOnce();
 expect(schoolWeekdayContext({service_focus:'School-Based Counseling'},[],2).needsResponse).toBe(false);
});
it('tracks an actual modal opening separately from answering and preserves the first open',async()=>{
 const first=await markSchoolWeekdaysOpened({providerId:7,agencyId:2,actorId:7},db);
 expect((await readSchoolWeekdays(7,2,db)).needsResponse).toBe(true);
 expect((await markSchoolWeekdaysOpened({providerId:7,agencyId:2,actorId:7},db)).openedAt).toBe(first.openedAt);
 await expect(markSchoolWeekdaysOpened({providerId:7,agencyId:2,actorId:99},db)).rejects.toThrow('Only the provider');
 expect(details.anotherFeature).toBe('keep');
});
it('commits the follow-up job with the in-app request so immediate completion cannot miss its thank-you',async()=>{
 const execute=db.execute.getMockImplementation();db.execute.mockImplementation(async(sql,args)=>{
  if(sql.includes('SELECT enabled FROM school_weekday_followup_settings'))return [[{enabled:1}]];
  if(sql.includes('INSERT IGNORE INTO school_weekday_followups')){events.push('followup_queued');return [{affectedRows:1}];}
  return execute(sql,args);
 });
 const result=await requestSchoolWeekdayUpdates({agencyId:2,actorId:99},db);expect(result.requested).toEqual([7]);expect(events).toContain('followup_queued');
 const queued=db.execute.mock.invocationCallOrder[db.execute.mock.calls.findIndex(([sql])=>sql.includes('INSERT IGNORE INTO school_weekday_followups'))];expect(queued).toBeLessThan(db.commit.mock.invocationCallOrder[0]);
});
