/**
 * stripeConnect.controller.js
 *
 * Handles per-agency Stripe Connect onboarding and management.
 * Each agency gets their own Stripe Express account so that parent/guardian
 * payments go directly to that agency's bank — not the platform's account.
 *
 * Routes (all require authenticate + requireAgencyAdmin):
 *   POST   /api/billing/:agencyId/stripe/connect        → startConnect
 *   GET    /api/billing/:agencyId/stripe/status         → getStripeStatus
 *   GET    /api/billing/:agencyId/stripe/dashboard-link → getStripeDashboardLink
 *   DELETE /api/billing/:agencyId/stripe/disconnect     → disconnectStripe
 */

import pool from '../config/database.js';
import StripePaymentsService, { isStripeConfigured } from '../services/stripePayments.service.js';
import Agency from '../models/Agency.model.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getBillingAccount(agencyId) {
  const [rows] = await pool.query(
    `SELECT agency_id, stripe_connect_account_id, stripe_connect_status
     FROM agency_billing_accounts WHERE agency_id = ? LIMIT 1`,
    [agencyId]
  );
  return rows[0] || null;
}

async function upsertBillingAccount(agencyId) {
  await pool.query(
    `INSERT INTO agency_billing_accounts (agency_id) VALUES (?)
     ON DUPLICATE KEY UPDATE agency_id = agency_id`,
    [agencyId]
  );
}

async function saveConnectAccount(agencyId, { accountId, status }) {
  await pool.query(
    `UPDATE agency_billing_accounts
     SET stripe_connect_account_id = ?,
         stripe_connect_status     = ?,
         updated_at                = CURRENT_TIMESTAMP
     WHERE agency_id = ?`,
    [accountId, status, agencyId]
  );
}

// ── Controllers ───────────────────────────────────────────────────────────────

/**
 * POST /api/billing/:agencyId/stripe/connect
 *
 * Creates a Stripe Express account for the agency (if one doesn't exist yet)
 * then returns a hosted onboarding URL. The admin is redirected there to
 * complete KYC and bank account setup. After completion, Stripe redirects
 * back to STRIPE_CONNECT_RETURN_URL.
 */
