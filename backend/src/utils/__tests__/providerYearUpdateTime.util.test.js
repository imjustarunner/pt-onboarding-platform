import { describe, expect, it } from 'vitest';
import { estimateActiveSecondsFromTimestamps } from '../providerYearUpdateTime.util.js';

describe('estimateActiveSecondsFromTimestamps', () => {
  it('returns 0 when there is no activity', () => {
    expect(estimateActiveSecondsFromTimestamps([])).toBe(0);
  });

  it('credits tail time for a single visit', () => {
    expect(estimateActiveSecondsFromTimestamps([Date.parse('2026-08-01T10:00:00Z')])).toBe(90);
  });

  it('sums capped gaps within a session', () => {
    const t0 = Date.parse('2026-08-01T10:00:00Z');
    const t1 = t0 + 5 * 60 * 1000;
    const t2 = t1 + 8 * 60 * 1000;
    // 5m + 8m + 90s tail
    expect(estimateActiveSecondsFromTimestamps([t0, t1, t2])).toBe(300 + 480 + 90);
  });

  it('applies a section-review floor', () => {
    expect(
      estimateActiveSecondsFromTimestamps([], { reviewedSectionCount: 4 })
    ).toBe(480);
  });

  it('uses cycle span only when there are no timestamps', () => {
    expect(
      estimateActiveSecondsFromTimestamps([], { cycleSpanSec: 45 * 60 })
    ).toBe(45 * 60);
  });
});
