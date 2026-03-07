import AgencyBillingPaymentMethod from '../models/AgencyBillingPaymentMethod.model.js';
import QuickBooksPaymentsService from '../services/quickbooksPayments.service.js';

export const listAgencyBillingPaymentMethods = async (req, res, next) => {
  try {
    const agencyId = Number(req.params.agencyId || 0);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    const methods = await AgencyBillingPaymentMethod.listByAgency(agencyId);
    res.json({ agencyId, methods });
  } catch (error) {
    next(error);
  }
};

function toIntOrNull(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function extractStoredCardMeta(card = null) {
  const source = card || {};
  return {
    providerPaymentMethodId: source.id || source.cardId || null,
    cardBrand: source.brand || source.cardType || source.type || null,
    last4: source.last4 || source.number?.slice?.(-4) || null,
    expMonth: toIntOrNull(source.expMonth || source.exp_month),
    expYear: toIntOrNull(source.expYear || source.exp_year)
  };
}

export const createAgencyBillingPaymentMethod = async (req, res, next) => {
  try {
    const agencyId = Number(req.params.agencyId || 0);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    const token = String(req.body?.token || '').trim() || null;
    const card = req.body?.card && typeof req.body.card === 'object' ? req.body.card : null;
    if (!token && !card) {
      return res.status(400).json({ error: { message: 'A QuickBooks payment token or card payload is required.' } });
    }

    const stored = await QuickBooksPaymentsService.createCard({
      agencyId,
      token,
      card
    });
    const meta = extractStoredCardMeta(stored?.card);
    const method = await AgencyBillingPaymentMethod.createFromProcessor({
      agencyId,
      createdByUserId: req.user?.id || null,
      provider: 'QUICKBOOKS_PAYMENTS',
      providerCustomerId: stored?.customerId || null,
      providerPaymentMethodId: meta.providerPaymentMethodId,
      cardBrand: meta.cardBrand,
      last4: meta.last4,
      expMonth: meta.expMonth,
      expYear: meta.expYear,
      isDefault: req.body?.isDefault !== false
    });

    res.status(201).json({
      agencyId,
      method,
      processorCard: stored?.card || null
    });
  } catch (error) {
    next(error);
  }
};

export const setAgencyBillingPaymentMethodDefault = async (req, res, next) => {
  try {
    const agencyId = Number(req.params.agencyId || 0);
    const paymentMethodId = Number(req.params.paymentMethodId || 0);
    if (!agencyId || !paymentMethodId) {
      return res.status(400).json({ error: { message: 'Invalid payment method selection' } });
    }
    const method = await AgencyBillingPaymentMethod.setDefault({
      agencyId,
      paymentMethodId,
      updatedByUserId: req.user?.id || null
    });
    if (!method) return res.status(404).json({ error: { message: 'Payment method not found' } });
    res.json({ agencyId, method });
  } catch (error) {
    next(error);
  }
};
