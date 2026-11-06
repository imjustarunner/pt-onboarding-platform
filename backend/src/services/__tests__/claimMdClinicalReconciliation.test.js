import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ approved: vi.fn(), pending: vi.fn(), event: vi.fn(), execute: vi.fn(), begin: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: {}, onTableWrite: vi.fn() }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: {} }));
vi.mock('../clinicalNoteVersionBilling.service.js', async original => ({ ...await original(), getApprovedClinicalContext: m.approved }));
vi.mock('../clinicalNoteVersion.service.js', () => ({ hasPendingRevision: m.pending }));
vi.mock('../claimMdWorkflow.service.js', () => ({ recordClaimEvent: m.event }));
import { approvedClinicalClaimPlan, claimDiffersFromApprovedVersion, reconcileApprovedClinicalClaim } from '../clinicalClaimVersionReconciliation.service.js';
import * as afterHours from '../clinicalAfterHours.service.js';

const hash = 'b'.repeat(64), signature = { id: 40, action: 'supervisor_sign', actorUserId: 9, contentHash: hash, attestation: { entryManifest: [{ id: 5, contentHash: 'c'.repeat(64) }] } };
let claim, note, source;
const input = () => ({ agencyId: 2, claimId: 8, actorUserId: 22, revision: 3, expectedClinicalRevisionId: 12, expectedClinicalContentHash: hash, attested: true, reason: 'Apply the approved factual service correction', lines: [{ procedureCode: '90837', units: 1, chargeCents: 12500, modifiers: [], diagnosisPointers: '1' }] });
beforeEach(() => {
  vi.clearAllMocks();
  claim = { id: 8, agency_id: 2, client_id: 3, clinical_session_id: 5, clinical_note_id: 4, billing_revision: 3, claim_lifecycle: 'draft', claim_status: 'PENDING', date_of_service: '2026-10-01', place_of_service: '02', diagnosis_codes_json: '["F32.9"]' };
  note = { id: 4, agency_id: 2, client_id: 3, clinical_session_id: 5, provider_signed_at: '2026-10-01', clinical_version_id: 12, clinical_version_number: 2, clinical_version_content_hash: hash, clinical_version_signatures: [signature], metadata_json: { serviceCode: '90837', dateOfService: '2026-10-03', billingPrimaryUnits: 1, billingAddons: [], diagnosisCodes: ['F41.1'], structuredChart: { placeOfService: '11' } } };
  m.approved.mockResolvedValue({ note, session: { place_of_service: '11' } }); m.pending.mockResolvedValue(false); m.event.mockResolvedValue(undefined);
  m.execute.mockImplementation(async sql => {
    if (sql.startsWith('SELECT clinical_session_id')) return [[{ clinical_session_id: 5 }]];
    if (sql.includes('SELECT * FROM clinical_sessions')) return [[{ id: 5, agency_id: 2, client_id: 3 }]];
    if (sql.includes('SELECT * FROM clinical_claims')) return [[claim]];
    if (sql.includes('SELECT * FROM clinical_notes')) return [[note]];
    if (sql.includes('SELECT * FROM clinical_claim_lines')) return [[{ id: 20, procedure_code: '90834', units: 1, charge_cents: 10000 }]];
    return sql.startsWith('SELECT') ? [[]] : [{ affectedRows: 1 }];
  });
  source = { getConnection: async () => ({ execute: m.execute, beginTransaction: m.begin, commit: m.commit, rollback: m.rollback, release: m.release }) };
});

