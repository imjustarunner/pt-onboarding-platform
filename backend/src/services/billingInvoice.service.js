import { isSchoolCareBridgeOnly } from '../utils/schoolCareBridgeTenant.js';
import {medicalServiceInvoiceLines,appendMedicalServiceLines,attachMedicalServiceInvoice} from './medicalServiceFees.service.js';
import StorageService from './storage.service.js';
import BillingUsageService from './billingUsage.service.js';
import { buildEstimate, getEffectiveBillingPricingForAgency } from './billingPricing.service.js';
import { getCurrentBillingPeriod } from '../utils/billingPeriod.js';
import Agency from '../models/Agency.model.js';
import AgencyBillingInvoice from '../models/AgencyBillingInvoice.model.js';
import BillingInvoicePdfService from './billingInvoicePdf.service.js';
import QuickBooksBillingSyncService from './quickbooksBillingSync.service.js';
import AgencyBillingAccount from '../models/AgencyBillingAccount.model.js';
import AgencyCommunicationBillingService from './agencyCommunicationBilling.service.js';
import AgencyCommunicationUsageLedger from '../models/AgencyCommunicationUsageLedger.model.js';
import AgencyBillingPaymentService from './agencyBillingPayment.service.js';
import BillingMerchantContextService from './billingMerchantContext.service.js';
import { computeFeatureBillingForPeriod } from './featureBilling.service.js';
import pool from '../config/database.js';
import { createBusinessLifecycleService } from './businessLifecycle.service.js';
import { applyBusinessAgreement } from './businessLifecyclePolicy.js';
import { isUnsignedInvoiceProposal, assertManagementBillingPeriodReady } from './businessInvoiceHold.js';
import { managementInvoiceExecution, managementAgreementExecution } from './managementInvoiceFinalization.service.js';

function requireManagementExecution(execution) {
  if (!execution) throw Object.assign(new Error('The management agreement must have both verified signatures and active matching signed pricing before this invoice can be generated.'), {
    status: 409, statusCode: 409, code: 'BUSINESS_AGREEMENT_SIGNATURES_REQUIRED'
  });
  return execution;
}

class BillingInvoiceService {
  static buildInvoiceStorageKey({ agencyId, periodStart }) {
    const ym = String(periodStart).slice(0, 7); // YYYY-MM
    return `uploads/billing_invoices/${agencyId}/invoice-${ym}.pdf`;
  }

