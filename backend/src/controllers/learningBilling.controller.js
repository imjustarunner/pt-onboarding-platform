import pool from '../config/database.js';
import User from '../models/User.model.js';
import Client from '../models/Client.model.js';
import OfficeEvent from '../models/OfficeEvent.model.js';
import LearningSessionCharge from '../models/LearningSessionCharge.model.js';
import LearningProgramSession from '../models/LearningProgramSession.model.js';
import LearningService from '../models/LearningService.model.js';
import LearningPaymentMethod from '../models/LearningPaymentMethod.model.js';
import LearningTokenLedger from '../models/LearningTokenLedger.model.js';
import LearningSubscription from '../models/LearningSubscription.model.js';
import LearningSubscriptionPlan from '../models/LearningSubscriptionPlan.model.js';
import LearningBillingOrchestrator from '../services/learningBillingOrchestrator.service.js';
import LearningBillingGateService from '../services/learningBillingGate.service.js';
import LearningQuickbooksQueueService from '../services/learningQuickbooksQueue.service.js';
import LearningSubscriptionRenewalService from '../services/learningSubscriptionRenewal.service.js';
import { isBookedOfficeEventForLearningLink, wallMySqlToUtcDateTime } from '../utils/learningBillingTime.utils.js';
import { encryptBillingSecret } from '../services/billingEncryption.service.js';

const canManageLearningBilling = (role) => {
  const r = String(role || '').toLowerCase();
  return r === 'super_admin' || r === 'admin' || r === 'staff' || r === 'support' || r === 'clinical_practice_assistant' || r === 'provider_plus';
};

async function userHasAgencyAccess(userId, agencyId, role) {
  if (String(role || '').toLowerCase() === 'super_admin') return true;
  const agencies = await User.getAgencies(userId);
  return (agencies || []).some((a) => Number(a.id) === Number(agencyId));
}

async function isGuardianLinkedToClient({ guardianUserId, clientId }) {
  const [rows] = await pool.execute(
    `SELECT id
     FROM client_guardians
     WHERE guardian_user_id = ?
       AND client_id = ?
       AND (access_enabled IS NULL OR access_enabled = TRUE)
     LIMIT 1`,
    [guardianUserId, clientId]
  );
  return Boolean(rows?.[0]);
}

async function requireLearningBillingEnabled({ agencyId, res }) {
  const gate = await LearningBillingGateService.isLearningBillingEnabledForAgency({ agencyId });
  if (gate.enabled) return gate;
  const msg = gate.reason === 'feature_disabled'
    ? 'Learning billing is disabled for this learning program.'
    : gate.reason === 'not_learning_org'
      ? 'Learning billing is only available for learning programs.'
      : 'Learning billing is unavailable for this agency.';
  res.status(403).json({ error: { message: msg } });
  return null;
}

