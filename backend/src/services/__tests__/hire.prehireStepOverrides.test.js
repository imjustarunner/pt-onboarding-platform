import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:vi.fn()}));
vi.mock('../guardianIntakeEncryption.service.js',()=>({encryptGuardianIntake:v=>({cipher:v}),decryptGuardianIntake:v=>v.cipher}));
import {createPrehireStepOverrideService} from '../hirePrehireStepOverrides.service.js';
import {applyPrehireStepOverrides} from '../../utils/hirePrehireStepOverrides.js';
import {requiredSubmissionKeys} from '../hirePortalWorkflow.service.js';
import {summarizeSteps} from '../../utils/hirePortalWorkflow.js';
let db,state,user,journey,write;
const input={userId:824,agencyId:2,actorUserId:501,stepKey:'job-description',reason:'Legacy job description was handled outside the portal.'};
beforeEach(()=>{
 user={status:'PREHIRE_OPEN'};journey={};state={agency:{id:2},workflow:{steps:{pre_hire:[{key:'job-description',kind:'job-description',required:true,complete:false},{key:'agreement',kind:'unavailable',required:true,complete:false},{key:'work-email',kind:'work-email',required:true,complete:true},{key:'profile',kind:'profile',required:true,complete:false}]}}};
 db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async sql=>sql.includes('SELECT status')?[[user]]:sql.includes('SELECT prehire_completed')?[[journey]]:sql.includes('SELECT first_name')?[[{first_name:'Michael',last_name:'Mendez'}]]:[[]])};
 write=createPrehireStepOverrideService({database:{getConnection:async()=>db},state:async()=>state});
});
it('records an attributed, reasoned exception without fabricating a document or signature',async()=>{
 expect(await write(input)).toMatchObject({ok:true,stepKey:'job-description',override:{actorUserId:501,active:true}});
 const stored=db.execute.mock.calls.find(([sql])=>sql.includes('INSERT INTO hire_portal_submissions'));
 expect(stored[1][1]).toBe('staff-override:job-description');
 const payload=JSON.parse(JSON.parse(stored[1][2]).cipher);expect(payload).toMatchObject({reason:input.reason,actorName:'Michael Mendez',history:[{actorUserId:501}]});
 expect(db.execute.mock.calls.filter(([sql])=>/^(INSERT|UPDATE)/.test(sql)).every(([sql])=>/hire_portal_submissions|user_activity_log/.test(sql))).toBe(true);
 expect(db.commit).toHaveBeenCalledOnce();
});
it('preserves the original completion state and only removes an overridden requirement from submission checks',()=>{
 const overrides={'pre_hire:staff-override:profile':{completedAt:new Date(),value:{type:'staff_pre_hire_override',active:true,reason:'Legacy paper information retained by staff.',actorUserId:501}}};
 const steps=applyPrehireStepOverrides(state.workflow.steps.pre_hire,overrides);
 expect(steps.find(s=>s.key==='profile')).toMatchObject({complete:true,actualComplete:false,staffOverride:{actorUserId:501}});
 expect(requiredSubmissionKeys(steps,true)).not.toContain('profile');expect(summarizeSteps(steps)).toMatchObject({completed:2,total:4,allDone:false});
 expect(applyPrehireStepOverrides(state.workflow.steps.pre_hire,{'pre_hire:staff-override:profile':{completedAt:null,value:{active:false}}}).find(s=>s.key==='profile').complete).toBe(false);
});
it.each(['closed package','changed agency','unknown step','work username','missing reason','missing actor'])('rejects %s before saving an exception',async issue=>{
 const request={...input};if(issue==='closed package')journey.prehire_completed_at=new Date();if(issue==='changed agency')state.agency.id=9;if(issue==='unknown step')request.stepKey='made-up';if(issue==='work username')request.stepKey='work-email';if(issue==='missing reason')request.reason='';if(issue==='missing actor')request.actorUserId=null;
 await expect(write(request)).rejects.toThrow();expect(db.commit).not.toHaveBeenCalled();
});
it('restores a requirement while retaining its previous reason and reviewer history',async()=>{
 const previous={type:'staff_pre_hire_override',active:true,history:[{actorUserId:3,reason:'Legacy agreement received outside the portal.'}]};
 db.execute.mockImplementation(async sql=>sql.includes('SELECT encrypted_value')?[[{encrypted_value:JSON.stringify({cipher:JSON.stringify(previous)})}]]:sql.includes('SELECT status')?[[user]]:sql.includes('SELECT prehire_completed')?[[journey]]:sql.includes('SELECT first_name')?[[{first_name:'Michael',last_name:'Mendez'}]]:[[]]);
 await write({...input,revoke:true,reason:'Replacement document is ready for the candidate.'});
 const values=db.execute.mock.calls.find(([sql])=>sql.includes('INSERT INTO hire_portal_submissions'))[1];const saved=JSON.parse(JSON.parse(values[2]).cipher);
 expect(saved.active).toBe(false);expect(saved.history).toHaveLength(2);expect(values[3]).toBeNull();
});
