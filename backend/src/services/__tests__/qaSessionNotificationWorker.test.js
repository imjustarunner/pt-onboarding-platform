import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../sessionNotification.service.js',()=>({processDueSessionNotifications:vi.fn()}));
import {createQaSessionNotificationWorker} from '../qaSessionNotificationWorker.service.js';
const agency={id:450,slug:'auricwell-qa-demo',is_active:1,is_archived:0,feature_flags:{qaSandbox:{syntheticOnly:true}}};
const nlu=id=>({...agency,id,slug:id===453?'nlu-qa-demo':'nlu-qa-learning',feature_flags:{qaSandbox:{syntheticOnly:true,program:'tutoring'}}});
let db,connection,drain,canRun,run;
beforeEach(()=>{connection={execute:vi.fn(async()=>[[{acquired:1}]]),release:vi.fn()};db={execute:vi.fn(async()=>[[agency,nlu(453),nlu(454)]]),getConnection:vi.fn(async()=>connection)};drain=vi.fn(async()=>({sent:1}));canRun=vi.fn(async()=>true);run=createQaSessionNotificationWorker({db,process:drain,canRun});});
it('drains original and NLU QA booking queues with separate cross-replica locks',async()=>{
 const result=await run();expect(result.agencies.map(a=>a.agencyId)).toEqual([450,453,454]);
 expect(drain.mock.calls.map(([input])=>input)).toEqual([450,453,454].map(agencyId=>({agencyId,limit:50,includeRelatedQueues:true})));
 for(const id of [450,453,454])expect(connection.execute).toHaveBeenCalledWith('SELECT RELEASE_LOCK(?)',[`qa_session_notifications:${id}`]);expect(connection.release).toHaveBeenCalledTimes(3);
});
it.each([null,{...agency,id:6,slug:'nlu'},{...agency,slug:'itsco'},{...agency,is_active:0},{...agency,is_archived:1},{...nlu(453),feature_flags:null},{...nlu(453),slug:'nlu'}])('fails closed for an ineligible organization %j',async value=>{db.execute.mockResolvedValue([[value]]);await run();expect(drain).not.toHaveBeenCalled();expect(db.getConnection).not.toHaveBeenCalled();});
it('does not dispatch from local, preview or retired revisions',async()=>{canRun.mockResolvedValue(false);expect(await run()).toMatchObject({skipped:true});expect(db.execute).not.toHaveBeenCalled();expect(drain).not.toHaveBeenCalled();});
it('does not duplicate another worker and releases the connection',async()=>{connection.execute.mockResolvedValue([[{acquired:0}]]);await run();expect(drain).not.toHaveBeenCalled();expect(connection.release).toHaveBeenCalledTimes(3);expect(connection.execute.mock.calls.every(([sql])=>!sql.includes('RELEASE_LOCK'))).toBe(true);});
it('continues other QA scopes and reports incomplete coverage after a source failure',async()=>{drain.mockRejectedValueOnce(Error('source failed'));await expect(run()).rejects.toMatchObject({code:'QA_SESSION_QUEUE_FAILED',agencyIds:[450]});expect(drain).toHaveBeenCalledTimes(3);expect(connection.release).toHaveBeenCalledTimes(3);});
