// All people, organizations and payment records in this fixture are synthetic.
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ lifecycle: null, estimate: null, db: {}, savePdf: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: state.db }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../../models/AgencyBillingInvoice.model.js', () => ({ default: {
  findByAgencyAndPeriod: vi.fn(), create: vi.fn(), finalizeManagementProposal: vi.fn(), setPdfPath: vi.fn()
} }));
vi.mock('../../models/AgencyBillingAccount.model.js', () => ({ default: { getByAgencyId: vi.fn() } }));
vi.mock('../../models/AgencyCommunicationUsageLedger.model.js', () => ({ default: { attachInvoiceToPeriod: vi.fn() } }));
vi.mock('../billingUsage.service.js', () => ({ default: { getUsage: vi.fn() } }));
vi.mock('../billingPricing.service.js', () => ({ getEffectiveBillingPricingForAgency: vi.fn(), buildEstimate: vi.fn() }));
vi.mock('../businessLifecycle.service.js', () => ({ createBusinessLifecycleService: () => ({
  billingState: vi.fn(async () => state.lifecycle), withBillingLock: vi.fn(async (_agencyId, _lifecycle, work) => work(state.db))
}) }));
vi.mock('../businessLifecyclePolicy.js', async importOriginal => ({ ...(await importOriginal()), applyBusinessAgreement: vi.fn(() => structuredClone(state.estimate)) }));
vi.mock('../managementInvoiceFinalization.service.js', () => ({ managementInvoiceExecution: vi.fn(), managementAgreementExecution: vi.fn() }));
vi.mock('../agencyCommunicationBilling.service.js', () => ({ default: { reconcileAgencyPeriod: vi.fn() } }));
vi.mock('../featureBilling.service.js', () => ({ computeFeatureBillingForPeriod: vi.fn() }));
vi.mock('../billingMerchantContext.service.js', () => ({ default: { getAgencySubscriptionContext: vi.fn() } }));
vi.mock('../quickbooksBillingSync.service.js', () => ({ default: { syncInvoiceToQuickBooks: vi.fn(), sendInvoiceToQuickBooks: vi.fn() } }));
vi.mock('../agencyBillingPayment.service.js', () => ({ default: { attemptAutoPay: vi.fn() } }));
vi.mock('../billingInvoicePdf.service.js', () => ({ default: { generateInvoicePdf: vi.fn() } }));
vi.mock('../storage.service.js', () => ({ default: { getGCSBucket: vi.fn(async () => ({ file: () => ({ save: state.savePdf }) })) } }));
vi.mock('../medicalServiceFees.service.js', () => ({ medicalServiceInvoiceLines: vi.fn(),
  appendMedicalServiceLines: vi.fn(estimate => structuredClone(estimate)), attachMedicalServiceInvoice: vi.fn() }));

vi.mock('../narrivaReportBilling.service.js', () => ({ complianceReportInvoiceLines: vi.fn(async () => []), appendComplianceReportLines: vi.fn(estimate => estimate), attachComplianceReportInvoice: vi.fn() }));

import Service from '../billingInvoice.service.js';
import Agency from '../../models/Agency.model.js';
import Invoice from '../../models/AgencyBillingInvoice.model.js';
import Account from '../../models/AgencyBillingAccount.model.js';
import Usage from '../billingUsage.service.js';
import { getEffectiveBillingPricingForAgency, buildEstimate } from '../billingPricing.service.js';
import { managementInvoiceExecution, managementAgreementExecution } from '../managementInvoiceFinalization.service.js';
import { computeFeatureBillingForPeriod } from '../featureBilling.service.js';
import Merchant from '../billingMerchantContext.service.js';
import QuickBooks from '../quickbooksBillingSync.service.js';
import Payment from '../agencyBillingPayment.service.js';
import Pdf from '../billingInvoicePdf.service.js';
import { medicalServiceInvoiceLines } from '../medicalServiceFees.service.js';

