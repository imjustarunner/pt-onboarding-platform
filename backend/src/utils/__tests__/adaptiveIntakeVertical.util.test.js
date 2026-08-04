import { describe, expect, it } from 'vitest';

/** Mirror of verticalFromOrgType in adaptiveIntake.service.js for unit coverage without DB. */
function verticalFromOrgType(organizationType) {
  const t = String(organizationType || 'agency').toLowerCase();
  if (t === 'life_coach') return 'life_coach';
  if (t === 'consultant') return 'consultant';
  if (t === 'tutoring' || t === 'learning') return 'tutoring';
  return 'clinical';
}

describe('adaptive intake vertical mapping', () => {
  it('maps practitioner org types', () => {
    expect(verticalFromOrgType('life_coach')).toBe('life_coach');
    expect(verticalFromOrgType('consultant')).toBe('consultant');
    expect(verticalFromOrgType('tutoring')).toBe('tutoring');
  });

  it('defaults clinical for agency / school', () => {
    expect(verticalFromOrgType('agency')).toBe('clinical');
    expect(verticalFromOrgType('school')).toBe('clinical');
    expect(verticalFromOrgType(null)).toBe('clinical');
  });
});