it('reconciles the same unsent draft using approved DOS, diagnoses, POS and services with reviewed charges', async () => {
  const result = await reconcileApprovedClinicalClaim(input(), source);
  expect(result).toMatchObject({ ok: true, clinicalVersion: { revisionId: 12, revisionNumber: 2, contentHash: hash } });
  const [sql, values] = m.execute.mock.calls.find(([sql]) => sql.startsWith('UPDATE clinical_claims'));
  expect(sql).toContain("claim_lifecycle='draft'"); expect(values.slice(0, 4)).toEqual(['2026-10-03', '11', '["F41.1"]', 12500]);
  expect(m.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE clinical_notes'))).toBe(false);
  expect(m.event).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'clinical_version_reconciliation', actorUserId: 22, payload: expect.objectContaining({ clinicalVersion: { revisionId: 12, revisionNumber: 2, contentHash: hash }, clinicalSignatures: [signature] }) }), expect.anything());
  expect(m.commit).toHaveBeenCalledTimes(1);
});
it('refuses submitted, queued, rejected and previously transmitted originals without editing their history', async () => {
  for (const lifecycle of ['submitted', 'queued', 'rejected']) {
    claim.claim_lifecycle = lifecycle;
    await expect(reconcileApprovedClinicalClaim(input(), source)).rejects.toMatchObject({ status: 409 });
  }
  expect(m.execute.mock.calls.some(([sql]) => sql.startsWith('DELETE') || sql.startsWith('UPDATE'))).toBe(false);
  expect(m.event).not.toHaveBeenCalled(); expect(m.commit).not.toHaveBeenCalled();
});
it('holds a pending clinical amendment and rejects stale billing or clinical version preconditions under locks', async () => {
  m.pending.mockResolvedValueOnce(true);
  await expect(reconcileApprovedClinicalClaim(input(), source)).rejects.toMatchObject({ status: 409 });
  await expect(reconcileApprovedClinicalClaim({ ...input(), revision: 2 }, source)).rejects.toMatchObject({ status: 409 });
  await expect(reconcileApprovedClinicalClaim({ ...input(), expectedClinicalRevisionId: 11 }, source)).rejects.toMatchObject({ status: 409 });
  await expect(reconcileApprovedClinicalClaim({ ...input(), expectedClinicalContentHash: 'c'.repeat(64) }, source)).rejects.toMatchObject({ status: 409 });
  expect(m.execute.mock.calls.some(([sql]) => sql.startsWith('DELETE') || sql.startsWith('UPDATE'))).toBe(false);
});
it('rejects forged services, missing reviewed charges, invalid diagnosis pointers and missing attestation', async () => {
  for (const patch of [{ procedureCode: '90834' }, { units: 3 }, { chargeCents: 0 }, { diagnosisPointers: '2' }]) {
    const request = input(); request.lines = [{ ...request.lines[0], ...patch }];
    await expect(reconcileApprovedClinicalClaim(request, source)).rejects.toMatchObject({ status: expect.any(Number) });
  }
  await expect(reconcileApprovedClinicalClaim({ ...input(), attested: false }, source)).rejects.toMatchObject({ status: 400 });
  expect(m.execute.mock.calls.some(([sql]) => sql.startsWith('DELETE') || sql.startsWith('UPDATE'))).toBe(false);
});
it('rolls back draft changes when immutable audit persistence fails', async () => {
  m.event.mockRejectedValueOnce(Error('Audit unavailable'));
  await expect(reconcileApprovedClinicalClaim(input(), source)).rejects.toThrow('Audit unavailable');
  expect(m.rollback).toHaveBeenCalled(); expect(m.commit).not.toHaveBeenCalled();
});
it('previews the exact approved services and detects the original draft mismatch', async () => {
  const plan = await approvedClinicalClaimPlan({ note, session: {} });
  expect(plan).toMatchObject({ revisionId: 12, dateOfService: '2026-10-03', placeOfService: '11', diagnosisCodes: ['F41.1'], lines: [{ procedureCode: '90837', units: 1 }] });
  expect(claimDiffersFromApprovedVersion(claim, [{ procedure_code: '90834', units: 1 }], plan)).toBe(true);
});
it('renews only the schedule-derived99051 binding during explicit approved-version reconciliation without rewriting the signed note',async()=>{
 const originalReconcile=afterHours.reconcileNewClaimAfterHours;
 const spy=vi.spyOn(afterHours,'reconcileNewClaimAfterHours').mockImplementation(value=>originalReconcile(value,{authorize:vi.fn().mockResolvedValue({allowed:true,reason:'verified'})}));
 try{
  const approvedSession={id:5,agency_id:2,client_id:3,provider_user_id:7,service_code:'90837',scheduled_start_at:'2026-10-03 18:00:00',source_timezone:'America/Denver',place_of_service:'11',is_telehealth:0};m.approved.mockResolvedValue({note,session:approvedSession});
  const before=structuredClone(note),plan=await approvedClinicalClaimPlan({note,session:approvedSession});expect(plan.lines.map(line=>line.procedureCode)).toEqual(['90837','99051']);expect(plan.scheduleDerived99051).toMatchObject({approvedRevisionId:12,included:true,sourceTimezone:'America/Denver'});
  const request=input();request.lines.push({procedureCode:'99051',units:1,chargeCents:3000,modifiers:[],diagnosisPointers:'1'});
  await reconcileApprovedClinicalClaim(request,source);
  const [,values]=m.execute.mock.calls.find(([sql])=>sql.startsWith('UPDATE clinical_claims'));expect(JSON.parse(values[5]).scheduleDerived99051).toEqual(plan.scheduleDerived99051);expect(note).toEqual(before);expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE clinical_notes'))).toBe(false);
 }finally{spy.mockRestore();}
});