const ref = '11111111-1111-4111-8111-111111111111';
const period = { periodStart: new Date('2026-11-01T00:00:00Z'), periodEnd: new Date('2026-11-30T00:00:00Z') };
const proposal = () => ({ id: 7, agency_id: 7001, status: 'draft', payment_status: 'unpaid', invoice_delivery_status: 'not_sent',
  line_items_json: { businessAgreement: { contractReference: ref, requiresSignatures: true, signedOn: '', ready: false } } });
const generate = () => Service.generateForAgency(7001, { period, syncToQuickBooks: false });

beforeEach(() => {
  vi.clearAllMocks();
  state.lifecycle = { agreements: [{ status: 'active', startMonth: '2026-11', contractReference: ref, signedOn: '2026-11-05' }], revenue: [] };
  state.estimate = { usage: { schoolsUsed: 0, programsUsed: 0, adminsUsed: 1, activeOnboardeesUsed: 0 },
    totals: { baseFeeCents: 0, extraSchoolsCents: 0, extraProgramsCents: 0, extraAdminsCents: 0, extraOnboardeesCents: 0,
      communicationActualCostCents: 0, communicationMarkupCents: 0, communicationSubtotalCents: 0, totalCents: 18000 },
    businessAgreement: { contractReference: ref, ready: true, signedOn: '2026-11-05' },
    chargeLines: [{ label: 'Management', amountCents: 18000 }] };
  Agency.findById.mockResolvedValue({ id: 7001, name: 'Synthetic Coaching', organization_type: 'life_coach' });
  Invoice.findByAgencyAndPeriod.mockResolvedValue(proposal());
  getEffectiveBillingPricingForAgency.mockResolvedValue({ effective: {} });
  Usage.getUsage.mockResolvedValue({}); buildEstimate.mockReturnValue({});
  Account.getByAgencyId.mockResolvedValue({ autopay_enabled: false });
  Merchant.getAgencySubscriptionContext.mockResolvedValue({ merchantMode: 'platform_managed', providerConnectionId: null, connection: { is_connected: false } });
  computeFeatureBillingForPeriod.mockResolvedValue({}); medicalServiceInvoiceLines.mockResolvedValue([]);
  managementInvoiceExecution.mockResolvedValue({ documentId: ref, signedOn: '2026-11-05', contentHash: 'reviewed-content' });
  managementAgreementExecution.mockResolvedValue({ documentId: ref, signedOn: '2026-11-05', contentHash: 'reviewed-content' });
  const invoice = { ...proposal(), total_cents: 18000, line_items_json: state.estimate };
  Invoice.finalizeManagementProposal.mockResolvedValue(invoice); Invoice.create.mockResolvedValue(invoice); Invoice.setPdfPath.mockResolvedValue(invoice);
  Pdf.generateInvoicePdf.mockResolvedValue(Buffer.from('%PDF synthetic'));
});

