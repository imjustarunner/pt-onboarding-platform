import { requireProviderAvailabilityAccess } from '../services/providerAvailabilityAccess.service.js';
import crypto from 'crypto';
import pool from '../config/database.js';
import User from '../models/User.model.js';
import UserInfoValue from '../models/UserInfoValue.model.js';
import UserComplianceDocument from '../models/UserComplianceDocument.model.js';
import SupervisionSession from '../models/SupervisionSession.model.js';
import StorageService from '../services/storage.service.js';
import { saveProviderLicenseUpload } from '../services/licenseCredentialSync.service.js';
import { getRecipientByToken, getMyOpenRecipient } from '../services/providerUpdate.service.js';
import { setOfficeAssignmentBookingAvailability } from '../services/officeAssignmentBookingAvailability.service.js';
import { forfeitAssignment, downgradeStandingAssignment, rescheduleStandingAssignment } from './officeSlotActions.controller.js';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
export async function reviewRecipient(req) {
  const recipient = req.params.token ? await getRecipientByToken(req.params.token)
    : await getMyOpenRecipient(req.user.id, Number(req.body?.agencyId || req.query.agencyId));
  if (!recipient) throw fail('No open Provider Update was found.', 404);
  if (recipient.locked_at) throw fail('This update is locked.', 410);
  const agencies = await User.getAgencies(recipient.provider_user_id);
  if (!agencies.some(row => Number(row.id) === Number(recipient.agency_id))) throw fail('This provider no longer belongs to this agency.', 403);
  return recipient;
}
function requireSection(recipient, key) {
  const config = typeof recipient.section_config_json === 'string' ? JSON.parse(recipient.section_config_json) : recipient.section_config_json;
  if (config?.[key] === false) throw fail('This section is not enabled for this update.', 403);
}
export async function officeReviewAction(req, res, next) {
  try {
    const recipient = await reviewRecipient(req);
    requireSection(recipient, 'office_schedule');
    const id = Number(req.params.assignmentId);
    const [[assignment]] = await pool.execute('SELECT * FROM office_standing_assignments WHERE id = ? AND provider_id = ? AND is_active = TRUE', [id, recipient.provider_user_id]);
    if (!assignment || Number(assignment.booking_agency_id) !== Number(recipient.agency_id)) throw fail('This assignment is not part of your agency update.', 403);
    const action = req.params.action;
    if (action === 'availability') {
      await requireProviderAvailabilityAccess({ actor: { id: Number(recipient.provider_user_id), role: 'provider' }, agencyId: recipient.agency_id, providerId: recipient.provider_user_id });
      return res.json(await setOfficeAssignmentBookingAvailability({ assignmentId: id, providerId: recipient.provider_user_id, inPerson: req.body.inPerson, virtual: req.body.virtual }));
    }
    const handler = { forfeit: forfeitAssignment, unbook: downgradeStandingAssignment, move: rescheduleStandingAssignment }[action];
    if (!handler) throw fail('Unknown office review action.');
    // An emailed update link permits actions on this provider’s own assignments only.
    // It never inherits administrator approval privileges.
    req.user = req.params.token ? { id: Number(recipient.provider_user_id), role: 'provider', agencyId: recipient.agency_id } : req.user;
    req.params = { officeId: String(assignment.office_location_id), assignmentId: String(id) };
    req.body = { ...req.body, agencyId: recipient.agency_id, ...(action === 'unbook' ? { to: 'assigned' } : {}), ...(action === 'move' ? { blockHours: 1, sourceStartHour: Number(assignment.hour) } : {}) };
    return handler(req, res, next);
  } catch (error) { next(error); }
}
export async function reviewContext(req, res, next) {
  try {
    const recipient = await reviewRecipient(req);
    const [fields] = await pool.execute(`SELECT d.field_key, v.value FROM user_info_values v JOIN user_info_field_definitions d ON d.id = v.field_definition_id
      WHERE v.user_id = ? AND d.field_key IN ('provider_credential_license_type_number','provider_credential_license_issued_date','provider_credential_license_expiration_date','license_upload')`, [recipient.provider_user_id]);
    const values = Object.fromEntries(fields.map(row => [row.field_key, row.value]));
    const supervisors = await User.getSupervisors(recipient.provider_user_id, recipient.agency_id);
    const supervision = supervisors.length ? await SupervisionSession.getHoursSummaryForSupervisee(recipient.agency_id, recipient.provider_user_id) : null;
    res.json({ license: { number: values.provider_credential_license_type_number || '', issued: values.provider_credential_license_issued_date || '', expires: values.provider_credential_license_expiration_date || '', hasUpload: !!values.license_upload }, supervision, supervised: !!supervisors.length });
  } catch (error) { next(error); }
}
export async function uploadReviewDocument(req, res, next) {
  try {
    const recipient = await reviewRecipient(req);
    const kind = req.params.kind;
    if (!['license', 'supervision'].includes(kind)) throw fail('Unknown document type.');
    requireSection(recipient, kind === 'license' ? 'license' : 'supervision_hours');
    if (!req.file?.buffer) throw fail('Choose a PDF or image.');
    let document;
    if (kind === 'license') {
      document = await saveProviderLicenseUpload({ userId: recipient.provider_user_id, agencyId: recipient.agency_id, file: req.file,
        expirationDate: req.body.expirationDate || null, createdByUserId: recipient.provider_user_id, notes: 'Uploaded through Provider Update' });
    } else {
      const suffix = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' }[req.file.mimetype] || 'bin';
      const saved = await StorageService.saveComplianceDocument(req.file.buffer, `supervision-${crypto.randomUUID()}.${suffix}`, req.file.mimetype);
      document = await UserComplianceDocument.create({ userId: recipient.provider_user_id, agencyId: recipient.agency_id,
        documentType: 'supervision_hours', filePath: saved.relativePath, notes: 'Supporting evidence for Provider Update hours review', createdByUserId: recipient.provider_user_id });
    }
    res.status(201).json({ ok: true, documentId: document.id });
  } catch (error) { next(error); }
}

