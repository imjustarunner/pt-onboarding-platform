import { describe, expect, it } from 'vitest';
import {
  completionDateFromDurationMonths,
  durationLabel,
  isObjectiveScaleValid
} from '../treatmentPlanDuration.js';

describe('treatmentPlanDuration', () => {
  it('computes completion date from duration months', () => {
    expect(completionDateFromDurationMonths(3, new Date('2026-08-26T12:00:00Z'))).toBe('2026-11-26');
  });

  it('labels month durations', () => {
    expect(durationLabel(1)).toBe('1 month');
    expect(durationLabel(4)).toBe('4 months');
  });

  it('validates 1-10 objective scales', () => {
    expect(isObjectiveScaleValid(9, 5)).toBe(true);
    expect(isObjectiveScaleValid(5, 5)).toBe(false);
  });
});
