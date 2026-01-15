import AgencyBillingAccount from '../models/AgencyBillingAccount.model.js';
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
  /**
   * Returns a valid access token for the agency's connected QBO company.
   * Refreshes if expired or near expiry.
   */
  static async getValidAccessToken(agencyId, { refreshIfExpiringWithinMs = 5 * 60 * 1000 } = {}) {
    const account = await AgencyBillingAccount.getByAgencyId(agencyId);
    if (!account?.is_qbo_connected) {
      throw new Error('QuickBooks is not connected for this agency');
    }

    const expiresAt = account.qbo_token_expires_at ? new Date(account.qbo_token_expires_at) : null;
    const now = new Date();

    const accessEnc = parseEncField(account.qbo_access_token_enc);
    const refreshEnc = parseEncField(account.qbo_refresh_token_enc);
    const refreshToken = refreshEnc ? decryptBillingSecret(refreshEnc) : null;

    // If we have an unexpired token with enough lifetime left, return it.
    if (expiresAt && accessEnc) {
      const msLeft = expiresAt.getTime() - now.getTime();
      if (msLeft > refreshIfExpiringWithinMs) {
        return {
          accessToken: decryptBillingSecret(accessEnc),
          realmId: account.qbo_realm_id
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

    await AgencyBillingAccount.upsertQboConnection({
      agencyId,
      realmId: account.qbo_realm_id,
      accessTokenEnc: newAccessEnc,
      refreshTokenEnc: newRefreshEnc,
      tokenExpiresAt: newExpiresAt
    });

    return {
      accessToken: tokenData.access_token,
      realmId: account.qbo_realm_id
    };
  }
}

export default QuickBooksTokenManager;

