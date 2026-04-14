/**
 * stripePayments.service.js
 *
 * Wraps the Stripe SDK for use with Stripe Connect.
 *
 * Architecture:
 *   - The platform's STRIPE_SECRET_KEY is used for ALL requests.
 *   - When acting on behalf of a connected agency account, pass
 *     `connectedAccountId` (e.g. "acct_1ABC...") and it will be threaded
 *     through as the `{ stripeAccount }` option.
 *   - Customer objects, PaymentMethods, and SetupIntents are created ON
 *     the connected account so payments go directly to the agency's bank.
 *   - Platform-level calls (creating Connect accounts, account links, etc.)
 *     do NOT pass stripeAccount.
 */

import Stripe from 'stripe';

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY || '';
  if (!key || key === 'sk_test_REPLACE_ME') {
    throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY in your .env file.');
  }
  return new Stripe(key, { apiVersion: '2024-06-20' });
}

export function isStripeConfigured() {
  const key = process.env.STRIPE_SECRET_KEY || '';
  return !!key && key !== 'sk_test_REPLACE_ME';
}

export function getStripePublishableKey() {
  const key = process.env.STRIPE_PUBLISHABLE_KEY || '';
  if (!key || key === 'pk_test_REPLACE_ME') return null;
  return key;
}

/** Build the Stripe request options object for a connected account (or empty for platform). */
function connectOpts(connectedAccountId) {
  return connectedAccountId ? { stripeAccount: connectedAccountId } : {};
}

