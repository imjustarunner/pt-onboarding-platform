import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildFeedbackEntries,validateFeedback,createSupportReplyFeedbackService} from '../supportReplyFeedback.service.js';
const row=()=>({ticketId:8,subject:'Schedule',originalReceived:{body:'Seed'},draftSnapshots:[{id:10,body:'Draft one',readable:true,originalReceived:{body:'Question one',fromEmail:'first@example.test'}},{id:11,body:'Draft two',readable:true,originalReceived:{body:'Question two'}}],deliveries:[{id:20,status:'sent',body:'Reply one',draftSnapshotId:10,actorName:'Alex',originalReceived:{body:'Question one'}},{id:21,status:'sent',body:'Reply two',originalReceived:{body:'Question two'}}]});
test('each reply retains its own sender, draft, and body, while an unused draft gets its own item',()=>{
 const entries=buildFeedbackEntries({rows:[row()]});assert.equal(entries.length,3);
 assert.equal(entries[0].originalReceived.fromEmail,'first@example.test');assert.equal(entries[0].comparison.generatedDraft,'Draft one');assert.equal(entries[0].deliveries[0].actorName,'Alex');
 assert.equal(entries[1].originalReceived.body,'Question two');assert.equal(entries[1].canRateDraft,false);assert.equal(entries[1].comparison.generatedDraft,null);
 assert.equal(entries[2].comparison.generatedDraft,'Draft two');assert.equal(entries[2].canRateActual,false);
});
test('failed, queued, or unreadable evidence never becomes a rateable sent reply or invented draft',()=>{
 const r=row();r.deliveries=[{id:30,status:'failed',body:'Unsent'},{id:31,status:'queued',body:'Queued'}];r.draftSnapshots=[{id:12,readable:false,body:null}];
 assert.equal(buildFeedbackEntries({rows:[r]}).length,0);
});
test('valid feedback preserves prose and enforces ratings and bounded text',()=>{
 const evidence={canRateActual:true,canRateDraft:false};
 assert.deepEqual(validateFeedback({actualRating:'acceptable',notes:'  Include a next step. ',preferredReply:'Hello',revision:0},evidence),{actualRating:'acceptable',draftRating:null,notes:'Include a next step.',preferredReply:'Hello'});
 for(const input of [{draftRating:'good',revision:0},{actualRating:'excellent',revision:0},{notes:'a'.repeat(12001),revision:0},{revision:0},{notes:'Note',revision:-1}])assert.throws(()=>validateFeedback(input,evidence));
});
test('cross-agency and unauthorized saves stop before feedback or evidence is exposed',async()=>{
 let reads=0;const denied=createSupportReplyFeedbackService({db:{execute:async()=>{reads++;throw Error('should not read');}},review:{authorize:async()=>{throw Object.assign(Error('Denied'),{status:403});}}});
 await assert.rejects(denied.getBatch({user:{id:3},agencyId:99,batchId:1}),{status:403});assert.equal(reads,0);
 const db={execute:async(sql)=>sql.includes('FROM support_reply_review_batches')?[[{id:1,reviewer_user_id:507}]]:assert.fail('must not read entries')};
 const service=createSupportReplyFeedbackService({db,review:{authorize:async()=>({})}});
 await assert.rejects(service.saveFeedback({user:{id:501,role:'super_admin'},agencyId:2,batchId:1,entryId:1,input:{}}),{status:403});
});
test('stale feedback returns a conflict without pretending it was saved',async()=>{
 const db={execute:async sql=>sql.includes('FROM support_reply_review_batches')?[[{id:1,reviewer_user_id:507}]]:sql.startsWith('SELECT * FROM support_reply_review_entries')?[[{evidence_encrypted:{canRateActual:true,canRateDraft:false}}]]:[{affectedRows:0}]};
 const service=createSupportReplyFeedbackService({db,review:{authorize:async()=>({})},encrypt:JSON.parse,decrypt:JSON.stringify});
 await assert.rejects(service.saveFeedback({user:{id:507,role:'admin'},agencyId:2,batchId:1,entryId:1,input:{actualRating:'good',revision:0}}),{status:409,code:'support_review_feedback_conflict'});
});
