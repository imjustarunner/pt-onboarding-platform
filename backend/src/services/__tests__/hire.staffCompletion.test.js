import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:vi.fn()}));
vi.mock('../hireJourney.service.js',()=>({closePrehire:vi.fn()}));
import {createPrehireCompletionService} from '../hirePrehireCompletion.service.js';
let d,db,state,user,complete;
beforeEach(()=>{
 state={agency:{id:2},candidate:{status:'PREHIRE_OPEN'},hireAccountMode:'group_password',progress:{allDone:true},workflow:{steps:{pre_hire:[{key:'work-email',kind:'work-email',complete:true}]}}};
 user={status:'PREHIRE_OPEN',work_email:'candidate@itsco.health'};
 db={execute:vi.fn(async()=>[[user]]),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};
 d={database:{getConnection:vi.fn(async()=>db)},state:vi.fn(async()=>state),close:vi.fn(),assertSteps:vi.fn(),advance:vi.fn()};complete=createPrehireCompletionService(d);
});
it('allows staff to complete verified prehire requirements and records their review without starting onboarding',async()=>{
 expect(await complete({userId:8,actorUserId:3,agencyId:2})).toMatchObject({advancedTo:'PREHIRE_REVIEW'});
 expect(d.close).toHaveBeenCalledWith(8,expect.objectContaining({reviewedByStaffUserId:3}),db);
 expect(d.advance).toHaveBeenCalledWith(8,3);expect(db.commit).toHaveBeenCalledOnce();
 expect(db.execute.mock.calls.some(([sql])=>/password|ACTIVE_EMPLOYEE|ONBOARDING/.test(sql))).toBe(false);
});
it.each(['required item','username','saved submission','changed stage','other agency'])('does not complete when blocked by %s',async reason=>{
 if(reason==='required item')state.progress.allDone=false;
 if(reason==='username')user.work_email=null;
 if(reason==='saved submission')d.assertSteps.mockRejectedValue(new Error('Missing persisted submission'));
 if(reason==='changed stage')user.status='ONBOARDING';
 if(reason==='other agency')state.agency.id=7;
 await expect(complete({userId:8,actorUserId:3,agencyId:2})).rejects.toThrow();
 expect(d.close).not.toHaveBeenCalled();expect(d.advance).not.toHaveBeenCalled();expect(db.commit).not.toHaveBeenCalled();
});
it('keeps candidate submission on the same prerequisite path and treats an already submitted phase idempotently',async()=>{
 await complete({userId:8});expect(d.advance).toHaveBeenCalledWith(8,null);
 state.candidate.status='PREHIRE_REVIEW';d.close.mockClear();
 expect(await complete({userId:8,actorUserId:3,agencyId:2})).toMatchObject({alreadyComplete:true});expect(d.close).not.toHaveBeenCalled();
});
