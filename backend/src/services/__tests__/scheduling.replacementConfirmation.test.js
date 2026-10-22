import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../models/Appointment.model.js',()=>({default:{findById:vi.fn()}}));
vi.mock('../clinicalNoteCrypto.service.js',()=>({maybeDecryptNotePayload:v=>v}));
vi.mock('../sessionNotification.service.js',()=>({scheduleSessionNotifications:vi.fn()}));
vi.mock('../appointmentScheduleNotice.service.js',()=>({appointmentScheduleNotices:{queue:vi.fn()}}));
import db from '../../config/database.js';
import Appointment from '../../models/Appointment.model.js';
import {scheduleSessionNotifications} from '../sessionNotification.service.js';
import {appointmentScheduleNotices} from '../appointmentScheduleNotice.service.js';
import {finalizeReplacementBooking,replacementAttendanceDetails} from '../replacementBookingConfirmation.service.js';
import {buildScheduleNoticeMessage} from '../scheduleNoticeMessage.service.js';
const offer={appointment_id:11,agency_id:2,client_id:4};
const contacts=[{clientId:4,mode:'guardian',channels:['email','sms'],recipients:[{key:'guardian:9',email:'parent@example.test'}]}];
beforeEach(()=>{
  vi.clearAllMocks();
  Appointment.findById.mockResolvedValue({id:11,startAt:'2030-01-02T17:00:00Z'});
  db.execute.mockResolvedValue([[{payload_json:JSON.stringify({facts:{notificationRecipients:contacts,reviewedMessage:{subject:'Old cancellation',text:'Canceled'}}})}]]);
  scheduleSessionNotifications.mockResolvedValue([]);appointmentScheduleNotices.queue.mockResolvedValue({pending:1});
});
it('sets reminders for the new appointment and sends a fresh confirmation to the reviewed contacts',async()=>{
  await finalizeReplacementBooking(offer,22,5);
  expect(scheduleSessionNotifications).toHaveBeenCalledWith(22,{replace:true});
  const [id,args]=appointmentScheduleNotices.queue.mock.calls[0];
  expect(id).toBe(22);expect(args).toMatchObject({eventType:'created',actorUserId:5,facts:{notificationRecipients:contacts,reviewedCancellation:true,replacementForAppointmentId:11,replacementOriginalStartAt:'2030-01-02T17:00:00Z'}});
  expect(args.before).toBeUndefined();expect(args.facts.reviewedMessage).toBeUndefined();
  expect(scheduleSessionNotifications.mock.invocationCallOrder[0]).toBeLessThan(appointmentScheduleNotices.queue.mock.invocationCallOrder[0]);
});
it('surfaces reminder setup failure and allows a retry on the same booking',async()=>{
  scheduleSessionNotifications.mockRejectedValueOnce(new Error('Reminder storage unavailable'));
  await expect(finalizeReplacementBooking(offer,22,5)).rejects.toThrow('Reminder storage unavailable');
  expect(appointmentScheduleNotices.queue).not.toHaveBeenCalled();
  await finalizeReplacementBooking(offer,22,5);expect(appointmentScheduleNotices.queue).toHaveBeenCalledTimes(1);
  expect(scheduleSessionNotifications.mock.calls.map(c=>c[0])).toEqual([22,22]);
});
it('leaves reminder history intact when the confirmation was already queued',async()=>{
  db.execute.mockResolvedValueOnce([[{id:99}]]);
  await finalizeReplacementBooking(offer,22,5);expect(scheduleSessionNotifications).not.toHaveBeenCalled();expect(appointmentScheduleNotices.queue).not.toHaveBeenCalled();
});
it('explains the replacement date, length and attendance details in confirmation',()=>{
  const message=buildScheduleNoticeMessage([{appointment:{id:22,startAt:'2030-01-04T17:00:00Z',endAt:'2030-01-04T17:45:00Z',sourceTimezone:'America/Denver',attendanceDetails:'In person · Main office · Room 3'},payload:{eventType:'created',facts:{replacementForAppointmentId:11,replacementOriginalStartAt:'2030-01-02T17:00:00Z'}}}],'https://portal.example.test');
  expect(message.subject).toBe('Your replacement appointment is reserved');expect(message.text).toContain('45 minutes');
  expect(message.text).toContain('Your provider will reach out if there are any changes');expect(message.text).toContain('Room 3');expect(message.text).toContain('January 2');expect(message.text).toContain('January 4');
});
it('uses the booked physical room and address for attendance instructions',async()=>{
  db.execute.mockResolvedValue([[{name:'Main office',room_number:'3',street_address:'123 Main St',city:'Denver',state:'CO',postal_code:'80201'}]]);
  expect(await replacementAttendanceDetails({modality:'IN_PERSON',officeLocationId:2,roomId:3})).toBe('In person · Main office · Room 3 · 123 Main St · Denver CO 80201');
  expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('WHERE r.id=? AND l.id=?'),[3,2]);
});
it('keeps virtual instructions separate from a physical room',async()=>{
  expect(await replacementAttendanceDetails({modality:'VIRTUAL',officeLocationId:2,roomId:3})).toContain('Virtual appointment');expect(db.execute).not.toHaveBeenCalled();
});
