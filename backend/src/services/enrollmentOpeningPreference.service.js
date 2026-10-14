import { hashHoldToken, holdError } from './publicProviderHold.service.js';

// Preferences are requests for staff review. Only a server-side hold proves that
// a time has been reserved; never accept a reservation status from the browser.
export async function resolveEnrollmentOpeningPreference(database, { agencyId, preference, holdToken, serviceType }) {
  if (!preference && !holdToken) return null;
  if (holdToken) {
    const [rows] = await database.execute(
      `SELECT provider_id, service_type, modality, frequency, time_zone,
              DATE_FORMAT(start_at, '%Y-%m-%dT%H:%i:%s.000Z') start_at,
              DATE_FORMAT(end_at, '%Y-%m-%dT%H:%i:%s.000Z') end_at
       FROM public_provider_slot_holds
       WHERE agency_id = ? AND token_hash = ? AND released_at IS NULL AND client_id IS NULL LIMIT 1`,
      [agencyId, hashHoldToken(holdToken)]);
    const row = rows[0];
    if (!row || (serviceType && row.service_type !== serviceType)) {
      throw holdError('This reserved time is no longer available for enrollment. Please choose again.');
    }
    return { providerId: Number(row.provider_id), serviceType: row.service_type, modality: row.modality,
      startAt: row.start_at, endAt: row.end_at, frequency: row.frequency, timeZone: row.time_zone,
      reserved: true, holdWasActiveAtSubmission: true, status: 'RESERVED_PENDING_CONFIRMATION' };
  }
  const providerId = Number(preference.providerId);
  const start = new Date(preference.startAt), end = new Date(preference.endAt);
  const modality = String(preference.modality || '').toUpperCase();
  const frequency = preference.frequency || 'WEEKLY';
  const timeZone = preference.timeZone || 'America/Denver';
  if (!Number.isSafeInteger(providerId) || providerId <= 0 ||
      !Number.isFinite(+start) || !Number.isFinite(+end) || +end <= +start || +end - +start > 86400000 ||
      !['VIRTUAL', 'IN_PERSON'].includes(modality) ||
      !['ONCE', 'WEEKLY', 'BIWEEKLY', 'EVERY_3_WEEKS', 'EVERY_4_WEEKS', 'MONTHLY', 'EITHER'].includes(frequency)) {
    throw holdError('Please select a valid preferred appointment time.', 400);
  }
  try { new Intl.DateTimeFormat('en-US', { timeZone }).format(start); }
  catch { throw holdError('Please select a valid appointment time zone.', 400); }
  const [providers] = await database.execute(
    `SELECT u.id FROM users u JOIN user_agencies ua ON ua.user_id = u.id
     WHERE u.id = ? AND ua.agency_id = ? AND COALESCE(ua.is_active,1)=1
       AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0 LIMIT 1`, [providerId, agencyId]);
  if (!providers.length) throw holdError('This provider is not available for this organization.', 400);
  return { providerId, serviceType, modality, startAt: start.toISOString(), endAt: end.toISOString(),
    frequency, timeZone, reserved: false, holdWasActiveAtSubmission: false,
    status: 'PREFERENCE_ONLY_REQUIRES_STAFF_CONFIRMATION' };
}

export function describeEnrollmentOpening(opening) {
  if (!opening) return null;
  const zone = opening.timeZone || 'America/Denver';
  const date = new Intl.DateTimeFormat('en-US', { weekday:'long', year:'numeric', month:'short', day:'numeric', hour:'numeric', minute:'2-digit', timeZone:zone }).format(new Date(opening.startAt));
  const end = new Intl.DateTimeFormat('en-US', { hour:'numeric', minute:'2-digit', timeZone:zone }).format(new Date(opening.endAt));
  const recurrence = { ONCE:'One time', WEEKLY:'Weekly', MONTHLY:'Monthly', EITHER:'Weekly / every 2 weeks', BIWEEKLY:'Every 2 weeks', EVERY_3_WEEKS:'Every 3 weeks', EVERY_4_WEEKS:'Every 4 weeks' }[opening.frequency] || 'Weekly';
  return `${date}–${end} (${zone}) · ${opening.modality === 'VIRTUAL' ? 'Virtual' : 'In person'} · ${recurrence} · ${opening.reserved ? 'Reserved pending staff confirmation' : 'Preference only — not reserved'}`;
}
