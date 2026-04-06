/**
 * stripeWebhook.routes.js
 *
 * Stripe sends signed events to these endpoints.
 *
 * Two webhook endpoints are needed in Stripe Dashboard:
 *   1. /api/stripe/webhook         → platform / direct events (STRIPE_WEBHOOK_SECRET)
 *   2. /api/stripe/connect-webhook → Connect events from connected agency accounts
 *                                    (STRIPE_CONNECT_WEBHOOK_SECRET)
 *
 * IMPORTANT: Both routes must receive the RAW body. They are registered in
 * server.js BEFORE express.json() using express.raw().
 */

import express from 'express';
import StripePaymentsService from '../services/stripePayments.service.js';
import pool from '../config/database.js';

const router = express.Router();

// ── Shared event handler ─────────────────────────────────────────────────────

async function handleStripeEvent(event) {
  // `event.account` is present on Connect events — tells us which agency it belongs to
  const connectedAccountId = event.account || null;

  switch (event.type) {
    case 'setup_intent.succeeded': {
      const si = event.data.object;
      const pmId = si.payment_method;
      if (pmId && connectedAccountId) {
        // Mark the card as active in our DB for the matching agency
        await pool.query(
          `UPDATE guardian_payment_cards
           SET is_active = 1, updated_at = CURRENT_TIMESTAMP
           WHERE stripe_payment_method_id = ?
             AND agency_id = (
               SELECT agency_id FROM agency_billing_accounts
               WHERE stripe_connect_account_id = ? LIMIT 1
             )`,
          [pmId, connectedAccountId]
        );
      } else if (pmId) {
        await pool.query(
          `UPDATE guardian_payment_cards
           SET is_active = 1, updated_at = CURRENT_TIMESTAMP
           WHERE stripe_payment_method_id = ?`,
          [pmId]
        );
      }
      break;
    }

    case 'account.updated': {
      // Fired when the connected agency's account details change (e.g. completes onboarding)
      if (connectedAccountId) {
        const obj = event.data.object;
        const newStatus = obj.charges_enabled ? 'active' : 'pending';
        await pool.query(
          `UPDATE agency_billing_accounts
           SET stripe_connect_status = ?, updated_at = CURRENT_TIMESTAMP
           WHERE stripe_connect_account_id = ?`,
          [newStatus, connectedAccountId]
        );
        console.info(`[stripe webhook] account.updated — ${connectedAccountId} → ${newStatus}`);
      }
      break;
    }

    case 'payment_intent.succeeded': {
      const pi = event.data.object;
      console.info(
        `[stripe webhook] PaymentIntent ${pi.id} succeeded — amount: ${pi.amount_received}` +
        (connectedAccountId ? ` (acct: ${connectedAccountId})` : '')
      );
      break;
    }

    case 'payment_intent.payment_failed': {
      const pi = event.data.object;
      const failureMsg = pi.last_payment_error?.message || 'Unknown failure';
      console.warn(
        `[stripe webhook] PaymentIntent ${pi.id} failed: ${failureMsg}` +
        (connectedAccountId ? ` (acct: ${connectedAccountId})` : '')
      );
      break;
    }

    default:
      break;
  }
}

// ── Platform / direct webhook ────────────────────────────────────────────────
// Register as: POST https://yourdomain.com/api/stripe/webhook in Stripe Dashboard

router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;
    try {
      event = StripePaymentsService.constructWebhookEvent(req.body, sig, { connect: false });
    } catch (err) {
      console.error('[stripe webhook] Signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      await handleStripeEvent(event);
    } catch (handlerErr) {
      console.error('[stripe webhook] Handler error:', handlerErr.message);
    }

    res.json({ received: true });
  }
);

// ── Connect webhook ──────────────────────────────────────────────────────────
// Register as: POST https://yourdomain.com/api/stripe/connect-webhook in Stripe Dashboard
// Under: Stripe Dashboard → Connect → Webhooks (separate from direct webhooks)

router.post(
  '/connect-webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;
    try {
      event = StripePaymentsService.constructWebhookEvent(req.body, sig, { connect: true });
    } catch (err) {
      console.error('[stripe connect-webhook] Signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      await handleStripeEvent(event);
    } catch (handlerErr) {
      console.error('[stripe connect-webhook] Handler error:', handlerErr.message);
    }

    res.json({ received: true });
  }
);

export default router;
