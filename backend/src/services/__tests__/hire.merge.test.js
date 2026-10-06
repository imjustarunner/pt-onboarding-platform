vi.mock('../../models/PayrollPaySystemRate.model.js', () => ({ default: { listForAgency: vi.fn(async () => []) } }));
import { describe, it, expect, vi, beforeEach } from 'vitest';
const db = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: db }));
vi.mock('../../models/OfficeLocation.model.js', () => ({ default: { findByAgencyMembership: vi.fn(async () => []), findByAgency: vi.fn(async () => []) } }));
vi.mock('../../models/HiringResumeParse.model.js', () => ({ default: { findLatestStructuredByCandidateUserId: vi.fn(async () => null) } }));
vi.mock('../../models/PayrollCompensationLevel.model.js', () => ({ default: { getForUser: vi.fn(async () => null), listForAgency: vi.fn(async () => []), getLevelRatesForAgency: vi.fn(async () => ({})) } }));
import { applyContractTokens, inferCompensationFromCredential, buildPayTableHtml, loadContractBundle, renderContractHtml, autofillTokensForCandidate } from '../contractMerge.service.js';
import { findContractPlaceholders } from '../../utils/contractPlaceholders.js';
beforeEach(() => vi.clearAllMocks());
describe('contract merge validation', () => {
  it('classifies SWC as category 2 instead of licensed category 3', () => { expect(inferCompensationFromCredential({ credential: 'SWC', jobTitle: 'Mental Health Provider' }).compensationCategory).toBe(2); });
  it('preserves dollar signs and replacement-like text in a contract value', () => {
    expect(applyContractTokens('<p>{{EMPLOYEE_FULL_NAME}}: {{DIRECT_RATE}}</p>', { EMPLOYEE_FULL_NAME: '$& Partners', DIRECT_RATE: '$45.00' })).toBe('<p>$& Partners: $45.00</p>');
  });
  it('resolves compact imported placeholders and canonical edits replace old aliases', () => {
    expect(applyContractTokens('{{CANDIDATENAME}} {{COMPANYNAME}} {{EXECUTIONDATE}} {{SUPERVISORNAME}}', {
      EMPLOYEE_FULL_NAME: 'Elena Cruz', COMPANY_NAME: 'New agency', COMPANYNAME: 'Old agency', EXECUTION_DATE: '2026-09-19', SUPERVISOR_NAME: ''
    })).toBe('Elena Cruz New agency September 19, 2026 ');
  });
  it('rejects an inactive or missing clause rather than generating a partial agreement', async () => {
    db.execute.mockResolvedValueOnce([[{ is_active: 1, clause_keys_json: ['PREAMBLE', 'PAY'] }]])
      .mockResolvedValueOnce([[{ clause_key: 'PREAMBLE', body_html: '<p>Agreement</p>' }]]);
    await expect(loadContractBundle({ agencyId: 1, configId: 1 })).rejects.toThrow('PAY');
  });
  it('rejects templates from outside the selected agency', async () => {
    db.execute.mockResolvedValueOnce([[{ is_active: 1, contract_template_id: 99, clause_keys_json: ['PREAMBLE'] }]])
      .mockResolvedValueOnce([[]]);
    await expect(loadContractBundle({ agencyId: 1, configId: 1 })).rejects.toThrow('unavailable');
  });
  const imported = '<p>This agreement is made on <strong>{{EXECUTION<em>DATE}}</strong> (the </em>“Execution Date”) by <strong>{{COMPANY<em>NAME}}</strong>, at {{COMPANY</em>ADDRESS}}, with {{CANDIDATE<em>NAME}} as {{JOB</em>TITLE}} ({{ROLE<em>LABEL}}). {{ROLE</em>LABEL}} provides {{SERVICE<em>FOCUS}}.</em></p>';
  const terms = { EXECUTION_DATE: 'September 24, 2026', COMPANY_NAME: 'Test Agency', COMPANY_ADDRESS: '123 Sample St', EMPLOYEE_FULL_NAME: 'Test Candidate', JOB_TITLE: 'Group Facilitator', ROLE_LABEL: 'Facilitator', SERVICE_FOCUS: 'Community groups' };
  it('repairs formatting that replaced underscores inside imported placeholders', () => {
    const result = applyContractTokens(imported, terms);
    expect(result).toBe('<p>This agreement is made on <strong>September 24, 2026</strong> (the “Execution Date”) by <strong>Test Agency</strong>, at 123 Sample St, with Test Candidate as Group Facilitator (Facilitator). Facilitator provides Community groups.</p>');
    expect(findContractPlaceholders(result)).toEqual([]);
    expect(applyContractTokens('<em>Keep real emphasis</em> <strong>{{COMPANY_NAME}}</strong>', terms)).toBe('<em>Keep real emphasis</em> <strong>Test Agency</strong>');
  });
  it('does not let formatted or blank merge fields bypass contract validation', async () => {
    db.execute.mockResolvedValueOnce([[{ is_active: 1, pay_mode: 'none', clause_keys_json: ['PREAMBLE'] }]])
      .mockResolvedValueOnce([[{ clause_key: 'PREAMBLE', body_html: imported + '<p>{{MIN<em>HOURS}} and {{UNKNOWN</em>TERM}}</p>' }]]);
    const result = await renderContractHtml({ agencyId: 1, configId: 1, tokens: { ...terms, COMPANY_ADDRESS: '', MIN_HOURS: '' } });
    expect(result.html).toContain('Test Candidate');
    expect(result.unresolvedTokens).toEqual(expect.arrayContaining(['COMPANYADDRESS', 'MINHOURS', 'UNKNOWNTERM']));
  });
  for (const intakeFallback of [false, true]) it(`fills agency and job-posting fields${intakeFallback ? ' from a legacy application' : ''}`, async () => {
    const job = { job_description_id: 16, title: 'Community Group Facilitator', role_type: 'Facilitator', description_text: 'Lead groups.', tags_json: ['Community groups'] };
    db.execute.mockImplementation(async (sql, params) => {
      if (sql.startsWith('SELECT user_id')) return [[{ user_id: 2 }]];
      if (sql.includes('FROM users WHERE')) return [[{ first_name: 'Test', last_name: 'Candidate', title: 'Old title', role: 'provider' }]];
      if (sql.includes('FROM agencies')) return [[{ id: 1, name: 'Test Agency', street_address: '123 Sample St', city: 'Denver', state: 'CO', postal_code: '80000' }]];
      if (sql.includes('FROM hiring_profiles hp') || sql.includes('FROM intake_submissions s')) {
        expect(params).toEqual([1, 2]); expect(sql).toContain('jd.agency_id = ?');
        return [sql.includes('FROM hiring_profiles') && intakeFallback ? [] : [job]];
      }
      return [[]];
    });
    expect(await autofillTokensForCandidate({ agencyId: 1, candidateUserId: 2 })).toMatchObject({
      COMPANY_NAME: 'Test Agency', COMPANY_ADDRESS: '123 Sample St, Denver, CO 80000',
      JOB_TITLE: 'Community Group Facilitator', ROLE_LABEL: 'Facilitator', EMPLOYEE_FULL_NAME: 'Test Candidate'
    });
  });
});

