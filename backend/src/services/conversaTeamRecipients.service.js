import pool from '../config/database.js';
import { isStaffCommunicationRole, staffCommunicationKey, phoneFingerprint } from '../utils/staffCommunicationChoices.js';
import { normalizeSmsPhone } from '../utils/smsThreadIdentity.js';
import { getSmsSender, prepareSmsDelivery } from './smsCompliance.service.js';

const json = value => { try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return null; } };
export function isActiveTeamMember(user) {
  return isStaffCommunicationRole(user.role)
    && (!user.agency_role || isStaffCommunicationRole(user.agency_role))
    && [true, 1, '1'].includes(user.is_active)
    && ![false, 0, '0'].includes(user.membership_active)
    && ![true, 1, '1'].includes(user.is_archived)
    && !user.terminated_at
    && ['ACTIVE', 'ACTIVE_EMPLOYEE'].includes(String(user.status || '').trim().toUpperCase());
}
export async function listActiveTeamMembers(agencyId, db = pool, userId = null) {
  const [rows] = await db.execute(`SELECT u.id, u.first_name, u.last_name, u.email, u.role,
    u.is_active, u.is_archived, u.status, u.terminated_at,
    u.phone_number, u.personal_phone, u.work_phone, ua.is_active AS membership_active, ua.agency_role,
    p.notification_categories
    FROM users u JOIN user_agencies ua ON ua.user_id = u.id
    LEFT JOIN user_preferences p ON p.user_id = u.id WHERE ua.agency_id = ? ${userId ? 'AND u.id = ?' : ''} ORDER BY u.first_name, u.last_name`, userId ? [agencyId, userId] : [agencyId]);
  return rows.filter(isActiveTeamMember);
}
export const teamMemberPhone = user => normalizeSmsPhone(user.personal_phone || user.work_phone || user.phone_number);

// This is a read-only preview of the same policy enforced again by the SMS transport.
export async function teamSmsEligibility(user, { agencyId, from, purpose = 'polling' }, dependencies = {}) {
  const prepare = dependencies.prepare || prepareSmsDelivery;
  const db = dependencies.db || pool;
  const senderLookup = dependencies.getSender || getSmsSender;
  const phone = teamMemberPhone(user);
  const blocked = (status, label) => ({ eligible: false, status, label });
  if (!phone) return blocked('no_phone', 'No mobile number');
  const preferences = json(user.notification_categories)?.[staffCommunicationKey(agencyId)];
  const choice = purpose === 'polling' ? 'polling' : 'notifications';
  if (preferences?.choices?.[choice] === false) return blocked('sms_opted_out', 'SMS opted out');
  if (preferences && preferences.phoneHash !== phoneFingerprint(phone)) return blocked('sms_consent_required', 'SMS consent needed for current number');
  if (!from) return blocked('sender_not_configured', 'SMS sender not configured');
  try {
    await prepare({ to: phone, from, body: 'Team communication eligibility check', purpose, agencyId });
    return { eligible: true, status: 'opted_in', label: purpose === 'polling' ? 'Polling SMS opted in' : 'Team SMS opted in' };
  } catch (error) {
    if (error.code === 'sms_consent_required') {
      const sender = await senderLookup(from);
      const [rows] = await db.execute("SELECT status FROM sms_recipient_permissions WHERE scope_key = ? AND phone = ? AND purpose = ? LIMIT 1", [sender.scope, phone, purpose]);
      if (rows[0]?.status === 'opted_out') return blocked('sms_opted_out', 'SMS opted out');
    }
    const labels = { sms_opted_out: 'SMS opted out', sms_staff_choice_off: 'SMS category not enabled', sms_consent_required: 'SMS consent needed', sms_consent_review_required: 'SMS enrollment review needed', sms_campaign_not_ready: 'SMS sender not ready', sms_campaign_purpose_mismatch: 'SMS sender not enabled for this purpose', sms_unknown_sender: 'SMS sender not configured' };
    if (!error.code?.startsWith('sms_')) throw error;
    return blocked(error.code, labels[error.code] || 'SMS unavailable');
  }
}
