import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { execute: vi.fn() } }));
import pool from '../../config/database.js';
import clinicalPool from '../../config/clinicalDatabase.js';
import { buildIntakeAnswersText } from '../publicIntake.controller.js';

const signed = { authorizationAgreed: true, authorizationSignature: 'QA Adult',
  authorizationSignedAt: '2026-11-07T16:00:00.000Z', authorizationSourceMethod: 'typed_full_name' };
const answers = insuranceInfo => buildIntakeAnswersText({
  link: { form_type: 'intake', scope_type: 'agency', inherits_office_master: 1, intake_fields: [], intake_steps: [{ type: 'insurance_info' }] },
  intakeData: { intakeForSelf: true, responses: { submission: { insuranceInfo }, clients: [{}] } }
});
afterEach(() => {
  expect(pool.execute).not.toHaveBeenCalled();
  expect(clinicalPool.execute).not.toHaveBeenCalled();
});

it('prints a signed blank-policy Self-Pay agreement without inventing insurance coverage', () => {
  const text = answers({ isSelfPay: true, payerChoice: 'self_pay', primary: { insurerName: '', memberId: '' }, ...signed });
  expect(text).toContain('Payment choice: Self-Pay');
  expect(text).toContain('Authorization & Agreement — Electronic Signature');
  expect(text).toContain('Signed by: QA Adult');
  expect(text).toContain(`Signed at: ${signed.authorizationSignedAt}`);
  expect(text).toContain('Signature method: typed_full_name');
  expect(text).toContain('office will explain any patient responsibility');
  expect(text).not.toContain('Primary Insurance Carrier:');
  expect(text).not.toContain('assign all insurance benefits');
});

it('distinguishes Self-Pay choice from retained coverage and preserves Medicaid wording', () => {
  const text = answers({ isSelfPay: true, payerChoice: 'self_pay',
    primary: { insurerName: 'Commercial', memberId: 'QA-PRIMARY' },
    secondary: { insurerName: 'Medicaid', memberId: 'QA-SECONDARY', isMedicaid: true }, ...signed });
  expect(text).toContain('Payment choice: Self-Pay');
  expect(text).toContain('Primary Insurance Carrier: Commercial');
  expect(text).toContain('Primary Member ID: QA-PRIMARY');
  expect(text).toContain('Secondary Insurance Carrier: Medicaid');
  expect(text).toContain('Secondary Member ID: QA-SECONDARY');
  expect(text).toContain('Signed by: QA Adult');
  expect(text).not.toContain('Self-Pay / No Insurance');
  expect(text).not.toContain('I remain responsible for copays');
  expect(text).not.toContain('office will explain any patient responsibility');
});

it('includes a signature without carrier data without inferring Self-Pay', () => {
  const text = answers({ primary: {}, ...signed });
  expect(text).toContain('Signed by: QA Adult');
  expect(text).not.toContain('Self-Pay');
});

it('keeps an unsigned empty insurance section absent', () => {
  expect(answers({ primary: {} })).not.toContain('Insurance Information');
});

it('preserves the insurance assignment wording when insurance is selected', () => {
  const text = answers({ isSelfPay: false, payerChoice: 'insurance', primary: { insurerName: 'Commercial', memberId: 'QA-PRIMARY' }, ...signed });
  expect(text).toContain('Insurance Authorization & Assignment of Benefits — Electronic Signature');
  expect(text).toContain('assign all insurance benefits to the provider.');
  expect(text).toContain('Primary Insurance Carrier: Commercial');
  expect(text).toContain('Signed by: QA Adult');
  expect(text).not.toContain('Payment choice: Self-Pay');
});

it('keeps school-style Self-Pay without a signature or a fabricated member ID', () => {
  const text = answers({ isSelfPay: true, primary: { insurerName: 'Self-Pay', memberId: '' }, authorizationSourceMethod: 'self_pay' });
  expect(text).toContain('Payment choice: Self-Pay');
  expect(text).not.toContain('Electronic Signature');
  expect(text).not.toContain('Member ID:');
});
