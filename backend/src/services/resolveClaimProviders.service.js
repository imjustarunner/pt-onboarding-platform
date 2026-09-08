/**
 * Resolve who appears as billing vs rendering on claims.
 * Provider default (user_agencies.claim_billing_mode):
 *   - self — bill under the rendering provider's NPI
 *   - billing_supervisor — bill under the agency billing supervisor's NPI
 *     (rendering NPI still lists the session provider when available)
 */

import pool from '../config/database.js';
import SupervisorAssignment from '../models/SupervisorAssignment.model.js';
import User from '../models/User.model.js';

export async function getProviderClaimBillingMode({ agencyId, providerUserId }) {
  const aid = Number(agencyId || 0);
  const uid = Number(providerUserId || 0);
  if (!aid || !uid) return 'self';
  try {
    const [rows] = await pool.execute(
      `SELECT claim_billing_mode
       FROM user_agencies
       WHERE agency_id = ? AND user_id = ?
       LIMIT 1`,
      [aid, uid]
    );
    const mode = String(rows?.[0]?.claim_billing_mode || 'self').toLowerCase();
    return mode === 'billing_supervisor' ? 'billing_supervisor' : 'self';
  } catch (e) {
    if (e?.code === 'ER_BAD_FIELD_ERROR') return 'self';
    throw e;
  }
}

export async function setProviderClaimBillingMode({ agencyId, providerUserId, mode }) {
  const aid = Number(agencyId || 0);
  const uid = Number(providerUserId || 0);
  const next = String(mode || 'self').toLowerCase() === 'billing_supervisor'
    ? 'billing_supervisor'
    : 'self';
  if (!aid || !uid) {
    const err = new Error('agencyId and providerUserId are required');
    err.status = 400;
    throw err;
  }
  try {
    await pool.execute(
      `UPDATE user_agencies
       SET claim_billing_mode = ?
       WHERE agency_id = ? AND user_id = ?`,
      [next, aid, uid]
    );
  } catch (e) {
    if (e?.code === 'ER_BAD_FIELD_ERROR') {
      const err = new Error('claim_billing_mode column missing — run migration 1398');
      err.status = 503;
      throw err;
    }
    throw e;
  }
  return next;
}

function npiFromUser(user) {
  if (!user) return null;
  return String(user.npi || user.npi_number || user.billing_npi || '').trim() || null;
}

/**
 * @returns {{
 *   mode: 'self'|'billing_supervisor',
 *   renderingUserId: number|null,
 *   billingUserId: number|null,
 *   renderingNpi: string|null,
 *   billingNpi: string|null,
 *   billingSupervisorUserId: number|null
 * }}
 */
export async function resolveClaimProviders({
  agencyId,
  renderingProviderUserId = null,
  overrideMode = null
} = {}) {
  const aid = Number(agencyId || 0);
  const renderingUserId = Number(renderingProviderUserId || 0) || null;
  const mode = overrideMode
    || (renderingUserId
      ? await getProviderClaimBillingMode({ agencyId: aid, providerUserId: renderingUserId })
      : 'self');

  let billingSupervisorUserId = null;
  try {
    if (renderingUserId && aid) {
      billingSupervisorUserId = Number(
        (await SupervisorAssignment.getBillingSupervisorId(renderingUserId, aid)) || 0
      ) || null;
    }
  } catch {
    billingSupervisorUserId = null;
  }

  const billingUserId = mode === 'billing_supervisor' && billingSupervisorUserId
    ? billingSupervisorUserId
    : renderingUserId;

  let renderingNpi = null;
  let billingNpi = null;
  if (renderingUserId) {
    try {
      renderingNpi = npiFromUser(await User.findById(renderingUserId));
    } catch {
      renderingNpi = null;
    }
  }
  if (billingUserId && billingUserId === renderingUserId) {
    billingNpi = renderingNpi;
  } else if (billingUserId) {
    try {
      billingNpi = npiFromUser(await User.findById(billingUserId));
    } catch {
      billingNpi = null;
    }
  }

  return {
    mode,
    renderingUserId,
    billingUserId,
    renderingNpi,
    billingNpi,
    billingSupervisorUserId
  };
}

export default {
  getProviderClaimBillingMode,
  setProviderClaimBillingMode,
  resolveClaimProviders
};
