import { it, expect } from 'vitest';
import { SCHOOL_SUPPORT_SECTION, SCHOOL_SUPPORT_CLAUSE } from '../compensationHandbookClarifications.js';
import { SCHOOL_SUPPORT_NOVEMBER_UPDATE, applySchoolSupportHandbookAmendment, SCHOOL_SUPPORT_HANDBOOK_SLUG } from '../schoolSupportHandbookAmendment.js';

it('directs current school-support claims to unrestricted temporary self-service until EHR integration', () => {
  for (const text of [SCHOOL_SUPPORT_SECTION.bodyHtml, SCHOOL_SUPPORT_CLAUSE, SCHOOL_SUPPORT_NOVEMBER_UPDATE.changedContent]) {
    expect(text).toContain('Until EHR integration');
    expect(text).toContain('available');
    expect(text).toContain('payroll approval');
    expect(text).not.toContain('open the actual');
    expect(text).not.toContain('Earlier earned balance requests');
    expect(text).not.toContain('Use up to 1 hour');
  }
  expect(SCHOOL_SUPPORT_SECTION.bodyHtml).toContain('not limited to one hour');
  expect(SCHOOL_SUPPORT_SECTION.bodyHtml).toContain('2 School Support Hours per 25 verified');
  expect(SCHOOL_SUPPORT_SECTION.bodyHtml).toContain('20-hour balance cap');
  expect(SCHOOL_SUPPORT_SECTION.bodyHtml).toContain('Earlier pending requests reserve availability');
});

it('uses the same temporary instructions in the ITSCO reference handbook while preserving its public anchor', () => {
  const book = { sections: [{ slug: SCHOOL_SUPPORT_HANDBOOK_SLUG, bodyHtml: 'Old session-link instructions.' }, { slug: 'other-policy', bodyHtml: 'Keep this policy.' }] };
  applySchoolSupportHandbookAmendment(book, 'itsco');
  expect(book.sections[0].slug).toBe(SCHOOL_SUPPORT_HANDBOOK_SLUG);
  expect(book.sections[0].bodyHtml).toContain('Submit School Support Hours');
  expect(book.sections[0].bodyHtml).toContain('No attachment, explanation, appointment link or payroll approval');
  expect(book.sections[1].bodyHtml).toBe('Keep this policy.');
});
