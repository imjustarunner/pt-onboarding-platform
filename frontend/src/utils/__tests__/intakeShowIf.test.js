import { describe, expect, it } from 'vitest';
import { matchesShowIf, normalizeShowIfList, childAgeFlags } from '../intakeShowIf.js';

describe('intakeShowIf', () => {
  it('normalizes checkbox-group arrays and JSON strings', () => {
    expect(normalizeShowIfList(['Working', 'Other'])).toEqual(['working', 'other']);
    expect(normalizeShowIfList('["working","school"]')).toEqual(['working', 'school']);
  });

  it('matches scalar equals and array equals', () => {
    expect(matchesShowIf({ fieldKey: 'a', equals: 'yes' }, { a: 'yes' })).toBe(true);
    expect(matchesShowIf({ fieldKey: 'a', equals: ['yes', 'not_sure'] }, { a: 'not_sure' })).toBe(true);
    expect(matchesShowIf({ fieldKey: 'a', equals: 'yes' }, { a: 'no' })).toBe(false);
  });

  it('expands when any checkbox value other than none is selected', () => {
    const cond = { fieldKey: 'recent_symptoms', notEquals: 'none' };
    expect(matchesShowIf(cond, { recent_symptoms: ['none'] })).toBe(false);
    expect(matchesShowIf(cond, { recent_symptoms: [] })).toBe(false);
    expect(matchesShowIf(cond, { recent_symptoms: ['panic'] })).toBe(true);
    expect(matchesShowIf(cond, { recent_symptoms: ['panic', 'none'] })).toBe(true);
  });

  it('matches includes for a specific checkbox value', () => {
    const cond = { fieldKey: 'recent_symptoms', includes: 'feeling_unusually_energetic' };
    expect(matchesShowIf(cond, { recent_symptoms: ['panic'] })).toBe(false);
    expect(matchesShowIf(cond, { recent_symptoms: ['feeling_unusually_energetic'] })).toBe(true);
  });

  it('supports any/all compound conditions', () => {
    const cond = {
      any: [
        { fieldKey: 'alcohol_use', includesAny: ['weekly', 'daily'] },
        { fieldKey: 'other_substances', equals: 'yes' }
      ]
    };
    expect(matchesShowIf(cond, { alcohol_use: 'never', other_substances: 'no' })).toBe(false);
    expect(matchesShowIf(cond, { alcohol_use: 'weekly', other_substances: 'no' })).toBe(true);
    expect(matchesShowIf(cond, { alcohol_use: 'never', other_substances: 'yes' })).toBe(true);
  });

  it('marks substance indicated only from presenting concerns, not age', () => {
    const teen = childAgeFlags('2012-01-15', { presenting_concerns: ['worry_anxiety'] });
    expect(teen._substance_indicated).toBe('no');
    expect(teen._age_gte_11).toBe('yes');
    const flagged = childAgeFlags('2018-06-01', { presenting_concerns: ['substance_use'] });
    expect(flagged._substance_indicated).toBe('yes');
  });
});
