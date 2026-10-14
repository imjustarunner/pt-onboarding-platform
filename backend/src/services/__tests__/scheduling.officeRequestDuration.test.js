import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({create:vi.fn(),update:vi.fn(),plan:vi.fn(),findPlan:vi.fn(),materialize:vi.fn(),invalidate:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../../models/OfficeStandingAssignment.model.js',()=>({default:{create:m.create,update:m.update}}));
vi.mock('../../models/OfficeBookingPlan.model.js',()=>({default:{upsertActive:m.plan,findActiveByAssignmentId:m.findPlan}}));
vi.mock('../../models/OfficeEvent.model.js',()=>({default:{}}));
vi.mock('../../models/OfficeLocation.model.js',()=>({default:{}}));
vi.mock('../officeScheduleMaterializer.service.js',()=>({default:{invalidateOffice:m.invalidate,materializeWeek:m.materialize,
 startOfWeekMonday:date=>date,addDays:(date,n)=>new Date(Date.parse(date)+n*86400000).toISOString().slice(0,10)}}));
import {assignRecurringOfficeBlock} from '../officeAssignmentOrchestrator.service.js';
beforeEach(()=>{
 vi.clearAllMocks();m.create.mockImplementation(async input=>({id:input.hour,...input}));
 m.update.mockResolvedValue(null);m.plan.mockResolvedValue({});m.findPlan.mockImplementation(async id=>({id:id+100}));
});
const input={officeLocationId:1,roomId:9,providerId:8,weekday:3,startHour:16,endHour:18,
 frequency:'WEEKLY',startDate:'2026-10-14',occurrenceCount:6,createdByUserId:1};
it('approves both hours of a 4–6 PM recurring room request before materializing the calendar',async()=>{
 const result=await assignRecurringOfficeBlock(input);
 expect(result.assignments.map(a=>a.hour)).toEqual([16,17]);
 expect(m.plan.mock.calls.map(([p])=>[p.standingAssignmentId,p.bookingStartDate,p.bookedOccurrenceCount]))
  .toEqual([[16,'2026-10-14',null],[17,'2026-10-14',null]]);
 expect(m.update).toHaveBeenCalledWith(17,expect.objectContaining({available_since_date:'2026-10-14'}));
 expect(m.materialize).toHaveBeenCalledTimes(12);
 expect(m.plan.mock.invocationCallOrder[1]).toBeLessThan(m.materialize.mock.invocationCallOrder[0]);
});
it('retains finite non-weekly recurrence and reports a failure on any requested hour',async()=>{
 await assignRecurringOfficeBlock({...input,frequency:'BIWEEKLY'});
 expect(m.plan.mock.calls.every(([p])=>p.bookedOccurrenceCount===6&&p.bookedFrequency==='BIWEEKLY')).toBe(true);
 m.create.mockRejectedValueOnce(new Error('Room conflict'));
 await expect(assignRecurringOfficeBlock(input)).rejects.toThrow('Room conflict');
});
