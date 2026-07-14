import pool from '../config/database.js';
import PractitionerSessionPackage from '../models/PractitionerSessionPackage.model.js';
import {
  createClientPacket,
  findPacketByToken,
  activatePackageSelection,
  getClientSessionBalance,
  debitSessionOnComplete,
  applyMissedSessionPolicy,
  resolveChargeAmountCents,
  buildPacketUrl,
  resolveAgencySlug,
  listIntakeLinksForPacket,
  markPacketIntakeLinkComplete,
  createPacketPortalAccount,
  getClientPackageOverview as buildClientPackageOverview,
  bookCoachingSession,
  enrichScheduleEventsWithPackageContext,
  getPractitionerDashboardOverview
} from '../services/practitionerPackage.service.js';
import Agency from '../models/Agency.model.js';
import StripePaymentsService, {
  isStripeConfigured,
  getStripePublishableKey
} from '../services/stripePayments.service.js';
import jwt from 'jsonwebtoken';
import config from '../config/config.js';
import User from '../models/User.model.js';
import crypto from 'crypto';
import ActivityLogService from '../services/activityLog.service.js';
import {
  requirePractitionerOwner,
  requirePractitionerCapability
} from '../utils/practitionerAssistantAccess.js';

const FRONTEND_URL = (process.env.FRONTEND_URL || '').replace(/\/$/, '');

async function getAgencyStripeConnectAccountId(agencyId) {
  const id = Number(agencyId || 0);
  if (!id) return null;
  const [rows] = await pool.execute(
    `SELECT stripe_connect_account_id, stripe_connect_status
     FROM agency_billing_accounts
     WHERE agency_id = ?
     LIMIT 1`,
    [id]
  );
  const row = rows?.[0];
  if (row?.stripe_connect_status === 'active' && row?.stripe_connect_account_id) {
    return row.stripe_connect_account_id;
  }
  return null;
}

async function assertOfferedPackage(packet, packageId) {
  const offered = (packet.offered_package_ids || []).map(Number);
  if (!offered.includes(Number(packageId))) {
    const err = new Error('Package was not offered on this packet');
    err.status = 400;
    throw err;
  }
  const pkg = await PractitionerSessionPackage.findById(packageId);
  if (!pkg || !pkg.is_active) {
    const err = new Error('Package not found');
    err.status = 404;
    throw err;
  }
  return pkg;
}

export const listPackages = async (req, res, next) => {
  try {
    const agencyId = Number(req.query.agencyId || req.user?.agencyId || 0);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId required' } });
    const rows = await PractitionerSessionPackage.listByAgency(agencyId, {
      includeInactive: String(req.query.includeInactive || '') === '1'
    });
    res.json({ ok: true, packages: rows });
  } catch (e) {
    next(e);
  }
};

