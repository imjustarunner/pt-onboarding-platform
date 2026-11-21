import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
import {notifyTutoringSummary} from '../tutoringSummaryNotice.service.js';
const ctx={appointment:{id:479,agencyId:453,learningContext:{serviceEnrollmentId:1038}},clientId:2545,req:{user:{id:1496}}};
function setup(previous=null,permissions={}){
 const db={execute:vi.fn(async sql=>sql.includes('GET_LOCK')?[[{acquired:1}]]:sql.includes('FROM user_communications')?[[previous].filter(Boolean)]:[[]]),release:vi.fn()};
 const deps={db:{getConnection:async()=>db},recipients:async()=>({recipients:[{userId:1759,email:'qa.nlu.parent@example.com'}]}),
  authorize:async()=>({permissions_json:permissions}),context:async()=>({tenant:{id:453,slug:'nlu-qa-demo',feature_flags:{qaSandbox:{program:'tutoring',syntheticOnly:true}}}}),
  communications:{create:vi.fn(async()=>({id:55})),updateDeliveryStatus:vi.fn()},send:vi.fn(async()=>({id:'actual-transport-id'}))};
 return {deps,db};
}
it('sends only a secure summary link using the exact publication and booked QA agency',async()=>{
 const {deps,db}=setup();expect(await notifyTutoringSummary(ctx,{id:44},deps)).toEqual([{id:55,status:'sent'}]);
 expect(deps.send).toHaveBeenCalledWith(expect.objectContaining({existingCommunicationId:55,templateType:'tutoring_summary_shared',to:'qa.nlu.parent@example.com',ctaUrl:expect.stringContaining('/nlu-qa-demo/tutoring/appointment/479?clientId=2545')}));
 expect(deps.send.mock.calls[0][0].text).not.toContain('Equivalent fractions');
 expect(db.release).toHaveBeenCalled();
});
it.each(['sent','pending','flagged','delivered'])('never repeats an already recorded or uncertain %s notice',async delivery_status=>{
 const {deps}=setup({id:55,delivery_status});await notifyTutoringSummary(ctx,{id:44},deps);expect(deps.send).not.toHaveBeenCalled();expect(deps.communications.create).not.toHaveBeenCalled();
});
it('withholds a summary notice when the parent has no progress permission',async()=>{
 const {deps}=setup(null,{canViewProgress:false});await notifyTutoringSummary(ctx,{id:44},deps);expect(deps.send).not.toHaveBeenCalled();
});
it('records an uncertain transport for review without failing the signed summary',async()=>{
 const {deps}=setup();deps.send.mockRejectedValue(new Error('Network interrupted'));
 expect(await notifyTutoringSummary(ctx,{id:44},deps)).toEqual([{id:55,status:'flagged'}]);
});
