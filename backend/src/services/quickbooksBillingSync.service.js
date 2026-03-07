import axios from 'axios';
import AgencyBillingAccount from '../models/AgencyBillingAccount.model.js';
import AgencyBillingInvoice from '../models/AgencyBillingInvoice.model.js';
import QuickBooksTokenManager from './quickbooksTokenManager.service.js';
import Agency from '../models/Agency.model.js';

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

async function qboSendInvoice({ realmId, accessToken, invoiceId, sendTo = null }) {
  const url = `${qboBaseUrl()}/v3/company/${realmId}/invoice/${invoiceId}/send`;
  const res = await axios.post(url, null, {
    params: {
      minorversion: 65,
      ...(sendTo ? { sendTo } : {})
    },
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/octet-stream'
    },
    timeout: 20000
  });
  return res.data;
}

class QuickBooksBillingSyncService {
  static async ensureAgencyCustomer({ agencyId, agencyName, realmId, accessToken }) {
    const account = await AgencyBillingAccount.getByAgencyId(agencyId);
    if (account?.qbo_customer_id) {
      return account.qbo_customer_id;
    }

    const customerName = String(agencyName || `Agency ${agencyId}`).trim();
    const query = `SELECT Id, DisplayName FROM Customer WHERE DisplayName = '${customerName.replace(/'/g, "\\'")}' MAXRESULTS 1`;
    const data = await qboQuery({ realmId, accessToken, query });
    const existing = data?.QueryResponse?.Customer?.[0];
    if (existing?.Id) {
      await AgencyBillingAccount.setQboCustomerId(agencyId, String(existing.Id));
      return String(existing.Id);
    }

    const created = await qboPost({
      realmId,
      accessToken,
      path: '/customer',
      payload: { DisplayName: customerName }
    });

    const id = created?.Customer?.Id ? String(created.Customer.Id) : null;
    if (!id) throw new Error('Failed to create agency customer in QuickBooks');
    await AgencyBillingAccount.setQboCustomerId(agencyId, id);
    return id;
  }

  static async getDefaultIncomeAccountId({ realmId, accessToken }) {
    const data = await qboQuery({
      realmId,
      accessToken,
      query: "SELECT Id, Name, AccountType FROM Account WHERE AccountType = 'Income' MAXRESULTS 1"
    });
    const acct = data?.QueryResponse?.Account?.[0];
    if (!acct?.Id) throw new Error('No Income account found in QuickBooks to post invoice lines');
    return String(acct.Id);
  }

  static async ensurePlotTwistServiceItem({ agencyId, realmId, accessToken }) {
    const account = await AgencyBillingAccount.getByAgencyId(agencyId);
    if (account?.qbo_service_item_id) {
      return account.qbo_service_item_id;
    }
    const itemName = process.env.QBO_SERVICE_ITEM_NAME || 'PlotTwist Platform Billing';
    const query = `SELECT Id, Name, Type FROM Item WHERE Name = '${itemName.replace(/'/g, "\\'")}' MAXRESULTS 1`;
    const data = await qboQuery({ realmId, accessToken, query });
    const existing = data?.QueryResponse?.Item?.[0];
    if (existing?.Id) {
      await AgencyBillingAccount.setQboServiceItemId(agencyId, String(existing.Id));
      return String(existing.Id);
    }

    const incomeAccountId = await this.getDefaultIncomeAccountId({ realmId, accessToken });
    const created = await qboPost({
      realmId,
      accessToken,
      path: '/item',
      payload: {
        Name: itemName,
        Type: 'Service',
        IncomeAccountRef: { value: incomeAccountId }
      }
    });
    const id = created?.Item?.Id ? String(created.Item.Id) : null;
    if (!id) throw new Error('Failed to create PlotTwist service item in QuickBooks');
    await AgencyBillingAccount.setQboServiceItemId(agencyId, id);
    return id;
  }

  static async getDepositAccountId({ realmId, accessToken }) {
    const preferred = await qboQuery({
      realmId,
      accessToken,
      query: "SELECT Id, Name FROM Account WHERE AccountSubType = 'UndepositedFunds' MAXRESULTS 1"
    });
    const preferredAccount = preferred?.QueryResponse?.Account?.[0];
    if (preferredAccount?.Id) return String(preferredAccount.Id);

    const fallback = await qboQuery({
      realmId,
      accessToken,
      query: "SELECT Id, Name, AccountType FROM Account WHERE AccountType = 'Bank' MAXRESULTS 1"
    });
    const bankAccount = fallback?.QueryResponse?.Account?.[0];
    if (!bankAccount?.Id) throw new Error('No deposit account found in QuickBooks for customer payment');
    return String(bankAccount.Id);
  }

