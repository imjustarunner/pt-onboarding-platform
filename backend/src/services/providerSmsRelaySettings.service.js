import pool from '../config/database.js';
import User from '../models/User.model.js';
import UserPreferences from '../models/UserPreferences.model.js';
import UserCallSettings from '../models/UserCallSettings.model.js';
import PhoneNumber from '../models/PhoneNumber.model.js';
import PhoneNumberAssignment from '../models/PhoneNumberAssignment.model.js';
import { sharedCareNumberId } from './sharedCareNumber.service.js';
import { resolveClientCaregivers } from './communicationRouting.service.js';
import { isCommunicationStaffActive } from '../utils/communicationReceptionPolicy.js';
import { normalizeSmsPhone } from '../utils/smsThreadIdentity.js';
import { getSmsSender, recordSmsPermission } from './smsCompliance.service.js';

export const RELAY_DISCLOSURE_VERSION = 'provider-phone-relay-2026-11-02';
export const RELAY_DISCLOSURE = 'I agree to receive forwarded client or guardian text messages on this personal phone and to reply through the app number. Each reply must start with the family code shown. Message frequency varies; message and data rates may apply. STOP stops texts across this messaging account. Sensitive information is best shared through the portal. I am responsible for protecting access to this phone.';
const on = value => value === true || value === 1;
const fail = (message, status = 403) => Object.assign(new Error(message), { status });
export async function activeAgencyUser(userId, agencyId) {
  const [rows] = await pool.execute(`SELECT u.* FROM users u JOIN user_agencies ua ON ua.user_id=u.id
    WHERE u.id=? AND ua.agency_id=? AND ua.is_active=TRUE LIMIT 1`, [userId, agencyId]);
  return isCommunicationStaffActive(rows[0]) ? rows[0] : null;
}
export async function hasRelayNumberAccess(userId, agencyId, numberId) {
  const number = await PhoneNumber.findById(numberId);
  if (!number || Number(number.agency_id) !== Number(agencyId) || !on(number.is_active)
    || number.status !== 'active' || number.number_purpose !== 'clinical_care') return false;
  if (Number(await sharedCareNumberId(agencyId)) === Number(numberId)) return true;
  const eligible = await PhoneNumberAssignment.listEligibleUserIdsForNumber(numberId);
  return eligible.map(Number).includes(Number(userId));
}
export async function relayEnrollmentReady(enrollment, clientId = null) {
  if (!on(enrollment.enabled)) return false;
  const user = await activeAgencyUser(enrollment.provider_user_id, enrollment.agency_id);
  if (!user || normalizeSmsPhone(user.personal_phone) !== enrollment.phone) return false;
  const prefs = await UserPreferences.findByUserId(user.id);
  if (!on(prefs?.sms_enabled) || !on(prefs?.sms_forwarding_enabled)) return false;
  let categories = prefs.notification_categories || {};
  if (typeof categories === 'string') { try { categories = JSON.parse(categories); } catch { return false; } }
  if ([false, 0, 'false'].includes(categories[`staff_communications_${enrollment.agency_id}`]?.accessRequests?.inAppTexting)) return false;
  const calls = await UserCallSettings.getByUserId(user.id);
  if ([false, 0].includes(calls?.sms_inbound_enabled) || [false, 0].includes(calls?.sms_outbound_enabled)) return false;
  if (!await hasRelayNumberAccess(user.id, enrollment.agency_id, enrollment.number_id)) return false;
  if (clientId) {
    const caregivers = await resolveClientCaregivers(clientId, enrollment.agency_id);
    if (!caregivers.caregiverIds.map(Number).includes(Number(user.id))) return false;
  }
  return true;
}
export async function assertRelaySettingsActor(actor, userId, agencyId) {
  if (!Number.isSafeInteger(userId) || userId < 1 || !Number.isSafeInteger(agencyId) || agencyId < 1) throw fail('User and agency are required', 400);
  const target = await activeAgencyUser(userId, agencyId);
  if (!target || ['client','guardian','school_staff'].includes(target.role)) throw fail('An active care-team account is required');
  if (Number(actor.id) !== userId && !['super_admin','admin'].includes(actor.role)) throw fail('Administrator access is required');
  if (actor.role !== 'super_admin' && !await activeAgencyUser(actor.id, agencyId)) throw fail('Agency access is required');
  return target;
}
export async function readRelaySettings(userId, agencyId) {
  const [enrollments] = await pool.execute('SELECT id, number_id, phone, enabled, consent_at FROM provider_sms_relay_enrollments WHERE agency_id=? AND provider_user_id=? ORDER BY id DESC', [agencyId,userId]);
  const user = await User.findById(userId);
  const prefs = await UserPreferences.findByUserId(userId);
  const numbers = await PhoneNumber.listByAgency(agencyId, { includeInactive: false });
  const available = [];
  for (const number of numbers) {
    if (!await hasRelayNumberAccess(userId, agencyId, number.id)) continue;
    const sender = await getSmsSender(number.phone_number);
    if (sender.registration?.provider === 'notifyre') available.push({ id:number.id, phone:number.phone_number });
  }
  return { enrollments, personalPhone:user.personal_phone || '', textsEnabled:on(prefs?.sms_enabled),
    forwardingEnabled:on(prefs?.sms_forwarding_enabled), numbers:available,
    disclosure:RELAY_DISCLOSURE, disclosureVersion:RELAY_DISCLOSURE_VERSION };
}
export async function saveRelaySettings({ actor, userId, agencyId, enabled, phone, numberId, consent }) {
  await assertRelaySettingsActor(actor,userId,agencyId);
  if (enabled !== true) {
    await pool.execute('UPDATE provider_sms_relay_enrollments SET enabled=FALSE WHERE agency_id=? AND provider_user_id=?', [agencyId,userId]);
    return readRelaySettings(userId,agencyId);
  }
  const normalized = normalizeSmsPhone(phone);
  if (!normalized || consent !== true) throw fail('The phone owner must agree to the forwarding disclosure',400);
  if (!await hasRelayNumberAccess(userId,agencyId,numberId)) throw fail('Choose an active care number assigned to this provider');
  const number = await PhoneNumber.findById(numberId);
  const sender = await getSmsSender(number.phone_number);
  if (sender.registration?.provider !== 'notifyre') throw fail('This forwarding setup requires a registered Notifyre care number',409);
  const [users] = await pool.execute('SELECT id, phone_number, personal_phone, work_phone FROM users WHERE id<>? AND is_active=TRUE', [userId]);
  if (users.some(user => [user.phone_number,user.personal_phone,user.work_phone].some(p => normalizeSmsPhone(p) === normalized))) throw fail('That phone is already associated with another active account',409);
  const source = Number(actor.id) === userId ? 'provider_self_consent' : 'admin_recorded_verbal_consent';
  // Reserve the unique phone first; a racing request cannot steal its ownership.
  await pool.execute(`INSERT INTO provider_sms_relay_enrollments
    (agency_id,provider_user_id,number_id,phone,enabled,consent_actor_id,consent_at,consent_source,disclosure_version)
    VALUES (?,?,?,?,FALSE,?,UTC_TIMESTAMP(6),?,?) ON DUPLICATE KEY UPDATE id=id`,
    [agencyId,userId,numberId,normalized,actor.id,source,RELAY_DISCLOSURE_VERSION]);
  const [owners] = await pool.execute('SELECT provider_user_id, agency_id FROM provider_sms_relay_enrollments WHERE number_id=? AND phone=?', [numberId,normalized]);
  if (owners.length !== 1 || Number(owners[0].provider_user_id) !== userId || Number(owners[0].agency_id) !== agencyId)
    throw fail('That phone is reserved for another provider on this number',409);
  // A partial setup must never activate forwarding. Other tenants are independent.
  await pool.execute('UPDATE provider_sms_relay_enrollments SET enabled=FALSE WHERE agency_id=? AND provider_user_id=?', [agencyId,userId]);
  await recordSmsPermission({scope:sender.scope,phone:normalized,purpose:'care',status:'opted_in',
    evidence:{source,actorUserId:actor.id,providerUserId:userId,agencyId,numberId,
      disclosureVersion:RELAY_DISCLOSURE_VERSION,disclosure:RELAY_DISCLOSURE}});
  await User.update(userId,{personalPhone:normalized});
  await UserPreferences.update(userId,{sms_enabled:true,sms_forwarding_enabled:true});
  await pool.execute(`UPDATE provider_sms_relay_enrollments SET enabled=TRUE,consent_actor_id=?,
    consent_at=UTC_TIMESTAMP(6),consent_source=?,disclosure_version=?
    WHERE agency_id=? AND provider_user_id=? AND number_id=? AND phone=?`,
    [actor.id,source,RELAY_DISCLOSURE_VERSION,agencyId,userId,numberId,normalized]);
  return readRelaySettings(userId,agencyId);
}
