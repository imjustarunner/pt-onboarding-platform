import pool from '../config/database.js';
import GuardianPaymentCard from '../models/GuardianPaymentCard.model.js';
import { getFamilyBillingSummary, acceptPayer, assignCard, revokeRecurring, saveFamilyInsurance } from '../services/familyBilling.service.js';
import { positiveId, billingError } from '../services/familyBillingPolicy.service.js';
import { createFamilyCardSetup, completeFamilyCardSetup } from '../services/familyCardSetup.service.js';

const context = req => ({ userId: positiveId(req.user?.id), agencyId: positiveId(req.query?.agencyId || req.body?.agencyId), ip: req.ip, userAgent: req.get('user-agent') });
const run = fn => async (req, res, next) => { try { res.set('Cache-Control', 'no-store'); await fn(req, res); } catch (e) { next(e); } };
export const getBillingOverview = run(async (req, res) => { const c = context(req); res.json(await getFamilyBillingSummary(c.userId, c.agencyId)); });
export const listGuardianPaymentCards = run(async (req, res) => { const c = context(req); const data = await getFamilyBillingSummary(c.userId, c.agencyId); res.json({ cards: data.cards }); });
export const listGuardianInsurance = run(async (req, res) => { const c = context(req); const data = await getFamilyBillingSummary(c.userId, c.agencyId); res.json({ profiles: data.profiles }); });
export const removeGuardianPaymentCard = run(async (req, res) => { const c = context(req); await GuardianPaymentCard.deactivate(positiveId(req.params.cardId), c.userId, c.agencyId); res.json({ success: true }); });
export const acceptBillingResponsibility = run(async (req, res) => { await acceptPayer({ ...context(req), clientId: positiveId(req.params.clientId), consent: req.body?.consent }); res.json({ success: true }); });
export const assignBillingCard = run(async (req, res) => { await assignCard({ ...context(req), clientId: positiveId(req.params.clientId), cardId: req.body?.cardId, recurring: req.body?.recurring === true, limitCents: Number(req.body?.limitCents), consent: req.body?.consent }); res.json({ success: true }); });
export const revokeBillingRecurring = run(async (req, res) => { await revokeRecurring({ ...context(req), clientId: positiveId(req.params.clientId) }); res.json({ success: true }); });
export const saveBillingInsurance = run(async (req, res) => { const id = await saveFamilyInsurance({ ...req.body, ...context(req) }); res.json({ success: true, profileId: id }); });
export const createPortalCardSetup = run(async (req, res) => {
  const c = context(req), summary = await getFamilyBillingSummary(c.userId, c.agencyId);
  if (!summary.clients.some(row => row.canManageBilling)) throw billingError(403, 'Accept financial responsibility for a linked client first');
  const setup = await createFamilyCardSetup({ ...c, connectedAccountId: summary.stripe.connectedAccountId });
  res.json({ ...setup, terms: summary.terms, termsVersion: summary.termsVersion });
});
export const completePortalCardSetup = run(async (req, res) => {
  const c = context(req), summary = await getFamilyBillingSummary(c.userId, c.agencyId);
  if (!summary.clients.some(row => row.canManageBilling)) throw billingError(403, 'Responsible payer access is required');
  const card = await completeFamilyCardSetup({ ...c, setupIntentId: req.body?.setupIntentId, consent: req.body?.consent });
  res.json({ card });
});

/**
 * GET /api/guardian-billing/dependents-summary?agencyId=X
 * Returns guardian's linked clients with their waiver profile summaries
 * (emergency contacts, allergies, meal preferences, pickup authorization).
 */
export const getDependentsSummary = async (req, res, next) => {
  try {
    const guardianUserId = req.user?.id;
    const agencyId = parseInt(req.query.agencyId, 10) || null;
    if (!guardianUserId) return res.status(401).json({ error: { message: 'Unauthorized' } });
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    // Get linked clients for this guardian
    const [clientRows] = await pool.query(
      `SELECT c.id, c.full_name, c.status, c.gender, c.grade, c.client_type,
              cg.relationship_type, cg.permissions_json
       FROM client_guardians cg
       JOIN clients c ON c.id = cg.client_id
       WHERE cg.guardian_user_id = ? AND c.agency_id = ? AND cg.access_enabled = 1
       ORDER BY c.full_name ASC`,
      [guardianUserId, agencyId]
    );

    const dependents = [];
    for (const client of clientRows) {
      // Fetch their most recent waiver profile
      const [waiverRows] = await pool.query(
        `SELECT sections_json, updated_at
         FROM guardian_client_waiver_profiles
         WHERE guardian_user_id = ? AND client_id = ?
         ORDER BY updated_at DESC LIMIT 1`,
        [guardianUserId, client.id]
      );
      let sections = {};
      let waiverUpdatedAt = null;
      if (waiverRows.length) {
        waiverUpdatedAt = waiverRows[0].updated_at;
        try {
          sections = JSON.parse(waiverRows[0].sections_json || '{}') || {};
        } catch {
          sections = {};
        }
      }

      dependents.push({
        clientId: client.id,
        fullName: client.full_name || '',
        status: client.status || '',
        gender: client.gender || null,
        grade: client.grade || null,
        clientType: client.client_type || null,
        relationshipType: client.relationship_type || null,
        waiverUpdatedAt,
        sections: {
          emergency_contacts: sections.emergency_contacts?.payload || null,
          allergies_snacks: sections.allergies_snacks?.payload || null,
          meal_preferences: sections.meal_preferences?.payload || null,
          pickup_authorization: sections.pickup_authorization?.payload || null
        }
      });
    }

    res.json({ dependents });
  } catch (error) {
    next(error);
  }
};
