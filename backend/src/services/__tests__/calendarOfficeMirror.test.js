import {describe,it,expect,vi} from 'vitest';
import {filterPrimaryOfficeCopies} from '../calendarOfficeMirror.service.js';
const source={id:12,roomId:10,buildingId:1,googleEventId:'native-event',calendarEmail:'owner@example.com',roomResourceEmail:'room10@resource.calendar.google.com'};
const event={key:'work:2:office:12',title:'Office booking · Room 10',start:'2026-10-20T21:00:00Z',end:'2026-10-20T22:00:00Z',officeReservation:source};
const native={id:'native-event',status:'confirmed',organizer:{email:'owner@example.com'},start:{dateTime:'2026-10-20T15:00:00-06:00'},end:{dateTime:'2026-10-20T16:00:00-06:00'},attendees:[{email:source.roomResourceEmail,resource:true,responseStatus:'accepted'}],extendedProperties:{private:{pt_office_event_id:'12',pt_office_id:'10',pt_building_id:'1',pt_slot_state:'ASSIGNED_BOOKED'}}};
const run=(overrides={})=>filterPrimaryOfficeCopies({events:[event],publication:{calendar_kind:'work',agency_id:2},ownerEmail:'owner@example.com',readers:[{email:'owner@example.com'}],getPrimaryEvent:vi.fn(async()=>native),...overrides});
describe('office copies across primary and work calendars',()=>{
 it('suppresses only a verified exact reservation and preserves other events',async()=>{
  const get=vi.fn(async()=>native),other={...event,key:'work:2:event:99',officeReservation:undefined};
  expect(await run({events:[event,other],getPrimaryEvent:get})).toEqual([other]);
  expect(get).toHaveBeenCalledWith('owner@example.com','native-event');
 });
 it.each([
  ['shared reader',{readers:[{email:'owner@example.com'},{email:'personal@gmail.com'}]}],
  ['unverified readers',{readers:[]}],
  ['unknown owner',{ownerEmail:null}],
  ['family calendar',{publication:{calendar_kind:'family',agency_id:2}}],
  ['another agency',{publication:{calendar_kind:'work',agency_id:3}}],
  ['different calendar owner',{events:[{...event,officeReservation:{...source,calendarEmail:'other@example.com'}}]}],
  ['unlinked event',{events:[{...event,officeReservation:{...source,googleEventId:null}}]}],
  ['no room reservation',{events:[{...event,officeReservation:{...source,roomResourceEmail:null}}]}]
 ])('preserves the complete mirror for %s',async(_label,overrides)=>{
  const get=vi.fn();expect(await run({...overrides,getPrimaryEvent:get})).toEqual(overrides.events||[event]);expect(get).not.toHaveBeenCalled();
 });
 it.each([
  ['missing',undefined],['cancelled',{...native,status:'cancelled'}],
  ['changed time',{...native,start:{dateTime:'2026-10-20T16:00:00-06:00'}}],
  ['all-day event',{...native,start:{date:'2026-10-20'}}],
  ['different event ID',{...native,id:'other'}],
  ['different organizer',{...native,organizer:{email:'other@example.com'}}],
  ['no room attendee',{...native,attendees:[]}],
  ['declined room',{...native,attendees:[{...native.attendees[0],responseStatus:'declined'}]}],
  ['same title and time only',{...native,extendedProperties:undefined}],
  ['different source row',{...native,extendedProperties:{private:{...native.extendedProperties.private,pt_office_event_id:'99'}}}],
  ['different room',{...native,extendedProperties:{private:{...native.extendedProperties.private,pt_office_id:'11'}}}],
  ['assigned only',{...native,extendedProperties:{private:{...native.extendedProperties.private,pt_slot_state:'ASSIGNED_AVAILABLE'}}}]
 ])('keeps the mirror when the primary is %s',async(_label,value)=>expect(await run({getPrimaryEvent:async()=>value})).toEqual([event]));
 it.each([404,410])('restores a mirror when Google confirms the primary is gone (%s)',async code=>{
  expect(await run({getPrimaryEvent:async()=>{throw Object.assign(new Error('gone'),{code});}})).toEqual([event]);
 });
 it.each([401,403,429,500])('aborts before calendar mutations on verification failure (%s)',async code=>{
  await expect(run({getPrimaryEvent:async()=>{throw Object.assign(new Error('unavailable'),{code});}})).rejects.toMatchObject({code});
 });
 it('matches email addresses without case sensitivity',async()=>expect(await run({ownerEmail:'OWNER@example.com',readers:[{email:'Owner@example.com'}]})).toEqual([]));
});
