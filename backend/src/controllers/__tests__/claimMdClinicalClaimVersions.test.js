import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ clinical: vi.fn(), approval:vi.fn(), main: vi.fn(), session: vi.fn(), approved: vi.fn(), readiness: vi.fn(), diagnosis: vi.fn(), date: vi.fn(), create: vi.fn(), begin: vi.fn(), commit: vi.fn(), rollback: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.main }, onTableWrite: vi.fn() }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { execute: m.clinical, getConnection: async () => ({ execute: m.clinical, beginTransaction: m.begin, commit: m.commit, rollback: m.rollback, release: vi.fn() }) } }));
vi.mock('../../models/clinical/ClinicalSession.model.js', () => ({ default: { findById: m.session } }));
vi.mock('../../models/clinical/ClinicalClaim.model.js', () => ({ default: { create: m.create } }));
vi.mock('../../models/AgencyMedicalServiceCode.model.js', () => ({ default: { findByAgencyAndCode: vi.fn(async () => null) } }));
vi.mock('../../services/clinicalEligibility.service.js', () => ({ default: { ensureAgencyAccess: vi.fn() } }));
vi.mock('../../services/schedulingBillingAccess.service.js', () => ({ hasSchedulingBillingAccess: vi.fn(async () => true), schedulingResponseForUser: vi.fn(async (_u, _a, body) => body) }));
vi.mock('../../services/clinicalNoteVersionBilling.service.js', async original => ({ ...await original(), getApprovedClinicalContext: m.approved }));
vi.mock('../../services/clinicalClaimReadiness.service.js', () => ({ evaluateClaimReadiness: m.readiness, resolveClaimDiagnosisCodes: m.diagnosis, resolveClaimDateOfService: m.date }));
vi.mock('../../services/clientInsurance.service.js', () => ({ readClientInsurance: vi.fn(async () => ({ primary: { insurerName: 'Synthetic insurance', payerId: 'SYNTH' } })) }));
vi.mock('../../services/claimMdBillingProfile.service.js', () => ({ resolveClaimMdBillingProfile: vi.fn(async () => null) }));
vi.mock('../../services/applyBillingClaimOverrides.service.js', () => ({ applyBillingClaimOverrides: vi.fn(async () => null) }));
vi.mock('../../services/familyBillingEncryption.service.js', () => ({ encryptFamilyBilling: vi.fn(() => 'synthetic encrypted insurance'), decryptFamilyBilling: vi.fn() }));
vi.mock('../../services/supervisedBillingPolicy.service.js', async original => ({ ...await original(), resolveNoteDocumentationPolicy: vi.fn(async () => ({supervisorUserId:null})) }));
import { createMedicalClaim } from '../medicalBilling.controller.js';

const hash = 'b'.repeat(64);
const physical = { id: 4, agency_id: 2, client_id: 3, clinical_session_id: 5, provider_signed_at: '2026-10-01', is_billable: 1, metadata_json: { serviceCode: '90834', dateOfService: '2026-10-01' } };
const approved = { ...physical, clinical_version_id: 12, clinical_version_number: 2, clinical_version_content_hash: hash, metadata_json: { serviceCode: '90837', dateOfService: '2026-10-02', billingPrimaryUnits: 1, billingAddons: [], diagnosisCodes: ['F41.1'], structuredChart: { durationMinutes: 60, placeOfService: '11' } } };
const request = (body = {}) => ({ user: { id: 22, role: 'staff' }, body: { agencyId: 2, clientId: 3, clinicalSessionId: 5, clinicalNoteId: 4, billingNpi: '1111111111', renderingNpi: '2222222222', primaryChargeCents: 10000, primaryProcedureCode: '90834', dateOfService: '2026-10-01', ...body } });
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });
beforeEach(() => {
  vi.clearAllMocks();
  m.main.mockResolvedValue([[{ feature_flags: { medicalBillingEnabled: true } }]]);
  const session = { id: 5, agency_id: 2, client_id: 3, provider_user_id: 7, service_code: '90834', duration_minutes: 30, place_of_service: '02' };
  m.session.mockResolvedValue(session);
  m.approved.mockResolvedValue({ note: approved, session: { ...session, service_code: '90837', duration_minutes: 60, place_of_service: '11' } });
  m.readiness.mockResolvedValue({ ready: true, noteId: 4, blockers: [], warnings: [] });
  m.diagnosis.mockImplementation(async input => input.approvedNote.metadata_json.diagnosisCodes);
  m.date.mockImplementation(async input => input.approvedNote.metadata_json.dateOfService);
  m.create.mockResolvedValue({ id: 50 });
  m.approval.mockResolvedValue({clinical_note_id:4,provider_signed_at:physical.provider_signed_at,effective_revision_id:12,approved_at:'2026-11-03'});
  m.clinical.mockImplementation(async sql => sql.includes('AS has_original_signature') ? [[await m.approval()]] : sql.includes('FROM clinical_notes') ? [[physical]] : sql.startsWith('SELECT') ? [[]] : [{ affectedRows: 1 }]);
});