export const getGuardianBillingSummary = async (req, res, next) => {
  try {
    const agencyId = Number(req.query.agencyId || 0);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const gate = await requireLearningBillingEnabled({ agencyId, res });
    if (!gate) return;

    const role = String(req.user?.role || '').toLowerCase();
    if (role !== 'client_guardian' && !canManageLearningBilling(role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const clientId = Number(req.query.clientId || 0);
    let clients = [];
    if (clientId > 0) {
      if (role === 'client_guardian') {
        const linked = await isGuardianLinkedToClient({ guardianUserId: req.user.id, clientId });
        if (!linked) return res.status(403).json({ error: { message: 'Access denied for this client' } });
      } else {
        const access = await userHasAgencyAccess(req.user.id, agencyId, req.user.role);
        if (!access) return res.status(403).json({ error: { message: 'Access denied' } });
      }
      const c = await Client.findById(clientId);
      clients = c ? [c] : [];
    } else if (role === 'client_guardian') {
      const [rows] = await pool.execute(
        `SELECT c.*
         FROM client_guardians cg
         JOIN clients c ON c.id = cg.client_id
         WHERE cg.guardian_user_id = ?
           AND c.agency_id = ?
           AND (cg.access_enabled IS NULL OR cg.access_enabled = TRUE)`,
        [req.user.id, agencyId]
      );
      clients = rows || [];
    } else {
      return res.status(400).json({ error: { message: 'clientId is required for staff/admin summary view' } });
    }

    const items = [];
    for (const c of clients) {
      const ledger = await LearningSessionCharge.listLedgerForClient({
        agencyId,
        clientId: c.id,
        limit: 200
      });
      const outstandingCents = (ledger || [])
        .filter((x) => ['PENDING', 'AUTHORIZED', 'FAILED'].includes(String(x.charge_status || '').toUpperCase()))
        .reduce((sum, x) => sum + Number(x.total_cents || 0), 0);
      items.push({
        clientId: c.id,
        clientName: c.full_name || c.initials || `Client ${c.id}`,
        outstandingCents,
        currency: 'USD',
        chargeCount: (ledger || []).length
      });
    }

    return res.json({ ok: true, agencyId, items });
  } catch (e) {
    next(e);
  }
};

export const getClientBillingLedger = async (req, res, next) => {
  try {
    const agencyId = Number(req.query.agencyId || 0);
    const clientId = Number(req.params.clientId || 0);
    if (!agencyId || !clientId) return res.status(400).json({ error: { message: 'agencyId and clientId are required' } });
    const gate = await requireLearningBillingEnabled({ agencyId, res });
    if (!gate) return;

    const role = String(req.user?.role || '').toLowerCase();
    if (role === 'client_guardian') {
      const linked = await isGuardianLinkedToClient({ guardianUserId: req.user.id, clientId });
      if (!linked) return res.status(403).json({ error: { message: 'Access denied for this client' } });
    } else if (!canManageLearningBilling(role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    } else {
      const access = await userHasAgencyAccess(req.user.id, agencyId, req.user.role);
      if (!access) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const ledger = await LearningSessionCharge.listLedgerForClient({ agencyId, clientId, limit: 300 });
    return res.json({ ok: true, agencyId, clientId, ledger });
  } catch (e) {
    next(e);
  }
};

export const createSessionFromOfficeEvent = async (req, res, next) => {
  try {
    if (!canManageLearningBilling(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Only schedule managers can create linked learning sessions' } });
    }
    const agencyId = Number(req.body?.agencyId || 0);
    const officeEventId = Number(req.body?.officeEventId || 0);
    const clientId = Number(req.body?.clientId || 0);
    const learningServiceId = Number(req.body?.learningServiceId || 0) || null;
    const guardianUserId = Number(req.body?.guardianUserId || 0) || null;
    const organizationId = Number(req.body?.organizationId || 0) || null;
    const sourceTimezone = String(req.body?.sourceTimezone || 'America/New_York');
    if (!agencyId || !officeEventId || !clientId) {
      return res.status(400).json({ error: { message: 'agencyId, officeEventId, and clientId are required' } });
    }
    const gate = await requireLearningBillingEnabled({ agencyId, res });
    if (!gate) return;
    const access = await userHasAgencyAccess(req.user.id, agencyId, req.user.role);
    if (!access) return res.status(403).json({ error: { message: 'Access denied' } });

    const officeEvent = await OfficeEvent.findById(officeEventId);
    if (!officeEvent) return res.status(404).json({ error: { message: 'Office event not found' } });
    if (!isBookedOfficeEventForLearningLink(officeEvent)) {
      return res.status(409).json({ error: { message: 'Office event must be booked before linking learning billing.' } });
    }
    const client = await Client.findById(clientId);
    if (!client || Number(client.agency_id) !== agencyId) {
      return res.status(404).json({ error: { message: 'Client not found for agency' } });
    }

    const { session, created } = await LearningBillingOrchestrator.createSessionFromOfficeEvent({
      agencyId,
      organizationId: organizationId || Number(client.organization_id || 0) || null,
      officeEvent,
      clientId,
      guardianUserId,
      learningServiceId,
      paymentMode: String(req.body?.paymentMode || 'PAY_PER_EVENT').toUpperCase(),
      sourceTimezone,
      startAtUtc: wallMySqlToUtcDateTime(officeEvent.start_at, sourceTimezone),
      endAtUtc: wallMySqlToUtcDateTime(officeEvent.end_at, sourceTimezone),
      createdByUserId: req.user.id
    });

    let charge = null;
    let quickbooksJobId = null;
    let coverage = { covered: false, mode: String(req.body?.paymentMode || 'PAY_PER_EVENT').toUpperCase(), reason: 'not_evaluated' };
    if (created) {
      charge = await LearningBillingOrchestrator.createPendingSessionCharge({
        agencyId,
        sessionId: session.id,
        clientId,
        guardianUserId,
        learningServiceId,
        createdByUserId: req.user.id
      });
      coverage = await LearningBillingOrchestrator.applyCoverageForCharge({
        agencyId,
        session,
        charge,
        paymentMode: String(req.body?.paymentMode || session?.payment_mode || 'PAY_PER_EVENT'),
        createdByUserId: req.user.id
      });
      if (coverage?.charge) charge = coverage.charge;
      if (!coverage.covered && Number(charge?.total_cents || 0) > 0) {
        quickbooksJobId = await LearningQuickbooksQueueService.enqueueChargeInvoice({ agencyId, chargeId: charge.id });
      }
    } else {
      charge = await LearningSessionCharge.findLatestForSession(session.id);
    }

    return res.json({ ok: true, createdSession: created, session, charge, coverage, quickbooksJobId });
  } catch (e) {
    next(e);
  }
};

export const creditClientTokens = async (req, res, next) => {
  try {
    if (!canManageLearningBilling(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const agencyId = Number(req.body?.agencyId || 0);
    const clientId = Number(req.body?.clientId || 0);
    const quantity = Number(req.body?.quantity || 0);
    const tokenType = String(req.body?.tokenType || 'INDIVIDUAL').toUpperCase();
    if (!agencyId || !clientId || quantity <= 0) {
      return res.status(400).json({ error: { message: 'agencyId, clientId, and positive quantity are required' } });
    }
    if (!['INDIVIDUAL', 'GROUP'].includes(tokenType)) {
      return res.status(400).json({ error: { message: 'tokenType must be INDIVIDUAL or GROUP' } });
    }
    const gate = await requireLearningBillingEnabled({ agencyId, res });
    if (!gate) return;
    const access = await userHasAgencyAccess(req.user.id, agencyId, req.user.role);
    if (!access) return res.status(403).json({ error: { message: 'Access denied' } });
    await LearningTokenLedger.addEntry({
      agencyId,
      clientId,
      tokenType,
      direction: 'CREDIT',
      quantity,
      reasonCode: String(req.body?.reasonCode || 'MANUAL_CREDIT').slice(0, 64) || 'MANUAL_CREDIT',
      metadataJson: { source: 'ADMIN_MANUAL', note: req.body?.note || null },
      createdByUserId: req.user.id
    });
    const balance = await LearningTokenLedger.getBalanceByClient({ agencyId, clientId });
    return res.json({ ok: true, balance });
  } catch (e) {
    next(e);
  }
};

export const getBookingEligibility = async (req, res, next) => {
  try {
    const agencyId = Number(req.query.agencyId || req.body?.agencyId || 0);
    const clientId = Number(req.query.clientId || req.body?.clientId || 0);
    const sessionType = String(req.query.sessionType || req.body?.sessionType || 'INDIVIDUAL');
    if (!agencyId || !clientId) return res.status(400).json({ error: { message: 'agencyId and clientId are required' } });
    const gate = await requireLearningBillingEnabled({ agencyId, res });
    if (!gate) return;

    const role = String(req.user?.role || '').toLowerCase();
    if (role === 'client_guardian') {
      const linked = await isGuardianLinkedToClient({ guardianUserId: req.user.id, clientId });
      if (!linked) return res.status(403).json({ error: { message: 'Access denied for this client' } });
    } else if (!canManageLearningBilling(role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const eligibility = await LearningBillingOrchestrator.getBookingEligibility({ agencyId, clientId, sessionType });
    return res.json({ ok: true, agencyId, clientId, sessionType, ...eligibility });
  } catch (e) {
    next(e);
  }
};

export const listLearningServices = async (req, res, next) => {
  try {
    const agencyId = Number(req.query.agencyId || 0);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const gate = await requireLearningBillingEnabled({ agencyId, res });
    if (!gate) return;
    const role = String(req.user?.role || '').toLowerCase();
    if (!canManageLearningBilling(role) && role !== 'client_guardian') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    if (role !== 'client_guardian') {
      const access = await userHasAgencyAccess(req.user.id, agencyId, req.user.role);
      if (!access) return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const services = await LearningService.listByAgency({ agencyId, activeOnly: true });
    return res.json({ ok: true, services });
  } catch (e) {
    next(e);
  }
};

export const createPaymentIntentPlaceholder = async (req, res, next) => {
  try {
    const agencyId = Number(req.body?.agencyId || 0);
    const chargeId = Number(req.body?.chargeId || 0);
    if (!agencyId || !chargeId) return res.status(400).json({ error: { message: 'agencyId and chargeId are required' } });
    const gate = await requireLearningBillingEnabled({ agencyId, res });
    if (!gate) return;

    const access = canManageLearningBilling(req.user?.role) || String(req.user?.role || '').toLowerCase() === 'client_guardian';
    if (!access) return res.status(403).json({ error: { message: 'Access denied' } });

    const [chargeRows] = await pool.execute(
      `SELECT id, agency_id, client_id, total_cents, currency
       FROM learning_session_charges
       WHERE id = ? AND agency_id = ?
       LIMIT 1`,
      [chargeId, agencyId]
    );
    const charge = chargeRows?.[0] || null;
    if (!charge) {
      return res.status(404).json({ error: { message: 'Charge not found for agency' } });
    }
    let paymentMethodId = Number(req.body?.paymentMethodId || 0) || null;
    if (String(req.user?.role || '').toLowerCase() === 'client_guardian') {
      const methods = await LearningPaymentMethod.listForOwner({
        agencyId,
        ownerUserId: req.user.id,
        ownerClientId: Number(charge.client_id || 0)
      });
      const defaultMethod = (methods || []).find((m) => Boolean(m.is_default)) || methods?.[0] || null;
      if (!defaultMethod) {
        return res.status(409).json({ error: { message: 'No card on file. Add a payment method first.' } });
      }
      paymentMethodId = Number(defaultMethod.id);
    }
    if (String(req.user?.role || '').toLowerCase() === 'client_guardian') {
      const linked = await isGuardianLinkedToClient({
        guardianUserId: req.user.id,
        clientId: Number(charge.client_id || 0)
      });
      if (!linked) return res.status(403).json({ error: { message: 'Access denied for this charge' } });
    }
    const idempotencyKey = `learning_payment_intent:${agencyId}:${chargeId}`;
    const processorIntentId = `pi_placeholder_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const [ins] = await pool.execute(
      `INSERT INTO learning_payments
         (agency_id, learning_session_charge_id, payment_method_id, amount_cents, currency, payment_status, processor, processor_intent_id, idempotency_key, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, 'REQUIRES_ACTION', 'PLACEHOLDER', ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         id = LAST_INSERT_ID(id),
         updated_at = CURRENT_TIMESTAMP`,
      [
        agencyId,
        chargeId,
        paymentMethodId,
        Number(charge.total_cents || 0),
        charge.currency || 'USD',
        processorIntentId,
        idempotencyKey,
        req.user.id
      ]
    );
    const paymentId = Number(ins?.insertId || 0);
    return res.json({ ok: true, paymentIntentCreated: true, paymentId });
  } catch (e) {
    next(e);
  }
};

export const listPaymentMethods = async (req, res, next) => {
  try {
    const agencyId = Number(req.query.agencyId || 0);
    const clientId = Number(req.query.clientId || 0) || null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const gate = await requireLearningBillingEnabled({ agencyId, res });
    if (!gate) return;
    const role = String(req.user?.role || '').toLowerCase();
    if (!canManageLearningBilling(role) && role !== 'client_guardian') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    let ownerUserId = req.user.id;
    if (role !== 'client_guardian') {
      ownerUserId = Number(req.query.ownerUserId || req.user.id || 0);
      const access = await userHasAgencyAccess(req.user.id, agencyId, req.user.role);
      if (!access) return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const methods = await LearningPaymentMethod.listForOwner({
      agencyId,
      ownerUserId,
      ownerClientId: clientId
    });
    return res.json({ ok: true, methods });
  } catch (e) {
    next(e);
  }
};

export const createPlaceholderPaymentMethod = async (req, res, next) => {
  try {
    const agencyId = Number(req.body?.agencyId || 0);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const gate = await requireLearningBillingEnabled({ agencyId, res });
    if (!gate) return;
    const role = String(req.user?.role || '').toLowerCase();
    if (!canManageLearningBilling(role) && role !== 'client_guardian') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const ownerUserId = role === 'client_guardian'
      ? Number(req.user.id || 0)
      : Number(req.body?.ownerUserId || req.user.id || 0);
    const ownerClientId = Number(req.body?.ownerClientId || 0) || null;
    const cardBrand = String(req.body?.cardBrand || '').trim().slice(0, 40) || null;
    const last4 = String(req.body?.last4 || '').replace(/[^\d]/g, '').slice(-4) || null;
    const expMonth = Number(req.body?.expMonth || 0) || null;
    const expYear = Number(req.body?.expYear || 0) || null;
    if (!last4 || last4.length !== 4) {
      return res.status(400).json({ error: { message: 'last4 is required (4 digits).' } });
    }
    const tokenPayload = {
      provider: 'PLACEHOLDER',
      createdByUserId: req.user.id,
      createdAt: new Date().toISOString()
    };
    const enc = encryptBillingSecret(JSON.stringify(tokenPayload));
    const tokenEncrypted = JSON.stringify(enc);
    const created = await LearningPaymentMethod.createPlaceholder({
      agencyId,
      ownerUserId,
      ownerClientId,
      cardBrand,
      last4,
      expMonth,
      expYear,
      tokenEncrypted,
      isDefault: req.body?.isDefault !== false
    });
    return res.json({ ok: true, method: created });
  } catch (e) {
    next(e);
  }
};

export const setDefaultPaymentMethod = async (req, res, next) => {
  try {
    const paymentMethodId = Number(req.params.paymentMethodId || 0);
    const agencyId = Number(req.body?.agencyId || req.query?.agencyId || 0);
    if (!paymentMethodId || !agencyId) {
      return res.status(400).json({ error: { message: 'paymentMethodId and agencyId are required' } });
    }
    const gate = await requireLearningBillingEnabled({ agencyId, res });
    if (!gate) return;
    const row = await LearningPaymentMethod.findById(paymentMethodId);
    if (!row || Number(row.agency_id || 0) !== agencyId) {
      return res.status(404).json({ error: { message: 'Payment method not found for agency' } });
    }
    const role = String(req.user?.role || '').toLowerCase();
    const isGuardian = role === 'client_guardian';
    if (!isGuardian && !canManageLearningBilling(role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const ownerUserId = Number(row.owner_user_id || 0);
    if (isGuardian && ownerUserId !== Number(req.user.id || 0)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    if (!isGuardian) {
      const access = await userHasAgencyAccess(req.user.id, agencyId, req.user.role);
      if (!access) return res.status(403).json({ error: { message: 'Access denied' } });
    }
    await LearningPaymentMethod.setDefault({ agencyId, ownerUserId, paymentMethodId });
    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const recordPaymentAttemptPlaceholder = async (req, res, next) => {
  try {
    const paymentId = Number(req.params.paymentId || 0);
    if (!paymentId) return res.status(400).json({ error: { message: 'Invalid paymentId' } });
    const status = String(req.body?.status || 'PENDING').toUpperCase();
    if (!['SUCCESS', 'FAILED', 'PENDING'].includes(status)) {
      return res.status(400).json({ error: { message: 'status must be SUCCESS, FAILED, or PENDING' } });
    }
    const [rows] = await pool.execute(
      `SELECT p.id,
              p.agency_id,
              p.learning_session_charge_id,
              c.client_id
       FROM learning_payments p
       LEFT JOIN learning_session_charges c ON c.id = p.learning_session_charge_id
       WHERE p.id = ?
       LIMIT 1`,
      [paymentId]
    );
    const payment = rows?.[0] || null;
    if (!payment) return res.status(404).json({ error: { message: 'Payment not found' } });
    const gate = await requireLearningBillingEnabled({ agencyId: payment.agency_id, res });
    if (!gate) return;
    if (String(req.user?.role || '').toLowerCase() === 'client_guardian') {
      const linked = await isGuardianLinkedToClient({
        guardianUserId: req.user.id,
        clientId: Number(payment.client_id || 0)
      });
      if (!linked) return res.status(403).json({ error: { message: 'Access denied for this payment' } });
    }

    const [attemptRows] = await pool.execute(`SELECT COALESCE(MAX(attempt_no), 0) AS n FROM learning_payment_attempts WHERE payment_id = ?`, [paymentId]);
    const nextAttempt = Number(attemptRows?.[0]?.n || 0) + 1;
    await pool.execute(
      `INSERT INTO learning_payment_attempts
         (payment_id, attempt_no, request_payload_json, response_payload_json, result_status, error_message)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        paymentId,
        nextAttempt,
        req.body?.requestPayload ? JSON.stringify(req.body.requestPayload) : null,
        req.body?.responsePayload ? JSON.stringify(req.body.responsePayload) : null,
        status,
        req.body?.errorMessage ? String(req.body.errorMessage).slice(0, 255) : null
      ]
    );
    if (status === 'SUCCESS') {
      await pool.execute(
        `UPDATE learning_payments
         SET payment_status = 'CAPTURED',
             captured_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [paymentId]
      );
      await LearningQuickbooksQueueService.enqueueCapturedPayment({
        agencyId: Number(payment.agency_id),
        paymentId
      });
      if (Number(payment.learning_session_charge_id || 0) > 0) {
        await pool.execute(
          `UPDATE learning_session_charges
           SET charge_status = 'CAPTURED',
               captured_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [payment.learning_session_charge_id]
        );
      }
    }
    return res.json({ ok: true, paymentId, attemptNo: nextAttempt, status });
  } catch (e) {
    next(e);
  }
};

export const listFrontDeskParticipants = async (req, res, next) => {
  try {
    if (!canManageLearningBilling(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const agencyId = Number(req.query.agencyId || 0);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const gate = await requireLearningBillingEnabled({ agencyId, res });
    if (!gate) return;
    const access = await userHasAgencyAccess(req.user.id, agencyId, req.user.role);
    if (!access) return res.status(403).json({ error: { message: 'Access denied' } });

    const [rows] = await pool.execute(
      `SELECT c.id AS client_id,
              COALESCE(c.full_name, c.initials, CONCAT('Client ', c.id)) AS client_name,
              COUNT(sc.id) AS charge_count,
              COALESCE(SUM(CASE WHEN UPPER(sc.charge_status) IN ('PENDING','AUTHORIZED','FAILED') THEN sc.total_cents ELSE 0 END), 0) AS outstanding_cents
       FROM clients c
       LEFT JOIN learning_session_charges sc
         ON sc.client_id = c.id
        AND sc.agency_id = c.agency_id
       WHERE c.agency_id = ?
       GROUP BY c.id, c.full_name, c.initials
       ORDER BY client_name ASC
       LIMIT 500`,
      [agencyId]
    );
    return res.json({ ok: true, agencyId, participants: rows || [] });
  } catch (e) {
    next(e);
  }
};

export const getClientTokenBalance = async (req, res, next) => {
  try {
    const agencyId = Number(req.query.agencyId || 0);
    const clientId = Number(req.params.clientId || 0);
    if (!agencyId || !clientId) return res.status(400).json({ error: { message: 'agencyId and clientId are required' } });
    const gate = await requireLearningBillingEnabled({ agencyId, res });
    if (!gate) return;

    const role = String(req.user?.role || '').toLowerCase();
    if (role === 'client_guardian') {
      const linked = await isGuardianLinkedToClient({ guardianUserId: req.user.id, clientId });
      if (!linked) return res.status(403).json({ error: { message: 'Access denied for this client' } });
    } else if (!canManageLearningBilling(role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    } else {
      const access = await userHasAgencyAccess(req.user.id, agencyId, req.user.role);
      if (!access) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const balance = await LearningTokenLedger.getBalanceByClient({ agencyId, clientId });
    return res.json({ ok: true, agencyId, clientId, ...balance });
  } catch (e) {
    next(e);
  }
};

export const listClientTokenLedger = async (req, res, next) => {
  try {
    const agencyId = Number(req.query.agencyId || 0);
    const clientId = Number(req.params.clientId || 0);
    if (!agencyId || !clientId) return res.status(400).json({ error: { message: 'agencyId and clientId are required' } });
    const gate = await requireLearningBillingEnabled({ agencyId, res });
    if (!gate) return;
    const role = String(req.user?.role || '').toLowerCase();
    if (role === 'client_guardian') {
      const linked = await isGuardianLinkedToClient({ guardianUserId: req.user.id, clientId });
      if (!linked) return res.status(403).json({ error: { message: 'Access denied for this client' } });
    } else if (!canManageLearningBilling(role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    } else {
      const access = await userHasAgencyAccess(req.user.id, agencyId, req.user.role);
      if (!access) return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const entries = await LearningTokenLedger.listForClient({ agencyId, clientId, limit: 300 });
    return res.json({ ok: true, entries });
  } catch (e) {
    next(e);
  }
};

export const listSubscriptionPlans = async (req, res, next) => {
  try {
    const agencyId = Number(req.query.agencyId || 0);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const gate = await requireLearningBillingEnabled({ agencyId, res });
    if (!gate) return;
    const role = String(req.user?.role || '').toLowerCase();
    if (!canManageLearningBilling(role) && role !== 'client_guardian') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    if (role !== 'client_guardian') {
      const access = await userHasAgencyAccess(req.user.id, agencyId, req.user.role);
      if (!access) return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const plans = await LearningSubscriptionPlan.listByAgency({ agencyId, activeOnly: true });
    return res.json({ ok: true, plans });
  } catch (e) {
    next(e);
  }
};

export const createSubscriptionPlan = async (req, res, next) => {
  try {
    if (!canManageLearningBilling(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const agencyId = Number(req.body?.agencyId || 0);
    const name = String(req.body?.name || '').trim();
    if (!agencyId || !name) return res.status(400).json({ error: { message: 'agencyId and name are required' } });
    const gate = await requireLearningBillingEnabled({ agencyId, res });
    if (!gate) return;
    const access = await userHasAgencyAccess(req.user.id, agencyId, req.user.role);
    if (!access) return res.status(403).json({ error: { message: 'Access denied' } });
    const plan = await LearningSubscriptionPlan.create({
      agencyId,
      name,
      planType: req.body?.planType || 'INDIVIDUAL',
      monthlyFeeCents: req.body?.monthlyFeeCents || 0,
      includedIndividualTokens: req.body?.includedIndividualTokens || 0,
      includedGroupTokens: req.body?.includedGroupTokens || 0,
      cancellationLimitPerMonth: req.body?.cancellationLimitPerMonth || 2,
      createdByUserId: req.user.id
    });
    return res.json({ ok: true, plan });
  } catch (e) {
    next(e);
  }
};

export const listClientSubscriptions = async (req, res, next) => {
  try {
    const agencyId = Number(req.query.agencyId || 0);
    const clientId = Number(req.params.clientId || 0);
    if (!agencyId || !clientId) return res.status(400).json({ error: { message: 'agencyId and clientId are required' } });
    const gate = await requireLearningBillingEnabled({ agencyId, res });
    if (!gate) return;
    const role = String(req.user?.role || '').toLowerCase();
    if (role === 'client_guardian') {
      const linked = await isGuardianLinkedToClient({ guardianUserId: req.user.id, clientId });
      if (!linked) return res.status(403).json({ error: { message: 'Access denied for this client' } });
    } else if (!canManageLearningBilling(role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    } else {
      const access = await userHasAgencyAccess(req.user.id, agencyId, req.user.role);
      if (!access) return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const subscriptions = await LearningSubscription.listForClient({ agencyId, clientId, limit: 100 });
    return res.json({ ok: true, subscriptions });
  } catch (e) {
    next(e);
  }
};

function addDaysUtc(ymdhms, days) {
  const d = new Date(String(ymdhms || '').replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

export const createClientSubscription = async (req, res, next) => {
  try {
    if (!canManageLearningBilling(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const agencyId = Number(req.body?.agencyId || 0);
    const clientId = Number(req.body?.clientId || 0);
    const planId = Number(req.body?.planId || 0);
    if (!agencyId || !clientId || !planId) {
      return res.status(400).json({ error: { message: 'agencyId, clientId, and planId are required' } });
    }
    const gate = await requireLearningBillingEnabled({ agencyId, res });
    if (!gate) return;
    const access = await userHasAgencyAccess(req.user.id, agencyId, req.user.role);
    if (!access) return res.status(403).json({ error: { message: 'Access denied' } });

    const plans = await LearningSubscriptionPlan.listByAgency({ agencyId, activeOnly: false });
    const plan = (plans || []).find((p) => Number(p.id) === planId && Number(p.agency_id) === agencyId);
    if (!plan) return res.status(404).json({ error: { message: 'Subscription plan not found for agency' } });
    const periodStart = String(req.body?.periodStart || '').trim() || new Date().toISOString().slice(0, 19).replace('T', ' ');
    const periodEnd = String(req.body?.periodEnd || '').trim() || addDaysUtc(periodStart, 30);
    const sub = await LearningSubscription.create({
      agencyId,
      planId,
      clientId,
      guardianUserId: Number(req.body?.guardianUserId || 0) || null,
      status: String(req.body?.status || 'ACTIVE').toUpperCase(),
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      autoRenew: req.body?.autoRenew !== false,
      createdByUserId: req.user.id
    });
    return res.json({ ok: true, subscription: sub });
  } catch (e) {
    next(e);
  }
};

export const updateSubscriptionStatus = async (req, res, next) => {
  try {
    const role = String(req.user?.role || '').toLowerCase();
    const isGuardian = role === 'client_guardian';
    const isManager = canManageLearningBilling(role);
    if (!isGuardian && !isManager) return res.status(403).json({ error: { message: 'Access denied' } });
    const subscriptionId = Number(req.params.subscriptionId || 0);
    const status = String(req.body?.status || '').toUpperCase();
    if (!subscriptionId || !['ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED'].includes(status)) {
      return res.status(400).json({ error: { message: 'Valid subscriptionId and status are required' } });
    }
    const row = await LearningSubscription.findById(subscriptionId);
    if (!row) return res.status(404).json({ error: { message: 'Subscription not found' } });
    const gate = await requireLearningBillingEnabled({ agencyId: Number(row.agency_id), res });
    if (!gate) return;
    if (isGuardian) {
      const linked = await isGuardianLinkedToClient({ guardianUserId: req.user.id, clientId: Number(row.client_id || 0) });
      if (!linked) return res.status(403).json({ error: { message: 'Access denied for this subscription' } });
      if (!['PAUSED', 'CANCELLED'].includes(status)) {
        return res.status(403).json({ error: { message: 'Guardians can only pause or cancel subscriptions.' } });
      }
    } else {
      const access = await userHasAgencyAccess(req.user.id, Number(row.agency_id), req.user.role);
      if (!access) return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const updated = await LearningSubscription.updateStatus({ subscriptionId, status });
    return res.json({ ok: true, subscription: updated });
  } catch (e) {
    next(e);
  }
};

export const replenishSubscriptionTokens = async (req, res, next) => {
  try {
    if (!canManageLearningBilling(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const subscriptionId = Number(req.params.subscriptionId || 0);
    if (!subscriptionId) return res.status(400).json({ error: { message: 'subscriptionId is required' } });
    const sub = await LearningSubscription.findById(subscriptionId);
    if (!sub) return res.status(404).json({ error: { message: 'Subscription not found' } });
    const gate = await requireLearningBillingEnabled({ agencyId: Number(sub.agency_id), res });
    if (!gate) return;
    const access = await userHasAgencyAccess(req.user.id, Number(sub.agency_id), req.user.role);
    if (!access) return res.status(403).json({ error: { message: 'Access denied' } });
    if (String(sub.status || '').toUpperCase() !== 'ACTIVE') {
      return res.status(409).json({ error: { message: 'Only active subscriptions can replenish tokens' } });
    }

    const plans = await LearningSubscriptionPlan.listByAgency({ agencyId: Number(sub.agency_id), activeOnly: false });
    const plan = (plans || []).find((p) => Number(p.id) === Number(sub.plan_id));
    if (!plan) return res.status(404).json({ error: { message: 'Plan not found for subscription' } });
    const enriched = {
      ...sub,
      included_individual_tokens: Number(plan.included_individual_tokens || 0),
      included_group_tokens: Number(plan.included_group_tokens || 0)
    };
    const replenished = await LearningSubscriptionRenewalService.replenishForSubscription({
      subscription: enriched,
      actorUserId: req.user.id
    });

    const balance = await LearningTokenLedger.getBalanceByClient({
      agencyId: Number(sub.agency_id),
      clientId: Number(sub.client_id)
    });
    return res.json({ ok: true, credits: replenished.credited, balance });
  } catch (e) {
    next(e);
  }
};

export const runSubscriptionRenewals = async (req, res, next) => {
  try {
    if (!canManageLearningBilling(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const agencyId = Number(req.body?.agencyId || req.query?.agencyId || 0) || null;
    if (agencyId) {
      const gate = await requireLearningBillingEnabled({ agencyId, res });
      if (!gate) return;
      const access = await userHasAgencyAccess(req.user.id, agencyId, req.user.role);
      if (!access) return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const result = await LearningSubscriptionRenewalService.runDueRenewals({
      agencyId,
      actorUserId: req.user.id,
      limit: Number(req.body?.limit || req.query?.limit || 200)
    });
    return res.json({ ok: true, ...result });
  } catch (e) {
    next(e);
  }
};

export const runSubscriptionRenewalsInternal = async (req, res, next) => {
  try {
    const agencyId = Number(req.body?.agencyId || req.query?.agencyId || 0) || null;
    if (agencyId) {
      const gate = await requireLearningBillingEnabled({ agencyId, res });
      if (!gate) return;
    }
    const result = await LearningSubscriptionRenewalService.runDueRenewals({
      agencyId,
      actorUserId: null,
      limit: Number(req.body?.limit || req.query?.limit || 200)
    });
    return res.json({ ok: true, internal: true, ...result });
  } catch (e) {
    next(e);
  }
};
