import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), levels: vi.fn(), profiles: vi.fn(), rules: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: mocks }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: vi.fn(async () => ({ id:1, name:'ITSCO', slug:'itsco' })) } }));
vi.mock('../../models/PayrollCompensationLevel.model.js', () => ({ default: { listForAgency: mocks.levels, getLevelRatesForAgency: vi.fn(async () => ({})) } }));
vi.mock('../../models/PayrollPaySystemRate.model.js', () => ({ default: { listForAgency: mocks.profiles } }));
vi.mock('../../models/PayrollServiceCodeRule.model.js', () => ({ default: { listForAgency: mocks.rules } }));
import { itscoAgreementBuilder, buildItscoAgreementPlan } from '../itscoAgreementBuilder.service.js';
import { loadContractBundle, renderContractHtml } from '../contractMerge.service.js';
import { ITSCO_CONTRACT_CONFIGS, ITSCO_CONTRACT_CLAUSES, mdToHtml } from '../../seeds/itscoContractClauseLibrary.js';
import { studentTrainingClauseForPhase } from '../../content/studentTrainingAgreement.js';

const configs = ITSCO_CONTRACT_CONFIGS.map((config, index) => ({ ...config, id: index + 1, is_active: 1, clause_keys_json: config.clause_keys }));
const configFor = variant => configs.find(c => c.slug === ({ student: 'itsco_intern_practicum', provider: 'itsco_licensed_ffs', facilitator: 'itsco_facilitator' })[variant]);
const clauses = ITSCO_CONTRACT_CLAUSES.map(clause => ({ ...clause, is_active: 1, body_html: mdToHtml(clause.body_md) }));
const tokens = {
  AGENCY_SLUG: 'itsco', AGREEMENT_SELECTION_DRIVEN: '1', AGREEMENT_VARIANT: 'student', TRAINING_START_PHASE: 'practicum',
  COMPANY_NAME: 'ITSCO', COMPANY_ADDRESS: '100 Headquarters Rd', CANDIDATE_NAME: 'Test Student',
  UNIVERSITY_NAME: 'Test University', JOB_TITLE: 'Student Counselor', SERVICE_FOCUS: 'Office-Based Counseling',
  ASSIGNED_OFFICE_NAME: 'Windchime', ASSIGNED_OFFICE_ADDRESS: '437 Windchime Place',
  START_DATE: '2026-11-01', EXECUTION_DATE: '2026-10-14', EXPIRATION_DATE: '2026-10-28', MIN_HOURS: 6
};