export const createPackage = async (req, res, next) => {
  try {
    const agencyId = Number(req.body?.agencyId || req.user?.agencyId || 0);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId required' } });
    requirePractitionerOwner(req);
    if (!String(req.body?.name || '').trim()) {
      return res.status(400).json({ error: { message: 'name required' } });
    }
    const pkg = await PractitionerSessionPackage.create({
      agencyId,
      name: req.body.name,
      description: req.body.description,
      sessionCount: req.body.sessionCount,
      priceCents: req.body.priceCents,
      paymentModeDefault: req.body.paymentModeDefault,
      payInFullPriceCents: req.body.payInFullPriceCents,
      payInFullDiscountCents: req.body.payInFullDiscountCents,
      installmentPlan: req.body.installmentPlan,
      perSessionPriceCents: req.body.perSessionPriceCents,
      allowedPaymentModes: req.body.allowedPaymentModes,
      missedSessionPolicy: req.body.missedSessionPolicy,
      isActive: req.body.isActive,
      sortOrder: req.body.sortOrder,
      createdByUserId: req.user?.id
    });
    res.status(201).json({ ok: true, package: pkg });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const updatePackage = async (req, res, next) => {
  try {
    requirePractitionerOwner(req);
    const pkg = await PractitionerSessionPackage.update(req.params.id, {
      name: req.body?.name,
      description: req.body?.description,
      sessionCount: req.body?.sessionCount,
      priceCents: req.body?.priceCents,
      paymentModeDefault: req.body?.paymentModeDefault,
      payInFullPriceCents: req.body?.payInFullPriceCents,
      payInFullDiscountCents: req.body?.payInFullDiscountCents,
      installmentPlan: req.body?.installmentPlan,
      perSessionPriceCents: req.body?.perSessionPriceCents,
      allowedPaymentModes: req.body?.allowedPaymentModes,
      missedSessionPolicy: req.body?.missedSessionPolicy,
      isActive: req.body?.isActive,
      sortOrder: req.body?.sortOrder
    });
    if (!pkg) return res.status(404).json({ error: { message: 'Package not found' } });
    res.json({ ok: true, package: pkg });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const sendClientPacket = async (req, res, next) => {
  try {
    const agencyId = Number(req.body?.agencyId || req.user?.agencyId || 0);
    const providerId = Number(req.body?.providerId || req.user?.id || 0);
    const clientId = Number(req.body?.clientId || 0);
    if (!agencyId || !providerId || !clientId) {
      return res.status(400).json({ error: { message: 'agencyId, providerId, clientId required' } });
    }
    await requirePractitionerCapability(req, agencyId, 'packets');
    const clientEmail = String(req.body?.clientEmail || '').trim().toLowerCase();
    if (req.body?.send !== false && !clientEmail) {
      return res.status(400).json({ error: { message: 'clientEmail is required to send the packet' } });
    }
    const packet = await createClientPacket({
      agencyId,
      clientId,
      providerId,
      offeredPackageIds: req.body?.offeredPackageIds || [],
      intakeLinkIds: req.body?.intakeLinkIds || [],
      notes: req.body?.notes || null,
      createdByUserId: req.user?.id,
      send: req.body?.send !== false,
      clientEmail: clientEmail || null,
      clientName: req.body?.clientName || null
    });
    const slug = (await resolveAgencySlug(agencyId)) || (await Agency.findById(agencyId))?.slug || '';
    const joinUrl = buildPacketUrl(slug, packet.access_token)
      || (slug
        ? `${FRONTEND_URL}/${encodeURIComponent(slug)}/packet/${encodeURIComponent(packet.access_token)}`
        : null);
    res.status(201).json({ ok: true, packet, joinUrl });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const getPublicPacket = async (req, res, next) => {
  try {
    const packet = await findPacketByToken(req.params.token);
    if (!packet) return res.status(404).json({ error: { message: 'Packet not found' } });
    if (packet.token_expires_at && new Date(packet.token_expires_at) < new Date()) {
      return res.status(410).json({ error: { message: 'Packet link expired' } });
    }
    const all = await PractitionerSessionPackage.listByAgency(packet.agency_id, {
      includeInactive: true
    });
    const offeredIds = new Set((packet.offered_package_ids || []).map(Number));
    const packages = all.filter((p) => offeredIds.has(p.id) && p.is_active);
    const agency = await Agency.findById(packet.agency_id);
    const connectedAccountId = await getAgencyStripeConnectAccountId(packet.agency_id);
    const publishableKey = getStripePublishableKey();
    const intakeLinks = await listIntakeLinksForPacket(packet);
    const completedIntakeLinkIds = (packet.completed_intake_link_ids || []).map(Number);
    res.json({
      ok: true,
      packet: {
        id: packet.id,
        status: packet.status,
        clientId: packet.client_id,
        selectedPackageId: packet.selected_package_id,
        selectedPaymentMode: packet.selected_payment_mode,
        hasAccount: !!packet.account_user_id,
        completedIntakeLinkIds
      },
      packages,
      intakeLinks,
      agency: { id: packet.agency_id, name: agency?.name || '', slug: agency?.slug || null },
      stripe: {
        enabled: !!(isStripeConfigured() && publishableKey && connectedAccountId),
        publishableKey: publishableKey || null,
        connectedAccountId: connectedAccountId || null
      }
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Create a Stripe PaymentIntent for the selected package + payment mode.
 * Does not activate the package — call confirm after client pays.
 */
export const postPublicPacketCheckout = async (req, res, next) => {
  try {
    const packet = await findPacketByToken(req.params.token);
    if (!packet) return res.status(404).json({ error: { message: 'Packet not found' } });
    if (String(packet.status || '').toUpperCase() === 'COMPLETED' && packet.selected_package_id) {
      return res.status(409).json({ error: { message: 'Package already selected for this packet' } });
    }
    const packageId = Number(req.body?.packageId || 0);
    const paymentMode = String(req.body?.paymentMode || 'PAY_IN_FULL').toUpperCase();
    const pkg = await assertOfferedPackage(packet, packageId);
    const allowed = (pkg.allowed_payment_modes || []).map((m) => String(m).toUpperCase());
    if (allowed.length && !allowed.includes(paymentMode)) {
      return res.status(400).json({ error: { message: 'Payment mode not allowed for this package' } });
    }

    const amountCents = resolveChargeAmountCents(pkg, paymentMode);
    const connectedAccountId = await getAgencyStripeConnectAccountId(packet.agency_id);
    const publishableKey = getStripePublishableKey();
    const stripeReady = !!(isStripeConfigured() && publishableKey && connectedAccountId);

    if (!stripeReady) {
      return res.json({
        ok: true,
        stripeEnabled: false,
        amountCents,
        currency: 'usd',
        packageId,
        paymentMode,
        clientSecret: null,
        publishableKey: null,
        connectedAccountId: null,
        message: 'Stripe is not connected for this practice. You can still reserve the package; your coach will follow up on payment.'
      });
    }

    if (amountCents < 1) {
      return res.json({
        ok: true,
        stripeEnabled: true,
        amountCents: 0,
        currency: 'usd',
        packageId,
        paymentMode,
        clientSecret: null,
        publishableKey,
        connectedAccountId,
        zeroAmount: true
      });
    }

    const intent = await StripePaymentsService.createPaymentIntent({
      amountCents,
      currency: 'usd',
      description: `${pkg.name} (${paymentMode})`,
      metadata: {
        packet_id: String(packet.id),
        package_id: String(packageId),
        payment_mode: paymentMode,
        agency_id: String(packet.agency_id),
        client_id: String(packet.client_id),
        source: 'practitioner_packet'
      },
      connectedAccountId
    });

    res.json({
      ok: true,
      stripeEnabled: true,
      amountCents,
      currency: 'usd',
      packageId,
      paymentMode,
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
      publishableKey,
      connectedAccountId
    });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

/**
 * Confirm package activation after Stripe PaymentIntent succeeds (or offline PENDING).
 */
export const postPublicPacketConfirm = async (req, res, next) => {
  try {
    const packet = await findPacketByToken(req.params.token);
    if (!packet) return res.status(404).json({ error: { message: 'Packet not found' } });
    const packageId = Number(req.body?.packageId || 0);
    const paymentMode = String(req.body?.paymentMode || 'PAY_IN_FULL').toUpperCase();
    const paymentIntentId = String(req.body?.paymentIntentId || '').trim();
    const pkg = await assertOfferedPackage(packet, packageId);

    const connectedAccountId = await getAgencyStripeConnectAccountId(packet.agency_id);
    const stripeReady = !!(isStripeConfigured() && connectedAccountId);
    const expectedAmount = resolveChargeAmountCents(pkg, paymentMode);

    let paymentStatus = 'PENDING';
    let amountChargedCents = null;

    if (paymentIntentId && stripeReady) {
      const intent = await StripePaymentsService.retrievePaymentIntent(paymentIntentId, connectedAccountId);
      if (!intent || intent.status !== 'succeeded') {
        return res.status(402).json({ error: { message: 'Payment has not succeeded yet' } });
      }
      if (String(intent.metadata?.packet_id || '') !== String(packet.id)) {
        return res.status(400).json({ error: { message: 'Payment does not match this packet' } });
      }
      if (String(intent.metadata?.package_id || '') !== String(packageId)) {
        return res.status(400).json({ error: { message: 'Payment does not match this package' } });
      }
      paymentStatus = 'PAID';
      amountChargedCents = Number(intent.amount || expectedAmount);
    } else if (expectedAmount < 1) {
      paymentStatus = 'PAID';
      amountChargedCents = 0;
    } else if (stripeReady) {
      return res.status(402).json({
        error: { message: 'Payment required. Complete checkout before activating this package.' }
      });
    } else {
      // Dev / pre-Stripe: allow pending activation so flow can be tested
      paymentStatus = 'PENDING';
    }

    const result = await activatePackageSelection({
      packetId: packet.id,
      packageId,
      paymentMode,
      createdByUserId: null,
      paymentStatus,
      stripePaymentIntentId: paymentIntentId || null,
      amountChargedCents
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

/** @deprecated Prefer checkout + confirm; kept for backwards compatibility. */
export const postPublicPacketSelect = async (req, res, next) => {
  try {
    const packet = await findPacketByToken(req.params.token);
    if (!packet) return res.status(404).json({ error: { message: 'Packet not found' } });
    const connectedAccountId = await getAgencyStripeConnectAccountId(packet.agency_id);
    if (isStripeConfigured() && connectedAccountId && !req.body?.paymentIntentId) {
      return res.status(400).json({
        error: { message: 'Use checkout + confirm endpoints when Stripe is enabled' }
      });
    }
    const result = await activatePackageSelection({
      packetId: packet.id,
      packageId: Number(req.body?.packageId),
      paymentMode: req.body?.paymentMode,
      createdByUserId: null,
      paymentStatus: req.body?.paymentStatus || 'PENDING',
      stripePaymentIntentId: req.body?.paymentIntentId || null
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const getClientBalance = async (req, res, next) => {
  try {
    const agencyId = Number(req.query.agencyId || 0);
    const clientId = Number(req.params.clientId || 0);
    if (!agencyId || !clientId) {
      return res.status(400).json({ error: { message: 'agencyId and clientId required' } });
    }
    const balance = await getClientSessionBalance(agencyId, clientId);
    res.json({ ok: true, balance });
  } catch (e) {
    next(e);
  }
};

export const postPublicPacketMarkIntake = async (req, res, next) => {
  try {
    const packet = await findPacketByToken(req.params.token);
    if (!packet) return res.status(404).json({ error: { message: 'Packet not found' } });
    if (!packet.selected_package_id) {
      return res.status(400).json({ error: { message: 'Complete package selection and payment first' } });
    }
    const updated = await markPacketIntakeLinkComplete({
      packetId: packet.id,
      intakeLinkId: Number(req.body?.intakeLinkId || 0)
    });
    res.json({
      ok: true,
      packet: {
        id: updated.id,
        status: updated.status,
        completedIntakeLinkIds: updated.completed_intake_link_ids || []
      }
    });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const postPublicPacketCreateAccount = async (req, res, next) => {
  try {
    const packet = await findPacketByToken(req.params.token);
    if (!packet) return res.status(404).json({ error: { message: 'Packet not found' } });

    const result = await createPacketPortalAccount({
      packetId: packet.id,
      email: req.body?.email,
      password: req.body?.password,
      firstName: req.body?.firstName,
      lastName: req.body?.lastName
    });

    const user = await User.findById(result.userId);
    const sessionId = crypto.randomUUID();
    const jwtToken = jwt.sign(
      {
        id: user.id,
        email: user.username || user.email,
        role: user.role,
        status: user.status,
        sessionId
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );
    const cookieOptions = config.authCookie.set();
    res.cookie('authToken', jwtToken, cookieOptions);

    try {
      ActivityLogService.logActivity({
        actionType: 'login',
        userId: user.id,
        sessionId,
        metadata: {
          email: user.username || user.email,
          role: user.role,
          loginType: 'practitioner_packet_account_create'
        }
      }, req);
    } catch {
      /* ignore */
    }

    const userAgencies = await User.getAgencies(user.id);
    res.json({
      ok: true,
      packet: {
        id: result.packet.id,
        status: result.packet.status,
        hasAccount: true
      },
      token: jwtToken,
      user: {
        id: user.id,
        email: user.email || user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        status: user.status,
        agencies: userAgencies
      }
    });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const getDashboardOverview = async (req, res, next) => {
  try {
    const agencyId = Number(req.query.agencyId || req.user?.agencyId || 0);
    const providerId = Number(req.query.providerId || req.user?.id || 0);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId required' } });
    const overview = await getPractitionerDashboardOverview({ agencyId, providerId });
    res.json({ ok: true, ...overview });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const getClientPackageOverview = async (req, res, next) => {
  try {
    const agencyId = Number(req.query.agencyId || req.user?.agencyId || 0);
    const clientId = Number(req.params.clientId || 0);
    if (!agencyId || !clientId) {
      return res.status(400).json({ error: { message: 'agencyId and clientId required' } });
    }
    const overview = await buildClientPackageOverview({ agencyId, clientId });
    res.json({ ok: true, ...overview });
  } catch (e) {
    next(e);
  }
};

export const postBookCoachingSession = async (req, res, next) => {
  try {
    const agencyId = Number(req.body?.agencyId || req.user?.agencyId || 0);
    const providerId = Number(req.body?.providerId || req.user?.id || 0);
    const clientId = Number(req.body?.clientId || 0);
    if (!agencyId || !providerId || !clientId || !req.body?.startAt || !req.body?.endAt) {
      return res.status(400).json({
        error: { message: 'agencyId, providerId, clientId, startAt, endAt required' }
      });
    }
    await requirePractitionerCapability(req, agencyId, 'packets');
    const result = await bookCoachingSession({
      agencyId,
      providerId,
      clientId,
      startAt: req.body.startAt,
      endAt: req.body.endAt,
      entitlementId: req.body?.entitlementId || null,
      createdByUserId: req.user?.id || null,
      title: req.body?.title || null
    });
    res.status(201).json({ ok: true, ...result });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message, code: e.code } });
    next(e);
  }
};

export const postSessionCompletedDebit = async (req, res, next) => {
  try {
    const agencyId = Number(req.body?.agencyId || 0);
    if (agencyId) await requirePractitionerCapability(req, agencyId, 'packets');
    const result = await debitSessionOnComplete({
      agencyId,
      clientId: Number(req.body?.clientId),
      providerScheduleEventId: req.body?.providerScheduleEventId || null,
      packageId: req.body?.packageId || null,
      entitlementId: req.body?.entitlementId || null,
      createdByUserId: req.user?.id || null
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const postMissedSession = async (req, res, next) => {
  try {
    const agencyId = Number(req.body?.agencyId || 0);
    if (agencyId) await requirePractitionerCapability(req, agencyId, 'packets');
    const result = await applyMissedSessionPolicy({
      agencyId,
      clientId: Number(req.body?.clientId),
      entitlementId: req.body?.entitlementId || null,
      createdByUserId: req.user?.id || null
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};
