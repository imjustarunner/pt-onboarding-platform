import pool from '../config/database.js';
import { deriveCredentialTier, eligibleServiceCodesForTier } from '../utils/clinicalServiceCodeEligibility.js';

const FALLBACK_APPOINTMENT_TYPES = [
  { code: 'SESSION', label: 'Session', colorToken: 'session', sortOrder: 10 },
  { code: 'SUPERVISION', label: 'Supervision', colorToken: 'supervision', sortOrder: 20 },
  { code: 'ASSESSMENT', label: 'Assessment/Evaluation', colorToken: 'assessment', sortOrder: 30 },
  { code: 'AVAILABLE_SLOT', label: 'Available Slot', colorToken: 'available', sortOrder: 40 },
  { code: 'SCHEDULE_BLOCK', label: 'Schedule Block', colorToken: 'block', sortOrder: 50 },
  { code: 'MEETING', label: 'Meeting', colorToken: 'meeting', sortOrder: 60 },
  { code: 'EVENT', label: 'Event', colorToken: 'event', sortOrder: 70 },
  { code: 'INDIRECT_SERVICES', label: 'Indirect Services', colorToken: 'indirect', sortOrder: 80 }
];

const FALLBACK_APPOINTMENT_SUBTYPES = [
  { code: 'AVAILABLE_INTAKE', appointmentTypeCode: 'AVAILABLE_SLOT', label: 'Available Intake', sortOrder: 10 },
  { code: 'AVAILABLE_SESSION', appointmentTypeCode: 'AVAILABLE_SLOT', label: 'Available Session', sortOrder: 20 },
  { code: 'PERSONAL', appointmentTypeCode: 'EVENT', label: 'Personal', sortOrder: 10 },
  { code: 'SCHEDULE_HOLD', appointmentTypeCode: 'EVENT', label: 'Schedule Hold', sortOrder: 20 },
  { code: 'GROUP_THERAPY', appointmentTypeCode: 'SESSION', label: 'Group Therapy', sortOrder: 30 },
  { code: 'TELEHEALTH', appointmentTypeCode: 'SESSION', label: 'Telehealth', sortOrder: 40 }
];

const FALLBACK_SERVICE_CODES = [
  { code: 'H0032', label: 'Mental health service plan development', isBillable: true, defaultNoteType: 'PROGRESS_NOTE' },
  { code: 'H2014', label: 'Skills training and development', isBillable: true, defaultNoteType: 'PROGRESS_NOTE' },
  { code: 'H2022', label: 'Community psychiatric supportive treatment', isBillable: true, defaultNoteType: 'PROGRESS_NOTE' },
  { code: 'ADMIN', label: 'Administrative/Non-billable', isBillable: false, defaultNoteType: 'ADMIN_NOTE' }
];

const DIRECT_SERVICE_APPOINTMENT_TYPES = new Set(['SESSION', 'ASSESSMENT']);

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase() || null;
}

function normalizeModality(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return ['IN_PERSON', 'TELEHEALTH'].includes(normalized) ? normalized : null;
}

async function listActiveAppointmentTypes() {
  try {
    const [rows] = await pool.execute(
      `SELECT code, label, color_token, sort_order
       FROM appointment_types
       WHERE is_active = TRUE
       ORDER BY sort_order ASC, code ASC`
    );
    return (rows || []).map((r) => ({
      code: String(r.code || '').toUpperCase(),
      label: String(r.label || '').trim(),
      colorToken: String(r.color_token || '').trim() || 'default',
      sortOrder: Number(r.sort_order || 0)
    }));
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') return FALLBACK_APPOINTMENT_TYPES;
    throw e;
  }
}

async function listActiveAppointmentSubtypes() {
  try {
    const [rows] = await pool.execute(
      `SELECT code, appointment_type_code, label, sort_order
       FROM appointment_subtypes
       WHERE is_active = TRUE
       ORDER BY appointment_type_code ASC, sort_order ASC, code ASC`
    );
    return (rows || []).map((r) => ({
      code: String(r.code || '').toUpperCase(),
      appointmentTypeCode: String(r.appointment_type_code || '').toUpperCase(),
      label: String(r.label || '').trim(),
      sortOrder: Number(r.sort_order || 0)
    }));
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') return FALLBACK_APPOINTMENT_SUBTYPES;
    throw e;
  }
}

async function listActiveServiceCodes() {
  try {
    const [rows] = await pool.execute(
      `SELECT code, label, is_billable, default_note_type
       FROM scheduling_service_codes
       WHERE is_active = TRUE
       ORDER BY code ASC`
    );
    return (rows || []).map((r) => ({
      code: String(r.code || '').toUpperCase(),
      label: String(r.label || '').trim() || String(r.code || '').toUpperCase(),
      isBillable: Boolean(r.is_billable),
      defaultNoteType: String(r.default_note_type || '').trim() || null
    }));
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') return FALLBACK_SERVICE_CODES;
    throw e;
  }
}

