import {assertClientDiagnosisPolicy} from '../../services/clinicalDiagnosisPolicy.service.js';
vi.mock('../../services/clinicalDiagnosisPolicy.service.js',()=>({assertClientDiagnosisPolicy:vi.fn(async()=>({ready:true})),listClientDiagnosisAlerts:vi.fn(async()=>[])}));
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(()=>({ execute:vi.fn(),clinical:vi.fn(),access:vi.fn(),draft:vi.fn(),update:vi.fn(),reopen:vi.fn(),client:vi.fn(),status:vi.fn(),history:vi.fn(),plan:vi.fn(),planById:vi.fn(),audit:vi.fn() }));
vi.mock('../../config/database.js',()=>({default:{execute:mocks.execute,getConnection:async()=>({execute:async(sql)=>sql.includes('GET_LOCK')?[[{acquired:1}]]:[[]],release:vi.fn()})},onTableWrite:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:mocks.clinical}}));
vi.mock('../../services/clientRecordAccess.service.js',()=>({resolveClientRecordAccess:mocks.access,providerHasAssignedClientAccess:vi.fn()}));
vi.mock('../../services/clinicalNoteCrypto.service.js',()=>({maybeDecryptNotePayload:value=>value,maybeEncryptNotePayload:value=>value}));
vi.mock('../../models/Client.model.js',()=>({default:{findById:mocks.client}}));
vi.mock('../../models/ClientIntakeNoteDraft.model.js',()=>({default:{findForClient:mocks.draft,listSummariesForClient:mocks.history,updateContent:mocks.update,reopenForReplace:mocks.reopen,updateStatus:mocks.status}}));
vi.mock('../../models/clinical/ClinicalTreatmentPlan.model.js',()=>({default:{listByClient:mocks.plan,findById:mocks.planById}}));
vi.mock('../../models/AdminAuditLog.model.js',()=>({default:{logAction:mocks.audit}}));
vi.mock('../../services/noteAidChartAudit.service.js',()=>({logNoteAidChartEvent:vi.fn()}));
vi.mock('../../services/clientAccessLog.service.js',()=>({logClientAccess:vi.fn()}));
vi.mock('../../services/intakeResponsesEncryption.service.js',async importOriginal=>({...await importOriginal(),decryptIntakeSubmissionRows:vi.fn(),isIntakeResponsesEncryptionConfigured:()=>false}));
vi.mock('../../models/AgencyIntakeFieldTemplate.model.js',()=>({default:{listByAgency:vi.fn(async()=>[])}}));
vi.mock('../publicIntake.controller.js',()=>({buildClinicalSummaryText:vi.fn(),buildIntakeAnswersText:vi.fn()}));
import { getClientClinicalResponses } from '../client.controller.js';
import { getClientIntakeNote, finalizeClientIntakeNote } from '../clientIntakeNote.controller.js';
import { intakeDraftReview } from '../../services/intakeDraftReview.service.js';
const response=()=>({status:vi.fn().mockReturnThis(),json:vi.fn()});
const row={id:1,agency_id:450,client_id:2304,provider_user_id:1433,service_code:'90791',status:'ready',scrubbed_input_enc:'Guardian reports difficulty sleeping.',note_body_enc:'Draft',note_sections_json_enc:JSON.stringify([{key:'mse',label:'MSE',body:'Not assessed.'}])};
beforeEach(()=>{
 vi.clearAllMocks();mocks.clinical.mockResolvedValue([[]]);mocks.client.mockResolvedValue({id:2304,agency_id:450});
 mocks.access.mockResolvedValue({ok:true,client:{id:2304,agency_id:450,client_type:'clinical'}});
 mocks.draft.mockResolvedValue({...row});mocks.history.mockResolvedValue([]);
 mocks.execute.mockImplementation(async sql=>{
  if(sql.includes('SELECT DISTINCT s.id'))return [[{id:10,intake_link_id:null,intake_data:JSON.stringify({responses:{submission:{clinicalResponses:{presenting_problem:'Full synthetic response.',question_zero:0,question_false:false}}}}),submitted_at:'2026-11-02T17:00:00Z'}]];
  return [[]];
 });
});
it('merges stored clinical answers with templates without the const-assignment crash',async()=>{
 const res=response(),next=vi.fn();await getClientClinicalResponses({params:{id:'2304'},query:{},user:{id:1,role:'super_admin'}},res,next);
 expect(next).not.toHaveBeenCalled();const result=res.json.mock.calls[0][0];expect(result.templateMode).toBe(true);
 const fields=result.sections.flatMap(s=>s.fields);expect(fields.find(f=>f.key==='presenting_problem').value).toBe('Full synthetic response.');
 expect(fields.find(f=>f.key==='question_zero').value).toBe('0');expect(fields.find(f=>f.key==='question_false').value).toBe('false');
});
it('keeps access-denied clinical responses denied',async()=>{
 mocks.access.mockResolvedValue({ok:false,status:403,message:'Access denied'});const res=response();await getClientClinicalResponses({params:{id:'2304'},query:{},user:{id:1,role:'provider'}},res,vi.fn());
 expect(res.status).toHaveBeenCalledWith(403);expect(mocks.execute).not.toHaveBeenCalled();
});
it.each(['ready','final'])('rejects unreviewed %s finalization before modifying a draft or signed record',async status=>{
 mocks.draft.mockResolvedValue({...row,status});const res=response(),next=vi.fn();await finalizeClientIntakeNote({params:{id:'2304',draftId:'1'},query:{},body:{replace:status==='final'},user:{id:1,role:'super_admin'}},res,next);
 expect(next).not.toHaveBeenCalled();expect(res.status).toHaveBeenCalledWith(409);expect(res.json.mock.calls[0][0].error.code).toBe('INTAKE_SOURCE_REVIEW_REQUIRED');expect(mocks.update).not.toHaveBeenCalled();expect(mocks.reopen).not.toHaveBeenCalled();
});
it('rejects a selected appointment outside the scoped options before any writes',async()=>{
 const sections=JSON.parse(row.note_sections_json_enc);const res=response(),next=vi.fn();await finalizeClientIntakeNote({params:{id:'2304',draftId:'1'},query:{},body:{sourceReview:{fingerprint:intakeDraftReview(row,sections).fingerprint,sectionKeys:['mse'],sourceCompared:true,unsupportedClaimsRemoved:true,appointmentReviewed:true,clinicalSessionId:999}},user:{id:1,role:'super_admin'}},res,next);
 expect(next).not.toHaveBeenCalled();expect(res.status).toHaveBeenCalledWith(409);expect(res.json.mock.calls[0][0].error.code).toBe('INTAKE_APPOINTMENT_REVIEW_REQUIRED');expect(mocks.update).not.toHaveBeenCalled();
 expect(mocks.clinical.mock.calls[0][1]).toEqual([450,2304,'90791',1433]);
});

