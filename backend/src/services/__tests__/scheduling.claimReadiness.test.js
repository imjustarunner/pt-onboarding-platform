import { describe, it, expect, vi, beforeEach } from 'vitest';
const diagnosisPolicy = vi.hoisted(() => ({ evaluate:vi.fn() }));
vi.mock('../clinicalDiagnosisPolicy.service.js',()=>({evaluateClientDiagnosisPolicy:diagnosisPolicy.evaluate}));
const versions = vi.hoisted(() => ({ approved: vi.fn(), state: vi.fn() }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../clinicalDiagnosisAttach.service.js', () => ({ getPrimaryClinicalDiagnosis: vi.fn() }));
vi.mock('../clinicalNoteVersionBilling.service.js', () => ({ getApprovedClinicalContext: versions.approved, clinicalVersionBillingState: versions.state }));
import clinicalPool from '../../config/clinicalDatabase.js';
import { getPrimaryClinicalDiagnosis } from '../clinicalDiagnosisAttach.service.js';
import { evaluateClaimReadiness } from '../clinicalClaimReadiness.service.js';

let session;
let note;
const evaluate = (extra = {}) => evaluateClaimReadiness({ agencyId: 1, clientId: 2, clinicalSessionId: 3, requireSignedNote: true, ...extra });
describe('clinical claim readiness', () => {
  beforeEach(() => {
    diagnosisPolicy.evaluate.mockResolvedValue({ready:true,blockers:[],warnings:[],alerts:[]});
    versions.approved.mockImplementation(async ({ note }) => ({ note }));
    versions.state.mockResolvedValue({ effectiveRevisionId: 10, effectiveRevision: { contentHash: 'a'.repeat(64),approval:{approvedAt:'2026-09-01'} }, pendingRevisionId: null, blockers: [] });
    session = { id: 3 };
    note = { id: 4, clinical_session_id: 3, provider_signed_at: '2026-09-01', is_billable: 1 };
    getPrimaryClinicalDiagnosis.mockResolvedValue({ id: 5, icd10_code: 'F41.1' });
    clinicalPool.execute.mockImplementation(async (sql, params) => {
      if (sql.includes("s.service_code='H0002'")) return [[]];
      if (sql.includes('claim_blocked_reason') && sql.includes('FROM clinical_sessions')) return [[session].filter(Boolean)];
      if (sql.includes('FROM clinical_notes') && sql.includes('is_deleted = 0')) {
        expect(sql).toContain('agency_id = ?');
        expect(sql).toContain('client_id = ?');
        return [[note].filter(Boolean)];
      }
      if (sql.includes('LEFT JOIN clinical_diagnoses')) return [[]];
      if (sql.includes('FROM clinical_treatment_plans')) return [[{ id: 6, primary_diagnosis_id: 5 }]];
      if (sql.includes('SELECT metadata_json')) return [[{ metadata_json: { dateOfService: '2026-09-01' } }]];
      if (sql.includes('scheduled_start_at')) return [[{ scheduled_start_at: '2026-09-01 18:00:00' }]];
      throw new Error(`Unexpected query: ${sql}`);
    });
  });
  it('keeps an approved note linked while blocking transmission for diagnosis review',async()=>{diagnosisPolicy.evaluate.mockResolvedValue({ready:false,blockers:['Clinical justification required'],warnings:[],alerts:[{code:'diagnosis_supporting_evidence_required'}]});expect(await evaluate()).toMatchObject({ready:false,noteId:4,blockers:['Clinical justification required'],diagnosisAlerts:[{code:'diagnosis_supporting_evidence_required'}]});});
  it('accepts a signed billable note with diagnosis', async () => {
    expect(await evaluate()).toMatchObject({ ready: true, noteId: 4 });
  });
  it('checks the clinical author credential rather than a substituted billing rendering provider',async()=>{
    note.provider_signed_by_user_id=7;session.provider_user_id=7;session.rendering_provider_user_id=99;
    await evaluate();expect(diagnosisPolicy.evaluate).toHaveBeenLastCalledWith(expect.objectContaining({providerUserId:7}));
  });
  it('evaluates diagnosis coverage against the approved amendment service code',async()=>{
    session.service_code='H0031';versions.approved.mockResolvedValue({note:{...note,clinical_version_encounter_context:{serviceCode:'90834'},metadata_json:{serviceCode:'90834'}}});
    await evaluate();expect(diagnosisPolicy.evaluate).toHaveBeenLastCalledWith(expect.objectContaining({serviceCode:'90834'}));
  });
  it('rejects a mismatched client/session before reading notes', async () => {
    session = null;
    expect(await evaluate()).toMatchObject({ ready: false, checks: { hasSession: false } });
  });
  it('does not silently replace a deleted or mismatched selected note', async () => {
    note = null;
    const result = await evaluate({ clinicalNoteId: 900 });
    expect(result.ready).toBe(false);
    expect(result.blockers).toContain('Selected note does not belong to this session or was deleted');
  });
  it('blocks unsigned and awaiting-supervisor notes', async () => {
    note.provider_signed_at = null;
    expect((await evaluate()).ready).toBe(false);
    note.provider_signed_at = '2026-09-01';
    note.is_billable = 0;
    expect((await evaluate()).blockers).toContain('Note requires supervisor approval or is non-billable');
  });
  it('blocks a non-occurring session even if another refresh cleared its block reason', async () => {
    session.encounter_status = 'no_show';
    expect((await evaluate()).blockers).toContain('Appointment did not occur; insurance claims are blocked');
  });
  it('keeps a clinically approved H0004 note out of claim transmission while duration review is unresolved',async()=>{
    session.service_code='H0004';session.claim_blocked_reason='H0004_DURATION_REVIEW: Actual68 minutes requires billing review.';const result=await evaluate();expect(result.checks.noteSigned).toBe(true);expect(result.ready).toBe(false);expect(result.blockers).toContain(session.claim_blocked_reason);
  });
  it('preserves a session billing block', async () => {
    session.claim_blocked_reason = 'Duration is below the minimum';
    expect((await evaluate()).blockers).toContain('Duration is below the minimum');
  });
  it('uses the fully approved version diagnosis and date rather than mutable original metadata', async () => {
    versions.approved.mockResolvedValue({ note: { ...note, clinical_version_id: 12, metadata_json: { dateOfService: '2026-10-04', diagnosisCodes: ['F43.20'] } } });
    versions.state.mockResolvedValue({ effectiveRevisionId: 12, effectiveRevision: { contentHash: 'b'.repeat(64),approval:{approvedAt:'2026-10-04'} }, pendingRevisionId: null, blockers: [] });
    expect(await evaluate()).toMatchObject({ ready: true, diagnosisCodes: ['F43.20'], checks: { dateOfService: '2026-10-04' }, clinicalVersion: { revisionId: 12, contentHash: 'b'.repeat(64) } });
  });
  it('holds transmission while a new amendment is pending and retains the last approved version', async () => {
    versions.state.mockResolvedValue({ effectiveRevisionId: 12, effectiveRevision: { contentHash: 'b'.repeat(64) }, pendingRevisionId: 13, blockers: ['A clinical amendment is pending clinical approval. Claim transmission is paused.'] });
    expect(await evaluate()).toMatchObject({ ready: false, checks: { noteSigned: true }, clinicalVersion: { revisionId: 12, pendingRevisionId: 13 }, blockers: [expect.stringContaining('pending clinical approval')] });
  });
  it('holds an unconverted legacy service correction even when the original note already has a supervisor signature', async () => {
    note.supervisor_cosigned_at = '2026-09-02';
    note.metadata_json = { serviceDetailAmendments: [{ id: 20, approvedAt: null, serviceDetails: { durationMinutes: 60 } }] };
    expect(await evaluate()).toMatchObject({ ready: false, blockers: [expect.stringContaining('legacy service correction')] });
    note.metadata_json.serviceDetailAmendments[0].supersededByRevisionId = 12;
    expect(await evaluate()).toMatchObject({ ready: true });
  });
  it('holds a legacy author-only H0002 despite its billable flag and no currently required supervisor',async()=>{
    session.service_code='H0002';
    versions.state.mockResolvedValue({effectiveRevisionId:10,effectiveRevision:{contentHash:'a'.repeat(64),requiresSupervisorCosign:false,signatures:[],provenance:{kind:'legacy_observed'}},pendingRevisionId:null,blockers:[]});
    expect(await evaluate()).toMatchObject({ready:false,checks:{clinicalApprovalStage:'pending_review'},blockers:[expect.stringContaining('does not have final approval')]});
  });
});
