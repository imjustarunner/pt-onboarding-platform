import config from '../config/config.js';
import AgencyBillingAccount from '../models/AgencyBillingAccount.model.js';
import BillingProviderConnection from '../models/BillingProviderConnection.model.js';
import { encryptBillingSecret, isBillingEncryptionConfigured } from '../services/billingEncryption.service.js';
import BillingMerchantContextService from '../services/billingMerchantContext.service.js';
import {
  createSignedState,
  exchangeCodeForTokens,
  getQuickBooksAuthorizeUrl,
  hasQuickBooksPaymentScope,
  scopeListToCsv,
  verifySignedState
} from '../services/quickbooksOAuth.service.js';

function buildAdminBillingRedirect({ qbo = 'connected', ownerType = 'agency', agencyId = null, error = null, errorDescription = null }) {
  const url = new URL(config.frontendUrl);
  url.pathname = '/admin';
  url.searchParams.set('category', 'general');
  url.searchParams.set('item', 'billing');
  url.searchParams.set('qbo', qbo);
  url.searchParams.set('qboOwner', ownerType);
  if (agencyId) url.searchParams.set('agencyId', String(agencyId));
  if (error) url.searchParams.set('error', String(error));
  if (errorDescription) url.searchParams.set('error_description', String(errorDescription));
  return url;
}

export const getQuickBooksConnectUrl = async (req, res, next) => {
  try {
    const { agencyId } = req.params;
    const parsedAgencyId = parseInt(agencyId, 10);
    if (!parsedAgencyId || Number.isNaN(parsedAgencyId)) {
      return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    }
    if (!isBillingEncryptionConfigured()) {
      return res.status(500).json({ error: { message: 'Billing encryption not configured on server' } });
    }
    const merchantContext = await BillingMerchantContextService.getAgencySubscriptionContext(parsedAgencyId);
    if (merchantContext.merchantMode === 'platform_managed') {
      return res.status(400).json({ error: { message: 'This agency is configured to use the platform billing merchant.' } });
    }

    const state = createSignedState({
      ownerType: 'agency',
      ownerId: parsedAgencyId,
      agencyId: parsedAgencyId,
      actorUserId: req.user?.id || null
    });

    const authUrl = getQuickBooksAuthorizeUrl({
      state,
      scope: ['com.intuit.quickbooks.accounting', 'com.intuit.quickbooks.payment']
    });
    res.json({ authUrl });
  } catch (error) {
    next(error);
  }
};

export const getPlatformQuickBooksConnectUrl = async (req, res, next) => {
  try {
    if (!isBillingEncryptionConfigured()) {
      return res.status(500).json({ error: { message: 'Billing encryption not configured on server' } });
    }
    const state = createSignedState({
      ownerType: 'platform',
      ownerId: 0,
      actorUserId: req.user?.id || null
    });
    const authUrl = getQuickBooksAuthorizeUrl({
      state,
      scope: ['com.intuit.quickbooks.accounting', 'com.intuit.quickbooks.payment']
    });
    res.json({ authUrl });
  } catch (error) {
    next(error);
  }
};

