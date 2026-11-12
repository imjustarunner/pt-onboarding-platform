import { describe, it, expect } from 'vitest';
import { childcareCountPayload, resolvedChildcareBands } from '../childcarePresentation';
describe('childcare attendance and schedule presentation', () => {
  it('keeps the planned confirmation distinct from actual attendance changes and missing attendance', () => {
    expect(childcareCountPayload('planned', '', 5)).toEqual({ confirmPlannedCount: true, actualChildren: 5 });
    expect(childcareCountPayload('actual', '0', 5)).toEqual({ confirmPlannedCount: false, actualChildren: 0 });
    expect(childcareCountPayload('later', '', 5)).toEqual({});
    for (const value of ['', '-1', '1.5', 'not a count']) expect(() => childcareCountPayload('actual', value, 5)).toThrow();
    expect(() => childcareCountPayload('', '', 5)).toThrow();
  });
  it('uses a specific override before an existing flat schedule and never reads a clinical rate', () => {
    expect(resolvedChildcareBands({ category: 4, level: 3, flatRate: 31, overrides: { 3: 38 }, policy: { creditRate: 90 } })).toEqual({ 1: 31, 2: 31, 3: 38, 4: 31 });
  });
});
