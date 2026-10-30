import { beforeEach, it, expect, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), loadContext: vi.fn(), calculateLine: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../paySystem.service.js', () => ({ computeLineAmount: m.calculateLine, loadUserPaySystemContext: m.loadContext }));
import { computeSchoolClientLeaveBasis, resolveSchoolClientRowEvidence } from '../schoolClientLeaveBasis.service.js';
let rows, rules, carryovers, overrides;
beforeEach(() => {
  vi.resetAllMocks(); carryovers = []; overrides = [];
  rows = [{ id: 1, service_code: '90834', service_date: '2026-11-07', note_status: 'FINALIZED', unit_count: 1, school_service: 1, client_id: 7, match_status: 'matched', evidence_status: 'verified_school' }];
  rules = [{ service_code: '90834', credit_value: .75, pay_divisor: 1 }];
  m.execute.mockImplementation(async sql => {
    if (sql.startsWith('SELECT id FROM payroll_imports')) return [[{ id: 99 }]];
    if (sql.includes('LEFT JOIN payroll_school_client_evidence')) return [rows];
    if (sql.startsWith('SELECT * FROM payroll_service_code_rules')) return [rules];
    if (sql.startsWith('SELECT service_code,carryover_finalized_units FROM payroll_stage_carryovers')) return [carryovers];
    if (sql.startsWith('SELECT service_code,finalized_units FROM payroll_staging_overrides')) return [overrides];
    throw Error('Unexpected query');
  });
  m.loadContext.mockResolvedValue({ enabled: true, rateProfile: { creditRate: 40 }, status: {} });
  m.calculateLine.mockReturnValue({ payType: 'credit', hourEquivalent: .75 });
});
const args = { agencyId: 2, userId: 10, payrollPeriodId: 149, periodStart: '2026-11-07', periodEnd: '2026-11-20' };
it('uses only the latest effective report and scopes rows by company, provider and period dates', async () => {
  const result = await computeSchoolClientLeaveBasis(args);
  expect(result).toMatchObject({ complete: true, basisHours: .9, coverage: { importId: 99, schoolRows: 1 } });
  expect(m.execute.mock.calls[0][0]).toContain('ORDER BY created_at DESC,id DESC LIMIT 1');
  expect(m.execute.mock.calls.find(([sql]) => sql.includes('LEFT JOIN payroll_school_client_evidence'))[1]).toEqual([2, 149, 99, 10, '2026-11-07', '2026-11-20']);
  expect(m.loadContext).toHaveBeenCalledWith({ agencyId: 2, userId: 10, periodStart: '2026-11-07', periodEnd: '2026-11-07' });
});
it('excludes office work and nonpayable notes without changing the other leave bases', async () => {
  rows.push({ ...rows[0], id: 2, school_service: 0, evidence_status: 'excluded' }, { ...rows[0], id: 3, note_status: 'DRAFT', draft_payable: 0 }, { ...rows[0], id: 4, note_status: 'NO_NOTE' });
  const result = await computeSchoolClientLeaveBasis(args);
  expect(result).toMatchObject({ complete: true, basisHours: .9, coverage: { schoolRows: 1, excludedRows: 1, nonpayableRows: 2 } });
  expect(m.calculateLine).toHaveBeenCalledOnce();
  expect(m.execute.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
});
it('marks incomplete coverage instead of silently treating unresolved possible-school work as zero', async () => {
  rows.push({ ...rows[0], id: 2, school_service: null, evidence_status: null, client_id: null });
  const result = await computeSchoolClientLeaveBasis(args);
  expect(result).toMatchObject({ complete: false, basisHours: .9, coverage: { reviewRows: 1 } });
  expect(result.reviewReasons[0]).toMatchObject({ payrollImportRowId: 2, code: 'school_client_evidence_incomplete' });
});
it('requires approved code mappings and dated compensation context', async () => {
  rules = []; expect((await computeSchoolClientLeaveBasis(args)).reviewReasons[0].code).toBe('approved_code_mapping_missing');
  rules = [{ service_code: '90834' }]; m.loadContext.mockResolvedValue({ enabled: false });
  expect((await computeSchoolClientLeaveBasis(args)).reviewReasons[0].code).toBe('dated_compensation_context_missing');
});
it('does not claim a missing billing import is a verified zero period', async () => {
  m.execute.mockResolvedValue([[]]);
  expect(await computeSchoolClientLeaveBasis(args)).toMatchObject({ complete: false, basisHours: 0, reviewReasons: [{ code: 'billing_import_missing' }] });
});
it('upserts per-row evidence without writing clients, sessions or encounters', async () => {
  m.execute.mockImplementation(async (sql, params) => {
    if (sql.startsWith('SELECT id,agency_id,payroll_import_id')) return [[{ id: 31, payroll_period_id: 149, source_row_number: 2, user_id: 10, service_date: '2026-11-07', location: 'Maple Elementary', place_of_service: '03' }]];
    if (sql.startsWith('SELECT a.id,a.name')) return [[{ id: 20, name: 'Maple Elementary' }]];
    if (sql.startsWith('SELECT id,name,school_organization_id')) return [[{ id: 40, name: 'Maple Elementary', school_organization_id: 20, place_of_service: '03' }]];
    if (sql.startsWith('SELECT id,agency_id,organization_id')) return [[{ id: 7, agency_id: 2, organization_id: 20 }]];
    if (sql.startsWith('SELECT client_id,organization_id')) return [[]];
    if (sql.startsWith('INSERT INTO payroll_school_client_evidence')) return [{ affectedRows: 1 }];
    throw Error('Unexpected query');
  });
  const result = await resolveSchoolClientRowEvidence({ agencyId: 2, payrollImportId: 99, actorId: 501, rows: [{ sourceRowNumber: 2 }], matches: [{ sourceRowNumber: 2, clientId: 7, matchStatus: 'matched', matchMethod: 'exact_name_dob' }] });
  expect(result).toMatchObject({ verifiedSchoolRows: 1, reviewRows: 0 });
  const writes = m.execute.mock.calls.filter(([sql]) => !sql.startsWith('SELECT'));
  expect(writes).toHaveLength(1); expect(writes[0][0]).toContain('ON DUPLICATE KEY UPDATE');
  expect(writes[0][1].slice(0, 10)).toEqual([31, 2, 99, 149, 2, 10, '2026-11-07', 7, 'matched', 'exact_name_dob']);
  expect(writes[0][1][13]).toBe('03');
});

it.each(['H0031','H0032','H2014'])('requires the completed quantity-processing step for %s school rows', async serviceCode => {
  rows = [{ ...rows[0], service_code: serviceCode, requires_processing: 1, processed_at: null, unit_count: 1 }];
  rules = [{ service_code: serviceCode, credit_value: 1 / 60, pay_divisor: 60 }];
  const result = await computeSchoolClientLeaveBasis(args);
  expect(result).toMatchObject({ complete: false, basisHours: 0, coverage: { reviewRows: 1, schoolRows: 0 } });
  expect(result.reviewReasons).toEqual([{ payrollImportRowId: 1, code: 'school_service_quantity_processing_pending' }]);
  expect(m.calculateLine).not.toHaveBeenCalled(); expect(m.loadContext).not.toHaveBeenCalled();
});
it('uses the reviewed replacement quantity after the report row is marked processed', async () => {
  rows = [{ ...rows[0], service_code: 'H0031', requires_processing: 1, processed_at: '2026-11-21 10:00:00', unit_count: 30 }];
  rules = [{ service_code: 'H0031', credit_value: 1 / 60, pay_divisor: 60 }];
  m.calculateLine.mockReturnValue({ payType: 'hcode', hourEquivalent: .5, autoIndirectHours: .5 / 6 });
  const result = await computeSchoolClientLeaveBasis(args);
  expect(result).toMatchObject({ complete: true, basisHours: .583333, directServiceHours: .5, coverage: { schoolRows: 1, reviewRows: 0 } });
  expect(m.calculateLine).toHaveBeenCalledWith(expect.objectContaining({ serviceCode: 'H0031', quantity: 30 }));
});

it('requires school-client attribution for positive direct-service carryovers while keeping raw evidence visible', async () => {
  carryovers = [{ service_code: '90834', carryover_finalized_units: 2 }];
  const result = await computeSchoolClientLeaveBasis(args);
  expect(result).toMatchObject({ complete: false, basisHours: .9, basisScope: 'raw_import_rows_only', coverage: { schoolRows: 1, carryoverReviewItems: 1 } });
  expect(result.reviewReasons).toContainEqual({ code: 'school_carryover_attribution_required', serviceCode: '90834', quantity: 2 });
  expect(m.execute.mock.calls.find(([sql]) => sql.includes('FROM payroll_stage_carryovers'))[1]).toEqual([2,149,10]);
});
it.each([0,2])('requires allocation review for a finalized quantity override of %s instead of the raw payable 1', async quantity => {
  overrides = [{ service_code: '90834', finalized_units: quantity }];
  const result = await computeSchoolClientLeaveBasis(args);
  expect(result).toMatchObject({ complete: false, basisHours: .9, coverage: { quantityOverrideReviewItems: 1 } });
  expect(result.reviewReasons).toContainEqual({ code: 'school_quantity_override_attribution_required', serviceCode: '90834', rawQuantity: 1, overrideQuantity: quantity });
});
it('does not block school accrual for supervision, meeting overlays or unchanged payable quantities', async () => {
  rules.push({ service_code: '99416', category: 'indirect', pay_system_bucket: 'indirect' }, { service_code: 'MEETING', category: 'meeting', pay_system_bucket: 'support_activity' });
  carryovers = [{ service_code: '99416', carryover_finalized_units: 3 }, { service_code: 'MEETING', carryover_finalized_units: 2 }];
  overrides = [{ service_code: '99416', finalized_units: 4 }, { service_code: 'MEETING', finalized_units: 5 }, { service_code: '90834', finalized_units: 1 }];
  const result = await computeSchoolClientLeaveBasis(args);
  expect(result).toMatchObject({ complete: true, basisHours: .9, coverage: { carryoverReviewItems: 0, quantityOverrideReviewItems: 0 } });
  expect(result.reviewReasons).toEqual([]);
});
it('keeps unknown carryover and override code mappings in review rather than assuming non-service pay', async () => {
  carryovers = [{ service_code: 'UNKNOWN-CODE', carryover_finalized_units: 1 }];
  overrides = [{ service_code: 'UNKNOWN-CODE', finalized_units: 2 }];
  const result = await computeSchoolClientLeaveBasis(args);
  expect(result.complete).toBe(false);
  expect(result.reviewReasons).toContainEqual(expect.objectContaining({ code: 'school_carryover_attribution_required', reasonCodes: ['approved_code_mapping_missing'] }));
  expect(result.reviewReasons).toContainEqual(expect.objectContaining({ code: 'school_quantity_override_attribution_required', reasonCodes: ['approved_code_mapping_missing'] }));
  expect(m.execute.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
});
