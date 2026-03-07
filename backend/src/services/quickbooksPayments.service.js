import axios from 'axios';
import AgencyBillingAccount from '../models/AgencyBillingAccount.model.js';
import BillingProviderConnection from '../models/BillingProviderConnection.model.js';
import QuickBooksTokenManager from './quickbooksTokenManager.service.js';
import BillingMerchantContextService from './billingMerchantContext.service.js';

function paymentsBaseUrl() {
  const env = (process.env.QUICKBOOKS_ENV || process.env.QBO_ENV || 'production').toLowerCase();
  return env === 'sandbox' ? 'https://sandbox-quickbooks.api.intuit.com' : 'https://quickbooks.api.intuit.com';
}

function dollars(cents) {
  return Number((Number(cents || 0) / 100).toFixed(2));
}

function cleanCardAddress(address = null) {
  if (!address || typeof address !== 'object') return null;
  const normalized = {
    streetAddress: String(address.streetAddress || address.line1 || '').trim() || null,
    city: String(address.city || '').trim() || null,
    region: String(address.region || address.state || '').trim() || null,
    country: String(address.country || 'US').trim() || null,
    postalCode: String(address.postalCode || address.zip || '').trim() || null
  };
  return Object.values(normalized).some(Boolean) ? normalized : null;
}

function normalizeCardPayload(card = null) {
  if (!card || typeof card !== 'object') return null;
  return {
    name: String(card.name || '').trim() || null,
    number: String(card.number || '').replace(/[^\d]/g, '') || null,
    expMonth: String(card.expMonth || '').replace(/[^\d]/g, '') || null,
    expYear: String(card.expYear || '').replace(/[^\d]/g, '') || null,
    cvc: String(card.cvc || '').replace(/[^\d]/g, '') || null,
    address: cleanCardAddress(card.address)
  };
}

function pickCardObject(payload) {
  if (!payload || typeof payload !== 'object') return null;
  return payload.Card || payload.card || payload.value || payload.cardOnFile || payload;
}

