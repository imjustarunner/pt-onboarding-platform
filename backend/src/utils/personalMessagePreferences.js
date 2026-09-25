export const PERSONAL_MESSAGE_DEFAULTS = Object.freeze({
  personalEmailNotify: true,
  personalEmailDeliveryMode: 'notification',
  personalEmailDelayMode: 'business_day',
  personalEmailDelayHours: 24
});
const modes = { personalEmailDeliveryMode: ['notification', 'forward_one_to_one'], personalEmailDelayMode: ['business_day', 'immediate', 'hours'] };
export function personalMessagePreferences(row = {}) {
  return {
    personalEmailNotify: row.personal_email_notify == null ? true : [true, 1, '1'].includes(row.personal_email_notify),
    personalEmailDeliveryMode: row.personal_email_delivery_mode || 'notification',
    personalEmailDelayMode: row.personal_email_delay_mode || 'business_day',
    personalEmailDelayHours: Number(row.personal_email_delay_hours ?? row.digest_business_hours ?? row.digest_hours ?? 24)
  };
}
export function validatePersonalMessagePatch(patch) {
  const invalid = () => { throw Object.assign(new Error('Choose a valid personal-email delivery mode and a delay from 1 to 168 hours.'), { status: 400 }); };
  for (const [key, values] of Object.entries(modes)) if (patch[key] !== undefined && !values.includes(patch[key])) invalid();
  if (patch.personalEmailDelayHours !== undefined && (!Number.isInteger(patch.personalEmailDelayHours) || patch.personalEmailDelayHours < 1 || patch.personalEmailDelayHours > 168)) invalid();
  if (patch.personalEmailNotify !== undefined && typeof patch.personalEmailNotify !== 'boolean') invalid();
}
