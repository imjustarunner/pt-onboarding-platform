import User from '../models/User.model.js';
import Client from '../models/Client.model.js';
import OfficeEvent from '../models/OfficeEvent.model.js';

const BACKOFFICE_ROLES = new Set(['admin', 'super_admin', 'support', 'staff', 'clinical_practice_assistant', 'provider_plus']);

class ClinicalEligibilityService {
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
}

export default ClinicalEligibilityService;

