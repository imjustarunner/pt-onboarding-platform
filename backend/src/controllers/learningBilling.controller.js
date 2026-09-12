import { getFamilyBillingSummary } from '../services/familyBilling.service.js';
import { requireResponsiblePayer } from '../services/familyBillingPolicy.service.js';
import { payFamilyCharge } from '../services/familyBillingPayment.service.js';
import pool from '../config/database.js';
import User from '../models/User.model.js';
import Client from '../models/Client.model.js';
import OfficeEvent from '../models/OfficeEvent.model.js';
import LearningSessionCharge from '../models/LearningSessionCharge.model.js';
import LearningProgramSession from '../models/LearningProgramSession.model.js';
import LearningService from '../models/LearningService.model.js';
import LearningTokenLedger from '../models/LearningTokenLedger.model.js';
import LearningSubscription from '../models/LearningSubscription.model.js';
import LearningSubscriptionPlan from '../models/LearningSubscriptionPlan.model.js';
import LearningBillingOrchestrator from '../services/learningBillingOrchestrator.service.js';
import LearningBillingGateService from '../services/learningBillingGate.service.js';
import LearningQuickbooksQueueService from '../services/learningQuickbooksQueue.service.js';
import LearningSubscriptionRenewalService from '../services/learningSubscriptionRenewal.service.js';
import ClientPaymentsSetupService from '../services/clientPaymentsSetup.service.js';
import StripePaymentsService, { isStripeConfigured } from '../services/stripePayments.service.js';
import BillingMerchantContextService from '../services/billingMerchantContext.service.js';
import { isBookedOfficeEventForLearningLink, wallMySqlToUtcDateTime } from '../utils/learningBillingTime.utils.js';
import { dateToMysqlUtcDateTime, utcMysqlToIso } from '../utils/zonedWallTime.util.js';

/** office_events are UTC — normalize without wall→UTC re-conversion. */
function officeEventToUtcMysql(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return dateToMysqlUtcDateTime(value);
  const iso = utcMysqlToIso(value);
  return iso ? dateToMysqlUtcDateTime(new Date(iso)) : wallMySqlToUtcDateTime(value, 'UTC');
}
import { encryptBillingSecret } from '../services/billingEncryption.service.js';

const canManageLearningBilling = (role) => {
  const r = String(role || '').toLowerCase();
  return r === 'super_admin' || r === 'admin' || r === 'staff' || r === 'support' || r === 'clinical_practice_assistant' || r === 'provider_plus';
};

async function userHasAgencyAccess(userId, agencyId, role) {
  if (String(role || '').toLowerCase() === 'super_admin') return true;
  if (['staff','support'].includes(String(role || '').toLowerCase()) && !(await User.listBillingAgencyIds(userId)).map(Number).includes(Number(agencyId))) return false;
  const agencies = await User.getAgencies(userId);
  return (agencies || []).some((a) => Number(a.id) === Number(agencyId));
}

async function isGuardianLinkedToClient({ guardianUserId, clientId, agencyId }) {
  if (!agencyId) {
    const [rows] = await pool.execute('SELECT agency_id FROM clients WHERE id = ?', [clientId]);
    agencyId = rows[0]?.agency_id;
  }
  try { await requireResponsiblePayer(guardianUserId, clientId, agencyId); return true; }
  catch (e) { if (e.status === 403 || e.status === 400) return false; throw e; }
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
        const linked = await isGuardianLinkedToClient({ guardianUserId: req.user.id, clientId, agencyId });
        if (!linked) return res.status(403).json({ error: { message: 'Access denied for this client' } });
      } else {
        const access = await userHasAgencyAccess(req.user.id, agencyId, req.user.role);
        if (!access) return res.status(403).json({ error: { message: 'Access denied' } });
      }
      const c = await Client.findById(clientId);
      if (c && Number(c.agency_id) !== agencyId) return res.status(404).json({ error: { message: 'Client not found for agency' } });
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
      if (role === 'client_guardian' && !(await isGuardianLinkedToClient({ guardianUserId: req.user.id, clientId: c.id, agencyId }))) continue;
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

    const merchantSetup = await ClientPaymentsSetupService.getSetupForAgency(agencyId);
    return res.json({ ok: true, agencyId, items, merchantSetup });
  } catch (e) {
    next(e);
  }
};

