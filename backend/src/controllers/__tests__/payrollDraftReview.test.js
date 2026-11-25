import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(), query: vi.fn(), getConnection: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../models/PayrollPeriod.model.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../../models/PayrollImport.model.js', () => ({ default: { findById: vi.fn(), listForPeriod: vi.fn() } }));
vi.mock('../../models/PayrollImportRow.model.js', () => ({ default: { findById: vi.fn(), listForImportId: vi.fn() } }));
vi.mock('../../models/PayrollImportRowAudit.model.js', () => ({ default: { saveDraftDecision: vi.fn(), listDraftReviews: vi.fn() } }));
import pool from '../../config/database.js';
import Period from '../../models/PayrollPeriod.model.js';
import Import from '../../models/PayrollImport.model.js';
import Row from '../../models/PayrollImportRow.model.js';
import Audit from '../../models/PayrollImportRowAudit.model.js';
import { getPayrollPeriodRawAudit, patchPayrollImportRow } from '../payroll.controller.js';
import { annotateDraftReviews, draftReviewAllowedForImport } from '../../services/payrollDraftReview.service.js';

const period = extra => ({ id: 11, agency_id: 6, status: 'posted', posted_at: '2026-10-27 18:00:00', ...extra });
const payrollImport = extra => ({ id: 15, agency_id: 6, payroll_period_id: 11, slot_number: 2, created_at: '2026-11-11 19:56:00', ...extra });
const row = extra => ({ id: 40, payroll_import_id: 15, payroll_period_id: 11, agency_id: 6, user_id: 532, provider_name: 'Test Employee', patient_first_name: 'Example', service_date: '2026-10-21', service_code: 'H0004', note_status: 'DRAFT', draft_payable: 1, row_fingerprint: 'session-40', ...extra });
const request = extra => ({ params: { rowId: '40' }, query: { allowPostedDraftReview: 'true' }, body: { draftPayable: true, draftReviewed: true }, user: { id: 9, role: 'super_admin' }, ...extra });
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });

beforeEach(() => {
  vi.clearAllMocks();
  Period.findById.mockResolvedValue(period());
  Import.findById.mockResolvedValue(payrollImport());
  Import.listForPeriod.mockResolvedValue([payrollImport({ id: 14, slot_number: 1, created_at: '2026-10-26 18:00:00' }), payrollImport()]);
  Row.findById.mockResolvedValue(row());
  Row.listForImportId.mockImplementation(async ({ payrollImportId }) => payrollImportId === 14 ? [row({ id: 39, payroll_import_id: 14, note_status: 'NO_NOTE', draft_payable: 0 })] : [row()]);
  Audit.saveDraftDecision.mockResolvedValue(undefined);
  Audit.listDraftReviews.mockResolvedValue([]);
  pool.execute.mockImplementation(async sql => sql.includes('SELECT id, organization_type FROM agencies') ? [[{ id: 6, organization_type: 'agency' }]] : [[]]);
});

it('requires payroll access before writing any draft choice or review record', async () => {
  const res = response(), next = vi.fn();
  await patchPayrollImportRow(request({ user: { id: 532, role: 'provider' } }), res, next);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(Audit.saveDraftDecision).not.toHaveBeenCalled();
});

it('allows an explicit decision on a new catch-up draft while preserving posted totals and status', async () => {
  const res = response(), next = vi.fn();
  await patchPayrollImportRow(request({ body: { draftPayable: false, draftReviewed: true } }), res, next);
  expect(next).not.toHaveBeenCalled();
  expect(Audit.saveDraftDecision).toHaveBeenCalledWith(expect.objectContaining({ row: expect.objectContaining({ id: 40 }), draftPayable: false, changedByUserId: 9, expectedPeriodStatus: 'posted' }));
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  expect(pool.execute.mock.calls.some(([sql]) => /DELETE FROM payroll_summaries|UPDATE payroll_periods/.test(sql))).toBe(false);
});

it('records confirmation of an unchanged default without invalidating an existing payroll run', async () => {
  Period.findById.mockResolvedValue(period({ status: 'ran' }));
  const res = response(), next = vi.fn();
  await patchPayrollImportRow(request({ query: {} }), res, next);
  expect(next).not.toHaveBeenCalled();
  expect(Audit.saveDraftDecision).toHaveBeenCalledTimes(1);
  expect(res.json).toHaveBeenCalledWith({ ok: true, draftReviewed: true, draftPayable: 1 });
  expect(pool.execute.mock.calls.some(([sql]) => /DELETE FROM payroll_summaries|UPDATE payroll_periods/.test(sql))).toBe(false);
});

