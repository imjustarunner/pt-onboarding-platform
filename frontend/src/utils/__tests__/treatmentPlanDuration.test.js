import { describe, expect, it } from 'vitest';
import {
  completionDateFromDurationMonths,
  durationLabel,
  isObjectiveScaleValid,
  DURATION_PRESETS,
  projectedDurationMonths,
  setObjectiveCompletionTime
} from '../treatmentPlanDuration.js';

describe('treatmentPlanDuration', () => {
  it('selects a completion deadline without changing ratings, measurement periods, or other milestones', () => {
    expect(DURATION_PRESETS).toContain(2);
    expect(DURATION_PRESETS).toContain(8);
    expect(projectedDurationMonths('8 months')).toBe(8);
    expect(setObjectiveCompletionTime('Within 3 months, practice coping 4 days a week from a rating of 8 to 3. Check progress after 2 weeks.', 8))
      .toBe('Within 8 months, practice coping 4 days a week from a rating of 8 to 3. Check progress after 2 weeks.');
    expect(setObjectiveCompletionTime('Within six months, improve coping.', 2)).toBe('Within 2 months, improve coping.');
    expect(setObjectiveCompletionTime('Practice coping weekly.', 4)).toBe('Within 4 months, Practice coping weekly.');
  });
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
