import { describe, it, expect } from 'vitest';
import {isoToZonedDatetimeLocal,zonedDatetimeLocalToIso} from '../timezones';
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

it('preserves actual seconds through childcare time correction in the event timezone',()=>{const iso='2026-11-15T06:37:48.000Z';const wall=isoToZonedDatetimeLocal(iso,'America/Denver',{includeSeconds:true});expect(wall).toBe('2026-11-14T23:37:48');expect(zonedDatetimeLocalToIso(wall,'America/Denver')).toBe(iso);expect(zonedDatetimeLocalToIso(wall+'.000','America/Denver')).toBe(iso);expect(isoToZonedDatetimeLocal(iso,'America/Denver')).toBe('2026-11-14T23:37');});
