import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({load:vi.fn(),clinical:vi.fn(),main:vi.fn(),access:vi.fn(),audit:vi.fn(),model:vi.fn(),guidance:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.main}}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:m.clinical}}));
vi.mock('../noteAidIntakeSources.service.js',()=>({buildClinicalIntakeSourceContext:vi.fn(async()=>({contextText:'Synthetic enrollment clinical facts.'}))}));
vi.mock('../narrivaSource.service.js',()=>({loadNarrivaSource:m.load}));
vi.mock('../narrivaGuidance.service.js',()=>({loadNarrivaGuidanceContext:m.guidance}));
vi.mock('../narrivaAccess.service.js',()=>({requireNarrivaClient:m.access,positiveId:value=>Number(value)||null,narrivaError:(status,message)=>Object.assign(new Error(message),{status})}));
vi.mock('../clinicalNoteCrypto.service.js',()=>({maybeEncryptNotePayload:text=>'encrypted:'+text,maybeDecryptNotePayload:text=>String(text).replace(/^encrypted:/,'')}));
vi.mock('../sessionAiPrivacy.service.js',()=>({createSessionPrivacyContext:()=>({synthetic:true}),callPrivateSessionText:m.model}));
vi.mock('../narrivaInputPrivacy.service.js',()=>({requireNarrivaIdentifierCorrection:vi.fn()}));
vi.mock('../noteAidChartAudit.service.js',()=>({logNoteAidChartEvent:m.audit}));
import {validateCriteriaEvidence,reviewNarrivaDiagnosticCriteria,listNarrivaDiagnosticCriteria} from '../narrivaDiagnosticCriteria.service.js';
import {diagnosticCriteriaStatus} from '../../../../frontend/src/utils/diagnosticCriteriaReview.js';
let source;
beforeEach(()=>{
 vi.clearAllMocks();m.access.mockResolvedValue(undefined);source={agencyId:2,draftId:31,source:{clinical_session_id:21,created_by_user_id:7},client:{id:12},inputText:'The caregiver described repeated symptom episodes over several months.',identifiers:[],confirmedClinicalContext:{diagnoses:[{code:'F41.1',justification:'Reported symptoms and functional impact.'}]}};
 m.load.mockResolvedValue(source);m.guidance.mockResolvedValue({guidance:'Author guidance without a complete licensed criteria reference.',guidanceHash:'training-revision'});m.model.mockResolvedValue({text:'{"criteria":[]}'});m.clinical.mockResolvedValue([{insertId:81}]);m.main.mockResolvedValue([[]]);
});
it('does not turn invented criteria or unsupported clinical assertions into checked symptoms',()=>{
 const rows=validateCriteriaEvidence({criteria:[{id:'fabricated',label:'Wrong reference',kind:'symptom',sourceQuote:'A fabricated criterion that was not supplied.',supported:true,evidenceQuote:source.inputText}]},{guidance:'Real authored guidance.',evidence:source.inputText});expect(rows).toEqual([]);
 const [item]=validateCriteriaEvidence({criteria:[{id:'one',label:'A paraphrased criterion',kind:'symptom',sourceQuote:'A sufficiently long synthetic reference criterion.',supported:true,evidenceQuote:'An invented clinical event never reported.'}]},{guidance:'A sufficiently long synthetic reference criterion.',evidence:source.inputText});expect(item.status).toBe('unconfirmed');
});
it('requires frequency and duration evidence as well as a symptom minimum',()=>{
 const criteria=[{id:'a',group:'symptoms',kind:'symptom',status:'present',minimum:1,thresholdSourceValid:true},{id:'duration',kind:'duration',status:'present',duration:'',minimum:1,thresholdSourceValid:true}];
 expect(diagnosticCriteriaStatus(criteria).status).toBe('incomplete');criteria[1].duration='The assessed interval';expect(diagnosticCriteriaStatus(criteria).status).toBe('supported');
 criteria.push({id:'unknown',kind:'exclusion',status:'unconfirmed',minimum:null,thresholdSourceValid:false});expect(diagnosticCriteriaStatus(criteria).status).toBe('incomplete');
});
it('uses verified individual requirements and leaves conflicting minimums unconfirmed',()=>{
 const criteria=[
  {id:'a',group:'symptoms',kind:'symptom',status:'present',minimum:1,thresholdSourceValid:true},
  {id:'b',group:'symptoms',kind:'symptom',status:'present',minimum:2,thresholdSourceValid:true},
  {id:'impact',kind:'impairment',status:'present',sourceHash:'verified-reference'}
 ];
 expect(diagnosticCriteriaStatus(criteria)).toMatchObject({status:'incomplete',present:1,required:1});
 criteria[1].minimum=1;
 expect(diagnosticCriteriaStatus(criteria)).toMatchObject({status:'supported',present:2,required:2});
});
it('stores optional results encrypted in a separate internal table and never updates note or export content',async()=>{
 const result=await reviewNarrivaDiagnosticCriteria({user:{id:7},body:{agencyId:2,draftId:31,icd10Code:'F41.1'}});
 expect(result).toMatchObject({status:'reference_unavailable',internalOnly:true,id:81});const [sql,args]=m.clinical.mock.calls.find(([sql])=>sql.startsWith('INSERT'));expect(sql).toContain('INSERT INTO clinical_diagnostic_criteria_reviews');expect(args.at(-1)).toMatch(/^encrypted:/);expect(m.clinical.mock.calls.some(([query])=>/UPDATE clinical_notes|UPDATE clinical_note_drafts/.test(query))).toBe(false);expect(m.model.mock.calls[0][0].privacyContext).toEqual({synthetic:true});
});
it('leaves supervised writers without an internal note flag while exposing the review to their supervisor',async()=>{
 m.clinical.mockResolvedValue([[{id:81,agency_id:2,client_id:12,draft_id:31,author_user_id:7,icd10_code:'F41.1',result_encrypted:'encrypted:'+JSON.stringify({criteria:[],summary:{status:'incomplete'}})}]]);m.main.mockResolvedValue([[{supervisee_id:7,supervisor_id:9}]]);
 expect((await listNarrivaDiagnosticCriteria({user:{id:7,role:'provider',credential:'LPCC'},params:{clientId:12},query:{agencyId:2}})).reviews).toEqual([]);
 expect((await listNarrivaDiagnosticCriteria({user:{id:9,role:'provider',credential:'LPC'},params:{clientId:12},query:{agencyId:2}})).reviews).toHaveLength(1);
 expect((await listNarrivaDiagnosticCriteria({user:{id:10,role:'provider',credential:'LPC'},params:{clientId:12},query:{agencyId:2}})).reviews).toEqual([]);
});
it('shows the internal review in the medical chart for a licensed self-signing author',async()=>{
 m.clinical.mockResolvedValue([[{id:81,draft_id:31,author_user_id:7,icd10_code:'F41.1',result_encrypted:'encrypted:'+JSON.stringify({criteria:[],summary:{status:'incomplete'}})}]]);m.main.mockResolvedValue([[]]);
 expect((await listNarrivaDiagnosticCriteria({user:{id:7,role:'provider',credential:'MA, LPC'},params:{clientId:12},query:{agencyId:2}})).reviews).toHaveLength(1);
});

