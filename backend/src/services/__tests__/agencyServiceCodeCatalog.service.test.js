import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isClinicalBookableCode,
  normalizeServiceCode
} from '../agencyServiceCodeCatalog.service.js';
import { PAYROLL_SERVICE_CODE_DEFAULTS } from '../payrollServiceCodeDefaults.js';
import { ITSCO_DIRECT_BOOKABLE_CODES } from '../../config/tenantServiceSuiteCatalog.js';

describe('agencyServiceCodeCatalog', () => {
  it('normalizes codes', () => {
    assert.equal(normalizeServiceCode(' 90837 '), '90837');
    assert.equal(normalizeServiceCode('h2014'), 'H2014');
  });

  it('treats ITSCO direct counseling codes as clinical bookable', () => {
    for (const code of ITSCO_DIRECT_BOOKABLE_CODES) {
      assert.ok(isClinicalBookableCode(code), code);
    }
  });

  it('keeps payroll-only codes out of clinical booking mirror', () => {
    assert.equal(isClinicalBookableCode('MILEAGE'), false);
    assert.equal(isClinicalBookableCode('ADMIN TIME'), false);
    assert.equal(isClinicalBookableCode('BONUS'), false);
    assert.equal(isClinicalBookableCode('MEETING'), false);
    assert.equal(isClinicalBookableCode('INDIRECT TIME'), false);
  });

  it('includes tutoring as a shared clinical/payroll code', () => {
    assert.ok(isClinicalBookableCode('TUTORING'));
    assert.ok(PAYROLL_SERVICE_CODE_DEFAULTS.has('TUTORING'));
  });
});
