vi.mock('../paySystem.service.js',()=>({loadUserPaySystemContext:async()=>({enabled:false})}));
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
 expect(m.create).not.toHaveBeenCalledWith(expect.objectContaining({userId:2}));
 expect(m.rollups).toHaveBeenCalledWith(event.id);
 expect(m.rate).not.toHaveBeenCalledWith(expect.objectContaining({userId:2}));
});

it('creates Support Activity claims for non-salaried admin meeting attendees, including supervisors and admins',async()=>{
 m.attendees.mockResolvedValue([2]); m.rollups.mockResolvedValue([{user_id:1,total_seconds:1800},{user_id:2,total_seconds:1200}]);
 m.execute.mockImplementation(async(sql,args)=>sql.includes('SELECT role')?[[{role:args[0]===1?'admin':'supervisor'}]]:[[]]);
 await syncCompensationClaimsForEvent({event:{...event,meeting_subtype:'admin'}});
 expect(m.create).toHaveBeenCalledTimes(2);
 for(const [c] of m.create.mock.calls)expect(c.payload.serviceCode).toBe('MEETING');
});
it('creates an admin meeting claim for review even if the default rate is missing',async()=>{
 m.rate.mockResolvedValue(null);
 await syncCompensationClaimsForEvent({event:{...event,meeting_subtype:'admin'}});
 expect(m.create).toHaveBeenCalledWith(expect.objectContaining({payload:expect.objectContaining({serviceCode:'MEETING'})}));
});
it('does not regenerate a withdrawn claim',async()=>{
 m.execute.mockImplementation(async sql=>sql.includes('FROM payroll_time_claims')?[[{id:10}]]:sql.includes('SELECT role')?[[{role:'provider'}]]:[[]]);
 m.find.mockResolvedValue({id:10,status:'withdrawn'});
 await syncCompensationClaimsForEvent({event:{...event,meeting_subtype:'admin'}});
 expect(m.create).not.toHaveBeenCalled();expect(m.resubmit).not.toHaveBeenCalled();
});
it('retains an administrator’s time adjustment when attendance refreshes',async()=>{
 m.execute.mockImplementation(async sql=>sql.includes('FROM payroll_time_claims')?[[{id:10}]]:sql.includes('SELECT role')?[[{role:'provider'}]]:[[]]);
 m.find.mockResolvedValue({id:10,status:'submitted',payload:{totalMinutes:45,editedByUserId:501}});
 await syncCompensationClaimsForEvent({event:{...event,meeting_subtype:'admin'}});
 expect(m.resubmit).toHaveBeenCalledWith(expect.objectContaining({payload:expect.objectContaining({totalMinutes:45,editedByUserId:501})}));
});

it('excludes covered and overlapping manual time on every later automatic sync',async()=>{
 m.attendees.mockResolvedValue([2,3]);m.rollups.mockResolvedValue([1,2,3].map(user_id=>({user_id,total_seconds:1800})));
 m.execute.mockImplementation(async(sql)=>sql.includes('FROM manual_meeting_logs')?[[{id:90,platform:'phone'}]]:sql.includes('FROM manual_meeting_log_attendees')?[[{user_id:1,claim_policy:'covered'},{user_id:2,claim_policy:'review'},{user_id:3,claim_policy:'submit'}]]:sql.includes('SELECT role')?[[{role:'provider'}]]:[[]]);
 const r=await syncCompensationClaimsForEvent({event:{...event,meeting_subtype:'admin'}});
 expect(m.create).toHaveBeenCalledTimes(1);expect(m.create).toHaveBeenCalledWith(expect.objectContaining({userId:3,payload:expect.objectContaining({manualMeetingLogId:90,platform:'Phone call',attendanceSource:'manual'})}));expect(r.results.map(p=>p.error).filter(Boolean)).toEqual(['manual_covered','manual_review']);
});
it('keeps a fallback host claim visible to payroll even when its assigned rate needs review',async()=>{
 m.rate.mockResolvedValue(null);
 m.execute.mockImplementation(async sql=>sql.includes('FROM manual_meeting_logs')?[[{id:90,platform:'in_person'}]]:sql.includes('FROM manual_meeting_log_attendees')?[[{user_id:1,claim_policy:'submit'}]]:sql.includes('SELECT role')?[[{role:'clinical_practice_assistant'}]]:[[]]);
 await syncCompensationClaimsForEvent({event:{...event,kind:'HUDDLE',meeting_subtype:'cpa'}});
 expect(m.create).toHaveBeenCalledWith(expect.objectContaining({status:'submitted',payload:expect.objectContaining({serviceCode:'Admin Time'})}));
});

