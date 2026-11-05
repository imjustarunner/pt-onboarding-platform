import { expect, it } from 'vitest';
import { letterMatchSql } from '../letterMatch.js';

it('matches misplaced letters without treating punctuation as part of the name', () => {
  const match = letterMatchSql(['c.full_name', 'c.initials'], 'tSe-t%');
  expect(match.sql).toContain('REPLACE');
  expect(match.params).toEqual(['t', 2, 's', 1, 'e', 1]);
  expect(match.sql).not.toContain('%');
  expect(letterMatchSql(['c.full_name'], '   ').sql).toBe('1=1');
});
