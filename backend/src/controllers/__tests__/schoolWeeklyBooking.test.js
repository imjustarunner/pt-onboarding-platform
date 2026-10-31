import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../services/schoolWeeklyBooking.service.js',()=>({schoolWeeklyContext:vi.fn(),schoolWeeklyPayload:vi.fn()}));
vi.mock('../appointment.controller.js',()=>({createAppointmentHandler:vi.fn()}));
import { schoolWeeklyContext, schoolWeeklyPayload } from '../../services/schoolWeeklyBooking.service.js';
import { createAppointmentHandler } from '../appointment.controller.js';
import { bookSchoolWeeklySessions, getSchoolWeeklyBooking } from '../schoolWeeklyBooking.controller.js';
const response=()=>({status:vi.fn().mockReturnThis(),json:vi.fn().mockReturnThis()});
const request=()=>({user:{id:1433,role:'provider'},params:{schoolId:'451',providerId:'1433',weekday:'Monday'},body:{slotId:10,agencyId:999,clientId:999,billing:{amountCents:0}}});
beforeEach(()=>{vi.resetAllMocks();schoolWeeklyContext.mockResolvedValue({enabled:true,today:'2026-10-30'});schoolWeeklyPayload.mockReturnValue({agencyId:450,participants:[{clientId:11}],recurrence:'WEEKLY'});});
describe('school weekly booking endpoints',()=>{
 it('delegates only the authorized saved-slot payload to normal appointment creation',async()=>{
  const req=request(),res=response(),next=vi.fn();
  await bookSchoolWeeklySessions(req,res,next);
  expect(schoolWeeklyContext).toHaveBeenCalledWith({actor:req.user,schoolId:'451',providerUserId:'1433',weekday:'Monday'});
  expect(createAppointmentHandler).toHaveBeenCalledWith(expect.objectContaining({user:req.user,body:{agencyId:450,participants:[{clientId:11}],recurrence:'WEEKLY'}}),res,next);
  expect(createAppointmentHandler.mock.calls[0][0].body.billing).toBeUndefined();
 });
 it('never delegates when booking is paused or access is denied',async()=>{
  schoolWeeklyContext.mockResolvedValueOnce({enabled:false,reason:'Not enabled'});
  const res=response();await bookSchoolWeeklySessions(request(),res,vi.fn());
  expect(res.status).toHaveBeenCalledWith(403);expect(createAppointmentHandler).not.toHaveBeenCalled();
  schoolWeeklyContext.mockRejectedValueOnce(Object.assign(new Error('Access denied'),{status:403}));
  await getSchoolWeeklyBooking(request(),res,vi.fn());
  expect(res.json).toHaveBeenCalledWith({error:{message:'Access denied'}});
 });
});