export const startConnect = async (req, res, next) => {
  try {
    if (!isStripeConfigured()) {
      return res.status(503).json({ error: { message: 'Stripe is not configured on this platform.' } });
    }

    const agencyId = parseInt(req.params.agencyId, 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agencyId' } });

    const agency = await Agency.findById(agencyId);
    if (!agency) return res.status(404).json({ error: { message: 'Agency not found' } });

    // Ensure a billing account row exists for this agency
    await upsertBillingAccount(agencyId);
    const billingAccount = await getBillingAccount(agencyId);

    let stripeAccountId = billingAccount?.stripe_connect_account_id || null;

    // Create a new Express account if not already created
    if (!stripeAccountId) {
      const account = await StripePaymentsService.createConnectAccount({
        businessName: agency.name || undefined,
        metadata: {
          agency_id: String(agencyId),
          agency_name: agency.name || ''
        }
      });
      stripeAccountId = account.id;
      await saveConnectAccount(agencyId, { accountId: stripeAccountId, status: 'pending' });
    }

    // Generate a fresh account link (links expire after a few minutes)
    const returnUrl = process.env.STRIPE_CONNECT_RETURN_URL || `${process.env.FRONTEND_URL || ''}/billing?stripe=connected&agencyId=${agencyId}`;
    const refreshUrl = process.env.STRIPE_CONNECT_REFRESH_URL || `${process.env.FRONTEND_URL || ''}/billing?stripe=refresh&agencyId=${agencyId}`;

    const accountLink = await StripePaymentsService.createAccountLink({
      connectedAccountId: stripeAccountId,
      returnUrl,
      refreshUrl
    });

    res.json({
      onboardingUrl: accountLink.url,
      stripeAccountId,
      status: 'pending'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/billing/:agencyId/stripe/status
 *
 * Checks the current Stripe Connect status for an agency.
 * Syncs the DB status with Stripe's actual account state.
 * Called after the agency admin returns from Stripe onboarding.
 */
export const getStripeStatus = async (req, res, next) => {
  try {
    if (!isStripeConfigured()) {
      return res.json({ status: 'not_connected', chargesEnabled: false, stripeAccountId: null });
    }

    const agencyId = parseInt(req.params.agencyId, 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agencyId' } });

    const billingAccount = await getBillingAccount(agencyId);
    const stripeAccountId = billingAccount?.stripe_connect_account_id || null;

    if (!stripeAccountId) {
      return res.json({ status: 'not_connected', chargesEnabled: false, stripeAccountId: null });
    }

    // Retrieve live status from Stripe
    let stripeAccount;
    try {
      stripeAccount = await StripePaymentsService.retrieveConnectAccount(stripeAccountId);
    } catch (stripeErr) {
      // Account may have been deleted on Stripe's end
      if (stripeErr?.code === 'account_invalid' || stripeErr?.statusCode === 404) {
        await saveConnectAccount(agencyId, { accountId: null, status: 'not_connected' });
        return res.json({ status: 'not_connected', chargesEnabled: false, stripeAccountId: null });
      }
      throw stripeErr;
    }

    const chargesEnabled = !!stripeAccount.charges_enabled;
    const newStatus = chargesEnabled ? 'active' : 'pending';

    // Sync status to DB if it changed
    if (newStatus !== billingAccount?.stripe_connect_status) {
      await saveConnectAccount(agencyId, { accountId: stripeAccountId, status: newStatus });
    }

    res.json({
      status: newStatus,
      chargesEnabled,
      stripeAccountId,
      payoutsEnabled: !!stripeAccount.payouts_enabled,
      detailsSubmitted: !!stripeAccount.details_submitted,
      displayName: stripeAccount.business_profile?.name || stripeAccount.display_name || null,
      country: stripeAccount.country || null
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/billing/:agencyId/stripe/dashboard-link
 *
 * Generates a single-use login link for the agency's Stripe Express dashboard.
 * The link expires after a few minutes — generate on demand, never cache.
 */
export const getStripeDashboardLink = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agencyId' } });

    const billingAccount = await getBillingAccount(agencyId);
    const stripeAccountId = billingAccount?.stripe_connect_account_id || null;

    if (!stripeAccountId || billingAccount?.stripe_connect_status !== 'active') {
      return res.status(400).json({ error: { message: 'Stripe account is not connected or not yet active.' } });
    }

    const loginLink = await StripePaymentsService.createLoginLink(stripeAccountId);
    res.json({ url: loginLink.url });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/billing/:agencyId/stripe/disconnect
 *
 * Removes the Stripe Connect association for this agency.
 * This does NOT delete the agency's Stripe account — only the platform link.
 * The agency can re-connect at any time.
 */
export const disconnectStripe = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agencyId' } });

    const billingAccount = await getBillingAccount(agencyId);
    const stripeAccountId = billingAccount?.stripe_connect_account_id || null;

    if (stripeAccountId) {
      // Best-effort: attempt to remove the account from Stripe's side.
      // If it fails (already deleted, etc.) we still clear our DB record.
      try {
        await StripePaymentsService.disconnectConnectAccount(stripeAccountId);
      } catch (err) {
        console.warn(`[stripeConnect] Could not delete Stripe account ${stripeAccountId}:`, err.message);
      }
    }

    await pool.query(
      `UPDATE agency_billing_accounts
       SET stripe_connect_account_id = NULL,
           stripe_connect_status     = 'not_connected',
           updated_at                = CURRENT_TIMESTAMP
       WHERE agency_id = ?`,
      [agencyId]
    );

    res.json({ success: true, status: 'not_connected' });
  } catch (error) {
    next(error);
  }
};
