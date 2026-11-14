import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../appointmentStaffTools.service.js',()=>({default:{authorizeEdit:vi.fn()}}));
vi.mock('../appointment.service.js',()=>({updateAppointment:vi.fn()}));
import { createAppointmentOfficeReservations } from '../appointmentOfficeReservation.service.js';
let access,update,db,conn,service,options,peers,materialize;
const appointment={id:12,agencyId:2,providerUserId:7,status:'scheduled',providerScheduleEventId:80,startAt:'2026-11-15 18:00:00',endAt:'2026-11-15 19:00:00',clinicalSessionId:110};
beforeEach(()=>{
  options=[{id:40,room_id:10,office_location_id:8,room_number:10,office_name:'Main office'}];peers=[{id:12},{id:13}];
  access=vi.fn(async(user,id)=>({...appointment,id}));update=vi.fn(async()=>({id:12}));
  db={execute:vi.fn(async sql=>sql.includes('SELECT recurrence_series_id')?[[{recurrence_series_id:'monthly-sundays'}]]:sql.includes('SELECT a.id FROM appointments')?[peers]:[options])};
  conn={execute:vi.fn(async()=>[[{id:40}]]),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};db.getConnection=vi.fn(async()=>conn);
  materialize=vi.fn(async()=>{});
  service=createAppointmentOfficeReservations({db,access,update,materialize,appointments:{listParticipants:async()=>[{clientId:31}]}});
});
it('adds the reserved room to the existing session without replacing its clinical record or recurrence',async()=>{
  expect(await service.link({id:7},12,{officeEventId:40})).toMatchObject({linkedAppointmentIds:[12],roomId:10});
  expect(update).toHaveBeenCalledExactlyOnceWith(12,{officeLocationId:8,roomId:10},{actorUserId:7});
  expect(update.mock.calls[0][1]).not.toHaveProperty('officeEventId');
  expect(db.execute.mock.calls[0][0]).toContain("e.booked_provider_id=? AND e.status='BOOKED'");
});
it('links the saved monthly occurrences without generating new appointments',async()=>{
  expect((await service.link({id:7},12,{officeEventId:40,scope:'series'})).linkedAppointmentIds).toEqual([12,13]);
  expect(update.mock.calls.map(call=>call[0])).toEqual([12,13]);
  expect(db.execute.mock.calls.find(([sql])=>sql.includes('SELECT a.id FROM appointments'))[1]).toEqual(['monthly-sundays',2,7,appointment.startAt]);
});
it('rejects a reservation that is unavailable or belongs to another provider',async()=>{
  options=[];await expect(service.link({id:7},12,{officeEventId:40})).rejects.toMatchObject({status:409});expect(update).not.toHaveBeenCalled();
});
it('prechecks every date before linking any of the series',async()=>{
  let checks=0;db.execute.mockImplementation(async sql=>sql.includes('SELECT recurrence_series_id')?[[{recurrence_series_id:'monthly-sundays'}]]:sql.includes('SELECT a.id FROM appointments')?[peers]:[++checks<3?options:[]]);
  await expect(service.link({id:7},12,{officeEventId:40,scope:'series'})).rejects.toThrow('every saved occurrence');expect(update).not.toHaveBeenCalled();
});
it('preserves saved changes and reports their IDs if later validation stops a series update',async()=>{
  update.mockResolvedValueOnce({id:12}).mockRejectedValueOnce(Object.assign(new Error('Signed note requires review'),{status:409}));
  await expect(service.link({id:7},12,{officeEventId:40,scope:'series'})).rejects.toMatchObject({linkedAppointmentIds:[12]});
});
it('does not offer sessions to a viewer who cannot edit them',async()=>{
  access.mockRejectedValue(Object.assign(new Error('Access denied'),{status:403}));
  await expect(service.get({id:99},12)).rejects.toMatchObject({status:403});expect(db.execute).not.toHaveBeenCalled();
});

it('rejects a released or reassigned office when the locked ownership check changes',async()=>{
 conn.execute.mockResolvedValue([[]]);await expect(service.link({id:7},12,{officeEventId:40})).rejects.toThrow('reservation changed');expect(update).not.toHaveBeenCalled();expect(conn.rollback).toHaveBeenCalled();
});

it('generates only a missing reserved hour for later dates before linking the whole series',async()=>{
 let reads=0,generated=false;const original=db.execute.getMockImplementation();db.execute.mockImplementation(async(sql,...params)=>{
  if(sql.includes('FROM office_events e JOIN office_rooms')){reads++;return[reads===3&&!generated?[]:options];}
  return original(sql,...params);
 });materialize.mockImplementation(async()=>{generated=true;});
 expect((await service.link({id:7},12,{officeEventId:40,scope:'series'})).linkedAppointmentIds).toEqual([12,13]);
 expect(materialize).toHaveBeenCalledOnce();expect(materialize.mock.calls[0][0]).toMatchObject({officeLocationId:8,createdByUserId:7,reservationWindow:{roomId:10,date:'2026-11-15'}});
});
