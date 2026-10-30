import { beforeEach, afterEach, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ find:vi.fn(), update:vi.fn(), complete:vi.fn(), transcript:vi.fn(), payroll:vi.fn(), telemetry:vi.fn(), access:vi.fn(), database:vi.fn(), summary:vi.fn(), pay:vi.fn() }));
vi.mock('../../config/database.js',()=>({default:{execute:m.database}}));
vi.mock('../../models/LearningClassSession.model.js',()=>({default:{findById:m.find,update:m.update,completeOnce:m.complete,updateWithJson:m.transcript}}));
vi.mock('../clinicalNoteCrypto.service.js',()=>({maybeEncryptNotePayload:value=>`encrypted:${value}`,maybeDecryptNotePayload:value=>value}));
vi.mock('../../models/LearningProgramClass.model.js',()=>({default:{}}));
vi.mock('../../models/LearningProgress.model.js',()=>({default:{}}));
vi.mock('../tutoringPayroll.service.js',()=>({createTutoringPayrollDraft:m.payroll}));
vi.mock('../tutoringTranscriptSummary.service.js',()=>({default:{triggerTutoringSessionSummary:m.summary}}));
vi.mock('../familyBillingPayment.service.js',()=>({payFamilyCharge:m.pay}));
vi.mock('../agents/agentRuntime.service.js',()=>({runAgentAssist:vi.fn()}));
vi.mock('../video.service.js',()=>({createOrGetRoom:vi.fn(),createOrGetRoomByUniqueName:vi.fn(),createAccessTokenAsync:vi.fn(),isVideoConfigured:()=>false}));
vi.mock('../stripePayments.service.js',()=>({default:{},isStripeConfigured:()=>true}));
vi.mock('../billingMerchantContext.service.js',()=>({default:{}}));
vi.mock('../tutoringOffice.service.js',()=>({tutoringOfficeDestination:vi.fn()}));
vi.mock('../inPersonTutoring.service.js',()=>({buildInPersonMaterialDownload:vi.fn(),buildInPersonTranscriptSummaryText:vi.fn(),createInPersonMaterial:vi.fn(),deleteInPersonMaterial:vi.fn(),duplicateInPersonPlanFromSession:vi.fn(),getInPersonMaterialFile:vi.fn(),getInPersonMaterialResponse:vi.fn(),getInPersonPlanPayload:vi.fn(),upsertInPersonMaterialResponse:vi.fn(),updateInPersonMaterial:vi.fn(),upsertInPersonPlan:vi.fn()}));
vi.mock('../../utils/learningClassAccess.js',()=>({assertLearningClassAccess:vi.fn(),assertLearningSessionAccess:m.access,canWriteEvidenceForClass:vi.fn(),listClassParticipantClientIds:vi.fn(),logClassSessionTelemetry:m.telemetry}));

