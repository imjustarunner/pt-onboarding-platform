import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUSINESS_TYPE_SERVICE_SUITES,
  ITSCO_DIRECT_BOOKABLE_CODES
} from '../../config/tenantServiceSuiteCatalog.js';
import { PAYROLL_SERVICE_CODE_DEFAULTS } from '../payrollServiceCodeDefaults.js';

describe('tenantServiceSuiteCatalog', () => {
  it('seeds mental_health from the ITSCO pay / SERVICE_DESCRIPTIONS direct codes', () => {
    const suite = BUSINESS_TYPE_SERVICE_SUITES.mental_health;
    assert.ok(suite.services.length >= ITSCO_DIRECT_BOOKABLE_CODES.length);
    const byCode = Object.fromEntries(
      suite.services.filter((s) => s.serviceCode).map((s) => [s.serviceCode, s])
    );
    assert.equal(byCode['90791']?.name, 'Clinical intake');
    assert.equal(byCode['90837']?.name, 'Individual psychotherapy (60 min)');
    assert.equal(byCode.H0004?.serviceCode, 'H0004');
    assert.equal(byCode.H2015?.serviceCode, 'H2015');
    assert.equal(byCode.T1017?.serviceCode, 'T1017');
    assert.equal(byCode.S9454?.serviceCode, 'S9454');
    assert.ok(suite.packages.some((p) => p.sessionCount === 4));
  });

  it('covers every ITSCO direct bookable code listed for counseling', () => {
    const codes = new Set(
      BUSINESS_TYPE_SERVICE_SUITES.mental_health.services.map((s) => s.serviceCode)
    );
    for (const code of ITSCO_DIRECT_BOOKABLE_CODES) {
      assert.ok(codes.has(String(code).toUpperCase()), `missing ${code}`);
      assert.ok(PAYROLL_SERVICE_CODE_DEFAULTS.has(String(code).toUpperCase()), `not in pay dict ${code}`);
    }
  });

  it('gives tutoring / coaching / consulting simple session suites', () => {
    assert.equal(BUSINESS_TYPE_SERVICE_SUITES.tutoring.services[0].name, 'Tutoring session');
    assert.equal(BUSINESS_TYPE_SERVICE_SUITES.tutoring.services[0].serviceCode, 'TUTORING');
    assert.equal(BUSINESS_TYPE_SERVICE_SUITES.coaching.services[0].name, 'Coaching session');
    assert.equal(BUSINESS_TYPE_SERVICE_SUITES.consulting.services[0].name, 'Consultation');
    assert.equal(BUSINESS_TYPE_SERVICE_SUITES.consulting.packages[0].sessionCount, 3);
  });

  it('does not keep a separate healthcare suite (use mental_health)', () => {
    assert.equal(BUSINESS_TYPE_SERVICE_SUITES.healthcare, undefined);
    assert.ok(BUSINESS_TYPE_SERVICE_SUITES.mental_health);
  });
});
