import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../models/User.model.js',()=>({default:{getAgencies:vi.fn()}}));
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn(),getConnection:vi.fn()}}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn()}}));
import {getCallBillingReview,saveCallBillingReview,listCallBillingReviews} from '../callBillingReview.service.js';
let row,d,db,claim,assigned;
const user={id:7,role:'provider'},input={action:'request_review',revision:0,description:'Discussed the documented treatment plan.',billingReason:'Provided a clinical service requiring payer review.',serviceMinutes:4,serviceCode:''};
beforeEach(()=>{
 assigned=true;claim=null;row={id:1,agency_id:2,client_id:3,user_id:7,direction:'INBOUND',duration_seconds:300,metadata:{other:'preserved'}};
 db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async(sql,args)=>{if(sql.startsWith('SELECT metadata'))return [[{metadata:row.metadata}]];if(sql.startsWith('UPDATE call_logs'))row.metadata={...row.metadata,billingReview:JSON.parse(args[0])};return [{affectedRows:1}];})};
 d={main:{getConnection:vi.fn(async()=>db),execute:vi.fn(async sql=>sql.includes('client_provider_assignments')?[assigned?[{id:3}]:[]]:[[row]])},clinical:{execute:vi.fn(async(sql,args)=>[claim&&args[0]===claim.id&&args[1]===2&&args[2]===3?[claim]:[]])},billingAccess:vi.fn(async u=>u.role==='admin'),memberships:vi.fn(async()=>[{id:2}]),encrypt:vi.fn(s=>({cipher:s})),decrypt:vi.fn(e=>e.cipher),encryptionReady:vi.fn(()=>true),evidence:vi.fn()};
});
it('stores documentation encrypted, preserves unrelated call metadata and creates no charge',async()=>{
 const saved=await saveCallBillingReview(user,1,input,d);expect(saved.status).toBe('review_requested');expect(saved.details.serviceMinutes).toBe(4);expect(row.metadata.other).toBe('preserved');
 expect(row.metadata.billingReview.description).toBeUndefined();expect(row.metadata.billingReview.envelope).toBeTruthy();expect(d.evidence).toHaveBeenCalled();expect(db.commit).toHaveBeenCalled();expect(d.clinical.execute).not.toHaveBeenCalled();
});
it('denies another provider, an unassigned client, other agencies and nonstaff accounts',async()=>{
 await expect(getCallBillingReview({id:8,role:'provider'},1,d)).rejects.toMatchObject({status:404});
 assigned=false;await expect(getCallBillingReview(user,1,d)).rejects.toMatchObject({status:404});assigned=true;d.memberships.mockResolvedValue([{id:99}]);await expect(getCallBillingReview(user,1,d)).rejects.toMatchObject({status:404});
 await expect(getCallBillingReview({id:7,role:'client'},1,d)).rejects.toMatchObject({status:404});
 await expect(listCallBillingReviews(user,2,d)).rejects.toMatchObject({status:403});expect(db.commit).not.toHaveBeenCalled();
});
it('requires documentation and actual time within call duration; rejects stale overwrites',async()=>{
 await expect(saveCallBillingReview(user,1,{...input,description:''},d)).rejects.toThrow('Describe');
 await expect(saveCallBillingReview(user,1,{...input,serviceMinutes:8},d)).rejects.toThrow('duration');
 await saveCallBillingReview(user,1,input,d);await expect(saveCallBillingReview(user,1,input,d)).rejects.toMatchObject({status:409});
});
it('only billing staff may attach a claim and billed reflects actual submission',async()=>{
 await saveCallBillingReview(user,1,input,d);
 await expect(saveCallBillingReview(user,1,{action:'attach_claim',revision:1,claimId:9},d)).rejects.toMatchObject({status:403});
 const admin={id:10,role:'admin'};
 await expect(saveCallBillingReview(admin,1,{action:'attach_claim',revision:1,claimId:9},d)).rejects.toThrow('same client');
 claim={id:9,claim_lifecycle:'draft'};
 expect((await saveCallBillingReview(admin,1,{action:'attach_claim',revision:1,claimId:9},d)).status).toBe('claim_linked');
 claim.claim_lifecycle='submitted';expect((await getCallBillingReview(user,1,d)).status).toBe('billed');
 await expect(saveCallBillingReview(admin,1,{action:'not_billable',revision:2},d)).rejects.toMatchObject({status:409});
});
it('rolls back if audit evidence fails and rejects saving without encryption',async()=>{
 d.encryptionReady.mockReturnValue(false);await expect(saveCallBillingReview(user,1,input,d)).rejects.toMatchObject({status:503});expect(db.commit).not.toHaveBeenCalled();
 d.encryptionReady.mockReturnValue(true);d.evidence.mockRejectedValueOnce(new Error('offline'));await expect(saveCallBillingReview(user,1,input,d)).rejects.toThrow('offline');expect(db.rollback).toHaveBeenCalled();expect(db.commit).not.toHaveBeenCalled();
});
