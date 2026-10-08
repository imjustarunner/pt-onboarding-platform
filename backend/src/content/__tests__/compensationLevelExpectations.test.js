import {expect, it, vi} from 'vitest';
vi.mock('../../config/database.js', () => ({default: {execute: vi.fn()}}));
import {addLevelExpectationsToClauses} from '../compensationLevelExpectations.js';
import {commonAmendmentClauses, handbookSections} from '../itscoOctober2026Drafts.js';
import {cleanDraftHtml} from '../../services/compensationDraft.service.js';

it('inserts before signatures while preserving customized compensation and individual terms', () => {
  const existing = '<h3>1. Existing agreement</h3><p>Employee-specific approved wording.</p><h3>9. Employee acknowledgment and signatures</h3><p>Custom acknowledgment.</p>';
  const revised = addLevelExpectationsToClauses(existing);
  expect(revised).toContain('<p>Employee-specific approved wording.</p>');
  expect(revised).toContain('<h3>11. Employee acknowledgment and signatures</h3><p>Custom acknowledgment.</p>');
  expect(revised.indexOf('Weekly paid indirect-work commitment')).toBeLessThan(revised.indexOf('Employee acknowledgment and signatures'));
  expect(existing).not.toContain('Weekly paid indirect-work commitment');
});

it('survives saving in the draft editor and rerunning the seed without duplicating clauses', () => {
  const saved = cleanDraftHtml(commonAmendmentClauses('sick'));
  const revised = addLevelExpectationsToClauses(saved);
  expect(revised).toBe(saved);
  expect(revised.match(/<h3>\d+\./g)).toHaveLength(11);
  expect(handbookSections().filter(s => s.slug === 'compensation-level-expectations-and-review')).toHaveLength(1);
});

it('stops when a customized agreement lacks the expected signature location', () => {
  expect(() => addLevelExpectationsToClauses('<p>Independently authored agreement</p>')).toThrow('signature heading needs review');
});
