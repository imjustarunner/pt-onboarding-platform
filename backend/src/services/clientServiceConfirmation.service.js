import { isDateInCurrentSchoolYear } from '../utils/schoolYear.js';
import { markClientBeingSeen, clientHasWeekdayAssignment } from './clientLifecycleStatus.service.js';

export async function confirmChecklistServices({ client, firstServiceAt, actorUserId, now = new Date() }) {
  const date = String(firstServiceAt || '').slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  if (!date || date > today || !isDateInCurrentSchoolYear(date, now)) {
    return { confirmed: false, message: 'Checklist saved. Record a completed service date in the current school year to confirm Being Seen.' };
  }
  const blocked = ['waitlist', 'terminated', 'archived', 'not_returning', 'unable_to_reach', 'other_transfer', 'recommend_termination'];
  if (blocked.includes(client.client_status_key) || ['ARCHIVED', 'TERMINATED', 'ON_HOLD'].includes(client.status)) {
    return { confirmed: false, message: 'Checklist saved. Agency review is required before changing this client’s service status.' };
  }
  const result = await markClientBeingSeen({ clientId: client.id, actorUserId, serviceDate: date });
  if (result.skipped) return { ...result, confirmed: false, message: 'Checklist saved, but service status could not be confirmed. Contact the Schools team.' };
  const needsDayAssignment = !(await clientHasWeekdayAssignment(client.id));
  return { ...result, confirmed: true, needsDayAssignment,
    message: `Being Seen confirmed.${needsDayAssignment ? ' A school weekday still needs to be assigned.' : ''}` };
}
