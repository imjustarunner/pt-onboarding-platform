import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../models/PayrollPeriod.model.js', () => ({ default: { findById: vi.fn(), listByAgency: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../models/PayrollSummary.model.js', () => ({ default: { listForPeriod: vi.fn() } }));
vi.mock('../../services/payrollReportEmail.service.js', () => ({ default: { status: vi.fn(), deliver: vi.fn() } }));
vi.mock('../../services/payrollNotesAging.service.js', () => ({ default: { emitTwoPeriodsOldUnpaidNotesAlerts: vi.fn(), emitMissingNotesReminderOnPost: vi.fn() } }));
vi.mock('../../services/officeScheduleReview.service.js', () => ({ OfficeScheduleReviewService: { emitBiweeklyReviewNotifications: vi.fn() } }));
vi.mock('../../services/payrollPto.service.js', async importOriginal => ({ ...await importOriginal(), getAgencyPtoPolicy: vi.fn(), runPtoAccrualForPostedPeriod: vi.fn() }));
import pool from '../../config/database.js';
import Period from '../../models/PayrollPeriod.model.js';
import Summary from '../../models/PayrollSummary.model.js';
import ReportEmail from '../../services/payrollReportEmail.service.js';
import { getAgencyPtoPolicy, runPtoAccrualForPostedPeriod } from '../../services/payrollPto.service.js';
import { postPayrollPeriod, getPayrollReportEmailStatus, sendPayrollReportEmail, downloadPayrollExportCsv } from '../payroll.controller.js';

let period, winPost, summaryCount;
const req = (changes = {}) => ({ params: { id: '912' }, user: { id: 99, role: 'super_admin' }, method: 'POST', body: {}, ...changes });
const res = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn(), send: vi.fn(), setHeader: vi.fn() });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-11T20:00:00Z'));
  period = { id: 912, agency_id: 6, status: 'ran', period_start: '2026-10-24', period_end: '2026-11-06', ran_at: '2026-11-11 19:00:00' };
  winPost = true; summaryCount = 1;
  Period.findById.mockImplementation(async () => ({ ...period }));
  Summary.listForPeriod.mockResolvedValue([{ user_id: 532, first_name: 'Synthetic', last_name: 'Employee', direct_hours: 14, total_amount: 504, breakdown: { H0004: { hours: 14, units: 56, amount: 504, bucket: 'direct' } } }]);
  getAgencyPtoPolicy.mockResolvedValue({ policy: {} }); runPtoAccrualForPostedPeriod.mockResolvedValue({ ok: true });
  ReportEmail.status.mockResolvedValue({ status: 'sent', configured: true });
  ReportEmail.deliver.mockResolvedValue({ status: 'sent', mailbox: 'payroll@agency.example' });
  pool.execute.mockImplementation(async sql => {
    if (sql.includes('SELECT id, organization_type FROM agencies')) return [[{ id: 6, organization_type: 'agency' }]];
    if (sql.includes('COUNT(1) AS cnt FROM payroll_summaries')) return [[{ cnt: summaryCount }]];
    if (sql.includes("SET status = 'posted'")) {
      period.status = 'posted'; period.posted_at = '2026-11-11 20:00:00';
      return [{ affectedRows: winPost ? 1 : 0 }];
    }
    return [[]];
  });
});
afterEach(() => vi.useRealTimers());

it('emails only the successful ran-to-posted transition and returns the actual posted state', async () => {
  const response = res(), next = vi.fn();
  await postPayrollPeriod(req(), response, next);
  expect(next).not.toHaveBeenCalled();
  expect(ReportEmail.deliver).toHaveBeenCalledWith(expect.objectContaining({ agencyId: 6, payrollPeriodId: 912, actorUserId: 99, trigger: 'post' }));
  expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'posted', reportEmail: { status: 'sent', mailbox: 'payroll@agency.example' } }));
  await postPayrollPeriod(req(), res(), next);
  expect(ReportEmail.deliver).toHaveBeenCalledTimes(1);
});

it('does not email a rejected run or a concurrent post request that did not win the status transition', async () => {
  summaryCount = 0;
  const rejected = res(); await postPayrollPeriod(req(), rejected, vi.fn());
  expect(rejected.status).toHaveBeenCalledWith(409); expect(ReportEmail.deliver).not.toHaveBeenCalled();
  summaryCount = 1; winPost = false;
  await postPayrollPeriod(req(), res(), vi.fn());
  expect(ReportEmail.deliver).not.toHaveBeenCalled();
});

it('keeps payroll posted and exposes a separate email failure when configuration or delivery is unavailable', async () => {
  ReportEmail.deliver.mockRejectedValue(Object.assign(new Error('Synthetic unavailable'), { code: 'PAYROLL_REPORT_EMAIL_UNAVAILABLE' }));
  const response = res(), next = vi.fn(); await postPayrollPeriod(req(), response, next);
  expect(next).not.toHaveBeenCalled();
  expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'posted', reportEmail: { status: 'failed', errorCode: 'PAYROLL_REPORT_EMAIL_UNAVAILABLE' } }));
});

it('uses the exact existing reconciliation download for an explicit resend attachment', async () => {
  period.status = 'posted';
  const download = res(); await downloadPayrollExportCsv(req({ method: 'GET' }), download, vi.fn());
  const response = res(); await sendPayrollReportEmail(req({ body: { idempotencyKey: 'synthetic-resend-key' } }), response, vi.fn());
  const args = ReportEmail.deliver.mock.calls[0][0];
  expect(args).toMatchObject({ agencyId: 6, payrollPeriodId: 912, actorUserId: 99, trigger: 'manual', idempotencyKey: 'synthetic-resend-key' });
  expect(await args.buildAttachment()).toEqual({ filename: '2026-10-24-2026-11-06.csv', csv: download.send.mock.calls[0][0] });
});

it('checks payroll access on status and resend, and rejects recipient overrides', async () => {
  for (const handler of [getPayrollReportEmailStatus, sendPayrollReportEmail]) {
    const response = res(); await handler(req({ user: { id: 532, role: 'provider' } }), response, vi.fn());
    expect(response.status).toHaveBeenCalledWith(403);
  }
  expect(ReportEmail.status).not.toHaveBeenCalled(); expect(ReportEmail.deliver).not.toHaveBeenCalled();
  const response = res(); await sendPayrollReportEmail(req({ body: { idempotencyKey: 'synthetic-resend-key', to: 'arbitrary@example.test' } }), response, vi.fn());
  expect(response.status).toHaveBeenCalledWith(400); expect(ReportEmail.deliver).not.toHaveBeenCalled();
});
