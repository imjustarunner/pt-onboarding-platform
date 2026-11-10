import {beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../models/Task.model.js',()=>({default:{create:vi.fn()}}));
vi.mock('../taskDescriptionEncryption.service.js',()=>({ENCRYPTED_TASK_DESCRIPTION_PLACEHOLDER:'[encrypted]',encryptTaskDescriptionText:vi.fn(()=>({ciphertextB64:'cipher',ivB64:'iv',authTagB64:'tag',keyId:'v1'}))}));
import {encryptTaskDescriptionText} from '../taskDescriptionEncryption.service.js';
import {processAutomaticClaim,runDailyClaimAutomation,claimAutomationDay,queueAutomaticClaimIssue} from '../dailyClaimAutomation.service.js';
const input={agencyId:2,claimId:3,user:{id:501,role:'super_admin'},connection:{mode:'live'}};
const prepared=()=>({claim:{id:3,claim_lifecycle:'ready'},readiness:{ready:true,blockers:[]},aiReview:{status:'passed',findings:[]},documentation:{note:{provider_signed_at:'2026-11-01'}},payload:{},reviewHash:'a'.repeat(64),sourceHash:'source',insurance:{}});
const deps=()=>({prepare:vi.fn(async()=>prepared()),review:vi.fn(),submit:vi.fn(async(req,res)=>res.json({accepted:true}))});
describe('daily claim review',()=>{
 it('gives billing staff actual exceptions while keeping the automatic AI step out of their manual checklist',async()=>{
  const db={execute:vi.fn(async sql=>sql.startsWith('SELECT id FROM tasks')?[[{id:2407}]]:[{affectedRows:1}])};
  await queueAutomaticClaimIssue({agencyId:2,claimId:3,clientId:8,userId:501,taskListId:16,blockers:['Member ID is missing','Run the AI content and claim consistency review']},db);
  const text=encryptTaskDescriptionText.mock.calls.at(-1)[0];expect(text).toContain('• Member ID is missing');expect(text).toContain('AI consistency review runs automatically');expect(text).not.toContain('Run the AI content and claim consistency review');expect(text).not.toContain('submit manually');
 });
 it('automatically checks signed drafts and moves a passing draft to the ready workflow without submitting',async()=>{
  const d=deps(),p=prepared();p.claim.claim_lifecycle='draft';p.claim.billing_revision=4;d.prepare.mockResolvedValue(p);d.clinical={execute:vi.fn(async()=>[{affectedRows:1}])};
  expect(await processAutomaticClaim(input,d)).toEqual({status:'ready',blockers:[]});
  expect(d.clinical.execute).toHaveBeenCalledWith(expect.stringContaining("claim_lifecycle='ready'"),[3,2,4]);expect(d.submit).not.toHaveBeenCalled();
 });
 it('waits for the clinician signature without creating a manual AI review task or signing anything',async()=>{
  const d=deps(),p=prepared();p.claim.claim_lifecycle='draft';p.documentation.note.provider_signed_at=null;d.prepare.mockResolvedValue(p);
  expect(await processAutomaticClaim(input,d)).toEqual({status:'awaiting_signatures',blockers:[]});expect(d.review).not.toHaveBeenCalled();expect(d.submit).not.toHaveBeenCalled();
 });
 it('runs missing AI review automatically and rereads the exact current readiness',async()=>{
  const d=deps(),first=prepared();first.aiReview.status='required';d.prepare.mockResolvedValueOnce(first).mockResolvedValueOnce(prepared());
  expect(await processAutomaticClaim(input,d)).toEqual({status:'ready',blockers:[]});
  expect(d.review).toHaveBeenCalledWith(expect.objectContaining({agencyId:2,claimId:3,actorUserId:501,sourceHash:'source'}));
  expect(d.prepare).toHaveBeenCalledTimes(2);
  expect(d.submit).not.toHaveBeenCalled();
 });
 it('never submits a claim during daily automatic review',async()=>{
  const d=deps();expect(await processAutomaticClaim({...input,allowSubmission:true},d)).toEqual({status:'ready',blockers:[]});
  expect(d.submit).not.toHaveBeenCalled();
 });
 it.each(['consent review missing','Insurance identity mismatch','Supervisor signature required'])('holds %s without transmitting',async(message)=>{
  const d=deps(),p=prepared();p.readiness={ready:false,blockers:[message]};d.prepare.mockResolvedValue(p);
  expect(await processAutomaticClaim(input,d)).toEqual({status:'held',blockers:[message]});expect(d.submit).not.toHaveBeenCalled();
 });
 it('holds AI warnings and never treats missing review or unsigned notes as ready',async()=>{
  const d=deps(),p=prepared();p.aiReview.findings=[{severity:'warning',message:'Verify service location'}];d.prepare.mockResolvedValue(p);
  expect((await processAutomaticClaim(input,d)).status).toBe('held');expect(d.submit).not.toHaveBeenCalled();
  p.aiReview={status:'required'};p.documentation.note.provider_signed_at=null;p.readiness={ready:false,blockers:['Sign note']};
  await processAutomaticClaim(input,d);expect(d.review).not.toHaveBeenCalled();expect(d.submit).not.toHaveBeenCalled();
 });
 it.each(['queued','submitted','rejected'])('does not repeat a %s claim',async(lifecycle)=>{
  const d=deps(),p=prepared();p.claim.claim_lifecycle=lifecycle;d.prepare.mockResolvedValue(p);
  expect((await processAutomaticClaim(input,d)).status).toBe('skipped');expect(d.submit).not.toHaveBeenCalled();
 });
 it('uses Denver calendar days',()=>expect(claimAutomationDay(new Date('2026-11-10T03:00:00Z'))).toBe('2026-11-09'));
 it.each([2,6,377])('makes one durable pass for agency %i and flags held claims',async(agencyId)=>{
  const release=vi.fn(),execute=vi.fn(async(sql)=>sql.includes('GET_LOCK')?[[{acquired:1}]]:[[]]);
  const db={getConnection:async()=>({execute,release}),execute:vi.fn(async(sql)=>{
   if(sql.startsWith('SELECT id,feature_flags'))return [[{id:agencyId,feature_flags:{medicalBillingEnabled:true,dailyClaimAutomation:{enabled:true,approvedByUserId:501},insuranceVerificationTasks:{taskListId:16}}}]];
   if(sql.startsWith('SELECT * FROM agency_claim'))return [[{status:'processing',last_claim_id:0}]];
   return [{affectedRows:1}];
  })};
  const d={db,clinical:{execute:vi.fn(async()=>[[{id:3,client_id:8}]])},user:async()=>({id:501,role:'super_admin',is_active:1}),allowed:async()=>true,liveAgency:vi.fn(),connection:async()=>({mode:'live'}),syncAudience:vi.fn(),process:vi.fn(async()=>({status:'held',blockers:['Verify coverage']})),queueIssue:vi.fn(),now:new Date('2026-11-09T18:00:00Z')};
  expect(await runDailyClaimAutomation(d)).toEqual([{agencyId,claimId:3,status:'held'}]);
  expect(d.queueIssue).toHaveBeenCalledWith(expect.objectContaining({agencyId,claimId:3,taskListId:16}),db);expect(release).toHaveBeenCalledOnce();
  expect(d.clinical.execute.mock.calls[0][0]).toContain("claim_lifecycle IN ('draft','ready')");
  db.execute.mockImplementation(async(sql)=>sql.startsWith('SELECT id,feature_flags')?[[{id:agencyId,feature_flags:{medicalBillingEnabled:true,dailyClaimAutomation:{enabled:true,approvedByUserId:501},insuranceVerificationTasks:{taskListId:16}}}]]:sql.startsWith('SELECT * FROM agency_claim')?[[{status:'completed'}]]:[{}]);
  d.process.mockClear();await runDailyClaimAutomation(d);expect(d.process).not.toHaveBeenCalled();
 });
});
