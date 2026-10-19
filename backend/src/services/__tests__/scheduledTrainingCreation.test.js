import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),write:vi.fn(),begin:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),queue:vi.fn(),member:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:async()=>({execute:m.write,beginTransaction:m.begin,commit:m.commit,rollback:m.rollback,release:m.release})}}));
vi.mock('../meetingJoinPolicy.service.js',()=>({hasActiveMeetingMembership:m.member,canJoinTeamMeeting:vi.fn()}));
vi.mock('../meetingInvitations.service.js',()=>({queueMeetingInvitations:m.queue}));
vi.mock('../../models/ProviderScheduleEventArtifact.model.js',()=>({default:{upsertByEventId:vi.fn()}}));
vi.mock('../clinicalNoteCrypto.service.js',()=>({maybeEncryptNotePayload:v=>v}));
import {createScheduledTraining,trainingRoster} from '../scheduledTraining.service.js';
const input={agencyId:2,title:'Crisis Training',proctorId:2,coproctorIds:[3],sessions:[{startAt:'2026-10-27T23:00:00Z',endAt:'2026-10-28T01:00:00Z'}],inviteAll:true};
beforeEach(()=>{vi.clearAllMocks();m.member.mockResolvedValue(true);m.execute.mockResolvedValue([[{id:2,role:'provider_plus',first_name:'Trainer'},{id:3,role:'provider',credential:'BA'},{id:4,role:'intern'}]]);m.write.mockImplementation(async(sql,params)=>{expect((sql.match(/\?/g)||[]).length).toBe(params.length);return sql.startsWith('SELECT')?[[{id:40,agency_id:2,provider_id:2,kind:'TEAM_MEETING',meeting_subtype:'training'}]]:[{insertId:40}];});});
it.each(['support','provider','intern','schedule_manager'])('rejects unauthorized scheduler %s before any writes',async role=>{await expect(createScheduledTraining(input,{id:1,role})).rejects.toMatchObject({status:403});expect(m.write).not.toHaveBeenCalled();expect(m.queue).not.toHaveBeenCalled();});
it('requires active membership even for a permitted scheduler',async()=>{m.member.mockResolvedValue(false);await expect(trainingRoster(2,{id:1,role:'admin'})).rejects.toMatchObject({status:403});});
it('atomically saves all dates, invitations and coproctor assignments before queueing email',async()=>{
 const result=await createScheduledTraining({...input,sessions:[...input.sessions,{startAt:'2026-10-28T23:00:00Z',endAt:'2026-10-29T01:00:00Z'}]},{id:1,role:'admin'});
 expect(result.events).toHaveLength(2);expect(m.commit).toHaveBeenCalledOnce();expect(m.rollback).not.toHaveBeenCalled();expect(m.queue).toHaveBeenCalledWith(expect.objectContaining({id:40}),[2,3,4]);expect(m.queue.mock.invocationCallOrder[0]).toBeGreaterThan(m.commit.mock.invocationCallOrder[0]);
 expect(m.write).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO meeting_participant_preferences'),[40,3,1,1]);
});
it('rejects a foreign-agency trainer or participant',async()=>{await expect(createScheduledTraining({...input,proctorId:99},{id:1,role:'admin'})).rejects.toMatchObject({status:400});await expect(createScheduledTraining({...input,inviteAll:false,participants:[{userId:99,required:true}]},{id:1,role:'admin'})).rejects.toMatchObject({status:400});expect(m.write).not.toHaveBeenCalled();});
it('rolls back every date and queues no mail if one session fails',async()=>{m.write.mockRejectedValueOnce(new Error('write failed'));await expect(createScheduledTraining(input,{id:1,role:'admin'})).rejects.toThrow('write failed');expect(m.rollback).toHaveBeenCalledOnce();expect(m.queue).not.toHaveBeenCalled();});
it('persists an admin-authorized participant pay override before invitations are queued',async()=>{
 await createScheduledTraining({...input,compensationOverrides:[{userId:3,rateType:'admin_time',reason:'Leadership meeting'}]},{id:501,role:'super_admin'});
 expect(m.write).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO scheduled_training_compensation_overrides'),[40,3,2,'admin_time','Leadership meeting',501]);
 expect(m.queue.mock.invocationCallOrder[0]).toBeGreaterThan(m.commit.mock.invocationCallOrder[0]);
});
it.each(['provider_plus','clinical_practice_assistant'])('does not let scheduler %s authorize a pay override',async role=>{
 await expect(createScheduledTraining({...input,compensationOverrides:[{userId:3,rateType:'admin_time',reason:'Leadership meeting'}]},{id:1,role})).rejects.toMatchObject({status:403});
 expect(m.write).not.toHaveBeenCalled();
});
it.each([
 {userId:4,rateType:'admin_time',reason:'Intern'},
 {userId:2,rateType:'admin_time',reason:'Optional participant'},
 {userId:999,rateType:'admin_time',reason:'Not invited'},
 {userId:3,rateType:'custom',reason:'Unsupported category'},
 {userId:3,rateType:'admin_time',reason:''}
])('rejects an invalid or ineligible compensation override %j',async override=>{
 await expect(createScheduledTraining({...input,compensationOverrides:[override]},{id:1,role:'admin'})).rejects.toMatchObject({status:400});
 expect(m.write).not.toHaveBeenCalled();
});