import PayrollCompensationLevel from '../../models/PayrollCompensationLevel.model.js';
describe('hiring QA contract regressions', () => {
  it('uses configured service rates even when the legacy summary is zero', async () => {
    PayrollCompensationLevel.listForAgency.mockResolvedValue([{ category: 2, level: 1, direct_rate: 0 }]);
    PayrollCompensationLevel.getLevelRatesForAgency.mockResolvedValue({ '2:1': [{ serviceCode: '90791', rateAmount: 40, rateUnit: 'per_unit' }] });
    const html = await buildPayTableHtml({ agencyId: 2, category: 2, level: 1, payMode: 'ffs' });
    expect(html).toContain('90791'); expect(html).toContain('$40.00'); expect(html).not.toContain('$0.00');
  });
  it('blocks an agreement with missing compensation instead of silently promising zero', async () => {
    PayrollCompensationLevel.listForAgency.mockResolvedValue([{ category: 2, level: 1, direct_rate: 0 }]);
    await expect(buildPayTableHtml({ agencyId: 2, category: 2, level: 1, payMode: 'hourly' })).rejects.toThrow('Configure compensation');
  });
  it('retains receiving supervision but omits supervisor compensation when unchecked', async () => {
    db.execute.mockResolvedValueOnce([[{ is_active: 1, pay_mode: 'none', clause_keys_json: ['SUPERVISION', 'SUP_COMP', 'SIG_BLOCK'] }]])
      .mockResolvedValueOnce([[
        { clause_key: 'SUPERVISION', body_html: '<p>Assigned supervisor: {{SUPERVISOR_NAME}} (the “Provider”_).</p>' },
        { clause_key: 'SUP_COMP', body_html: '<p>Supervisory services $65</p>' },
        { clause_key: 'SIG_BLOCK', title: 'SIG_BLOCK', body_html: '<p>IN WITNESS WHEREOF the parties agree.</p><p>Signature: __________</p><p>Date: ______</p>' }
      ]]);
    const result = await renderContractHtml({ agencyId: 1, configId: 1, tokens: { INCLUDE_SUPERVISION: '1', IS_SUPERVISOR: '0', SUPERVISOR_NAME: 'Test Supervisor' } });
    expect(result.html).toContain('Assigned supervisor: Test Supervisor');
    expect(result.html).not.toContain('Provider”_'); expect(result.html).not.toContain('Supervisory services'); expect(result.html).not.toContain('SIG_BLOCK'); expect(result.html).not.toContain('__________');
    expect(result.html).toContain('IN WITNESS WHEREOF'); expect(result.html).toContain('Electronic signatures');
  });
});
