import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeJobDescriptionSections,
  normalizeResponsibilitySets
} from '../jobDescriptionSectionsSanitize.js';

test('wraps legacy flat responsibilities into one untitled set', () => {
  const out = sanitizeJobDescriptionSections({
    aboutTheRole: 'Lead groups',
    responsibilities: ['Facilitate workshops', 'Keep records']
  });
  assert.equal(out.responsibilitySets.length, 1);
  assert.equal(out.responsibilitySets[0].title, '');
  assert.deepEqual(out.responsibilitySets[0].items, ['Facilitate workshops', 'Keep records']);
  assert.deepEqual(out.responsibilities, ['Facilitate workshops', 'Keep records']);
});

test('keeps titled responsibility sets without mashing titles into bullets', () => {
  const out = sanitizeJobDescriptionSections({
    responsibilitySets: [
      { title: 'Individualized Instruction', items: ['Write plans', 'Meet families'] },
      { title: 'Documentation', items: ['Chart daily'] }
    ]
  });
  assert.equal(out.responsibilitySets[0].title, 'Individualized Instruction');
  assert.deepEqual(out.responsibilitySets[0].items, ['Write plans', 'Meet families']);
  assert.ok(out.responsibilities.some((b) => b.startsWith('Individualized Instruction:')));
});

test('normalizeResponsibilitySets ignores empty sets', () => {
  const sets = normalizeResponsibilitySets({
    responsibilitySets: [{ title: '', items: [] }, { title: 'Care', items: ['Support clients'] }]
  });
  assert.equal(sets.length, 1);
  assert.equal(sets[0].title, 'Care');
});
