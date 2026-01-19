import test from 'node:test';
import assert from 'node:assert/strict';

import PayrollPeriod from '../../models/PayrollPeriod.model.js';
import { CLAIM_DEADLINE_ERROR_MESSAGE, computeSubmissionWindow } from '../payrollSubmissionWindow.js';

function stubPeriods({ period, next }) {
  const origFindForAgencyByDate = PayrollPeriod.findForAgencyByDate;
  const origFindNextForAgencyAfter = PayrollPeriod.findNextForAgencyAfter;

  PayrollPeriod.findForAgencyByDate = async () => period;
  PayrollPeriod.findNextForAgencyAfter = async () => next;

  return () => {
    PayrollPeriod.findForAgencyByDate = origFindForAgencyByDate;
    PayrollPeriod.findNextForAgencyAfter = origFindNextForAgencyAfter;
  };
}

test('computeSubmissionWindow: before Sunday cutoff => suggest same pay period', async () => {
  const restore = stubPeriods({
    period: { id: 101, agency_id: 1, period_start: '2026-01-03', period_end: '2026-01-16' },
    next: { id: 102, agency_id: 1, period_start: '2026-01-17', period_end: '2026-01-30' }
  });
  try {
    // 2026-01-18 23:00 ET == 2026-01-19T04:00:00Z
    const submittedAt = new Date('2026-01-19T04:00:00Z');
    const out = await computeSubmissionWindow({
      agencyId: 1,
      effectiveDateYmd: '2026-01-16',
      submittedAt,
      timeZone: 'America/New_York'
    });
    assert.equal(out.ok, true);
    assert.equal(out.decision, 'same_period');
    assert.equal(out.suggestedPayrollPeriodId, 101);
  } finally {
    restore();
  }
});

test('computeSubmissionWindow: after Sunday cutoff => suggest next pay period', async () => {
  const restore = stubPeriods({
    period: { id: 201, agency_id: 1, period_start: '2026-01-03', period_end: '2026-01-16' },
    next: { id: 202, agency_id: 1, period_start: '2026-01-17', period_end: '2026-01-30' }
  });
  try {
    // 2026-01-19 00:00 ET == 2026-01-19T05:00:00Z
    const submittedAt = new Date('2026-01-19T05:00:00Z');
    const out = await computeSubmissionWindow({
      agencyId: 1,
      effectiveDateYmd: '2026-01-16',
      submittedAt,
      timeZone: 'America/New_York'
    });
    assert.equal(out.ok, true);
    assert.equal(out.decision, 'next_period');
    assert.equal(out.suggestedPayrollPeriodId, 202);
  } finally {
    restore();
  }
});

test('computeSubmissionWindow: after next period Sunday cutoff => reject', async () => {
  const restore = stubPeriods({
    period: { id: 301, agency_id: 1, period_start: '2026-01-03', period_end: '2026-01-16' },
    next: { id: 302, agency_id: 1, period_start: '2026-01-17', period_end: '2026-01-30' }
  });
  try {
    // 2026-02-02 00:00 ET == 2026-02-02T05:00:00Z
    const submittedAt = new Date('2026-02-02T05:00:00Z');
    const out = await computeSubmissionWindow({
      agencyId: 1,
      effectiveDateYmd: '2026-01-16',
      submittedAt,
      timeZone: 'America/New_York'
    });
    assert.equal(out.ok, false);
    assert.equal(out.status, 409);
    assert.equal(out.errorMessage, CLAIM_DEADLINE_ERROR_MESSAGE);
  } finally {
    restore();
  }
});

test('computeSubmissionWindow: handles DST boundary (America/New_York)', async () => {
  const restore = stubPeriods({
    period: { id: 401, agency_id: 1, period_start: '2026-02-21', period_end: '2026-03-06' },
    next: { id: 402, agency_id: 1, period_start: '2026-03-07', period_end: '2026-03-20' }
  });
  try {
    // After DST starts (Mar 8, 2026), NY is UTC-4.
    // 2026-03-08 23:30 ET == 2026-03-09T03:30:00Z
    const submittedAt = new Date('2026-03-09T03:30:00Z');
    const out = await computeSubmissionWindow({
      agencyId: 1,
      effectiveDateYmd: '2026-03-06',
      submittedAt,
      timeZone: 'America/New_York'
    });
    assert.equal(out.ok, true);
    assert.ok(out.cutoffs?.cutoffSameUtc instanceof Date);
  } finally {
    restore();
  }
});