function buildRequestHeaders(accessToken, requestId = null) {
  const id = String(requestId || `qbpay_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'Request-Id': id,
    'Intuit-Request-Id': id
  };
}

class QuickBooksPaymentsService {
  static async ensurePaymentsReady({ agencyId = null, connectionId = null } = {}) {
    let connection = null;
    if (connectionId) {
      connection = await BillingProviderConnection.findById(connectionId);
    } else if (agencyId) {
      const context = await BillingMerchantContextService.getAgencySubscriptionContext(agencyId);
      connection = context.connection;
    }
    if (!connection?.is_connected) {
      throw new Error('QuickBooks is not connected for this billing merchant');
    }
    if (!connection?.qbo_payments_enabled) {
      throw new Error('QuickBooks Payments scope is not enabled for this billing merchant. Reconnect QuickBooks to enable payments.');
    }
    return connection;
  }

  static async getAuthContext({ agencyId = null, connectionId = null } = {}) {
    const connection = await this.ensurePaymentsReady({ agencyId, connectionId });
    const { accessToken } = await QuickBooksTokenManager.getValidAccessTokenForConnection(connection.id);
    return {
      connection,
      accessToken
    };
  }

  static async request({ agencyId = null, connectionId = null, method = 'GET', path, params = undefined, payload = undefined, requestId = null }) {
    const { accessToken } = await this.getAuthContext({ agencyId, connectionId });
    const url = `${paymentsBaseUrl()}${path}`;
    const res = await axios({
      url,
      method,
      params,
      data: payload,
      headers: buildRequestHeaders(accessToken, requestId),
      timeout: 30000
    });
    return res.data;
  }

  static async ensurePaymentCustomerRef(agencyId) {
    const account = await AgencyBillingAccount.getByAgencyId(agencyId);
    const existing = String(account?.payment_customer_ref || '').trim();
    if (existing) return existing;
    return BillingMerchantContextService.ensureSubscriptionPaymentCustomerRef(agencyId, {
      account
    });
  }

  static async createTokenFromCard({ agencyId, card }) {
    const normalizedCard = normalizeCardPayload(card);
    if (!normalizedCard?.number || !normalizedCard?.expMonth || !normalizedCard?.expYear || !normalizedCard?.cvc) {
      throw new Error('Complete card details are required');
    }
    const payload = {
      card: {
        number: normalizedCard.number,
        expMonth: normalizedCard.expMonth,
        expYear: normalizedCard.expYear,
        cvc: normalizedCard.cvc
      }
    };
    if (normalizedCard.name) payload.card.name = normalizedCard.name;
    if (normalizedCard.address) payload.card.address = normalizedCard.address;

    const data = await this.request({
      agencyId,
      method: 'POST',
      path: '/quickbooks/v4/payments/tokens',
      payload
    });
    const token = data?.value || data?.token || data?.Token || null;
    if (!token) throw new Error('QuickBooks Payments token creation failed');
    return token;
  }

  static async createCard({ agencyId, connectionId = null, token = null, card = null }) {
    const paymentCustomerRef = await this.ensurePaymentCustomerRef(agencyId);
    const effectiveToken = token || (await this.createTokenFromCard({ agencyId, card }));
    const payload = {
      customerId: paymentCustomerRef,
      token: String(effectiveToken)
    };
    const data = await this.request({
      agencyId,
      connectionId,
      method: 'POST',
      path: '/quickbooks/v4/payments/cards',
      payload
    });
    const cardObj = pickCardObject(data);
    if (!cardObj?.id) throw new Error('QuickBooks Payments card storage failed');
    return {
      customerId: paymentCustomerRef,
      card: cardObj,
      raw: data
    };
  }

  static async listCards({ agencyId }) {
    const paymentCustomerRef = await this.ensurePaymentCustomerRef(agencyId);
    const data = await this.request({
      agencyId,
      method: 'GET',
      path: '/quickbooks/v4/payments/cards',
      params: { customerId: paymentCustomerRef }
    });
    const cards = Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data?.value)
        ? data.value
        : Array.isArray(data?.cards)
          ? data.cards
          : Array.isArray(data)
            ? data
            : [];
    return {
      customerId: paymentCustomerRef,
      cards
    };
  }

  static async getCharge({ agencyId = null, connectionId = null, chargeId }) {
    if (!chargeId) throw new Error('chargeId is required');
    const data = await this.request({
      agencyId,
      connectionId,
      method: 'GET',
      path: `/quickbooks/v4/payments/charges/${encodeURIComponent(String(chargeId))}`
    });
    return pickCardObject(data) ? data : (data?.Charge || data?.charge || data);
  }

  static async createCharge({
    agencyId,
    connectionId = null,
    amountCents,
    currency = 'USD',
    cardOnFileId,
    paymentCustomerRef = null,
    requestId = null,
    description = null,
    context = null
  }) {
    if (!cardOnFileId) throw new Error('cardOnFileId is required');
    const customerId = paymentCustomerRef || await this.ensurePaymentCustomerRef(agencyId);
    const payload = {
      amount: dollars(amountCents),
      currency: String(currency || 'USD').trim().slice(0, 3).toUpperCase(),
      cardOnFile: String(cardOnFileId),
      customerId
    };
    if (description) payload.description = String(description).trim().slice(0, 255);
    payload.context = context || { mobile: false, isEcommerce: true };

    const data = await this.request({
      agencyId,
      connectionId,
      method: 'POST',
      path: '/quickbooks/v4/payments/charges',
      payload,
      requestId
    });
    const charge = data?.charge || data?.Charge || data;
    const chargeId = charge?.id || charge?.chargeId || null;
    if (!chargeId) throw new Error('QuickBooks Payments charge creation failed');
    return {
      customerId,
      charge,
      raw: data
    };
  }

  static mapChargeStatus(rawStatus) {
    const status = String(rawStatus || '').trim().toLowerCase();
    if (['captured', 'settled', 'succeeded'].includes(status)) return 'SUCCEEDED';
    if (['pending', 'processing', 'authorized'].includes(status)) return 'PROCESSING';
    if (['declined', 'failed', 'voided'].includes(status)) return 'FAILED';
    if (['refunded'].includes(status)) return 'REFUNDED';
    return 'PENDING';
  }
}

export default QuickBooksPaymentsService;
