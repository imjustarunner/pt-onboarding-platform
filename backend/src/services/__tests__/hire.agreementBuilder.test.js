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
    expect(result.html).toContain('unless either party gives the other written notice');
    expect(result.html).toContain('End-of-practicum review');
    expect(result.html).toContain('fit with the training placement');
    expect(result.html).toContain('Practice may determine that the placement will end after practicum');
    expect(result.html).toContain('academic program does not require practicum');
    expect(result.html).toContain('practicum prerequisites have already been satisfied elsewhere');
    expect(result.html).toContain('replacement agreement or separate phase-transition addendum is not required');
    expect(result.html).toContain('Compensation Category 2, Level 1');
    expect(result.html).toContain('Clinical Session Rate');
    expect(result.html).toContain('<td>$42.00</td>');
    expect(result.html).toContain('schedule at least 8 hours per week');
    expect(result.html).not.toMatch(/\$40\.00|\$500|practicum is unpaid|would require a separate written agreement|stale phase|employment is at.will/i);
    expect(result.unresolvedTokens).toEqual([]);
    expect(result.config.pay_mode).toBe('ffs');
    expect(result.tokens.TRAINING_START_PHASE_LABEL).toBe(phase === 'practicum' ? 'Practicum' : 'Internship');
  });
  it('supplies new clauses before a library upgrade without reviving explicitly disabled clauses', async () => {
    const oldRows = clauses.filter(c => !['COMP_CATEGORY_LEVEL', 'INTRO_STUDENT_TRAINING', 'TERM_STUDENT_TRAINING'].includes(c.clause_key));
    mockLibrary('student', oldRows);
    expect((await render()).html).toContain('End-of-practicum review');
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
