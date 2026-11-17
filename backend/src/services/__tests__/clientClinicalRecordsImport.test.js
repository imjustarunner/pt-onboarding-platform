import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {}, onTableWrite: vi.fn() }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: {} }));
vi.mock('../clinicalNoteCrypto.service.js', () => ({ maybeEncryptNotePayload: value => `encrypted:${value}`, maybeDecryptNotePayload: value => value?.replace(/^encrypted:/, '') }));
vi.mock('../ehrHistoricalImportLock.service.js', () => ({ withHistoricalImportLock: vi.fn((_a,_c,_k,work) => work()) }));
vi.mock('../clientChartImport.service.js', () => ({ saveChartRecord: vi.fn() }));
import { saveChartRecord } from '../clientChartImport.service.js';
import { importRecordsIntake, importRecordsTreatmentPlan } from '../clientClinicalRecordsImport.service.js';
import { intakeDraftChartSummary } from '../intakeDraftReview.service.js';
import { parseScalePair as backendScale } from '../treatmentPlanImport.service.js';
import { parseScalePair as frontendScale } from '../../../../frontend/src/utils/treatmentPlanDuration.js';
let drafts, plans;
const scope = { agencyId: 2, clientId: 2579, actorId: 10 };
const intake = { text: 'Presenting Problem\nOriginal documented concern\nDiagnosis\nF41.1 Anxiety', recordsImport: true, serviceCode: 'H0031' };
beforeEach(() => {
  drafts = { listForClient: vi.fn().mockResolvedValue([]), create: vi.fn(async input => ({ id: 351, ...input, service_code: input.serviceCode, session_context_enc: input.sessionContextEnc })), updateContent: vi.fn(async input => ({ id: input.draftId, ...input })) };
  plans = { listByClient: vi.fn().mockResolvedValue([]), create: vi.fn(async input => ({ id: 44, ...input })), findById: vi.fn().mockResolvedValue({ id: 44, status: 'draft' }) };
});
it.each(['H0031','90791'])('retains an unlinked, unsigned, nonbillable %s source note without confirming diagnoses', async serviceCode => {
  const result = await importRecordsIntake({ ...scope, input: { ...intake, serviceCode } }, { drafts });
  expect(result.draft.id).toBe(351);
  const saved = drafts.create.mock.calls[0][0];
  expect(saved).toMatchObject({ status: 'draft', providerUserId: null, serviceCode });
  expect(saved.noteBodyEnc).toBe(`encrypted:${intake.text}`);
  expect(saved.confirmedDxJson).toBeUndefined();
  expect(JSON.parse(saved.sessionContextEnc.slice(10))).toMatchObject({ source: 'client_records_import', nonBillable: true, clinicalSessionId: null, officeEventId: null, recordsImport: { importedByUserId: 10, sourceText: intake.text } });
  const summary = intakeDraftChartSummary(result.draft, [{ id: 9, service_code: serviceCode }]);
  expect(summary).toMatchObject({ records_import: true, non_billable: true, clinical_session_id: null, date_of_service: null });
});
it('requires an explicit code and refuses appointment/finalization fields', async () => {
  for (const changes of [{serviceCode:''},{serviceCode:'90837'},{clinicalSessionId:9},{sessionContext:{clinicalSessionId:9}},{finalize:true}]) {
    await expect(importRecordsIntake({ ...scope, input: { ...intake, ...changes } }, { drafts })).rejects.toHaveProperty('status',400);
  }
  expect(drafts.create).not.toHaveBeenCalled();
});
it('reuses the same source on retry, preserving the record and actual automation/human attribution', async () => {
  const first = await importRecordsIntake({ ...scope, input: intake }, { drafts });
  drafts.listForClient.mockResolvedValue([first.draft]);
  expect(await importRecordsIntake({ ...scope, input: intake }, { drafts })).toMatchObject({ reused: true, draft: { id:351 } });
  expect(drafts.create).toHaveBeenCalledOnce(); expect(drafts.updateContent).not.toHaveBeenCalled();
});
it('recovers the existing failed-finalization draft and updates the explicitly selected code', async () => {
  drafts.listForClient.mockResolvedValue([{ id:351,status:'ready',service_code:'90791',scrubbed_input_enc:`encrypted:${intake.text}`, session_context_enc:JSON.stringify({source:'client_creation_record_import'}) }]);
  expect(await importRecordsIntake({ ...scope,input:intake },{drafts})).toMatchObject({ recovered:true,draft:{id:351} });
  expect(drafts.create).not.toHaveBeenCalled();
  expect(drafts.updateContent).toHaveBeenCalledWith(expect.objectContaining({draftId:351,status:'draft',serviceCode:'H0031',confirmedDxJson:null}));
});
it('preserves finalized and unrelated intakes rather than reopening or replacing them', async () => {
  drafts.listForClient.mockResolvedValue([{id:1,status:'final',scrubbed_input_enc:`encrypted:${intake.text}`,session_context_enc:JSON.stringify({source:'client_creation_record_import'})},{id:2,status:'draft',session_context_enc:'{}'}]);
  await importRecordsIntake({...scope,input:intake},{drafts});expect(drafts.create).toHaveBeenCalledOnce();expect(drafts.updateContent).not.toHaveBeenCalled();
});
it('saves an incomplete treatment plan as a provider draft once, preserving the whole source and avoiding live diagnoses', async () => {
  const text='Presenting Problem\nOriginal concern\nTreatment Goal 1\nImprove coping\nObjective 1.1\nDocumented objective with no numeric target\nDiagnosis\nF41.1';
  const result=await importRecordsTreatmentPlan({...scope,input:{recordsImport:{text},status:'draft',finalize:false}},{plans});
  const saved=plans.create.mock.calls[0][0];expect(saved).toMatchObject({status:'draft',createdByUserId:10,clinicalSessionId:null,clinicalNoteId:null});
  expect(saved.primaryDiagnosisId).toBeUndefined();expect(saved.sourceToolId).toMatch(/^client_records_import:[A-Za-z0-9_-]{43}$/);
  expect(saved.dischargePlan).toBeNull();
  expect(saveChartRecord).toHaveBeenCalledWith({agencyId:2,clientId:2579},'plan_source_44',0,expect.objectContaining({text}),10);
  plans.listByClient.mockResolvedValue([{id:44,status:'draft',source_tool_id:saved.sourceToolId}]);
  expect(await importRecordsTreatmentPlan({...scope,input:{recordsImport:{text}}},{plans})).toMatchObject({reused:true,plan:{id:44}});expect(plans.create).toHaveBeenCalledOnce();
});
it('reads the documented narrative scale without taking the 1–10 anchors as the rating', () => {
  const text='Progress will be measured on a scale of 1–10, with 10 representing sustained attention. The client is currently functioning at a 3, demonstrating difficulty maintaining focus. The goal is to achieve a 7 by improving attention.';
  expect(backendScale(text)).toEqual({scaleCurrent:3,scaleTarget:7});expect(frontendScale(text)).toEqual(backendScale(text));
  expect(backendScale('Within 3 months, work on 7 coping strategies on a scale of 1–10.')).toEqual({scaleCurrent:null,scaleTarget:null});
});
