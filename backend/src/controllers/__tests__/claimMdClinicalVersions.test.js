import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ find: vi.fn(), agency: vi.fn(), policy: vi.fn(), billing: vi.fn(), summary: vi.fn(), revision: vi.fn(), propose: vi.fn(), edit: vi.fn(), sign: vi.fn(), approved: vi.fn(), clinical: vi.fn(), nonbillable: vi.fn(), diagnosis:vi.fn(), materialize:vi.fn() }));
vi.mock('../medicalBilling.controller.js',()=>({draftClaimAfterSignature:m.materialize}));
vi.mock('../../services/narrivaRiskAssessment.service.js',()=>({assertNarrivaRiskBeforeSignature:vi.fn(async()=>{})}));
vi.mock('../../services/clinicalDiagnosisPolicy.service.js',()=>({assertClientDiagnosisPolicy:m.diagnosis}));
vi.mock('../../models/clinical/ClinicalNote.model.js', () => ({ default: { findById: m.find } }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { execute: m.clinical } }));
vi.mock('../../services/clinicalEligibility.service.js', () => ({ default: { ensureAgencyAccess: m.agency } }));
vi.mock('../../services/schedulingBillingAccess.service.js', () => ({ hasSchedulingBillingAccess: m.billing }));
vi.mock('../../services/clinicalNoteVersionBilling.service.js', () => ({ getApprovedClinicalContext: m.approved }));
vi.mock('../../services/supervisedBillingPolicy.service.js', () => ({ resolveNoteDocumentationPolicy: m.policy, isNonBillableDocument: m.nonbillable, parseObject: v => typeof v === 'string' ? JSON.parse(v) : v || {}, policyError: (status, message) => Object.assign(Error(message), { status }), validDate: v => /^\d{4}-\d{2}-\d{2}$/.test(v) }));
vi.mock('../../services/clinicalSupervisorReview.service.js', () => ({ normalizeServiceDetails: vi.fn(), serviceDetailTimes: vi.fn(), verifyServiceAmendmentLocation: vi.fn(), serviceLocationSnapshot: vi.fn() }));
vi.mock('../../services/clinicalNoteVersion.service.js', () => ({ getRevisionSummary: m.summary, getRevision: m.revision, proposeRevision: m.propose, editRevision: m.edit, signRevision: m.sign }));
import { listClinicalNoteVersions, createClinicalNoteVersion, updateClinicalNoteVersion, signClinicalNoteVersion, cosignClinicalNoteVersion, acknowledgeClinicalNoteVersion } from '../clinicalNoteVersions.controller.js';
import {assertNarrivaRiskBeforeSignature} from '../../services/narrivaRiskAssessment.service.js';

const hash = 'a'.repeat(64);
const request = (user = { id: 7, role: 'provider' }, body = {}) => ({ user, params: { noteId: '4', versionId: '12' }, query: { agencyId: '2' }, body: { agencyId: 2, reason: 'Clarify documented services', expectedContentHash: hash, expectedVersionNumber: 2, baseRevisionId: 10, ...body } });
const response = () => ({ json: vi.fn(), status: vi.fn().mockReturnThis() });
let pending, state;
beforeEach(() => {
  vi.clearAllMocks();
  m.clinical.mockResolvedValue([[{id:5,agency_id:2,metadata_json:{}}]]);
  vi.mocked(assertNarrivaRiskBeforeSignature).mockResolvedValue(undefined);
  m.nonbillable.mockReturnValue(false); m.diagnosis.mockResolvedValue({ready:true});
  const note = { id: 4, agency_id: 2, client_id: 3, clinical_session_id: 5, created_by_user_id: 7, provider_signed_by_user_id: 7, provider_signed_at: '2026-10-31', metadata_json: { serviceCode: '90834' } };
  pending = { id: 12, revisionNumber: 2, origin: 'provider', reason: 'Clarification', originalAuthorUserId: 7, proposedByUserId: 7, responsibleSupervisorUserId: 9, requiresSupervisorCosign: true, contentHash: hash, signatures: [], snapshot: { metadataJson: {}, encounterContext: {} } };
  state = { originalRevisionId: 10, effectiveRevisionId: 10, pendingRevisionId: 12, effectiveRevision: { ...pending, id: 10, revisionNumber: 1 }, pendingRevision: pending, revisions: [pending] };
  m.find.mockResolvedValue(note); m.approved.mockImplementation(async ({ note }) => ({ note })); m.agency.mockResolvedValue(true); m.policy.mockResolvedValue({ supervisorUserId: 9 }); m.billing.mockResolvedValue(false); m.summary.mockImplementation(async () => state); m.revision.mockImplementation(async () => pending); m.propose.mockResolvedValue(pending); m.edit.mockResolvedValue({ ...pending, id: 13 }); m.sign.mockResolvedValue({ ...pending, status: 'approved' });
});

