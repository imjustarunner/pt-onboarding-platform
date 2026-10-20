import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),lock:vi.fn(),events:vi.fn(),get:vi.fn(),insert:vi.fn(),update:vi.fn(),remove:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:async()=>({execute:m.lock,release(){}})}}));
vi.mock('../../models/User.model.js',()=>({default:{findById:async()=>({id:5})}}));
vi.mock('../scheduleCalendarPolicy.service.js',()=>({usesGoogleSchedule:async()=>true}));
vi.mock('../calendarEvents.service.js',()=>({workCalendarEvents:m.events,familyCalendarEvents:m.events}));
vi.mock('../googleWorkspaceAuth.service.js',()=>({buildImpersonatedJwtClient:vi.fn()}));
vi.mock('googleapis',()=>({google:{calendar:()=>({events:{get:m.get,insert:m.insert,update:m.update,delete:m.remove}})}}));
import {syncGooglePublication,subscriptionFeed} from '../calendarPublication.service.js';
const publication={id:2,user_id:5,agency_id:1,calendar_kind:'work',google_calendar_id:'work-mirror',google_subject:'automation@example.com',scope_key:'work:1:5'};
const event={key:'work:1:office:12',title:'Office booking · Room 10',start:'2026-10-20T21:00:00Z',end:'2026-10-20T22:00:00Z',officeReservation:{id:12,roomId:10,buildingId:1,googleEventId:'native-reservation',calendarEmail:'owner@example.com',roomResourceEmail:'room@example.com'}};
const native={id:'native-reservation',status:'confirmed',organizer:{email:'owner@example.com'},start:{dateTime:'2026-10-20T15:00:00-06:00'},end:{dateTime:'2026-10-20T16:00:00-06:00'},attendees:[{email:'room@example.com',resource:true,responseStatus:'accepted'}],extendedProperties:{private:{pt_office_event_id:'12',pt_building_id:'1',pt_office_id:'10',pt_slot_state:'ASSIGNED_BOOKED'}}};
let readers,saved;
beforeEach(()=>{
 vi.clearAllMocks();m.insert.mockReset();m.get.mockReset();m.get.mockResolvedValue({data:native});m.events.mockResolvedValue([event]);m.lock.mockResolvedValue([[{acquired:1}]]);
 readers=[{email:'owner@example.com',managed_member:1,google_acl_id:'owner-rule'}];saved=[{event_key:event.key,google_event_id:'mirror-event',fingerprint:'old'}];
 m.execute.mockImplementation(async sql=>{
  if(sql.includes('FROM users u'))return [[{id:5,email:'owner@example.com'}]];
  if(sql.includes('SELECT * FROM calendar_publications'))return [[publication]];
  if(sql.includes('FROM calendar_publication_readers'))return [readers];
  if(sql.includes('FROM calendar_publication_events'))return [saved];
  return [[]];
 });
});
describe('office mirror reconciliation',()=>{
 it('removes the redundant managed copy without touching the primary event or reservation',async()=>{
  await syncGooglePublication({userId:5,agencyId:1});
  expect(m.get).toHaveBeenCalledWith({calendarId:'primary',eventId:'native-reservation'});
  expect(m.remove).toHaveBeenCalledExactlyOnceWith({calendarId:'work-mirror',eventId:'mirror-event',sendUpdates:'none'});
  expect(m.update).not.toHaveBeenCalled();expect(m.insert).not.toHaveBeenCalled();
  expect(m.execute.mock.calls.some(([sql])=>/^(UPDATE|DELETE FROM|INSERT INTO) office_events/.test(sql))).toBe(false);
  expect(m.events.mock.calls[0][4]).toEqual({includeOfficeSyncMetadata:true});
 });
 it('retains complete office copies when another reader needs them',async()=>{
  readers.push({email:'personal@gmail.com',managed_member:0,google_acl_id:'external-rule'});
  await syncGooglePublication({userId:5,agencyId:1});
  expect(m.get).not.toHaveBeenCalled();expect(m.remove).not.toHaveBeenCalled();
  expect(m.update).toHaveBeenCalledWith(expect.objectContaining({calendarId:'work-mirror',requestBody:expect.objectContaining({summary:event.title,status:'confirmed'})}));
  expect(m.update.mock.calls[0][0].requestBody).not.toHaveProperty('officeReservation');
 });
 it('does not recreate or remove calendar entries if verification fails',async()=>{
  m.get.mockRejectedValue(Object.assign(new Error('not authorized'),{code:403}));
  await expect(syncGooglePublication({userId:5,agencyId:1})).rejects.toMatchObject({code:403});
  expect(m.remove).not.toHaveBeenCalled();expect(m.update).not.toHaveBeenCalled();expect(m.insert).not.toHaveBeenCalled();
  expect(m.execute.mock.calls.some(([sql])=>sql.includes('last_synced_at=NOW()'))).toBe(false);
 });
 it('restores a previously suppressed copy if the native reservation disappears',async()=>{
  saved=[];m.get.mockRejectedValue(Object.assign(new Error('gone'),{code:404}));
  m.insert.mockRejectedValueOnce(Object.assign(new Error('tombstone exists'),{code:409}));
  await syncGooglePublication({userId:5,agencyId:1});
  expect(m.update).toHaveBeenCalledWith(expect.objectContaining({calendarId:'work-mirror',requestBody:expect.objectContaining({status:'confirmed'})}));
  expect(m.update.mock.calls[0][0].eventId).toEqual(m.insert.mock.calls[0][0].requestBody.id);
 });
 it('never suppresses office bookings in private ICS subscriptions',async()=>{
  const ics=await subscriptionFeed('x'.repeat(43));
  expect(ics).toContain('SUMMARY:Office booking');expect(m.get).not.toHaveBeenCalled();
  expect(m.events.mock.calls[0][4]).toEqual({includeOfficeSyncMetadata:false});
  expect(ics).not.toContain('room@example.com');expect(ics).not.toContain('native-reservation');
 });
});