it('creates billing services from the approved revision and records its immutable reference', async () => {
  const res = response(), next = vi.fn(); await createMedicalClaim(request(), res, next);
  expect(next).not.toHaveBeenCalled();
  expect(m.diagnosis).toHaveBeenCalledWith(expect.objectContaining({ approvedNote: approved }));
  const created = m.create.mock.calls[0][0];
  expect(JSON.parse(created.claimPayload)).toMatchObject({ lines: [{ procedureCode: '90837', units: 1, serviceDate: '2026-10-02' }], diagnosisCodes: ['F41.1'] });
  expect(created.metadataJson.clinicalVersion).toEqual({ revisionId: 12, revisionNumber: 2, contentHash: hash });
  expect(m.clinical.mock.calls.find(([sql])=>sql.includes('UPDATE clinical_claims SET'))[1][9]).toBe('ready');
  expect(res.status).toHaveBeenCalledWith(201); expect(m.commit).toHaveBeenCalled();
  expect(physical.metadata_json.serviceCode).toBe('90834');
});
it('does not create a ready claim from a legacy-observed original without an exact author signature',async()=>{
  m.approval.mockResolvedValue({clinical_note_id:4,provider_signed_at:physical.provider_signed_at,effective_revision_id:12,requires_supervisor_cosign:0,is_billable:1,has_original_signature:0});
  const next=vi.fn();await createMedicalClaim(request(),response(),next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({status:409,code:'CLINICAL_APPROVAL_REQUIRED'}));
  expect(m.create).not.toHaveBeenCalled();expect(m.begin).not.toHaveBeenCalled();
});
it('rechecks required clinical approval under the note lock before creating a claim',async()=>{
  m.approval.mockResolvedValueOnce({clinical_note_id:4,provider_signed_at:physical.provider_signed_at,approved_at:'2026-11-03'}).mockResolvedValueOnce({clinical_note_id:4,provider_signed_at:physical.provider_signed_at,pending_revision_id:13,pending_revision_origin:'supervisor'});
  const next=vi.fn();await createMedicalClaim(request(),response(),next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({status:409,code:'CLINICAL_APPROVAL_REQUIRED'}));
  expect(m.create).not.toHaveBeenCalled();expect(m.rollback).toHaveBeenCalled();
});
it('rejects caller service lines that conflict with the approved clinical revision', async () => {
  const res = response(), next = vi.fn();
  await createMedicalClaim(request({ lines: [{ procedureCode: '90834', units: 3, chargeCents: 10000 }], placeOfService: '02' }), res, next);
  expect(next).not.toHaveBeenCalled(); expect(res.status).toHaveBeenCalledWith(409); expect(m.create).not.toHaveBeenCalled();
});
it('rechecks the approved head under the note lock and rolls back a stale draft', async () => {
  m.approved.mockResolvedValueOnce({ note: approved, session: { place_of_service: '11', service_code: '90837', duration_minutes: 60 } }).mockResolvedValueOnce({ note: { ...approved, clinical_version_id: 13 }, session: {} });
  const next = vi.fn(); await createMedicalClaim(request(), response(), next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 409 })); expect(m.create).not.toHaveBeenCalled(); expect(m.rollback).toHaveBeenCalled();
});
