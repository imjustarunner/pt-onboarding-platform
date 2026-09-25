import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), getConnection: vi.fn(), agency: vi.fn(), access: vi.fn(), eras: vi.fn(), details: vi.fn(), profiles: vi.fn(), connection: vi.fn(), exclusive: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute, getConnection: mocks.getConnection } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: mocks.agency } }));
vi.mock('../clinicalEligibility.service.js', () => ({ default: { ensureAgencyAccess: mocks.access } }));
vi.mock('../claimMd.service.js', () => ({ fetchEraList: mocks.eras, fetchEraData: mocks.details }));
vi.mock('../claimMdBillingProfile.service.js', () => ({ assertExclusiveClaimMdTaxId: mocks.exclusive, listClaimMdBillingProfiles: mocks.profiles }));
vi.mock('../claimMdConnection.service.js', () => ({ resolveClaimMdConnection: mocks.connection, requireClaimMdTransmission: vi.fn() }));
import { eraDepositEvidence, matchesEraDeposit, requestEraDepositVerification } from '../bankDepositVerification.service.js';
import { verifyBankAccount, bankTransactionEvidence, completeBankConnection, startBankConnection, bankFeedWebhook, disconnectBankFeed } from '../bankFeed.service.js';
import { getBankFeeds } from '../../controllers/bankFeed.controller.js';

