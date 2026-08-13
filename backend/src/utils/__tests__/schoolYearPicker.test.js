import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSchoolYearPickerOptions,
  priorSchoolYearsFromAvailable
} from '../../../../frontend/src/utils/schoolYear.js';

describe('school year picker helpers', () => {
  it('does not invent prior years by default', () => {
    const opts = buildSchoolYearPickerOptions(new Date('2026-08-13'));
    assert.deepEqual(opts, ['2026-2027']);
  });

  it('filters prior years from server list and excludes current', () => {
    const prior = priorSchoolYearsFromAvailable(
      ['2026-2027', '2025-2026', '2024-2025'],
      '2026-2027'
    );
    assert.deepEqual(prior, ['2025-2026', '2024-2025']);
  });
});
