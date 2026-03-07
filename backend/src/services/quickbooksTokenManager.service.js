import BillingProviderConnection from '../models/BillingProviderConnection.model.js';
import { decryptBillingSecret, encryptBillingSecret } from './billingEncryption.service.js';
import { refreshAccessToken } from './quickbooksOAuth.service.js';

function parseEncField(enc) {
  if (!enc) return null;
  if (typeof enc === 'object') return enc;
  try {
    return JSON.parse(enc);
  } catch {
    return null;
  }
}

class QuickBooksTokenManager {
  static async getValidAccessTokenForConnection(connectionId, { refreshIfExpiringWithinMs = 5 * 60 * 1000 } = {}) {
    const connection = await BillingProviderConnection.findById(connectionId);
    if (!connection?.is_connected) {
      throw new Error('QuickBooks is not connected for this billing connection');
    }

    const expiresAt = connection.qbo_token_expires_at ? new Date(connection.qbo_token_expires_at) : null;
    const now = new Date();

    const accessEnc = parseEncField(connection.qbo_access_token_enc);
    const refreshEnc = parseEncField(connection.qbo_refresh_token_enc);
    const refreshToken = refreshEnc ? decryptBillingSecret(refreshEnc) : null;

    // If we have an unexpired token with enough lifetime left, return it.
    if (expiresAt && accessEnc) {
      const msLeft = expiresAt.getTime() - now.getTime();
      if (msLeft > refreshIfExpiringWithinMs) {
        return {
          accessToken: decryptBillingSecret(accessEnc),
          realmId: connection.qbo_realm_id
        };
      }
    }

    if (!refreshToken) {
      throw new Error('Missing refresh token for QuickBooks connection');
    }

    // Refresh token
    const tokenData = await refreshAccessToken({ refreshToken });
    const newExpiresInSec = Number(tokenData.expires_in || 0);
    const newExpiresAt = newExpiresInSec ? new Date(Date.now() + newExpiresInSec * 1000) : null;

    const newAccessEnc = encryptBillingSecret(tokenData.access_token);
    const newRefreshEnc = tokenData.refresh_token ? encryptBillingSecret(tokenData.refresh_token) : refreshEnc;

    await BillingProviderConnection.upsertQuickBooksConnection({
      ownerType: connection.owner_type,
      ownerId: connection.owner_id,
      realmId: connection.qbo_realm_id,
      accessTokenEnc: newAccessEnc,
      refreshTokenEnc: newRefreshEnc,
      tokenExpiresAt: newExpiresAt,
      scopeCsv: connection.qbo_scope_csv || null,
      qboPaymentsEnabled: !!connection.qbo_payments_enabled,
      qboPaymentsMerchantId: connection.qbo_payments_merchant_id || null
    });

    return {
      accessToken: tokenData.access_token,
      realmId: connection.qbo_realm_id
    };
  }

  static async getValidAccessTokenByOwner({ ownerType = 'agency', ownerId = 0, refreshIfExpiringWithinMs = 5 * 60 * 1000 } = {}) {
    const connection = await BillingProviderConnection.getByOwner({ ownerType, ownerId, provider: 'QUICKBOOKS' });
    if (!connection?.id) {
      throw new Error(`QuickBooks is not connected for ${ownerType}`);
    }
    return this.getValidAccessTokenForConnection(connection.id, { refreshIfExpiringWithinMs });
  }

  static async getValidAccessToken(agencyId, options = {}) {
    return this.getValidAccessTokenByOwner({
      ownerType: 'agency',
      ownerId: Number(agencyId || 0),
      ...options
    });
  }
}

export default QuickBooksTokenManager;