const era = { eraId: '900', trace: 'REF123456', originatorId: '1123456789', amountCents: 25714, currency: 'usd', paidDate: '2026-09-15' };
const txn = { id: 'fctxn_test', account: 'fca_test', livemode: false, amount: 25714, currency: 'usd', description: 'TRN*1*REF123456*1123456789~', status: 'posted', updated: 1789560000, transacted_at: 1789560000, status_transitions: { posted_at: Date.parse('2026-09-16T12:00:00Z') / 1000 } };
const vendorEra = { eraid: '900', payerid: 'COCHA', payer_name: 'Synthetic Payer', prov_taxid: '123456789', prov_npi: '1234567893', paid_amount: '257.14', check_type: 'eft', check_number: 'REF123456', paid_date: '2026-09-15' };
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('BANK_FEEDS_ENABLED', 'true'); vi.stubEnv('FAMILY_BILLING_ENCRYPTION_KEY_BASE64', Buffer.alloc(32, 7).toString('base64')); vi.stubEnv('STRIPE_PUBLISHABLE_KEY', 'pk_test_synthetic'); });
afterEach(() => vi.unstubAllEnvs());
describe('narrow deposit evidence', () => {
  it('requires exact reassociation reference, payer originator, amount, currency, posted status and date', () => {
    expect(matchesEraDeposit(txn, era)).toBe(true);
    for (const change of [{ amount: 25713 }, { amount: -25714 }, { currency: 'cad' }, { status: 'pending' }, { status: 'void' }, { description: 'ACH REF123456' }, { description: 'TRN*1*REF123456*1999999999~' }, { description: 'TRN*1*REF1234560*1123456789~' }, { description: txn.description + ' ' + txn.description }, { description: txn.description + txn.description }, { status_transitions: { posted_at: Date.parse('2026-10-15') / 1000 } }]) expect(matchesEraDeposit({ ...txn, ...change }, era)).toBe(false);
    expect(matchesEraDeposit(txn, { ...era, originatorId: null })).toBe(false);
  });
  it('validates ERA payee, amount and date without floating point cents or retaining PHI', () => {
    expect(eraDepositEvidence({ ...vendorEra, claim: [{ pat_name_l: 'PRIVATE' }], prov_account: 'SECRET' }, '123456789', ['1234567893'])).toMatchObject({ amountCents: 25714 });
    expect(JSON.stringify(eraDepositEvidence(vendorEra, '123456789', ['1234567893']))).not.toContain('prov_taxid');
    for (const change of [{ prov_taxid: '999999999' }, { prov_npi: 'other' }, { paid_amount: '-1' }, { paid_date: '2026-02-31' }, { check_type: 'check' }]) expect(() => eraDepositEvidence({ ...vendorEra, ...change }, '123456789', ['1234567893'])).toThrow();
  });
  it('never includes a bank description or unrequested fields in retained evidence', () => {
    const evidence = bankTransactionEvidence({ ...txn, description: 'PRIVATE PAYROLL', account_number: 'SECRET' }, { external_id: 'fca_test', livemode: 0 });
    expect(evidence).not.toHaveProperty('description'); expect(JSON.stringify(evidence)).not.toMatch(/PRIVATE|SECRET/);
    expect(() => bankTransactionEvidence(txn, { external_id: 'fca_other', livemode: 0 })).toThrow(/identity/);
    expect(() => bankTransactionEvidence(txn, { external_id: 'fca_test', livemode: 1 })).toThrow(/identity/);
  });
  it('does not download ERA details if the scoped directory does not own the ERA', async () => {
    mocks.agency.mockResolvedValue({ tax_id: '123456789' }); mocks.connection.mockResolvedValue({ accountKey: 'synthetic' }); mocks.eras.mockResolvedValue({ era: [{ ...vendorEra, eraid: 'other' }] });
    await expect(requestEraDepositVerification({ agencyId: 1, accountId: 4, actorUserId: 9, eraId: '900' })).rejects.toThrow(/not found/);
    expect(mocks.details).not.toHaveBeenCalled();
  });
  it('pins server-verified remittance identity and discards bank instructions and claim details', async () => {
    mocks.agency.mockResolvedValue({ tax_id: '123456789' }); mocks.connection.mockResolvedValue({ accountKey: 'synthetic', connectionId: 'account:test', mode: 'test' });
    mocks.eras.mockResolvedValue({ era: [vendorEra] }); mocks.profiles.mockResolvedValue([{ practice_npi: '1234567893' }]);
    mocks.details.mockResolvedValue({ ...vendorEra, payer_companyid: era.originatorId, payment_method: 'ACH', prov_account: 'PRIVATE_ACCOUNT', claim: [{ pat_name_l: 'PRIVATE_PATIENT' }] });
    const db = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(async sql => {
      if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
      if (sql.includes('SELECT * FROM bank_feed_accounts')) return [[{ id: 4, livemode: 0, shared_account: 0 }]];
      if (sql.includes('SELECT id,account_id')) return [[]];
      return [{ affectedRows: 1 }];
    }) }; mocks.getConnection.mockResolvedValue(db);
    await expect(requestEraDepositVerification({ agencyId: 1, accountId: 4, actorUserId: 9, eraId: '900' })).resolves.toEqual({ queued: true });
    expect(mocks.eras).toHaveBeenCalledWith({ accountKey: 'synthetic', page: 1, taxId: '123456789' });
    expect(JSON.stringify(db.execute.mock.calls)).not.toMatch(/PRIVATE_ACCOUNT|PRIVATE_PATIENT/);
    expect(db.commit).toHaveBeenCalled();
    mocks.details.mockResolvedValue({ ...vendorEra, payer_companyid: '', payment_method: 'ACH' });
    await expect(requestEraDepositVerification({ agencyId: 1, accountId: 4, actorUserId: 9, eraId: '900' })).rejects.toThrow(/originator/);
  });
});
describe('bank consent and access', () => {
  it('rejects a different customer, mode, revoked consent and missing permissions', () => {
    const account = { id: 'fca_test', account_holder: { customer: 'cus_test' }, livemode: false, status: 'active', category: 'cash', permissions: ['transactions'] };
    expect(() => verifyBankAccount(account, 'cus_test', false)).not.toThrow();
    for (const change of [{ account_holder: { customer: 'cus_other' } }, { livemode: true }, { status: 'disconnected' }, { permissions: ['payment_method'] }]) expect(() => verifyBankAccount({ ...account, ...change }, 'cus_test', false)).toThrow();
  });
  it('cannot replay a completed session or complete another user’s session', async () => {
    const stripe = { financialConnections: { sessions: { retrieve: vi.fn() } } }, db = { execute: vi.fn().mockResolvedValue([[{ stripe_session_id: 'fcs_test', completed_at: new Date(), created_at: new Date() }]]) };
    await expect(completeBankConnection({ agencyId: 1, actorUserId: 9, sessionKey: 'test' }, { stripe, db, livemode: false })).rejects.toThrow(/expired/);
    db.execute.mockResolvedValue([[]]);
    await expect(completeBankConnection({ agencyId: 2, actorUserId: 10, sessionKey: 'test' }, { stripe, db, livemode: false })).rejects.toThrow();
    expect(stripe.financialConnections.sessions.retrieve).not.toHaveBeenCalled();
    expect(db.execute.mock.calls[1][1]).toEqual(['test', 2, 10]);
  });
  it('requires deployment activation and an owner attestation before starting', async () => {
    await expect(startBankConnection({ ownerAuthorized: false })).rejects.toThrow(/authority/);
    vi.stubEnv('BANK_FEEDS_ENABLED', 'false'); await expect(startBankConnection({})).rejects.toThrow(/activation/);
  });
  it('stops local checks even when remote revocation fails', async () => {
    const db = { execute: vi.fn().mockResolvedValue([{ affectedRows: 1 }]) }; db.execute.mockResolvedValueOnce([[{ external_id: 'fca_test', livemode: 0 }]]);
    const stripe = { financialConnections: { accounts: { disconnect: vi.fn().mockRejectedValue(new Error('network')) } } };
    await expect(disconnectBankFeed({ agencyId: 1, accountId: 4, actorUserId: 9 }, { db, stripe, livemode: false })).rejects.toThrow('network');
    expect(db.execute.mock.calls[1][0]).toContain('sync_enabled=0');
  });
  it('ignores unowned Connect events and malformed bank events', async () => {
    await bankFeedWebhook({ type: 'financial_connections.account.disconnected', account: 'acct_other', data: { object: { id: 'fca_test' } } });
    await bankFeedWebhook({ type: 'financial_connections.account.disconnected' });
    expect(mocks.execute).not.toHaveBeenCalled();
    await bankFeedWebhook({ type: 'financial_connections.account.refreshed_transactions', livemode: false, data: { object: { id: 'fca_test' } } });
    expect(mocks.execute.mock.calls[0][1]).toEqual(['fca_test', false]);
  });
  it('denies providers and delegated billing staff; checks agency access for admins', async () => {
    const res = { json: vi.fn() }, next = vi.fn();
    for (const role of ['provider', 'supervisor', 'staff']) await getBankFeeds({ user: { id: 9, role }, query: { agencyId: 1 } }, res, next);
    expect(next.mock.calls.every(([e]) => e.status === 403)).toBe(true); expect(mocks.access).not.toHaveBeenCalled();
    mocks.access.mockRejectedValue(new Error('agency denied'));
    await getBankFeeds({ user: { id: 9, role: 'admin' }, query: { agencyId: 2 } }, res, next);
    expect(next.mock.lastCall[0].message).toBe('agency denied'); expect(res.json).not.toHaveBeenCalled();
  });
});
