import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withOfficeReferralSource, OFFICE_REFERRAL_SOURCE_KEY } from '../officeReferralSource.js';

const agency = { slug: 'itsco' };
const office = { scope_type: 'agency', form_type: 'intake', intake_fields: [{ key: 'existing' }] };

test('office question is optional, shared across household paths, and preserves existing fields', () => {
  const result = withOfficeReferralSource(office, agency);
  const question = result.intake_fields.at(-1);
  assert.equal(question.key, OFFICE_REFERRAL_SOURCE_KEY);
  assert.equal(question.required, false);
  assert.equal(question.scope, 'submission');
  assert.equal(result.intake_fields[0], office.intake_fields[0]);
  assert.equal(office.intake_fields.length, 1);
  assert.equal(withOfficeReferralSource(result, agency), result);
});

test('school, other agencies, non-enrollment and other service channels are untouched', () => {
  for (const link of [
    { ...office, scope_type: 'school' },
    { ...office, inherits_school_master: 1 },
    { ...office, form_type: 'smart_school_roi' },
    { ...office, form_type: 'job_application' },
    { ...office, master_channel: 'tutoring' },
    { ...office, custom_messages: { serviceScope: 'coaching' } }
  ]) assert.equal(withOfficeReferralSource(link, agency), link);
  assert.equal(withOfficeReferralSource(office, { slug: 'other' }), office);
});

test('Spanish office forms receive a Spanish optional question', () => {
  const question = withOfficeReferralSource({ ...office, language_code: 'es' }, agency).intake_fields.at(-1);
  assert.match(question.label, /Opcional/);
  assert.match(question.helperText, /evento/);
  assert.equal(question.required, false);
});

test('the counseling channel receives the question', () => {
  assert.equal(withOfficeReferralSource({ ...office, master_channel: 'counseling' }, agency).intake_fields.at(-1).key, OFFICE_REFERRAL_SOURCE_KEY);
});

test('completed records retain the answer with a readable label after a master reload', async () => {
  const { buildCompletedIntakeRecord } = await import('../../services/completedIntakeRecord.service.js');
  const record = buildCompletedIntakeRecord({
    agency, link: office,
    submission: { intake_data: { responses: { submission: { office_referral_source: 'FRC Trunk or Treat' } } } }
  });
  const rows = record.sections.flatMap(section => section.rows || []);
  assert.ok(rows.some(row => row.label === 'How did you hear about the agency?' && row.value === 'FRC Trunk or Treat'));
});