async function listEligibleServiceCodesForTier(credentialTier) {
  const tier = String(credentialTier || '').trim().toLowerCase();
  if (!tier) return [];

  try {
    const [rows] = await pool.execute(
      `SELECT s.code, s.label, s.is_billable, s.default_note_type
       FROM credential_service_code_eligibility e
       JOIN scheduling_service_codes s ON s.code = e.service_code
       WHERE e.credential_tier = ?
         AND e.allowed = TRUE
         AND s.is_active = TRUE
       ORDER BY s.code ASC`,
      [tier]
    );
    return (rows || []).map((r) => ({
      code: String(r.code || '').toUpperCase(),
      label: String(r.label || '').trim() || String(r.code || '').toUpperCase(),
      isBillable: Boolean(r.is_billable),
      defaultNoteType: String(r.default_note_type || '').trim() || null
    }));
  } catch (e) {
    if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
  }

  const fallbackCodes = eligibleServiceCodesForTier(tier);
  if (fallbackCodes === null) return await listActiveServiceCodes();
  const active = await listActiveServiceCodes();
  const allowed = new Set((fallbackCodes || []).map((c) => String(c || '').trim().toUpperCase()));
  return active.filter((s) => allowed.has(s.code));
}

export async function getSchedulingBookingMetadata({ userRole, providerCredentialText }) {
  const [appointmentTypes, appointmentSubtypes, allServiceCodes] = await Promise.all([
    listActiveAppointmentTypes(),
    listActiveAppointmentSubtypes(),
    listActiveServiceCodes()
  ]);
  const credentialTier = deriveCredentialTier({ userRole, providerCredentialText });
  const eligibleServiceCodes = await listEligibleServiceCodesForTier(credentialTier);

  return {
    credentialTier,
    appointmentTypes,
    appointmentSubtypes,
    allServiceCodes,
    eligibleServiceCodes
  };
}

export async function validateSchedulingSelection({
  userRole,
  providerCredentialText,
  appointmentTypeCode,
  appointmentSubtypeCode,
  serviceCode,
  modality
}) {
  const normalizedAppointmentTypeCode = normalizeCode(appointmentTypeCode);
  const normalizedAppointmentSubtypeCode = normalizeCode(appointmentSubtypeCode);
  const normalizedServiceCode = normalizeCode(serviceCode);
  const normalizedModality = normalizeModality(modality);

  const metadata = await getSchedulingBookingMetadata({ userRole, providerCredentialText });
  const typeCodes = new Set((metadata.appointmentTypes || []).map((t) => t.code));
  const subtypeRows = metadata.appointmentSubtypes || [];

  if (normalizedAppointmentTypeCode && !typeCodes.has(normalizedAppointmentTypeCode)) {
    const err = new Error(`Unsupported appointmentTypeCode: ${normalizedAppointmentTypeCode}`);
    err.status = 400;
    throw err;
  }

  if (normalizedAppointmentSubtypeCode) {
    const subtype = subtypeRows.find((s) => s.code === normalizedAppointmentSubtypeCode);
    if (!subtype) {
      const err = new Error(`Unsupported appointmentSubtypeCode: ${normalizedAppointmentSubtypeCode}`);
      err.status = 400;
      throw err;
    }
    if (normalizedAppointmentTypeCode && subtype.appointmentTypeCode !== normalizedAppointmentTypeCode) {
      const err = new Error('appointmentSubtypeCode does not belong to appointmentTypeCode');
      err.status = 400;
      throw err;
    }
  }

  if (normalizedAppointmentTypeCode && DIRECT_SERVICE_APPOINTMENT_TYPES.has(normalizedAppointmentTypeCode) && !normalizedServiceCode) {
    const err = new Error('serviceCode is required for direct-service appointment types');
    err.status = 400;
    throw err;
  }

  if (normalizedServiceCode) {
    const allowedSet = new Set((metadata.eligibleServiceCodes || []).map((c) => c.code));
    if (!allowedSet.has(normalizedServiceCode)) {
      const err = new Error(`You are not permitted to book service code ${normalizedServiceCode}`);
      err.status = 403;
      err.code = 'SERVICE_CODE_NOT_ALLOWED';
      throw err;
    }
  }

  return {
    appointmentTypeCode: normalizedAppointmentTypeCode,
    appointmentSubtypeCode: normalizedAppointmentSubtypeCode,
    serviceCode: normalizedServiceCode,
    modality: normalizedModality,
    credentialTier: metadata.credentialTier
  };
}
