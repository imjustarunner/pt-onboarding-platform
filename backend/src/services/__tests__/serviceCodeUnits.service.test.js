import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMedicaid8MinuteBands,
  resolveSessionBilling,
  resolveWithOverflowChain
} from '../serviceCodeUnits.service.js';

test('Medicaid 8-minute bands: 1 unit 8–22, 2 units 23–37', () => {
  const bands = buildMedicaid8MinuteBands({ unitMinutes: 15, maxUnits: 4, minMinutes: 8 });
  assert.deepEqual(bands[0], { units: 1, minMinutes: 8, maxMinutes: 22 });
  assert.deepEqual(bands[1], { units: 2, minMinutes: 23, maxMinutes: 37 });
  assert.deepEqual(bands[2], { units: 3, minMinutes: 38, maxMinutes: 52 });
  assert.deepEqual(bands[3], { units: 4, minMinutes: 53, maxMinutes: 67 });
});

test('below minimum is not claimable', () => {
  const r = resolveSessionBilling({
    minutes: 7,
    serviceCode: '97110',
    unitCalcMode: 'MEDICAID_8_MINUTE_LADDER',
    unitMinutes: 15,
    minMinutes: 8,
    maxUnitsPerSession: 4
  });
  assert.equal(r.claimable, false);
  assert.match(r.reason || '', /below minimum/i);
});

test('ladder maps duration to units', () => {
  const r = resolveSessionBilling({
    minutes: 30,
    serviceCode: '97110',
    unitCalcMode: 'MEDICAID_8_MINUTE_LADDER',
    unitMinutes: 15,
    minMinutes: 8,
    maxUnitsPerSession: 8
  });
  assert.equal(r.claimable, true);
  assert.equal(r.units, 2);
});

test('single-unit codes bill 1 unit', () => {
  const r = resolveSessionBilling({
    minutes: 53,
    serviceCode: '90837',
    unitCalcMode: 'SINGLE',
    minMinutes: 53
  });
  assert.equal(r.claimable, true);
  assert.equal(r.units, 1);
});

test('overflow switches code and re-resolves', () => {
  const primary = {
    serviceCode: '90834',
    unitCalcMode: 'SINGLE',
    minMinutes: 38,
    maxMinutes: 52,
    overflowServiceCode: '90837',
    overflowAtMinutes: 53
  };
  const result = resolveWithOverflowChain(60, primary, (code) => {
    if (code === '90837') {
      return { serviceCode: '90837', unitCalcMode: 'SINGLE', minMinutes: 53 };
    }
    return null;
  });
  assert.equal(result.overflowApplied, true);
  assert.equal(result.effectiveServiceCode, '90837');
  assert.equal(result.claimable, true);
  assert.equal(result.units, 1);
});

test('max without overflow is not claimable', () => {
  const r = resolveSessionBilling({
    minutes: 90,
    serviceCode: '90834',
    unitCalcMode: 'SINGLE',
    minMinutes: 38,
    maxMinutes: 52
  });
  assert.equal(r.claimable, false);
  assert.match(r.reason || '', /exceeds maximum/i);
});
