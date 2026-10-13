import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),member:vi.fn(),sync:vi.fn(),artifact:vi.fn(),write:vi.fn(),begin:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:async()=>({execute:m.execute,beginTransaction:m.begin,commit:m.commit,rollback:m.rollback,release:m.release})}}));
vi.mock('../meetingJoinPolicy.service.js',()=>({hasActiveMeetingMembership:m.member}));
vi.mock('../meetingCompensationClaims.service.js',()=>({isCompensationClaimMeeting:()=>true,syncCompensationClaimsForEvent:m.sync}));
vi.mock('../../models/ProviderScheduleEventArtifact.model.js',()=>({default:{findByEventId:m.artifact,upsertByEventId:m.write}}));
vi.mock('../../utils/payrollSubmissionWindow.js',()=>({computeSubmissionWindow:async()=>({ok:true})}));
import {manualMeetingOptions,validateManualMeeting,overlappingClaim,previewManualMeeting,saveManualMeeting} from '../manualMeetingLog.service.js';
const people=[{id:465,name:'CPA',role:'clinical_practice_assistant'},{id:477,name:'Mentor',role:'provider_plus'},{id:10,name:'Intern',role:'intern'},{id:11,name:'Provider',role:'provider'},{id:12,name:'Supervisor',role:'provider',is_supervisor:1},{id:13,name:'Candidate',role:'pending'}];
const cpa={allowed:true,actorId:465,actorRole:'clinical_practice_assistant',people};
const mentor={...cpa,actorId:477,actorRole:'provider_plus'};
const body=()=>({agencyId:2,requestId:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',timeZone:'America/Denver',start:'2026-10-06T14:00',end:'2026-10-06T15:00',title:'Office intake check-in',type:'primary',platform:'google_meet',reason:'missing_claim',summary:'Reviewed intake status and upcoming work.',transcript:'',attested:true,people:[{userId:465,minutes:60,covered:false},{userId:11,minutes:45,covered:false}]});
const validate=(b=body(),o=cpa)=>validateManualMeeting(b,o,new Date('2026-10-12T20:00:00Z'));
beforeEach(()=>{vi.clearAllMocks();m.member.mockResolvedValue(true);m.artifact.mockResolvedValue(null);m.sync.mockResolvedValue({ok:true,created:2,results:[]});m.execute.mockImplementation(async(sql,args)=>{
 if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
 if(sql.includes('FROM users u JOIN user_agencies'))return [people];
 if(sql.includes('INSERT INTO provider_schedule_events'))return [{insertId:100}];
 if(sql.includes('INSERT INTO manual_meeting_logs'))return [{insertId:50}];
 if(sql.includes('FROM manual_meeting_log_attendees a'))return [[{userId:465,name:'CPA',policy:'submit'}]];
 return [[]];
});});
describe('manual meeting authorization and evidence',()=>{
 it('recognizes CPA and mentor capabilities without granting them to everyone',async()=>{expect((await manualMeetingOptions(2,465)).allowed).toBe(true);expect((await manualMeetingOptions(2,477)).people.map(p=>p.id)).toEqual([477,10,12]);expect((await manualMeetingOptions(2,11)).allowed).toBe(false);});
 it('denies inactive or cross-agency actors before listing staff',async()=>{m.member.mockResolvedValue(false);await expect(manualMeetingOptions(99,465)).rejects.toMatchObject({status:403});expect(m.execute).not.toHaveBeenCalled();});
 it('uses the local service date and UTC attendance instants',()=>{expect(validate()).toMatchObject({claimDate:'2026-10-06',startAt:'2026-10-06 20:00:00',endAt:'2026-10-06 21:00:00',subtype:'cpa'});});
 it('allows a mentor with interns but not arbitrary providers',()=>{const b=body();b.people=[{userId:477,minutes:60},{userId:10,minutes:60}];expect(validate(b,mentor).subtype).toBe('mentorship');b.people[1].userId=11;expect(()=>validate(b,mentor)).toThrow('Mentorship is for interns');});
 it('allows a mentor’s unscheduled supervisor contact',()=>{const b=body();b.type='contact';b.facilitatorId=12;b.people=[{userId:477,minutes:60},{userId:12,minutes:60}];expect(validate(b,mentor)).toMatchObject({subtype:'admin',facilitatorId:12});});
 it.each([['attested',false],['summary',''],['type','interview'],['platform','unknown'],['start','2026-02-30T14:00'],['timeZone','bad/zone'],['requestId','bad'],['end','2027-10-06T15:00']])('rejects invalid %s', (key,value)=>{expect(()=>validate({...body(),[key]:value})).toThrow();});
 it('requires the submitter and real distinct eligible attendees',()=>{let b=body();b.people=b.people.slice(1);expect(()=>validate(b)).toThrow();b=body();b.people[1].userId=999;expect(()=>validate(b)).toThrow();b=body();b.people[1].userId=465;expect(()=>validate(b)).toThrow();});
 it('rejects nonexistent DST wall times rather than shifting them',()=>{expect(()=>validate({...body(),start:'2026-03-08T02:30',end:'2026-03-08T03:30'})).toThrow();});
 it('rejects attendance outside the meeting duration',()=>{const b=body();b.people[1].minutes=61;expect(()=>validate(b)).toThrow('actual minutes');});
});
describe('duplicate prevention and saved attendance',()=>{
 it('detects same-event claims and timed overlaps while allowing adjacent intervals',()=>{const input=validate();expect(overlappingClaim({claim_date:input.claimDate,payload_json:{startTime:'14:30',endTime:'15:30'}},input)).toBe(true);expect(overlappingClaim({claim_date:input.claimDate,payload_json:{startTime:'15:00',endTime:'16:00'}},input)).toBe(false);expect(overlappingClaim({claim_date:input.claimDate,payload_json:{}},input)).toBeNull();expect(overlappingClaim({claim_date:input.claimDate,payload_json:{scheduleEventId:7}},input,7)).toBe(true);});
 it('holds untimed admin claims for review and marks known duplicates without disclosing claim details',async()=>{const base=m.execute.getMockImplementation();m.execute.mockImplementation(async(sql,args)=>sql.includes('FROM payroll_time_claims')?[[{id:611,claim_date:'2026-10-06',payload_json:args[1]===465?{startTime:'14:00',endTime:'15:00'}:{}}]]:base(sql,args));const r=await previewManualMeeting(body(),465);expect(r.attendees.map(p=>p.policy)).toEqual(['review','existing']);expect(JSON.stringify(r)).not.toContain('611');});
 it('requires selection of an overlapping scheduled meeting before creating another',async()=>{const base=m.execute.getMockImplementation();m.execute.mockImplementation((sql,args)=>sql.includes('SELECT e.id')?[[{id:9,title:'Existing',provider_id:465,kind:'HUDDLE',meeting_subtype:'cpa'}]]:base(sql,args));expect((await previewManualMeeting(body(),465)).requiresEvent).toBe(true);await expect(saveManualMeeting(body(),465)).rejects.toMatchObject({status:409});expect(m.write).not.toHaveBeenCalled();expect(m.commit).not.toHaveBeenCalled();});
 it('does not allow a stale or unauthorized event id',async()=>{await expect(previewManualMeeting({...body(),eventId:999},465)).rejects.toMatchObject({status:409});});
 it('saves encrypted evidence, records everyone and only then invokes ordinary payroll sync',async()=>{const r=await saveManualMeeting(body(),465);expect(r).toMatchObject({eventId:100,logId:50,created:2});expect(m.write).toHaveBeenCalledWith(expect.objectContaining({eventId:100,summaryText:expect.stringContaining('Reviewed intake')}),expect.any(Object));const writes=m.execute.mock.calls.filter(([sql])=>sql.includes('INSERT INTO manual_meeting_log_attendees'));expect(writes).toHaveLength(2);expect(m.execute.mock.calls.some(([sql])=>sql.includes('notify_participants')&&sql.includes('0,0'))).toBe(true);expect(m.sync).toHaveBeenCalledWith({eventId:100,actorUserId:465});expect(m.commit.mock.invocationCallOrder[0]).toBeLessThan(m.sync.mock.invocationCallOrder[0]);expect(m.release).toHaveBeenCalled();});
 it('persists covered admin time as attendance only',async()=>{const b=body();b.people[0].covered=true;await saveManualMeeting(b,465);expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO manual_meeting_log_attendees'),[50,465,60,'covered',null]);});
 it('rolls back attendance and event creation if evidence encryption fails',async()=>{m.write.mockRejectedValueOnce(new Error('No encryption key'));await expect(saveManualMeeting(body(),465)).rejects.toThrow('No encryption key');expect(m.rollback).toHaveBeenCalled();expect(m.commit).not.toHaveBeenCalled();expect(m.sync).not.toHaveBeenCalled();});
 it('retries claim sync after a saved response is lost without creating more attendance or meetings',async()=>{await saveManualMeeting(body(),465);const params=m.execute.mock.calls.find(([sql])=>sql.includes('INSERT INTO manual_meeting_logs'))[1];const hash=params[4];vi.clearAllMocks();const base=m.execute.getMockImplementation();m.execute.mockImplementation((sql,args)=>sql.includes('FROM manual_meeting_logs WHERE agency_id')?[[{id:50,event_id:100,request_hash:hash}]]:base(sql,args));await saveManualMeeting(body(),465);expect(m.begin).not.toHaveBeenCalled();expect(m.write).not.toHaveBeenCalled();expect(m.sync).toHaveBeenCalledWith({eventId:100,actorUserId:465});});
 it('does not reuse a saved request id for changed amounts or attendees',async()=>{const base=m.execute.getMockImplementation();m.execute.mockImplementation((sql,args)=>sql.includes('FROM manual_meeting_logs WHERE agency_id')?[[{id:50,event_id:100,request_hash:'different'}]]:base(sql,args));await expect(saveManualMeeting(body(),465)).rejects.toMatchObject({status:409});expect(m.sync).not.toHaveBeenCalled();});
});

import {resolveManualMeetingReview} from '../manualMeetingLog.service.js';
it('reserves overlap decisions to payroll admins and requires a review explanation',async()=>{
 await expect(resolveManualMeetingReview({actor:{id:465,role:'clinical_practice_assistant'},eventId:7,userId:11,action:'submit',note:'Separate duties'})).rejects.toMatchObject({status:403});
 await expect(resolveManualMeetingReview({actor:{id:501,role:'super_admin'},eventId:7,userId:11,action:'submit',note:''})).rejects.toMatchObject({status:400});
});
it('records an administrator’s coverage review without approving payroll',async()=>{
 const base=m.execute.getMockImplementation();m.execute.mockImplementation((sql,args)=>sql.includes('AS log_id')?[[{agency_id:2,log_id:50,claim_policy:'review'}]]:base(sql,args));
 await resolveManualMeetingReview({actor:{id:501,role:'super_admin'},eventId:7,userId:11,action:'covered',note:'This is already included in the existing admin claim.'});
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE manual_meeting_log_attendees'),['covered',501,'This is already included in the existing admin claim.',50,11]);
 expect(m.execute.mock.calls.some(([sql])=>sql.includes('UPDATE payroll_time_claims'))).toBe(false);
});
it('does not override a confirmed overlap even for an administrator',async()=>{
 const base=m.execute.getMockImplementation();m.execute.mockImplementation((sql,args)=>sql.includes('AS log_id')?[[{agency_id:2,log_id:50,claim_policy:'review',start_at:'2026-10-06 20:00:00',end_at:'2026-10-06 21:00:00',event_timezone:'America/Denver'}]]:sql.includes('FROM payroll_time_claims')?[[{claim_date:'2026-10-06',payload_json:{scheduleEventId:7}}]]:base(sql,args));
 await expect(resolveManualMeetingReview({actor:{id:501,role:'super_admin'},eventId:7,userId:11,action:'submit',note:'Please submit missing time'})).rejects.toMatchObject({status:409});expect(m.sync).not.toHaveBeenCalled();
});
it('links older huddles that stored their subtype as general',async()=>{
 const base=m.execute.getMockImplementation();m.execute.mockImplementation((sql,args)=>sql.includes('SELECT e.id')?[[{id:9,title:'Existing',provider_id:465,kind:'HUDDLE',meeting_subtype:'general',start_at:'2026-10-06 20:00:00',end_at:'2026-10-06 21:00:00'}]]:base(sql,args));
 expect((await previewManualMeeting({...body(),eventId:9},465)).requiresEvent).toBe(false);
});
it('does not treat unrelated untimed direct-care indirect allowances as meeting pay',()=>{
 expect(overlappingClaim({claim_date:'2026-10-06',payload_json:{categoryGroup:'indirect_service'}},validate())).toBe(false);
});
it('marks a saved-but-unprocessed claim sync for safe retry',async()=>{
 m.sync.mockResolvedValue({ok:false,error:'database busy'});expect(await saveManualMeeting(body(),465)).toMatchObject({eventId:100,syncPending:true});expect(m.commit).toHaveBeenCalled();
});

it('allows a provider-role student intern in the mentor roster and manual log',async()=>{
 const roster=[...people,{id:979,name:'Student',role:'provider',title:'Intern',credential:'BA'}];
 m.execute.mockImplementation(async sql=>sql.includes('FROM users u JOIN user_agencies')?[roster]:[[]]);
 const options=await manualMeetingOptions(2,477);expect(options.people.some(p=>p.id===979)).toBe(true);
 const b=body();b.people=[{userId:477,minutes:60},{userId:979,minutes:45}];expect(validate(b,options).subtype).toBe('mentorship');
});
