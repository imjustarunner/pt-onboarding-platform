import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import { parsePscScore, scorePsc17, suggestScreeningOutcome, validateScreeningReview, screeningClaimBlockers } from '../h0002ScreeningRules.js';

const mocks = vi.hoisted(() => ({ main: { execute: vi.fn(), getConnection: vi.fn() }, clinical: { execute: vi.fn(), getConnection: vi.fn() }, submission: vi.fn(), link: vi.fn(), client: vi.fn(), queueFind: vi.fn(), queueAppend: vi.fn(), agencyAccess: vi.fn(), supervisor: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: mocks.main }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: mocks.clinical }));
vi.mock('../../models/IntakeSubmission.model.js', () => ({ default: { findById: mocks.submission } }));
vi.mock('../../models/IntakeLink.model.js', () => ({ default: { findById: mocks.link } }));
vi.mock('../../models/Client.model.js', () => ({ default: { findById: mocks.client } }));
vi.mock('../../models/NoteAidWorkQueueItem.model.js', () => ({ default: { findByClientKeyForUser: mocks.queueFind, appendForUser: mocks.queueAppend } }));
vi.mock('../clinicalEligibility.service.js', () => ({ default: { ensureAgencyAccess: mocks.agencyAccess } }));
vi.mock('../serviceBillingSupervisor.service.js', () => ({ resolveServiceSupervisor: mocks.supervisor }));
vi.mock('../resolveClaimProviders.service.js', () => ({ getProviderClaimBillingMode: vi.fn() }));
vi.mock('../clinicalNoteCrypto.service.js', () => ({ maybeEncryptNotePayload: value => `encrypted:${value}`, maybeDecryptNotePayload: value => String(value).replace(/^encrypted:/, '') }));
vi.mock('../../controllers/publicIntake.controller.js', () => ({ buildClinicalSummaryText: () => 'Reported concerns and questionnaire answers.' }));
vi.mock('../clinicalDiagnosisAttach.service.js', () => ({ getPrimaryClinicalDiagnosis: vi.fn(async () => ({ icd10_code: 'F32.9' })) }));
import { prepareH0002ScreeningTask, screeningReviewContext, validateScreeningSignature, screeningDate } from '../h0002ScreeningWorkflow.service.js';
import { resolveClaimDiagnosisCodes, resolveClaimDateOfService } from '../clinicalClaimReadiness.service.js';

const labels = ['Fidgety, unable to sit still', 'Acts as if driven by a motor', 'Daydreams too much', 'Distracted Easily', 'Feels sad, unhappy', 'Feels hopeless', 'Has trouble concentrating', 'Fights with others', 'Is down on him or herself', 'Worries a lot', 'Seems to be having less fun', 'Does not listen to rules', 'Does not understand other people’s feelings', 'Teases others', 'Blames others for his or her troubles', 'Takes things that do not belong to him or her', 'Refuses to share'];
const fields = labels.map((label, i) => ({ key: `psc_${i+1}`, label, options: ['Never','Sometimes','Often'].map((label,index) => ({ label, value: String(index+1) })) }));
const byKey = new Map(fields.map(f => [f.key,f]));
const scored = scores => scorePsc17(fields.map((f,i) => ({ key:f.key,score:scores[i] ?? null })), byKey);
const validReview = { outcome:'further_evaluation',assessment:'Consider the reported functioning and prior history.',followUp:'Complete an assessment and discuss available care.',setting:'ITSCO office, asynchronous review',reviewConfirmed:true };