describe('clinical version HTTP authorization and signatures', () => {
  it('blocks an amendment signature during a pending actual-session service correction',async()=>{
    m.clinical.mockResolvedValueOnce([[{id:5,agency_id:2,metadata_json:{serviceCodeChangePending:{id:'pending'}}}]]);
    const next=vi.fn();await signClinicalNoteVersion(request(undefined,{attested:true}),response(),next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({status:409,code:'CLINICAL_SERVICE_CHANGE_PENDING'}));expect(m.sign).not.toHaveBeenCalled();
  });
  it('blocks a clinical amendment signature before persistence when diagnosis documentation is incomplete',async()=>{m.diagnosis.mockRejectedValueOnce(Object.assign(Error('Separate justification required'),{status:409}));const next=vi.fn();await signClinicalNoteVersion(request(undefined,{attested:true}),response(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:409}));expect(m.sign).not.toHaveBeenCalled();});
  it('derives billability for new and edited amendments instead of inheriting a legacy supervisor hold or trusting a client flag', async () => {
    const legacy = { ...await m.find(), note_type: 'PROGRESS_NOTE', is_billable: 0 };
    m.find.mockResolvedValue(legacy);
    pending.snapshot.isBillable = false;
    const next = vi.fn();
    await createClinicalNoteVersion(request(undefined, { isBillable: false }), response(), next);
    await updateClinicalNoteVersion(request(undefined, { isBillable: false }), response(), next);
    expect(next).not.toHaveBeenCalled();
    expect(m.propose).toHaveBeenCalledWith(expect.objectContaining({ isBillable: true }));
    expect(m.edit).toHaveBeenCalledWith(expect.objectContaining({ isBillable: true }));
    expect(m.nonbillable).toHaveBeenCalledWith(expect.objectContaining({ note_type: 'PROGRESS_NOTE' }));
    expect(legacy.is_billable).toBe(0); expect(pending.snapshot.isBillable).toBe(false);
  });
  it('preserves explicit nonbillable document classification despite a client requesting billability', async () => {
    const original = { ...await m.find(), note_type: 'TREATMENT_SUMMARY', is_billable: 0 };
    m.find.mockResolvedValue(original); m.nonbillable.mockReturnValue(true);
    const next = vi.fn();
    await createClinicalNoteVersion(request(undefined, { isBillable: true }), response(), next);
    await updateClinicalNoteVersion(request(undefined, { isBillable: true }), response(), next);
    expect(next).not.toHaveBeenCalled();
    expect(m.propose).toHaveBeenCalledWith(expect.objectContaining({ isBillable: false }));
    expect(m.edit).toHaveBeenCalledWith(expect.objectContaining({ isBillable: false }));
    expect(original.is_billable).toBe(0);
  });
  it('exposes only the next assigned clinical signer and version capabilities', async () => {
    const res = response(), next = vi.fn();
    await listClinicalNoteVersions(request(), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0]).toMatchObject({ capabilities: { canCreateProvider: true, canCreateSupervisor: false, canCreateBilling: false }, pendingRevision: { capabilities: { canSign: true, canCosign: false, canAcknowledge: false } } });
  });
  it('records the authenticated biller as proposer and derives final supervisor requirements', async () => {
    m.billing.mockResolvedValue(true);
    const res = response(), next = vi.fn();
    await createClinicalNoteVersion(request({ id: 22, role: 'staff' }, { origin: 'billing', notePayload: 'Proposed factual correction', responsibleSupervisorUserId: 88, requiresSupervisorCosign: false, proposedByUserId: 99 }), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(m.propose).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 22, origin: 'billing', responsibleSupervisorUserId: 9, requiresSupervisorCosign: true, expectedRevisionId: 10, expectedContentHash: hash }));
    expect(res.status).toHaveBeenCalledWith(201);
  });
  it('does not allow delegated billing access to supply clinical signatures even for an old author identity', async () => {
    m.billing.mockResolvedValue(true);
    const next = vi.fn();
    await signClinicalNoteVersion(request({ id: 7, role: 'staff' }, { attested: true }), response(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    expect(m.sign).not.toHaveBeenCalled();
  });
  it('requires the original author before a provider amendment can receive a supervisor cosign', async () => {
    const next = vi.fn();
    await cosignClinicalNoteVersion(request({ id: 9, role: 'supervisor' }, { attested: true }), response(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    pending.signatures = [{ action: 'author_sign', actorUserId: 7 }];
    next.mockClear();
    await cosignClinicalNoteVersion(request({ id: 9, role: 'supervisor' }, { attested: true }), response(), next);
    expect(next).not.toHaveBeenCalled();
    expect(m.sign).toHaveBeenCalledWith(expect.objectContaining({ action: 'supervisor_sign', actorUserId: 9, revisionId: 12, expectedContentHash: hash }));
  });
  it('permits one final supervisor-origin signature and never offers a second self-signature', async () => {
    pending.origin = 'supervisor'; pending.proposedByUserId = 9;
    const next = vi.fn(), res = response();
    await cosignClinicalNoteVersion(request({ id: 9, role: 'super_admin' }, { attested: true }), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].revision.status).toBe('approved');
    state.pendingRevisionId = null; pending.status = 'approved'; pending.signatures = [{ action: 'supervisor_sign', actorUserId: 9 }];
    const listed = response(); await listClinicalNoteVersions(request({ id: 9, role: 'super_admin' }), listed, next);
    expect(listed.json.mock.calls[0][0].revisions[0].capabilities).toMatchObject({ canSign: false, canCosign: false, canAcknowledge: false });
  });
  it('materializes the approved amendment claim only after the final clinical signature',async()=>{
    pending.origin='supervisor';pending.proposedByUserId=9;
    m.sign.mockImplementation(async()=>{state={...state,effectiveRevisionId:12,pendingRevisionId:null,effectiveRevision:pending,pendingRevision:null};return {...pending,status:'approved'};});
    const next=vi.fn();await cosignClinicalNoteVersion(request({id:9,role:'supervisor'},{attested:true}),response(),next);
    expect(next).not.toHaveBeenCalled();expect(m.materialize).toHaveBeenCalledOnce();expect(m.materialize).toHaveBeenCalledWith(expect.objectContaining({user:{id:9,role:'supervisor'}}),expect.objectContaining({id:4,clinical_session_id:5}));
  });
  it('does not create another claim while an amendment remains pending or on author acknowledgement',async()=>{
    const next=vi.fn();await signClinicalNoteVersion(request(undefined,{attested:true}),response(),next);expect(next).not.toHaveBeenCalled();expect(m.materialize).not.toHaveBeenCalled();
    pending.origin='supervisor';pending.signatures=[{action:'supervisor_sign',actorUserId:9}];state.pendingRevisionId=null;state.effectiveRevisionId=12;
    await acknowledgeClinicalNoteVersion(request(undefined,{attested:true}),response(),next);expect(next).not.toHaveBeenCalled();expect(m.materialize).not.toHaveBeenCalled();
  });
  it('assigns nonblocking review acknowledgement only to the original author after supervisor approval', async () => {
    pending.origin = 'supervisor'; pending.signatures = [{ action: 'supervisor_sign', actorUserId: 9 }]; state.pendingRevisionId = null;
    const next = vi.fn(); await acknowledgeClinicalNoteVersion(request(undefined, { attested: true }), response(), next);
    expect(next).not.toHaveBeenCalled(); expect(m.sign).toHaveBeenCalledWith(expect.objectContaining({ action: 'author_acknowledge', actorUserId: 7 }));
    m.sign.mockClear(); await acknowledgeClinicalNoteVersion(request({ id: 9, role: 'supervisor' }, { attested: true }), response(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 })); expect(m.sign).not.toHaveBeenCalled();
  });
  it('rejects unrelated supervisors and cross-tenant note IDs', async () => {
    const next = vi.fn(); pending.signatures = [{ action: 'author_sign' }];
    await cosignClinicalNoteVersion(request({ id: 88, role: 'super_admin' }, { attested: true }), response(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    next.mockClear(); await createClinicalNoteVersion(request(undefined, { agencyId: 99 }), response(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 })); expect(m.propose).not.toHaveBeenCalled();
  });
  it('requires exact revision preconditions and propagates a stale signature conflict', async () => {
    const next = vi.fn(); await createClinicalNoteVersion(request(undefined, { expectedContentHash: '' }), response(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 })); expect(m.propose).not.toHaveBeenCalled();
    m.sign.mockRejectedValueOnce(Object.assign(Error('The clinical version changed'), { status: 409 })); next.mockClear();
    await signClinicalNoteVersion(request(undefined, { attested: true }), response(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 409 }));
  });
  it.each(['author','supervisor'])('keeps mandatory Narriva risk requirements on %s amendment signatures',async who=>{
    pending.signatures=who==='supervisor'?[{action:'author_sign'}]:[];
    vi.mocked(assertNarrivaRiskBeforeSignature).mockRejectedValueOnce(Object.assign(Error('Complete the required risk assessment.'),{status:409,code:'NARRIVA_RISK_ASSESSMENT_REQUIRED'}));
    const next=vi.fn(),handler=who==='supervisor'?cosignClinicalNoteVersion:signClinicalNoteVersion;
    await handler(request({id:who==='supervisor'?9:7,role:who==='supervisor'?'supervisor':'provider'},{attested:true}),response(),next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({code:'NARRIVA_RISK_ASSESSMENT_REQUIRED'}));
    expect(m.sign).not.toHaveBeenCalled();
  });
  it('does not treat an amendment signature as an eligible Quick Sign action',async()=>{
    const next=vi.fn();await cosignClinicalNoteVersion(request({id:9,role:'supervisor'},{attested:true,quickSign:true}),response(),next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({status:409}));expect(m.sign).not.toHaveBeenCalled();
  });
  it('allows the author to revise a billing proposal while preserving the service-generated immutable successor', async () => {
    pending.origin = 'billing'; pending.proposedByUserId = 22;
    const res = response(), next = vi.fn();
    await updateClinicalNoteVersion(request(undefined, { notePayload: 'Clinician reviewed correction' }), res, next);
    expect(next).not.toHaveBeenCalled(); expect(m.edit).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 7, revisionId: 12, expectedContentHash: hash })); expect(res.json.mock.calls[0][0].revision.id).toBe(13);
  });
});
