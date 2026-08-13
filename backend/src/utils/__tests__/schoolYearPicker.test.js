import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSchoolYearPickerOptions,
  previousSchoolYearLabel,
  priorSchoolYearsFromAvailable,
  schoolYearDateRange
} from '../schoolYear.js';

describe('school year picker helpers', () => {
  it('does not invent prior years by default', () => {
    const opts = buildSchoolYearPickerOptions(new Date('2026-08-13'));
    assert.deepEqual(opts, ['2026-2027']);
  });

  it('computes the prior school-year label', () => {
    assert.equal(previousSchoolYearLabel('2026-2027'), '2025-2026');
  });

  it('uses last Monday of July for school-year date bounds', () => {
    const range = schoolYearDateRange('2026-2027');
    assert.equal(range.schoolYear, '2026-2027');
    assert.equal(range.startYmd, '2026-07-27');
    assert.equal(range.endYmdExclusive, '2027-07-26');
  });

  it('filters prior years from server list and excludes current', () => {
    const prior = priorSchoolYearsFromAvailable(
      ['2026-2027', '2025-2026', '2024-2025'],
      '2026-2027'
    );
    assert.deepEqual(prior, ['2025-2026', '2024-2025']);
  });
});
