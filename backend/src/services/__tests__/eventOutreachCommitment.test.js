import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import pool from '../../config/database.js';
import { readSignedAnnualEventTerms, summarizeOutreachCommitment, listOutstandingOutreachCommitments } from '../eventOutreachCommitment.service.js';
after(() => pool.end());

const clause = '<p>I agree to participate in a minimum of four (4) hours of assigned outreach or agency events during each calendar year, January 1 through December 31.</p><p>While school-assigned, the annual commitment is eight (8) hours total, including four (4) additional hours for school-related events.</p>';
const document = { user_id: 9, signed_document_id: 18, signed_at: '2026-07-01T12:00:00Z', signed_pdf_path: '/signed.pdf', pdf_hash: 'hash', task_status: 'completed', rendered_html: clause, task_metadata: { effectiveDate: '2026-07-10' }, school_assigned: 0 };
const claim = { id: 1, status: 'approved', claim_date: '2026-08-01', credits_hours: 2, payload_json: { companyEventId: 42 }, event_type: 'school_outreach' };
const summarize = (overrides = {}) => summarizeOutreachCommitment({ document, claims: [claim], calendarYear: 2026, asOfDate: '2026-10-24', ...overrides });

test('annual terms come from explicit signed wording and support independent school total', () => {
  assert.deepEqual(readSignedAnnualEventTerms(clause), { annualHours: 4, schoolAssignedAnnualHours: 8, schoolRelatedHours: 4 });
  assert.deepEqual(readSignedAnnualEventTerms(clause.replace('four (4)', 'six (6)')), { annualHours: 6, schoolAssignedAnnualHours: 8, schoolRelatedHours: 4 });
  assert.equal(readSignedAnnualEventTerms('Our current handbook encourages four hours of outreach'), null);
});
test('unsigned, consent-only, and incomplete tasks do not establish a commitment', () => {
  for (const change of [{ signed_at: null }, { signed_pdf_path: null }, { pdf_hash: null }, { task_status: 'pending' }]) assert.equal(summarize({ document: { ...document, ...change } }), null);
});
test('prospective effective date and signature date both gate the annual commitment', () => {
  assert.equal(summarize({ asOfDate: '2026-07-09' }), null);
  assert.equal(summarize({ document: { ...document, signed_at: '2026-11-01T12:00:00Z' } }), null);
  assert.equal(summarize().effectiveDate, '2026-07-10');
});
test('school total applies once across school assignments, without multiplying it', () => {
  assert.equal(summarize().requiredHours, 4);
  assert.equal(summarize({ document: { ...document, school_assigned: 1 } }).requiredHours, 8);
});
test('only approved actual time contributes; RSVP, travel and pending claims do not', () => {
  const claims = [claim, { ...claim, id: 2, status: 'submitted' }, { ...claim, id: 3, payload_json: { companyEventId: 42, eventWorkType: 'travel' } }, { ...claim, id: 4, payload_json: {} }, { ...claim, id: 5, event_type: 'company_event' }];
  assert.equal(summarize({ claims }).completedHours, 2);
});
test('annual reset excludes old years, pre-effective work and future work', () => {
  assert.equal(summarize({ claims: [claim, ...['2025-09-01', '2026-07-01', '2026-12-01'].map((date, i) => ({ ...claim, id: i + 2, claim_date: date }))] }).completedHours, 2);
  assert.equal(summarize({ calendarYear: 2027, asOfDate: '2027-01-01' }).completedHours, 0);
});
test('split claims count allocated hours once and remaining never becomes negative', () => {
  const first = { ...claim, payload_json: { companyEventId: 42, workedHours: 5 }, credits_hours: 2 };
  const second = { ...first, id: 2, credits_hours: 3 };
  const summary = summarize({ claims: [first, second, first] });
  assert.equal(summary.completedHours, 5);
  assert.equal(summary.remainingHours, 0);
});
test('signed date uses the event timezone at a calendar-year boundary', () => {
  const summary = summarize({ document: { ...document, signed_at: '2027-01-01T00:30:00Z', task_metadata: {} }, asOfDate: '2026-12-31' });
  assert.equal(summary.effectiveDate, '2026-12-31');
});
test('audience is agency-scoped and deduplicates signed amendments without fallback', async () => {
  let call = 0;
  const db = { execute: async (sql, params) => {
    call++;
    if (sql.includes('FROM signed_documents')) {
      assert.deepEqual(params, [2, 2]);
      assert.match(sql, /sd\.pdf_hash IS NOT NULL/);
      assert.match(sql, /ua\.is_active/);
      return [[document, { ...document, signed_document_id: 17 }]];
    }
    assert.match(sql, /c\.claim_type = 'skill_builder_event'/);
    return [[{ ...claim, user_id: 9 }]];
  } };
  const results = await listOutstandingOutreachCommitments({ agencyId: 2, eventDate: '2026-10-24', db });
  assert.equal(call, 2); assert.equal(results.length, 1); assert.equal(results[0].remainingHours, 2);
  assert.deepEqual(await listOutstandingOutreachCommitments({ agencyId: 2, eventDate: '2026-10-24', userIds: [10], db }), []);
});

