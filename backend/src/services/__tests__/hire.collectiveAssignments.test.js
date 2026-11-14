import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyCollectiveAssignmentClause, COLLECTIVE_ASSIGNMENT_KEY, COLLECTIVE_ASSIGNMENT_VERSION } from '../../content/collectiveAssignmentClause.js';

const mocks = vi.hoisted(() => ({ execute: vi.fn(), agency: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: mocks.agency } }));
vi.mock('../contractCompensation.service.js', () => ({ contractCompensationLevels: vi.fn(async () => []), selectedContractCompensation: vi.fn(async () => ({ row: { direct_rate: 24, indirect_rate: 18 }, rates: [] })) }));
vi.mock('../packetBrandChrome.service.js', () => ({ resolvePacketBrandChrome: async () => ({ bodyFontFamily: 'sans-serif' }), packetBodyFontCss: () => '' }));
import { renderContractHtml } from '../contractMerge.service.js';

const original = [{ clause_key: 'INTRO', body_html: '<p>Original employment terms.</p>' }, { clause_key: 'TERM_AT_WILL', body_html: '<p>Original employment term.</p>' }, { clause_key: 'SIG_BLOCK', body_html: '<p>Signature.</p>' }];
const config = { id: 1, is_active: 1, pay_mode: 'hourly', slug: 'employment', clause_keys_json: original.map(c => c.clause_key) };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.agency.mockResolvedValue({ id: 6, slug: 'nlu', name: 'Next Level Up' });
  mocks.execute.mockImplementation(async sql => sql.includes('FROM contract_configs') ? [[config]] : sql.includes('FROM contract_clauses') ? [original] : [[]]);
});

describe('prospective Mental Range Collective assignments', () => {
  it('renders the generated agreement with its company palette and a readable actual agency ink color',async()=>{
    mocks.agency.mockResolvedValue({id:6,slug:'nlu',name:'Next Level Up',color_palette:{primary:'#6FCFBE',secondary:'#1F2A44',accent:'#9FB7A5'}});
    const result=await renderContractHtml({agencyId:6,configId:1,tokens:{COMPANY_NAME:'Next Level Up',ROLE_LABEL:'Employee',CONTRACT_SERVICE_ROLES:[]}});
    expect(result.html).toContain('color: #1F2A44;');expect(result.html).toContain('border-left:3px solid #9FB7A5');
  });
  it.each(['itsco', 'nlu', 'tisi', 'plottwistco', 'mh4kidz'])('includes exactly one versioned clause in a future %s agreement', async slug => {
    mocks.agency.mockResolvedValue({ id: 6, slug, name: 'Collective company' });
    const result = await renderContractHtml({ agencyId: 6, configId: 1, tokens: { COMPANY_NAME: 'Contracting Company', ROLE_LABEL: 'Employee', CONTRACT_SERVICE_ROLES: [] } });
    expect(result.html).toContain('The Practice participates in The Mental Range Collective');
    expect(result.html).toContain('may request that the individual perform approved services');
    expect(result.html).toContain('receiving organization by its legal name');
    expect(result.html).toContain('applicable executed business associate agreement');
    expect(result.html).toContain('when required by applicable law');
    expect(result.html).not.toContain('shall be deemed a member of the shared workforce');
    expect(result.html.indexOf('Assignments Within The Mental Range Collective')).toBeLessThan(result.html.indexOf('class="contract-signatures"'));
    expect(result.clauseManifest.filter(c => c.key === COLLECTIVE_ASSIGNMENT_KEY)).toEqual([expect.objectContaining({ included: true, policyVersion: COLLECTIVE_ASSIGNMENT_VERSION })]);
    expect(result.tokens.COLLECTIVE_ASSIGNMENT_VERSION).toBe(COLLECTIVE_ASSIGNMENT_VERSION);
    expect(result.unresolvedTokens).toEqual([]);
    expect(mocks.execute.mock.calls.every(([sql]) => !/^\s*(UPDATE|DELETE|INSERT)/i.test(sql))).toBe(true);
  });
  it('replaces duplicate legacy clauses without changing original objects or agreed pay terms', () => {
    const clauses = [original[0], { clause_key: 'MULTI', body_html: 'Old automatic shared workforce.' }, { clause_key: 'STARTER_V1_MULTI_HOURLY', body_html: 'Old assignment clause.' }, { clause_key: 'COMP_HOURLY', body_html: '<p>Approved $31.25 per hour.</p>' }, original[2]];
    const saved = JSON.stringify(clauses);
    const result = applyCollectiveAssignmentClause(clauses, { agency: { slug: 'itsco' }, config });
    expect(result.filter(c => c.clause_key === COLLECTIVE_ASSIGNMENT_KEY)).toHaveLength(1);
    expect(result.find(c => c.clause_key === 'COMP_HOURLY')).toBe(clauses[3]);
    expect(JSON.stringify(clauses)).toBe(saved);
    expect(applyCollectiveAssignmentClause(result, { agency: { slug: 'itsco' }, config })).toEqual(result);
  });
  it('covers an approved student training agreement without turning placement into employment', () => {
    const result = applyCollectiveAssignmentClause([{ clause_key: 'INTRO_STUDENT_TRAINING' }, original[2]], { agency: { slug: 'itsco' }, config: { slug: 'itsco_intern_practicum', pay_mode: 'none' }, agreementPlan: { variant: 'student' } });
    expect(result[1].body_html).toContain('host Practice for a student training placement');
    expect(result[1].body_html).toContain('applicable academic-program approvals and training agreement');
  });
  it.each(['itsco_intern_addendum_ffs', 'compensation_amendment', 'policy_acknowledgment'])('preserves the limited scope of %s', slug => {
    expect(applyCollectiveAssignmentClause(original, { agency: { slug: 'itsco' }, config: { ...config, slug } })).toBe(original);
  });
  it('does not add workforce terms to a BAA or unrelated vendor agreement', () => {
    const clauses = [{ clause_key: 'INTRO', body_html: '<p>Business associate agreement.</p>' }];
    expect(applyCollectiveAssignmentClause(clauses, { agency: { slug: 'itsco' }, config: { slug: 'business_associate', pay_mode: 'none' } })).toBe(clauses);
    expect(applyCollectiveAssignmentClause(clauses, { agency: { slug: 'plottwistco' }, config: { slug: 'management_services', pay_mode: 'ffs' } })).toBe(clauses);
  });
  it('ignores a display name or stale token claiming unrelated customers are collective members', async () => {
    mocks.agency.mockResolvedValue({ id: 99, slug: 'unrelated-practice', name: 'Next Level Up' });
    const result = await renderContractHtml({ agencyId: 99, configId: 1, tokens: { COMPANY_NAME: 'Other Company', ROLE_LABEL: 'Employee', AGENCY_SLUG: 'itsco', COLLECTIVE_ASSIGNMENT_VERSION: 'stale' } });
    expect(result.html).not.toContain('The Mental Range Collective');
    expect(result.tokens.COLLECTIVE_ASSIGNMENT_VERSION).toBeUndefined();
    expect(result.tokens.COLLECTIVEASSIGNMENTVERSION).toBeUndefined();
  });
});