it.each([{role:'provider',title:'Intern',credential:'BA'},{role:'provider',employment_type:'intern'},{role:'intern_plus'}])('does not submit payable admin or mentorship claims for an intern with identity %j', async identity=>{
 m.execute.mockImplementation(async sql=>sql.includes('SELECT role')?[[identity]]:[[]]);
 const result=await syncCompensationClaimsForEvent({event:{...event,meeting_subtype:'admin'}});
 expect(m.create).not.toHaveBeenCalled();expect(result.results[0].error).toBe('intern_unpaid_indirect');
});

it('credits mandatory interns as unpaid indirect and pays mandatory bachelor staff only for recorded training attendance',async()=>{
 const identities={1:{role:'provider',credential:'BA'},2:{role:'provider',credential:'BA',title:'Practicum student'},3:{role:'provider',credential:'LPC'}};
 m.attendees.mockResolvedValue([2,3]);m.rollups.mockResolvedValue([{user_id:1,total_seconds:4500},{user_id:2,total_seconds:3600},{user_id:3,total_seconds:7200}]);
 m.execute.mockImplementation(async(sql,args)=>sql.includes('SELECT user_id,is_required')?[[{user_id:1,is_required:1},{user_id:2,is_required:1},{user_id:3,is_required:0}]]:sql.includes('SELECT role')?[[identities[args[0]]]]:[[]]);
 await syncCompensationClaimsForEvent({event:{...event,meeting_subtype:'training'}});
 expect(m.create).toHaveBeenCalledTimes(1);expect(m.create).toHaveBeenCalledWith(expect.objectContaining({userId:1,payload:expect.objectContaining({serviceCode:'MEETING',totalMinutes:75})}));
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO scheduled_training_logs'),[event.id,2,2,3600,'indirect',1,0]);
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO scheduled_training_logs'),[event.id,3,2,7200,'attendance',0,0]);
});
it('does not pay absent required training invitees',async()=>{m.rollups.mockResolvedValue([]);await syncCompensationClaimsForEvent({event:{...event,meeting_subtype:'training'}});expect(m.create).not.toHaveBeenCalled();});
it('records mandatory nonstudent training at Support Activity even for a salaried administrator',async()=>{
 m.salary.mockResolvedValue({salary_per_pay_period:1000});
 m.execute.mockImplementation(async sql=>sql.includes('SELECT user_id,is_required')?[[{user_id:1,is_required:1}]]:sql.includes('SELECT role')?[[{role:'admin',credential:'BA'}]]:[[]]);
 await syncCompensationClaimsForEvent({event:{...event,meeting_subtype:'training'}});
 expect(m.create).toHaveBeenCalledWith(expect.objectContaining({userId:1,payload:expect.objectContaining({serviceCode:'MEETING',totalMinutes:60})}));
});
it('applies an audited Administrative time override only to its mandatory participant and actual attendance',async()=>{
 m.attendees.mockResolvedValue([2,3,4]);m.rollups.mockResolvedValue([1,2,3,4].map(user_id=>({user_id,total_seconds:user_id===1?1215:1800})));
 m.execute.mockImplementation(async(sql,args)=>
  sql.includes('FROM scheduled_training_compensation_overrides')?[[1,3,4].map(user_id=>({user_id,rate_type:'admin_time',reason:'Leadership meeting',authorized_by_user_id:501}))]:
  sql.includes('SELECT user_id,is_required')?[[1,2,3,4].map(user_id=>({user_id,is_required:user_id===4?0:1}))]:
  sql.includes('SELECT role')?[[{role:args[0]===3?'intern':'provider',credential:'BA'}]]:[[]]);
 await syncCompensationClaimsForEvent({event:{...event,meeting_subtype:'training'}});
 expect(m.create).toHaveBeenCalledTimes(2);
 expect(m.create).toHaveBeenCalledWith(expect.objectContaining({userId:1,payload:expect.objectContaining({serviceCode:'Admin Time',totalMinutes:20.25,payRateSource:'training_admin_time_override',trainingCompensationOverride:{rateType:'admin_time',reason:'Leadership meeting',authorizedByUserId:501}})}));
 expect(m.create).toHaveBeenCalledWith(expect.objectContaining({userId:2,payload:expect.objectContaining({serviceCode:'MEETING',totalMinutes:30})}));
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO scheduled_training_logs'),[event.id,1,2,1215,'admin_time',1,1]);
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO scheduled_training_logs'),[event.id,3,2,1800,'indirect',1,0]);
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO scheduled_training_logs'),[event.id,4,2,1800,'attendance',0,0]);
});