export const getLearningBillingMerchantSetup = async (req, res, next) => {
  try {
    const agencyId = Number(req.query.agencyId || req.params.agencyId || 0);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const gate = await requireLearningBillingEnabled({ agencyId, res });
    if (!gate) return;
    const role = String(req.user?.role || '').toLowerCase();
    if (role === 'client_guardian') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    if (!canManageLearningBilling(role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const access = await userHasAgencyAccess(req.user.id, agencyId, req.user.role);
    if (!access) return res.status(403).json({ error: { message: 'Access denied' } });
    const merchantSetup = await ClientPaymentsSetupService.getSetupForAgency(agencyId);
    return res.json({ ok: true, agencyId, merchantSetup });
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
      const linked = await isGuardianLinkedToClient({ guardianUserId: req.user.id, clientId, agencyId });
      if (!linked) return res.status(403).json({ error: { message: 'Access denied for this client' } });
    } else if (!canManageLearningBilling(role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    } else {
      const access = await userHasAgencyAccess(req.user.id, agencyId, req.user.role);
      if (!access) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const ledger = await LearningSessionCharge.listLedgerForClient({ agencyId, clientId, limit: 300 });
    return res.json({ ok: true, agencyId, clientId, ledger: role === 'client_guardian' ? ledger.map(row => Object.fromEntries(['id','total_cents','currency','charge_status','charge_type','created_at','scheduled_start_at','captured_at'].map(key => [key, row[key]]))) : ledger });
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
      startAtUtc: officeEventToUtcMysql(officeEvent.start_at),
      endAtUtc: officeEventToUtcMysql(officeEvent.end_at),
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

export const createSelfPayChargeFromChart = async (req, res, next) => {
  try {
    if (!canManageLearningBilling(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const agencyId = Number(req.body?.agencyId || 0);
    const clientId = Number(req.body?.clientId || req.params?.clientId || 0);
    const officeEventId = Number(req.body?.officeEventId || 0) || null;
    const clinicalNoteId = Number(req.body?.clinicalNoteId || 0) || null;
    const learningServiceId = Number(req.body?.learningServiceId || 0) || null;
    const amountCents = req.body?.amountCents != null ? Number(req.body.amountCents) : null;
    const serviceType = String(req.body?.serviceType || 'CONSULTATION').trim().toUpperCase() || 'CONSULTATION';
    const serviceDate = req.body?.serviceDate ? String(req.body.serviceDate).slice(0, 10) : null;
    if (!agencyId || !clientId) {
      return res.status(400).json({ error: { message: 'agencyId and clientId are required' } });
    }
    const gate = await requireLearningBillingEnabled({ agencyId, res });
    if (!gate) return;
    const access = await userHasAgencyAccess(req.user.id, agencyId, req.user.role);
    if (!access) return res.status(403).json({ error: { message: 'Access denied' } });

    const client = await Client.findById(clientId);
    if (!client || Number(client.agency_id) !== agencyId) {
      return res.status(404).json({ error: { message: 'Client not found for agency' } });
    }

    const result = await LearningBillingOrchestrator.createSelfPayChargeFromChart({
      agencyId,
      clientId,
      organizationId: Number(client.organization_id || 0) || null,
      officeEventId,
      clinicalNoteId,
      serviceType,
      learningServiceId,
      amountCents,
      serviceDate,
      durationMinutes: Number(req.body?.durationMinutes || 60) || 60,
      guardianUserId: Number(req.body?.guardianUserId || 0) || null,
      notes: req.body?.notes ? String(req.body.notes).slice(0, 500) : null,
      createdByUserId: req.user.id
    });

    let quickbooksJobId = null;
    if (result.created && Number(result.charge?.total_cents || 0) > 0) {
      try {
        quickbooksJobId = await LearningQuickbooksQueueService.enqueueChargeInvoice({
          agencyId,
          chargeId: result.charge.id
        });
      } catch {
        quickbooksJobId = null;
      }
    }

    return res.status(result.created ? 201 : 200).json({
      ok: true,
      created: result.created,
      session: result.session,
      charge: result.charge,
      service: result.service,
      quickbooksJobId
    });
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
      const linked = await isGuardianLinkedToClient({ guardianUserId: req.user.id, clientId, agencyId });
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
    const result = await payFamilyCharge({ agencyId: Number(req.body?.agencyId), userId: req.user.id, chargeId: Number(req.body?.chargeId), expectedAmountCents: req.body?.expectedAmountCents });
    res.json({ ok: true, ...result });
  } catch (e) { next(e); }
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
    if (clientId) await requireResponsiblePayer(req.user.id,clientId,agencyId);
    const summary = await getFamilyBillingSummary(req.user.id,agencyId);
    return res.json({ok:true,methods:summary.cards.map(card=>({id:card.id,card_brand:card.card_brand,last4:card.card_last4,exp_month:card.card_exp_month,exp_year:card.card_exp_year}))});
  } catch (e) {
    next(e);
  }
};

export const createPlaceholderPaymentMethod = (req, res) => res.status(410).json({ error: { message: 'Placeholder cards are no longer supported. Add a card through secure Billing.' } });

export const setDefaultPaymentMethod = (req,res) => res.status(410).json({error:{message:'Assign your payment method to specific clients in Billing.'}});

export const recordPaymentAttemptPlaceholder = (req, res) => res.status(410).json({ error: { message: 'Payment outcomes are verified with the processor and cannot be set by a browser.' } });

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
      const linked = await isGuardianLinkedToClient({ guardianUserId: req.user.id, clientId, agencyId });
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
      const linked = await isGuardianLinkedToClient({ guardianUserId: req.user.id, clientId, agencyId });
      if (!linked) return res.status(403).json({ error: { message: 'Access denied for this client' } });
    } else if (!canManageLearningBilling(role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    } else {
      const access = await userHasAgencyAccess(req.user.id, agencyId, req.user.role);
      if (!access) return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const entries = await LearningTokenLedger.listForClient({ agencyId, clientId, limit: 300 });
    return res.json({ ok: true, entries: role === 'client_guardian' ? entries.map(row => Object.fromEntries(['id','token_type','direction','quantity','reason_code','effective_at','created_at'].map(key=>[key,row[key]]))) : entries });
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
      const linked = await isGuardianLinkedToClient({ guardianUserId: req.user.id, clientId, agencyId });
      if (!linked) return res.status(403).json({ error: { message: 'Access denied for this client' } });
    } else if (!canManageLearningBilling(role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    } else {
      const access = await userHasAgencyAccess(req.user.id, agencyId, req.user.role);
      if (!access) return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const subscriptions = await LearningSubscription.listForClient({ agencyId, clientId, limit: 100 });
    return res.json({ ok: true, subscriptions: role === 'client_guardian' ? subscriptions.filter(row=>Number(row.guardian_user_id)===Number(req.user.id)).map(publicSubscription) : subscriptions });
  } catch (e) {
    next(e);
  }
};

function publicSubscription(row) {return Object.fromEntries(['id','plan_name','status','current_period_start','current_period_end','included_individual_tokens','included_group_tokens'].map(key=>[key,row?.[key]]));}

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
      if (Number(row.guardian_user_id) !== Number(req.user.id)) return res.status(403).json({error:{message:'This subscription belongs to another payer'}});
      const linked = await isGuardianLinkedToClient({ guardianUserId: req.user.id, clientId: Number(row.client_id || 0), agencyId: Number(row.agency_id) });
      if (!linked) return res.status(403).json({ error: { message: 'Access denied for this subscription' } });
      if (!['PAUSED', 'CANCELLED'].includes(status)) {
        return res.status(403).json({ error: { message: 'Guardians can only pause or cancel subscriptions.' } });
      }
    } else {
      const access = await userHasAgencyAccess(req.user.id, Number(row.agency_id), req.user.role);
      if (!access) return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const updated = await LearningSubscription.updateStatus({ subscriptionId, status });
    return res.json({ ok: true, subscription: isGuardian ? publicSubscription(updated) : updated });
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

/**
 * Buy a session package: charge guardian now and credit N tokens to the client.
 * Used by GuardianSessionBookingDrawer when payment_policy = 'PREPAY'.
 *
 * Body: { agencyId, clientId, sessionCount, stripePaymentMethodId, agencySlug? }
 */
export const buySessionPackage = (req, res) => res.status(410).json({ error: { message: 'Use the program package checkout. This legacy endpoint cannot verify package payment.' } });
