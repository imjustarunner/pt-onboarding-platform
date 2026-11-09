import User from '../models/User.model.js';
import Notification from '../models/Notification.model.js';
import Dispatcher from './notificationDispatcher.service.js';
import Directory from './googleWorkspaceDirectory.service.js';
import pool from '../config/database.js';
import { loadNotificationPreferenceContext, resolveNotificationTypePreference } from './notificationPreferences.service.js';
import { messageReminderRecipient } from './messageReminderRecipient.service.js';
import { normalizedEmail, closureEmailOptions } from '../utils/schoolClosureDelivery.js';

export async function closurePreference(userId, agencyId) {
  const user = await User.findById(userId);
  if (!user) throw new Error('Staff account unavailable');
  const context = await loadNotificationPreferenceContext({ userId, agencyId, userRole: user.role, user });
  return { user, ...resolveNotificationTypePreference('school_closure_notice', context) };
}
export async function closureTeamMembers(agencyId, db = pool) {
  const members = await Directory.listGroupMembers('schools@itsco.health');
  const emails = new Set(members.filter(member => member.type === 'USER' && member.status === 'ACTIVE').map(member => normalizedEmail(member.email)));
  const [users] = await db.execute(`SELECT DISTINCT u.* FROM users u JOIN user_agencies ua ON ua.user_id=u.id
    WHERE ua.agency_id=? AND COALESCE(ua.is_active,1)=1 AND u.is_active=1 AND COALESCE(u.is_archived,0)=0
      AND COALESCE(u.is_assistant_account,0)=0 AND COALESCE(u.is_demo,0)=0 AND u.terminated_at IS NULL
      AND u.role IN ('admin','super_admin','support','staff','provider','provider_plus','intern','intern_plus','supervisor','clinical_practice_assistant','schedule_manager','facilitator','tutor')`, [agencyId]);
  return users.filter(user => [user.email, user.work_email, user.personal_email].some(address => emails.has(normalizedEmail(address))));
}
export const closureNotificationChannels = {
  create: input => Notification.create(input),
  push: notification => Dispatcher.dispatchPushForNotification(notification),
  sms: notification => Dispatcher.dispatchForNotification(notification)
};
export async function closureForwardRecipient(user, agencyId) {
  const allowed = await messageReminderRecipient(user, { agencyId });
  if (!allowed || normalizedEmail(allowed) !== normalizedEmail(user.personal_email)) throw new Error('Personal forwarding requires a verified non-SSO mailbox route');
  const members = await Directory.listGroupMembers(closureEmailOptions(user).work);
  if (members.some(member => normalizedEmail(member.email) === normalizedEmail(allowed) && member.status === 'ACTIVE' && member.delivery_settings === 'ALL_MAIL')) return null;
  return allowed;
}