it('finalizes only after review and stores the matching appointment with actor evidence',async()=>{
 const sections=JSON.parse(row.note_sections_json_enc);mocks.clinical.mockResolvedValue([[{id:77,appointment_id:135,office_event_id:null,scheduled_start_at:'2026-11-03T23:00:00Z',source_timezone:'America/Denver',service_code:'90791'}]]);
 mocks.plan.mockResolvedValue([{id:55,status:'active',source_tool_id:'note_aid_plan_import'}]);mocks.planById.mockResolvedValue({id:55,status:'active',primary_diagnosis_id:null});
 mocks.status.mockResolvedValue({...row,status:'final'});const res=response(),next=vi.fn();
 const sourceReview={fingerprint:intakeDraftReview(row,sections).fingerprint,sectionKeys:['mse'],sourceCompared:true,unsupportedClaimsRemoved:true,appointmentReviewed:true,clinicalSessionId:77};
 await finalizeClientIntakeNote({params:{id:'2304',draftId:'1'},query:{},body:{sourceReview},user:{id:1,role:'super_admin'}},res,next);
 expect(next).not.toHaveBeenCalled();expect(res.status).not.toHaveBeenCalled();expect(res.json.mock.calls[0][0].draft.status).toBe('final');
 const saved=JSON.parse(mocks.update.mock.calls[0][0].sessionContextEnc);expect(saved).toMatchObject({clinicalSessionId:77,appointmentId:135,sourceReview:{fingerprint:sourceReview.fingerprint,sectionKeys:['mse'],reviewedByUserId:1,appointmentReviewed:true,sourceCompared:true,unsupportedClaimsRemoved:true}});
 expect(saved.sourceReview.reviewedAt).toBeTruthy();expect(mocks.status).toHaveBeenCalledWith(expect.objectContaining({draftId:1,status:'final',treatmentPlanId:55}));
});

it('keeps the draft readable when appointment lookup fails and blocks finalization before writes',async()=>{
 mocks.clinical.mockRejectedValue(Object.assign(new Error('unavailable'),{code:'ECONNREFUSED'}));const res=response(),next=vi.fn();vi.spyOn(console,'warn').mockImplementation(()=>{});
 await getClientIntakeNote({params:{id:'2304'},query:{draftId:'1'},user:{id:1,role:'super_admin'}},res,next);
 expect(next).not.toHaveBeenCalled();expect(res.json).toHaveBeenCalledWith(expect.objectContaining({draft:expect.objectContaining({id:1}),appointmentOptions:[],appointmentOptionsUnavailable:true}));
 const sections=JSON.parse(row.note_sections_json_enc);const finalizeResponse=response();
 await finalizeClientIntakeNote({params:{id:'2304',draftId:'1'},query:{},body:{sourceReview:{fingerprint:intakeDraftReview(row,sections).fingerprint,sectionKeys:['mse'],sourceCompared:true,unsupportedClaimsRemoved:true,appointmentReviewed:true}},user:{id:1,role:'super_admin'}},finalizeResponse,next);
 expect(next).not.toHaveBeenCalled();expect(finalizeResponse.status).toHaveBeenCalledWith(503);expect(mocks.update).not.toHaveBeenCalled();
});

it('requires diagnosis review before finalizing the intake snapshot',async()=>{assertClientDiagnosisPolicy.mockRejectedValueOnce(Object.assign(new Error('Each diagnosis requires justification'),{status:409,code:'DIAGNOSIS_REVIEW_REQUIRED'}));mocks.plan.mockResolvedValue([{id:55,status:'active',source_tool_id:'note_aid_plan_import'}]);mocks.planById.mockResolvedValue({id:55,status:'active'});const sections=JSON.parse(row.note_sections_json_enc),next=vi.fn();await finalizeClientIntakeNote({params:{id:'2304',draftId:'1'},query:{},body:{sourceReview:{fingerprint:intakeDraftReview(row,sections).fingerprint,sectionKeys:['mse'],sourceCompared:true,unsupportedClaimsRemoved:true,appointmentReviewed:true}},user:{id:1,role:'super_admin'}},response(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({code:'DIAGNOSIS_REVIEW_REQUIRED'}));expect(mocks.status).not.toHaveBeenCalled();expect(mocks.update).not.toHaveBeenCalled();});
