import User from '../models/User.model.js';
import Client from '../models/Client.model.js';
import OfficeEvent from '../models/OfficeEvent.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import pool from '../config/database.js';
import { getMedicalBillingFlags, parseFeatureFlags } from './medicalBillingFlags.service.js';

const BACKOFFICE_ROLES = new Set(['admin', 'super_admin', 'support', 'staff', 'clinical_practice_assistant', 'provider_plus']);

class ClinicalEligibilityService {
  /**
   * Ensure agency has a clinical organization attached (notes/billing features are clinical-org only).
   */
  static async assertAgencyHasClinicalOrg(agencyId) {
    const has = await OrganizationAffiliation.agencyHasClinicalOrg(agencyId);
    if (has) return true;

    try {
      const [rows] = await pool.execute(`SELECT feature_flags FROM agencies WHERE id = ? LIMIT 1`, [agencyId]);
      if (getMedicalBillingFlags(parseFeatureFlags(rows?.[0]?.feature_flags)).medicalBillingEnabled) {
        return true;
      }
    } catch {
      // fall through
    }

    const err = new Error('Clinical notes and billing are only available for agencies with a clinical organization attached');
    err.status = 403;
    throw err;
  }
  static isBackoffice(role) {
    return BACKOFFICE_ROLES.has(String(role || '').toLowerCase());
  }

  static async ensureAgencyAccess({ reqUser, agencyId }) {
    if (!reqUser?.id) {
      const err = new Error('Unauthenticated');
      err.status = 401;
      throw err;
    }
    if (String(reqUser.role || '').toLowerCase() === 'super_admin') return true;
    const agencies = await User.getAgencies(reqUser.id);
    const hasAccess = (agencies || []).some((a) => Number(a.id) === Number(agencyId));
    if (!hasAccess) {
      const err = new Error('Access denied');
      err.status = 403;
      throw err;
    }
    return true;
  }

  static async assertBookedClinicalSession({ agencyId, clientId, officeEventId }) {
    const client = await Client.findById(clientId);
    if (!client || Number(client.agency_id) !== Number(agencyId)) {
      const err = new Error('Client not found for agency');
      err.status = 404;
      throw err;
    }
    if (String(client.client_type || '').toLowerCase() !== 'clinical') {
      const err = new Error('Clinical data plane only supports clinical client type');
      err.status = 409;
      throw err;
    }

    const event = await OfficeEvent.findById(officeEventId);
    if (!event) {
      const err = new Error('Office event not found');
      err.status = 404;
      throw err;
    }
    if (String(event.status || '').toUpperCase() !== 'BOOKED') {
      const err = new Error('Clinical artifacts require a booked session');
      err.status = 409;
      throw err;
    }

    return { client, event };
  }

  static async assertSessionNoteEligible(session) {
    if (!session) {
      const err = new Error('Clinical session not found');
      err.status = 404;
      throw err;
    }
    const client = await Client.findById(session.client_id);
    if (!client) {
      const err = new Error('Client not found for agency');
      err.status = 404;
      throw err;
    }
    if (Number(client.agency_id) !== Number(session.agency_id)) {
      const pool = (await import('../config/database.js')).default;
      const [rows] = await pool.execute(
        `SELECT 1 AS ok
         FROM client_agency_assignments
         WHERE client_id = ? AND agency_id = ? AND is_active = TRUE
         LIMIT 1`,
        [session.client_id, session.agency_id]
      );
      if (!rows?.[0]) {
        const err = new Error('Client not found for agency');
        err.status = 404;
        throw err;
      }
    }
    if (String(client.client_type || '').toLowerCase() !== 'clinical') {
      const err = new Error('Clinical data plane only supports clinical client type');
      err.status = 409;
      throw err;
    }
    if (Number(session.billing_encounter_id || 0) > 0) {
      return { client, event: null, billingBacked: true };
    }
    if (!session.office_event_id) {
      let meta = session.metadata_json;
      if (typeof meta === 'string') {
        try { meta = JSON.parse(meta); } catch { meta = null; }
      }
      const noteOnly = !!(
        meta?.missingCalendarAttachment
        || meta?.noteOnlyFingerprint
        || meta?.source === 'note_aid_note_only'
        || meta?.source === 'billing_import_note_only'
      );
      if (noteOnly) {
        return { client, event: null, noteOnly: true };
      }
      const err = new Error('Clinical session is not linked to a calendar appointment or billing encounter');
      err.status = 409;
      throw err;
    }
    return this.assertBookedClinicalSession({
      agencyId: session.agency_id,
      clientId: session.client_id,
      officeEventId: session.office_event_id
    });
  }
}

export default ClinicalEligibilityService;