describe('H0002 screening results and clinician determinations', () => {
  it('holds altered diagnosis, service date or encounter units at claim transmission',()=>{
    const note={metadata_json:{source:'h0002_digital_screening',dateOfService:'2026-10-19',screeningReview:{reviewConfirmed:true}}};
    const claim={diagnosis_codes_json:['R69'],date_of_service:'2026-10-19'},lines=[{procedure_code:'H0002',units:1,service_date:'2026-10-19'}];
    expect(screeningClaimBlockers(note,claim,lines)).toEqual([]);
    expect(screeningClaimBlockers(note,{...claim,diagnosis_codes_json:['F32.9']},lines).join()).toContain('R69');
    expect(screeningClaimBlockers(note,{...claim,date_of_service:'2026-10-14'},lines).join()).toContain('service date');
    expect(screeningClaimBlockers(note,claim,[{...lines[0],units:2}]).join()).toContain('one H0002');
  });
  it('scores legacy option values by their labels, including zero-valued Never', () => {
    expect(['1','2','3'].map(v => parsePscScore(v,fields[0]))).toEqual([0,1,2]);
    expect(parsePscScore('3')).toBeNull();
    expect(parsePscScore('',fields[0])).toBeNull();
  });
  it('maps the actual school question order into the correct subscales', () => {
    const psc = scored([2,2,2,1,0,0,0,1,1,0,0,1,0,1,0,0,0]);
    expect(psc.total).toBe(11);
    expect(psc.subscales.attention.score).toBe(7);
    expect(psc.subscales.internalizing.score).toBe(1);
    expect(psc.subscales.externalizing.score).toBe(3);
    expect(suggestScreeningOutcome(psc)).toBe('further_evaluation');
  });
  it('does not reject an all-zero screening when history is missing or concerning', () => {
    const psc=scored(Array(17).fill(0));
    expect(suggestScreeningOutcome(psc)).toBe('further_evaluation');
    expect(suggestScreeningOutcome(psc,{noConcernsReported:true})).toBe('does_not_meet');
    expect(() => validateScreeningReview({...validReview,outcome:'does_not_meet',noConcernsConfirmed:true},{psc,reportedConcerns:true})).toThrow('all-zero');
    expect(() => validateScreeningReview({...validReview,outcome:'does_not_meet'},{psc,reportedConcerns:false})).toThrow('confirmation');
  });
  it('proposes admission at the total cutoff but requires clinical confirmation', () => {
    const psc=scored([...Array(15).fill(1),0,0]);
    expect(suggestScreeningOutcome(psc)).toBe('meets');
    expect(() => validateScreeningReview({...validReview,reviewConfirmed:false},{psc})).toThrow('Confirm review');
  });
  it.each([1,3,4,17])('never invents scores or signs with %i missing answers', missing => {
    const psc=scored(Array(17-missing).fill(0));
    expect(psc.total).toBeNull();expect(psc.invalid).toBe(missing>=4);
    expect(suggestScreeningOutcome(psc)).toBe('further_evaluation');
    expect(() => validateScreeningReview(validReview,{psc})).toThrow(/missing|complete/i);
  });
  it('requires documented safety follow-up when the intake flags it', () => {
    expect(() => validateScreeningReview(validReview,{psc:scored(Array(17).fill(1)),safetyFlag:true})).toThrow('safety');
  });
});

