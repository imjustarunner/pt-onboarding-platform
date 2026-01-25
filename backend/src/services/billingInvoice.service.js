import StorageService from './storage.service.js';
import BillingUsageService from './billingUsage.service.js';
import { buildEstimate, getEffectiveBillingPricingForAgency } from './billingPricing.service.js';
import { getCurrentBillingPeriod } from '../utils/billingPeriod.js';
import Agency from '../models/Agency.model.js';
import AgencyBillingInvoice from '../models/AgencyBillingInvoice.model.js';
import BillingInvoicePdfService from './billingInvoicePdf.service.js';
import QuickBooksBillingSyncService from './quickbooksBillingSync.service.js';
import AgencyBillingAccount from '../models/AgencyBillingAccount.model.js';

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

    const usage = await BillingUsageService.getUsage(parsedAgencyId, {
      periodStart,
      periodEnd
    });
    const pricingBundle = await getEffectiveBillingPricingForAgency(parsedAgencyId);
    const estimate = buildEstimate(usage, pricingBundle.effective);

    const invoice = await AgencyBillingInvoice.create({
      agencyId: parsedAgencyId,
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
      totalCents: estimate.totals.totalCents,
      lineItemsJson: estimate,
      status: 'draft'
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

    // Optionally sync to QBO (create a Bill in the agency QBO)
    if (syncToQuickBooks) {
      const acct = await AgencyBillingAccount.getByAgencyId(parsedAgencyId);
      if (acct?.is_qbo_connected) {
        try {
          updated = await QuickBooksBillingSyncService.syncInvoiceToQuickBooks(updated.id);
        } catch (e) {
          updated = await AgencyBillingInvoice.markQboSynced(updated.id, {
            qboBillId: null,
            status: 'failed',
            errorMessage: e?.message || 'QuickBooks sync failed'
          });
        }
      }
    }

    return updated;
  }
}

export default BillingInvoiceService;

