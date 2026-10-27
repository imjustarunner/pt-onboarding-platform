const DAY = 86400000;
// Two follow-ups, at least two days apart, only while enrollment is outstanding.
export function guardianReminderDue({ schedule, invite, lastDelivery, now = new Date() }) {
  if (!schedule || schedule.state !== 'active' || Number(schedule.reminders_attempted) >= 2) return false;
  const expires=new Date(invite.expires_at).getTime(),due=new Date(schedule.next_due_at).getTime(),last=new Date(lastDelivery?.created_at).getTime();
  if (![expires,due,last,now.getTime()].every(Number.isFinite)) return false;
  if (invite.status !== 'pending' || expires <= now.getTime()) return false;
  if (String(schedule.recipient_email).toLowerCase() !== String(invite.invited_email).toLowerCase()) return false;
  if (!schedule.next_due_at || due > now.getTime()) return false;
  if (!['sent','delivered'].includes(lastDelivery?.delivery_status)) return false;
  return last + 2 * DAY <= now.getTime();
}

export function guardianReminderNextDate(firstSentAt, attempted, now = new Date()) {
  if (attempted >= 2) return null;
  return new Date(Math.max(new Date(firstSentAt).getTime() + 7 * DAY, now.getTime() + 2 * DAY));
}
