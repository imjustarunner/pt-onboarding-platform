import AgencyBillingAccount from '../models/AgencyBillingAccount.model.js';
import AgencyBillingInvoice from '../models/AgencyBillingInvoice.model.js';
import AgencyBillingPayment from '../models/AgencyBillingPayment.model.js';
import AgencyBillingPaymentAttempt from '../models/AgencyBillingPaymentAttempt.model.js';
import AgencyBillingPaymentMethod from '../models/AgencyBillingPaymentMethod.model.js';
import QuickBooksPaymentsService from './quickbooksPayments.service.js';
import BillingMerchantContextService from './billingMerchantContext.service.js';

function toSqlDateTime(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

class AgencyBillingPaymentService {
  static async attemptAutoPay(invoiceId) {
    const invoice = await AgencyBillingInvoice.findById(invoiceId);
    if (!invoice) throw new Error('Invoice not found');

    const account = await AgencyBillingAccount.getByAgencyId(invoice.agency_id);
    const merchantContext = await BillingMerchantContextService.getAgencySubscriptionContext(invoice.agency_id);
    if (!account?.autopay_enabled) {
      return { attempted: false, reason: 'autopay_disabled', invoice };
    }

    const paymentMethod = await AgencyBillingPaymentMethod.getDefaultForAgency(invoice.agency_id, {
      billingDomain: 'agency_subscription',
      merchantMode: merchantContext.merchantMode
    });
    if (!paymentMethod) {
      return { attempted: false, reason: 'no_default_payment_method', invoice };
    }

    await AgencyBillingInvoice.markPaymentAttempted(invoice.id);

    const provider = String(paymentMethod.provider || '').trim().toUpperCase();
    if (provider !== 'QUICKBOOKS_PAYMENTS') {
      throw new Error(`Unsupported billing payment provider: ${provider || 'UNSET'}`);
    }

    const idempotencyKey = `agency_billing:${invoice.agency_id}:${invoice.id}`;
    let payment = await AgencyBillingPayment.findByIdempotencyKey(idempotencyKey);
    if (!payment) {
      payment = await AgencyBillingPayment.create({
        agencyId: invoice.agency_id,
        billingDomain: invoice.billing_domain || 'agency_subscription',
        merchantMode: merchantContext.merchantMode,
        invoiceId: invoice.id,
        paymentMethodId: paymentMethod.id,
        amountCents: invoice.total_cents,
        currency: 'USD',
        paymentStatus: 'PENDING',
        processor: 'QUICKBOOKS_PAYMENTS',
        providerConnectionId: merchantContext.providerConnectionId,
        processorCustomerId: paymentMethod.provider_customer_id || account.payment_customer_ref || null,
        processorPaymentMethodId: paymentMethod.provider_payment_method_id || null,
        initiatedAt: toSqlDateTime(),
        idempotencyKey,
        metadataJson: {
          invoiceId: invoice.id,
          invoicePeriodStart: invoice.period_start,
          invoicePeriodEnd: invoice.period_end
        }
      });
    }
    if (String(payment.payment_status || '').toUpperCase() === 'SUCCEEDED') {
      const refreshedInvoice = await AgencyBillingInvoice.findById(invoice.id);
      return {
        attempted: false,
        succeeded: true,
        reason: 'already_paid',
        payment,
        paymentMethod,
        invoice: refreshedInvoice
      };
    }
    const priorAttempts = await AgencyBillingPaymentAttempt.listByPayment(payment.id);
    const nextAttemptNo = (priorAttempts?.length || 0) + 1;
    const processorRequestId = `${idempotencyKey}:attempt:${nextAttemptNo}`;

    const chargeRequest = {
      amountCents: Number(invoice.total_cents || 0),
      currency: 'USD',
      cardOnFileId: paymentMethod.provider_payment_method_id,
      paymentCustomerRef: paymentMethod.provider_customer_id || account.payment_customer_ref || null,
      connectionId: merchantContext.providerConnectionId,
      requestId: processorRequestId,
      description: `PlotTwist invoice ${invoice.id}`
    };

    try {
      const result = await QuickBooksPaymentsService.createCharge({
        agencyId: invoice.agency_id,
        ...chargeRequest
      });
      const charge = result?.charge || {};
      const processorStatus = String(charge?.status || charge?.statusCode || 'pending');
      const mappedStatus = QuickBooksPaymentsService.mapChargeStatus(processorStatus);

      await AgencyBillingPaymentAttempt.create({
        paymentId: payment.id,
        billingDomain: invoice.billing_domain || 'agency_subscription',
        merchantMode: merchantContext.merchantMode,
        providerConnectionId: merchantContext.providerConnectionId,
        requestPayloadJson: chargeRequest,
        responsePayloadJson: result?.raw || charge,
        processorStatus,
        resultStatus: mappedStatus === 'FAILED' ? 'FAILED' : mappedStatus === 'SUCCEEDED' ? 'SUCCESS' : 'PENDING',
        errorMessage: mappedStatus === 'FAILED' ? (charge?.message || charge?.statusDetail || 'Charge failed') : null
      });

      payment = await AgencyBillingPayment.updateById(payment.id, {
        merchant_mode: merchantContext.merchantMode,
        provider_connection_id: merchantContext.providerConnectionId,
        payment_status: mappedStatus,
        processor_charge_id: charge?.id || charge?.chargeId || null,
        processor_reference_id: charge?.requestId || processorRequestId,
        processor_status: processorStatus,
        captured_at: mappedStatus === 'SUCCEEDED' ? toSqlDateTime() : undefined,
        failed_at: mappedStatus === 'FAILED' ? toSqlDateTime() : undefined,
        failure_code: mappedStatus === 'FAILED' ? (charge?.code || charge?.responseCode || 'charge_failed') : undefined,
        failure_message: mappedStatus === 'FAILED' ? (charge?.message || charge?.statusDetail || 'Charge failed') : undefined,
        metadata_json: { charge }
      });

      if (mappedStatus === 'SUCCEEDED') {
        const updated = await AgencyBillingInvoice.markPaid(invoice.id, {
          paymentMethodId: paymentMethod.id,
          paymentReference: payment.processor_charge_id || charge?.id || processorRequestId
        });
        return {
          attempted: true,
          succeeded: true,
          processing: false,
          payment,
          paymentMethod,
          invoice: updated
        };
      }

      if (mappedStatus === 'FAILED') {
        const updated = await AgencyBillingInvoice.markPaymentFailed(invoice.id, payment.failure_message || 'Automatic payment failed');
        return {
          attempted: true,
          succeeded: false,
          processing: false,
          reason: 'charge_failed',
          payment,
          paymentMethod,
          invoice: updated
        };
      }

      const refreshedInvoice = await AgencyBillingInvoice.findById(invoice.id);
      return {
        attempted: true,
        succeeded: false,
        processing: true,
        reason: 'charge_processing',
        payment,
        paymentMethod,
        invoice: refreshedInvoice
      };
    } catch (error) {
      await AgencyBillingPaymentAttempt.create({
        paymentId: payment.id,
        billingDomain: invoice.billing_domain || 'agency_subscription',
        merchantMode: merchantContext.merchantMode,
        providerConnectionId: merchantContext.providerConnectionId,
        requestPayloadJson: chargeRequest,
        responsePayloadJson: error?.response?.data || null,
        processorStatus: 'request_failed',
        resultStatus: 'FAILED',
        errorMessage: error?.response?.data?.message || error?.message || 'Charge failed'
      });
      payment = await AgencyBillingPayment.updateById(payment.id, {
        merchant_mode: merchantContext.merchantMode,
        provider_connection_id: merchantContext.providerConnectionId,
        payment_status: 'FAILED',
        processor_status: 'request_failed',
        failed_at: toSqlDateTime(),
        failure_code: error?.response?.status ? String(error.response.status) : 'request_failed',
        failure_message: error?.response?.data?.message || error?.message || 'Charge failed',
        metadata_json: {
          error: error?.response?.data || error?.message || null
        }
      });
      const updated = await AgencyBillingInvoice.markPaymentFailed(invoice.id, payment.failure_message || 'Automatic payment failed');
      return {
        attempted: true,
        succeeded: false,
        processing: false,
        reason: 'charge_failed',
        payment,
        paymentMethod,
        invoice: updated
      };
    }
  }

  static async reconcilePayment(paymentId) {
    const payment = await AgencyBillingPayment.findById(paymentId);
    if (!payment?.processor_charge_id || String(payment.processor || '').toUpperCase() !== 'QUICKBOOKS_PAYMENTS') {
      return payment;
    }

    const charge = await QuickBooksPaymentsService.getCharge({
      agencyId: payment.agency_id,
      connectionId: payment.provider_connection_id || null,
      chargeId: payment.processor_charge_id
    });
    const processorStatus = String(charge?.status || charge?.statusCode || 'pending');
    const mappedStatus = QuickBooksPaymentsService.mapChargeStatus(processorStatus);

    const updatedPayment = await AgencyBillingPayment.updateById(payment.id, {
      payment_status: mappedStatus,
      processor_status: processorStatus,
      captured_at: mappedStatus === 'SUCCEEDED' ? (payment.captured_at || toSqlDateTime()) : undefined,
      failed_at: mappedStatus === 'FAILED' ? (payment.failed_at || toSqlDateTime()) : undefined,
      failure_code: mappedStatus === 'FAILED' ? (charge?.code || charge?.responseCode || 'charge_failed') : undefined,
      failure_message: mappedStatus === 'FAILED' ? (charge?.message || charge?.statusDetail || 'Charge failed') : undefined,
      metadata_json: { charge }
    });

    const invoice = await AgencyBillingInvoice.findById(payment.invoice_id);
    if (invoice) {
      if (mappedStatus === 'SUCCEEDED' && invoice.payment_status !== 'paid') {
        await AgencyBillingInvoice.markPaid(invoice.id, {
          paymentMethodId: payment.payment_method_id,
          paymentReference: updatedPayment.processor_charge_id || updatedPayment.processor_reference_id
        });
      } else if (mappedStatus === 'FAILED' && invoice.payment_status !== 'paid') {
        await AgencyBillingInvoice.markPaymentFailed(invoice.id, updatedPayment.failure_message || 'Automatic payment failed');
      }
    }

    return updatedPayment;
  }

  static async reconcilePendingPayments({ agencyId = null, limit = 50 } = {}) {
    const pending = await AgencyBillingPayment.listPendingReconciliation({ limit });
    const results = [];
    for (const payment of pending) {
      if (agencyId && Number(payment.agency_id) !== Number(agencyId)) continue;
      try {
        const updated = await this.reconcilePayment(payment.id);
        results.push(updated);
      } catch (error) {
        results.push({
          id: payment.id,
          agency_id: payment.agency_id,
          error: error?.message || 'Failed to reconcile payment'
        });
      }
    }
    return results;
  }
}

export default AgencyBillingPaymentService;