import { completeLearningSession, startClassSession, getClassSessionVideoToken, triggerPostSessionCharge } from '../../controllers/learningClassSessions.controller.js';
const ended={id:90,status:'ended',ends_at:'2026-10-29 20:00:00',session_subtype:'tutoring',mode:'individual'};
let queued;
beforeEach(()=>{
 vi.clearAllMocks();queued=[];
 vi.spyOn(globalThis,'setImmediate').mockImplementation(callback=>{queued.push(callback);return 0;});
 m.find.mockResolvedValue(ended);
 m.update.mockResolvedValue(ended);
 m.complete.mockResolvedValue(true);
 m.payroll.mockResolvedValue({status:'submitted',claimIds:[1,2],units:4});
 m.telemetry.mockResolvedValue(undefined);
 m.summary.mockResolvedValue(undefined);
 m.pay.mockResolvedValue({paid:true});
});
const billableSession={...ended,organization_id:6,provider_user_id:20};
function billingRows({students=[{client_id:40}],profile={payment_policy:'POST_SESSION',session_rate_cents:4500},payers=[{guardian_user_id:50}]}={}) {
 m.database.mockImplementation(async sql=>{
  if(sql.includes('FROM learning_class_sessions'))return [students];
  if(sql.includes('FROM provider_tutoring_profiles'))return [[profile]];
  if(sql.includes('FROM client_billing_payers'))return [payers];
  if(sql.includes('INSERT INTO learning_session_charges'))return [{insertId:100}];
  throw new Error('Unexpected billing query');
 });
}
it('resolves the verified session agency/student and preserves the existing consent-gated payment path',async()=>{
 billingRows();await triggerPostSessionCharge(billableSession);
 expect(m.database.mock.calls.find(([q])=>q.includes('FROM learning_class_sessions'))[1]).toEqual([6,90,20,6,6]);
 expect(m.database.mock.calls.find(([q])=>q.includes('FROM client_billing_payers'))[1]).toEqual([40,6,4500]);
 expect(m.database.mock.calls.find(([q])=>q.includes('INSERT INTO learning_session_charges'))[1]).toEqual([6,40,50,4500,4500,'post_session:6:90',90]);
 expect(m.pay).toHaveBeenCalledWith({agencyId:6,userId:50,chargeId:100,automatic:true});
});
it.each([{payers:[]},{payers:[{guardian_user_id:50},{guardian_user_id:51}]},{profile:{payment_policy:'MANUAL',session_rate_cents:4500}},{profile:{payment_policy:'POST_SESSION',session_rate_cents:0}},{students:[]},{students:[{client_id:40},{client_id:41}]}])('does not create or collect a charge without one authorized student, payer and price: %j',async rows=>{
 billingRows(rows);await triggerPostSessionCharge(billableSession);
 expect(m.database.mock.calls.some(([q])=>q.includes('INSERT INTO learning_session_charges'))).toBe(false);
 expect(m.pay).not.toHaveBeenCalled();
});
it('does not borrow a different agency/client or a tutoring price for Homework Help',async()=>{
 billingRows();
 await triggerPostSessionCharge({...billableSession,agency_id:2});
 await triggerPostSessionCharge({...billableSession,client_id:99});
 await triggerPostSessionCharge({...billableSession,metadata_json:{learningServiceCode:'HOMEWORK HELP'}});
 expect(m.pay).not.toHaveBeenCalled();
});
afterEach(()=>vi.restoreAllMocks());