function mockLibrary(variant = 'student', rows = clauses) {
  mocks.execute.mockImplementation(async (sql, values) => {
    if (sql.includes('FROM contract_configs')) return [[{ ...configFor(variant) }]];
    if (sql.includes('FROM contract_clauses')) return [rows.filter(row => values.slice(1).includes(row.clause_key))];
    if (sql.includes('SELECT slug FROM agencies')) return [[{ slug: 'itsco' }]];
    throw new Error(`Unexpected query: ${sql}`);
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.levels.mockResolvedValue([{ category: 2, level: 1, direct_rate: 40, indirect_rate: 20, ffs_rate: 40 }]);
  mocks.profiles.mockResolvedValue([{ id: 1, category: 2, level: 1, creditRate: 42, creditRateProbation: 35, hcodeRate:32, hcodeRateProbation:28, supportActivityRate:18, indirectRate: 22 }]);
  mocks.rules.mockResolvedValue(['90791', '90837'].map(service_code => ({ service_code, category: 'direct', pay_divisor: 1 })));
  mockLibrary();
});
const render = (overrides = {}) => renderContractHtml({ agencyId: 1, configId: configFor('student').id, compensationCategory: 2, compensationLevel: 1, tokens: { ...tokens, ...overrides } });

describe('selection-driven ITSCO agreements', () => {
  it.each(['practicum', 'internship'])('uses one standing, paid student agreement starting in %s', async phase => {
    const result = await render({ TRAINING_START_PHASE: phase, TRAINING_START_PHASE_LABEL: 'stale phase' });
    expect(result.html).toContain(`starting phase is ${phase === 'practicum' ? 'Practicum' : 'Internship'}`);
    if (phase === 'practicum') {
      expect(result.html).toContain('unless either party gives the other written notice');
      expect(result.html).toContain('End-of-practicum review');
      expect(result.html).toContain('fit with the training placement');
      expect(result.html).toContain('Practice may determine that the placement will end after practicum');
      expect(result.html).toContain('replacement agreement or separate phase-transition addendum is not required');
      expect(result.html).not.toContain('Direct-entry internship:');
    } else {
      expect(result.html).toContain('Direct-entry internship:');
      expect(result.html).toContain('academic program does not require practicum');
      expect(result.html).toContain('practicum prerequisites have already been satisfied elsewhere');
      expect(result.html).not.toMatch(/Practicum-to-internship continuation:|End-of-practicum review:|during both practicum and internship|applicable practicum and internship phases/);
    }
    expect(result.html).toContain('coordinate required academic notifications');
    expect(result.html).toContain('Any approved compensation change must be documented');
    expect(result.html).toContain('School mileage reimbursement is not available to students in practicum or internship');
    expect(result.html).toContain('Compensation Category 2, Level 1');
    expect(result.html).toContain('Clinical Session Rate');
    expect(result.html).toContain('<td>$42.00</td>');
    expect(result.html).toContain('schedule at least 8 hours per week');
    expect(result.html).not.toMatch(/\$40\.00|\$500|practicum is unpaid|would require a separate written agreement|stale phase|employment is at.will/i);
    expect(result.unresolvedTokens).toEqual([]);
    expect(result.config.pay_mode).toBe('ffs');
    expect(result.tokens.TRAINING_START_PHASE_LABEL).toBe(phase === 'practicum' ? 'Practicum' : 'Internship');
  });
  it.each(['practicum', 'internship'])('excludes school mileage for school-assigned students starting in %s', async phase => {
    const result = await render({ TRAINING_START_PHASE: phase, SERVICE_FOCUS: 'School-Based Counseling', MIN_DAYS_PER_WEEK: 1 });
    expect(result.html).toContain('School mileage reimbursement is not available to students in practicum or internship');
    expect(result.html).toContain('regardless of school assignment or benefit tier');
    expect(result.html).toContain('Reimbursements required by applicable law remain available');
    expect(result.html).not.toContain('While assigned to a school, I am eligible for mileage reimbursement');
  });
  it.each(['yes', 'no'])('shows the selected probation policy once (%s)', async choice => {
    const result = await render({ PROBATION_APPLIES: choice, PROBATION_TERMS: 'Approved original-start terms.' });
    expect(result.html.match(/<(?:h3|strong)>New-hire probation/g)).toHaveLength(1);
    expect(result.html).toContain(`New-hire probation · ${choice === 'yes' ? 'Yes' : 'No'}`);
    expect(result.html).toContain('Approved original-start terms.');
    expect(result.html).toContain(choice === 'yes' ? 'Selected probationary rate' : 'Probation not applied');
    expect(result.html).toContain('Minimum-workload rate reductions are not activated');
  });
  it('selects the phase in saved clauses while preserving agency additions and original clauses', () => {
    const original = { ...clauses.find(c => c.clause_key === 'TERM_STUDENT_TRAINING') };
    original.body_html += '<p>Additional university reporting is required.</p>';
    const result = studentTrainingClauseForPhase(original, 'internship');
    expect(result.body_html).not.toContain('End-of-practicum review:');
    expect(result.body_html).toContain('Additional university reporting is required.');
    expect(original.body_html).toContain('End-of-practicum review:');
    expect(studentTrainingClauseForPhase(original, undefined)).toBe(original);
  });
  it.each(['practicum', 'internship'])('supplies phase-specific %s terms before a library upgrade without reviving explicitly disabled clauses', async phase => {
    const oldRows = clauses.filter(c => !['COMP_CATEGORY_LEVEL', 'INTRO_STUDENT_TRAINING', 'TERM_STUDENT_TRAINING'].includes(c.clause_key));
    mockLibrary('student', oldRows);
    const html = (await render({ TRAINING_START_PHASE: phase })).html;
    expect(html).toContain(phase === 'practicum' ? 'End-of-practicum review' : 'Direct-entry internship:');
    expect(html).not.toContain(phase === 'practicum' ? 'Direct-entry internship:' : 'End-of-practicum review');
    mockLibrary('student', [...oldRows, { clause_key: 'TERM_STUDENT_TRAINING', is_active: 0 }]);
    await expect(render()).rejects.toThrow('TERM_STUDENT_TRAINING');
  });
  it.each(['', 'unknown'])('requires a supported starting phase (%s)', async phase => {
    await expect(render({ TRAINING_START_PHASE: phase })).rejects.toThrow('starts in practicum or internship');
  });
  it('requires the training institution instead of silently issuing a blank agreement', async () => {
    expect((await render({ UNIVERSITY_NAME: '' })).unresolvedTokens.map(key => key.replaceAll('_', ''))).toContain('UNIVERSITYNAME');
  });
  it('requires new pay-system rates instead of falling back to old rates', async () => {
    mocks.profiles.mockResolvedValue([]);
    await expect(render()).rejects.toThrow('current pay system');
  });
  it('keeps historical document presets available without silently changing their terms', async () => {
    const result = await loadContractBundle({ agencyId: 1, configId: configFor('student').id });
    expect(result.clauseKeys).toContain('COMP_PRAC');
    expect(result.agreementPlan).toBeNull();
  });
  it.each(['provider', 'facilitator'])('uses current rates and standing compensation for %s agreements', async variant => {
    mockLibrary(variant);
    const result = await render({ AGREEMENT_VARIANT: variant, LICENSE_TYPE: 'LPC', CREDENTIAL: 'LPC', LICENSING_BOARD: 'DORA', ROLE_LABEL: 'stale', INCLUDE_SUPERVISION: '1', SUPERVISOR_NAME: 'Clinical Supervisor' });
    expect(result.html).toContain(variant === 'facilitator' ? '<td>$32.00</td>' : '<td>$42.00</td>');
    expect(result.html).toContain('unless the Practice expressly approves and documents a change');
    expect(result.html.split('<body>')[1]).not.toContain('stale');
    expect(result.html).not.toContain('Modification or Transition of Compensation Model');
    expect(result.html).not.toMatch(/\$65\.00|\$32\.50/);
    expect(result.unresolvedTokens).toEqual([]);
  });
  it.each(['provider', 'facilitator'])('preserves school mileage terms for a school-assigned %s', async variant => {
    mockLibrary(variant);
    const result = await render({ AGREEMENT_VARIANT: variant, CREDENTIAL: variant === 'facilitator' ? 'BA' : 'LPC', LICENSING_BOARD: 'DORA', SERVICE_FOCUS: 'School-Based Counseling', MIN_DAYS_PER_WEEK: 2 });
    expect(result.html).toContain('While assigned to a school, I am eligible for mileage reimbursement');
    expect(result.html).not.toContain('School mileage reimbursement is not available');
  });
  it('selects provider duties and licensure terms from the current selections', () => {
    const plan = buildItscoAgreementPlan({ variant: 'provider', config: configFor('provider'), tokens: { SERVICE_FOCUS: 'School-Based Counseling', LICENSURE_DEADLINE: '2027-01-01' } });
    expect(plan.clauseKeys).toEqual(expect.arrayContaining(['JOB_DESC_LPC', 'LICENSURE_CONT', 'COMP_CATEGORY_LEVEL']));
    expect(plan.clauseKeys).not.toContain('COMP_FFS');
  });
  it('keeps posted job-description duties when a specific job clause is provided', () => {
    expect(buildItscoAgreementPlan({ variant: 'student', config: configFor('student'), tokens, jobDescClauseKey: 'JOB_DESC_JD_22' }).clauseKeys).toContain('JOB_DESC_JD_22');
  });
  it('limits the role-driven builder to ITSCO and suggests the applicable starting point', () => {
    expect(itscoAgreementBuilder({ agency: { slug: 'other' }, configs })).toBeNull();
    expect(itscoAgreementBuilder({ agency: { slug: 'itsco' }, configs, tokens: { JOB_TITLE: 'Practicum counselor' } })).toMatchObject({ suggestedVariant: 'student', suggestedTrainingStartPhase: 'practicum' });
    expect(itscoAgreementBuilder({ agency: { slug: 'itsco' }, configs, tokens: { JOB_TITLE: 'Counseling intern' } })).toMatchObject({ suggestedVariant: 'student', suggestedTrainingStartPhase: 'internship' });
  });
  it('rejects a role whose underlying preset does not match', () => {
    expect(() => buildItscoAgreementPlan({ variant: 'student', config: configFor('provider'), tokens })).toThrow('do not match');
  });
});