test('empty audience distinguishes unrecognized signed terms from completed commitments', async () => {
  const db = { execute: async (sql) => sql.includes('FROM signed_documents')
    ? [[{ ...document, rendered_html: '<p>Unrecognized custom agreement</p>' }]] : [[]] };
  const result = await listOutstandingOutreachCommitments({ agencyId: 2, eventDate: '2026-10-24', includeAudit: true, db });
  assert.deepEqual(result.recipients, []);
  assert.equal(result.audit.unrecognizedTermsCount, 1);
  assert.equal(result.audit.completedCount, 0);
});

test('school closures and calendar markers cannot count as event work', () => {
  for (const event_type of ['school_first_day', 'school_day_off', 'school_holiday']) assert.equal(summarize({ claims: [{ ...claim, event_type }] }).completedHours, 0);
});
test('explicitly designated company events can satisfy the commitment', () => {
  assert.equal(summarize({ claims: [{ ...claim, event_type: 'company_event', operations_json: { countsTowardOutreachCommitment: true } }] }).completedHours, 2);
});
test('signature audit time, not the earlier consent record, starts the requirement', () => {
  const result = summarize({ document: { ...document, audit_trail: { signedAt: '2026-09-10T15:00:00Z' } } });
  assert.equal(result.effectiveDate, '2026-09-10'); assert.equal(result.completedHours, 0);
});
test('a later annual amendment does not erase work under an earlier signed annual amendment', async () => {
  const newer = { ...document, signed_document_id: 19, signed_at: '2026-09-01T15:00:00Z', task_metadata: {} };
  const db = { execute: async (sql) => sql.includes('FROM signed_documents')
    ? [[newer, document]] : [[{ ...claim, user_id: 9 }]] };
  const result = await listOutstandingOutreachCommitments({ agencyId: 2, eventDate: '2026-10-24', db });
  assert.equal(result[0].signedDocumentId, 19); assert.equal(result[0].effectiveDate, '2026-09-01');
  assert.equal(result[0].creditStartDate, '2026-07-10'); assert.equal(result[0].completedHours, 2);
});
test('school-specific signed hours cannot be satisfied solely by nonschool events', () => {
  const general = { ...claim, credits_hours: 8, event_type: 'company_event', operations_json: { countsTowardOutreachCommitment: true } };
  const result = summarize({ document: { ...document, school_assigned: 1 }, claims: [general] });
  assert.equal(result.remainingTotalHours, 0); assert.equal(result.remainingSchoolHours, 4); assert.equal(result.remainingHours, 4);
  const complete = summarize({ document: { ...document, school_assigned: 1 }, claims: [general, { ...claim, id: 2, credits_hours: 4 }] });
  assert.equal(complete.remainingHours, 0);
});