  static async syncInvoiceToQuickBooks(invoiceId) {
    const invoice = await AgencyBillingInvoice.findById(invoiceId);
    if (!invoice) throw new Error('Invoice not found');

    const { accessToken, realmId } = await QuickBooksTokenManager.getValidAccessToken(invoice.agency_id);
    if (!realmId) throw new Error('QuickBooks realmId is missing');

    const agency = await Agency.findById(invoice.agency_id);
    const customerId = await this.ensureAgencyCustomer({
      agencyId: invoice.agency_id,
      agencyName: agency?.name || null,
      realmId,
      accessToken
    });
    const serviceItemId = await this.ensurePlotTwistServiceItem({
      agencyId: invoice.agency_id,
      realmId,
      accessToken
    });

    const items = typeof invoice.line_items_json === 'string' ? JSON.parse(invoice.line_items_json) : invoice.line_items_json;
    const breakdown = items?.lineItems || [];

    const lines = [];
    lines.push({
      Amount: dollars(invoice.base_fee_cents),
      DetailType: 'SalesItemLineDetail',
      Description: 'Platform Base Fee',
      SalesItemLineDetail: {
        ItemRef: { value: serviceItemId },
        Qty: 1,
        UnitPrice: dollars(invoice.base_fee_cents)
      }
    });
    for (const it of breakdown) {
      if (!it || !it.extraCents || it.extraCents <= 0) continue;
      lines.push({
        Amount: dollars(it.extraCents),
        DetailType: 'SalesItemLineDetail',
        Description: `${it.label} (${it.used} @ $${dollars(it.unitCostCents).toFixed(2)})`,
        SalesItemLineDetail: {
          ItemRef: { value: serviceItemId },
          Qty: Number(it.used || 0),
          UnitPrice: dollars(it.unitCostCents)
        }
      });
    }

    const periodStartStr = dateOnly(invoice.period_start);
    const periodEndStr = dateOnly(invoice.period_end);
    const docNumber = `PT-AR-${invoice.agency_id}-${String(periodStartStr || '').slice(0, 7)}`;
    const dueDate = periodEndStr;

    const created = await qboPost({
      realmId,
      accessToken,
      path: '/invoice',
      payload: {
        CustomerRef: { value: customerId },
        TxnDate: periodEndStr,
        DueDate: dueDate,
        DocNumber: docNumber,
        PrivateNote: `PlotTwist platform usage invoice for ${periodStartStr} - ${periodEndStr}`,
        Line: lines
      }
    });

    const qboInvoiceId = created?.Invoice?.Id ? String(created.Invoice.Id) : null;
    if (!qboInvoiceId) throw new Error('QuickBooks Invoice creation failed');

    return await AgencyBillingInvoice.markQboSynced(invoiceId, {
      qboInvoiceId,
      status: invoice.payment_status === 'paid' ? 'paid' : 'sent'
    });
  }

  static async syncInvoicePaymentToQuickBooks(invoiceId) {
    const invoice = await AgencyBillingInvoice.findById(invoiceId);
    if (!invoice) throw new Error('Invoice not found');
    if (!invoice.qbo_invoice_id) return invoice;

    const { accessToken, realmId } = await QuickBooksTokenManager.getValidAccessToken(invoice.agency_id);
    if (!realmId) throw new Error('QuickBooks realmId is missing');
    const agency = await Agency.findById(invoice.agency_id);
    const customerId = await this.ensureAgencyCustomer({
      agencyId: invoice.agency_id,
      agencyName: agency?.name || null,
      realmId,
      accessToken
    });
    const depositAccountId = await this.getDepositAccountId({ realmId, accessToken });
    const txnDate = dateOnly(invoice.paid_at || new Date());

    const created = await qboPost({
      realmId,
      accessToken,
      path: '/payment',
      payload: {
        CustomerRef: { value: customerId },
        TotalAmt: dollars(invoice.total_cents),
        TxnDate: txnDate,
        PrivateNote: `Autopay for PlotTwist invoice ${invoice.id}`,
        DepositToAccountRef: { value: depositAccountId },
        Line: [
          {
            Amount: dollars(invoice.total_cents),
            LinkedTxn: [{ TxnId: String(invoice.qbo_invoice_id), TxnType: 'Invoice' }]
          }
        ]
      }
    });

    const qboPaymentId = created?.Payment?.Id ? String(created.Payment.Id) : null;
    if (!qboPaymentId) throw new Error('QuickBooks Payment creation failed');
    return AgencyBillingInvoice.markPaid(invoiceId, { qboPaymentId });
  }

  static async sendInvoiceToQuickBooks(invoiceId, { sendTo = null } = {}) {
    const invoice = await AgencyBillingInvoice.findById(invoiceId);
    if (!invoice) throw new Error('Invoice not found');
    if (!invoice.qbo_invoice_id) throw new Error('QuickBooks invoice has not been created yet');

    const account = await AgencyBillingAccount.getByAgencyId(invoice.agency_id);
    const { accessToken, realmId } = await QuickBooksTokenManager.getValidAccessToken(invoice.agency_id);
    if (!realmId) throw new Error('QuickBooks realmId is missing');

    const email = String(sendTo || account?.billing_email || '').trim() || null;
    const result = await qboSendInvoice({
      realmId,
      accessToken,
      invoiceId: invoice.qbo_invoice_id,
      sendTo: email
    });
    return {
      invoice: await AgencyBillingInvoice.markDeliverySent(invoiceId),
      result
    };
  }
}

export default QuickBooksBillingSyncService;

