/**
 * Resolve who appears as billing vs rendering on claims.
 * Provider default (user_agencies.claim_billing_mode):
 *   - self — bill under the rendering provider's NPI
 *   - billing_supervisor — bill under a clinical/billing supervisor's NPI
 *     (rendering NPI still lists the session provider when available)
 * Optional preferred supervisor: user_agencies.claim_billing_supervisor_user_id
 * when the supervisee has multiple clinical supervisors.
 */

import pool from '../config/database.js';
import SupervisorAssignment from '../models/SupervisorAssignment.model.js';
import User from '../models/User.model.js';

export async function getProviderClaimBillingMode({ agencyId, providerUserId }) {
  const aid = Number(agencyId || 0);
  const uid = Number(providerUserId || 0);
  if (!aid || !uid) {
    return { mode: 'self', billingSupervisorUserId: null, supervisors: [] };
  }
  let mode = 'self';
  let preferredSupervisorUserId = null;
  try {
    const [rows] = await pool.execute(
      `SELECT claim_billing_mode, claim_billing_supervisor_user_id
       FROM user_agencies
       WHERE agency_id = ? AND user_id = ?
       LIMIT 1`,
      [aid, uid]
    );
    mode = String(rows?.[0]?.claim_billing_mode || 'self').toLowerCase() === 'billing_supervisor'
      ? 'billing_supervisor'
      : 'self';
    preferredSupervisorUserId = Number(rows?.[0]?.claim_billing_supervisor_user_id || 0) || null;
  } catch (e) {
    if (e?.code === 'ER_BAD_FIELD_ERROR') {
      try {
        const [rows] = await pool.execute(
          `SELECT claim_billing_mode
           FROM user_agencies
           WHERE agency_id = ? AND user_id = ?
           LIMIT 1`,
          [aid, uid]
        );
        mode = String(rows?.[0]?.claim_billing_mode || 'self').toLowerCase() === 'billing_supervisor'
          ? 'billing_supervisor'
          : 'self';
      } catch (e2) {
        if (e2?.code !== 'ER_BAD_FIELD_ERROR') throw e2;
      }
    } else {
      throw e;
    }
  }

  let supervisors = [];
  try {
    supervisors = await SupervisorAssignment.listClaimBillingSupervisorOptions(uid, aid);
  } catch {
    supervisors = [];
  }

  const billingSupervisorUserId = mode === 'billing_supervisor'
    ? await SupervisorAssignment.resolveClaimBillingSupervisorId(uid, aid, preferredSupervisorUserId)
    : null;

  return {
    mode,
    billingSupervisorUserId,
    preferredSupervisorUserId,
    supervisors
  };
}

export async function setProviderClaimBillingMode({
  agencyId,
  providerUserId,
  mode,
  billingSupervisorUserId = undefined
} = {}) {
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

  let preferredId = billingSupervisorUserId === undefined
    ? undefined
    : (Number(billingSupervisorUserId || 0) || null);

  if (next === 'billing_supervisor' && preferredId) {
    const options = await SupervisorAssignment.listClaimBillingSupervisorOptions(uid, aid);
    if (!options.some((o) => o.id === preferredId)) {
      const err = new Error('Selected billing supervisor is not assigned to this provider');
      err.status = 400;
      throw err;
    }
  }

  try {
    if (preferredId === undefined) {
      await pool.execute(
        `UPDATE user_agencies
         SET claim_billing_mode = ?
         WHERE agency_id = ? AND user_id = ?`,
        [next, aid, uid]
      );
    } else {
      await pool.execute(
        `UPDATE user_agencies
         SET claim_billing_mode = ?,
             claim_billing_supervisor_user_id = ?
         WHERE agency_id = ? AND user_id = ?`,
        [next, preferredId, aid, uid]
      );
    }
  } catch (e) {
    if (e?.code === 'ER_BAD_FIELD_ERROR') {
      if (preferredId !== undefined) {
        const err = new Error('claim_billing_supervisor_user_id column missing — run migration 1401');
        err.status = 503;
        throw err;
      }
      try {
        await pool.execute(
          `UPDATE user_agencies
           SET claim_billing_mode = ?
           WHERE agency_id = ? AND user_id = ?`,
          [next, aid, uid]
        );
      } catch (e2) {
        if (e2?.code === 'ER_BAD_FIELD_ERROR') {
          const err = new Error('claim_billing_mode column missing — run migration 1398');
          err.status = 503;
          throw err;
        }
        throw e2;
      }
    } else {
      throw e;
    }
  }
  return getProviderClaimBillingMode({ agencyId: aid, providerUserId: uid });
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
  overrideMode = null,
  overrideBillingSupervisorUserId = null
} = {}) {
  const aid = Number(agencyId || 0);
  const renderingUserId = Number(renderingProviderUserId || 0) || null;

  let mode = 'self';
  let preferredSupervisorUserId = Number(overrideBillingSupervisorUserId || 0) || null;
  if (overrideMode) {
    mode = String(overrideMode).toLowerCase() === 'billing_supervisor' ? 'billing_supervisor' : 'self';
  } else if (renderingUserId) {
    const prefs = await getProviderClaimBillingMode({ agencyId: aid, providerUserId: renderingUserId });
    mode = prefs.mode;
    if (!preferredSupervisorUserId) preferredSupervisorUserId = prefs.preferredSupervisorUserId || null;
  }

  let billingSupervisorUserId = null;
  try {
    if (renderingUserId && aid && mode === 'billing_supervisor') {
      billingSupervisorUserId = await SupervisorAssignment.resolveClaimBillingSupervisorId(
        renderingUserId,
        aid,
        preferredSupervisorUserId
      );
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