it('retries an ended session payroll failure without changing time, transcript, billing or homework',async()=>{
 m.payroll.mockRejectedValueOnce(new Error('Review tutor assignment'));
 expect(await completeLearningSession(90,20,'replacement transcript')).toMatchObject({session:ended,payrollDraft:null,payrollWarning:'Review tutor assignment'});
 expect(await completeLearningSession(90,20)).toMatchObject({payrollWarning:null,payrollDraft:{claimIds:[1,2]}});
 expect(m.payroll).toHaveBeenCalledTimes(2);
 expect(m.update).not.toHaveBeenCalled();expect(m.transcript).not.toHaveBeenCalled();expect(m.telemetry).not.toHaveBeenCalled();
 expect(queued).toHaveLength(0);
});
it('keeps Homework Help completion and payroll separate from a tutoring-price automatic charge',async()=>{
 const session={...ended,status:'live',metadata_json:{learningServiceCode:'HOMEWORK HELP'}};
 m.find.mockResolvedValueOnce(session).mockResolvedValueOnce({...session,status:'ended'});
 await completeLearningSession(90,20);
 expect(m.payroll).toHaveBeenCalledWith(90,20);
 expect(queued).toHaveLength(1);
 await queued[0]();
 expect(m.summary).toHaveBeenCalledWith(90);
 expect(m.database).not.toHaveBeenCalled();
});
it('preserves the existing tutoring completion tasks and reports payroll review errors',async()=>{
 const session={...ended,status:'live',metadata_json:{learningServiceCode:'TUTORING'}};
 m.find.mockResolvedValueOnce(session).mockResolvedValueOnce({...session,status:'ended'});
 m.payroll.mockRejectedValueOnce(new Error('Confirm actual time'));
 expect(await completeLearningSession(90,20)).toMatchObject({session:ended,payrollWarning:'Confirm actual time'});
 expect(queued).toHaveLength(2);
});
it('does not restart a completed visit and change the basis of an existing payroll submission',async()=>{
 m.access.mockResolvedValue({session:ended,canModerate:true});
 const response={status:vi.fn().mockReturnThis(),json:vi.fn()};
 await startClassSession({params:{sessionId:'90'},user:{id:20}},response,vi.fn());
 expect(response.status).toHaveBeenCalledWith(409);
 expect(m.update).not.toHaveBeenCalled();
});
it('atomically completes simultaneous browser/webhook requests once, keeping the first encrypted transcript and end time',async()=>{
 const {default:actualModel}=await vi.importActual('../../models/LearningClassSession.model.js');
 let row={...ended,status:'live',actual_started_at:'2026-10-29 19:00:00',metadata_json:{learningServiceCode:'TUTORING'}},reads=0;
 const initial={...row};
 m.find.mockImplementation(async()=>++reads<=2?{...initial}:{...row});
 m.complete.mockImplementation((id,patch)=>actualModel.completeOnce(id,patch));
 m.database.mockImplementation(async(sql,values)=>{
  expect(sql).toContain("WHERE id = ? AND status IN ('scheduled','live')");
  if(row.status==='ended')return [{affectedRows:0}];
  row={...row,status:'ended',ends_at:values[0],ended_by_user_id:values[1],transcript_text:values[2]};
  return [{affectedRows:1}];
 });
 const [first,second]=await Promise.all([completeLearningSession(90,20,'First record'),completeLearningSession(90,20,'Late retry record')]);
 expect(first.session.ends_at).toEqual(second.session.ends_at);
 expect(first.session.transcript_text).toBe('encrypted:First record');expect(second.session.transcript_text).toBe('encrypted:First record');
 expect(m.transcript).not.toHaveBeenCalled();expect(m.update).not.toHaveBeenCalled();
 expect(m.telemetry).toHaveBeenCalledTimes(1);expect(queued).toHaveLength(2);
 expect(m.payroll).toHaveBeenCalledTimes(2); // Both can retrieve the same idempotent draft.
 expect(m.pay).not.toHaveBeenCalled();
});
it('does not resurrect a completed visit when a previously authorized start request reaches the database late',async()=>{
 const {default:actualModel}=await vi.importActual('../../models/LearningClassSession.model.js');
 const saved={...ended,actual_started_at:'2026-10-29 19:00:00'};
 m.access.mockResolvedValue({session:{...saved,status:'scheduled',actual_started_at:null,delivery_context:'in_person'},canModerate:true});
 m.update.mockImplementation((...args)=>actualModel.update(...args));
 m.database.mockImplementation(async sql=>{
  if(sql.startsWith('UPDATE')){
   expect(sql).toContain("AND status IN ('scheduled','live')");
   expect(sql).toContain('actual_started_at = COALESCE(actual_started_at, ?)');
   return [{affectedRows:0}];
  }
  return [[saved]];
 });
 const response={status:vi.fn().mockReturnThis(),json:vi.fn()},next=vi.fn();
 await startClassSession({params:{sessionId:'90'},user:{id:20}},response,next);
 expect(response.status).toHaveBeenCalledWith(409);expect(next).not.toHaveBeenCalled();expect(m.telemetry).not.toHaveBeenCalled();
 expect(m.update).toHaveBeenCalledWith(90,expect.any(Object),{activeOnly:true});
});
it('does not issue a new video join for an ended session',async()=>{
 m.access.mockResolvedValue({session:ended,actorRole:'presenter'});
 const response={status:vi.fn().mockReturnThis(),json:vi.fn()};
 await getClassSessionVideoToken({params:{sessionId:'90'},user:{id:20}},response,vi.fn());
 expect(response.status).toHaveBeenCalledWith(409);expect(m.update).not.toHaveBeenCalled();
});
