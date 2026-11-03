import { beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn(),connection:vi.fn(),clinical:vi.fn(),access:vi.fn(),client:vi.fn(),plan:vi.fn(),planById:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:mocks.execute,getConnection:mocks.connection},onTableWrite:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:mocks.clinical}}));
vi.mock('../../services/clientRecordAccess.service.js',()=>({resolveClientRecordAccess:mocks.access,providerHasAssignedClientAccess:vi.fn()}));
vi.mock('../../services/clinicalNoteCrypto.service.js',()=>({maybeDecryptNotePayload:v=>v,maybeEncryptNotePayload:v=>v}));
vi.mock('../../models/Client.model.js',()=>({default:{findById:mocks.client}}));
vi.mock('../../models/clinical/ClinicalTreatmentPlan.model.js',()=>({default:{listByClient:mocks.plan,findById:mocks.planById}}));
vi.mock('../../models/AdminAuditLog.model.js',()=>({default:{logAction:vi.fn()}}));
vi.mock('../../services/noteAidChartAudit.service.js',()=>({logNoteAidChartEvent:vi.fn()}));
vi.mock('../../services/clientAccessLog.service.js',()=>({logClientAccess:vi.fn()}));
vi.mock('../publicIntake.controller.js',()=>({buildClinicalSummaryText:vi.fn(),buildIntakeAnswersText:vi.fn()}));
import { finalizeClientIntakeNote } from '../clientIntakeNote.controller.js';
import Draft from '../../models/ClientIntakeNoteDraft.model.js';
import { intakeDraftReview } from '../../services/intakeDraftReview.service.js';
import { withIntakeDraftMutationLock } from '../../services/intakeDraftMutationLock.service.js';
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return{promise,resolve}};
const response=()=>({status:vi.fn().mockReturnThis(),json:vi.fn()});
let row, owner, queue, waiting, released, writeCalls;
beforeEach(()=>{
 vi.clearAllMocks();owner=null;queue=[];waiting=deferred();released=[];writeCalls=[];
 row={id:1,client_id:2304,agency_id:450,provider_user_id:1433,service_code:'90791',status:'ready',scrubbed_input_enc:'Guardian reports sleep concerns.',note_body_enc:'Reviewed note',note_sections_json_enc:JSON.stringify([{key:'mse',label:'MSE',body:'Not assessed.'}])};
 mocks.client.mockResolvedValue({id:2304,agency_id:450});mocks.access.mockResolvedValue({ok:true});
 mocks.plan.mockResolvedValue([{id:55,status:'active',source_tool_id:'note_aid_plan_import'}]);mocks.planById.mockResolvedValue({id:55,status:'active'});
 mocks.clinical.mockResolvedValue([[]]);
 mocks.execute.mockImplementation(async(sql,values=[])=>{
  if(sql.startsWith('SELECT * FROM client_intake_note_drafts'))return [[{...row}]];
  if(sql.startsWith('UPDATE client_intake_note_drafts')){
   writeCalls.push({sql,values});
   const fields=[...sql.split(' WHERE ')[0].matchAll(/(\w+) = \?/g)].map(m=>m[1]);fields.forEach((field,i)=>{row[field]=values[i]});return [{affectedRows:1}];
  }
  return [[]];
 });
 mocks.connection.mockImplementation(async()=>{
  const connection={release:vi.fn(()=>released.push(connection))};
  connection.execute=vi.fn(async(sql,values)=>{
   if(sql.includes('GET_LOCK')){
    if(owner){const turn=deferred();queue.push({connection,turn});waiting.resolve();await turn.promise;}
    owner=connection;return [[{acquired:1}]];
   }
   if(sql.includes('RELEASE_LOCK')){expect(owner).toBe(connection);owner=null;queue.shift()?.turn.resolve();return [[{released:1}]];}
   return mocks.execute(sql,values);
  });return connection;
 });
});
function request(){return {params:{id:'2304',draftId:'1'},query:{},user:{id:1433,role:'super_admin'},body:{sourceReview:{fingerprint:intakeDraftReview(row,JSON.parse(row.note_sections_json_enc)).fingerprint,sectionKeys:['mse'],sourceCompared:true,unsupportedClaimsRemoved:true,appointmentReviewed:true}}};}
it('serializes an interleaved section/regeneration write behind the real finalizer and rejects it after finalization',async()=>{
 const lookup=deferred(),entered=deferred();mocks.clinical.mockImplementation(async()=>{entered.resolve();return lookup.promise});
 const res=response(),next=vi.fn();const finalize=finalizeClientIntakeNote(request(),res,next);await entered.promise;
 const edit=Draft.updateContent({draftId:1,noteBodyEnc:'UNREVIEWED CONCURRENT TEXT',status:'ready'}).catch(error=>error);
 await waiting.promise;expect(writeCalls).toHaveLength(0);expect(mocks.plan).not.toHaveBeenCalled();
 lookup.resolve([[]]);await finalize;const rejected=await edit;
 expect(next).not.toHaveBeenCalled();expect(res.json.mock.calls[0][0].draft.status).toBe('final');expect(rejected.status).toBe(409);
 expect(row.note_body_enc).toBe('Reviewed note');expect(row.status).toBe('final');expect(released).toHaveLength(2);expect(owner).toBeNull();
});
it('takes the current snapshot after a competing edit, rejecting a stale review before treatment-plan side effects',async()=>{
 const held=deferred(),entered=deferred();const staleRequest=request();
 const edit=withIntakeDraftMutationLock(1,async()=>{entered.resolve();await held.promise;await Draft.updateContent({draftId:1,noteBodyEnc:'New content needing review'})});await entered.promise;
 const res=response(),next=vi.fn();const finalize=finalizeClientIntakeNote(staleRequest,res,next);await waiting.promise;
 held.resolve();await edit;await finalize;
 expect(next).not.toHaveBeenCalled();expect(res.status).toHaveBeenCalledWith(409);expect(res.json.mock.calls[0][0].error.code).toBe('INTAKE_SOURCE_REVIEW_REQUIRED');
 expect(row.status).toBe('ready');expect(mocks.plan).not.toHaveBeenCalled();expect(mocks.clinical).not.toHaveBeenCalled();expect(owner).toBeNull();
});
it('rejects a late diagnosis/status update on a finalized draft',async()=>{
 row.status='final';await expect(Draft.updateStatus({draftId:1,status:'ready',confirmedDxJson:'changed'})).rejects.toMatchObject({status:409});
 expect(writeCalls).toHaveLength(0);expect(owner).toBeNull();
});
it('releases the lock connection on failure and reports a busy draft without mutating',async()=>{
 await expect(withIntakeDraftMutationLock(1,async()=>{throw new Error('review failed')})).rejects.toThrow('review failed');expect(owner).toBeNull();expect(released).toHaveLength(1);
 const release=vi.fn();mocks.connection.mockResolvedValue({execute:vi.fn(async()=>[[{acquired:0}]]),release});const operation=vi.fn();
 await expect(withIntakeDraftMutationLock(1,operation)).rejects.toMatchObject({status:409,code:'INTAKE_DRAFT_BUSY'});expect(operation).not.toHaveBeenCalled();expect(release).toHaveBeenCalled();
});
it('bounds reserved lock connections and rejects cross-draft nesting without acquiring another connection', async () => {
 const held = deferred();
 const release = vi.fn();
 mocks.connection.mockResolvedValue({ execute: vi.fn(async () => [[{ acquired: 1 }]]), release });
 const locks = [1, 2, 3, 4].map(id => withIntakeDraftMutationLock(id, () => held.promise));
 await Promise.resolve();
 await expect(withIntakeDraftMutationLock(5, vi.fn())).rejects.toMatchObject({ code: 'INTAKE_DRAFT_BUSY' });
 expect(mocks.connection).toHaveBeenCalledTimes(4);
 held.resolve(); await Promise.all(locks);
 await withIntakeDraftMutationLock(1, async () => {
  await expect(withIntakeDraftMutationLock(2, vi.fn())).rejects.toMatchObject({ code: 'INTAKE_DRAFT_BUSY' });
 });
 expect(mocks.connection).toHaveBeenCalledTimes(5); expect(release).toHaveBeenCalledTimes(5);
});
it('destroys an uncertain lock connection without masking the operation error', async () => {
 const destroy = vi.fn(), release = vi.fn(), error = new Error('original failure');
 const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
 mocks.connection.mockResolvedValue({ execute: vi.fn(async sql => {
  if (sql.includes('RELEASE_LOCK')) throw new Error('connection lost');
  return [[{ acquired: 1 }]];
 }), destroy, release });
 await expect(withIntakeDraftMutationLock(1, async () => { throw error; })).rejects.toBe(error);
 expect(destroy).toHaveBeenCalledOnce(); expect(release).not.toHaveBeenCalled(); logged.mockRestore();
});
