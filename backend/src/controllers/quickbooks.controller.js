import config from '../config/config.js';
import AgencyBillingAccount from '../models/AgencyBillingAccount.model.js';
import { encryptBillingSecret, isBillingEncryptionConfigured } from '../services/billingEncryption.service.js';
import { createSignedState, exchangeCodeForTokens, getQuickBooksAuthorizeUrl, verifySignedState } from '../services/quickbooksOAuth.service.js';

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

    const state = createSignedState({
      agencyId: parsedAgencyId,
      actorUserId: req.user?.id || null
    });

    const authUrl = getQuickBooksAuthorizeUrl({ state });
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
      const url = new URL(config.frontendUrl);
      url.pathname = '/admin';
      url.searchParams.set('category', 'general');
      url.searchParams.set('item', 'billing');
      url.searchParams.set('qbo', 'error');
      url.searchParams.set('error', String(oauthError));
      if (error_description) url.searchParams.set('error_description', String(error_description));
      return res.redirect(302, url.toString());
    }

    if (!code || !realmId || !state) {
      return res.status(400).send('Missing required query parameters');
    }

    const verified = verifySignedState(state);
    if (!verified?.agencyId) {
      return res.status(400).send('Invalid or expired state');
    }
    const agencyId = parseInt(verified.agencyId, 10);

    const tokenData = await exchangeCodeForTokens({ code: String(code) });
    const expiresInSec = Number(tokenData.expires_in || 0);
    const expiresAt = expiresInSec ? new Date(Date.now() + expiresInSec * 1000) : null;

    const accessTokenEnc = encryptBillingSecret(tokenData.access_token);
    const refreshTokenEnc = encryptBillingSecret(tokenData.refresh_token);

    await AgencyBillingAccount.upsertQboConnection({
      agencyId,
      realmId: String(realmId),
      accessTokenEnc,
      refreshTokenEnc,
      tokenExpiresAt: expiresAt
    });

    const url = new URL(config.frontendUrl);
    url.pathname = '/admin';
    url.searchParams.set('category', 'general');
    url.searchParams.set('item', 'billing');
    url.searchParams.set('qbo', 'connected');
    url.searchParams.set('agencyId', String(agencyId));
    return res.redirect(302, url.toString());
  } catch (error) {
    next(error);
  }
};

export const getQuickBooksStatus = async (req, res, next) => {
  try {
    const { agencyId } = req.params;
    const account = await AgencyBillingAccount.getByAgencyId(agencyId);
    res.json({
      agencyId: parseInt(agencyId, 10),
      isConnected: !!account?.is_qbo_connected,
      realmId: account?.qbo_realm_id || null,
      tokenExpiresAt: account?.qbo_token_expires_at || null
    });
  } catch (error) {
    next(error);
  }
};

export const disconnectQuickBooks = async (req, res, next) => {
  try {
    const { agencyId } = req.params;
    const ok = await AgencyBillingAccount.disconnectQbo(agencyId);
    if (!ok) return res.status(404).json({ error: { message: 'Billing account not found' } });
    res.json({ message: 'QuickBooks disconnected successfully' });
  } catch (error) {
    next(error);
  }
};

