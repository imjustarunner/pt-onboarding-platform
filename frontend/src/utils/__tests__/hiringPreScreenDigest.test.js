import { describe, it, expect } from 'vitest';
import { digestPreScreenReport, buildOverviewHighlights } from '../hiringPreScreenDigest.js';

const SAMPLE = `
## Identity & Match Confidence
- High confidence match based on name, location, and UCHealth role on resume.

## Employment Verification
- UCHealth Memorial Hospital — Behavioral Health Specialist — public listings align with resume dates.

## Psychology Today (if found)
- Profile URL: https://www.psychologytoday.com/us/therapists/example
- License: LSW (Colorado)
- Specialties: anxiety, depression, trauma

## Job Match Summary
### Strengths
- Strong crisis intervention experience matches intern role.
- MSW practicum background aligns with clinical expectations.
- BLS certification and hospital setting experience.

### Weaknesses / discussion points
- Limited licensed independent practice hours.
- Practicum start date is future — confirm availability.

### Requirements checklist
- Meets: clinical skills listed on resume
- Partially meets: licensure timeline

## Discrepancies
- None significant found.
`;

describe('hiringPreScreenDigest', () => {
  it('extracts strengths and weaknesses from job match section', () => {
    const d = digestPreScreenReport(SAMPLE);
    expect(d.strengths.length).toBeGreaterThanOrEqual(2);
    expect(d.weaknesses.length).toBeGreaterThanOrEqual(2);
    expect(d.highlights[0]).toMatch(/crisis intervention/i);
  });

  it('builds overview highlights from pre-screen over resume bullets', () => {
    const h = buildOverviewHighlights({
      preScreenReportText: SAMPLE,
      resumeSummaryBullets: ['Most recent: Role at Employer.']
    });
    expect(h.some((x) => /crisis/i.test(x))).toBe(true);
    expect(h[0]).not.toMatch(/^Most recent:/);
  });
});
