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

    const { periodStart, periodEnd } = period || getCurrentBillingPeriod(new Date());
    const periodStartStr = periodStart.toISOString().slice(0, 10);
    const periodEndStr = periodEnd.toISOString().slice(0, 10);

    // Prevent duplicates for a period (return existing)
    const existing = await AgencyBillingInvoice.findByAgencyAndPeriod(parsedAgencyId, {
      periodStart: periodStartStr,
      periodEnd: periodEndStr
    });
    if (existing) return existing;

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
      // Event tables may not exist on legacy databases; fall back to legacy single-axis billing.
      console.warn('Feature billing computation failed, falling back to legacy:', e?.message || e);
    }
    const estimate = buildEstimate(usage, pricingBundle.effective, {
      featureEntitlements: account?.feature_entitlements_json || null,
      featureBilling
    });
    const merchantContext = await BillingMerchantContextService.getAgencySubscriptionContext(parsedAgencyId);
    const invoiceDeliveryMode = account?.autopay_enabled ? 'autopay' : 'manual';

    const invoice = await AgencyBillingInvoice.create({
      agencyId: parsedAgencyId,
      billingDomain: 'agency_subscription',
      merchantMode: merchantContext.merchantMode,
      providerConnectionId: merchantContext.providerConnectionId,
      periodStart: periodStartStr,
      periodEnd: periodEndStr,
      schoolsUsed: estimate.usage.schoolsUsed,
      programsUsed: estimate.usage.programsUsed,
      adminsUsed: estimate.usage.adminsUsed,
      activeOnboardeesUsed: estimate.usage.activeOnboardeesUsed,
      baseFeeCents: estimate.totals.baseFeeCents,
      extraSchoolsCents: estimate.totals.extraSchoolsCents,
      extraProgramsCents: estimate.totals.extraProgramsCents,
      extraAdminsCents: estimate.totals.extraAdminsCents,
      extraOnboardeesCents: estimate.totals.extraOnboardeesCents,
      communicationActualCostCents: estimate.totals.communicationActualCostCents,
      communicationMarkupCents: estimate.totals.communicationMarkupCents,
      communicationSubtotalCents: estimate.totals.communicationSubtotalCents,
      totalCents: estimate.totals.totalCents,
      lineItemsJson: estimate,
      status: 'draft',
      paymentStatus: 'unpaid',
      invoiceDeliveryMode
    });
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
