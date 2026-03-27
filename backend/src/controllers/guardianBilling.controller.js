import GuardianPaymentCard from '../models/GuardianPaymentCard.model.js';
import GuardianInsuranceProfile from '../models/GuardianInsuranceProfile.model.js';
import pool from '../config/database.js';

export const listGuardianPaymentCards = async (req, res, next) => {
  try {
    const guardianUserId = req.user?.id;
    const agencyId = parseInt(req.query.agencyId, 10) || null;
    if (!guardianUserId) return res.status(401).json({ error: { message: 'Unauthorized' } });
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const cards = await GuardianPaymentCard.findActiveByGuardian(guardianUserId, agencyId);
    res.json({ cards });
  } catch (error) {
    next(error);
  }
};

export const removeGuardianPaymentCard = async (req, res, next) => {
  try {
    const guardianUserId = req.user?.id;
    const cardId = parseInt(req.params.cardId, 10);
    if (!guardianUserId) return res.status(401).json({ error: { message: 'Unauthorized' } });
    if (!cardId) return res.status(400).json({ error: { message: 'cardId is required' } });
    await GuardianPaymentCard.deactivate(cardId, guardianUserId);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

export const listGuardianInsurance = async (req, res, next) => {
  try {
    const guardianUserId = req.user?.id;
    const agencyId = parseInt(req.query.agencyId, 10) || null;
    if (!guardianUserId) return res.status(401).json({ error: { message: 'Unauthorized' } });
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const profiles = await GuardianInsuranceProfile.findByGuardian(guardianUserId, agencyId);
    res.json({ profiles });
  } catch (error) {
    next(error);
  }
};

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
       WHERE cg.guardian_user_id = ? AND c.agency_id = ? AND cg.is_active = 1
       ORDER BY c.full_name ASC`,
      [guardianUserId, agencyId]
    );

    const dependents = [];
    for (const client of clientRows) {
      // Fetch their most recent waiver profile
      const [waiverRows] = await pool.query(
        `SELECT sections_json, updated_at
         FROM guardian_client_waiver_profiles
         WHERE guardian_user_id = ? AND client_id = ? AND agency_id = ?
         ORDER BY updated_at DESC LIMIT 1`,
        [guardianUserId, client.id, agencyId]
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