describe('management review invoice generation', () => {
  it('returns the existing held review draft without touching pricing, usage, merchant, or delivery', async () => {
    state.lifecycle.agreements[0].status = 'draft'; state.lifecycle.agreements[0].signedOn = '';
    managementInvoiceExecution.mockResolvedValue(null);
    await expect(generate()).resolves.toMatchObject({ id: 7, line_items_json: { businessAgreement: { ready: false } } });
    expect(getEffectiveBillingPricingForAgency).not.toHaveBeenCalled(); expect(Usage.getUsage).not.toHaveBeenCalled();
    expect(Merchant.getAgencySubscriptionContext).not.toHaveBeenCalled(); expect(Invoice.create).not.toHaveBeenCalled();
    expect(Payment.attemptAutoPay).not.toHaveBeenCalled(); expect(QuickBooks.sendInvoiceToQuickBooks).not.toHaveBeenCalled();
  });
  it('blocks an unsigned required agreement in a later period before ordinary app billing runs', async () => {
    Invoice.findByAgencyAndPeriod.mockResolvedValue(null);
    state.lifecycle.agreements = [{ status: 'draft', startMonth: '2026-11', requiresSignatures: true, signedOn: '', contractReference: ref }];
    await expect(Service.generateForAgency(7001, { period: { periodStart: new Date('2026-12-01T00:00:00Z'), periodEnd: new Date('2026-12-31T00:00:00Z') } })).rejects.toMatchObject({ status: 409, code: 'BUSINESS_AGREEMENT_SIGNATURES_REQUIRED' });
    expect(getEffectiveBillingPricingForAgency).not.toHaveBeenCalled(); expect(Merchant.getAgencySubscriptionContext).not.toHaveBeenCalled();
    expect(Invoice.create).not.toHaveBeenCalled();
  });
  it('recomputes and finalizes the same ID after verified signatures, checking again inside the lock', async () => {
    await expect(generate()).resolves.toMatchObject({ id: 7 });
    expect(managementInvoiceExecution).toHaveBeenCalledTimes(2);
    expect(managementInvoiceExecution.mock.calls[1][4]).toEqual({ lock: true });
    expect(Invoice.finalizeManagementProposal).toHaveBeenCalledWith(7, 7001, expect.objectContaining({
      totalCents: 18000, lineItemsJson: expect.objectContaining({ businessAgreement: expect.objectContaining({
        requiresSignatures: true, ready: true, executionEvidence: expect.objectContaining({ documentId: ref })
      }) })
    }), state.db);
    expect(Invoice.create).not.toHaveBeenCalled(); expect(state.savePdf).toHaveBeenCalledOnce();
    expect(Payment.attemptAutoPay).not.toHaveBeenCalled(); expect(QuickBooks.sendInvoiceToQuickBooks).not.toHaveBeenCalled();
  });
  it('preserves the hold if execution evidence changes before the lock is acquired', async () => {
    managementInvoiceExecution.mockResolvedValueOnce({ documentId: ref }).mockResolvedValueOnce(null);
    await expect(generate()).resolves.toMatchObject({ id: 7, line_items_json: { businessAgreement: { ready: false } } });
    expect(Invoice.finalizeManagementProposal).not.toHaveBeenCalled(); expect(Invoice.create).not.toHaveBeenCalled();
    expect(Pdf.generateInvoicePdf).not.toHaveBeenCalled();
  });
  it('preserves ordinary existing-invoice behavior', async () => {
    Invoice.findByAgencyAndPeriod.mockResolvedValue({ ...proposal(), line_items_json: {} });
    await expect(generate()).resolves.toMatchObject({ id: 7 });
    expect(managementInvoiceExecution).not.toHaveBeenCalled(); expect(getEffectiveBillingPricingForAgency).not.toHaveBeenCalled();
    expect(Invoice.finalizeManagementProposal).not.toHaveBeenCalled();
  });
  it('requires actual executed archive evidence before billing a new marked agreement period', async () => {
    Invoice.findByAgencyAndPeriod.mockResolvedValue(null);
    state.lifecycle.agreements[0].requiresSignatures = true;
    managementAgreementExecution.mockResolvedValue(null);
    await expect(generate()).rejects.toMatchObject({ status: 409, code: 'BUSINESS_AGREEMENT_SIGNATURES_REQUIRED' });
    expect(getEffectiveBillingPricingForAgency).not.toHaveBeenCalled(); expect(Usage.getUsage).not.toHaveBeenCalled();
    expect(Merchant.getAgencySubscriptionContext).not.toHaveBeenCalled(); expect(Invoice.create).not.toHaveBeenCalled();
  });
  it('binds a later marked invoice to the same executed document, verifying again within the lock', async () => {
    Invoice.findByAgencyAndPeriod.mockResolvedValue(null);
    state.lifecycle.agreements[0].requiresSignatures = true;
    await expect(generate()).resolves.toMatchObject({ id: 7 });
    expect(managementAgreementExecution).toHaveBeenCalledTimes(2);
    expect(managementAgreementExecution.mock.calls[1][4]).toEqual({ lock: true });
    expect(Invoice.create).toHaveBeenCalledWith(expect.objectContaining({
      lineItemsJson: expect.objectContaining({ businessAgreement: expect.objectContaining({ requiresSignatures: true, executionEvidence: expect.objectContaining({ documentId: ref }) }) })
    }), state.db);
    expect(Invoice.finalizeManagementProposal).not.toHaveBeenCalled();
  });
});