  static async generateForAgency(agencyId, { period = null, syncToQuickBooks = true } = {}) {
    const parsedAgencyId = parseInt(agencyId, 10);
    if (!parsedAgencyId || Number.isNaN(parsedAgencyId)) throw new Error('Invalid agencyId');

    const agency = await Agency.findById(parsedAgencyId);
    if (!agency) throw new Error('Agency not found');
    // SchoolCareBridge pricing and usage allocation are not commercially active.
    // Connected agencies (including ITSCO) keep their existing billing.
    if (isSchoolCareBridgeOnly(agency)) throw Object.assign(new Error('SchoolCareBridge billing is inactive. A separate pricing agreement and activation are required.'), { status: 409, statusCode: 409, code: 'SCHOOLCAREBRIDGE_BILLING_INACTIVE' });

    const { periodStart, periodEnd } = period || getCurrentBillingPeriod(new Date());
    const periodStartStr = periodStart.toISOString().slice(0, 10);
    const periodEndStr = periodEnd.toISOString().slice(0, 10);

    // Prevent duplicates for a period (return existing)
    const existing = await AgencyBillingInvoice.findByAgencyAndPeriod(parsedAgencyId, {
      periodStart: periodStartStr,
      periodEnd: periodEndStr
    });
    let lifecycle = null;
    if (existing) {
      if (!isUnsignedInvoiceProposal(existing)) return existing;
      lifecycle = await createBusinessLifecycleService(pool).billingState(parsedAgencyId);
      if (!await managementInvoiceExecution(existing, lifecycle, periodStartStr.slice(0, 7), pool)) return existing;
    }

    lifecycle ||= await createBusinessLifecycleService(pool).billingState(parsedAgencyId);
    const requiredAgreement = assertManagementBillingPeriodReady(lifecycle, periodStartStr.slice(0, 7));
    let requiredExecution = null;
    if (!existing && requiredAgreement?.requiresSignatures === true) {
      requiredExecution = requireManagementExecution(await managementAgreementExecution(parsedAgencyId, requiredAgreement, periodStartStr.slice(0, 7), pool));
    }

    const pricingBundle = await getEffectiveBillingPricingForAgency(parsedAgencyId);
    await AgencyCommunicationBillingService.reconcileAgencyPeriod({
      agencyId: parsedAgencyId,
      periodStart,
      periodEnd,
      pricingConfig: pricingBundle.effective
    });
    const usage = await BillingUsageService.getUsage(parsedAgencyId, {
      periodStart,
      periodEnd
    });
    const account = await AgencyBillingAccount.getByAgencyId(parsedAgencyId);
    let featureBilling = null;
    try {
      featureBilling = await computeFeatureBillingForPeriod(
        parsedAgencyId,
        periodStart,
        periodEnd,
        pricingBundle.effective
      );
    } catch (e) {
      if (lifecycle.agreements.some(a => a.status === 'active')) throw e;
      // Event tables may not exist on legacy databases; fall back to legacy single-axis billing.
      console.warn('Feature billing computation failed, falling back to legacy:', e?.message || e);
    }
    const estimate = applyBusinessAgreement(buildEstimate(usage, pricingBundle.effective, {
      featureEntitlements: account?.feature_entitlements_json || null,
      featureBilling
    }), lifecycle, periodStartStr.slice(0, 7), { requireRevenue: true });
    const merchantContext = await BillingMerchantContextService.getAgencySubscriptionContext(parsedAgencyId);
    const invoiceDeliveryMode = account?.autopay_enabled ? 'autopay' : 'manual';

    let alreadyCreated = false;
    const invoice = await createBusinessLifecycleService(pool).withBillingLock(parsedAgencyId, lifecycle, async db => {
      const concurrentInvoice = await AgencyBillingInvoice.findByAgencyAndPeriod(parsedAgencyId, { periodStart: periodStartStr, periodEnd: periodEndStr }, db);
      let execution = null;
      if (concurrentInvoice) {
        if (!existing || Number(concurrentInvoice.id) !== Number(existing.id) || !isUnsignedInvoiceProposal(concurrentInvoice)) {
          alreadyCreated = true; return concurrentInvoice;
        }
        execution = await managementInvoiceExecution(concurrentInvoice, lifecycle, periodStartStr.slice(0, 7), db, { lock: true });
        if (!execution) { alreadyCreated = true; return concurrentInvoice; }
      } else if (requiredExecution) {
        execution = requireManagementExecution(await managementAgreementExecution(parsedAgencyId, requiredAgreement, periodStartStr.slice(0, 7), db, { lock: true }));
      }
      const serviceLines=await medicalServiceInvoiceLines(parsedAgencyId,periodStart,{db});
      const invoiceEstimate=appendMedicalServiceLines(estimate,serviceLines);
      if (execution) invoiceEstimate.businessAgreement = { ...invoiceEstimate.businessAgreement, requiresSignatures: true, executionEvidence: execution };
      const invoiceData = {
        agencyId: parsedAgencyId,
        billingDomain: 'agency_subscription',
        merchantMode: merchantContext.merchantMode,
        providerConnectionId: merchantContext.providerConnectionId,
        periodStart: periodStartStr,
        periodEnd: periodEndStr,
        schoolsUsed: invoiceEstimate.usage.schoolsUsed,
        programsUsed: invoiceEstimate.usage.programsUsed,
        adminsUsed: invoiceEstimate.usage.adminsUsed,
        activeOnboardeesUsed: invoiceEstimate.usage.activeOnboardeesUsed,
        baseFeeCents: invoiceEstimate.totals.baseFeeCents,
        extraSchoolsCents: invoiceEstimate.totals.extraSchoolsCents,
        extraProgramsCents: invoiceEstimate.totals.extraProgramsCents,
        extraAdminsCents: invoiceEstimate.totals.extraAdminsCents,
        extraOnboardeesCents: invoiceEstimate.totals.extraOnboardeesCents,
        communicationActualCostCents: invoiceEstimate.totals.communicationActualCostCents,
        communicationMarkupCents: invoiceEstimate.totals.communicationMarkupCents,
        communicationSubtotalCents: invoiceEstimate.totals.communicationSubtotalCents,
        totalCents: invoiceEstimate.totals.totalCents,
        lineItemsJson: invoiceEstimate,
        status: 'draft',
        paymentStatus: 'unpaid',
        invoiceDeliveryMode
      };
      const created = concurrentInvoice
        ? await AgencyBillingInvoice.finalizeManagementProposal(concurrentInvoice.id, parsedAgencyId, invoiceData, db)
        : await AgencyBillingInvoice.create(invoiceData, db);
      if(invoiceEstimate.medicalServiceLines)await attachMedicalServiceInvoice(parsedAgencyId,created.id,serviceLines,db);
      return created;
    });
    if (alreadyCreated) return invoice;
    await AgencyCommunicationUsageLedger.attachInvoiceToPeriod(parsedAgencyId, {
      periodStart: periodStartStr,
      periodEnd: periodEndStr,
      invoiceId: invoice.id
    });

    // Generate PDF
    const pdfBytes = await BillingInvoicePdfService.generateInvoicePdf({
      agencyName: agency.name,
      invoice
    });

    // Save to GCS
    const key = this.buildInvoiceStorageKey({ agencyId: parsedAgencyId, periodStart: periodStartStr });
    const bucket = await StorageService.getGCSBucket();
    const file = bucket.file(key);
    await file.save(Buffer.from(pdfBytes), {
      contentType: 'application/pdf',
      metadata: {
        agencyId: String(parsedAgencyId),
        invoiceId: String(invoice.id),
        periodStart: periodStartStr,
        periodEnd: periodEndStr,
        uploadedAt: new Date().toISOString()
      }
    });

    let updated = await AgencyBillingInvoice.setPdfPath(invoice.id, key);

    // Optionally sync to QBO (customer AR invoice)
    if (syncToQuickBooks) {
      if (merchantContext?.connection?.is_connected) {
        try {
          updated = await QuickBooksBillingSyncService.syncInvoiceToQuickBooks(updated.id);
        } catch (e) {
          updated = await AgencyBillingInvoice.markQboSynced(updated.id, {
            qboInvoiceId: null,
            status: 'failed',
            errorMessage: e?.message || 'QuickBooks sync failed'
          });
        }
      }
    }

    if (account?.autopay_enabled) {
      try {
        const paymentResult = await AgencyBillingPaymentService.attemptAutoPay(updated.id);
        if (paymentResult?.attempted && paymentResult?.succeeded) {
          updated = paymentResult.invoice;
          if (merchantContext?.connection?.is_connected && updated?.qbo_invoice_id) {
            updated = await QuickBooksBillingSyncService.syncInvoicePaymentToQuickBooks(updated.id);
          }
        } else if (merchantContext?.connection?.is_connected && updated?.qbo_invoice_id && !paymentResult?.processing) {
          try {
            const deliveryResult = await QuickBooksBillingSyncService.sendInvoiceToQuickBooks(updated.id, {
              sendTo: account?.billing_email || null
            });
            updated = deliveryResult.invoice;
          } catch (deliveryError) {
            updated = await AgencyBillingInvoice.markDeliveryFailed(updated.id, deliveryError?.message || 'QuickBooks invoice email failed');
          }
        }
      } catch (e) {
        updated = await AgencyBillingInvoice.markPaymentFailed(updated.id, e?.message || 'Automatic payment failed');
        if (merchantContext?.connection?.is_connected && updated?.qbo_invoice_id) {
          try {
            const deliveryResult = await QuickBooksBillingSyncService.sendInvoiceToQuickBooks(updated.id, {
              sendTo: account?.billing_email || null
            });
            updated = deliveryResult.invoice;
          } catch (deliveryError) {
            updated = await AgencyBillingInvoice.markDeliveryFailed(updated.id, deliveryError?.message || 'QuickBooks invoice email failed');
          }
        }
      }
    } else if (merchantContext?.connection?.is_connected && updated?.qbo_invoice_id) {
      try {
        const deliveryResult = await QuickBooksBillingSyncService.sendInvoiceToQuickBooks(updated.id, {
          sendTo: account?.billing_email || null
        });
        updated = deliveryResult.invoice;
      } catch (deliveryError) {
        updated = await AgencyBillingInvoice.markDeliveryFailed(updated.id, deliveryError?.message || 'QuickBooks invoice email failed');
      }
    }

    return updated;
  }
}

export default BillingInvoiceService;
