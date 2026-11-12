import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEmploymentHandbookCompensation, EMPLOYMENT_HANDBOOK_COMPENSATION_KEY } from '../employmentHandbookCompensationTerms.js';

test('new agreement fee terms replace recognized old compensation clauses without modifying the source agreement', () => {
  const source = [
    { clause_key: 'COMP_HOURLY', body_html: '<p>Agreed hourly rate remains $24.</p>' },
    { clause_key: 'MISSED_SESSION_COMPENSATION', body_html: '<p>No compensation for missed sessions.</p>' },
    { clause_key: 'CANCELLATION_PROCEDURE', body_html: '<p>Notify the office about cancellations.</p>' },
    { clause_key: 'SIG_BLOCK', body_html: '<p>Signatures.</p>' }
  ];
  const snapshot = structuredClone(source);
  const result = applyEmploymentHandbookCompensation(source);
  const added = result.find(clause => clause.clause_key === EMPLOYMENT_HANDBOOK_COMPENSATION_KEY);
  assert.deepEqual(source, snapshot);
  assert.equal(result.find(clause => clause.clause_key === 'MISSED_SESSION_COMPENSATION').body_html, '');
  assert.equal(result[0].body_html, source[0].body_html);
  assert.equal(result.find(clause => clause.clause_key === 'CANCELLATION_PROCEDURE').body_html, source[2].body_html);
  assert.equal(result.at(-2), added);
  assert.match(added.body_html, /Category 2 remains the standard placement/);
  assert.match(added.body_html, /Licensed &amp; Advanced Professionals/);
  assert.match(added.body_html, /substantial relevant experience/);
  assert.match(added.body_html, /lawfully collected and retained/);
  assert.match(added.body_html, /Workplace Handbook policy communicated/);
  assert.match(added.body_html, /actual work and required waiting time is separate/);
  assert.match(added.body_html, /Compensation already earned.*preserved/);
  assert.doesNotMatch(added.body_html, /(?:20|30|40)%/);
  assert.deepEqual(applyEmploymentHandbookCompensation(result), result);
});

test('NLU contracts use the new four-category policy without changing other agencies',()=>{
  const clauses=[{clause_key:'SIG_BLOCK',body_html:'<p>Signature</p>'}];
  const nlu=applyEmploymentHandbookCompensation(clauses,{tenant:'nlu'}).find(c=>c.clause_key===EMPLOYMENT_HANDBOOK_COMPENSATION_KEY).body_html;
  assert.match(nlu,/Category 1 — Foundational Provider/);
  assert.match(nlu,/Category 4 — Licensed and Advanced Provider/);
  assert.match(nlu,/limited circumstances/i);
  assert.match(nlu,/does not establish degree equivalency/);
  for(const tenant of ['itsco','isi']){
    const text=applyEmploymentHandbookCompensation(clauses,{tenant}).find(c=>c.clause_key===EMPLOYMENT_HANDBOOK_COMPENSATION_KEY).body_html;
    assert.match(text,/Category 3 · Licensed/);
    assert.doesNotMatch(text,/Category 4/);
  }
});