it('uses verified note-review authorization for an assigned supervisor without requiring a separate care assignment',async()=>{
 m.access.mockImplementation(async(_user,_agency,_client,options)=>{if(!options?.authorizedNoteReviewer)throw Object.assign(new Error('Care assignment required'),{status:403});});
 m.clinical.mockResolvedValue([[{id:81,draft_id:31,author_user_id:7,icd10_code:'F41.1',result_encrypted:'encrypted:'+JSON.stringify({criteria:[],summary:{status:'incomplete'}})}]]);m.main.mockResolvedValue([[{supervisee_id:7,supervisor_id:9}]]);
 const result=await listNarrivaDiagnosticCriteria({user:{id:9,role:'provider',credential:'LPC'},params:{clientId:12},query:{agencyId:2,noteId:44}});
 expect(m.load).toHaveBeenCalledWith(expect.objectContaining({id:9}),{agencyId:2,noteId:44,phase:'output'});expect(m.access).toHaveBeenCalledWith(expect.anything(),2,12,{authorizedNoteReviewer:true});expect(result.reviews).toHaveLength(1);
});
it('does not transfer a valid note-review grant to another client',async()=>{
 await expect(listNarrivaDiagnosticCriteria({user:{id:9,role:'provider',credential:'LPC'},params:{clientId:99},query:{agencyId:2,noteId:44}})).rejects.toMatchObject({status:404});expect(m.clinical).not.toHaveBeenCalled();
});