class StripePaymentsService {
  // ─────────────────────────────────────────────────────────────────────────
  // Connect account management (platform-level, no stripeAccount option)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Create a Stripe Express connected account for an agency.
   * Called once during agency onboarding.
   */
  static async createConnectAccount({ email = null, businessName = null, metadata = {} } = {}) {
    const stripe = getStripe();
    const account = await stripe.accounts.create({
      type: 'express',
      email: email || undefined,
      business_profile: businessName ? { name: businessName } : undefined,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true }
      },
      metadata
    });
    return account;
  }

  /**
   * Generate a Stripe-hosted onboarding URL.
   * The agency admin is redirected here to complete KYC and bank setup.
   */
  static async createAccountLink({ connectedAccountId, returnUrl, refreshUrl }) {
    const stripe = getStripe();
    const link = await stripe.accountLinks.create({
      account: connectedAccountId,
      return_url: returnUrl,
      refresh_url: refreshUrl,
      type: 'account_onboarding'
    });
    return link;
  }

  /**
   * Retrieve a connected account's current status from Stripe.
   * `charges_enabled` being true means the account is fully onboarded.
   */
  static async retrieveConnectAccount(connectedAccountId) {
    const stripe = getStripe();
    return stripe.accounts.retrieve(connectedAccountId);
  }

  /**
   * Generate a single-use login link so an agency admin can access their
   * Stripe Express dashboard without a separate Stripe login.
   */
  static async createLoginLink(connectedAccountId) {
    const stripe = getStripe();
    return stripe.accounts.createLoginLink(connectedAccountId);
  }

  /**
   * Deauthorize / delete a connected account from the platform.
   * The agency's Stripe account itself is NOT deleted — only the connection.
   */
  static async disconnectConnectAccount(connectedAccountId) {
    const stripe = getStripe();
    return stripe.accounts.del(connectedAccountId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Customer management (scoped to connected account)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Find or create a Stripe customer for a guardian within a connected account.
   * Customers are created ON the connected account so their cards and charges
   * stay within that agency's Stripe account.
   */
  static async ensureCustomer({ guardianUserId, agencyId, email = null, name = null, connectedAccountId = null }) {
    const customerKey = `guardian_${guardianUserId}_agency_${agencyId}`;
    return this.ensureAppCustomer({
      customerKey,
      email,
      name,
      connectedAccountId,
      metadata: {
        guardian_user_id: String(guardianUserId),
        agency_id: String(agencyId)
      }
    });
  }

  static async ensureAppCustomer({ customerKey, email = null, name = null, connectedAccountId = null, metadata = {} } = {}) {
    const stripe = getStripe();
    const opts = connectOpts(connectedAccountId);
    const metaKey = String(customerKey || '').trim();
    if (!metaKey) throw new Error('customerKey is required');

    // Search by metadata to avoid duplicates (search is supported on connected accounts)
    try {
      const existing = await stripe.customers.search(
        { query: `metadata['app_key']:'${metaKey}'`, limit: 1 },
        opts
      );
      if (existing.data.length > 0) return existing.data[0];
    } catch {
      // customers.search may not be available on all connected account tiers — fall through to create
    }

    const customer = await stripe.customers.create(
      {
        email: email || undefined,
        name: name || undefined,
        metadata: {
          app_key: metaKey,
          ...metadata
        }
      },
      opts
    );

    return customer;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Payment method management (scoped to connected account)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Attach a PaymentMethod (tokenized by Stripe.js on the frontend) to a
   * customer that lives on the connected account.
   */
  static async attachPaymentMethod({ customerId, paymentMethodId, connectedAccountId = null }) {
    const stripe = getStripe();
    const opts = connectOpts(connectedAccountId);

    const pm = await stripe.paymentMethods.attach(
      paymentMethodId,
      { customer: customerId },
      opts
    );

    await stripe.customers.update(
      customerId,
      { invoice_settings: { default_payment_method: paymentMethodId } },
      opts
    );

    return pm;
  }

  /**
   * Retrieve a PaymentMethod (to get brand, last4, etc.).
   */
  static async getPaymentMethod(paymentMethodId, connectedAccountId = null) {
    const stripe = getStripe();
    return stripe.paymentMethods.retrieve(paymentMethodId, {}, connectOpts(connectedAccountId));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SetupIntent (scoped to connected account)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Create a SetupIntent on the connected account so the frontend can securely
   * collect card details via Stripe Elements without touching raw card numbers.
   *
   * The returned `client_secret` is scoped to the connected account; the
   * frontend must load Stripe with { stripeAccount: connectedAccountId }.
   */
  static async createSetupIntent({ customerId, connectedAccountId = null }) {
    const stripe = getStripe();
    const intent = await stripe.setupIntents.create(
      {
        customer: customerId,
        payment_method_types: ['card'],
        usage: 'off_session'
      },
      connectOpts(connectedAccountId)
    );
    return intent;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Charging (scoped to connected account)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Charge a saved payment method immediately (e.g. session copays).
   * Money flows directly to the connected agency's Stripe account.
   *
   * Pass `applicationFeeAmountCents` to deduct a platform fee — this only
   * applies when `connectedAccountId` is provided.
   */
  static async chargePaymentMethod({
    customerId,
    paymentMethodId,
    amountCents,
    currency = 'usd',
    description = null,
    metadata = {},
    connectedAccountId = null,
    applicationFeeAmountCents = 0
  }) {
    const stripe = getStripe();
    const opts = connectOpts(connectedAccountId);

    const intentParams = {
      amount: amountCents,
      currency,
      customer: customerId,
      payment_method: paymentMethodId,
      description: description || undefined,
      metadata,
      confirm: true,
      off_session: true
    };

    if (connectedAccountId && applicationFeeAmountCents > 0) {
      intentParams.application_fee_amount = applicationFeeAmountCents;
    }

    return stripe.paymentIntents.create(intentParams, opts);
  }

  static async retrievePaymentIntent(paymentIntentId, connectedAccountId = null) {
    const stripe = getStripe();
    return stripe.paymentIntents.retrieve(paymentIntentId, {}, connectOpts(connectedAccountId));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Webhook
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Construct and verify a webhook event from Stripe.
   * Always call this before processing any webhook payload.
   *
   * Use STRIPE_CONNECT_WEBHOOK_SECRET for Connect events (they include
   * `event.account`), or STRIPE_WEBHOOK_SECRET for direct events.
   */
  static constructWebhookEvent(rawBody, signature, { connect = false } = {}) {
    const stripe = getStripe();
    const secret = connect
      ? process.env.STRIPE_CONNECT_WEBHOOK_SECRET || ''
      : process.env.STRIPE_WEBHOOK_SECRET || '';

    if (!secret || secret === 'whsec_REPLACE_ME') {
      throw new Error(
        connect
          ? 'STRIPE_CONNECT_WEBHOOK_SECRET is not configured.'
          : 'STRIPE_WEBHOOK_SECRET is not configured.'
      );
    }
    return stripe.webhooks.constructEvent(rawBody, signature, secret);
  }
}

export default StripePaymentsService;