export async function persistReviewSection(recipient, key, data, completed) {
  requireSection(recipient, key);
  if (!completed) return;
  if (key === 'supervision_hours') {
    const supervisors = await User.getSupervisors(recipient.provider_user_id, recipient.agency_id);
    if (!supervisors.length) return;
    if (!['confirmed', 'correction_requested'].includes(data?.decision)) throw fail('Confirm your supervision hours or request a correction.');
    if (data.decision === 'correction_requested' && (!String(data.reason || '').trim() || !Number.isFinite(Number(data.requestedHours)) || Number(data.requestedHours) < 0)) throw fail('Enter the requested hours and a reason for the correction.');
    // Store the attested ledger value, never overwrite the ledger from a self-report.
    data.recordedHours = (await SupervisionSession.getHoursSummaryForSupervisee(recipient.agency_id, recipient.provider_user_id)).totalHours;
    if (data.documentId) {
      const doc = await UserComplianceDocument.findById(Number(data.documentId));
      if (!doc || Number(doc.user_id) !== Number(recipient.provider_user_id) || Number(doc.agency_id) !== Number(recipient.agency_id) || doc.document_type !== 'supervision_hours') throw fail('Choose your own supervision evidence document.');
    }
  }
  if (key === 'license') {
    const license = data?.license;
    if (!license || !String(license.number || '').trim()) throw fail('Enter the license type and number.');
    for (const date of [license.issued, license.expires]) if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date)) throw fail('Enter valid license dates.');
    if (license.issued && license.expires && license.issued > license.expires) throw fail('The issue date must precede the expiration date.');
    const values = { provider_credential_license_type_number: license.number, provider_credential_license_issued_date: license.issued, provider_credential_license_expiration_date: license.expires };
    const resolved = [];
    for (const [key, value] of Object.entries(values)) {
      if (!value) continue;
      const [[field]] = await pool.execute('SELECT id FROM user_info_field_definitions WHERE field_key = ? AND (agency_id IS NULL OR agency_id = ?) ORDER BY (agency_id = ?) DESC, id DESC LIMIT 1', [key, recipient.agency_id, recipient.agency_id]);
      if (!field) throw fail('License fields are not configured for this agency. Contact an administrator.', 409);
      resolved.push([field.id, value]);
    }
    for (const [id, value] of resolved) await UserInfoValue.createOrUpdate(recipient.provider_user_id, id, value);
  }
}