it.each([
  ['original Run 1', { slot_number: 1 }, {}],
  ['import uploaded before posting', { created_at: '2026-10-27 17:00:00' }, {}],
  ['another agency import', { agency_id: 2 }, {}],
  ['missing explicit catch-up permission', {}, { query: {} }]
])('keeps %s locked', async (_label, importExtra, requestExtra) => {
  Import.findById.mockResolvedValue(payrollImport(importExtra));
  const res = response();
  await patchPayrollImportRow(request(requestExtra), res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(409);
  expect(Audit.saveDraftDecision).not.toHaveBeenCalled();
});

it('keeps a previously paid baseline session locked even in a later catch-up import', async () => {
  Row.listForImportId.mockImplementation(async ({ payrollImportId }) => payrollImportId === 14 ? [row({ id: 39, payroll_import_id: 14 })] : [row()]);
  const res = response();
  await patchPayrollImportRow(request(), res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(409);
  expect(Audit.saveDraftDecision).not.toHaveBeenCalled();
});

it('does not let a posted-processing flag bypass draft review locks', async () => {
  const res = response();
  await patchPayrollImportRow(request({ query: { allowPostedProcessing: 'true' }, body: { draftPayable: false, draftReviewed: true, processed: true } }), res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(409);
  expect(Audit.saveDraftDecision).not.toHaveBeenCalled();
});

it('does not treat no-note rows as reviewable drafts', async () => {
  Row.findById.mockResolvedValue(row({ note_status: 'NO_NOTE' }));
  const res = response();
  await patchPayrollImportRow(request(), res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(409);
  expect(Audit.saveDraftDecision).not.toHaveBeenCalled();
});

it('derives review persistence from the latest explicit decision matching the current choice', () => {
  const rows = [row(), row({ id: 41, draft_payable: 0 }), row({ id: 42 }), row({ id: 43, note_status: 'NO_NOTE' })];
  const audits = [
    { id: 1, payroll_import_row_id: 40, field_changed: 'draft_reviewed', to_value: '1', changed_at: '2026-11-11 20:00:00' },
    { id: 2, payroll_import_row_id: 41, field_changed: 'draft_payable', to_value: '0', changed_at: '2026-11-11 20:00:00' },
    { id: 3, payroll_import_row_id: 42, field_changed: 'draft_reviewed', to_value: '1', changed_at: '2026-11-11 20:00:00' },
    { id: 4, payroll_import_row_id: 42, field_changed: 'draft_reviewed', to_value: '0', changed_at: '2026-11-11 20:01:00' },
    { id: 5, payroll_import_row_id: 43, field_changed: 'draft_reviewed', to_value: '1', changed_at: '2026-11-11 20:01:00' }
  ];
  expect(annotateDraftReviews({ rows, audits }).map(item => item.draft_reviewed)).toEqual([true, true, false, false]);
});

it('uses the most recent posting/finalizing timestamp and exact period/agency identity for permission', () => {
  expect(draftReviewAllowedForImport({ period: period(), payrollImport: payrollImport() })).toBe(true);
  expect(draftReviewAllowedForImport({ period: period({ finalized_at: '2026-11-12 00:00:00' }), payrollImport: payrollImport() })).toBe(false);
  expect(draftReviewAllowedForImport({ period: period({ posted_at: null }), payrollImport: payrollImport() })).toBe(false);
  expect(draftReviewAllowedForImport({ period: period(), payrollImport: payrollImport({ payroll_period_id: 12 }) })).toBe(false);
});

it('returns saved review decisions and catch-up edit permissions after reopening the raw import', async () => {
  Audit.listDraftReviews.mockResolvedValue([{ id: 1, payroll_import_row_id: 40, field_changed: 'draft_reviewed', to_value: '1', changed_at: '2026-11-11 20:00:00' }]);
  const res = response(), next = vi.fn();
  await getPayrollPeriodRawAudit({ params: { id: '11' }, query: { importId: '15' }, user: { id: 9, role: 'super_admin' } }, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ rows: [expect.objectContaining({ id: 40, draft_reviewed: true })], imports: [expect.objectContaining({ id: 14, draft_review_allowed: false }), expect.objectContaining({ id: 15, draft_review_allowed: true })] }));
});

it('labels a unique changed client name as identity review rather than a fictitious code change',async()=>{
 const {computeRawRunDiffRows}=await import('../payroll.controller.js');
 const original=row({id:1,service_code:'90837',service_date:'2026-10-15',unit_count:1,note_status:'FINALIZED',patient_first_name:'Alexandra',row_fingerprint:'old',location:'Office'});
 const replacement={...original,id:2,patient_first_name:'Alexandria',row_fingerprint:'new'};
 const diff=computeRawRunDiffRows({baselineRows:[original],compareRows:[replacement]});
 expect(diff).toHaveLength(1);expect(diff[0]).toMatchObject({changeType:'identity_changed',from_service_code:'90837',to_service_code:'90837',metadata_json:{baselineRowId:1,compareRowId:2}});
});
it('does not pair two different named clients into a code change or silently discard their differences',async()=>{
 const {computeRawRunDiffRows}=await import('../payroll.controller.js');
 const original=row({id:1,service_code:'90837',unit_count:1,note_status:'FINALIZED',patient_first_name:'Alex',row_fingerprint:'old'});
 const diff=computeRawRunDiffRows({baselineRows:[original],compareRows:[{...original,id:2,service_code:'90834',patient_first_name:'Jordan',row_fingerprint:'new'}]});
 expect(diff.some(d=>d.changeType==='service_code_changed')).toBe(false);expect(diff).toHaveLength(2);
});
it('keeps a genuine same-client code change reviewable',async()=>{
 const {computeRawRunDiffRows}=await import('../payroll.controller.js');
 const original=row({id:1,service_code:'90837',unit_count:1,note_status:'FINALIZED',row_fingerprint:'old'});
 const diff=computeRawRunDiffRows({baselineRows:[original],compareRows:[{...original,id:2,service_code:'90834',row_fingerprint:'new'}]});
 expect(diff).toHaveLength(1);expect(diff[0].changeType).toBe('service_code_changed');
});
it('does not offer a name confirmation when unmatched sessions are ambiguous',async()=>{
 const {computeRawRunDiffRows}=await import('../payroll.controller.js');
 const original=row({id:1,service_code:'90837',unit_count:1,note_status:'FINALIZED',patient_first_name:'Alex',row_fingerprint:'old'});
 const diff=computeRawRunDiffRows({baselineRows:[original,{...original,id:3,patient_first_name:'Chris',row_fingerprint:'other'}],compareRows:[{...original,id:2,patient_first_name:'Jordan',row_fingerprint:'new'}]});
 expect(diff.some(d=>d.changeType==='identity_changed')).toBe(false);expect(diff).toHaveLength(3);
});
