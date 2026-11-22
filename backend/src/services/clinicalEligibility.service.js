import {readProviderServices} from './providerServiceOfferings.service.js';
import {requireTestingEligibility} from './testingEligibility.service.js';
import User from '../models/User.model.js';
import { assertClinicalWorkActive } from './clinicalWorkArchiveRead.service.js';
import { hasVerifiedBillingScope } from '../utils/verifiedBillingScope.js';
import { readClientServiceContext } from './clientServiceContext.service.js';
import { appointmentServiceKind } from '../utils/guardianCancellationScope.js';
import Appointment from '../models/Appointment.model.js';
import Client from '../models/Client.model.js';
import OfficeEvent from '../models/OfficeEvent.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import pool from '../config/database.js';
import { getMedicalBillingFlags, parseFeatureFlags } from './medicalBillingFlags.service.js';

const BACKOFFICE_ROLES = new Set(['admin', 'super_admin', 'support', 'staff', 'clinical_practice_assistant', 'provider_plus']);

/** Client types that may hold clinical notes / sessions / medical record. School staff never see these via role gates. */
const CLINICAL_CHART_CLIENT_TYPES = new Set(['clinical', 'school']);

function isClinicalChartClientType(clientType) {
  return CLINICAL_CHART_CLIENT_TYPES.has(String(clientType || '').toLowerCase());
}

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

  static async ensureAgencyAccess({ reqUser, agencyId, requireClinicalService = false }) {
    if (!reqUser?.id) {
      const err = new Error('Unauthenticated');
      err.status = 401;
      throw err;
    }
    // Billing-only delegates enter here only after a financial route guard verified this exact agency.
    if (hasVerifiedBillingScope(reqUser, agencyId)) return true;
    if (String(reqUser.role || '').toLowerCase() === 'super_admin') return true;
    const agencies = await User.getAgencies(reqUser.id);
    const hasAccess = (agencies || []).some((a) => Number(a.id) === Number(agencyId));
    if (!hasAccess) {
      const err = new Error('Access denied');
      err.status = 403;
      throw err;
    }
    // A mixed-service agency must not turn an explicitly tutoring-only provider
    // into a clinician. Agencies without a service catalog keep legacy access;
    // client assignment, credentials and signing prerequisites still apply.
    if (requireClinicalService && ['provider','provider_plus','intern','intern_plus','supervisor','facilitator'].includes(String(reqUser.role))) {
      const offered = await readProviderServices(reqUser.id, agencyId);
      const clinical = offered.services.find(service => service.serviceType === 'counseling');
      if (clinical && !clinical.offered) {
        throw Object.assign(new Error('Counseling service access is not assigned in this agency.'), {status:403});
      }
    }
    return true;
  }

  static async assertBookedClinicalSession({ agencyId, clientId, officeEventId }) {
    const client = await Client.findById(clientId);
    if (!client) throw Object.assign(new Error('Client not found for agency'), {status:404});

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

    const providerId = Number(event.booked_provider_id || event.assigned_provider_id) || null;
    const context = await readClientServiceContext({agencyId, clientId, providerId});
    if (!context.serviceKinds.includes('counseling')) {
      throw Object.assign(new Error('This client does not receive Clinical services with this provider in this agency.'), {status:409});
    }
    const appointment = await Appointment.findByOfficeEventId(officeEventId);
    if (appointment) {
      if (Number(appointment.agencyId) !== Number(agencyId) || appointmentServiceKind(appointment) !== 'counseling'
        || (providerId && appointment.providerUserId && Number(appointment.providerUserId) !== providerId)
        || (!appointment.businessType && (!isClinicalChartClientType(client.client_type) || context.serviceKinds.includes('tutoring')))) {
        throw Object.assign(new Error('Choose a clinical appointment in the selected agency.'), {status:409});
      }
      const participants = await Appointment.listParticipants(appointment.id);
      const linkedClient = participants.length ? participants.some(row => Number(row.clientId) === Number(clientId)) : Number(event.client_id) === Number(clientId);
      if (!linkedClient) {
        throw Object.assign(new Error('This client is not on the selected appointment.'), {status:409});
      }
    } else if (Number(client.agency_id) !== Number(agencyId) || !isClinicalChartClientType(client.client_type)
      || context.serviceKinds.includes('tutoring') || (event.client_id && Number(event.client_id) !== Number(clientId))) {
      throw Object.assign(new Error('Choose a linked clinical appointment for this client and agency.'), {status:409});
    }
    return { client, event };
  }

  static async assertSessionNoteEligible(session) {
    if (!session) {
      const err = new Error('Clinical session not found');
      err.status = 404;
      throw err;
    }
    await assertClinicalWorkActive({ clinical_session_id: session.id, office_event_id: session.office_event_id, appointment_id: session.appointment_id });
    await requireTestingEligibility({agencyId:Number(session.agency_id),userId:Number(session.provider_user_id),serviceCodes:[session.service_code],clientId:Number(session.client_id),serviceDate:session.scheduled_start_at||session.date_of_service});
    const client = await Client.findById(session.client_id);
    if (!client) {
      const err = new Error('Client not found for agency');
      err.status = 404;
      throw err;
    }
    if (Number(client.agency_id) !== Number(session.agency_id)) {
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
    if (!isClinicalChartClientType(client.client_type) || Number(client.agency_id) !== Number(session.agency_id)) {
      const [[enrollment]] = await pool.execute(
        `SELECT id FROM client_service_enrollments WHERE client_id=? AND agency_id=?
           AND service_kind='counseling' AND provider_user_id=? LIMIT 1`,
        [session.client_id, session.agency_id, session.provider_user_id]
      );
      if (!enrollment) throw Object.assign(new Error('No clinical assignment matches this session.'), {status:409});
    }
    if (Number(session.billing_encounter_id || 0) > 0) {
      return { client, event: null, billingBacked: true };
    }
    if (session.appointment_id) {
      const appointment = await Appointment.findById(session.appointment_id);
      const participants = appointment ? await Appointment.listParticipants(appointment.id) : [];
      if (!appointment || Number(appointment.agencyId) !== Number(session.agency_id)
        || appointmentServiceKind(appointment) !== 'counseling'
        || !participants.some((p) => Number(p.clientId) === Number(session.client_id))) {
        throw Object.assign(new Error('Session is not linked to this client appointment'), { status: 409 });
      }
      return { client, event: null, appointment };
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
    const event = await OfficeEvent.findById(session.office_event_id);
    if (!event || (event.client_id && Number(event.client_id) !== Number(session.client_id))) {
      throw Object.assign(new Error('Office event no longer matches this clinical session'), { status: 409 });
    }
    return { client, event };

  }
}

export default ClinicalEligibilityService;

