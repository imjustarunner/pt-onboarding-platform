import {beforeEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({create:vi.fn()}));
vi.mock('../../models/NoteAidWorkQueueItem.model.js',()=>({default:{createIfMissingForUser:mocks.create}}));
import {clientClosureReview,validateClientClosureReview,queueClientClosureNote,canMarkClientInactive} from '../clientClosureReview.service.js';
const client={id:5,agency_id:2,provider_id:9,client_status_id:4,status:'ACTIVE',updated_at:'2026-11-23 12:00:00'};
let clinicalDatabase;
beforeEach(()=>{vi.clearAllMocks();clinicalDatabase={execute:vi.fn(async()=>[[]])};});
async function request(){return {confirmClientClosure:true,closureReviewToken:(await clientClosureReview(client,{clinicalDatabase})).reviewToken,termination_reason:'End active care'};}
it.each(['provider','provider_plus','intern','staff','clinical_practice_assistant'])('does not permit %s to mark a client inactive directly',role=>expect(canMarkClientInactive(role)).toBe(false));
it.each(['admin','support','super_admin'])('permits %s to review an inactive action',role=>expect(canMarkClientInactive(role)).toBe(true));
it('requires both confirmation and an explicit decision when no completed termination note exists',async()=>{
 const body=await request();await expect(validateClientClosureReview({...body,confirmClientClosure:false},client,{clinicalDatabase})).rejects.toMatchObject({status:400});
 await expect(validateClientClosureReview(body,client,{clinicalDatabase})).rejects.toThrow('whether this client requires');
 await expect(validateClientClosureReview({...body,termination_note_required:false},client,{clinicalDatabase})).rejects.toThrow('Explain why');
 expect(await validateClientClosureReview({...body,termination_note_required:false,termination_note_not_required_reason:'Did not begin services.'},client,{clinicalDatabase})).toMatchObject({termination_note_required:false,termination_note_not_required_reason:'Did not begin services.'});
});
it('recognizes completed documentation and scopes the evidence to this client and agency',async()=>{
 clinicalDatabase.execute.mockResolvedValue([[{id:8,provider_signed_at:'2026-11-23'}]]);const body=await request();
 expect(await validateClientClosureReview(body,client,{clinicalDatabase})).toMatchObject({terminationNote:{id:8},termination_note_required:true});
 expect(clinicalDatabase.execute.mock.calls[0][1].slice(0,2)).toEqual([2,5]);
 expect(clinicalDatabase.execute.mock.calls[0][0]).toContain("n.is_deleted=0");
});
it('requires another review after the client or their note evidence changes',async()=>{
 const body={...await request(),termination_note_required:true};
 await expect(validateClientClosureReview(body,{...client,updated_at:'2026-11-23 13:00:00'},{clinicalDatabase})).rejects.toMatchObject({status:409});
 clinicalDatabase.execute.mockResolvedValue([[{id:8}]]);
 await expect(validateClientClosureReview(body,client,{clinicalDatabase})).rejects.toMatchObject({status:409});
});
it('creates the required note to-do in the same transaction and attributes its request to the actor',async()=>{
 const db={execute:vi.fn(async()=>[[{id:9}]])};
 await queueClientClosureNote(db,{client,actorUserId:6,providerId:9,review:{termination_note_required:true}});
 expect(mocks.create).toHaveBeenCalledWith(9,expect.objectContaining({clientId:5,agencyId:2,noteKind:'termination',requestedByUserId:6}),{executor:db});
});
it('does not create unnecessary to-dos or assign a note to an inactive provider',async()=>{
 const db={execute:vi.fn(async()=>[[]])};
 await queueClientClosureNote(db,{client,review:{termination_note_required:false}});expect(db.execute).not.toHaveBeenCalled();
 await expect(queueClientClosureNote(db,{client,providerId:9,review:{termination_note_required:true}})).rejects.toThrow('active provider');expect(mocks.create).not.toHaveBeenCalled();
});
