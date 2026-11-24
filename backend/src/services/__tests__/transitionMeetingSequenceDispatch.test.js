import {expect,it,vi} from 'vitest';
import {dispatchTransitionAction,requireTransitionAutomation} from '../transitionMeetingSequenceDispatch.js';
const identity={actorType:'automation',subject:'synthetic:transition-test',agencyId:2,userId:null,scopes:['transition:sequence','meeting:invites','email:transition','payroll:attendance-claim']};
function fixture(kind='meeting_invitation'){
 const status=new Map([['key','pending']]);
 const store={claim:vi.fn(async()=>{if(status.get('key')!=='pending')return false;status.set('key','processing');return true;}),done:vi.fn(async()=>status.set('key','done')),review:vi.fn(async()=>status.set('key','review'))};
 const adapters={inviteToMeeting:vi.fn(async()=>({status:'created',reference:'synthetic-event:1'})),sendSequenceEmail:vi.fn(async()=>({status:'sent',reference:'synthetic-email:1'})),upsertAttendanceClaim:vi.fn(async()=>({status:'submitted',reference:'synthetic-claim:1'}))};
 return {plan:{id:'example',fingerprint:'fp',providers:[{userId:1}],hostIds:[91,92,93]},state:{planFingerprint:'fp',revision:1,outbox:{key:{key:'key',kind,userId:1,status:'pending'}}},key:'key',identity,store,adapters};
}
it('rejects human attribution, superadmin access, another practice, or insufficient scopes before claiming work',async()=>{
 for(const patch of [{actorType:'user',userId:91},{actorType:'super_admin'},{agencyId:6},{scopes:[]},{subject:''}]){
  const f=fixture();f.identity={...identity,...patch};await expect(dispatchTransitionAction(f)).rejects.toThrow('scoped');expect(f.store.claim).not.toHaveBeenCalled();
 }
 expect(requireTransitionAutomation(identity)).toEqual({actorType:'automation',subject:'synthetic:transition-test',agencyId:2,userId:null});
});
it('permits only one dispatch under concurrent workers and binds actual automation attribution',async()=>{
 const f=fixture();const results=await Promise.all([dispatchTransitionAction(f),dispatchTransitionAction(f)]);expect(results.filter(r=>r.status==='created')).toHaveLength(1);expect(f.adapters.inviteToMeeting).toHaveBeenCalledOnce();expect(f.store.done.mock.calls[0][0].audit.userId).toBeNull();
});
it('never resends an email with an uncertain network result, including after a worker restart',async()=>{
 const f=fixture('alternatives_email');f.adapters.sendSequenceEmail.mockRejectedValue(Error('timeout after acceptance'));expect(await dispatchTransitionAction(f)).toMatchObject({review:true});expect(await dispatchTransitionAction(f)).toMatchObject({skipped:true});expect(f.adapters.sendSequenceEmail).toHaveBeenCalledOnce();expect(f.store.review).toHaveBeenCalledOnce();expect(f.store.done).not.toHaveBeenCalled();
});
it('keeps a confirmed external send in review if persisting its receipt fails',async()=>{
 const f=fixture('video_followup');f.store.done.mockRejectedValue(Error('database failure'));expect(await dispatchTransitionAction(f)).toMatchObject({review:true});expect(await dispatchTransitionAction(f)).toMatchObject({skipped:true});expect(f.adapters.sendSequenceEmail).toHaveBeenCalledOnce();
});
it('routes claims through one upsert adapter, with no fabricated human submitter',async()=>{
 const f=fixture('submit_time_claim');await dispatchTransitionAction(f);expect(f.adapters.upsertAttendanceClaim).toHaveBeenCalledOnce();expect(f.adapters.inviteToMeeting).not.toHaveBeenCalled();expect(f.adapters.upsertAttendanceClaim.mock.calls[0][0].audit.userId).toBeNull();
});
it('skips canceled/nonpending actions and rejects foreign recipients',async()=>{
 const f=fixture();f.state.outbox.key.status='cancelled_attended';expect(await dispatchTransitionAction(f)).toMatchObject({skipped:true});expect(f.store.claim).not.toHaveBeenCalled();f.state.outbox.key.status='pending';f.state.outbox.key.userId=9;await expect(dispatchTransitionAction(f)).rejects.toThrow('providers');
});
