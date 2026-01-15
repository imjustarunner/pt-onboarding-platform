import axios from 'axios';
import AgencyBillingAccount from '../models/AgencyBillingAccount.model.js';
import AgencyBillingInvoice from '../models/AgencyBillingInvoice.model.js';
import QuickBooksTokenManager from './quickbooksTokenManager.service.js';

function dollars(cents) {
  return Number((Number(cents || 0) / 100).toFixed(2));
}

function dateOnly(d) {
  return d ? new Date(d).toISOString().slice(0, 10) : null;
}

function qboBaseUrl() {
  const env = (process.env.QUICKBOOKS_ENV || process.env.QBO_ENV || 'production').toLowerCase();
  return env === 'sandbox' ? 'https://sandbox-quickbooks.api.intuit.com' : 'https://quickbooks.api.intuit.com';
}

async function qboQuery({ realmId, accessToken, query }) {
  const url = `${qboBaseUrl()}/v3/company/${realmId}/query`;
  const res = await axios.get(url, {
    params: { query, minorversion: 65 },
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json'
    },
    timeout: 20000
  });
  return res.data;
}

async function qboPost({ realmId, accessToken, path, payload }) {
  const url = `${qboBaseUrl()}/v3/company/${realmId}${path}`;
  const res = await axios.post(url, payload, {
    params: { minorversion: 65 },
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    timeout: 20000
  });
  return res.data;
}

class QuickBooksBillingSyncService {
  static async ensurePlotTwistVendor({ agencyId, realmId, accessToken }) {
    const account = await AgencyBillingAccount.getByAgencyId(agencyId);
    if (account?.qbo_vendor_id) {
      return account.qbo_vendor_id;
    }

    const vendorName = process.env.QBO_VENDOR_DISPLAY_NAME || 'PlotTwist';
    const query = `SELECT Id, DisplayName FROM Vendor WHERE DisplayName = '${vendorName.replace(/'/g, "\\'")}' MAXRESULTS 1`;
    const data = await qboQuery({ realmId, accessToken, query });
    const existing = data?.QueryResponse?.Vendor?.[0];
    if (existing?.Id) {
      await AgencyBillingAccount.setQboVendorId(agencyId, String(existing.Id));
      return String(existing.Id);
    }

    const created = await qboPost({
      realmId,
      accessToken,
      path: '/vendor',
      payload: { DisplayName: vendorName }
    });

    const id = created?.Vendor?.Id ? String(created.Vendor.Id) : null;
    if (!id) throw new Error('Failed to create PlotTwist vendor in QuickBooks');
    await AgencyBillingAccount.setQboVendorId(agencyId, id);
    return id;
  }

  static async getDefaultExpenseAccountId({ realmId, accessToken }) {
    const data = await qboQuery({
      realmId,
      accessToken,
      query: "SELECT Id, Name, AccountType FROM Account WHERE AccountType = 'Expense' MAXRESULTS 1"
    });
    const acct = data?.QueryResponse?.Account?.[0];
    if (!acct?.Id) throw new Error('No Expense account found in QuickBooks to post bill lines');
    return String(acct.Id);
  }

  static async syncInvoiceToQuickBooks(invoiceId) {
    const invoice = await AgencyBillingInvoice.findById(invoiceId);
    if (!invoice) throw new Error('Invoice not found');

    const { accessToken, realmId } = await QuickBooksTokenManager.getValidAccessToken(invoice.agency_id);
    if (!realmId) throw new Error('QuickBooks realmId is missing');

    const vendorId = await this.ensurePlotTwistVendor({ agencyId: invoice.agency_id, realmId, accessToken });
    const expenseAccountId = await this.getDefaultExpenseAccountId({ realmId, accessToken });

    const items = typeof invoice.line_items_json === 'string' ? JSON.parse(invoice.line_items_json) : invoice.line_items_json;
    const breakdown = items?.lineItems || [];

    const lines = [];
    lines.push({
      Amount: dollars(invoice.base_fee_cents),
      DetailType: 'AccountBasedExpenseLineDetail',
      Description: 'Platform Base Fee',
      AccountBasedExpenseLineDetail: { AccountRef: { value: expenseAccountId } }
    });
    for (const it of breakdown) {
      if (!it || !it.extraCents || it.extraCents <= 0) continue;
      lines.push({
        Amount: dollars(it.extraCents),
        DetailType: 'AccountBasedExpenseLineDetail',
        Description: `${it.label} overage (${it.overage} @ $${dollars(it.unitCostCents).toFixed(2)})`,
        AccountBasedExpenseLineDetail: { AccountRef: { value: expenseAccountId } }
      });
    }

    const periodStartStr = dateOnly(invoice.period_start);
    const periodEndStr = dateOnly(invoice.period_end);
    const docNumber = `PT-${invoice.agency_id}-${String(periodStartStr || '').slice(0, 7)}`; // YYYY-MM

    const created = await qboPost({
      realmId,
      accessToken,
      path: '/bill',
      payload: {
        VendorRef: { value: vendorId },
        TxnDate: periodEndStr, // bill dated at period end
        DocNumber: docNumber,
        PrivateNote: `PlotTwist platform usage invoice for ${periodStartStr} - ${periodEndStr}`,
        Line: lines
      }
    });

    const billId = created?.Bill?.Id ? String(created.Bill.Id) : null;
    if (!billId) throw new Error('QuickBooks Bill creation failed');

    return await AgencyBillingInvoice.markQboSynced(invoiceId, { qboBillId: billId, status: 'sent' });
  }
}

export default QuickBooksBillingSyncService;

