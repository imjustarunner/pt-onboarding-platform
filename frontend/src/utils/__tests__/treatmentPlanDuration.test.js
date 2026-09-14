import { describe, expect, it } from 'vitest';
import {
  completionDateFromDurationMonths,
  durationLabel,
  parseScalePair,
  inferScaleDirection,
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

it('extracts stated ratings across anchors and competing time measurements', () => {
  const pair = parseScalePair('Within 6 months, reduce time spent worrying from up to 2 hours daily to less than 30 minutes daily. The client currently rates their ability to manage worry as an 8 on a 10-point scale, where 10 represents constant, overwhelming worry and 1 represents full control over their thought process. The client will work to reduce this self-reported rating to a 3 or lower.');
  expect(pair).toEqual({ scaleCurrent: 8, scaleTarget: 3 });
  expect(inferScaleDirection(pair.scaleCurrent, pair.scaleTarget)).toBe('decrease');
  expect(parseScalePair('Moving from a current self-rated 4 to a target of 8 on a 10-point scale.')).toEqual({ scaleCurrent: 4, scaleTarget: 8 });
});
