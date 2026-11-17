import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../clientPortalEmail.service.js',()=>({clientEmailContext:vi.fn(),sendClientPortalEmail:vi.fn()}));
vi.mock('../familyNotificationChoices.service.js',()=>({familyNotificationDeliveryGate:vi.fn()}));
import {deliverGuardianPlanNotice,planReviewEmail,queueGuardianPlanDelivery,retryPendingGuardianPlans} from '../guardianPlanDelivery.service.js';
const plan={id:3,agency_id:2,client_id:5,status:'active'},guardian={guardian_user_id:10,email:'parent@example.test',role:'client_guardian',is_active:1},link={id:50,status:'issued',meta_json:{planRevision:'current',portalOnly:true}};
let deps;
beforeEach(()=>{deps={gate:vi.fn(async()=>({allowed:true})),context:vi.fn(async()=>({url:()=> 'https://example.test/guardian'})),send:vi.fn(async()=>({id:81})),update:vi.fn()};});
it('keeps delivery pending without an account or email and observes existing communication choices',async()=>{
 expect(await deliverGuardianPlanNotice({plan,guardian:{...guardian,email:''},link},deps)).toEqual({complete:false});expect(deps.send).not.toHaveBeenCalled();
 deps.gate.mockResolvedValue({allowed:false});expect(await deliverGuardianPlanNotice({plan,guardian,link},deps)).toEqual({complete:false});expect(deps.send).not.toHaveBeenCalled();expect(deps.update).not.toHaveBeenCalled();
});
it('delivers a localized portal-only notice once, without clinical content or a human automation actor',async()=>{
 expect(await deliverGuardianPlanNotice({plan,guardian,link,locale:'es'},deps)).toEqual({complete:true});
 expect(deps.send).toHaveBeenCalledWith(expect.objectContaining({to:'parent@example.test',generatedByUserId:null,source:'auto',subject:'Su plan está listo para revisar',linkUrl:expect.stringContaining('lang=es')}));
 expect(deps.send.mock.calls[0][0].text).not.toContain('diagnos');expect(deps.update.mock.calls.map(([,fields])=>fields.meta.emailDelivery.status)).toEqual(['sending','sent']);
 const saved=deps.update.mock.calls.at(-1)[1].meta;
 await deliverGuardianPlanNotice({plan,guardian,link:{...link,meta_json:saved}},deps);expect(deps.send).toHaveBeenCalledOnce();
});
it('never repeats an ambiguous delivery and retains a queued delivery until confirmed',async()=>{
 deps.send.mockRejectedValue(Error('Timeout'));
 await deliverGuardianPlanNotice({plan,guardian,link},deps);const saved=deps.update.mock.calls.at(-1)[1].meta;
 expect(saved.emailDelivery.status).toBe('unknown');await deliverGuardianPlanNotice({plan,guardian,link:{...link,meta_json:saved}},deps);expect(deps.send).toHaveBeenCalledOnce();
 const queued={...link,meta_json:{emailDelivery:{status:'queued',communicationId:81}}};deps.db={execute:vi.fn(async()=>[[{delivery_status:'sent'}]])};
 expect(await deliverGuardianPlanNotice({plan,guardian,link:queued},deps)).toEqual({complete:true});expect(deps.send).toHaveBeenCalledOnce();
});
it('persists an active plan intent and retries under automation attribution, while never sharing unsigned drafts',async()=>{
 const db={execute:vi.fn(async()=>[[{id:3},{id:4}]])},load=vi.fn(async id=>({...plan,id,status:id===4?'draft':'active',client_ack_status:id===4?null:'awaiting_portal'})),share=vi.fn();
 await queueGuardianPlanDelivery({...plan,status:'draft'},db);expect(db.execute).not.toHaveBeenCalled();await queueGuardianPlanDelivery(plan,db);expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('awaiting_portal'),[3,2,5]);
 await retryPendingGuardianPlans({db,load,share});expect(share).toHaveBeenCalledExactlyOnceWith({plan:expect.objectContaining({id:3}),actorUserId:null});
 expect(planReviewEmail('en','https://example.test').subject).toContain('ready');
});
