import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  nthWeekdayOfMonth,
  lastWeekdayOfMonth,
  springUpdateOpensAt,
  springUpdateDueAt,
  julyRolloverAt,
  fallConfirmationDueAt,
  isSpringUpdateOpenDay,
  isJulyRolloverDay
} from '../schoolYearCalendar.js';
import { computeCurrentSchoolYearLabel } from '../schoolYear.js';

describe('schoolYearCalendar', () => {
  it('computes 2nd Monday of May 2026', () => {
    const d = springUpdateOpensAt(2026);
    assert.ok(d);
    assert.equal(d.getFullYear(), 2026);
    assert.equal(d.getMonth(), 4);
    assert.equal(d.getDate(), 11); // May 11, 2026 is 2nd Monday
    assert.equal(d.getDay(), 1);
  });

  it('computes last Friday of May 2026', () => {
    const d = springUpdateDueAt(2026);
    assert.equal(d.getDate(), 29);
    assert.equal(d.getDay(), 5);
  });

  it('computes last Monday of July 2026', () => {
    const d = julyRolloverAt(2026);
    assert.equal(d.getMonth(), 6);
    assert.equal(d.getDate(), 27);
    assert.equal(d.getDay(), 1);
  });

  it('computes 2nd Monday of August 2026', () => {
    const d = fallConfirmationDueAt(2026);
    assert.equal(d.getDate(), 10);
    assert.equal(d.getDay(), 1);
  });

  it('nthWeekdayOfMonth / lastWeekdayOfMonth basics', () => {
    const firstMon = nthWeekdayOfMonth(2026, 5, 1, 1);
    assert.equal(firstMon.getDate(), 4);
    const lastFri = lastWeekdayOfMonth(2026, 5, 5);
    assert.equal(lastFri.getDate(), 29);
  });

  it('day detectors', () => {
    assert.equal(isSpringUpdateOpenDay(new Date(2026, 4, 11)), true);
    assert.equal(isSpringUpdateOpenDay(new Date(2026, 4, 12)), false);
    assert.equal(isJulyRolloverDay(new Date(2026, 6, 27)), true);
  });
});

describe('computeCurrentSchoolYearLabel (last Monday July)', () => {
  it('before July uses prior year', () => {
    assert.equal(computeCurrentSchoolYearLabel(new Date(2026, 5, 15)), '2025-2026');
  });

  it('early July before last Monday stays prior year', () => {
    assert.equal(computeCurrentSchoolYearLabel(new Date(2026, 6, 1)), '2025-2026');
  });

  it('on/after last Monday of July switches', () => {
    assert.equal(computeCurrentSchoolYearLabel(new Date(2026, 6, 27)), '2026-2027');
    assert.equal(computeCurrentSchoolYearLabel(new Date(2026, 7, 1)), '2026-2027');
  });
});
