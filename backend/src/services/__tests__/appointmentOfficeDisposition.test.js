import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../clinicalNoteCrypto.service.js',()=>({maybeEncryptNotePayload:value=>'encrypted:'+value,maybeDecryptNotePayload:value=>value.replace(/^encrypted:/,'')}));
import {createAppointmentOfficeDisposition} from '../appointmentOfficeDisposition.service.js';
import {reservationContextAfterClientCancellation,isDetachedOfficeReservation} from '../../utils/officeClientCancellation.js';
let db,event,recorded,created,conflict,service;
const appointment={id:12,agencyId:2,providerUserId:7,roomId:10,officeLocationId:8,officeEventId:40,startAt:'2027-01-03 18:00:00',endAt:'2027-01-03 19:00:00',sourceTimezone:'America/Denver'};
beforeEach(()=>{
 event={id:40,office_location_id:8,room_id:10,booked_provider_id:7,assigned_provider_id:7,standing_assignment_id:5,booking_plan_id:30,client_id:31,clinical_session_id:90,status:'BOOKED',start_at:appointment.startAt,end_at:appointment.endAt};recorded=null;created=[];conflict=false;
 db={execute:vi.fn(async(sql,args=[])=>{
  if(sql.includes('FROM appointment_communications'))return[recorded?[{metadata_json:recorded}]:[]];
  if(sql.includes('FROM office_events'))return[[event]];
  if(sql.includes('FROM appointments'))return[conflict?[{id:99}]:[]];
  if(sql.includes('SELECT timezone'))return[[{timezone:'America/Denver'}]];
  if(sql.includes('SELECT skipped_dates_json'))return[[{skipped_dates_json:'[]'}]];
  if(sql.includes('SELECT session_context_json'))return[[{session_context_json:'{"agencyId":2}'}]];
  if(sql.startsWith('INSERT INTO office_events')){created.push({sql,args});return[{insertId:41}];}
  if(sql.startsWith('INSERT INTO appointment_communications'))recorded=args[3];
  if(sql.includes("SET status='CANCELLED'"))event.status='CANCELLED';
  return[{affectedRows:1}];
 })};service=createAppointmentOfficeDisposition({db,roomLock:async(input,work)=>work(db)});
});
it('keeps a fresh bare reservation while retaining the canceled clinical event and its original client links',async()=>{
 expect(await service.apply(appointment,7,'keep')).toMatchObject({choice:'keep',officeEventId:41,originalOfficeEventId:40});
 expect(event).toMatchObject({status:'CANCELLED',client_id:31,clinical_session_id:90});
 expect(created).toHaveLength(1);expect(created[0].args.slice(4,10)).toEqual(['BOOKED','ASSIGNED_BOOKED',5,30,7,7]);
 expect(created[0].sql).not.toContain('client_id');expect(JSON.parse(created[0].args.at(-1))).toMatchObject({officeCancellationDisposition:'keep',detachedAppointmentId:12});
 expect(recorded).toMatch(/^encrypted:/);expect(db.execute.mock.calls.some(([sql])=>sql.includes('skipped_dates_json=?'))).toBe(false);
});
it('releases the room, marks the plan date skipped, and records the result without erasing documentation',async()=>{
 expect(await service.apply(appointment,7,'release')).toMatchObject({choice:'release'});
 expect(created[0].args.slice(4,10)).toEqual(['RELEASED','ASSIGNED_AVAILABLE',5,null,7,null]);
 expect(db.execute.mock.calls.find(([sql])=>sql.includes('SET skipped_dates_json=?'))[1]).toEqual(['["2027-01-03"]',30]);
 expect(event.client_id).toBe(31);expect(event.clinical_session_id).toBe(90);
});
it('keeps the same reservation identity when the client session was linked separately',async()=>{
 event.client_id=null;event.clinical_session_id=null;
 expect(await service.apply({...appointment,officeEventId:null},7,'keep')).toMatchObject({officeEventId:40});expect(created).toHaveLength(0);expect(event.status).toBe('BOOKED');
});
it('does not release another active appointment or repeat a previously completed office decision',async()=>{
 conflict=true;await expect(service.apply(appointment,7,'release')).rejects.toThrow('Another active appointment');expect(created).toHaveLength(0);
 conflict=false;await service.apply(appointment,7,'keep');await service.apply(appointment,7,'keep');expect(created).toHaveLength(1);
 await expect(service.apply(appointment,7,'release')).rejects.toThrow('different office choice');
});
it('stops automatic client reattachment at the selected date without changing earlier plan context',()=>{
 const context={agencyId:2,clientId:31,tenantServiceId:10,clientUnscheduleFromDate:'2027-01-03',officeReservationDisposition:'keep'};
 expect(reservationContextAfterClientCancellation(context,'2027-01-02')).toEqual(context);
 expect(reservationContextAfterClientCancellation(context,'2027-01-03')).toEqual({agencyId:2,bookingSource:'office_assignment',bookingLimitsExplicit:undefined,officeCancellationDisposition:'keep'});
 expect(isDetachedOfficeReservation({status:'BOOKED',session_context_json:'{"officeCancellationDisposition":"keep"}'})).toBe(true);
 expect(isDetachedOfficeReservation({status:'RELEASED',session_context_json:'{"officeCancellationDisposition":"release"}'})).toBe(true);
 expect(isDetachedOfficeReservation({status:'BOOKED',client_id:55,session_context_json:'{"officeCancellationDisposition":"release"}'})).toBe(false);
});