describe('H0002 preparation, signature and billing controls', () => {
  let state;
  beforeEach(() => {
    vi.clearAllMocks();vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-19T15:00:00Z'));
    state={sessions:[],notes:[],queue:null};
    const task={id:100,source_ref_type:'school_intake_review',source_ref_id:'200:300',assigned_to_agency_id:2,assigned_to_user_id:8,status:'pending',metadata:{submissionId:200,clientId:300,insuranceCategory:'medicaid',h0002Code:'SAMPLE'}};
    mocks.main.execute.mockImplementation(async sql => {
      if(sql.includes('FROM tasks'))return [[task]];
      if(sql.includes('intake_submission_clients'))return [[{client_id:300}]];
      if(sql.includes('feature_flags'))return [[{feature_flags:{h0002ScreeningWorkflow:{enabled:true,providerUserId:8,submittedFrom:'2026-10-14'}}}]];
      if(sql.includes('user_agencies'))return [[{user_id:8}]];
      return [{affectedRows:1}];
    });
    const lock={execute:vi.fn(async sql=>sql.includes('GET_LOCK')?[[{acquired:1}]]:[[{}]]),release:vi.fn()};
    mocks.main.getConnection.mockResolvedValue(lock);
    const db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async (sql,args)=>{
      if(sql.includes('SELECT id FROM clinical_sessions'))return [state.sessions];
      if(sql.includes('INSERT INTO clinical_sessions')){state.sessions.push({id:400});return [{insertId:400}];}
      if(sql.includes('SELECT id FROM clinical_notes'))return [state.notes];
      if(sql.includes('INSERT INTO clinical_notes')){state.notes.push({id:500,args});return [{insertId:500}];}
      throw Error(sql);
    })};
    mocks.clinical.getConnection.mockResolvedValue(db);
    mocks.submission.mockResolvedValue({id:200,status:'submitted',submitted_at:'2026-10-14T21:00:00Z',intake_link_id:10,intake_data:{responses:{clients:[Object.fromEntries(fields.map(f=>[f.key,'1']))]}}});
    mocks.link.mockResolvedValue({intake_steps:[{fields}]});
    mocks.client.mockResolvedValue({id:300,agency_id:2,initials:'SAMPLE'});
    mocks.supervisor.mockResolvedValue({supervisorUserId:501});
    mocks.queueFind.mockImplementation(async()=>state.queue);
    mocks.queueAppend.mockImplementation(async(u,items)=>{state.queue=items[0];return items;});
  });
  afterEach(()=>vi.useRealTimers());
  it('prepares exactly one unsigned encounter and note, and preserves work on retry',async()=>{
    const first=await prepareH0002ScreeningTask(100);
    const second=await prepareH0002ScreeningTask(100);
    expect(first.sessionId).toBe(second.sessionId);expect(state.sessions).toHaveLength(1);expect(state.notes).toHaveLength(1);
    expect(mocks.queueAppend).toHaveBeenCalledTimes(1);
    expect(state.queue.date).toBeUndefined();expect(state.queue.status).toBe('not_started');
    expect(state.notes[0].args[3]).toContain('encrypted:');
    expect(state.notes[0].args[3]).toContain('clinician review and determination pending');
  });
  it('recovers a queue failure without creating duplicate clinical records',async()=>{
    mocks.queueAppend.mockRejectedValueOnce(new Error('temporary queue failure'));
    await expect(prepareH0002ScreeningTask(100)).rejects.toThrow('temporary');
    await prepareH0002ScreeningTask(100);
    expect(state.sessions).toHaveLength(1);expect(state.notes).toHaveLength(1);
  });
  it('does not enroll an older submission into the requested cohort',async()=>{
    mocks.submission.mockResolvedValue({...await mocks.submission(),submitted_at:'2026-10-13T21:00:00Z'});
    expect((await prepareH0002ScreeningTask(100)).prepared).toBe(false);
    expect(state.sessions).toHaveLength(0);
  });
  it('rejects review by a different clinician before loading private source data',async()=>{
    mocks.clinical.execute.mockResolvedValue([[{id:400,agency_id:2,provider_user_id:8,metadata_json:{source:'h0002_digital_screening'}}]]);
    await expect(screeningReviewContext({sessionId:400,user:{id:9}})).rejects.toMatchObject({status:403});
    expect(mocks.submission).not.toHaveBeenCalled();
  });
  it('requires today’s professional determination and an unchanged note to sign',()=>{
    const payload='Screening evaluation';const meta={source:'h0002_digital_screening',dateOfService:'2026-10-19',screeningReview:{reviewConfirmed:true,reviewedByUserId:8,outcome:'further_evaluation',diagnosisCode:'R69',contentHash:crypto.createHash('sha256').update(payload).digest('hex')}};
    const note={created_by_user_id:8,metadata_json:meta,note_payload:`encrypted:${payload}`};
    expect(()=>validateScreeningSignature(note)).not.toThrow();
    expect(()=>validateScreeningSignature({...note,note_payload:'changed'})).toThrow('confirm today');
    expect(()=>validateScreeningSignature(note,new Date('2026-10-20T15:00:00Z'))).toThrow('confirm today');
    expect(screeningDate(new Date('2026-10-20T01:00:00Z'))).toBe('2026-10-19');
  });
  it('uses deferred R69 for this workflow even when chart or request has a disorder diagnosis',async()=>{
    mocks.clinical.execute.mockResolvedValue([[{metadata_json:{source:'h0002_digital_screening',screeningReview:{diagnosisCode:'R69'}}}]]);
    expect(await resolveClaimDiagnosisCodes({agencyId:2,clientId:300,clinicalNoteId:500,diagnosisCodes:['F32.9']})).toEqual(['R69']);
  });
  it('never uses the preparation timestamp as a pending screening’s service date',async()=>{
    mocks.clinical.execute.mockResolvedValue([[{created_at:'2026-10-19T15:00:00Z',metadata_json:{source:'h0002_digital_screening'}}]]);
    expect(await resolveClaimDateOfService({clinicalSessionId:400})).toBeNull();
    expect(await resolveClaimDateOfService({clinicalSessionId:400,dateOfService:'2026-10-14'})).toBeNull();
  });
  it('preserves the professional determination date despite a caller override',async()=>{
    mocks.clinical.execute.mockResolvedValue([[{metadata_json:{source:'h0002_digital_screening',serviceDate:'2026-10-19'}}]]);
    expect(await resolveClaimDateOfService({clinicalSessionId:400,dateOfService:'2026-10-14'})).toBe('2026-10-19');
  });
});
