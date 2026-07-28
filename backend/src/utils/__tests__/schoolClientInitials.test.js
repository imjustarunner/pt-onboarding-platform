import { describe, expect, it } from 'vitest';
import { deriveSchoolClientInitials, isValidSchoolClientInitials } from '../schoolClientInitials.js';

describe('schoolClientInitials', () => {
  it('derives first 3 + last 3 letters in uppercase', () => {
    expect(deriveSchoolClientInitials('Harry Potter')).toBe('HARPOT');
    expect(deriveSchoolClientInitials('Hermione Granger')).toBe('HERGRA');
    expect(deriveSchoolClientInitials('Justin Finch-Fletchley')).toBe('JUSFIN');
  });

  it('validates six uppercase letters', () => {
    expect(isValidSchoolClientInitials('HARPOT')).toBe(true);
    expect(isValidSchoolClientInitials('HP')).toBe(false);
    expect(isValidSchoolClientInitials('JohDoe')).toBe(false);
  });
});