export const quickBooksOAuthCallback = async (req, res, next) => {
  try {
    const { code, realmId, state, error: oauthError, error_description } = req.query;

    // If Intuit returned an error, redirect back with context
    if (oauthError) {
      const fallbackOwnerType = String(req.query?.ownerType || 'agency').toLowerCase() === 'platform' ? 'platform' : 'agency';
      const url = buildAdminBillingRedirect({
        qbo: 'error',
        ownerType: fallbackOwnerType,
        error: oauthError,
        errorDescription: error_description
      });
      return res.redirect(302, url.toString());
    }

    if (!code || !realmId || !state) {
      return res.status(400).send('Missing required query parameters');
    }

    const verified = verifySignedState(state);
    const ownerType = String(verified?.ownerType || '').toLowerCase() === 'platform' ? 'platform' : 'agency';
    const ownerId = Number(verified?.ownerId || verified?.agencyId || 0);
    if (!ownerId && ownerType !== 'platform') {
      return res.status(400).send('Invalid or expired state');
    }
    const agencyId = ownerType === 'agency' ? ownerId : null;

    const tokenData = await exchangeCodeForTokens({ code: String(code) });
    const expiresInSec = Number(tokenData.expires_in || 0);
    const expiresAt = expiresInSec ? new Date(Date.now() + expiresInSec * 1000) : null;
    const grantedScopeCsv = scopeListToCsv(tokenData.scope);
    const qboPaymentsEnabled = hasQuickBooksPaymentScope(grantedScopeCsv);

    const accessTokenEnc = encryptBillingSecret(tokenData.access_token);
    const refreshTokenEnc = encryptBillingSecret(tokenData.refresh_token);

    const connection = await BillingProviderConnection.upsertQuickBooksConnection({
      ownerType,
      ownerId,
      realmId: String(realmId),
      accessTokenEnc,
      refreshTokenEnc,
      tokenExpiresAt: expiresAt,
      scopeCsv: grantedScopeCsv,
      qboPaymentsEnabled,
      createdByUserId: req.user?.id || null,
      updatedByUserId: req.user?.id || null
    });
    if (ownerType === 'agency' && agencyId) {
      await AgencyBillingAccount.upsertQboConnection({
        agencyId,
        realmId: String(realmId),
        accessTokenEnc,
        refreshTokenEnc,
        tokenExpiresAt: expiresAt,
        scopeCsv: grantedScopeCsv,
        qboPaymentsEnabled
      });
      await AgencyBillingAccount.setSubscriptionMerchantMode(agencyId, {
        subscriptionMerchantMode: 'agency_managed',
        subscriptionProviderConnectionId: connection?.id || null
      });
    }

    const url = buildAdminBillingRedirect({
      qbo: 'connected',
      ownerType,
      agencyId
    });
    return res.redirect(302, url.toString());
  } catch (error) {
    next(error);
  }
};

export const getQuickBooksStatus = async (req, res, next) => {
  try {
    const { agencyId } = req.params;
    const status = await BillingMerchantContextService.getQuickBooksStatusForAgencySubscription(agencyId);
    res.json(status);
  } catch (error) {
    next(error);
  }
};

export const getPlatformQuickBooksStatus = async (req, res, next) => {
  try {
    const connection = await BillingProviderConnection.getByOwner({
      ownerType: 'platform',
      ownerId: 0,
      provider: 'QUICKBOOKS'
    });
    res.json({
      ownerType: 'platform',
      ownerId: 0,
      isConnected: !!connection?.is_connected,
      paymentsEnabled: !!connection?.qbo_payments_enabled,
      scopeCsv: connection?.qbo_scope_csv || '',
      realmId: connection?.qbo_realm_id || null,
      tokenExpiresAt: connection?.qbo_token_expires_at || null,
      needsReconnectForPayments: !!connection?.is_connected && !connection?.qbo_payments_enabled
    });
  } catch (error) {
    next(error);
  }
};

export const disconnectQuickBooks = async (req, res, next) => {
  try {
    const { agencyId } = req.params;
    const context = await BillingMerchantContextService.getAgencySubscriptionContext(agencyId);
    if (context.merchantMode === 'platform_managed') {
      return res.status(400).json({ error: { message: 'This agency is currently billed through the platform QuickBooks connection.' } });
    }
    const ok = await AgencyBillingAccount.disconnectQbo(agencyId);
    await BillingProviderConnection.disconnect({ ownerType: 'agency', ownerId: Number(agencyId || 0), provider: 'QUICKBOOKS' });
    if (!ok) return res.status(404).json({ error: { message: 'Billing account not found' } });
    res.json({ message: 'QuickBooks disconnected successfully' });
  } catch (error) {
    next(error);
  }
};

export const disconnectPlatformQuickBooks = async (req, res, next) => {
  try {
    const ok = await BillingProviderConnection.disconnect({ ownerType: 'platform', ownerId: 0, provider: 'QUICKBOOKS' });
    if (!ok) return res.status(404).json({ error: { message: 'Platform billing connection not found' } });
    res.json({ message: 'Platform QuickBooks disconnected successfully' });
  } catch (error) {
    next(error);
  }
};

