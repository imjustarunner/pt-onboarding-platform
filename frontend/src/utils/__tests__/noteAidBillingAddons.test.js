import { describe, expect, it } from 'vitest';
import {
  resolveCrisis90839Billing,
  resolveExtendedEncounter90837,
  resolveNoteAidBillingCodes,
  isEligibleFor90785,
  shouldSuggest99051
} from '../noteAidBillingAddons.js';

describe('90839 crisis billing', () => {
  it('switches to 90832 when duration is 30 or less', () => {
    const r = resolveCrisis90839Billing({ durationMinutes: 30 });
    expect(r.primaryCode).toBe('90832');
    expect(r.switchedFrom).toBe('90839');
    expect(r.addons).toEqual([]);
  });

  it('keeps 90839 without 90840 under 75 minutes', () => {
    const r = resolveCrisis90839Billing({ durationMinutes: 74 });
    expect(r.primaryCode).toBe('90839');
    expect(r.addons).toEqual([]);
  });

  it('adds one 90840 at 75–104 minutes', () => {
    expect(resolveCrisis90839Billing({ durationMinutes: 75 }).addons).toEqual([
      { code: '90840', units: 1 }
    ]);
    expect(resolveCrisis90839Billing({ durationMinutes: 90 }).addons).toEqual([
      { code: '90840', units: 1 }
    ]);
  });

  it('adds two 90840 at 105–134 minutes', () => {
    expect(resolveCrisis90839Billing({ durationMinutes: 105 }).addons).toEqual([
      { code: '90840', units: 2 }
    ]);
    expect(resolveCrisis90839Billing({ durationMinutes: 135 }).addons).toEqual([
      { code: '90840', units: 3 }
    ]);
  });
});

describe('90837 extended encounter', () => {
  it('bills 90834 × 2 after 74 minutes and blocks 90785', () => {
    const r = resolveExtendedEncounter90837({
      durationMinutes: 75,
      includeInteractiveComplexity: true
    });
    expect(r.primaryCode).toBe('90834');
    expect(r.primaryUnits).toBe(2);
    expect(r.isExtendedEncounter).toBe(true);
    expect(r.allow90785).toBe(false);
  });
});

describe('90785 eligibility', () => {
  it('allows with 90834 single unit but not extended encounter', () => {
    expect(isEligibleFor90785('90834', { isExtendedEncounter: false })).toBe(true);
    expect(isEligibleFor90785('90834', { isExtendedEncounter: true })).toBe(false);
    expect(isEligibleFor90785('90837')).toBe(true);
    expect(isEligibleFor90785('90839')).toBe(false);
  });
});

describe('resolveNoteAidBillingCodes', () => {
  it('combines 90839 duration switch with after-hours', () => {
    const weekend = new Date('2026-09-05T10:00:00'); // Saturday
    const r = resolveNoteAidBillingCodes({
      primaryCode: '90839',
      durationMinutes: 90,
      includeAfterHours99051: false,
      sessionStartAt: weekend
    });
    expect(r.primaryCode).toBe('90839');
    expect(r.addons.some((a) => a.code === '90840' && a.units === 1)).toBe(true);
    expect(r.addons.some((a) => a.code === '99051')).toBe(true);
  });

  it('drops 90785 on extended 90837', () => {
    const r = resolveNoteAidBillingCodes({
      primaryCode: '90837',
      durationMinutes: 90,
      includeInteractiveComplexity: true
    });
    expect(r.primaryCode).toBe('90834');
    expect(r.primaryUnits).toBe(2);
    expect(r.addons.some((a) => a.code === '90785')).toBe(false);
  });
});

describe('99051 after hours', () => {
  it('suggests outside weekday 8–5', () => {
    expect(shouldSuggest99051(new Date('2026-09-02T07:30:00'))).toBe(true); // Wed 7:30
    expect(shouldSuggest99051(new Date('2026-09-02T12:00:00'))).toBe(false); // Wed noon
    expect(shouldSuggest99051(new Date('2026-09-02T17:00:00'))).toBe(true); // Wed 5pm
    expect(shouldSuggest99051(new Date('2026-09-05T12:00:00'))).toBe(true); // Sat
  });
});
