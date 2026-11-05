// All people, organizations and payment records in this fixture are synthetic.
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../models/AgencyBillingInvoice.model.js', () => ({ default: { findById: vi.fn(), markPaymentAttempted: vi.fn() } }));
vi.mock('../../models/AgencyBillingAccount.model.js', () => ({ default: { getByAgencyId: vi.fn() } }));
vi.mock('../billingMerchantContext.service.js', () => ({ default: { getAgencySubscriptionContext: vi.fn() } }));
vi.mock('../quickbooksTokenManager.service.js', () => ({ default: { getValidAccessTokenForConnection: vi.fn() } }));
vi.mock('../stripePayments.service.js', () => ({ default: { chargePaymentMethod: vi.fn() } }));
vi.mock('../quickbooksPayments.service.js', () => ({ default: { createCharge: vi.fn() } }));

import Invoice from '../../models/AgencyBillingInvoice.model.js';
import Account from '../../models/AgencyBillingAccount.model.js';
import Merchant from '../billingMerchantContext.service.js';
import Tokens from '../quickbooksTokenManager.service.js';
import Payments from '../agencyBillingPayment.service.js';
import QuickBooks from '../quickbooksBillingSync.service.js';
import { agreementInvoiceOnHold, assertAgreementInvoiceReady, isUnsignedInvoiceProposal, assertManagementBillingPeriodReady } from '../businessInvoiceHold.js';

const proposal = () => ({ id: 7, agency_id: 7001, status: 'draft', payment_status: 'unpaid', invoice_delivery_status: 'not_sent',
  total_cents: 18000, line_items_json: { businessAgreement: { contractReference: 'exact-document-uuid', requiresSignatures: true, signedOn: '', ready: false } } });

beforeEach(() => { vi.clearAllMocks(); Invoice.findById.mockResolvedValue(proposal()); });

describe('management invoice signature hold', () => {
  it.each([
    ['automatic payment', () => Payments.attemptAutoPay(7)],
    ['QuickBooks invoice sync', () => QuickBooks.syncInvoiceToQuickBooks(7)],
    ['QuickBooks payment sync', () => QuickBooks.syncInvoicePaymentToQuickBooks(7)],
    ['invoice delivery', () => QuickBooks.sendInvoiceToQuickBooks(7)]
  ])('blocks %s before merchant, token, or payment activity', async (_label, operation) => {
    await expect(operation()).rejects.toMatchObject({ status: 409, code: 'BUSINESS_AGREEMENT_SIGNATURES_REQUIRED' });
    expect(Merchant.getAgencySubscriptionContext).not.toHaveBeenCalled();
    expect(Account.getByAgencyId).not.toHaveBeenCalled();
    expect(Tokens.getValidAccessTokenForConnection).not.toHaveBeenCalled();
    expect(Invoice.markPaymentAttempted).not.toHaveBeenCalled();
  });

  it('keeps a signed-but-unfinalized proposal on hold and supports serialized snapshots', () => {
    const invoice = proposal(); invoice.line_items_json.businessAgreement.signedOn = '2026-11-05';
    invoice.line_items_json = JSON.stringify(invoice.line_items_json);
    expect(agreementInvoiceOnHold(invoice)).toBe(true);
    expect(() => assertAgreementInvoiceReady(invoice)).toThrow(/finalize/);
  });

  it('leaves ordinary invoices and finalized signed invoices eligible for the usual flow', async () => {
    const ordinary = { ...proposal(), line_items_json: {} };
    expect(() => assertAgreementInvoiceReady(ordinary)).not.toThrow();
    const signed = proposal(); Object.assign(signed.line_items_json.businessAgreement, { signedOn: '2026-11-05', ready: true });
    expect(() => assertAgreementInvoiceReady(signed)).not.toThrow();
    Invoice.findById.mockResolvedValue(ordinary); Account.getByAgencyId.mockResolvedValue({ autopay_enabled: false });
    Merchant.getAgencySubscriptionContext.mockResolvedValue({});
    await expect(Payments.attemptAutoPay(7)).resolves.toMatchObject({ attempted: false, reason: 'autopay_disabled' });
  });

  it('permits repricing only the untouched explicit unsigned draft', () => {
    expect(isUnsignedInvoiceProposal(proposal())).toBe(true);
    for (const patch of [
      { status: 'sent' }, { payment_status: 'processing' }, { qbo_invoice_id: 'qbo-1' },
      { payment_reference: 'payment-1' }, { auto_charge_attempted_at: '2026-11-05' },
      { invoice_delivery_status: 'failed' }, { invoice_sent_at: '2026-11-05' },
      { line_items_json: { businessAgreement: { requiresSignatures: true, ready: true, signedOn: '2026-11-05' } } },
      { line_items_json: { businessAgreement: {} } }
    ]) expect(isUnsignedInvoiceProposal({ ...proposal(), ...patch })).toBe(false);
  });

  it('blocks future periods while a required management agreement is still unsigned', () => {
    const draft = { status: 'draft', startMonth: '2026-11', endMonth: '', requiresSignatures: true };
    expect(() => assertManagementBillingPeriodReady({ agreements: [draft] }, '2026-12')).toThrow(/awaiting both agreement signatures/);
    expect(() => assertManagementBillingPeriodReady({ agreements: [draft] }, '2026-10')).not.toThrow();
    expect(() => assertManagementBillingPeriodReady({ agreements: [{ ...draft, requiresSignatures: undefined }] }, '2026-12')).not.toThrow();
    const signed = { ...draft, status: 'active', contractReference: 'signed-document', signedOn: '2026-11-05' };
    expect(assertManagementBillingPeriodReady({ agreements: [signed] }, '2026-12')).toBe(signed);
  });
});
