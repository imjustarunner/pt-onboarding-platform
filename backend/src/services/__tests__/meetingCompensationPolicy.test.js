import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),salary:vi.fn(),rate:vi.fn(),rollups:vi.fn(),attendees:vi.fn(),create:vi.fn(),find:vi.fn(),resubmit:vi.fn(),lock:vi.fn(),release:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:async()=>({execute:m.lock,release:m.release})}}));
vi.mock('../../models/PayrollSalaryPosition.model.js',()=>({default:{findActiveForUser:m.salary}}));
vi.mock('../../models/PayrollRate.model.js',()=>({default:{findBestRate:m.rate}}));
vi.mock('../../models/PayrollTimeClaim.model.js',()=>({default:{create:m.create,findById:m.find,resubmit:m.resubmit}}));
vi.mock('../../models/AgencyMeetingAttendanceRollup.model.js',()=>({default:{listForEvent:m.rollups}}));
vi.mock('../../models/ProviderScheduleEventAttendee.model.js',()=>({default:{listUserIdsByEventId:m.attendees}}));
vi.mock('../../utils/payrollSubmissionWindow.js',()=>({computeSubmissionWindow:async()=>({ok:true})}));
import {syncCompensationClaimsForEvent} from '../meetingCompensationClaims.service.js';
const event={id:7,agency_id:2,provider_id:1,kind:'TEAM_MEETING',meeting_subtype:'leadership_circle',status:'ACTIVE',start_at:'2026-09-22 00:00:00',end_at:'2026-09-22 01:00:00',event_timezone:'America/Denver',meeting_completed_at:'2026-09-22 01:00:00'};
beforeEach(()=>{vi.clearAllMocks();m.lock.mockResolvedValue([[{acquired:1}]]);m.execute.mockImplementation(async sql=>sql.includes('SELECT role')?[[{role:'provider'}]]:sql.includes('has_supervisor_privileges')?[[{role:'provider',has_supervisor_privileges:1}]]:[[]]);m.salary.mockResolvedValue(null);m.rate.mockResolvedValue({rate_amount:32.5});m.rollups.mockResolvedValue([{user_id:1,total_seconds:3600}]);m.attendees.mockResolvedValue([]);m.create.mockResolvedValue({id:10});});
describe('meeting compensation eligibility',()=>{
 it('uses recorded time, the local meeting date and the supervisor meeting rate',async()=>{const r=await syncCompensationClaimsForEvent({event});expect(r.created).toBe(1);expect(m.create).toHaveBeenCalledWith(expect.objectContaining({claimDate:'2026-09-21',payload:expect.objectContaining({serviceCode:'Supervisor meeting',totalMinutes:60})}));expect(m.release).toHaveBeenCalled();});
 it('never pays an invitation without recorded attendance',async()=>{m.rollups.mockResolvedValue([]);await syncCompensationClaimsForEvent({event});expect(m.create).not.toHaveBeenCalled();});
 it('excludes administrators even when they have a rate',async()=>{m.execute.mockImplementation(async sql=>sql.includes('SELECT role')?[[{role:'admin'}]]:[[]]);const r=await syncCompensationClaimsForEvent({event});expect(r.results[0].error).toBe('admin_not_compensated');expect(m.create).not.toHaveBeenCalled();});
 it('checks salary effective on the meeting date',async()=>{m.salary.mockResolvedValue({salary_per_pay_period:1000});await syncCompensationClaimsForEvent({event});expect(m.salary).toHaveBeenCalledWith({agencyId:2,userId:1,asOfDate:'2026-09-21'});expect(m.create).not.toHaveBeenCalled();});
 it('does not duplicate an approved claim or a concurrent sync',async()=>{m.execute.mockImplementation(async sql=>sql.includes('FROM payroll_time_claims')?[[{id:10}]]:sql.includes('SELECT role')?[[{role:'provider'}]]:[[]]);m.find.mockResolvedValue({id:10,status:'approved'});await syncCompensationClaimsForEvent({event});expect(m.create).not.toHaveBeenCalled();expect(m.resubmit).not.toHaveBeenCalled();m.lock.mockResolvedValue([[{acquired:0}]]);expect((await syncCompensationClaimsForEvent({event})).error).toBe('sync_in_progress');});
});

it('pays a CPA host Admin Time and an attending provider MEETING', async()=>{
 m.attendees.mockResolvedValue([2]); m.rollups.mockResolvedValue([{user_id:1,total_seconds:1800},{user_id:2,total_seconds:1200}]);
 m.execute.mockImplementation(async (sql,args)=>sql.includes('SELECT role')?[[{role:args[0]===1?'clinical_practice_assistant':'provider'}]]:[[]]);
 await syncCompensationClaimsForEvent({event:{...event,kind:'HUDDLE',meeting_subtype:'cpa'}});
 expect(m.create).toHaveBeenCalledWith(expect.objectContaining({userId:1,payload:expect.objectContaining({serviceCode:'Admin Time',totalMinutes:30})}));
 expect(m.create).toHaveBeenCalledWith(expect.objectContaining({userId:2,payload:expect.objectContaining({serviceCode:'MEETING',totalMinutes:20})}));
});
it('pays the mentor Individual Meeting and records intern attendance as unpaid indirect without a pay rate',async()=>{
 m.attendees.mockResolvedValue([2]);m.rollups.mockResolvedValue([{user_id:1,total_seconds:3600},{user_id:2,total_seconds:2700}]);
 m.execute.mockImplementation(async (sql,args)=>sql.includes('SELECT role')?[[{role:args[0]===1?'provider_plus':'intern'}]]:[[]]);
 await syncCompensationClaimsForEvent({event:{...event,kind:'HUDDLE',meeting_subtype:'mentorship'}});
 expect(m.create).toHaveBeenCalledWith(expect.objectContaining({userId:1,payload:expect.objectContaining({serviceCode:'Individual Meeting'})}));
 expect(m.create).toHaveBeenCalledWith(expect.objectContaining({userId:2,payload:expect.objectContaining({serviceCode:'Unpaid Indirect',amount:0,unpaidIndirect:true,bucket:'indirect',totalMinutes:45})}));
 expect(m.rate).not.toHaveBeenCalledWith(expect.objectContaining({userId:2}));
});
