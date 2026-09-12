import { describe, it, expect, vi, beforeEach } from 'vitest';
const db = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: db }));
import { applyContractTokens, loadContractBundle } from '../contractMerge.service.js';
beforeEach(() => vi.clearAllMocks());
describe('contract merge validation', () => {
  it('preserves dollar signs and replacement-like text in a contract value', () => {
    expect(applyContractTokens('<p>{{EMPLOYEE_FULL_NAME}}: {{DIRECT_RATE}}</p>', { EMPLOYEE_FULL_NAME: '$& Partners', DIRECT_RATE: '$45.00' })).toBe('<p>$& Partners: $45.00</p>');
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
});
