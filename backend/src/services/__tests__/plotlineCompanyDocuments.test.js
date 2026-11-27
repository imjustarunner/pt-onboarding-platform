import { expect, it } from 'vitest';
import { plotlineEmploymentClauses, plotlineEmploymentContent } from '../plotlineEmploymentAgreement.service.js';

it('fills a nonclinical agreement with the company’s own terms and escapes the input', () => {
  const terms = {
    CANDIDATE_NAME: 'Jamie Example', JOB_TITLE: 'Consultant', START_DATE: 'December 1, 2026',
    WORK_ARRANGEMENT: 'Consulting and client workshops.\nRemote, with occasional travel.',
    PAY_TERMS: 'USD 65 per hour. <script>test</script>'
  };
  const clauses = plotlineEmploymentClauses.map(section => ({ title: section.title, body_html: section.body }));
  const result = plotlineEmploymentContent({ clauses, tokens: { ...terms, COMPANY_NAME: 'Other Company' }, companyName: 'Juniper QA' });
  expect(result.unresolvedTokens).toEqual([]);
  expect(result.sections).toContain('Juniper QA');
  expect(result.sections).toContain('USD 65 per hour.');
  expect(result.sections).not.toMatch(/<script>|Other Company|clinical|licensure/i);
  expect(plotlineEmploymentContent({ clauses, tokens: { ...terms, PAY_TERMS: '' }, companyName: 'Juniper QA' }).unresolvedTokens).toEqual(['PAY_TERMS']);
});
